"""Celery tasks for video and project analysis.

Calls analysis nodes directly in sequence rather than via LangGraph's
graph.invoke(), which in LangGraph 0.1.x runs every node inside a
ThreadPoolExecutor.  That thread-pool indirection can hang inside
Celery's solo pool (the executor thread blocks waiting for an HTTP
response while the main thread blocks waiting for the future, and
signal-based timeouts do not fire on non-main threads).

By invoking nodes sequentially on the Celery worker thread we get the
same pipeline semantics with reliable timeout / error handling.
"""

import json
import logging
import re
import time
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy.orm.attributes import flag_modified

from app.agents.nodes import (
    activate_node,
    chunk_node,
    cross_activate_node,
    cross_explain_node,
    cross_relate_node,
    explain_node,
    infer_node,
    relate_node,
)
from app.agents.states import ProjectAnalysisState, VideoAnalysisState
from app.models.database_models import Project, ProjectAnalysis, SpeakerLabel, Transcript, Video, VideoAnalysis
from app.services.byok_service import resolve_byok as _resolve_byok
from app.services.project_state_service import ProjectStateService
from app.tasks.base import DatabaseTask
from app.tasks.celery_app import celery_app
from app.utils.error_classification import (
    build_structured_error,
    is_retryable,
)

logger = logging.getLogger(__name__)

# Pattern matches common API key formats (OpenRouter sk-or-*, generic long tokens)
_API_KEY_PATTERN = re.compile(
    r"(sk-or-v1-[A-Za-z0-9]{4})[A-Za-z0-9]{20,}"  # OpenRouter keys
    r"|"
    r"(sk-[A-Za-z0-9]{4})[A-Za-z0-9]{20,}"  # OpenAI-style keys
    r"|"
    r"(Bearer\s+)[A-Za-z0-9_\-]{20,}"  # Bearer tokens in error messages
    r"|"
    r"([a-f0-9]{4})[a-f0-9]{28,}"  # AssemblyAI and other hex keys (32+ chars)
)

# Maximum number of retries per pipeline node before halting
_NODE_MAX_RETRIES = 2

# Delay (in seconds) between node retries
_NODE_RETRY_DELAY = 2.0


def _sanitize_error(message: str) -> str:
    """Strip potential API key material from error messages before storage."""
    return _API_KEY_PATTERN.sub(
        lambda m: (m.group(1) or m.group(2) or m.group(3) or m.group(4) or "") + "***REDACTED***",
        message,
    )


def _run_node_with_retry(step_name: str, node_fn, state: dict, max_retries: int = _NODE_MAX_RETRIES) -> dict:
    """Run a single pipeline node with per-node retry logic.

    Each node is retried up to ``max_retries`` times if the error is
    classified as retryable.  Non-retryable errors (e.g. validation)
    halt immediately.

    Args:
        step_name: Human-readable step name (e.g. "chunk").
        node_fn: The node callable.
        state: Current pipeline state dict.
        max_retries: Maximum number of retry attempts per node.

    Returns:
        Updated state dict from the node.
    """
    last_state = state
    for attempt in range(1 + max_retries):
        result_state = node_fn(last_state)
        if not result_state.get("error"):
            return result_state

        error_type = result_state.get("error_type", "unknown")
        retryable = is_retryable(error_type)

        if attempt < max_retries and retryable:
            delay = _NODE_RETRY_DELAY * (2 ** attempt)  # exponential backoff
            logger.warning(
                f"Node '{step_name}' failed (attempt {attempt + 1}/{1 + max_retries}, "
                f"error_type={error_type}). Retrying in {delay:.1f}s..."
            )
            time.sleep(delay)
            # Reset error in state before retry so node starts clean
            last_state = {**result_state, "error": None, "error_type": None}
        else:
            if not retryable:
                logger.error(
                    f"Node '{step_name}' failed with non-retryable error "
                    f"(error_type={error_type}): {result_state['error']}"
                )
            else:
                logger.error(
                    f"Node '{step_name}' failed after {attempt + 1} attempts: "
                    f"{result_state['error']}"
                )
            return result_state

    return last_state


def _update_step_progress(db, video_analysis_id, step_name: str, step_status_value: str) -> None:
    """Update step-level progress in the database (best-effort).

    Queries the VideoAnalysis fresh to avoid session conflicts with the
    main task.  Failures here are logged but never propagated.

    Args:
        db: SQLAlchemy session.
        video_analysis_id: Primary key of the VideoAnalysis row.
        step_name: Pipeline step name (e.g. "chunk", "infer").
        step_status_value: One of "pending", "processing", "completed", "error".
    """
    try:
        va = db.query(VideoAnalysis).filter(VideoAnalysis.id == video_analysis_id).first()
        if va is None:
            logger.warning(f"_update_step_progress: VideoAnalysis {video_analysis_id} not found")
            return

        va.current_step = step_name

        # Merge into existing step_status dict
        current = va.step_status if isinstance(va.step_status, dict) else {}
        current[step_name] = step_status_value
        va.step_status = current
        flag_modified(va, "step_status")

        # Set per-step completion timestamp
        if step_status_value == "completed":
            ts_column = f"{step_name}_completed_at"
            if hasattr(va, ts_column):
                setattr(va, ts_column, datetime.now(timezone.utc))

        db.commit()
    except Exception:
        logger.exception(f"_update_step_progress failed for step '{step_name}' ({step_status_value})")
        try:
            db.rollback()
        except Exception:
            pass


def _is_cancelled(db, video_analysis_id) -> bool:
    """Check if watchdog has already marked this analysis as error.

    Re-queries the VideoAnalysis with a fresh read to detect status
    changes committed by the watchdog in a separate session.
    Returns True if the analysis should stop.
    """
    try:
        db.expire_all()  # Clear ORM cache to force fresh DB read
        va = db.query(VideoAnalysis).filter(VideoAnalysis.id == video_analysis_id).first()
        if va is None:
            return True  # Record gone, treat as cancelled
        return va.status == "error"
    except Exception:
        logger.exception("_is_cancelled check failed, assuming not cancelled")
        return False


def _run_video_pipeline(state: VideoAnalysisState, db=None, video_analysis_id=None) -> VideoAnalysisState:
    """Run the 5-step video analysis pipeline synchronously.

    Each node is called in sequence with per-node retry logic.
    If any node sets ``state["error"]`` after retries are exhausted,
    the pipeline halts immediately.

    When *db* and *video_analysis_id* are provided, step-level progress
    is written to the database before and after each node.

    Returns the final state dict.
    """
    steps = [
        ("chunk", chunk_node),
        ("infer", infer_node),
        ("relate", relate_node),
        ("explain", explain_node),
        ("activate", activate_node),
    ]
    for step_name, node_fn in steps:
        # Check if watchdog has cancelled this analysis
        if db is not None and video_analysis_id is not None:
            if _is_cancelled(db, video_analysis_id):
                logger.warning(
                    f"Pipeline cancelled by watchdog at step '{step_name}' "
                    f"for video {state['video_id']}"
                )
                state["error"] = "Analysis cancelled by watchdog (timeout)"
                state["error_type"] = "timeout"
                break

        logger.info(f"Running pipeline step '{step_name}' for video {state['video_id']}")
        if db is not None and video_analysis_id is not None:
            _update_step_progress(db, video_analysis_id, step_name, "processing")
        state = _run_node_with_retry(step_name, node_fn, state)
        if state.get("error"):
            logger.error(f"Pipeline halting at '{step_name}': {state['error']}")
            if db is not None and video_analysis_id is not None:
                _update_step_progress(db, video_analysis_id, step_name, "error")
            break
        else:
            if db is not None and video_analysis_id is not None:
                _update_step_progress(db, video_analysis_id, step_name, "completed")
    return state


def _run_project_pipeline(state) -> dict:
    """Run the 3-step project analysis pipeline synchronously.

    Each node is called in sequence with per-node retry logic.
    ProjectAnalysis does not have per-step DB columns, so progress is
    logged only.
    """
    steps = [
        ("cross_relate", cross_relate_node),
        ("cross_explain", cross_explain_node),
        ("cross_activate", cross_activate_node),
    ]
    for step_name, node_fn in steps:
        logger.info(f"Running pipeline step '{step_name}' for project {state['project_id']}")
        state = _run_node_with_retry(step_name, node_fn, state)
        if state.get("error"):
            logger.error(f"Project pipeline halting at '{step_name}': {state['error']}")
            break
        else:
            logger.info(f"Project pipeline step '{step_name}' completed for project {state['project_id']}")
    return state


def _build_pipeline_error_json(failed_step: str, error_str: str, error_type: str | None = None) -> str:
    """Build a structured error JSON string from pipeline state info.

    Used when the pipeline halts due to a node error and we need to
    store structured error information in the DB.
    """
    etype = error_type or "unknown"
    return json.dumps({
        "step": failed_step,
        "error_type": etype,
        "retryable": is_retryable(etype),
        "message": f"Analysis failed at step '{failed_step}': {error_str}",
        "details": error_str,
    })


@celery_app.task(base=DatabaseTask, bind=True, name="analyze_video")
def analyze_video_task(self, video_id: str, user_id: str | None = None):
    """
    Analyze a video using the 5-step analysis pipeline.

    Steps:
    1. CHUNK - Break transcript into discrete pieces
    2. INFER - Interpret meaning from each chunk
    3. RELATE - Find patterns across inferences
    4. EXPLAIN - Generate insights from patterns
    5. ACTIVATE - Create design principles from insights

    Each node is retried up to 2 times within the pipeline before
    the task fails.  Error information is stored as structured JSON
    in video.error_message.

    Args:
        video_id: UUID of the video to analyze
        user_id: Optional user ID for BYOK key lookup

    Returns:
        Dictionary with analysis results

    Raises:
        Exception: If analysis fails
    """
    try:
        logger.info(f"Starting video analysis task for video {video_id}")

        # Get video and transcript from database
        video = self.db.query(Video).filter(Video.id == UUID(video_id)).first()
        if not video:
            raise Exception(f"Video {video_id} not found")

        # Fetch project description for research context
        project = self.db.query(Project).filter(Project.id == video.project_id).first()
        project_description = project.description if project else None

        transcript = self.db.query(Transcript).filter(Transcript.video_id == video.id).first()
        if not transcript or transcript.status != "completed":
            raise Exception(f"No completed transcript found for video {video_id}")

        # Get speaker labels
        speaker_labels = self.db.query(SpeakerLabel).filter(
            SpeakerLabel.transcript_id == transcript.id
        ).all()

        # Build speaker mapping with both names and roles
        speaker_mapping = {}
        speaker_roles = {}
        for label in speaker_labels:
            speaker_mapping[label.speaker_label] = label.assigned_name or label.speaker_label
            # Store role information (participant/interviewer)
            if label.role:
                speaker_roles[label.speaker_label] = label.role.lower()

        # Get or create video analysis record
        video_analysis = self.db.query(VideoAnalysis).filter(
            VideoAnalysis.video_id == video.id
        ).first()

        initial_step_status = {
            "chunk": "pending",
            "infer": "pending",
            "relate": "pending",
            "explain": "pending",
            "activate": "pending",
        }

        if not video_analysis:
            video_analysis = VideoAnalysis(
                video_id=video.id,
                status="processing",
                started_at=datetime.now(timezone.utc),
                current_step="chunk",
                step_status=initial_step_status,
            )
            self.db.add(video_analysis)
        else:
            video_analysis.status = "processing"
            video_analysis.started_at = datetime.now(timezone.utc)
            video_analysis.current_step = "chunk"
            video_analysis.step_status = initial_step_status
            flag_modified(video_analysis, "step_status")

        video.status = "analyzing"
        self.db.commit()

        # Resolve BYOK API key and preferred model for this user
        byok_api_key, byok_model = _resolve_byok(self.db, user_id)

        # Prepare initial state for the pipeline
        initial_state: VideoAnalysisState = {
            "video_id": video_id,
            "transcript": transcript.processed_transcript,
            "speaker_labels": speaker_mapping,
            "speaker_roles": speaker_roles,  # Add role information
            "project_description": project_description,
            "chunks": None,
            "inferences": None,
            "patterns": None,
            "insights": None,
            "design_principles": None,
            "api_key": byok_api_key,
            "model": byok_model,
            "current_step": "chunk",
            "error": None
        }

        logger.info(f"Running video analysis pipeline for video {video_id}")

        # Run the analysis pipeline directly (no LangGraph ThreadPoolExecutor)
        final_state = _run_video_pipeline(initial_state, db=self.db, video_analysis_id=video_analysis.id)

        # Check for errors - the pipeline halts on any node error after
        # retries are exhausted
        if final_state.get("error"):
            failed_step = final_state.get("current_step", "unknown")
            error_type = final_state.get("error_type", "unknown")
            structured_err = _build_pipeline_error_json(
                failed_step, final_state["error"], error_type
            )
            raise _PipelineError(
                f"Analysis failed at step '{failed_step}': {final_state['error']}",
                structured_json=structured_err,
            )

        # Final cancellation check before writing results
        self.db.expire_all()
        video_analysis = self.db.query(VideoAnalysis).filter(
            VideoAnalysis.id == video_analysis.id
        ).first()
        if video_analysis is None or video_analysis.status == "error":
            logger.warning(
                f"Watchdog cancelled analysis for video {video_id} "
                f"before results could be saved. Discarding results."
            )
            return {"video_id": video_id, "status": "cancelled_by_watchdog"}

        # Save results to database
        video_analysis.chunks = final_state.get("chunks")
        video_analysis.inferences = final_state.get("inferences")
        video_analysis.patterns = final_state.get("patterns")
        video_analysis.insights = final_state.get("insights")
        video_analysis.design_principles = final_state.get("design_principles")
        video_analysis.status = "completed"
        video_analysis.completed_at = datetime.now(timezone.utc)

        # Refresh video object to ensure it's attached to session
        self.db.refresh(video)
        video.status = "analyzed"

        # Explicitly flush and commit
        self.db.flush()
        self.db.commit()

        # Update project state - wrap in try/except to prevent it from failing the whole task
        try:
            ProjectStateService.update_project_state_for_completion(str(video.project_id), self.db)
        except Exception as project_state_error:
            logger.warning(f"Failed to update project state: {project_state_error}")

        # Refresh again to verify the commit
        self.db.refresh(video)
        logger.info(f"Video analysis completed for video {video_id}, status: {video.status}")

        return {
            "video_id": video_id,
            "analysis_id": str(video_analysis.id),
            "status": "completed",
            "chunks_count": len(final_state.get("chunks", [])),
            "inferences_count": len(final_state.get("inferences", [])),
            "patterns_count": len(final_state.get("patterns", [])),
            "insights_count": len(final_state.get("insights", [])),
            "principles_count": len(final_state.get("design_principles", []))
        }

    except Exception as e:
        # Use structured JSON if the exception carries it, otherwise build one
        if isinstance(e, _PipelineError) and e.structured_json:
            error_json = _sanitize_error(e.structured_json)
        else:
            safe_msg = _sanitize_error(str(e))
            error_json = json.dumps(build_structured_error(
                step="unknown",
                exc=e,
                message=safe_msg,
            ))

        logger.error(f"Video analysis failed for video {video_id}: {_sanitize_error(str(e))}")

        # Update status to error
        try:
            self.db.rollback()
            video = self.db.query(Video).filter(Video.id == UUID(video_id)).first()
            video_analysis = self.db.query(VideoAnalysis).filter(
                VideoAnalysis.video_id == UUID(video_id)
            ).first()

            if video:
                # Only update if watchdog hasn't already handled this
                if video.status not in ("error", "analyzed"):
                    video.status = "error"
                    video.error_message = error_json
                else:
                    logger.info(
                        f"Video {video_id} already in '{video.status}' state "
                        f"(likely set by watchdog), skipping error update"
                    )
            if video_analysis:
                if video_analysis.status != "error":
                    video_analysis.status = "error"
                    video_analysis.completed_at = datetime.now(timezone.utc)

            # Explicitly flush and commit
            self.db.flush()
            self.db.commit()
            logger.info(f"Video {video_id} status updated to error")
        except Exception as commit_error:
            logger.error(f"Failed to update error status: {commit_error}")

        raise


@celery_app.task(
    base=DatabaseTask,
    bind=True,
    name="analyze_project",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=2,
)
def analyze_project_task(self, project_id: str, user_id: str | None = None):
    """
    Analyze a project using cross-video synthesis (3-step pipeline).

    Steps:
    1. CROSS_RELATE - Find meta-patterns across videos
    2. CROSS_EXPLAIN - Generate cross-video insights
    3. CROSS_ACTIVATE - Create system-level design principles

    Each node is retried up to 2 times within the pipeline.  The
    Celery task itself also has autoretry (max 2 retries with backoff).

    Args:
        project_id: UUID of the project to analyze
        user_id: Optional user ID for BYOK key lookup

    Returns:
        Dictionary with cross-video analysis results

    Raises:
        Exception: If analysis fails
    """
    try:
        logger.info(f"Starting project analysis task for project {project_id}")

        # Get project from database
        project = self.db.query(Project).filter(Project.id == UUID(project_id)).first()
        if not project:
            raise Exception(f"Project {project_id} not found")

        # Get all completed video analyses for this project
        video_analyses = self.db.query(VideoAnalysis).join(Video).filter(
            Video.project_id == project.id,
            VideoAnalysis.status == "completed"
        ).all()

        if len(video_analyses) < 1:
            raise Exception("At least one completed video analysis is required")

        # Collect all patterns, insights, and principles from videos
        all_patterns = []
        all_insights = []
        all_principles = []
        video_ids = []

        for analysis in video_analyses:
            video_ids.append(str(analysis.video_id))
            if analysis.patterns:
                all_patterns.extend(analysis.patterns)
            if analysis.insights:
                all_insights.extend(analysis.insights)
            if analysis.design_principles:
                all_principles.extend(analysis.design_principles)

        # Get or create project analysis record
        project_analysis = self.db.query(ProjectAnalysis).filter(
            ProjectAnalysis.project_id == project.id
        ).first()

        if not project_analysis:
            project_analysis = ProjectAnalysis(
                project_id=project.id,
                video_ids=[UUID(vid) for vid in video_ids],
                status="processing",
                started_at=datetime.now(timezone.utc)
            )
            self.db.add(project_analysis)
        else:
            project_analysis.status = "processing"
            project_analysis.video_ids = [UUID(vid) for vid in video_ids]
            project_analysis.started_at = datetime.now(timezone.utc)

        self.db.commit()

        # Resolve BYOK API key and preferred model for this user
        byok_api_key, byok_model = _resolve_byok(self.db, user_id)

        # Prepare initial state for the pipeline
        initial_state: ProjectAnalysisState = {
            "project_id": project_id,
            "video_ids": video_ids,
            "video_patterns": all_patterns,
            "video_insights": all_insights,
            "video_principles": all_principles,
            "cross_video_patterns": None,
            "cross_video_insights": None,
            "cross_video_principles": None,
            "api_key": byok_api_key,
            "model": byok_model,
            "current_step": "cross_relate",
            "error": None
        }

        logger.info(f"Running project analysis pipeline for project {project_id}")

        # Run the analysis pipeline directly (no LangGraph ThreadPoolExecutor)
        final_state = _run_project_pipeline(initial_state)

        # Check for errors
        if final_state.get("error"):
            failed_step = final_state.get("current_step", "unknown")
            error_type = final_state.get("error_type", "unknown")
            structured_err = _build_pipeline_error_json(
                failed_step, final_state["error"], error_type
            )
            raise _PipelineError(
                f"Analysis failed at step '{failed_step}': {final_state['error']}",
                structured_json=structured_err,
            )

        # Save results to database
        project_analysis.cross_video_patterns = final_state.get("cross_video_patterns")
        project_analysis.cross_video_insights = final_state.get("cross_video_insights")
        project_analysis.cross_video_principles = final_state.get("cross_video_principles")
        project_analysis.status = "completed"
        project_analysis.completed_at = datetime.now(timezone.utc)

        self.db.commit()

        logger.info(f"Project analysis completed for project {project_id}")

        return {
            "project_id": project_id,
            "analysis_id": str(project_analysis.id),
            "status": "completed",
            "videos_analyzed": len(video_ids),
            "cross_patterns_count": len(final_state.get("cross_video_patterns", [])),
            "cross_insights_count": len(final_state.get("cross_video_insights", [])),
            "cross_principles_count": len(final_state.get("cross_video_principles", []))
        }

    except Exception as e:
        # Use structured JSON if the exception carries it, otherwise build one
        if isinstance(e, _PipelineError) and e.structured_json:
            error_json = _sanitize_error(e.structured_json)
        else:
            safe_msg = _sanitize_error(str(e))
            error_json = json.dumps(build_structured_error(
                step="unknown",
                exc=e,
                message=safe_msg,
            ))

        logger.error(f"Project analysis failed for project {project_id}: {_sanitize_error(str(e))}")

        # Update status to error
        try:
            self.db.rollback()
            project_analysis = self.db.query(ProjectAnalysis).filter(
                ProjectAnalysis.project_id == UUID(project_id)
            ).first()

            if project_analysis:
                project_analysis.status = "error"
                project_analysis.completed_at = datetime.now(timezone.utc)

            project = self.db.query(Project).filter(Project.id == UUID(project_id)).first()
            if project:
                project.error_message = error_json

            self.db.commit()
        except Exception as cleanup_error:
            logger.error(f"Failed to update error status for project {project_id}: {cleanup_error}")

        raise


class _PipelineError(Exception):
    """Internal exception carrying structured error JSON from the pipeline."""

    def __init__(self, message: str, structured_json: str | None = None):
        super().__init__(message)
        self.structured_json = structured_json
