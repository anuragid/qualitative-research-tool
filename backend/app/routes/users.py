"""User routes for syncing with Clerk."""

from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth_bridge import get_current_user
from app.database import get_db
from app.models import database_models
from app.models.schemas import UserResponse, UserSettingsResponse, UserSettingsUpdate
from app.services.clerk_service import fetch_clerk_user
from app.services.encryption_service import encryption_service

router = APIRouter()

# Available models exposed by GET/PUT /settings
AVAILABLE_MODELS = [
    {"id": "meta-llama/llama-3.3-70b-instruct:free", "name": "Llama 3.3 70B (Free)", "tier": "free"},
    {"id": "google/gemma-3-27b-it:free", "name": "Gemma 3 27B (Free)", "tier": "free"},
    {"id": "mistralai/mistral-small-3.1-24b-instruct:free", "name": "Mistral Small 3.1 (Free)", "tier": "free"},
    {"id": "anthropic/claude-sonnet-4", "name": "Claude Sonnet 4", "tier": "premium"},
    {"id": "openai/gpt-4o", "name": "GPT-4o", "tier": "premium"},
    {"id": "google/gemini-2.5-pro-preview", "name": "Gemini 2.5 Pro", "tier": "premium"},
]


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
    """Get the current user's LLM settings."""
    user_id = current_user["id"]
    db_user = db.query(database_models.User).filter(
        database_models.User.id == user_id
    ).first()

    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    return UserSettingsResponse(
        preferred_model=db_user.preferred_model,
        has_api_key=bool(db_user.encrypted_api_key),
        available_models=AVAILABLE_MODELS,
    )


@router.put("/settings", response_model=UserSettingsResponse)
async def update_user_settings(
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

    if settings.preferred_model is not None:
        db_user.preferred_model = settings.preferred_model

    if settings.api_key is not None:
        db_user.encrypted_api_key = encryption_service.encrypt(settings.api_key)

    db.commit()

    return UserSettingsResponse(
        preferred_model=db_user.preferred_model,
        has_api_key=bool(db_user.encrypted_api_key),
        available_models=AVAILABLE_MODELS,
    )


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
    db_user.preferred_model = None
    db.commit()

    return {"message": "API key removed"}
