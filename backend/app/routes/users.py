"""User routes for syncing with Clerk."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Dict, Any
from datetime import datetime

from app.database import get_db
from app.models import database_models
from app.auth import get_current_user, get_current_user_id
from app.models.schemas import UserResponse

router = APIRouter()


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

    # Check if user exists in database
    db_user = db.query(database_models.User).filter(
        database_models.User.id == user_id
    ).first()

    if not db_user:
        # Create user if they don't exist (first-time sign in)
        db_user = database_models.User(
            id=user_id,
            email=current_user.get("email"),
            first_name=current_user.get("first_name"),
            last_name=current_user.get("last_name"),
            username=current_user.get("username"),
            role=current_user.get("role", "user"),
            last_seen=datetime.utcnow()
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
    else:
        # Update last_seen and role
        db_user.last_seen = datetime.utcnow()
        db_user.role = current_user.get("role", db_user.role)
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

    # Check if user exists
    db_user = db.query(database_models.User).filter(
        database_models.User.id == user_id
    ).first()

    if not db_user:
        # Create new user with role
        db_user = database_models.User(
            id=user_id,
            email=current_user.get("email"),
            first_name=current_user.get("first_name"),
            last_name=current_user.get("last_name"),
            username=current_user.get("username"),
            role=current_user.get("role", "user"),  # Default to 'user' role
            last_seen=datetime.utcnow()
        )
        db.add(db_user)
    else:
        # Update existing user (including role if it changed in Clerk)
        if current_user.get("email"):
            db_user.email = current_user.get("email")
        db_user.first_name = current_user.get("first_name", db_user.first_name)
        db_user.last_name = current_user.get("last_name", db_user.last_name)
        db_user.username = current_user.get("username", db_user.username)
        db_user.role = current_user.get("role", db_user.role)  # Update role if changed
        db_user.last_seen = datetime.utcnow()
        db_user.updated_at = datetime.utcnow()

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