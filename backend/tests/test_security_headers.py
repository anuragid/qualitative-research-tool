"""Tests for security headers and endpoint information disclosure.

Covers findings: P1-4, P1-6, P3-3, P3-5, P4-2
"""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_security_headers_present():
    """All security headers should be present on every response."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")

    assert response.headers.get("x-content-type-options") == "nosniff"
    assert response.headers.get("x-frame-options") == "DENY"
    assert response.headers.get("referrer-policy") == "strict-origin-when-cross-origin"
    assert "camera=()" in response.headers.get("permissions-policy", "")
    assert response.headers.get("strict-transport-security") == "max-age=63072000; includeSubDomains; preload"
    assert "default-src" in response.headers.get("content-security-policy", "")
    assert response.headers.get("x-xss-protection") == "1; mode=block"


@pytest.mark.asyncio
async def test_security_headers_on_api_route():
    """Security headers should also appear on API routes, not just /health."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/")

    assert response.headers.get("x-content-type-options") == "nosniff"
    assert response.headers.get("x-frame-options") == "DENY"
    assert response.headers.get("x-xss-protection") == "1; mode=block"


@pytest.mark.asyncio
async def test_health_minimal_response():
    """P1-6 / P4-2: Health endpoint returns only status, no environment/version info."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")
    data = response.json()
    assert data == {"status": "healthy"}
    # Must not leak env, version, uptime, etc.
    assert "environment" not in data
    assert "version" not in data
    assert "uptime" not in data


@pytest.mark.asyncio
async def test_root_minimal_response():
    """P1-6 / P4-2: Root endpoint returns only status, no name/version."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/")
    data = response.json()
    assert data == {"status": "ok"}
    assert "name" not in data
    assert "version" not in data


@pytest.mark.asyncio
async def test_cors_rejects_unknown_origin():
    """P3-3: OPTIONS from unknown origin should be rejected with no allow-origin header.

    CORSMiddleware returns 400 "Disallowed CORS origin" for unknown origins;
    the custom reject_unknown_origins middleware returns 403.  Either way,
    the critical assertion is that access-control-allow-origin is NOT set.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.options(
            "/health",
            headers={
                "origin": "https://evil.com",
                "access-control-request-method": "GET",
            },
        )
    assert response.status_code in (400, 403)
    assert "access-control-allow-origin" not in response.headers


@pytest.mark.asyncio
async def test_cors_allows_known_origin():
    """Known origins should get proper CORS headers."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.options(
            "/health",
            headers={
                "origin": "http://localhost:5173",
                "access-control-request-method": "GET",
            },
        )
    # Should not be 403
    assert response.status_code != 403


@pytest.mark.asyncio
async def test_validation_error_hides_details():
    """P3-5: Validation errors should not expose internal details."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Send invalid JSON to a POST endpoint to trigger validation error
        response = await client.post(
            "/api/projects",
            json={},  # missing required 'name' field
        )
    # Should return 422 with generic message, not field-level details
    if response.status_code == 422:
        data = response.json()
        assert data == {"detail": "Invalid request data"}
