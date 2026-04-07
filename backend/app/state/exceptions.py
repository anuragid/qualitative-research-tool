"""Exceptions raised by the state machines."""

from __future__ import annotations

from typing import Any, Sequence


class InvalidTransitionError(Exception):
    """Raised when a state-machine ``transition()`` call is illegal.

    Callers that need to distinguish "invalid transition" from a generic
    Exception can except on this type. The exception carries the
    entity type/id, current state, attempted event, and the list of
    states from which the event *is* legal — enough for a useful log
    message and for structured Sentry breadcrumbs.
    """

    def __init__(
        self,
        entity_type: str,
        entity_id: str,
        from_state: Any,
        event: Any,
        allowed_from: Sequence[Any],
    ):
        self.entity_type = entity_type
        self.entity_id = entity_id
        self.from_state = from_state
        self.event = event
        self.allowed_from = list(allowed_from)
        allowed_repr = ", ".join(str(s) for s in allowed_from) or "<none>"
        super().__init__(
            f"{entity_type}({entity_id}): event {event} not allowed from "
            f"state {from_state}. Allowed from: [{allowed_repr}]"
        )
