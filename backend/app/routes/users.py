"""User routes for syncing with Clerk."""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.auth_bridge import get_current_user
from app.config import settings
from app.constants import (
    DEFAULT_STANDARD_MODEL,
    MODEL_TIER_BYOK,
    MODEL_TIER_INCLUDED,
    STANDARD_MODEL_IDS,
    STANDARD_MODELS,
)
from app.database import get_db
from app.models import database_models
from app.models.schemas import (
    ApiKeyAddRequest,
    BalanceInfoResponse,
    PreferredModelUpdateRequest,
    UserResponse,
    UserSettingsResponse,
)
from app.rate_limit import limiter
from app.services.clerk_service import fetch_clerk_user
from app.services.encryption_service import encryption_service
from app.services.openrouter_balance import (
    BalanceInfo,
    OpenRouterBalanceError,
    build_balance_from_persisted,
    fetch_balance_sync,
    get_cached_balance,
    refresh_and_persist,
)

logger = logging.getLogger(__name__)

router = APIRouter()


def _balance_to_response(balance: Optional[BalanceInfo]) -> Optional[BalanceInfoResponse]:
    """Convert a BalanceInfo dataclass into the Pydantic response model."""
    if balance is None:
        return None
    return BalanceInfoResponse(**balance.as_dict())


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get the current authenticated user's profile.
    Creates the user in the database if they don't exist yet.
    """
    user_id = current_user["id"]
    email = current_user.get("email")
    first_name = current_user.get("first_name")
    last_name = current_user.get("last_name")
    username = current_user.get("username")

    # If JWT doesn't have profile data, fetch from Clerk API
    if not email:
        clerk_data = await fetch_clerk_user(user_id)
        if clerk_data:
            email = clerk_data.get("email") or email
            first_name = clerk_data.get("first_name") or first_name
            last_name = clerk_data.get("last_name") or last_name
            username = clerk_data.get("username") or username

    # Check if user exists in database
    db_user = db.query(database_models.User).filter(
        database_models.User.id == user_id
    ).first()

    if not db_user:
        # Create user if they don't exist (first-time sign in)
        db_user = database_models.User(
            id=user_id,
            email=email,
            first_name=first_name,
            last_name=last_name,
            username=username,
            role=current_user.get("role", "user"),
            last_seen=datetime.now(timezone.utc)
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
    else:
        # Update last_seen and role
        db_user.last_seen = datetime.now(timezone.utc)
        db_user.role = current_user.get("role", db_user.role)
        # Update profile fields if we got fresh data from Clerk API
        if email and not db_user.email:
            db_user.email = email
        if first_name and not db_user.first_name:
            db_user.first_name = first_name
        if last_name and not db_user.last_name:
            db_user.last_name = last_name
        if username and not db_user.username:
            db_user.username = username
        db.commit()

    return db_user


@router.post("/sync")
async def sync_user(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Sync user data from Clerk to the database.
    This endpoint should be called after successful authentication.
    """
    user_id = current_user["id"]
    email = current_user.get("email")
    first_name = current_user.get("first_name")
    last_name = current_user.get("last_name")
    username = current_user.get("username")

    # If JWT doesn't have profile data, fetch from Clerk API
    if not email:
        clerk_data = await fetch_clerk_user(user_id)
        if clerk_data:
            email = clerk_data.get("email") or email
            first_name = clerk_data.get("first_name") or first_name
            last_name = clerk_data.get("last_name") or last_name
            username = clerk_data.get("username") or username

    # Check if user exists
    db_user = db.query(database_models.User).filter(
        database_models.User.id == user_id
    ).first()

    if not db_user:
        # Create new user with role
        db_user = database_models.User(
            id=user_id,
            email=email,
            first_name=first_name,
            last_name=last_name,
            username=username,
            role=current_user.get("role", "user"),  # Default to 'user' role
            last_seen=datetime.now(timezone.utc)
        )
        db.add(db_user)
    else:
        # Update existing user (including role if it changed in Clerk)
        if email:
            db_user.email = email
        if first_name:
            db_user.first_name = first_name
        if last_name:
            db_user.last_name = last_name
        if username:
            db_user.username = username
        db_user.role = current_user.get("role", db_user.role)  # Update role if changed
        db_user.last_seen = datetime.now(timezone.utc)
        db_user.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(db_user)

    return {
        "message": "User synced successfully",
        "user": {
            "id": db_user.id,
            "email": db_user.email,
            "first_name": db_user.first_name,
            "last_name": db_user.last_name,
            "username": db_user.username
        }
    }


@router.get("/settings", response_model=UserSettingsResponse)
def get_user_settings(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the current user's LLM settings.

    For BYOK users, this also returns a freshness-bounded balance
    snapshot. Non-BYOK users get `balance: null` and we never call
    OpenRouter for them.
    """
    user_id = current_user["id"]
    db_user = db.query(database_models.User).filter(
        database_models.User.id == user_id
    ).first()

    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    balance: Optional[BalanceInfo] = None
    if db_user.encrypted_api_key:
        try:
            balance = get_cached_balance(db, db_user)
        except Exception as exc:  # noqa: BLE001 — swallow to keep /settings working
            # get_cached_balance already handles OpenRouterBalanceError
            # internally; this is a safety net for unexpected failures
            # (e.g. encryption rotation). Never let it block the page load.
            logger.warning(
                f"Unexpected error fetching balance for user {user_id}: {exc}"
            )

    return UserSettingsResponse(
        preferred_model=db_user.preferred_model,
        model_tier=db_user.model_tier or MODEL_TIER_INCLUDED,
        has_api_key=bool(db_user.encrypted_api_key),
        key_hint=db_user.key_hint,
        key_validated_at=db_user.key_validated_at,
        available_models=STANDARD_MODELS,
        balance=_balance_to_response(balance),
        low_balance_threshold_usd=settings.LOW_BALANCE_THRESHOLD_USD,
    )


@router.post("/settings/api-key", response_model=UserSettingsResponse)
@limiter.limit("5/minute")
def add_api_key(
    request: Request,
    payload: ApiKeyAddRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add or replace the user's BYOK API key.

    Validates the key against OpenRouter and rejects keys with no
    credits before persisting. Does NOT touch preferred_model — that's
    a separate endpoint (Task 3).
    """
    user_id = current_user["id"]
    db_user = db.query(database_models.User).filter(
        database_models.User.id == user_id
    ).first()

    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        balance = fetch_balance_sync(payload.api_key)
    except OpenRouterBalanceError as exc:
        logger.info(f"BYOK key save failed validation for user {user_id}: {exc}")
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid API key or OpenRouter is temporarily unreachable. "
                "Check your key on the OpenRouter dashboard and try again."
            ),
        ) from exc

    if not balance.has_credits:
        raise HTTPException(
            status_code=400,
            detail=(
                "Your OpenRouter key has $0 credits. Add credits at "
                "https://openrouter.ai/settings/credits, then save again."
            ),
        )

    db_user.encrypted_api_key = encryption_service.encrypt(payload.api_key)
    db_user.key_hint = (
        payload.api_key[-4:] if len(payload.api_key) > 8 else "****"
    )
    db_user.key_validated_at = datetime.now(timezone.utc)

    # Persist the freshly-fetched balance fields so the immediate
    # GET /settings round-trip after save shows the live numbers.
    db_user.key_total_credits = balance.total_credits
    db_user.key_total_usage = balance.total_usage
    db_user.key_limit = balance.key_limit
    db_user.key_limit_remaining = balance.key_limit_remaining
    db_user.key_is_free_tier = balance.is_free_tier
    db_user.key_balance_checked_at = balance.checked_at
    db_user.key_balance_error = None

    db.commit()

    # Re-read balance from cache (no HTTP — we just persisted it on save).
    fresh_balance: Optional[BalanceInfo] = None
    try:
        fresh_balance = get_cached_balance(db, db_user)
    except Exception as exc:  # noqa: BLE001 — never block POST response
        logger.warning(
            f"Unexpected error reading balance after api-key save for user {user_id}: {exc}"
        )

    return UserSettingsResponse(
        preferred_model=db_user.preferred_model,
        model_tier=db_user.model_tier or MODEL_TIER_INCLUDED,
        has_api_key=True,
        key_hint=db_user.key_hint,
        key_validated_at=db_user.key_validated_at,
        available_models=STANDARD_MODELS,
        balance=_balance_to_response(fresh_balance),
        low_balance_threshold_usd=settings.LOW_BALANCE_THRESHOLD_USD,
    )


@router.put(
    "/settings/preferred-model",
    response_model=UserSettingsResponse,
)
@limiter.limit(settings.RATE_LIMIT_AUTH)
def update_preferred_model(
    request: Request,
    payload: PreferredModelUpdateRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Set the user's preferred model and tier.

    Tier enforcement:
    - ``included`` tier: model must be in STANDARD_MODEL_IDS.
    - ``byok`` tier: user must have an API key with credits.
    Does NOT touch the API key.
    """
    user_id = current_user["id"]
    db_user = db.query(database_models.User).filter(
        database_models.User.id == user_id
    ).first()

    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    tier = payload.model_tier
    has_key = bool(db_user.encrypted_api_key)

    if tier == MODEL_TIER_INCLUDED and payload.preferred_model not in STANDARD_MODEL_IDS:
        raise HTTPException(
            status_code=400,
            detail=(
                "The selected model is not available on the included tier. "
                "Switch to BYOK tier or choose a standard model."
            ),
        )

    if tier == MODEL_TIER_BYOK:
        if not has_key:
            raise HTTPException(
                status_code=403,
                detail=(
                    "Add your OpenRouter API key in Settings to unlock "
                    "premium models."
                ),
            )
        # Fresh balance check for BYOK tier selection
        try:
            balance_check = get_cached_balance(db, db_user, max_age_seconds=0)
        except Exception:  # noqa: BLE001 — degraded pass
            balance_check = None

        if balance_check is not None and not balance_check.has_credits:
            raise HTTPException(
                status_code=402,
                detail=(
                    "Your OpenRouter key has no remaining credits. "
                    "Add credits at https://openrouter.ai/settings/credits "
                    "and try again."
                ),
            )

    db_user.preferred_model = payload.preferred_model
    db_user.model_tier = tier
    db.commit()

    fresh_balance: Optional[BalanceInfo] = None
    if db_user.encrypted_api_key:
        try:
            fresh_balance = get_cached_balance(db, db_user)
        except Exception as exc:  # noqa: BLE001 — never block PUT response
            logger.warning(
                f"Unexpected error reading balance after preferred-model "
                f"update for user {user_id}: {exc}"
            )

    return UserSettingsResponse(
        preferred_model=db_user.preferred_model,
        model_tier=db_user.model_tier or MODEL_TIER_INCLUDED,
        has_api_key=has_key,
        key_hint=db_user.key_hint,
        key_validated_at=db_user.key_validated_at,
        available_models=STANDARD_MODELS,
        balance=_balance_to_response(fresh_balance),
        low_balance_threshold_usd=settings.LOW_BALANCE_THRESHOLD_USD,
    )


@router.post("/settings/refresh-balance", response_model=BalanceInfoResponse)
@limiter.limit("10/minute")
def refresh_balance(
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Force-refresh the user's OpenRouter balance and persist it.

    Used by the Settings dialog "Refresh" button and by the
    "I've added credits — retry" flow in the InsufficientCreditsAlert.

    Errors:
      400 — user has no BYOK key configured
      503 — OpenRouter unreachable; if a stale cache exists, the
            response includes it with stale=true
      429 — rate-limited (10/min/user via slowapi limiter)
    """
    user_id = current_user["id"]
    db_user = db.query(database_models.User).filter(
        database_models.User.id == user_id
    ).first()

    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    if not db_user.encrypted_api_key:
        raise HTTPException(
            status_code=400,
            detail=(
                "No BYOK API key configured. Add your OpenRouter key in "
                "Settings before refreshing balance."
            ),
        )

    try:
        balance = refresh_and_persist(db, db_user)
    except OpenRouterBalanceError as exc:
        # Try to return a stale cache if we have one — the frontend
        # will show "Last checked N min ago" instead of an error.
        # Use the explicit builder so we can force `stale=True` regardless
        # of the cache's freshness window — the cache is "stale" in the
        # sense that we just tried to refresh and failed.
        stale = build_balance_from_persisted(db_user, stale=True)
        if stale is not None:
            response = BalanceInfoResponse(**stale.as_dict())
            raise HTTPException(
                status_code=503,
                detail={
                    "message": "OpenRouter is temporarily unreachable.",
                    "stale_balance": response.model_dump(mode="json"),
                },
            ) from exc
        raise HTTPException(
            status_code=503,
            detail=(
                "OpenRouter is temporarily unreachable and no cached "
                "balance is available. Try again in a few seconds."
            ),
        ) from exc

    return BalanceInfoResponse(**balance.as_dict())


@router.delete("/settings/api-key")
def delete_api_key(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove the user's stored API key."""
    user_id = current_user["id"]
    db_user = db.query(database_models.User).filter(
        database_models.User.id == user_id
    ).first()

    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    db_user.encrypted_api_key = None
    db_user.key_hint = None
    db_user.key_validated_at = None
    db_user.preferred_model = DEFAULT_STANDARD_MODEL
    db_user.model_tier = MODEL_TIER_INCLUDED
    # Also clear balance snapshot fields — they reference a key that no
    # longer exists, and leaving them set would let the next GET /settings
    # render stale BYOK balance data for a non-BYOK user.
    db_user.key_total_credits = None
    db_user.key_total_usage = None
    db_user.key_limit = None
    db_user.key_limit_remaining = None
    db_user.key_is_free_tier = None
    db_user.key_balance_checked_at = None
    db_user.key_balance_error = None
    db.commit()

    return {"message": "API key removed"}
