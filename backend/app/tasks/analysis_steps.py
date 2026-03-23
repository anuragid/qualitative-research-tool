"""Separate Celery tasks for step-by-step analysis."""

import logging
from datetime import datetime, timezone
from typing import Any, Dict
from uuid import UUID

from sqlalchemy.orm import Session

from app.agents.nodes.activate import activate_node
from app.agents.nodes.chunk import chunk_node
from app.agents.nodes.explain import explain_node
from app.agents.nodes.infer import infer_node
from app.agents.nodes.relate import relate_node
from app.models.database_models import SpeakerLabel, Transcript, Video, VideoAnalysis
from app.services.byok_service import resolve_byok as _resolve_byok
from app.services.project_state_service import ProjectStateService
from app.tasks.base import DatabaseTask
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


def get_video_analysis_state(db: Session, video_id: UUID) -> Dict[str, Any]:
    """Build the state needed for analysis nodes from database."""
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise Exception(f"Video {video_id} not found")

    transcript = db.query(Transcript).filter(Transcript.video_id == video_id).first()
    if not transcript or not transcript.processed_transcript:
        raise Exception(f"No transcript found for video {video_id}")

    # Get speaker labels
    speaker_labels = db.query(SpeakerLabel).filter(
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
    analysis = db.query(VideoAnalysis).filter(VideoAnalysis.video_id == video_id).first()
    if not analysis:
        analysis = VideoAnalysis(
            video_id=video_id,
            status="pending",
            current_step="chunk",
            step_status={}
        )
        db.add(analysis)
        db.commit()

    return {
        "video_id": str(video_id),
        "transcript": transcript.processed_transcript,
        "speaker_labels": speaker_mapping,
        "speaker_roles": speaker_roles,
        "analysis": analysis
    }


def _update_analysis_error(db: Session, video_id: str, step_name: str):
    """Safely update analysis record to error state.

    Rolls back any dirty session state before querying, ensuring the
    error status update succeeds even if the previous transaction was
    left in a broken state.

    Uses a fresh query to avoid UnboundLocalError if the analysis variable
    was never assigned in the calling scope.
    """
    try:
        db.rollback()
        analysis = db.query(VideoAnalysis).filter(
            VideoAnalysis.video_id == UUID(video_id)
        ).first()
        if analysis:
            analysis.status = "error"
            analysis.step_status = {**(analysis.step_status or {}), step_name: "error"}

        # Also reset video status from "analyzing" so it's not stuck
        video = db.query(Video).filter(Video.id == UUID(video_id)).first()
        if video and video.status == "analyzing":
            video.status = "error"

        db.commit()
    except Exception as commit_error:
        logger.error(f"Failed to update error status for {step_name}: {commit_error}")
        try:
            db.rollback()
        except Exception:
            pass


@celery_app.task(
    base=DatabaseTask,
    bind=True,
    name="analyze_chunk_step",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=3,
)
def analyze_chunk_step(self, video_id: str, user_id: str | None = None):
    """
    Step 1: CHUNK - Break transcript into discrete pieces.
    """
    try:
        logger.info(f"Starting CHUNK step for video {video_id}")

        # Get state from database
        state = get_video_analysis_state(self.db, UUID(video_id))
        analysis = state["analysis"]

        # Resolve BYOK API key and preferred model
        byok_api_key, byok_model = _resolve_byok(self.db, user_id)

        # Update status
        analysis.status = "processing"
        analysis.current_step = "chunk"
        analysis.step_status = {**(analysis.step_status or {}), "chunk": "processing"}
        analysis.started_at = datetime.now(timezone.utc)
        self.db.commit()

        # Run chunk node
        result = chunk_node({
            "video_id": video_id,
            "transcript": state["transcript"],
            "speaker_labels": state["speaker_labels"],
            "speaker_roles": state["speaker_roles"],
            "api_key": byok_api_key,
            "model": byok_model,
        })

        # Check for errors in node result
        if result.get("error") or result.get("chunks") is None:
            error_msg = result.get("error", "Failed to generate chunks")
            raise Exception(f"Chunk generation failed: {error_msg}")

        # Save results
        analysis.chunks = result.get("chunks")
        analysis.chunk_completed_at = datetime.now(timezone.utc)
        analysis.step_status = {**(analysis.step_status or {}), "chunk": "completed"}
        self.db.commit()

        logger.info(f"CHUNK step completed for video {video_id}")
        return {
            "video_id": video_id,
            "status": "success",
            "chunks_count": len(result.get("chunks", []))
        }

    except Exception as e:
        logger.error(f"CHUNK step failed for video {video_id}: {e}")
        _update_analysis_error(self.db, video_id, "chunk")
        raise


@celery_app.task(
    base=DatabaseTask,
    bind=True,
    name="analyze_infer_step",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=3
)
def analyze_infer_step(self, video_id: str, user_id: str | None = None):
    """
    Step 2: INFER - Interpret meaning from each chunk.
    Automatically retries up to 3 times with exponential backoff on failure.
    """
    try:
        logger.info(f"Starting INFER step for video {video_id}")

        # Get analysis record
        analysis = self.db.query(VideoAnalysis).filter(
            VideoAnalysis.video_id == UUID(video_id)
        ).first()

        if not analysis or not analysis.chunks:
            raise Exception("No chunks available for inference")

        # Resolve BYOK API key and preferred model
        byok_api_key, byok_model = _resolve_byok(self.db, user_id)

        # Update status
        analysis.current_step = "infer"
        analysis.step_status = {**(analysis.step_status or {}), "infer": "processing"}
        self.db.commit()

        # Run infer node
        result = infer_node({
            "video_id": video_id,
            "chunks": analysis.chunks,
            "api_key": byok_api_key,
            "model": byok_model,
        })

        # Check if result has error
        if result.get("error") or result.get("inferences") is None:
            error_msg = result.get("error", "Failed to generate inferences")
            raise Exception(f"Inference generation failed: {error_msg}")

        # Save results
        analysis.inferences = result.get("inferences")
        analysis.infer_completed_at = datetime.now(timezone.utc)
        analysis.step_status = {**(analysis.step_status or {}), "infer": "completed"}
        self.db.commit()

        logger.info(f"INFER step completed for video {video_id}")
        return {
            "video_id": video_id,
            "status": "success",
            "inferences_count": len(result.get("inferences", []))
        }

    except Exception as e:
        logger.error(f"INFER step failed for video {video_id}: {e}")
        _update_analysis_error(self.db, video_id, "infer")
        raise


@celery_app.task(
    base=DatabaseTask,
    bind=True,
    name="analyze_relate_step",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=3,
)
def analyze_relate_step(self, video_id: str, user_id: str | None = None):
    """
    Step 3: RELATE - Find patterns across inferences.
    """
    try:
        logger.info(f"Starting RELATE step for video {video_id}")

        # Get analysis record
        analysis = self.db.query(VideoAnalysis).filter(
            VideoAnalysis.video_id == UUID(video_id)
        ).first()

        if not analysis or not analysis.inferences:
            raise Exception("No inferences available for pattern analysis")

        # Resolve BYOK API key and preferred model
        byok_api_key, byok_model = _resolve_byok(self.db, user_id)

        # Update status
        analysis.current_step = "relate"
        analysis.step_status = {**(analysis.step_status or {}), "relate": "processing"}
        self.db.commit()

        # Run relate node
        result = relate_node({
            "video_id": video_id,
            "inferences": analysis.inferences,
            "api_key": byok_api_key,
            "model": byok_model,
        })

        # Check for errors in node result
        if result.get("error") or result.get("patterns") is None:
            error_msg = result.get("error", "Failed to identify patterns")
            raise Exception(f"Pattern analysis failed: {error_msg}")

        # Save results
        analysis.patterns = result.get("patterns")
        analysis.relate_completed_at = datetime.now(timezone.utc)
        analysis.step_status = {**(analysis.step_status or {}), "relate": "completed"}
        self.db.commit()

        logger.info(f"RELATE step completed for video {video_id}")
        return {
            "video_id": video_id,
            "status": "success",
            "patterns_count": len(result.get("patterns", []))
        }

    except Exception as e:
        logger.error(f"RELATE step failed for video {video_id}: {e}")
        _update_analysis_error(self.db, video_id, "relate")
        raise


@celery_app.task(
    base=DatabaseTask,
    bind=True,
    name="analyze_explain_step",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=3,
)
def analyze_explain_step(self, video_id: str, user_id: str | None = None):
    """
    Step 4: EXPLAIN - Generate insights from patterns.
    """
    try:
        logger.info(f"Starting EXPLAIN step for video {video_id}")

        # Get analysis record
        analysis = self.db.query(VideoAnalysis).filter(
            VideoAnalysis.video_id == UUID(video_id)
        ).first()

        if not analysis or not analysis.patterns:
            raise Exception("No patterns available for insight generation")

        # Resolve BYOK API key and preferred model
        byok_api_key, byok_model = _resolve_byok(self.db, user_id)

        # Update status
        analysis.current_step = "explain"
        analysis.step_status = {**(analysis.step_status or {}), "explain": "processing"}
        self.db.commit()

        # Run explain node - include chunks for evidence (explain_node uses them)
        result = explain_node({
            "video_id": video_id,
            "patterns": analysis.patterns,
            "chunks": analysis.chunks,  # Provide chunks for evidence context
            "api_key": byok_api_key,
            "model": byok_model,
        })

        # Check for errors in node result
        if result.get("error") or result.get("insights") is None:
            error_msg = result.get("error", "Failed to generate insights")
            raise Exception(f"Insight generation failed: {error_msg}")

        # Save results
        analysis.insights = result.get("insights")
        analysis.explain_completed_at = datetime.now(timezone.utc)
        analysis.step_status = {**(analysis.step_status or {}), "explain": "completed"}
        self.db.commit()

        logger.info(f"EXPLAIN step completed for video {video_id}")
        return {
            "video_id": video_id,
            "status": "success",
            "insights_count": len(result.get("insights", []))
        }

    except Exception as e:
        logger.error(f"EXPLAIN step failed for video {video_id}: {e}")
        _update_analysis_error(self.db, video_id, "explain")
        raise


@celery_app.task(
    base=DatabaseTask,
    bind=True,
    name="analyze_activate_step",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=3,
)
def analyze_activate_step(self, video_id: str, user_id: str | None = None):
    """
    Step 5: ACTIVATE - Create design principles from insights.
    """
    try:
        logger.info(f"Starting ACTIVATE step for video {video_id}")

        # Get analysis record
        analysis = self.db.query(VideoAnalysis).filter(
            VideoAnalysis.video_id == UUID(video_id)
        ).first()

        if not analysis or not analysis.insights:
            raise Exception("No insights available for design principle generation")

        # Resolve BYOK API key and preferred model
        byok_api_key, byok_model = _resolve_byok(self.db, user_id)

        # Update status
        analysis.current_step = "activate"
        analysis.step_status = {**(analysis.step_status or {}), "activate": "processing"}
        self.db.commit()

        # Run activate node
        result = activate_node({
            "video_id": video_id,
            "insights": analysis.insights,
            "api_key": byok_api_key,
            "model": byok_model,
        })

        # Check for errors in node result
        if result.get("error") or result.get("design_principles") is None:
            error_msg = result.get("error", "Failed to generate design principles")
            raise Exception(f"Design principle generation failed: {error_msg}")

        # Save results
        analysis.design_principles = result.get("design_principles")
        analysis.activate_completed_at = datetime.now(timezone.utc)
        analysis.step_status = {**(analysis.step_status or {}), "activate": "completed"}
        analysis.status = "completed"
        analysis.completed_at = datetime.now(timezone.utc)

        # Get video object and update status to analyzed
        video = self.db.query(Video).filter(Video.id == UUID(video_id)).first()
        if video:
            video.status = "analyzed"

        self.db.commit()

        # Update project state - mark as completed if all videos are analyzed
        if video:
            try:
                ProjectStateService.update_project_state_for_completion(str(video.project_id), self.db)
            except Exception as project_state_error:
                logger.warning(f"Failed to update project state: {project_state_error}")

        logger.info(f"ACTIVATE step completed for video {video_id}")
        return {
            "video_id": video_id,
            "status": "success",
            "principles_count": len(result.get("design_principles", []))
        }

    except Exception as e:
        logger.error(f"ACTIVATE step failed for video {video_id}: {e}")
        _update_analysis_error(self.db, video_id, "activate")
        raise
