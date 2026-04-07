"""OpenRouter balance fetching, caching, and persistence.

Verified against the live OpenRouter API on 2026-04-06 (see Phase 0
results in `docs/byok-balance-contract.md`). The contract:

  GET /api/v1/auth/key   -> label, is_free_tier, limit, limit_remaining
  GET /api/v1/credits    -> total_credits, total_usage

For pay-as-you-go accounts (the common case), `/auth/key` returns
`limit: null` and `limit_remaining: null`. The only way to get a real
balance is `/credits`. We always call BOTH endpoints and merge.

This module is purposefully decoupled from `openrouter_validation.py`:
that file does a single-purpose 200-OK check and is still used by
existing callers (e.g. `byok_service.resolve_byok`). This module knows
how to parse, persist, cache, and degrade gracefully when OpenRouter
is unreachable.
"""

from __future__ import annotations

import logging
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.models.database_models import User

logger = logging.getLogger(__name__)

OPENROUTER_AUTH_URL = "https://openrouter.ai/api/v1/auth/key"
OPENROUTER_CREDITS_URL = "https://openrouter.ai/api/v1/credits"
_HTTP_TIMEOUT_SECONDS = 10.0


class OpenRouterBalanceError(Exception):
    """Raised when balance fetch fails (network, parse, unexpected shape)."""


@dataclass(frozen=True)
class BalanceInfo:
    """Merged balance + key metadata view, returned to API consumers.

    Field shape is locked by `docs/byok-balance-contract.md` and tested
    by both backend (`tests/test_openrouter_balance.py`) and frontend
    (`frontend/src/types/api.ts`). Do not change without bumping both.
    """

    # From /credits (account-level truth)
    total_credits: float
    total_usage: float
    balance_remaining: float  # total_credits - total_usage

    # From /auth/key (key metadata + per-key cap)
    is_free_tier: bool
    key_label: str
    key_limit: Optional[float]
    key_limit_remaining: Optional[float]

    # Derived
    has_credits: bool

    # Metadata
    checked_at: datetime
    stale: bool

    def as_dict(self) -> Dict[str, Any]:
        """JSON-serializable shape used by API responses."""
        return {
            "total_credits": self.total_credits,
            "total_usage": self.total_usage,
            "balance_remaining": self.balance_remaining,
            "is_free_tier": self.is_free_tier,
            "key_label": self.key_label,
            "key_limit": self.key_limit,
            "key_limit_remaining": self.key_limit_remaining,
            "has_credits": self.has_credits,
            "checked_at": self.checked_at.isoformat(),
            "stale": self.stale,
        }


def _compute_has_credits(
    balance_remaining: float, key_limit_remaining: Optional[float]
) -> bool:
    """The spendable amount is min(account balance, per-key cap).

    If either is zero (or negative), the user can't make an LLM call.
    """
    if balance_remaining <= 0:
        return False
    if key_limit_remaining is not None and key_limit_remaining <= 0:
        return False
    return True


def _coerce_optional_float(value: Any, field: str) -> Optional[float]:
    """Coerce a JSON value to Optional[float], rejecting wrong types.

    OpenRouter is consistent about returning numbers or nulls, but if
    they ever start returning a string like "unlimited" we want to fail
    loud rather than silently store garbage.
    """
    if value is None:
        return None
    if isinstance(value, bool):  # bool is a subclass of int in Python — reject
        raise OpenRouterBalanceError(
            f"OpenRouter returned a bool for {field}, expected number or null"
        )
    if isinstance(value, (int, float)):
        return float(value)
    raise OpenRouterBalanceError(
        f"OpenRouter returned unexpected type for {field}: "
        f"{type(value).__name__} ({value!r})"
    )


def _coerce_required_float(value: Any, field: str) -> float:
    """Coerce a JSON value to float, rejecting null and wrong types."""
    if value is None:
        raise OpenRouterBalanceError(f"OpenRouter returned null for required field {field}")
    coerced = _coerce_optional_float(value, field)
    if coerced is None:
        raise OpenRouterBalanceError(f"OpenRouter returned null for required field {field}")
    return coerced


def _parse_auth_key_response(payload: Any) -> Dict[str, Any]:
    """Pull the fields we care about out of /auth/key. Raises on bad shape."""
    if not isinstance(payload, dict):
        raise OpenRouterBalanceError(
            f"/auth/key returned non-object payload: {type(payload).__name__}"
        )
    data = payload.get("data")
    if not isinstance(data, dict):
        raise OpenRouterBalanceError(
            f"/auth/key payload missing 'data' object: {payload!r}"
        )
    label = data.get("label")
    if not isinstance(label, str):
        raise OpenRouterBalanceError(
            f"/auth/key payload missing string 'label': {label!r}"
        )
    is_free_tier = data.get("is_free_tier")
    if not isinstance(is_free_tier, bool):
        raise OpenRouterBalanceError(
            f"/auth/key payload missing bool 'is_free_tier': {is_free_tier!r}"
        )
    return {
        "label": label,
        "is_free_tier": is_free_tier,
        "limit": _coerce_optional_float(data.get("limit"), "limit"),
        "limit_remaining": _coerce_optional_float(
            data.get("limit_remaining"), "limit_remaining"
        ),
    }


def _parse_credits_response(payload: Any) -> Dict[str, float]:
    """Pull total_credits and total_usage out of /credits. Raises on bad shape."""
    if not isinstance(payload, dict):
        raise OpenRouterBalanceError(
            f"/credits returned non-object payload: {type(payload).__name__}"
        )
    data = payload.get("data")
    if not isinstance(data, dict):
        raise OpenRouterBalanceError(
            f"/credits payload missing 'data' object: {payload!r}"
        )
    return {
        "total_credits": _coerce_required_float(data.get("total_credits"), "total_credits"),
        "total_usage": _coerce_required_float(data.get("total_usage"), "total_usage"),
    }


def fetch_balance_sync(api_key: str) -> BalanceInfo:
    """Fetch fresh balance from OpenRouter, no DB interaction.

    Calls BOTH /auth/key (for key metadata) and /credits (for account
    balance). Both calls must succeed; either failure raises
    OpenRouterBalanceError.

    Raises:
        OpenRouterBalanceError: on any HTTP failure, non-200 response,
            or malformed JSON.
    """
    headers = {"Authorization": f"Bearer {api_key}"}
    try:
        with httpx.Client(timeout=_HTTP_TIMEOUT_SECONDS) as client:
            auth_resp = client.get(OPENROUTER_AUTH_URL, headers=headers)
            credits_resp = client.get(OPENROUTER_CREDITS_URL, headers=headers)
    except httpx.HTTPError as exc:
        logger.warning(f"OpenRouter balance fetch transport error: {exc}")
        raise OpenRouterBalanceError(f"OpenRouter unreachable: {exc}") from exc

    if auth_resp.status_code != 200:
        raise OpenRouterBalanceError(
            f"/auth/key returned HTTP {auth_resp.status_code}: {auth_resp.text[:200]}"
        )
    if credits_resp.status_code != 200:
        raise OpenRouterBalanceError(
            f"/credits returned HTTP {credits_resp.status_code}: {credits_resp.text[:200]}"
        )

    try:
        auth_payload = auth_resp.json()
        credits_payload = credits_resp.json()
    except ValueError as exc:
        raise OpenRouterBalanceError(f"OpenRouter returned invalid JSON: {exc}") from exc

    auth_data = _parse_auth_key_response(auth_payload)
    credits_data = _parse_credits_response(credits_payload)

    total_credits = credits_data["total_credits"]
    total_usage = credits_data["total_usage"]
    balance_remaining = total_credits - total_usage
    key_limit_remaining = auth_data["limit_remaining"]

    return BalanceInfo(
        total_credits=total_credits,
        total_usage=total_usage,
        balance_remaining=balance_remaining,
        is_free_tier=auth_data["is_free_tier"],
        key_label=auth_data["label"],
        key_limit=auth_data["limit"],
        key_limit_remaining=key_limit_remaining,
        has_credits=_compute_has_credits(balance_remaining, key_limit_remaining),
        checked_at=datetime.now(timezone.utc),
        stale=False,
    )


def _persist_balance_on_user(user: User, balance: BalanceInfo) -> None:
    """Write the seven balance columns onto the user row.

    Caller is responsible for committing the session.
    """
    user.key_total_credits = balance.total_credits
    user.key_total_usage = balance.total_usage
    user.key_limit = balance.key_limit
    user.key_limit_remaining = balance.key_limit_remaining
    user.key_is_free_tier = balance.is_free_tier
    user.key_balance_checked_at = balance.checked_at
    user.key_balance_error = None


def _persist_error_on_user(user: User, error_message: str) -> None:
    """Record a balance-fetch error without clobbering the cached values.

    Caller is responsible for committing the session.
    """
    truncated = (error_message or "balance fetch failed")[:255]
    user.key_balance_error = truncated


def _decrypt_user_api_key(user: User) -> Optional[str]:
    """Decrypt the user's stored API key. Returns None if absent or unreadable."""
    if not user.encrypted_api_key:
        return None
    # Local import keeps the encryption service out of import-time graphs
    # for callers that just want to read BalanceInfo.
    from app.services.encryption_service import encryption_service

    plaintext = encryption_service.decrypt(user.encrypted_api_key)
    if not plaintext:
        logger.warning(
            f"Could not decrypt stored BYOK key for user {user.id}; "
            "treating as no key for balance purposes."
        )
        return None
    return plaintext


def _build_balance_from_persisted(user: User, *, stale: bool) -> Optional[BalanceInfo]:
    """Reconstruct BalanceInfo from persisted columns. Returns None if not enough data."""
    if (
        user.key_total_credits is None
        or user.key_total_usage is None
        or user.key_balance_checked_at is None
    ):
        return None

    total_credits = float(user.key_total_credits)
    total_usage = float(user.key_total_usage)
    balance_remaining = total_credits - total_usage
    key_limit_remaining = (
        float(user.key_limit_remaining)
        if user.key_limit_remaining is not None
        else None
    )

    return BalanceInfo(
        total_credits=total_credits,
        total_usage=total_usage,
        balance_remaining=balance_remaining,
        is_free_tier=bool(user.key_is_free_tier) if user.key_is_free_tier is not None else False,
        key_label=user.key_hint or "",
        key_limit=float(user.key_limit) if user.key_limit is not None else None,
        key_limit_remaining=key_limit_remaining,
        has_credits=_compute_has_credits(balance_remaining, key_limit_remaining),
        checked_at=user.key_balance_checked_at,
        stale=stale,
    )


def refresh_and_persist(db: Session, user: User) -> BalanceInfo:
    """Force-fetch fresh balance, write it to the user row, return the result.

    Raises:
        OpenRouterBalanceError: if the user has no decryptable key, or
            the OpenRouter call fails. The error message is also stored
            on the user row's `key_balance_error` column for visibility.
    """
    api_key = _decrypt_user_api_key(user)
    if not api_key:
        raise OpenRouterBalanceError(
            "User has no BYOK key configured (or it could not be decrypted)."
        )

    try:
        balance = fetch_balance_sync(api_key)
    except OpenRouterBalanceError as exc:
        _persist_error_on_user(user, str(exc))
        db.commit()
        raise

    _persist_balance_on_user(user, balance)
    db.commit()
    logger.info(
        f"Refreshed OpenRouter balance for user {user.id}: "
        f"balance_remaining={balance.balance_remaining:.4f}, "
        f"has_credits={balance.has_credits}"
    )
    return balance


def get_cached_balance(
    db: Session,
    user: User,
    max_age_seconds: Optional[int] = None,
) -> Optional[BalanceInfo]:
    """Return the user's balance, refreshing from OpenRouter if cache is stale.

    Returns None if the user has no BYOK key configured.

    Degraded path: if OpenRouter is unreachable but we have a previously
    cached value, return that with `stale=True`. If we have nothing
    cached and OpenRouter is unreachable, return None.

    Args:
        max_age_seconds: How old (in seconds) the persisted value can be
            before we force-refresh. Defaults to settings.BALANCE_CACHE_TTL_SECONDS.
            Pass 0 to always refresh.
    """
    if not user.encrypted_api_key:
        return None

    if max_age_seconds is None:
        max_age_seconds = settings.BALANCE_CACHE_TTL_SECONDS

    cached = _build_balance_from_persisted(user, stale=False)

    if cached is not None and max_age_seconds > 0:
        age = datetime.now(timezone.utc) - cached.checked_at
        if age.total_seconds() <= max_age_seconds:
            return cached

    # Cache miss (or forced refresh) → try a live fetch.
    try:
        return refresh_and_persist(db, user)
    except OpenRouterBalanceError as exc:
        logger.warning(
            f"Live balance fetch failed for user {user.id}: {exc}; "
            f"returning {'stale cache' if cached else 'None'}."
        )
        if cached is None:
            return None
        # Re-emit the cached value but flag it as stale.
        return BalanceInfo(**{**asdict(cached), "stale": True})
