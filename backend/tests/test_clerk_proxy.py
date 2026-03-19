"""Tests for Clerk proxy path and header whitelisting.

Covers finding: P1-3
"""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import _CLERK_PROXY_ALLOWED_HEADERS, _CLERK_PROXY_ALLOWED_PATHS, app


class TestClerkProxyWhitelists:
    def test_allowed_paths_whitelist(self):
        """P1-3: Only v1/client and v1/environment paths should be allowed."""
        assert "v1/client" in _CLERK_PROXY_ALLOWED_PATHS
        assert "v1/environment" in _CLERK_PROXY_ALLOWED_PATHS
        assert len(_CLERK_PROXY_ALLOWED_PATHS) == 2

    def test_dangerous_paths_not_allowed(self):
        """P1-3: Admin/sensitive paths should NOT be in the whitelist."""
        assert "v1/users" not in _CLERK_PROXY_ALLOWED_PATHS
        assert "v1/organizations" not in _CLERK_PROXY_ALLOWED_PATHS
        assert "v1/sessions" not in _CLERK_PROXY_ALLOWED_PATHS
        assert "v1/invitations" not in _CLERK_PROXY_ALLOWED_PATHS

    def test_allowed_headers_whitelist(self):
        """P1-3: Only safe headers should be forwarded."""
        assert "content-type" in _CLERK_PROXY_ALLOWED_HEADERS
        assert "accept" in _CLERK_PROXY_ALLOWED_HEADERS
        assert "user-agent" in _CLERK_PROXY_ALLOWED_HEADERS

    def test_sensitive_headers_not_forwarded(self):
        """P1-3: Sensitive headers should NOT be in the forwarding whitelist."""
        assert "authorization" not in _CLERK_PROXY_ALLOWED_HEADERS
        assert "cookie" not in _CLERK_PROXY_ALLOWED_HEADERS
        assert "set-cookie" not in _CLERK_PROXY_ALLOWED_HEADERS
        assert "x-api-key" not in _CLERK_PROXY_ALLOWED_HEADERS


class TestClerkProxyEndpoints:
    @pytest.mark.asyncio
    async def test_unauthorized_path_returns_404(self):
        """P1-3: Non-whitelisted paths should return 404."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/__clerk_fwd/v1/users",
                headers={"origin": "http://localhost:5173"},
            )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_no_origin_returns_403(self):
        """Clerk proxy should reject requests without valid origin."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/__clerk_fwd/v1/client")
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_evil_origin_returns_403(self):
        """Clerk proxy should reject requests from unknown origins."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/__clerk_fwd/v1/client",
                headers={"origin": "https://evil.com"},
            )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_admin_path_with_valid_origin_still_404(self):
        """Even with valid origin, non-whitelisted paths return 404."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/__clerk_fwd/v1/organizations",
                headers={"origin": "http://localhost:5173"},
            )
        assert response.status_code == 404
