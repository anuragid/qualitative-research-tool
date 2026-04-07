"""State machine for the ``Project`` row lifecycle.

Centralises the logic previously scattered across
``app/services/project_state_service.py``. The service still exists as the
public entry point for "recompute derived project state from children";
it now delegates the actual write to :class:`ProjectStateMachine`.

The ``ready`` -> ``completed`` gate bug (Bug B, 2026-04-07) is already
fixed in the service, but routing the write through this machine makes
sure a future edit can't silently regress it — the transition table here
is the authoritative source and the parametrized tests cover every
allowed edge.
"""

from __future__ import annotations

import logging
from typing import Optional

from app.models.database_models import Project
from app.state.events import ProjectEvent
from app.state.exceptions import InvalidTransitionError
from app.state.statuses import ProjectStatus

logger = logging.getLogger(__name__)


# (from_state, event) -> to_state
TRANSITIONS: dict[tuple[Optional[ProjectStatus], ProjectEvent], ProjectStatus] = {
    # ---- Creation ----
    (None, ProjectEvent.CREATED): ProjectStatus.PLANNING,

    # ---- First transcript done ----
    # Only planning advances to ready on the first transcript; if the project
    # is already in ready/processing/completed the event is a no-op, which
    # we model by allowing self-loops.
    (ProjectStatus.PLANNING, ProjectEvent.FIRST_TRANSCRIPT_COMPLETE): ProjectStatus.READY,
    (ProjectStatus.READY, ProjectEvent.FIRST_TRANSCRIPT_COMPLETE): ProjectStatus.READY,
    (ProjectStatus.PROCESSING, ProjectEvent.FIRST_TRANSCRIPT_COMPLETE): ProjectStatus.PROCESSING,
    (ProjectStatus.COMPLETED, ProjectEvent.FIRST_TRANSCRIPT_COMPLETE): ProjectStatus.COMPLETED,

    # ---- All videos finished ----
    # Bug B (HAIC ready-gate trap): prior code only allowed this from planning
    # or processing, which silently swallowed the final advance for any
    # project that had already flipped to READY after its first transcript.
    # This table includes READY explicitly so any future edit requires
    # deleting the row here, which breaks the parametrized test.
    (ProjectStatus.PLANNING, ProjectEvent.ALL_VIDEOS_COMPLETE): ProjectStatus.COMPLETED,
    (ProjectStatus.READY, ProjectEvent.ALL_VIDEOS_COMPLETE): ProjectStatus.COMPLETED,
    (ProjectStatus.PROCESSING, ProjectEvent.ALL_VIDEOS_COMPLETE): ProjectStatus.COMPLETED,
    # Idempotent: re-firing the event on an already-completed project is a
    # no-op (e.g., the service runs on every activate step for every video).
    (ProjectStatus.COMPLETED, ProjectEvent.ALL_VIDEOS_COMPLETE): ProjectStatus.COMPLETED,
}


class ProjectStateMachine:
    """State machine for :class:`Project` rows."""

    @staticmethod
    def transition(
        project: Project,
        event: ProjectEvent,
        *,
        db=None,  # noqa: ANN001
    ) -> ProjectStatus:
        """Transition ``project`` for ``event``. Does not commit."""
        del db

        from_state = (
            ProjectStatus(project.status) if project.status else None
        )

        key_specific = (from_state, event)
        key_wildcard = (None, event)
        if key_specific in TRANSITIONS:
            to_state = TRANSITIONS[key_specific]
        elif key_wildcard in TRANSITIONS:
            to_state = TRANSITIONS[key_wildcard]
        else:
            allowed_from = [
                k[0] for k in TRANSITIONS if k[1] == event and k[0] is not None
            ]
            raise InvalidTransitionError(
                entity_type="Project",
                entity_id=str(project.id),
                from_state=from_state,
                event=event,
                allowed_from=allowed_from,
            )

        project.status = to_state.value
        logger.debug(
            "ProjectStateMachine: Project(%s) %s -> %s via %s",
            project.id,
            from_state,
            to_state,
            event,
        )
        return to_state
