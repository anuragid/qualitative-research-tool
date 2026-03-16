"""
Authentication Module

This module provides Clerk-based JWT authentication for FastAPI routes.
It imports from auth.py which handles the actual Clerk JWT verification.
"""

from app.auth import (
    get_current_user,
    get_current_user_id,
    get_current_user_id_upload,
    security,
)

# Export everything for backward compatibility with routes
__all__ = [
    "security",
    "get_current_user",
    "get_current_user_id",
    "get_current_user_id_upload",
]
