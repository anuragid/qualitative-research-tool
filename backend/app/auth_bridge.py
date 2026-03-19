"""
Authentication Module

This module provides Clerk-based JWT authentication for FastAPI routes.
It imports from auth.py which handles the actual Clerk JWT verification.
"""

from app.auth import (
    Permission,
    get_current_user,
    get_current_user_id,
    get_current_user_id_upload,
    require_permissions,
    require_permissions_upload,
    security,
)

# Export everything for backward compatibility with routes
__all__ = [
    "Permission",
    "security",
    "get_current_user",
    "get_current_user_id",
    "get_current_user_id_upload",
    "require_permissions",
    "require_permissions_upload",
]
