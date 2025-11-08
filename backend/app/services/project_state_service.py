"""Service for managing project state transitions."""

from sqlalchemy.orm import Session
from app.models.database_models import Project, Video
from app.database import SessionLocal
import logging

logger = logging.getLogger(__name__)


class ProjectStateService:
    """Handles automatic project state transitions."""

    @staticmethod
    def update_project_state_after_video_upload(project_id: str, db: Session):
        """Update project state after a video is uploaded."""
        try:
            project = db.query(Project).filter(Project.id == project_id).first()
            if not project:
                return

            # If project is in planning state and now has videos, move to ready
            if project.status == "planning":
                video_count = db.query(Video).filter(Video.project_id == project_id).count()
                if video_count > 0:
                    project.status = "ready"
                    db.commit()
                    logger.info(f"Project {project_id} moved from 'planning' to 'ready'")

        except Exception as e:
            logger.error(f"Error updating project state after video upload: {e}")
            db.rollback()

    @staticmethod
    def update_project_state_for_processing(project_id: str, db: Session):
        """Mark project as processing when analysis starts."""
        try:
            project = db.query(Project).filter(Project.id == project_id).first()
            if not project:
                return

            # Only update if not already in a terminal state
            if project.status in ["ready", "planning"]:
                project.status = "processing"
                db.commit()
                logger.info(f"Project {project_id} marked as 'processing'")

        except Exception as e:
            logger.error(f"Error marking project as processing: {e}")
            db.rollback()

    @staticmethod
    def update_project_state_for_completion(project_id: str, db: Session):
        """Mark project as completed when all analyses are done."""
        try:
            project = db.query(Project).filter(Project.id == project_id).first()
            if not project:
                return

            # Check if all videos have completed analysis
            videos = db.query(Video).filter(Video.project_id == project_id).all()
            if videos and all(v.status == "completed" for v in videos):
                if project.status == "processing":
                    project.status = "completed"
                    db.commit()
                    logger.info(f"Project {project_id} marked as 'completed'")

        except Exception as e:
            logger.error(f"Error marking project as completed: {e}")
            db.rollback()

    @staticmethod
    def update_project_state_for_error(project_id: str, error_message: str, db: Session):
        """Mark project as error when something fails."""
        try:
            project = db.query(Project).filter(Project.id == project_id).first()
            if not project:
                return

            project.status = "error"
            project.error_message = error_message
            db.commit()
            logger.error(f"Project {project_id} marked as 'error': {error_message}")

        except Exception as e:
            logger.error(f"Error marking project as error state: {e}")
            db.rollback()

    @staticmethod
    def clear_error_state(project_id: str, db: Session):
        """Clear error state and revert to appropriate state."""
        try:
            project = db.query(Project).filter(Project.id == project_id).first()
            if not project or project.status != "error":
                return

            # Determine appropriate state based on project content
            video_count = db.query(Video).filter(Video.project_id == project_id).count()

            if video_count == 0:
                project.status = "planning"
            else:
                # Check if any videos are processing
                processing_videos = db.query(Video).filter(
                    Video.project_id == project_id,
                    Video.status.in_(["transcribing", "analyzing"])
                ).count()

                if processing_videos > 0:
                    project.status = "processing"
                else:
                    project.status = "ready"

            project.error_message = None
            db.commit()
            logger.info(f"Project {project_id} error state cleared, now '{project.status}'")

        except Exception as e:
            logger.error(f"Error clearing project error state: {e}")
            db.rollback()