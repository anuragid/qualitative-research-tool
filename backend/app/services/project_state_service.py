"""Service for managing project state transitions."""

from sqlalchemy.orm import Session
from app.models.database_models import Project, Video
import logging

logger = logging.getLogger(__name__)


class ProjectStateService:
    """Handles automatic project state transitions."""

    @staticmethod
    def update_project_state_for_completion(project_id: str, db: Session):
        """Mark project as completed when all analyses are done."""
        try:
            project = db.query(Project).filter(Project.id == project_id).first()
            if not project:
                return

            # Check if all videos have completed analysis
            # We check video_analysis.status instead of video.status because:
            # 1. video_analysis.status properly tracks analysis completion
            # 2. It handles both standard and step-by-step analysis modes
            # 3. video.status uses "analyzed" not "completed"
            videos = db.query(Video).filter(Video.project_id == project_id).all()
            if videos:
                # Check if all videos have an analysis and all are completed
                all_completed = all(
                    v.video_analysis and v.video_analysis.status == "completed"
                    for v in videos
                )

                if all_completed and project.status == "processing":
                    project.status = "completed"
                    db.commit()
                    logger.info(f"Project {project_id} marked as 'completed'")

        except Exception as e:
            logger.error(f"Error marking project as completed: {e}")
            db.rollback()

