"""AST-based invariant test: route handler & dependency async/sync hygiene.

Locks the invariants introduced by perf/sync-def-threadpool-routes:

1. No ``async def`` route handler may be missing an ``await`` in its body
   (that would block the event loop with no benefit — the missed perf
   win is the same as the original bug).

2. No plain ``def`` route handler may contain an ``await`` expression
   (Python would raise SyntaxError anyway, but this makes the constraint
   explicit and documents the intent).

A "route handler" is any function decorated with ``@router.<method>`` or
``@app.<method>`` / ``@app.api_route``.

3. (Added by perf/byok-gate-sync-def) No FastAPI **dependency** function in
   ``app/dependencies/*.py`` may be ``async def`` with no ``await`` in its
   body. FastAPI runs ``async def`` dependencies directly on the event loop
   and only offloads plain ``def`` dependencies to the threadpool — so an
   ``async def`` dependency that performs blocking sync I/O (DB query, sync
   ``httpx``) stalls the WHOLE event loop. PR #50's route-handler scan
   EXPLICITLY EXCLUDED dependency functions, which is how the
   ``require_byok_credits`` stall (audit R1) slipped through. This sibling
   scan closes that gap.

A "dependency function" is scoped narrowly to module-level functions in
``app/dependencies/*.py`` that take at least one parameter whose default is
a ``Depends(...)`` call — the structural hallmark of a FastAPI dependency
that injects sub-dependencies and does I/O. Arbitrary async helpers that are
legitimately awaited elsewhere have no ``Depends(...)`` parameter and are
therefore not flagged.
"""

import ast
import pathlib
from typing import Sequence

import pytest

# Files to scan — routes/*.py and main.py
_ROUTE_FILES: Sequence[pathlib.Path] = [
    *pathlib.Path(__file__).parents[1].glob("app/routes/*.py"),
    pathlib.Path(__file__).parents[1] / "app" / "main.py",
]

# Files to scan for FastAPI dependency functions.
_DEPENDENCY_FILES: Sequence[pathlib.Path] = [
    *pathlib.Path(__file__).parents[1].glob("app/dependencies/*.py"),
]

_ROUTE_ATTRS = {"get", "post", "put", "patch", "delete", "api_route"}


def _is_route_handler(node: ast.FunctionDef | ast.AsyncFunctionDef) -> bool:
    """Return True if the function carries a FastAPI route decorator."""
    for d in node.decorator_list:
        # @router.get(...) or @app.post(...) etc.
        if isinstance(d, ast.Call) and isinstance(d.func, ast.Attribute):
            if d.func.attr in _ROUTE_ATTRS:
                return True
        # bare @router.get (no call args — rare but legal for simple routes)
        if isinstance(d, ast.Attribute) and d.attr in _ROUTE_ATTRS:
            return True
    return False


def _has_await(node: ast.AST) -> bool:
    return any(isinstance(n, ast.Await) for n in ast.walk(node))


def _collect_handlers(path: pathlib.Path):
    """Return (sync_handlers, async_handlers) lists of function nodes."""
    tree = ast.parse(path.read_text())
    sync_handlers = []
    async_handlers = []
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and _is_route_handler(node):
            sync_handlers.append((path, node))
        elif isinstance(node, ast.AsyncFunctionDef) and _is_route_handler(node):
            async_handlers.append((path, node))
    return sync_handlers, async_handlers


@pytest.fixture(scope="module")
def all_handlers():
    sync_all, async_all = [], []
    for path in _ROUTE_FILES:
        if not path.exists():
            continue
        s, a = _collect_handlers(path)
        sync_all.extend(s)
        async_all.extend(a)
    return sync_all, async_all


def test_no_await_in_sync_def_handlers(all_handlers):
    """Plain ``def`` route handlers must not contain ``await``."""
    sync_handlers, _ = all_handlers
    violations = [
        f"{path.name}:{node.lineno} def {node.name}"
        for path, node in sync_handlers
        if _has_await(node)
    ]
    assert not violations, (
        "The following plain def route handlers contain 'await' — "
        "this would be a Python SyntaxError at import time, but listing "
        "them here makes the intent explicit.\n"
        + "\n".join(f"  {v}" for v in violations)
    )


def test_all_async_def_handlers_have_await(all_handlers):
    """Every ``async def`` route handler must use at least one ``await``.

    An async def handler with no await runs on the event loop and blocks
    it for the duration of any synchronous DB call — exactly the bug this
    PR fixes.  Any handler that passes this check was intentionally left
    async because it performs real async I/O.
    """
    _, async_handlers = all_handlers
    violations = [
        f"{path.name}:{node.lineno} async def {node.name}"
        for path, node in async_handlers
        if not _has_await(node)
    ]
    assert not violations, (
        "The following async def route handlers have no 'await' — "
        "they block the event loop without benefit. Convert them to "
        "plain 'def' so FastAPI offloads them to the threadpool.\n"
        + "\n".join(f"  {v}" for v in violations)
    )


# ---------------------------------------------------------------------------
# Invariant 3: FastAPI dependency functions (app/dependencies/*.py)
# ---------------------------------------------------------------------------


def _has_depends_default(node: ast.FunctionDef | ast.AsyncFunctionDef) -> bool:
    """Return True if any parameter default is a ``Depends(...)`` call.

    This is the structural signature of a FastAPI dependency that injects
    sub-dependencies (and, in our codebase, does blocking I/O). We use it to
    distinguish real dependency providers from arbitrary async helpers that
    happen to live in the dependencies package and are awaited elsewhere —
    those have no ``Depends(...)`` parameter and must NOT be flagged.
    """
    for default in node.args.defaults + node.args.kw_defaults:
        if default is None:
            continue
        if isinstance(default, ast.Call):
            func = default.func
            # Depends(...) or fastapi.Depends(...) / params.Depends(...)
            if isinstance(func, ast.Name) and func.id == "Depends":
                return True
            if isinstance(func, ast.Attribute) and func.attr == "Depends":
                return True
    return False


def _collect_dependencies(path: pathlib.Path):
    """Return (sync_deps, async_deps) lists of dependency function nodes.

    Only module-level functions (direct children of the module body) with a
    ``Depends(...)`` parameter default are considered dependency functions.
    """
    tree = ast.parse(path.read_text())
    sync_deps = []
    async_deps = []
    for node in tree.body:  # module-level only — no nested helpers
        if isinstance(node, ast.FunctionDef) and _has_depends_default(node):
            sync_deps.append((path, node))
        elif isinstance(node, ast.AsyncFunctionDef) and _has_depends_default(node):
            async_deps.append((path, node))
    return sync_deps, async_deps


@pytest.fixture(scope="module")
def all_dependencies():
    sync_all, async_all = [], []
    for path in _DEPENDENCY_FILES:
        if not path.exists():
            continue
        s, a = _collect_dependencies(path)
        sync_all.extend(s)
        async_all.extend(a)
    return sync_all, async_all


def test_dependency_files_are_scanned(all_dependencies):
    """Guard against the scan silently matching nothing.

    If the glob breaks or every dependency loses its ``Depends(...)`` default,
    the async-without-await check below would vacuously pass. Require that at
    least one Depends-injected dependency function is found so the invariant
    can never go dark.
    """
    sync_deps, async_deps = all_dependencies
    assert (sync_deps or async_deps), (
        "No FastAPI dependency functions (Depends-injected) were found in "
        f"{[str(p) for p in _DEPENDENCY_FILES]}. The async-without-await "
        "dependency invariant would be vacuously green — check the glob / "
        "the _has_depends_default heuristic."
    )


def test_all_async_def_dependencies_have_await(all_dependencies):
    """Every ``async def`` FastAPI dependency must use at least one ``await``.

    FastAPI runs ``async def`` dependencies directly on the event loop; only
    plain ``def`` dependencies are offloaded to the threadpool. An async def
    dependency with no await therefore blocks the event loop for the duration
    of any synchronous DB call or blocking ``httpx`` request inside it — the
    exact stall (audit R1, ``require_byok_credits``) that PR #50's
    route-handler-only scan could not catch.

    This test FAILS if ``require_byok_credits`` (or any other Depends-injected
    dependency) is reverted to ``async def`` without an ``await``.
    """
    _, async_deps = all_dependencies
    violations = [
        f"{path.name}:{node.lineno} async def {node.name}"
        for path, node in async_deps
        if not _has_await(node)
    ]
    assert not violations, (
        "The following async def FastAPI dependencies have no 'await' — "
        "they run on the event loop and block it for the duration of their "
        "blocking sync I/O (DB query / sync httpx). Convert them to plain "
        "'def' so FastAPI offloads them to the threadpool.\n"
        + "\n".join(f"  {v}" for v in violations)
    )


def test_no_await_in_sync_def_dependencies(all_dependencies):
    """Plain ``def`` dependency functions must not contain ``await``.

    Documents intent and mirrors the route-handler rule (a plain def with
    await is a Python SyntaxError at import time anyway).
    """
    sync_deps, _ = all_dependencies
    violations = [
        f"{path.name}:{node.lineno} def {node.name}"
        for path, node in sync_deps
        if _has_await(node)
    ]
    assert not violations, (
        "The following plain def dependency functions contain 'await':\n"
        + "\n".join(f"  {v}" for v in violations)
    )
