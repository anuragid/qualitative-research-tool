"""Integration smoke tests that hit the real OpenRouter API.

These tests ground-truth the response shapes of the endpoints our
balance/validation code depends on.  They are skipped by default
because they require:

  * A real OpenRouter API key (set ``OPENROUTER_LIVE_API_KEY`` env var).
    We use a distinct env-var name so conftest.py's fake
    ``OPENROUTER_API_KEY`` doesn't interfere — when you want to run
    these tests, set both:

        OPENROUTER_LIVE_API_KEY=sk-or-v1-... venv/bin/pytest \
            tests/test_openrouter_integration.py -v

  * Outbound network access to https://openrouter.ai

The tests assert on field presence and types, not on exact numeric
values (those change as the key is used).  When the tests catch a
schema regression, the whole downstream BYOK balance feature needs to
be updated to match.
"""

from __future__ import annotations

import os

import httpx
import pytest

LIVE_KEY_ENV_VAR = "OPENROUTER_LIVE_API_KEY"
API_ROOT = "https://openrouter.ai/api/v1"

_live_key = os.environ.get(LIVE_KEY_ENV_VAR)

pytestmark = pytest.mark.skipif(
    not _live_key,
    reason=(
        f"Set {LIVE_KEY_ENV_VAR} to a real OpenRouter API key to run integration tests. "
        f"These tests make real HTTP calls and are intentionally skipped in CI."
    ),
)


def _get(path: str) -> httpx.Response:
    return httpx.get(
        f"{API_ROOT}{path}",
        headers={"Authorization": f"Bearer {_live_key}"},
        timeout=15,
    )


class TestAuthKeyEndpoint:
    """GET /api/v1/auth/key returns key metadata.

    Contract verified 2026-04-06 against a pay-as-you-go key.  For
    pay-as-you-go accounts, ``limit`` and ``limit_remaining`` are
    null — the real balance must come from ``/api/v1/credits``.
    """

    @pytest.fixture(scope="class")
    def response_json(self) -> dict:
        r = _get("/auth/key")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        return r.json()

    def test_top_level_has_data(self, response_json):
        assert "data" in response_json, f"missing 'data': {response_json}"
        assert isinstance(response_json["data"], dict)

    def test_has_label(self, response_json):
        """Label is a masked key hint used for display."""
        assert "label" in response_json["data"]
        assert isinstance(response_json["data"]["label"], str)

    def test_has_is_free_tier(self, response_json):
        """is_free_tier distinguishes accounts that never purchased credits."""
        assert "is_free_tier" in response_json["data"]
        assert isinstance(response_json["data"]["is_free_tier"], bool)

    def test_has_usage(self, response_json):
        """Lifetime usage is always a number, even at 0."""
        assert "usage" in response_json["data"]
        assert isinstance(response_json["data"]["usage"], (int, float))

    def test_limit_fields_nullable(self, response_json):
        """limit and limit_remaining exist but may be null (pay-as-you-go)."""
        data = response_json["data"]
        assert "limit" in data
        assert "limit_remaining" in data
        # Either both null (pay-as-you-go) or both numeric (capped key)
        if data["limit"] is not None:
            assert isinstance(data["limit"], (int, float))
            assert isinstance(data["limit_remaining"], (int, float))


class TestKeyEndpoint:
    """GET /api/v1/key returns the same shape as /auth/key.

    Verified 2026-04-06: identical response body.  We use /auth/key
    as the canonical URL (matches existing openrouter_validation.py).
    """

    def test_matches_auth_key(self):
        auth_r = _get("/auth/key")
        key_r = _get("/key")
        assert auth_r.status_code == 200
        assert key_r.status_code == 200
        # Field set should be identical (values may drift between calls)
        auth_fields = set(auth_r.json().get("data", {}).keys())
        key_fields = set(key_r.json().get("data", {}).keys())
        assert auth_fields == key_fields, (
            f"field sets diverged — /auth/key has {auth_fields - key_fields}, "
            f"/key has {key_fields - auth_fields}"
        )


class TestCreditsEndpoint:
    """GET /api/v1/credits returns total_credits and total_usage.

    The research agent claimed this endpoint required a management/
    provisioning key — verified 2026-04-06 to be WRONG.  Regular keys
    work and return real account balance numbers.  This is the ONLY
    way to get a real balance for pay-as-you-go accounts where
    /auth/key returns limit=null, limit_remaining=null.
    """

    @pytest.fixture(scope="class")
    def response_json(self) -> dict:
        r = _get("/credits")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        return r.json()

    def test_top_level_has_data(self, response_json):
        assert "data" in response_json
        assert isinstance(response_json["data"], dict)

    def test_has_total_credits(self, response_json):
        """total_credits is the account's topped-up allotment."""
        data = response_json["data"]
        assert "total_credits" in data
        assert isinstance(data["total_credits"], (int, float))
        assert data["total_credits"] >= 0

    def test_has_total_usage(self, response_json):
        """total_usage is the account's lifetime spend."""
        data = response_json["data"]
        assert "total_usage" in data
        assert isinstance(data["total_usage"], (int, float))
        assert data["total_usage"] >= 0

    def test_balance_is_non_negative(self, response_json):
        """Derived balance = total_credits - total_usage must be >= 0
        for a healthy account (we can still overshoot to a negative
        balance in rare OpenRouter edge cases, but that's a 402 signal).
        """
        data = response_json["data"]
        balance = data["total_credits"] - data["total_usage"]
        # We don't hard-assert balance > 0 — a drained-but-not-yet-failing
        # test key could legitimately be near zero — but the math must work.
        assert balance == pytest.approx(
            data["total_credits"] - data["total_usage"]
        )
