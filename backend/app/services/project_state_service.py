"""Service for managing project state transitions.

Thin wrapper around :class:`ProjectStateMachine`. This module's public
entry point, :meth:`ProjectStateService.update_project_state_for_completion`,
inspects the project's children and fires the appropriate
:class:`ProjectEvent` at the state machine — the state machine owns the
transition table, so the gate conditions (including the READY ->
COMPLETED edge previously trapped by Bug B, HAIC 2026-04-07) are
enforced in one place.
"""

import logging

from sqlalchemy.orm import Session, selectinload

from app.models.database_models import Project, Video
from app.state import ProjectEvent, ProjectStateMachine
from app.state.statuses import ProjectStatus

logger = logging.getLogger(__name__)


class ProjectStateService:
    """Handles automatic project state transitions."""

    @staticmethod
    def update_project_state_for_completion(project_id: str, db: Session):
        """Recompute derived project state from its videos and fire the
        appropriate state-machine event.

        Fires ``ALL_VIDEOS_COMPLETE`` when every video has a completed
        analysis. Fires ``FIRST_TRANSCRIPT_COMPLETE`` when at least one
        video is transcribed/analyzed but not all videos are complete.
        Both events are idempotent from their terminal states (see the
        self-loops in the project transition table).
        """
        try:
            project = db.query(Project).filter(Project.id == project_id).first()
            if not project:
                return

            # Eagerly load video_analysis to avoid lazy-load issues in Celery
            # (where the session may not support implicit lazy loading).
            videos = (
                db.query(Video)
                .options(selectinload(Video.video_analysis))
                .filter(Video.project_id == project_id)
                .all()
            )
            if not videos:
                return

            all_completed = all(
                v.video_analysis and v.video_analysis.status == "completed"
                for v in videos
            )

            if all_completed:
                # Bug B regression guard: the transition table includes
                # (READY, ALL_VIDEOS_COMPLETE) -> COMPLETED, so a project
                # stuck in 'ready' after its first transcript will still
                # advance to 'completed' here.
                prior = project.status
                try:
                    ProjectStateMachine.transition(
                        project, ProjectEvent.ALL_VIDEOS_COMPLETE
                    )
                except Exception as exc:
                    # Archived or other non-live states are not valid
                    # sources for this transition — log loudly but don't
                    # raise, consistent with the previous best-effort
                    # behaviour of this service.
                    logger.warning(
                        "Project %s: ALL_VIDEOS_COMPLETE not allowed from %s (%s)",
                        project_id, prior, exc,
                    )
                    return
                if project.status != prior:
                    db.commit()
                    logger.info(f"Project {project_id} marked as 'completed'")
                return

            has_transcribed = any(
                v.status in ("transcribed", "analyzed") for v in videos
            )
            if has_transcribed and project.status == ProjectStatus.PLANNING.value:
                prior = project.status
                ProjectStateMachine.transition(
                    project, ProjectEvent.FIRST_TRANSCRIPT_COMPLETE
                )
                if project.status != prior:
                    db.commit()
                    logger.info(f"Project {project_id} marked as 'ready'")

        except Exception as e:
            logger.error(f"Error updating project state: {e}")
            db.rollback()
