"""Separate Celery tasks for step-by-step analysis."""

from celery import Task
from sqlalchemy.orm import Session
from uuid import UUID
import logging
from datetime import datetime, timezone
from typing import Dict, Any

from app.tasks.celery_app import celery_app
from app.database import SessionLocal
from app.models.database_models import Video, VideoAnalysis, Transcript, SpeakerLabel
from app.agents.nodes.chunk import chunk_node
from app.agents.nodes.infer import infer_node
from app.agents.nodes.relate import relate_node
from app.agents.nodes.explain import explain_node
from app.agents.nodes.activate import activate_node
from app.services.project_state_service import ProjectStateService

logger = logging.getLogger(__name__)


class DatabaseTask(Task):
    """Base task with database session management."""

    _db: Session = None

    @property
    def db(self) -> Session:
        """Get or create database session."""
        if self._db is None:
            self._db = SessionLocal()
        return self._db

    def after_return(self, *args, **kwargs):
        """Clean up database session after task completes."""
        if self._db is not None:
            self._db.close()
            self._db = None


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


@celery_app.task(base=DatabaseTask, bind=True, name="analyze_chunk_step")
def analyze_chunk_step(self, video_id: str):
    """
    Step 1: CHUNK - Break transcript into discrete pieces.
    """
    try:
        logger.info(f"Starting CHUNK step for video {video_id}")

        # Get state from database
        state = get_video_analysis_state(self.db, UUID(video_id))
        analysis = state["analysis"]

        # Update status
        analysis.status = "processing"
        analysis.current_step = "chunk"
        analysis.step_status = {**analysis.step_status, "chunk": "processing"}
        analysis.started_at = datetime.now(timezone.utc)
        self.db.commit()

        # Run chunk node
        result = chunk_node({
            "video_id": video_id,
            "transcript": state["transcript"],
            "speaker_labels": state["speaker_labels"],
            "speaker_roles": state["speaker_roles"]
        })

        # Save results
        analysis.chunks = result.get("chunks")
        analysis.chunk_completed_at = datetime.now(timezone.utc)
        analysis.step_status = {**analysis.step_status, "chunk": "completed"}
        # Keep current_step as "chunk" so user can review results
        self.db.commit()

        logger.info(f"CHUNK step completed for video {video_id}")
        return {
            "video_id": video_id,
            "status": "success",
            "chunks_count": len(result.get("chunks", []))
        }

    except Exception as e:
        logger.error(f"CHUNK step failed for video {video_id}: {e}")

        # Update status to error
        analysis = self.db.query(VideoAnalysis).filter(
            VideoAnalysis.video_id == UUID(video_id)
        ).first()
        if analysis:
            analysis.status = "error"
            analysis.step_status = {**analysis.step_status, "chunk": "error"}
            self.db.commit()

        raise


@celery_app.task(base=DatabaseTask, bind=True, name="analyze_infer_step")
def analyze_infer_step(self, video_id: str):
    """
    Step 2: INFER - Interpret meaning from each chunk.
    """
    try:
        logger.info(f"Starting INFER step for video {video_id}")

        # Get analysis record
        analysis = self.db.query(VideoAnalysis).filter(
            VideoAnalysis.video_id == UUID(video_id)
        ).first()

        if not analysis or not analysis.chunks:
            raise Exception("No chunks available for inference")

        # Update status
        analysis.current_step = "infer"
        analysis.step_status = {**analysis.step_status, "infer": "processing"}
        self.db.commit()

        # Run infer node
        result = infer_node({
            "video_id": video_id,
            "chunks": analysis.chunks
        })

        # Save results
        analysis.inferences = result.get("inferences")
        analysis.infer_completed_at = datetime.now(timezone.utc)
        analysis.step_status = {**analysis.step_status, "infer": "completed"}
        # Keep current_step as "infer" so user can review results
        self.db.commit()

        logger.info(f"INFER step completed for video {video_id}")
        return {
            "video_id": video_id,
            "status": "success",
            "inferences_count": len(result.get("inferences", []))
        }

    except Exception as e:
        logger.error(f"INFER step failed for video {video_id}: {e}")

        # Update status to error
        if analysis:
            analysis.status = "error"
            analysis.step_status = {**analysis.step_status, "infer": "error"}
            self.db.commit()

        raise


@celery_app.task(base=DatabaseTask, bind=True, name="analyze_relate_step")
def analyze_relate_step(self, video_id: str):
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

        # Update status
        analysis.current_step = "relate"
        analysis.step_status = {**analysis.step_status, "relate": "processing"}
        self.db.commit()

        # Run relate node
        result = relate_node({
            "video_id": video_id,
            "inferences": analysis.inferences
        })

        # Save results
        analysis.patterns = result.get("patterns")
        analysis.relate_completed_at = datetime.now(timezone.utc)
        analysis.step_status = {**analysis.step_status, "relate": "completed"}
        # Keep current_step as "relate" so user can review results
        self.db.commit()

        logger.info(f"RELATE step completed for video {video_id}")
        return {
            "video_id": video_id,
            "status": "success",
            "patterns_count": len(result.get("patterns", []))
        }

    except Exception as e:
        logger.error(f"RELATE step failed for video {video_id}: {e}")

        # Update status to error
        if analysis:
            analysis.status = "error"
            analysis.step_status = {**analysis.step_status, "relate": "error"}
            self.db.commit()

        raise


@celery_app.task(base=DatabaseTask, bind=True, name="analyze_explain_step")
def analyze_explain_step(self, video_id: str):
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

        # Update status
        analysis.current_step = "explain"
        analysis.step_status = {**analysis.step_status, "explain": "processing"}
        self.db.commit()

        # Run explain node
        result = explain_node({
            "video_id": video_id,
            "patterns": analysis.patterns
        })

        # Save results
        analysis.insights = result.get("insights")
        analysis.explain_completed_at = datetime.now(timezone.utc)
        analysis.step_status = {**analysis.step_status, "explain": "completed"}
        # Keep current_step as "explain" so user can review results
        self.db.commit()

        logger.info(f"EXPLAIN step completed for video {video_id}")
        return {
            "video_id": video_id,
            "status": "success",
            "insights_count": len(result.get("insights", []))
        }

    except Exception as e:
        logger.error(f"EXPLAIN step failed for video {video_id}: {e}")

        # Update status to error
        if analysis:
            analysis.status = "error"
            analysis.step_status = {**analysis.step_status, "explain": "error"}
            self.db.commit()

        raise


@celery_app.task(base=DatabaseTask, bind=True, name="analyze_activate_step")
def analyze_activate_step(self, video_id: str):
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

        # Update status
        analysis.current_step = "activate"
        analysis.step_status = {**analysis.step_status, "activate": "processing"}
        self.db.commit()

        # Run activate node
        result = activate_node({
            "video_id": video_id,
            "insights": analysis.insights
        })

        # Save results
        analysis.design_principles = result.get("design_principles")
        analysis.activate_completed_at = datetime.now(timezone.utc)
        analysis.step_status = {**analysis.step_status, "activate": "completed"}
        analysis.status = "completed"
        analysis.completed_at = datetime.now(timezone.utc)

        # Update video status to analyzed
        video.status = "analyzed"

        self.db.commit()

        # Update project state - mark as completed if all videos are analyzed
        ProjectStateService.update_project_state_for_completion(str(video.project_id), self.db)

        logger.info(f"ACTIVATE step completed for video {video_id}")
        return {
            "video_id": video_id,
            "status": "success",
            "principles_count": len(result.get("design_principles", []))
        }

    except Exception as e:
        logger.error(f"ACTIVATE step failed for video {video_id}: {e}")

        # Update status to error
        if analysis:
            analysis.status = "error"
            analysis.step_status = {**analysis.step_status, "activate": "error"}
            self.db.commit()

        raise