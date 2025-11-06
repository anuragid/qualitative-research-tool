"""Celery tasks for video and project analysis using LangGraph."""

from celery import Task
from sqlalchemy.orm import Session
from uuid import UUID
from datetime import datetime
import logging

from app.tasks.celery_app import celery_app
from app.database import SessionLocal
from app.models.database_models import Video, Transcript, SpeakerLabel, VideoAnalysis, ProjectAnalysis, Project
from app.agents.graph import video_analysis_graph, project_analysis_graph
from app.agents.states import VideoAnalysisState, ProjectAnalysisState

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


@celery_app.task(base=DatabaseTask, bind=True, name="analyze_video")
def analyze_video_task(self, video_id: str):
    """
    Analyze a video using the 5-step LangGraph pipeline.

    Steps:
    1. CHUNK - Break transcript into discrete pieces
    2. INFER - Interpret meaning from each chunk
    3. RELATE - Find patterns across inferences
    4. EXPLAIN - Generate insights from patterns
    5. ACTIVATE - Create design principles from insights

    Args:
        video_id: UUID of the video to analyze

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

        transcript = self.db.query(Transcript).filter(Transcript.video_id == video.id).first()
        if not transcript or transcript.status != "completed":
            raise Exception(f"No completed transcript found for video {video_id}")

        # Get speaker labels
        speaker_labels = self.db.query(SpeakerLabel).filter(
            SpeakerLabel.transcript_id == transcript.id
        ).all()

        # Build speaker mapping (speaker ID -> assigned name or default)
        speaker_mapping = {}
        for label in speaker_labels:
            speaker_mapping[label.speaker_label] = label.assigned_name or label.speaker_label

        # Get or create video analysis record
        video_analysis = self.db.query(VideoAnalysis).filter(
            VideoAnalysis.video_id == video.id
        ).first()

        if not video_analysis:
            video_analysis = VideoAnalysis(
                video_id=video.id,
                status="processing",
                started_at=datetime.utcnow()
            )
            self.db.add(video_analysis)
        else:
            video_analysis.status = "processing"
            video_analysis.started_at = datetime.utcnow()

        video.status = "analyzing"
        self.db.commit()

        # Prepare initial state for LangGraph
        initial_state: VideoAnalysisState = {
            "video_id": video_id,
            "transcript": transcript.processed_transcript,
            "speaker_labels": speaker_mapping,
            "chunks": None,
            "inferences": None,
            "patterns": None,
            "insights": None,
            "design_principles": None,
            "current_step": "chunk",
            "error": None
        }

        logger.info(f"Running LangGraph video analysis for video {video_id}")

        # Run the LangGraph workflow
        final_state = video_analysis_graph.invoke(initial_state)

        # Check for errors
        if final_state.get("error"):
            raise Exception(f"Analysis failed: {final_state['error']}")

        # Save results to database
        video_analysis.chunks = final_state.get("chunks")
        video_analysis.inferences = final_state.get("inferences")
        video_analysis.patterns = final_state.get("patterns")
        video_analysis.insights = final_state.get("insights")
        video_analysis.design_principles = final_state.get("design_principles")
        video_analysis.status = "completed"
        video_analysis.completed_at = datetime.utcnow()

        # Refresh video object to ensure it's attached to session
        self.db.refresh(video)
        video.status = "analyzed"

        # Explicitly flush and commit
        self.db.flush()
        self.db.commit()

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
        logger.error(f"Video analysis failed for video {video_id}: {e}")

        # Update status to error
        try:
            video = self.db.query(Video).filter(Video.id == UUID(video_id)).first()
            video_analysis = self.db.query(VideoAnalysis).filter(
                VideoAnalysis.video_id == UUID(video_id)
            ).first()

            if video:
                video.status = "error"
            if video_analysis:
                video_analysis.status = "error"
                video_analysis.completed_at = datetime.utcnow()

            # Explicitly flush and commit
            self.db.flush()
            self.db.commit()
            logger.info(f"Video {video_id} status updated to error")
        except Exception as commit_error:
            logger.error(f"Failed to update error status: {commit_error}")

        raise


@celery_app.task(base=DatabaseTask, bind=True, name="analyze_project")
def analyze_project_task(self, project_id: str):
    """
    Analyze a project using cross-video synthesis (3-step pipeline).

    Steps:
    1. CROSS_RELATE - Find meta-patterns across videos
    2. CROSS_EXPLAIN - Generate cross-video insights
    3. CROSS_ACTIVATE - Create system-level design principles

    Args:
        project_id: UUID of the project to analyze

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
                started_at=datetime.utcnow()
            )
            self.db.add(project_analysis)
        else:
            project_analysis.status = "processing"
            project_analysis.video_ids = [UUID(vid) for vid in video_ids]
            project_analysis.started_at = datetime.utcnow()

        self.db.commit()

        # Prepare initial state for LangGraph
        initial_state: ProjectAnalysisState = {
            "project_id": project_id,
            "video_ids": video_ids,
            "video_patterns": all_patterns,
            "video_insights": all_insights,
            "video_principles": all_principles,
            "cross_video_patterns": None,
            "cross_video_insights": None,
            "cross_video_principles": None,
            "current_step": "cross_relate",
            "error": None
        }

        logger.info(f"Running LangGraph project analysis for project {project_id}")

        # Run the LangGraph workflow
        final_state = project_analysis_graph.invoke(initial_state)

        # Check for errors
        if final_state.get("error"):
            raise Exception(f"Analysis failed: {final_state['error']}")

        # Save results to database
        project_analysis.cross_video_patterns = final_state.get("cross_video_patterns")
        project_analysis.cross_video_insights = final_state.get("cross_video_insights")
        project_analysis.cross_video_principles = final_state.get("cross_video_principles")
        project_analysis.status = "completed"
        project_analysis.completed_at = datetime.utcnow()

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
        logger.error(f"Project analysis failed for project {project_id}: {e}")

        # Update status to error
        try:
            project_analysis = self.db.query(ProjectAnalysis).filter(
                ProjectAnalysis.project_id == UUID(project_id)
            ).first()

            if project_analysis:
                project_analysis.status = "error"
                project_analysis.completed_at = datetime.utcnow()

            self.db.commit()
        except:
            pass

        raise
