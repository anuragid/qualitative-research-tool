"""FastAPI dependency that gates analyze-triggering routes on BYOK balance.

Single source of truth for the "block this request if the user's
OpenRouter key has zero credits" check. Applied via
``Depends(require_byok_credits)`` to every route that enqueues an
analysis task (5 step routes + ``/analyze`` + project ``/analyze``).

Behavior summary:

- Non-BYOK users (no ``encrypted_api_key`` row): instant pass, no
  network call. Returns ``None`` so handlers can branch on it.
- BYOK users with healthy balance: returns the ``BalanceInfo``.
- BYOK users with known-zero balance: raises ``HTTPException(402)``
  with a structured ``detail`` body the frontend renders as the
  "Add credits" alert.
- BYOK users with unreachable OpenRouter (degraded): logs a warning
  and returns ``None``. The Celery task's own pre-flight + the
  existing mid-process 402 classification plumbing catch the failure
  later — defense in depth.
"""

import logging

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.auth import get_current_user_id
from app.database import get_db
from app.models.database_models import User
from app.services.openrouter_balance import (
    BalanceInfo,
    OpenRouterBalanceError,
    get_cached_balance,
)

logger = logging.getLogger(__name__)


async def require_byok_credits(
    request: Request,  # noqa: ARG001 — kept for symmetry with other gate deps
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_current_user_id),
) -> BalanceInfo | None:
    """Block the request if the BYOK user's balance is known-zero.

    Returns:
        - ``None`` for non-BYOK users (no ``encrypted_api_key`` configured)
        - ``None`` for BYOK users when the balance fetch fails (degraded)
        - ``BalanceInfo`` for BYOK users with credits

    Raises:
        HTTPException(402): When the user's BYOK key has zero credits.
            ``detail`` is a structured dict with ``error_type``, a
            human-readable ``message``, and the ``balance`` payload so
            the frontend can render the "Add credits" CTA.
    """
    try:
        user = db.query(User).filter(User.id == current_user_id).first()
    except Exception as exc:
        # Defense in depth: any DB-level failure (missing table in
        # tests, transient connection blip in prod) should degrade
        # gracefully rather than 500 the request. The downstream task
        # handles its own pre-flight + mid-process 402 classification.
        logger.warning(
            "BYOK gate user lookup failed for user %s (degraded pass): %s",
            current_user_id,
            exc,
        )
        return None

    if user is None or not user.encrypted_api_key:
        # Non-BYOK user (or unknown user — let downstream auth handle
        # that case). Skip the gate entirely so non-BYOK users are
        # never affected by this feature.
        return None

    try:
        balance = get_cached_balance(db, user, max_age_seconds=0)
    except OpenRouterBalanceError as exc:
        logger.warning(
            "Balance fetch failed for user %s at route gate (degraded "
            "pass — task will catch any mid-process 402): %s",
            current_user_id,
            exc,
        )
        return None

    if balance is not None and not balance.has_credits:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "error_type": "insufficient_credits",
                "message": (
                    "Your OpenRouter key has no remaining credits. "
                    "Add credits at https://openrouter.ai/settings/credits "
                    "and try again."
                ),
                "balance": balance.as_dict(),
            },
        )

    return balance
