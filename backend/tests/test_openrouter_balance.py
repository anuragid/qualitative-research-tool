"""Unit tests for app.services.openrouter_balance.

Cover the contract documented in `docs/byok-balance-contract.md`:
- /auth/key + /credits merged into BalanceInfo
- has_credits derivation handles all four states (healthy, low,
  drained, capped)
- 60s cache TTL with stale-on-error fallback
- Malformed responses raise OpenRouterBalanceError instead of
  silently producing garbage
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from unittest.mock import MagicMock, patch

import httpx
import pytest

from app.services.openrouter_balance import (
    BalanceInfo,
    OpenRouterBalanceError,
    fetch_balance_sync,
    get_cached_balance,
    refresh_and_persist,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Verified live response shapes from 2026-04-06 Phase 0 spike.
HEALTHY_AUTH_KEY = {
    "data": {
        "label": "sk-or-v1-313...880",
        "is_management_key": False,
        "is_provisioning_key": False,
        "limit": None,
        "limit_remaining": None,
        "is_free_tier": False,
        "usage": 0.645181061,
    }
}

HEALTHY_CREDITS = {"data": {"total_credits": 10.0, "total_usage": 0.645181061}}

CAPPED_AUTH_KEY = {
    "data": {
        "label": "sk-or-v1-cap...end",
        "limit": 5.0,
        "limit_remaining": 3.5,
        "is_free_tier": False,
    }
}

DRAINED_KEY_AUTH = {
    "data": {
        "label": "sk-or-v1-drn...zzz",
        "limit": 5.0,
        "limit_remaining": 0.0,
        "is_free_tier": False,
    }
}

FREE_TIER_AUTH = {
    "data": {
        "label": "sk-or-v1-free...000",
        "limit": None,
        "limit_remaining": None,
        "is_free_tier": True,
    }
}

ZERO_CREDITS = {"data": {"total_credits": 10.0, "total_usage": 10.0}}
EMPTY_FREE_CREDITS = {"data": {"total_credits": 0.0, "total_usage": 0.0}}


def _mock_responses(auth_payload: Any, credits_payload: Any, status: int = 200):
    """Build a side_effect list of httpx.Response objects in call order.

    Order matters: fetch_balance_sync calls /auth/key first, /credits second.
    """
    auth_resp = MagicMock(spec=httpx.Response)
    auth_resp.status_code = status
    auth_resp.json.return_value = auth_payload
    auth_resp.text = "" if status == 200 else "auth error body"

    credits_resp = MagicMock(spec=httpx.Response)
    credits_resp.status_code = status
    credits_resp.json.return_value = credits_payload
    credits_resp.text = "" if status == 200 else "credits error body"

    return [auth_resp, credits_resp]


def _patch_httpx_client(*, get_side_effect):
    """Patch httpx.Client used inside openrouter_balance.

    Returns the patcher so the caller can use it as a context manager.
    """
    client_instance = MagicMock()
    client_instance.get.side_effect = get_side_effect
    cm = MagicMock()
    cm.__enter__.return_value = client_instance
    cm.__exit__.return_value = None
    return patch(
        "app.services.openrouter_balance.httpx.Client",
        return_value=cm,
    )


# ---------------------------------------------------------------------------
# fetch_balance_sync — happy paths
# ---------------------------------------------------------------------------


class TestFetchBalanceSync:
    def test_pay_as_you_go_healthy_returns_has_credits_true(self):
        """Methodex shared key shape: limit=null, balance > 0 → has_credits."""
        responses = _mock_responses(HEALTHY_AUTH_KEY, HEALTHY_CREDITS)
        with _patch_httpx_client(get_side_effect=responses):
            balance = fetch_balance_sync("sk-or-v1-test")

        assert balance.has_credits is True
        assert balance.total_credits == 10.0
        assert balance.total_usage == pytest.approx(0.645181061)
        assert balance.balance_remaining == pytest.approx(10.0 - 0.645181061)
        assert balance.is_free_tier is False
        assert balance.key_label == "sk-or-v1-313...880"
        assert balance.key_limit is None
        assert balance.key_limit_remaining is None
        assert balance.stale is False
        assert isinstance(balance.checked_at, datetime)

    def test_capped_key_with_remaining_credits_returns_has_credits_true(self):
        """A per-key cap with remaining > 0 plus account credits → has_credits."""
        responses = _mock_responses(CAPPED_AUTH_KEY, HEALTHY_CREDITS)
        with _patch_httpx_client(get_side_effect=responses):
            balance = fetch_balance_sync("sk-or-v1-test")
        assert balance.has_credits is True
        assert balance.key_limit == 5.0
        assert balance.key_limit_remaining == 3.5

    def test_account_drained_returns_has_credits_false(self):
        """total_credits == total_usage → has_credits=False even if cap is null."""
        responses = _mock_responses(HEALTHY_AUTH_KEY, ZERO_CREDITS)
        with _patch_httpx_client(get_side_effect=responses):
            balance = fetch_balance_sync("sk-or-v1-test")
        assert balance.has_credits is False
        assert balance.balance_remaining == 0.0

    def test_free_tier_with_zero_credits_returns_has_credits_false(self):
        """Free-tier accounts with no allotment → has_credits=False."""
        responses = _mock_responses(FREE_TIER_AUTH, EMPTY_FREE_CREDITS)
        with _patch_httpx_client(get_side_effect=responses):
            balance = fetch_balance_sync("sk-or-v1-test")
        assert balance.has_credits is False
        assert balance.is_free_tier is True

    def test_per_key_cap_drained_returns_has_credits_false(self):
        """Account has credits but per-key cap is exhausted → still no spend."""
        responses = _mock_responses(DRAINED_KEY_AUTH, HEALTHY_CREDITS)
        with _patch_httpx_client(get_side_effect=responses):
            balance = fetch_balance_sync("sk-or-v1-test")
        assert balance.has_credits is False
        assert balance.balance_remaining > 0  # account-level still has money
        assert balance.key_limit_remaining == 0.0

    # ----- failure modes -----

    def test_http_503_raises(self):
        responses = _mock_responses(HEALTHY_AUTH_KEY, HEALTHY_CREDITS, status=503)
        with _patch_httpx_client(get_side_effect=responses):
            with pytest.raises(OpenRouterBalanceError):
                fetch_balance_sync("sk-or-v1-test")

    def test_transport_error_raises(self):
        def raise_transport_error(*args, **kwargs):
            raise httpx.ConnectError("dns failure")

        with _patch_httpx_client(get_side_effect=raise_transport_error):
            with pytest.raises(OpenRouterBalanceError):
                fetch_balance_sync("sk-or-v1-test")

    def test_malformed_empty_object_raises(self):
        responses = _mock_responses({}, HEALTHY_CREDITS)
        with _patch_httpx_client(get_side_effect=responses):
            with pytest.raises(OpenRouterBalanceError):
                fetch_balance_sync("sk-or-v1-test")

    def test_malformed_data_null_raises(self):
        responses = _mock_responses({"data": None}, HEALTHY_CREDITS)
        with _patch_httpx_client(get_side_effect=responses):
            with pytest.raises(OpenRouterBalanceError):
                fetch_balance_sync("sk-or-v1-test")

    def test_malformed_string_in_limit_remaining_raises(self):
        bad = {
            "data": {
                "label": "sk-or-v1-x",
                "is_free_tier": False,
                "limit": None,
                "limit_remaining": "unlimited",
            }
        }
        responses = _mock_responses(bad, HEALTHY_CREDITS)
        with _patch_httpx_client(get_side_effect=responses):
            with pytest.raises(OpenRouterBalanceError):
                fetch_balance_sync("sk-or-v1-test")

    def test_credits_missing_total_credits_raises(self):
        responses = _mock_responses(
            HEALTHY_AUTH_KEY, {"data": {"total_usage": 1.0}}
        )
        with _patch_httpx_client(get_side_effect=responses):
            with pytest.raises(OpenRouterBalanceError):
                fetch_balance_sync("sk-or-v1-test")

    def test_invalid_json_raises(self):
        auth_resp = MagicMock(spec=httpx.Response)
        auth_resp.status_code = 200
        auth_resp.json.side_effect = ValueError("not json")
        auth_resp.text = "not json"
        credits_resp = MagicMock(spec=httpx.Response)
        credits_resp.status_code = 200
        credits_resp.json.return_value = HEALTHY_CREDITS
        credits_resp.text = ""
        with _patch_httpx_client(get_side_effect=[auth_resp, credits_resp]):
            with pytest.raises(OpenRouterBalanceError):
                fetch_balance_sync("sk-or-v1-test")


# ---------------------------------------------------------------------------
# refresh_and_persist + caching — uses a fake user object
# ---------------------------------------------------------------------------


class _FakeUser:
    """Stand-in for User SQLAlchemy model with the columns we touch."""

    def __init__(self, **kwargs):
        self.id = kwargs.get("id", "user_test")
        self.encrypted_api_key = kwargs.get("encrypted_api_key", "ciphertext")
        self.key_hint = kwargs.get("key_hint", "test")
        self.key_total_credits = kwargs.get("key_total_credits")
        self.key_total_usage = kwargs.get("key_total_usage")
        self.key_limit = kwargs.get("key_limit")
        self.key_limit_remaining = kwargs.get("key_limit_remaining")
        self.key_is_free_tier = kwargs.get("key_is_free_tier")
        self.key_balance_checked_at = kwargs.get("key_balance_checked_at")
        self.key_balance_error = kwargs.get("key_balance_error")


@pytest.fixture
def db_session():
    db = MagicMock()
    db.commit = MagicMock()
    return db


@pytest.fixture
def patched_decrypt():
    """Make encryption_service.decrypt return a known plaintext."""
    with patch(
        "app.services.openrouter_balance._decrypt_user_api_key",
        return_value="sk-or-v1-test",
    ) as p:
        yield p


class TestRefreshAndPersist:
    def test_persists_balance_fields_on_user(self, db_session, patched_decrypt):
        responses = _mock_responses(HEALTHY_AUTH_KEY, HEALTHY_CREDITS)
        user = _FakeUser()
        with _patch_httpx_client(get_side_effect=responses):
            balance = refresh_and_persist(db_session, user)

        assert user.key_total_credits == 10.0
        assert user.key_total_usage == pytest.approx(0.645181061)
        assert user.key_is_free_tier is False
        assert user.key_balance_checked_at is not None
        assert user.key_balance_error is None
        assert balance.has_credits is True
        assert db_session.commit.called

    def test_records_error_on_failure_and_reraises(self, db_session, patched_decrypt):
        responses = _mock_responses(HEALTHY_AUTH_KEY, HEALTHY_CREDITS, status=503)
        user = _FakeUser()
        with _patch_httpx_client(get_side_effect=responses):
            with pytest.raises(OpenRouterBalanceError):
                refresh_and_persist(db_session, user)
        assert user.key_balance_error is not None
        assert "503" in user.key_balance_error
        # The error path also commits — we want the error visible.
        assert db_session.commit.called

    def test_no_byok_key_raises(self, db_session):
        with patch(
            "app.services.openrouter_balance._decrypt_user_api_key",
            return_value=None,
        ):
            user = _FakeUser(encrypted_api_key=None)
            with pytest.raises(OpenRouterBalanceError):
                refresh_and_persist(db_session, user)


class TestGetCachedBalance:
    def test_returns_none_when_no_byok_key(self, db_session):
        user = _FakeUser(encrypted_api_key=None)
        assert get_cached_balance(db_session, user) is None

    def test_cache_hit_within_ttl_does_no_http_call(self, db_session, patched_decrypt):
        # Persisted, freshly checked
        user = _FakeUser(
            key_total_credits=10.0,
            key_total_usage=2.0,
            key_limit=None,
            key_limit_remaining=None,
            key_is_free_tier=False,
            key_balance_checked_at=datetime.now(timezone.utc) - timedelta(seconds=5),
        )
        with patch(
            "app.services.openrouter_balance.fetch_balance_sync"
        ) as fetch_mock:
            balance = get_cached_balance(db_session, user, max_age_seconds=60)
            fetch_mock.assert_not_called()
        assert balance is not None
        assert balance.balance_remaining == 8.0
        assert balance.stale is False

    def test_cache_miss_after_ttl_triggers_refresh(self, db_session, patched_decrypt):
        user = _FakeUser(
            key_total_credits=10.0,
            key_total_usage=2.0,
            key_limit=None,
            key_limit_remaining=None,
            key_is_free_tier=False,
            key_balance_checked_at=datetime.now(timezone.utc) - timedelta(seconds=300),
        )
        responses = _mock_responses(HEALTHY_AUTH_KEY, HEALTHY_CREDITS)
        with _patch_httpx_client(get_side_effect=responses):
            balance = get_cached_balance(db_session, user, max_age_seconds=60)

        assert balance is not None
        assert balance.stale is False
        # The user row should now reflect the freshly fetched values
        assert user.key_total_credits == 10.0
        assert user.key_total_usage == pytest.approx(0.645181061)

    def test_force_refresh_ignores_fresh_cache(self, db_session, patched_decrypt):
        user = _FakeUser(
            key_total_credits=10.0,
            key_total_usage=2.0,
            key_limit=None,
            key_limit_remaining=None,
            key_is_free_tier=False,
            key_balance_checked_at=datetime.now(timezone.utc),
        )
        responses = _mock_responses(HEALTHY_AUTH_KEY, HEALTHY_CREDITS)
        with _patch_httpx_client(get_side_effect=responses):
            balance = get_cached_balance(db_session, user, max_age_seconds=0)
        assert balance is not None
        # Confirms the live fetch happened — the response shape uses 0.6451 usage
        assert user.key_total_usage == pytest.approx(0.645181061)

    def test_openrouter_unreachable_returns_stale_cache(
        self, db_session, patched_decrypt
    ):
        cached_at = datetime.now(timezone.utc) - timedelta(minutes=5)
        user = _FakeUser(
            key_total_credits=10.0,
            key_total_usage=2.0,
            key_limit=None,
            key_limit_remaining=None,
            key_is_free_tier=False,
            key_balance_checked_at=cached_at,
        )
        responses = _mock_responses(HEALTHY_AUTH_KEY, HEALTHY_CREDITS, status=503)
        with _patch_httpx_client(get_side_effect=responses):
            balance = get_cached_balance(db_session, user, max_age_seconds=60)
        assert balance is not None
        assert balance.stale is True
        assert balance.balance_remaining == 8.0  # cached value, not refreshed
        # And the error should be persisted on the row
        assert user.key_balance_error is not None

    def test_openrouter_unreachable_with_no_cache_returns_none(
        self, db_session, patched_decrypt
    ):
        user = _FakeUser(
            key_total_credits=None,
            key_total_usage=None,
            key_balance_checked_at=None,
        )
        responses = _mock_responses(HEALTHY_AUTH_KEY, HEALTHY_CREDITS, status=503)
        with _patch_httpx_client(get_side_effect=responses):
            balance = get_cached_balance(db_session, user, max_age_seconds=60)
        assert balance is None


# ---------------------------------------------------------------------------
# BalanceInfo.as_dict shape lock — frontend depends on this exact JSON
# ---------------------------------------------------------------------------


class TestAsDict:
    def test_field_set_and_types(self):
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
        d = b.as_dict()
        assert set(d.keys()) == {
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
        assert d["checked_at"] == "2026-04-06T22:00:00+00:00"
        assert d["has_credits"] is True
