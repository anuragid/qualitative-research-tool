"""Service for managing project state transitions."""

import logging

from sqlalchemy.orm import Session, selectinload

from app.models.database_models import Project, Video

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

            # Check if all videos have completed analysis.
            # Eagerly load video_analysis to avoid lazy-load issues in Celery
            # (where the session may not support implicit lazy loading).
            videos = (
                db.query(Video)
                .options(selectinload(Video.video_analysis))
                .filter(Video.project_id == project_id)
                .all()
            )
            if videos:
                # Check if all videos have an analysis and all are completed
                all_completed = all(
                    v.video_analysis and v.video_analysis.status == "completed"
                    for v in videos
                )

                if all_completed and project.status in ("planning", "processing"):
                    project.status = "completed"
                    db.commit()
                    logger.info(f"Project {project_id} marked as 'completed'")

        except Exception as e:
            logger.error(f"Error marking project as completed: {e}")
            db.rollback()

