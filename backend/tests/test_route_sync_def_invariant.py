"""AST-based invariant test: route handler async/sync hygiene.

Locks two invariants introduced by perf/sync-def-threadpool-routes:

1. No ``async def`` route handler may be missing an ``await`` in its body
   (that would block the event loop with no benefit — the missed perf
   win is the same as the original bug).

2. No plain ``def`` route handler may contain an ``await`` expression
   (Python would raise SyntaxError anyway, but this makes the constraint
   explicit and documents the intent).

A "route handler" is any function decorated with ``@router.<method>`` or
``@app.<method>`` / ``@app.api_route``.  Middleware, dependency functions,
and helper functions are out of scope.
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
