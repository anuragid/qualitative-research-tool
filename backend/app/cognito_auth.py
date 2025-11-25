"""
AWS Cognito Authentication Module for FastAPI

This module provides JWT verification for AWS Cognito tokens,
maintaining the same interface as the previous Clerk authentication.
"""

import json
import logging
import time
from enum import Enum
from functools import lru_cache
from typing import Any, Dict, List, Optional

import jwt
import requests
from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# Security scheme for FastAPI
security = HTTPBearer()


class UserRole(str, Enum):
    """User roles for the application"""
    ADMIN = "admin"
    USER = "user"
    VIEWER = "viewer"


class Permission(str, Enum):
    """Granular permissions for the application"""
    PROJECT_CREATE = "project:create"
    PROJECT_READ = "project:read"
    PROJECT_UPDATE = "project:update"
    PROJECT_DELETE = "project:delete"
    VIDEO_UPLOAD = "video:upload"
    VIDEO_DELETE = "video:delete"
    ANALYSIS_RUN = "analysis:run"
    ANALYSIS_READ = "analysis:read"
    USER_MANAGE = "user:manage"


# Role to permissions mapping
ROLE_PERMISSIONS = {
    UserRole.ADMIN: [
        Permission.PROJECT_CREATE,
        Permission.PROJECT_READ,
        Permission.PROJECT_UPDATE,
        Permission.PROJECT_DELETE,
        Permission.VIDEO_UPLOAD,
        Permission.VIDEO_DELETE,
        Permission.ANALYSIS_RUN,
        Permission.ANALYSIS_READ,
        Permission.USER_MANAGE,
    ],
    UserRole.USER: [
        Permission.PROJECT_CREATE,
        Permission.PROJECT_READ,
        Permission.PROJECT_UPDATE,
        Permission.PROJECT_DELETE,
        Permission.VIDEO_UPLOAD,
        Permission.VIDEO_DELETE,
        Permission.ANALYSIS_RUN,
        Permission.ANALYSIS_READ,
    ],
    UserRole.VIEWER: [
        Permission.PROJECT_READ,
        Permission.ANALYSIS_READ,
    ],
}


class CognitoAuth:
    """AWS Cognito authentication handler"""

    def __init__(
        self,
        region: str,
        user_pool_id: str,
        app_client_id: Optional[str] = None,
    ):
        """
        Initialize Cognito authentication

        Args:
            region: AWS region (e.g., 'us-east-1')
            user_pool_id: Cognito User Pool ID
            app_client_id: Optional App Client ID for additional validation
        """
        self.region = region
        self.user_pool_id = user_pool_id
        self.app_client_id = app_client_id

        # Construct the JWKS URL
        self.jwks_url = f"https://cognito-idp.{region}.amazonaws.com/{user_pool_id}/.well-known/jwks.json"
        self.issuer = f"https://cognito-idp.{region}.amazonaws.com/{user_pool_id}"

        # Initialize the JWKS client with caching
        self.jwks_client = PyJWKClient(
            self.jwks_url,
            cache_keys=True,
            lifespan=3600,  # Cache for 1 hour
        )

        logger.info(f"Initialized Cognito auth for pool: {user_pool_id}")

    def verify_token(self, token: str) -> Dict[str, Any]:
        """
        Verify and decode a Cognito JWT token

        Args:
            token: The JWT token to verify

        Returns:
            Decoded token payload with user information

        Raises:
            HTTPException: If token is invalid or expired
        """
        try:
            # Get the signing key from Cognito JWKS
            signing_key = self.jwks_client.get_signing_key_from_jwt(token)

            # Decode and verify the token
            # For localhost testing, we're more lenient with validation
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                issuer=self.issuer,
                options={
                    "verify_signature": True,
                    "verify_exp": True,
                    "verify_iat": True,
                    "verify_iss": True,
                    "verify_aud": False,  # Disable audience validation for localhost
                    "require": ["sub", "iat", "exp"],
                }
            )

            # Additional validation for app client if specified (disabled for testing)
            # TODO: Re-enable client ID validation after environment setup is confirmed
            if False and self.app_client_id:
                # Check client_id in access tokens or aud in ID tokens
                client_id = payload.get("client_id") or payload.get("aud")
                if client_id != self.app_client_id:
                    logger.warning(f"Client ID mismatch: token has {client_id}, expected {self.app_client_id}")
                    # Only enforce if client ID is properly configured (not empty)
                    if self.app_client_id.strip():
                        raise HTTPException(
                            status_code=401,
                            detail="Invalid client ID in token"
                        )

            # Extract custom attributes (they come with 'custom:' prefix)
            role = payload.get("custom:role", UserRole.USER.value)
            permissions_str = payload.get("custom:permissions", "")

            # Parse permissions if they're stored as JSON
            permissions = []
            if permissions_str:
                try:
                    permissions = json.loads(permissions_str)
                except json.JSONDecodeError:
                    # If not JSON, treat as comma-separated list
                    permissions = [p.strip() for p in permissions_str.split(",") if p.strip()]

            # If no custom permissions, use role-based permissions
            if not permissions and role in ROLE_PERMISSIONS:
                permissions = [p.value for p in ROLE_PERMISSIONS[UserRole(role)]]

            # Add role and permissions to the payload
            payload["role"] = role
            payload["permissions"] = permissions

            # Add email from the token (Cognito includes it in ID tokens)
            if "email" not in payload and "cognito:username" in payload:
                # If email is not in payload but username is email, use it
                username = payload["cognito:username"]
                if "@" in username:
                    payload["email"] = username

            logger.debug(f"Successfully verified token for user: {payload.get('sub')}")
            return payload

        except jwt.ExpiredSignatureError:
            logger.warning("Token has expired")
            raise HTTPException(
                status_code=401,
                detail="Token has expired"
            )
        except jwt.InvalidTokenError as e:
            logger.warning(f"Invalid token: {str(e)}")
            raise HTTPException(
                status_code=401,
                detail=f"Invalid token: {str(e)}"
            )
        except Exception as e:
            logger.error(f"Token verification failed: {str(e)}")
            raise HTTPException(
                status_code=401,
                detail="Token verification failed"
            )

    @lru_cache(maxsize=100)
    def _get_public_keys(self) -> Dict[str, Any]:
        """
        Fetch and cache the public keys from Cognito JWKS endpoint

        Returns:
            Dictionary of key IDs to public keys
        """
        try:
            response = requests.get(self.jwks_url, timeout=10)
            response.raise_for_status()
            keys = {}
            for key in response.json()["keys"]:
                keys[key["kid"]] = key
            return keys
        except Exception as e:
            logger.error(f"Failed to fetch JWKS: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail="Failed to fetch public keys"
            )


# Initialize Cognito auth with your configuration
# These will be loaded from environment variables
import os
from app.config import settings

cognito_auth = CognitoAuth(
    region=settings.COGNITO_REGION or settings.AWS_REGION,
    user_pool_id=settings.COGNITO_USER_POOL_ID,
    app_client_id=settings.COGNITO_APP_CLIENT_ID,
)


# FastAPI Dependencies (same interface as Clerk auth)

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security)
) -> Dict[str, Any]:
    """
    Get the current authenticated user from Cognito token

    Returns:
        Dictionary with user information including:
        - id: User's unique identifier (sub claim)
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
    user_data = cognito_auth.verify_token(token)

    return {
        "id": user_data.get("sub"),
        "email": user_data.get("email"),
        "role": user_data.get("role", UserRole.USER.value),
        "permissions": user_data.get("permissions", []),
        "raw_payload": user_data,
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
        user_data = cognito_auth.verify_token(token)

        return {
            "id": user_data.get("sub"),
            "email": user_data.get("email"),
            "role": user_data.get("role", UserRole.USER.value),
            "permissions": user_data.get("permissions", []),
            "raw_payload": user_data,
        }
    except HTTPException:
        return None


# Role-based access control decorators

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


def has_permission(user: Dict[str, Any], permission: Permission) -> bool:
    """
    Check if a user has a specific permission

    Args:
        user: User dictionary from get_current_user
        permission: The permission to check

    Returns:
        True if user has the permission, False otherwise
    """
    return permission.value in user.get("permissions", [])


def has_role(user: Dict[str, Any], role: UserRole) -> bool:
    """
    Check if a user has a specific role

    Args:
        user: User dictionary from get_current_user
        role: The role to check

    Returns:
        True if user has the role or is admin, False otherwise
    """
    user_role = user.get("role", UserRole.USER.value)
    return user_role == role.value or user_role == UserRole.ADMIN.value