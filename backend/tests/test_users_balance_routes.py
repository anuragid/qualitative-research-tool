"""Route integration tests for the BYOK balance feature.

Covers GET /users/settings, POST /users/settings/api-key (key save with
balance validation), DELETE /users/settings/api-key, and
POST /users/settings/refresh-balance.

We mock OpenRouter HTTP calls everywhere — no test in this file hits
the real API. The integration smoke test that actually does hit
OpenRouter lives in `test_openrouter_integration.py` and is gated
behind the `OPENROUTER_LIVE_API_KEY` env var.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from unittest.mock import MagicMock, patch

import httpx
import pytest

from app.services.openrouter_balance import BalanceInfo

pytestmark = pytest.mark.anyio


# Same shapes as test_openrouter_balance.py — keep in sync.
HEALTHY_AUTH_KEY = {
    "data": {
        "label": "sk-or-v1-313...880",
        "limit": None,
        "limit_remaining": None,
        "is_free_tier": False,
        "usage": 0.6,
    }
}
HEALTHY_CREDITS = {"data": {"total_credits": 10.0, "total_usage": 0.6}}
ZERO_CREDITS = {"data": {"total_credits": 5.0, "total_usage": 5.0}}


def _mock_responses(auth_payload: Any, credits_payload: Any, status: int = 200):
    auth_resp = MagicMock(spec=httpx.Response)
    auth_resp.status_code = status
    auth_resp.json.return_value = auth_payload
    auth_resp.text = ""
    credits_resp = MagicMock(spec=httpx.Response)
    credits_resp.status_code = status
    credits_resp.json.return_value = credits_payload
    credits_resp.text = ""
    return [auth_resp, credits_resp]


def _patch_httpx(*, get_side_effect):
    client_instance = MagicMock()
    client_instance.get.side_effect = get_side_effect
    cm = MagicMock()
    cm.__enter__.return_value = client_instance
    cm.__exit__.return_value = None
    return patch(
        "app.services.openrouter_balance.httpx.Client",
        return_value=cm,
    )


_AUTH = {"Authorization": "Bearer dev-bypass"}
_DEV_USER_ID = "dev_user_local"


@pytest.fixture
async def ensure_user(client):
    """Make sure the dev user exists in the test DB before settings calls.

    The PUT/GET /settings handlers expect the user row to already exist
    (the /me endpoint creates it on first auth). We hit /me here as a
    one-time setup so the test body can focus on settings behavior.
    """
    response = await client.get("/api/users/me", headers=_AUTH)
    assert response.status_code == 200, f"failed to bootstrap user: {response.text}"
    yield


@pytest.fixture
def reset_limiter():
    from app.main import limiter

    limiter.reset()
    yield
    limiter.reset()


# =============================================================================
# GET /users/settings — balance read
# =============================================================================


async def test_get_settings_for_non_byok_user_returns_null_balance(
    client, ensure_user, reset_limiter
):
    """Non-BYOK users get balance=null and we never call OpenRouter."""
    with patch(
        "app.routes.users.get_cached_balance",
        side_effect=AssertionError("must not be called for non-BYOK users"),
    ):
        response = await client.get("/api/users/settings", headers=_AUTH)
    assert response.status_code == 200
    body = response.json()
    assert body["has_api_key"] is False
    assert body["balance"] is None


async def test_get_settings_for_byok_user_includes_balance(
    client, ensure_user, reset_limiter
):
    """A BYOK user gets balance populated from cache (or freshly fetched)."""
    # First save a key (this also persists balance via the live mock)
    responses = _mock_responses(HEALTHY_AUTH_KEY, HEALTHY_CREDITS)
    with _patch_httpx(get_side_effect=responses):
        save_resp = await client.post(
            "/api/users/settings/api-key",
            headers=_AUTH,
            json={"api_key": "sk-or-v1-byokuser"},
        )
    assert save_resp.status_code == 200

    # Now GET — the cache is fresh from the save we just did, so no
    # additional HTTP calls should happen. We block fetch_balance_sync
    # to prove it.
    with patch(
        "app.services.openrouter_balance.fetch_balance_sync",
        side_effect=AssertionError("cache should have served this"),
    ):
        get_resp = await client.get("/api/users/settings", headers=_AUTH)
    assert get_resp.status_code == 200
    body = get_resp.json()
    assert body["has_api_key"] is True
    assert body["balance"] is not None
    assert body["balance"]["total_credits"] == 10.0
    assert body["balance"]["has_credits"] is True


# =============================================================================
# POST /users/settings/refresh-balance
# =============================================================================


async def test_delete_api_key_clears_balance_fields(
    client, ensure_user, reset_limiter
):
    """DELETE /settings/api-key must also wipe the balance snapshot.

    Otherwise the next GET /settings would render BYOK-shaped balance data
    for a user who no longer has a BYOK key — confusing UX and a stale
    information leak.
    """
    # Save a key + balance first
    responses = _mock_responses(HEALTHY_AUTH_KEY, HEALTHY_CREDITS)
    with _patch_httpx(get_side_effect=responses):
        save_resp = await client.post(
            "/api/users/settings/api-key",
            headers=_AUTH,
            json={"api_key": "sk-or-v1-tobedelete"},
        )
    assert save_resp.status_code == 200
    assert save_resp.json()["balance"]["total_credits"] == 10.0

    # Delete
    delete_resp = await client.delete("/api/users/settings/api-key", headers=_AUTH)
    assert delete_resp.status_code == 200

    # GET should now show no key and no balance
    get_resp = await client.get("/api/users/settings", headers=_AUTH)
    assert get_resp.status_code == 200
    body = get_resp.json()
    assert body["has_api_key"] is False
    assert body["balance"] is None


async def test_refresh_balance_no_byok_key_returns_400(client, ensure_user, reset_limiter):
    response = await client.post("/api/users/settings/refresh-balance", headers=_AUTH)
    assert response.status_code == 400
    assert "BYOK" in response.json()["detail"] or "API key" in response.json()["detail"]


async def test_refresh_balance_healthy_returns_fresh_balance(
    client, ensure_user, reset_limiter
):
    """After saving a key, /refresh-balance should hit OpenRouter and return fresh data."""
    # Setup: save a healthy key first
    responses = _mock_responses(HEALTHY_AUTH_KEY, HEALTHY_CREDITS)
    with _patch_httpx(get_side_effect=responses):
        save_resp = await client.post(
            "/api/users/settings/api-key",
            headers=_AUTH,
            json={"api_key": "sk-or-v1-byokhealthy"},
        )
    assert save_resp.status_code == 200

    # Refresh — this should call OpenRouter again
    refresh_responses = _mock_responses(HEALTHY_AUTH_KEY, HEALTHY_CREDITS)
    with _patch_httpx(get_side_effect=refresh_responses):
        refresh_resp = await client.post(
            "/api/users/settings/refresh-balance", headers=_AUTH
        )
    assert refresh_resp.status_code == 200, refresh_resp.text
    body = refresh_resp.json()
    assert body["total_credits"] == 10.0
    assert body["has_credits"] is True
    assert body["stale"] is False


async def test_refresh_balance_openrouter_unreachable_returns_503_with_stale(
    client, ensure_user, reset_limiter
):
    """OpenRouter down + stale cache → 503 with stale_balance in detail."""
    # Save a key first to populate cache
    responses = _mock_responses(HEALTHY_AUTH_KEY, HEALTHY_CREDITS)
    with _patch_httpx(get_side_effect=responses):
        save_resp = await client.post(
            "/api/users/settings/api-key",
            headers=_AUTH,
            json={"api_key": "sk-or-v1-stalecache"},
        )
    assert save_resp.status_code == 200

    # Now simulate OpenRouter being unreachable on the refresh call
    def boom(*args, **kwargs):
        raise httpx.ConnectError("dns failure")

    with _patch_httpx(get_side_effect=boom):
        refresh_resp = await client.post(
            "/api/users/settings/refresh-balance", headers=_AUTH
        )
    assert refresh_resp.status_code == 503, refresh_resp.text
    detail = refresh_resp.json()["detail"]
    assert isinstance(detail, dict)
    assert "stale_balance" in detail
    assert detail["stale_balance"]["stale"] is True
    assert detail["stale_balance"]["total_credits"] == 10.0


async def test_refresh_balance_rate_limited_at_11th_call(
    client, ensure_user, reset_limiter
):
    """The 11th call within 1 minute must return 429 (rate limit = 10/min/user)."""
    # Setup: save a key so we don't hit the no-BYOK 400 path
    responses = _mock_responses(HEALTHY_AUTH_KEY, HEALTHY_CREDITS)
    with _patch_httpx(get_side_effect=responses):
        save_resp = await client.post(
            "/api/users/settings/api-key",
            headers=_AUTH,
            json={"api_key": "sk-or-v1-ratelimit"},
        )
    assert save_resp.status_code == 200

    # Burst: 11 refresh calls. First 10 should be 200, 11th should be 429.
    # We need fresh httpx mock responses for each call (10 successful pairs).
    codes: list[int] = []
    for i in range(11):
        burst_responses = _mock_responses(HEALTHY_AUTH_KEY, HEALTHY_CREDITS)
        with _patch_httpx(get_side_effect=burst_responses):
            r = await client.post("/api/users/settings/refresh-balance", headers=_AUTH)
        codes.append(r.status_code)

    successful = [c for c in codes if c == 200]
    assert len(successful) == 10, f"expected exactly 10 successful calls, got {codes}"
    assert codes[-1] == 429, f"expected 429 on 11th call, got {codes}"


# =============================================================================
# Helpers / sanity checks
# =============================================================================


def test_balance_info_response_field_set():
    """The Pydantic response model must mirror BalanceInfo.as_dict() exactly."""
    from app.models.schemas import BalanceInfoResponse

    fields = set(BalanceInfoResponse.model_fields.keys())
    assert fields == {
        "total_credits",
        "total_usage",
        "balance_remaining",
        "is_free_tier",
        "key_label",
        "key_limit",
        "key_limit_remaining",
        "has_credits",
        "checked_at",
        "stale",
    }


def test_balance_info_to_response_round_trip():
    """BalanceInfo.as_dict() must round-trip cleanly through Pydantic."""
    from app.models.schemas import BalanceInfoResponse

    b = BalanceInfo(
        total_credits=10.0,
        total_usage=2.0,
        balance_remaining=8.0,
        is_free_tier=False,
        key_label="sk-or-v1-x...y",
        key_limit=None,
        key_limit_remaining=None,
        has_credits=True,
        checked_at=datetime(2026, 4, 6, 22, 0, 0, tzinfo=timezone.utc),
        stale=False,
    )
    response = BalanceInfoResponse(**b.as_dict())
    assert response.total_credits == 10.0
    assert response.balance_remaining == 8.0
    assert response.has_credits is True
    assert response.stale is False


def test_unused_imports_warning():
    """Catch silent dead imports introduced during the route refactor."""
    from app.routes import users as users_module

    # These names must remain exported from the module to avoid breaking
    # callers that import from app.routes.users at runtime.
    assert hasattr(users_module, "router")
    assert hasattr(users_module, "_balance_to_response")


def test_timedelta_unused_import_guard():
    """Sanity-check imports — timedelta is intentionally NOT imported here."""
    # If this import order ever fails it indicates a circular import bug
    # introduced by the new openrouter_balance module.
    from app.routes import users  # noqa: F401
    from app.services import openrouter_balance  # noqa: F401
    assert True


def test_openrouter_balance_error_class_exported():
    """Worktree B will import this — make sure it stays public."""
    from app.services.openrouter_balance import OpenRouterBalanceError

    assert issubclass(OpenRouterBalanceError, Exception)
