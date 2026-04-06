"""Tests that expensive endpoints have rate limiting settings and configuration.

Also contains integration-level burst tests that verify ``@limiter.limit``
actually produces 429 responses on the per-step analyze routes and the
Clerk proxy.  The ASGI test transport always sets ``request.client.host``
to ``127.0.0.1`` and the dev-bypass ``Bearer`` token is not a valid JWT,
so ``_get_rate_limit_key`` falls back to the IP — meaning all requests in
a burst share the same rate-limit bucket.  We ``limiter.reset()`` before
and after each burst test so state cannot leak between tests.
"""

import pytest
from httpx import ASGITransport, AsyncClient


@pytest.fixture
def reset_limiter():
    """Clear the in-memory rate-limit storage before and after the test.

    slowapi uses a process-wide in-memory store by default, so bursts in one
    test can poison another test's bucket.  Resetting on both sides keeps
    burst tests isolated from the rest of the suite.
    """
    from app.main import limiter

    limiter.reset()
    yield
    limiter.reset()


def test_rate_limit_transcribe_setting():
    """Config should have transcribe rate limit."""
    from app.config import settings
    assert hasattr(settings, "RATE_LIMIT_TRANSCRIBE")
    assert settings.RATE_LIMIT_TRANSCRIBE == "5/minute"


def test_rate_limit_analyze_setting():
    """Config should have analyze rate limit."""
    from app.config import settings
    assert hasattr(settings, "RATE_LIMIT_ANALYZE")
    assert settings.RATE_LIMIT_ANALYZE == "5/minute"


def test_rate_limit_analyze_step_setting():
    """Config should have per-step analyze rate limit (looser than aggregate)."""
    from app.config import settings
    assert hasattr(settings, "RATE_LIMIT_ANALYZE_STEP")
    assert settings.RATE_LIMIT_ANALYZE_STEP == "10/minute"


def test_transcribe_route_exists():
    """POST /api/videos/{id}/transcribe route should exist."""
    from app.main import app
    paths = [r.path for r in app.routes if hasattr(r, "path")]
    assert "/api/videos/{video_id}/transcribe" in paths


def test_analyze_video_route_exists():
    """POST /api/videos/{id}/analyze route should exist."""
    from app.main import app
    paths = [r.path for r in app.routes if hasattr(r, "path")]
    assert "/api/videos/{video_id}/analyze" in paths


def test_analyze_project_route_exists():
    """POST /api/projects/{id}/analyze route should exist."""
    from app.main import app
    paths = [r.path for r in app.routes if hasattr(r, "path")]
    assert "/api/projects/{project_id}/analyze" in paths


# -------------------------------------------------------------------------
# Burst tests for per-step analyze routes — verify ``@limiter.limit`` applies.
# Each route is configured with ``RATE_LIMIT_ANALYZE_STEP = "10/minute"``, so
# the 11th consecutive request from the same key should return 429.
# -------------------------------------------------------------------------

_BURST_SIZE = 12
_STEP_LIMIT = 10  # must match settings.RATE_LIMIT_ANALYZE_STEP
_DUMMY_UUID = "00000000-0000-0000-0000-000000000000"
_AUTH = {"Authorization": "Bearer dev-bypass"}


async def _burst_post(path: str, n: int) -> list[int]:
    """Send ``n`` POSTs to ``path`` and return the list of status codes."""
    from app.main import app

    transport = ASGITransport(app=app)
    codes: list[int] = []
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        for _ in range(n):
            r = await ac.post(path, headers=_AUTH)
            codes.append(r.status_code)
    return codes


def _assert_burst_trips_at(codes: list[int], limit: int) -> None:
    """Assert that no 429 appears before ``limit`` and at least one appears at/after."""
    pre = codes[:limit]
    post = codes[limit:]
    assert 429 not in pre, (
        f"rate limit tripped before reaching the limit ({limit}); "
        f"codes before limit: {pre}"
    )
    assert 429 in post, (
        f"rate limit never tripped after {limit} requests; "
        f"codes after limit: {post}"
    )


@pytest.mark.asyncio
async def test_chunk_step_rate_limit(reset_limiter):
    """POST /api/videos/{id}/analyze/chunk should 429 after 10/minute."""
    codes = await _burst_post(
        f"/api/videos/{_DUMMY_UUID}/analyze/chunk", _BURST_SIZE
    )
    _assert_burst_trips_at(codes, _STEP_LIMIT)


@pytest.mark.asyncio
async def test_infer_step_rate_limit(reset_limiter):
    """POST /api/videos/{id}/analyze/infer should 429 after 10/minute."""
    codes = await _burst_post(
        f"/api/videos/{_DUMMY_UUID}/analyze/infer", _BURST_SIZE
    )
    _assert_burst_trips_at(codes, _STEP_LIMIT)


@pytest.mark.asyncio
async def test_relate_step_rate_limit(reset_limiter):
    """POST /api/videos/{id}/analyze/relate should 429 after 10/minute."""
    codes = await _burst_post(
        f"/api/videos/{_DUMMY_UUID}/analyze/relate", _BURST_SIZE
    )
    _assert_burst_trips_at(codes, _STEP_LIMIT)


@pytest.mark.asyncio
async def test_explain_step_rate_limit(reset_limiter):
    """POST /api/videos/{id}/analyze/explain should 429 after 10/minute."""
    codes = await _burst_post(
        f"/api/videos/{_DUMMY_UUID}/analyze/explain", _BURST_SIZE
    )
    _assert_burst_trips_at(codes, _STEP_LIMIT)


@pytest.mark.asyncio
async def test_activate_step_rate_limit(reset_limiter):
    """POST /api/videos/{id}/analyze/activate should 429 after 10/minute."""
    codes = await _burst_post(
        f"/api/videos/{_DUMMY_UUID}/analyze/activate", _BURST_SIZE
    )
    _assert_burst_trips_at(codes, _STEP_LIMIT)


@pytest.mark.asyncio
async def test_clerk_proxy_rate_limit(reset_limiter, monkeypatch):
    """GET /__clerk_fwd/v1/environment should 429 after 30/minute.

    The Clerk proxy requires a valid Origin header; without one it returns
    403 before the limiter can fire.  We send a whitelisted origin so the
    limiter is the thing that trips the 429.  The upstream httpx client is
    patched to avoid hitting the real Clerk API.
    """
    from unittest.mock import AsyncMock

    import httpx

    from app import main as main_module
    from app.main import app

    fake_response = httpx.Response(
        status_code=200,
        content=b'{"ok": true}',
        headers={"content-type": "application/json"},
    )
    monkeypatch.setattr(
        main_module._clerk_client,
        "request",
        AsyncMock(return_value=fake_response),
    )

    transport = ASGITransport(app=app)
    codes: list[int] = []
    headers = {"origin": "http://localhost:5173"}
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        for _ in range(32):
            r = await ac.get("/__clerk_fwd/v1/environment", headers=headers)
            codes.append(r.status_code)

    _assert_burst_trips_at(codes, 30)
