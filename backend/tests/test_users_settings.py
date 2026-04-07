"""Tests for the split user-settings endpoints introduced in 2026-04 redesign.

Fixture notes
-------------
- ``client`` is an async HTTPX client (anyio). All tests must be async.
- Auth uses ``Bearer dev-bypass`` → the dev auth bypass returns ``dev_user_local``.
- ``db_user_factory`` (defined below as a local fixture) seeds the
  ``dev_user_local`` row in the per-test SQLite DB with the caller-supplied
  attributes.  Each test gets an isolated DB from ``conftest.client``'s
  ``tmp_path``, so there is no state leakage between tests.
"""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import patch

import pytest
from fastapi import status

from app.services.openrouter_balance import BalanceInfo, OpenRouterBalanceError

pytestmark = pytest.mark.anyio

_AUTH = {"Authorization": "Bearer dev-bypass"}
_DEV_USER_ID = "dev_user_local"


# ── BalanceInfo helpers ───────────────────────────────────────────────────────
# BalanceInfo is a frozen dataclass; all fields must be supplied explicitly.


def _healthy_balance(api_key: str = "sk-or-v1-test1234") -> BalanceInfo:
    total_credits = 10.0
    total_usage = 1.48
    balance_remaining = total_credits - total_usage
    return BalanceInfo(
        total_credits=total_credits,
        total_usage=total_usage,
        balance_remaining=balance_remaining,
        key_limit=None,
        key_limit_remaining=None,
        is_free_tier=False,
        key_label=f"{api_key[:8]}...{api_key[-4:]}",
        has_credits=True,
        checked_at=datetime(2026, 4, 6, 12, 0, 0, tzinfo=timezone.utc),
        stale=False,
    )


def _empty_balance(api_key: str = "sk-or-v1-empty0") -> BalanceInfo:
    return BalanceInfo(
        total_credits=0.0,
        total_usage=0.0,
        balance_remaining=0.0,
        key_limit=None,
        key_limit_remaining=None,
        is_free_tier=True,
        key_label=f"{api_key[:8]}...{api_key[-4:]}",
        has_credits=False,
        checked_at=datetime(2026, 4, 6, 12, 0, 0, tzinfo=timezone.utc),
        stale=False,
    )


# ── db_user_factory fixture ───────────────────────────────────────────────────


@pytest.fixture
def db_user_factory(client):
    """Factory that seeds the dev_user_local row in the per-test DB.

    Uses the same DB session override that the ``client`` fixture installs
    on the FastAPI app, so the insert lands in the per-test SQLite file.

    Usage::

        user = db_user_factory()                          # no key
        user = db_user_factory(preferred_model="foo/bar")
        user = db_user_factory(encrypted_api_key=b"x", key_hint="abcd")

    Returns the created User ORM object so tests can inspect its id.
    """
    from app.database import get_db
    from app.main import app
    from app.models.database_models import User

    def _factory(
        *,
        encrypted_api_key=None,
        key_hint=None,
        preferred_model=None,
    ):
        # Use the override that ``client`` installed on the app — that's
        # the session pointing at the per-test SQLite file.
        override = app.dependency_overrides.get(get_db, get_db)
        db = next(override())
        try:
            user = User(
                id=_DEV_USER_ID,
                email="dev@example.com",
                role="user",
            )
            if encrypted_api_key is not None:
                user.encrypted_api_key = encrypted_api_key
            if key_hint is not None:
                user.key_hint = key_hint
            if preferred_model is not None:
                user.preferred_model = preferred_model
            db.add(user)
            db.commit()
            db.refresh(user)
            return user
        finally:
            db.close()

    return _factory


# ── POST /settings/api-key ────────────────────────────────────────────────────


class TestPostApiKey:
    async def test_valid_key_with_credits_returns_200(self, client, db_user_factory):
        """Happy path: post a valid key with credits, get the full settings response back."""
        db_user_factory()  # creates dev_user_local with no key
        with patch(
            "app.routes.users.fetch_balance_sync",
            return_value=_healthy_balance("sk-or-v1-test1234"),
        ):
            response = await client.post(
                "/api/users/settings/api-key",
                json={"api_key": "sk-or-v1-test1234"},
                headers=_AUTH,
            )

        assert response.status_code == status.HTTP_200_OK
        body = response.json()
        assert body["has_api_key"] is True
        assert body["key_hint"] == "1234"
        assert body["balance"]["balance_remaining"] == pytest.approx(8.52)
        assert body["balance"]["has_credits"] is True
        # The endpoint must NOT touch preferred_model
        assert body["preferred_model"] is None

    async def test_zero_credit_key_returns_400(self, client, db_user_factory):
        """The Baffour Adu case: brand-new key with $0 → reject before saving."""
        db_user_factory()
        with patch(
            "app.routes.users.fetch_balance_sync",
            return_value=_empty_balance("sk-or-v1-zerox0"),
        ):
            response = await client.post(
                "/api/users/settings/api-key",
                json={"api_key": "sk-or-v1-zerox0"},
                headers=_AUTH,
            )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "$0 credits" in response.json()["detail"]

        # Verify the key was NOT persisted — use the same override the client uses
        from app.database import get_db
        from app.main import app
        from app.models.database_models import User

        override = app.dependency_overrides.get(get_db, get_db)
        db = next(override())
        try:
            refreshed = db.query(User).filter(User.id == _DEV_USER_ID).first()
            assert refreshed.encrypted_api_key is None
        finally:
            db.close()

    async def test_unreachable_openrouter_returns_400(self, client, db_user_factory):
        """fetch_balance_sync raises → 400 with 'invalid or unreachable'."""
        db_user_factory()
        with patch(
            "app.routes.users.fetch_balance_sync",
            side_effect=OpenRouterBalanceError("upstream timeout"),
        ):
            response = await client.post(
                "/api/users/settings/api-key",
                json={"api_key": "sk-or-v1-broken1"},
                headers=_AUTH,
            )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "invalid api key or openrouter is temporarily unreachable" in (
            response.json()["detail"].lower()
        )

    async def test_replacing_existing_key_overwrites_hint(self, client, db_user_factory):
        """Replacing an existing key saves the new hint and discards the old one."""
        db_user_factory(
            encrypted_api_key=b"old-encrypted",
            key_hint="oldA",
        )
        with patch(
            "app.routes.users.fetch_balance_sync",
            return_value=_healthy_balance("sk-or-v1-newx5678"),
        ):
            response = await client.post(
                "/api/users/settings/api-key",
                json={"api_key": "sk-or-v1-newx5678"},
                headers=_AUTH,
            )
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["key_hint"] == "5678"

    async def test_does_not_touch_preferred_model(self, client, db_user_factory):
        """Even if a saved standard model exists, this endpoint must leave it alone."""
        db_user_factory(preferred_model="meta-llama/llama-4-scout")
        with patch(
            "app.routes.users.fetch_balance_sync",
            return_value=_healthy_balance(),
        ):
            response = await client.post(
                "/api/users/settings/api-key",
                json={"api_key": "sk-or-v1-test1234"},
                headers=_AUTH,
            )
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["preferred_model"] == "meta-llama/llama-4-scout"

    async def test_blank_key_returns_422(self, client, db_user_factory):
        """Whitespace-only key is rejected by schema validation before hitting the route."""
        db_user_factory()
        response = await client.post(
            "/api/users/settings/api-key",
            json={"api_key": "          "},
            headers=_AUTH,
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


# ── PUT /settings/preferred-model ────────────────────────────────────────


class TestPutPreferredModel:
    async def test_no_key_standard_model_returns_200(self, client, db_user_factory):
        db_user_factory()  # no key
        response = await client.put(
            "/api/users/settings/preferred-model",
            json={"preferred_model": "meta-llama/llama-4-scout"},
            headers=_AUTH,
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["preferred_model"] == "meta-llama/llama-4-scout"

    async def test_no_key_premium_model_returns_403(self, client, db_user_factory):
        db_user_factory()
        response = await client.put(
            "/api/users/settings/preferred-model",
            json={"preferred_model": "anthropic/claude-sonnet-4.6"},
            headers=_AUTH,
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "openrouter api key" in response.json()["detail"].lower()

    async def test_with_key_premium_model_returns_200(
        self, client, db_user_factory
    ):
        db_user_factory(
            encrypted_api_key=b"some-encrypted",
            key_hint="abcd",
        )
        response = await client.put(
            "/api/users/settings/preferred-model",
            json={"preferred_model": "anthropic/claude-sonnet-4.6"},
            headers=_AUTH,
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["preferred_model"] == "anthropic/claude-sonnet-4.6"

    async def test_with_key_standard_model_returns_200(
        self, client, db_user_factory
    ):
        """A BYOK user can fall back to a standard model."""
        db_user_factory(
            encrypted_api_key=b"some-encrypted",
            key_hint="abcd",
        )
        response = await client.put(
            "/api/users/settings/preferred-model",
            json={"preferred_model": "deepseek/deepseek-chat-v3-0324"},
            headers=_AUTH,
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["preferred_model"] == "deepseek/deepseek-chat-v3-0324"

    async def test_invalid_format_returns_422(self, client, db_user_factory):
        db_user_factory()
        response = await client.put(
            "/api/users/settings/preferred-model",
            json={"preferred_model": "no-slash-here"},
            headers=_AUTH,
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    async def test_does_not_touch_api_key(self, client, db_user_factory):
        db_user_factory(
            encrypted_api_key=b"keep-me",
            key_hint="zzzz",
        )
        response = await client.put(
            "/api/users/settings/preferred-model",
            json={"preferred_model": "meta-llama/llama-4-scout"},
            headers=_AUTH,
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["has_api_key"] is True
        assert response.json()["key_hint"] == "zzzz"
