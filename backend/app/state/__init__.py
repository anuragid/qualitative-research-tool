"""Centralised state machines for the methodex pipeline.

Before this package existed, ~40 scattered ``row.status = "..."`` write
sites defined the state transitions implicitly. Bug B (the
``ready``-gate trap fixed in PR #17, 2026-04-07) was the canonical
example of what goes wrong when two people write two halves of a
state machine without reconciling them.

Every persisted status write should now route through one of the
``*StateMachine`` classes in this package. Tests in
``backend/tests/test_*_state_machine.py`` parametrize over the full
transition tables so any future edit has to touch both code and tests.

Public API — importable from ``app.state``:

    - :class:`VideoStatus`, :class:`VideoAnalysisStatus`,
      :class:`ProjectStatus`, :class:`TranscriptStatus`
    - :class:`VideoEvent`, :class:`ProjectEvent`,
      :class:`VideoAnalysisEvent`, :class:`ProjectAnalysisEvent`,
      :class:`TranscriptEvent`
    - :class:`VideoStateMachine`, :class:`ProjectStateMachine`,
      :class:`VideoAnalysisStateMachine`,
      :class:`ProjectAnalysisStateMachine`,
      :class:`TranscriptStateMachine`
    - :class:`InvalidTransitionError`

Import-order note
-----------------
``app/models/database_models.py`` imports ``VideoStatus`` etc. from
``app.state.statuses``. Because Python initialises the parent package
before a submodule the first time the submodule is touched, this
``__init__.py`` MUST NOT import any of the state-machine modules
(``video_state``, ``project_state``, ``analysis_state``,
``transcript_state``) at package-init time — those modules import from
``database_models`` and would create a cycle.

Instead we expose them via ``__getattr__`` (PEP 562): the state machine
classes are materialised lazily on first attribute access, which lets
the model module finish initialising before any state machine touches it.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.state.events import (
    ProjectAnalysisEvent,
    ProjectEvent,
    TranscriptEvent,
    VideoAnalysisEvent,
    VideoEvent,
)
from app.state.exceptions import InvalidTransitionError
from app.state.statuses import (
    VIDEO_ANALYSIS_NOT_STARTED_SENTINEL,
    ProjectStatus,
    TranscriptStatus,
    VideoAnalysisStatus,
    VideoStatus,
)

if TYPE_CHECKING:  # pragma: no cover - static-typing only
    from app.state.analysis_state import (
        PROJECT_ANALYSIS_TRANSITIONS,
        VIDEO_ANALYSIS_TRANSITIONS,
        ProjectAnalysisStateMachine,
        VideoAnalysisStateMachine,
    )
    from app.state.project_state import (
        TRANSITIONS as PROJECT_TRANSITIONS,
    )
    from app.state.project_state import (
        ProjectStateMachine,
    )
    from app.state.transcript_state import (
        TRANSITIONS as TRANSCRIPT_TRANSITIONS,
    )
    from app.state.transcript_state import (
        TranscriptStateMachine,
    )
    from app.state.video_state import (
        TRANSITIONS as VIDEO_TRANSITIONS,
    )
    from app.state.video_state import (
        VideoStateMachine,
    )


__all__ = [
    # Statuses
    "VideoStatus",
    "VideoAnalysisStatus",
    "ProjectStatus",
    "TranscriptStatus",
    "VIDEO_ANALYSIS_NOT_STARTED_SENTINEL",
    # Events
    "VideoEvent",
    "ProjectEvent",
    "VideoAnalysisEvent",
    "ProjectAnalysisEvent",
    "TranscriptEvent",
    # State machines (lazy-loaded via __getattr__)
    "VideoStateMachine",
    "ProjectStateMachine",
    "VideoAnalysisStateMachine",
    "ProjectAnalysisStateMachine",
    "TranscriptStateMachine",
    # Transition tables (lazy-loaded)
    "VIDEO_TRANSITIONS",
    "PROJECT_TRANSITIONS",
    "VIDEO_ANALYSIS_TRANSITIONS",
    "PROJECT_ANALYSIS_TRANSITIONS",
    "TRANSCRIPT_TRANSITIONS",
    # Exceptions
    "InvalidTransitionError",
]


# Lazy attribute access: the first time any of these names is looked up on
# ``app.state``, we import the underlying module. This avoids the circular
# import with ``app.models.database_models`` while keeping the public API
# (``from app.state import VideoStateMachine``) ergonomic.
_LAZY = {
    "VideoStateMachine": ("app.state.video_state", "VideoStateMachine"),
    "VIDEO_TRANSITIONS": ("app.state.video_state", "TRANSITIONS"),
    "ProjectStateMachine": ("app.state.project_state", "ProjectStateMachine"),
    "PROJECT_TRANSITIONS": ("app.state.project_state", "TRANSITIONS"),
    "VideoAnalysisStateMachine": (
        "app.state.analysis_state",
        "VideoAnalysisStateMachine",
    ),
    "ProjectAnalysisStateMachine": (
        "app.state.analysis_state",
        "ProjectAnalysisStateMachine",
    ),
    "VIDEO_ANALYSIS_TRANSITIONS": (
        "app.state.analysis_state",
        "VIDEO_ANALYSIS_TRANSITIONS",
    ),
    "PROJECT_ANALYSIS_TRANSITIONS": (
        "app.state.analysis_state",
        "PROJECT_ANALYSIS_TRANSITIONS",
    ),
    "TranscriptStateMachine": (
        "app.state.transcript_state",
        "TranscriptStateMachine",
    ),
    "TRANSCRIPT_TRANSITIONS": ("app.state.transcript_state", "TRANSITIONS"),
}


def __getattr__(name: str):  # PEP 562
    try:
        module_path, attr = _LAZY[name]
    except KeyError as exc:  # pragma: no cover - defensive
        raise AttributeError(f"module 'app.state' has no attribute {name!r}") from exc

    import importlib

    module = importlib.import_module(module_path)
    value = getattr(module, attr)
    globals()[name] = value  # cache for subsequent lookups
    return value
