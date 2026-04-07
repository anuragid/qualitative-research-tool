"""User routes for syncing with Clerk."""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.auth_bridge import get_current_user
from app.constants import STANDARD_MODEL_IDS, STANDARD_MODELS
from app.database import get_db
from app.main import limiter
from app.models import database_models
from app.models.schemas import (
    BalanceInfoResponse,
    UserResponse,
    UserSettingsResponse,
    UserSettingsUpdate,
)
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

# NOTE: openrouter_validation.validate_openrouter_key is no longer imported
# here — PUT /settings now uses fetch_balance_sync which doubles as a
# liveness check AND gives us the data needed to reject 0-credit keys.
# byok_service.resolve_byok still uses validate_openrouter_key_sync, so
# the legacy module is intentionally left in place.

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
async def get_user_settings(
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
        has_api_key=bool(db_user.encrypted_api_key),
        key_hint=db_user.key_hint,
        key_validated_at=db_user.key_validated_at,
        available_models=STANDARD_MODELS,
        balance=_balance_to_response(balance),
    )


@router.put("/settings", response_model=UserSettingsResponse)
@limiter.limit("5/minute")
async def update_user_settings(
    request: Request,
    settings: UserSettingsUpdate,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update the current user's LLM settings (model preference and/or API key)."""
    user_id = current_user["id"]
    db_user = db.query(database_models.User).filter(
        database_models.User.id == user_id
    ).first()

    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Validate and store API key
    if settings.api_key is not None:
        # Fetch the balance directly — this also doubles as key validation
        # (a 401/invalid key fails fetch_balance_sync the same way) AND
        # gives us the data we need to reject 0-balance keys at save time.
        try:
            balance = fetch_balance_sync(settings.api_key)
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
            # The Baffour Adu case — paste a brand-new zero-credit key,
            # get an actionable error before any analysis even starts.
            raise HTTPException(
                status_code=400,
                detail=(
                    "Your OpenRouter key has $0 credits. Add credits at "
                    "https://openrouter.ai/settings/credits, then save again."
                ),
            )

        db_user.encrypted_api_key = encryption_service.encrypt(settings.api_key)
        db_user.key_hint = settings.api_key[-4:] if len(settings.api_key) > 8 else "****"
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

    # Enforce model tier:
    # - BYOK users: allow ANY model ID (they're paying with their own key)
    # - Non-BYOK users: only allow models from our curated standard list
    if settings.preferred_model is not None:
        has_key = bool(db_user.encrypted_api_key)
        if not has_key:
            if settings.preferred_model not in STANDARD_MODEL_IDS:
                raise HTTPException(
                    status_code=403,
                    detail="Add your OpenRouter API key in Settings to unlock premium models.",
                )
        db_user.preferred_model = settings.preferred_model

    db.commit()

    # Re-read balance from cache (no HTTP — we just persisted it on save).
    fresh_balance: Optional[BalanceInfo] = None
    if db_user.encrypted_api_key:
        try:
            fresh_balance = get_cached_balance(db, db_user)
        except Exception as exc:  # noqa: BLE001 — never block PUT response
            logger.warning(
                f"Unexpected error reading balance after settings update for user {user_id}: {exc}"
            )

    return UserSettingsResponse(
        preferred_model=db_user.preferred_model,
        has_api_key=bool(db_user.encrypted_api_key),
        key_hint=db_user.key_hint,
        key_validated_at=db_user.key_validated_at,
        available_models=STANDARD_MODELS,
        balance=_balance_to_response(fresh_balance),
    )


@router.post("/settings/refresh-balance", response_model=BalanceInfoResponse)
@limiter.limit("10/minute")
async def refresh_balance(
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
async def delete_api_key(
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
    db_user.preferred_model = None
    db.commit()

    return {"message": "API key removed"}
