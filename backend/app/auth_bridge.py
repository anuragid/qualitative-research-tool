"""
Authentication Module

This module provides Clerk-based JWT authentication for FastAPI routes.
It imports from auth.py which handles the actual Clerk JWT verification.
"""

from app.auth import (
    ClerkAuth,
    UserRole,
    Permission,
    ROLE_PERMISSIONS,
    has_permission,
    require_role,
    require_permission,
    require_any_permission,
    get_current_user,
    get_current_user_id,
    get_optional_user,
    security,
)


# Export everything for backward compatibility with routes
__all__ = [
    "security",
    "UserRole",
    "Permission",
    "ROLE_PERMISSIONS",
    "get_current_user",
    "get_current_user_id",
    "get_optional_user",
    "require_role",
    "require_permission",
    "require_any_permission",
    "has_permission",
]
