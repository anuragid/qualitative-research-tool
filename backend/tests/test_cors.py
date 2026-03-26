"""Tests for CORS configuration.

Ensures the backend accepts preflight requests with headers that
browser integrations (Sentry tracing, etc.) inject automatically.
A CORS preflight failure silently blocks ALL API requests from the
browser — projects won't load, no error is visible in backend logs.
"""

import pytest
from httpx import ASGITransport, AsyncClient

# Use an origin from the default allowed list so the origin check passes
# and we can test the allow_headers behavior in isolation.
TEST_ORIGIN = "http://localhost:5173"


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_cors_preflight_with_sentry_headers():
    """Preflight must accept sentry-trace and baggage headers.

    Sentry's browser SDK injects these on every fetch when
    tracePropagationTargets includes the API domain. If they're
    missing from allow_headers, the browser blocks ALL requests.
    """
    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.options(
            "/api/projects/",
            headers={
                "Origin": TEST_ORIGIN,
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization,content-type,sentry-trace,baggage",
            },
        )

    assert response.status_code == 200, (
        f"CORS preflight rejected sentry-trace/baggage headers (status {response.status_code}). "
        "This will silently block ALL browser API requests when Sentry tracing is enabled."
    )
    allowed = response.headers.get("access-control-allow-headers", "").lower()
    assert "sentry-trace" in allowed
    assert "baggage" in allowed


@pytest.mark.anyio
async def test_cors_preflight_without_sentry_headers():
    """Preflight works for standard headers too (non-Sentry clients)."""
    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.options(
            "/api/projects/",
            headers={
                "Origin": TEST_ORIGIN,
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        )

    assert response.status_code == 200
    allowed = response.headers.get("access-control-allow-headers", "").lower()
    assert "authorization" in allowed
    assert "content-type" in allowed


@pytest.mark.anyio
async def test_cors_preflight_allows_all_required_methods():
    """All CRUD methods must be allowed for the frontend to function."""
    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.options(
            "/api/projects/",
            headers={
                "Origin": TEST_ORIGIN,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization,content-type,sentry-trace,baggage",
            },
        )

    allowed_methods = response.headers.get("access-control-allow-methods", "").upper()
    for method in ["GET", "POST", "PUT", "PATCH", "DELETE"]:
        assert method in allowed_methods, f"{method} not in allowed methods"


def test_sentry_headers_in_cors_config():
    """Guard: sentry-trace and baggage must be in allow_headers.

    This is a static config check — catches the issue even without
    running an HTTP request, so it fails fast in CI.
    """
    from starlette.middleware.cors import CORSMiddleware

    from app.main import app

    for middleware in app.user_middleware:
        if middleware.cls is CORSMiddleware:
            options = middleware.options if hasattr(middleware, "options") else middleware.kwargs
            allow_headers = [h.lower() for h in options.get("allow_headers", [])]
            assert "sentry-trace" in allow_headers, (
                "sentry-trace missing from CORS allow_headers — "
                "Sentry SDK injects this header on every API request. "
                "Without it, ALL browser requests are silently blocked."
            )
            assert "baggage" in allow_headers, (
                "baggage missing from CORS allow_headers — "
                "Sentry SDK injects this header on every API request. "
                "Without it, ALL browser requests are silently blocked."
            )
            return

    pytest.fail("CORSMiddleware not found in app middleware")
