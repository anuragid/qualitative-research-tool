"""
Authentication Bridge Module

This module provides a bridge between Clerk and Cognito authentication
during the migration period. It uses a feature flag to determine which
authentication provider to use.
"""

import logging
from typing import Any, Dict, Optional

from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings

logger = logging.getLogger(__name__)

# Security scheme
security = HTTPBearer()

# Import auth modules based on feature flag
if settings.USE_COGNITO_AUTH:
    logger.info("Using AWS Cognito authentication")
    from app.cognito_auth import (
        CognitoAuth,
        UserRole,
        Permission,
        ROLE_PERMISSIONS,
        has_permission,
        has_role,
    )

    # Initialize Cognito auth
    auth_handler = CognitoAuth(
        region=settings.COGNITO_REGION or settings.AWS_REGION,
        user_pool_id=settings.COGNITO_USER_POOL_ID,
        app_client_id=settings.COGNITO_APP_CLIENT_ID,
    )
else:
    logger.info("Using Clerk authentication")
    from app.auth import (
        ClerkAuth,
        UserRole,
        Permission,
        ROLE_PERMISSIONS,
        has_permission,
        has_role,
    )

    # Initialize Clerk auth
    auth_handler = ClerkAuth(
        secret_key=settings.CLERK_SECRET_KEY,
        publishable_key=settings.CLERK_PUBLISHABLE_KEY,
        jwt_key=settings.CLERK_JWT_KEY,
    )


# Unified authentication dependencies

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security)
) -> Dict[str, Any]:
    """
    Get the current authenticated user from either Clerk or Cognito

    Returns:
        Dictionary with user information including:
        - id: User's unique identifier
        - email: User's email address
        - role: User's role
        - permissions: List of user's permissions
        - raw_payload: Complete token payload
    """
    if not credentials:
        raise HTTPException(
            status_code=401,
            detail="Missing authentication credentials"
        )

    token = credentials.credentials
    user_data = auth_handler.verify_token(token)

    # Normalize the response format
    return {
        "id": user_data.get("sub") or user_data.get("user_id"),
        "email": user_data.get("email"),
        "role": user_data.get("role", UserRole.USER.value),
        "permissions": user_data.get("permissions", []),
        "raw_payload": user_data,
        "auth_provider": "cognito" if settings.USE_COGNITO_AUTH else "clerk",
    }


async def get_current_user_id(
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> str:
    """
    Get just the user ID of the current authenticated user

    Returns:
        User's unique identifier
    """
    return current_user["id"]


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security)
) -> Optional[Dict[str, Any]]:
    """
    Get the current user if authenticated, otherwise return None

    Returns:
        User dictionary if authenticated, None otherwise
    """
    if not credentials:
        return None

    try:
        token = credentials.credentials
        user_data = auth_handler.verify_token(token)

        return {
            "id": user_data.get("sub") or user_data.get("user_id"),
            "email": user_data.get("email"),
            "role": user_data.get("role", UserRole.USER.value),
            "permissions": user_data.get("permissions", []),
            "raw_payload": user_data,
            "auth_provider": "cognito" if settings.USE_COGNITO_AUTH else "clerk",
        }
    except HTTPException:
        return None


# Role-based access control dependencies

def require_role(role: UserRole):
    """
    Dependency to require a specific role

    Args:
        role: The required UserRole

    Returns:
        FastAPI dependency that validates the user's role
    """
    async def role_checker(
        current_user: Dict[str, Any] = Depends(get_current_user)
    ) -> Dict[str, Any]:
        user_role = current_user.get("role", UserRole.USER.value)

        # Admin can access everything
        if user_role == UserRole.ADMIN.value:
            return current_user

        # Check if user has the required role
        if user_role != role.value:
            raise HTTPException(
                status_code=403,
                detail=f"Insufficient permissions. Required role: {role.value}"
            )

        return current_user

    return role_checker


def require_permission(permission: Permission):
    """
    Dependency to require a specific permission

    Args:
        permission: The required Permission

    Returns:
        FastAPI dependency that validates the user has the permission
    """
    async def permission_checker(
        current_user: Dict[str, Any] = Depends(get_current_user)
    ) -> Dict[str, Any]:
        user_permissions = current_user.get("permissions", [])

        if permission.value not in user_permissions:
            raise HTTPException(
                status_code=403,
                detail=f"Insufficient permissions. Required: {permission.value}"
            )

        return current_user

    return permission_checker


def require_any_permission(*permissions: Permission):
    """
    Dependency to require at least one of the specified permissions

    Args:
        permissions: One or more required permissions

    Returns:
        FastAPI dependency that validates the user has at least one permission
    """
    async def permission_checker(
        current_user: Dict[str, Any] = Depends(get_current_user)
    ) -> Dict[str, Any]:
        user_permissions = current_user.get("permissions", [])
        required_permissions = [p.value for p in permissions]

        if not any(p in user_permissions for p in required_permissions):
            raise HTTPException(
                status_code=403,
                detail=f"Insufficient permissions. Required one of: {required_permissions}"
            )

        return current_user

    return permission_checker


# Export everything for backward compatibility
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
    "has_role",
]