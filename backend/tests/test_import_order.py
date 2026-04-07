"""Regression test for PYTHON-FASTAPI-X circular-import crash.

Background
----------
In production we hit:

    AttributeError: partially initialized module 'app.routes.projects'
                    has no attribute 'router'
                    (most likely due to a circular import)

at ``app.main`` startup. Root cause: ``app.routes.{projects,videos,users}``
each do ``from app.main import limiter`` at module load time. If anything
other than ``app.main`` is the first thing Python imports a route module
from (multi-worker uvicorn startup races, Sentry auto-instrumentation,
celery worker boot paths that reach into ``app.routes.*``), the import
order becomes:

    1. ``app.routes.projects`` starts loading
    2. Hits ``from app.main import limiter`` -> begins importing ``app.main``
    3. ``app.main`` runs through its ``from app.routes import projects, ...``
       line and receives the *partial* ``routes.projects`` module from
       ``sys.modules``
    4. ``app.main`` then calls ``app.include_router(projects.router, ...)``
    5. ``router`` was going to be defined later in ``routes/projects.py``
       (line 29) but we only got as far as the ``from app.main import``
       on line 15 -> ``AttributeError``.

Every existing test enters via ``from app.main import app`` (conftest
fixtures, ``test_health``, etc.), which guarantees ``app.main`` is always
first. That is why PR #6's 27 unit tests all passed and production still
crashed. This test closes that gap.

We run the import in a clean subprocess so we are not contaminated by
other tests that have already populated ``sys.modules`` with ``app.main``.
"""

from __future__ import annotations

import os
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

# Every route module that currently pulls ``limiter`` off ``app.main``
# (or will in the future). Each one must be safe to import first.
ROUTE_MODULES = [
    "app.routes.projects",
    "app.routes.videos",
    "app.routes.users",
]

_BACKEND_ROOT = Path(__file__).resolve().parent.parent


def _run_import_sequence(first_import: str) -> subprocess.CompletedProcess[str]:
    """Spawn a fresh Python and import ``first_import`` before ``app.main``.

    Inherits the current test env (conftest has already populated the
    required settings variables) and forces ``cwd`` to the backend root
    so ``app.*`` is importable.
    """
    code = textwrap.dedent(
        f"""
        import {first_import}
        import app.main  # noqa: F401 — must be importable after the route module
        print("IMPORT_ORDER_OK")
        """
    ).strip()
    return subprocess.run(
        [sys.executable, "-c", code],
        capture_output=True,
        text=True,
        env=os.environ.copy(),
        cwd=_BACKEND_ROOT,
        timeout=30,
    )


@pytest.mark.parametrize("first_import", ROUTE_MODULES)
def test_route_module_importable_before_app_main(first_import: str) -> None:
    """Each ``app.routes.*`` module must survive being imported before ``app.main``.

    Regresses PYTHON-FASTAPI-X.
    """
    result = _run_import_sequence(first_import)
    assert result.returncode == 0, (
        f"Importing {first_import!r} before app.main failed.\n"
        f"--- stderr ---\n{result.stderr}\n"
        f"--- stdout ---\n{result.stdout}"
    )
    assert "IMPORT_ORDER_OK" in result.stdout, (
        f"Subprocess did not reach the success marker.\n"
        f"--- stderr ---\n{result.stderr}\n"
        f"--- stdout ---\n{result.stdout}"
    )
