"""BYOK key resolution for analysis pipelines.

Shared by both analysis_tasks.py and analysis_steps.py so there is
a single source of truth for the decryption + re-validation logic.
"""

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.database_models import User
from app.services.encryption_service import encryption_service
from app.services.openrouter_balance import (
    BalanceInfo,
    OpenRouterBalanceError,
    get_cached_balance,
)
from app.services.openrouter_validation import validate_openrouter_key_sync

logger = logging.getLogger(__name__)

_REVALIDATION_HOURS = 24


class InsufficientCreditsError(Exception):
    """Raised by ``resolve_byok_with_preflight`` when the user's BYOK key
    has a known-zero balance.

    The exception carries the ``BalanceInfo`` so callers (the FastAPI
    dependency, the Celery task pre-flight) can surface the structured
    balance to the user without re-fetching.
    """

    def __init__(self, balance: BalanceInfo):
        self.balance = balance
        super().__init__(
            "OpenRouter key has no remaining credits "
            f"(balance_remaining=${balance.balance_remaining:.4f})"
        )


def resolve_byok(db: Session, user_id: str | None) -> tuple[str | None, str | None]:
    """Look up and decrypt a user's BYOK API key and preferred model.

    Returns (api_key, model) -- both None when no BYOK is configured.
    Raises Exception if a BYOK key exists but cannot be decrypted or
    fails re-validation, so we never silently fall back to the Methodex key.
    """
    if not user_id:
        return None, None
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return None, None

    if not user.encrypted_api_key:
        return None, user.preferred_model

    api_key = encryption_service.decrypt(user.encrypted_api_key)
    if not api_key:
        # Corrupted ciphertext -- clear the key and error out
        user.encrypted_api_key = None
        user.key_hint = None
        user.key_validated_at = None
        db.commit()
        raise Exception(
            "Your stored API key could not be decrypted (encryption key may have been rotated). "
            "Please re-enter your OpenRouter API key in Settings."
        )

    # Re-validate if key_validated_at is stale (>24h)
    if user.key_validated_at:
        age = datetime.now(timezone.utc) - user.key_validated_at
        if age.total_seconds() > _REVALIDATION_HOURS * 3600:
            if not validate_openrouter_key_sync(api_key):
                raise Exception(
                    "Your OpenRouter API key failed re-validation. "
                    "Please check that your account has credits."
                )
            user.key_validated_at = datetime.now(timezone.utc)
            db.commit()
    else:
        # Never validated -- validate now
        if not validate_openrouter_key_sync(api_key):
            raise Exception(
                "Your OpenRouter API key is invalid or has no credits. "
                "Please check your key in Settings."
            )
        user.key_validated_at = datetime.now(timezone.utc)
        db.commit()

    logger.info(f"Using BYOK API key for user {user_id}")
    return api_key, user.preferred_model


def resolve_byok_with_preflight(
    db: Session,
    user_id: str | None,
    force_refresh: bool = False,
) -> tuple[str | None, str | None, BalanceInfo | None]:
    """Like ``resolve_byok``, but also fetches the OpenRouter balance and
    raises ``InsufficientCreditsError`` when the balance is known-zero.

    This is the canonical resolver for analyze-triggering code paths
    (FastAPI gate dependency + Celery task pre-flight). The non-gating
    ``resolve_byok`` is preserved for callers that don't want the
    extra HTTP call.

    Args:
        db: SQLAlchemy session bound to the request / task scope.
        user_id: Clerk user id, or ``None`` for anonymous / system tasks.
        force_refresh: Bypass the 60-second balance cache and force a
            live fetch. Pre-flight at the start of a pipeline (route
            dependency, ``analyze_chunk_step``) sets this; downstream
            steps reuse the cached value.

    Returns:
        ``(api_key, model, balance_info)``. For non-BYOK users (no
        ``encrypted_api_key`` configured) returns ``(None, None, None)``.
        For BYOK users when balance fetching fails (network / parse),
        returns ``(api_key, model, None)`` so the task still runs and
        any mid-process 402 surfaces through the existing classification
        plumbing.

    Raises:
        InsufficientCreditsError: When the BYOK key has a known-zero
            balance. The exception carries the ``BalanceInfo`` for the
            caller to surface.
        Exception: Anything ``resolve_byok`` itself raises (decryption
            failure, re-validation failure) propagates unchanged.
    """
    api_key, model = resolve_byok(db, user_id)
    if api_key is None:
        return None, None, None

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        # Defensive — resolve_byok already returned a key, so the row
        # exists. But if the row vanished between calls (e.g. test
        # session weirdness), fall through to the degraded path.
        return api_key, model, None

    try:
        if force_refresh:
            balance = get_cached_balance(db, user, max_age_seconds=0)
        else:
            balance = get_cached_balance(db, user)
    except OpenRouterBalanceError as exc:
        logger.warning(
            "Balance fetch failed for user %s during pre-flight (degraded "
            "pass — task will surface mid-process 402 if any): %s",
            user_id,
            exc,
        )
        return api_key, model, None

    if balance is not None and not balance.has_credits:
        raise InsufficientCreditsError(balance)

    return api_key, model, balance
