"""Clerk authentication with RBAC for FastAPI."""

from typing import Optional, Dict, Any, List
from enum import Enum
from fastapi import HTTPException, Security, status, Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt
import httpx
from functools import lru_cache
import json
import logging
import base64
from app.config import settings

logger = logging.getLogger(__name__)

# Security scheme for FastAPI docs
security = HTTPBearer()


class UserRole(str, Enum):
    """User roles for RBAC."""
    ADMIN = "admin"
    USER = "user"
    VIEWER = "viewer"


class Permission(str, Enum):
    """Granular permissions."""
    # Project permissions
    PROJECT_CREATE = "project:create"
    PROJECT_READ = "project:read"
    PROJECT_UPDATE = "project:update"
    PROJECT_DELETE = "project:delete"

    # Video permissions
    VIDEO_UPLOAD = "video:upload"
    VIDEO_DELETE = "video:delete"

    # Analysis permissions
    ANALYSIS_RUN = "analysis:run"
    ANALYSIS_READ = "analysis:read"

    # User management
    USER_MANAGE = "user:manage"


# Role to permissions mapping
ROLE_PERMISSIONS: Dict[UserRole, List[Permission]] = {
    UserRole.ADMIN: [p for p in Permission],  # All permissions
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


class ClerkAuth:
    """Production-ready Clerk authentication with JWKS verification."""

    def __init__(self):
        self.secret_key = settings.CLERK_SECRET_KEY
        self.publishable_key = settings.CLERK_PUBLISHABLE_KEY
        self.jwks_url = None
        self.is_production = "pk_live" in self.publishable_key

        if self.is_production:
            logger.info("🔒 Running with PRODUCTION Clerk keys")
        else:
            logger.warning("⚠️  Running with DEVELOPMENT Clerk keys - not for production use!")

        logger.info(f"Initializing ClerkAuth with publishable_key: {self.publishable_key[:20]}...")

        if self.publishable_key:
            self._derive_jwks_url()

    def _derive_jwks_url(self):
        """Derive JWKS URL from Clerk publishable key."""
        key_parts = self.publishable_key.replace("pk_test_", "").replace("pk_live_", "")

        try:
            # Add padding for base64 decoding
            missing_padding = len(key_parts) % 4
            if missing_padding:
                key_parts += '=' * (4 - missing_padding)

            # Decode the base64 encoded domain
            decoded = base64.b64decode(key_parts).decode('utf-8')
            domain = decoded.rstrip('$')

            self.jwks_url = f"https://{domain}/.well-known/jwks.json"
            logger.info(f"Derived JWKS URL: {self.jwks_url}")
        except Exception as e:
            logger.error(f"Failed to decode publishable key: {e}")
            raise ValueError(f"Invalid Clerk publishable key format: {e}")

    @lru_cache(maxsize=1)
    def get_public_keys(self) -> Optional[Dict[str, Any]]:
        """Fetch and cache Clerk's public keys for JWT verification."""
        if not self.jwks_url:
            logger.error("JWKS URL not configured")
            return None

        try:
            response = httpx.get(self.jwks_url, timeout=10.0)
            response.raise_for_status()
            jwks = response.json()

            # Convert JWKS to a dict of kid -> key
            keys = {}
            for key in jwks.get("keys", []):
                if key.get("kty") == "RSA" and key.get("use") == "sig":
                    keys[key["kid"]] = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(key))

            logger.info(f"Successfully fetched {len(keys)} public keys from Clerk")
            return keys
        except httpx.TimeoutException:
            logger.error("Timeout fetching JWKS from Clerk")
            return None
        except Exception as e:
            logger.error(f"Failed to fetch JWKS: {e}")
            return None

    def verify_token(self, token: str) -> Dict[str, Any]:
        """Verify a Clerk JWT token and return the payload with role information."""
        try:
            # Decode without verification to get the header
            unverified = jwt.get_unverified_header(token)
            kid = unverified.get("kid")

            if not kid:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token: missing kid in header",
                )

            # Get public keys
            public_keys = self.get_public_keys()

            if not public_keys or kid not in public_keys:
                # Clear cache and retry once
                self.get_public_keys.cache_clear()
                public_keys = self.get_public_keys()

                if not public_keys or kid not in public_keys:
                    logger.error(f"Token kid {kid} not found. Available: {list(public_keys.keys()) if public_keys else 'None'}")
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Invalid token: signature verification failed",
                    )

            # Verify the token with Clerk's public key
            payload = jwt.decode(
                token,
                public_keys[kid],
                algorithms=["RS256"],
                options={"verify_aud": False}  # Clerk doesn't use standard aud claim
            )

            # Extract role from metadata or default to 'user'
            role = payload.get("role", payload.get("public_metadata", {}).get("role", "user"))

            # Ensure role is valid
            try:
                role_enum = UserRole(role)
            except ValueError:
                logger.warning(f"Invalid role '{role}' for user {payload.get('sub')}, defaulting to 'user'")
                role_enum = UserRole.USER

            logger.debug(f"Token verified for user: {payload.get('sub')}, role: {role_enum.value}")

            # Add role to payload
            payload["role"] = role_enum.value
            payload["permissions"] = [p.value for p in ROLE_PERMISSIONS[role_enum]]

            return payload

        except jwt.ExpiredSignatureError:
            logger.warning("Expired token presented")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired",
            )
        except jwt.InvalidTokenError as e:
            logger.warning(f"Invalid token: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token",
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Unexpected authentication error: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Authentication service error",
            )


# Global instance
clerk_auth = ClerkAuth()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> Dict[str, Any]:
    """
    Dependency to get the current authenticated user from the JWT token with RBAC info.

    Returns:
        Dict containing user information from the JWT payload including role and permissions
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication credentials",
        )

    token = credentials.credentials
    user_data = clerk_auth.verify_token(token)

    # Extract user info from Clerk JWT with RBAC
    return {
        "id": user_data.get("sub"),  # Clerk user ID
        "email": user_data.get("email"),
        "email_verified": user_data.get("email_verified"),
        "first_name": user_data.get("first_name"),
        "last_name": user_data.get("last_name"),
        "username": user_data.get("username"),
        "session_id": user_data.get("sid"),
        "role": user_data.get("role", "user"),  # User role for RBAC
        "permissions": user_data.get("permissions", []),  # User permissions
        "raw_payload": user_data,  # Keep the full payload for reference
    }


async def get_current_user_id(
    current_user: Dict[str, Any] = Security(get_current_user),
) -> str:
    """
    Dependency to get just the user ID.

    Returns:
        The Clerk user ID as a string
    """
    return current_user["id"]


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security),
) -> Optional[Dict[str, Any]]:
    """
    Optional authentication - returns user if authenticated, None otherwise.
    Useful for endpoints that have different behavior for authenticated vs anonymous users.
    """
    if not credentials:
        return None

    try:
        token = credentials.credentials
        user_data = clerk_auth.verify_token(token)
        return {
            "id": user_data.get("sub"),
            "email": user_data.get("email"),
            "email_verified": user_data.get("email_verified"),
            "first_name": user_data.get("first_name"),
            "last_name": user_data.get("last_name"),
            "username": user_data.get("username"),
            "session_id": user_data.get("sid"),
            "role": user_data.get("role", "user"),
            "permissions": user_data.get("permissions", []),
            "raw_payload": user_data,
        }
    except:
        return None


# RBAC Helper Functions

def require_role(required_role: UserRole):
    """
    Dependency factory to require a specific role.

    Usage:
        @router.delete("/admin/users/{user_id}")
        async def delete_user(
            user_id: str,
            current_user: Dict = Depends(require_role(UserRole.ADMIN))
        ):
            # Only admins can access this endpoint
            pass
    """
    async def check_role(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
        user_role = current_user.get("role", "user")

        # Admin can access everything
        if user_role == UserRole.ADMIN.value:
            return current_user

        if user_role != required_role.value:
            logger.warning(
                f"User {current_user.get('id')} with role '{user_role}' attempted to access "
                f"endpoint requiring role '{required_role.value}'"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role: {required_role.value}",
            )

        return current_user

    return check_role


def require_permission(required_permission: Permission):
    """
    Dependency factory to require a specific permission.

    Usage:
        @router.post("/projects")
        async def create_project(
            project_data: ProjectCreate,
            current_user: Dict = Depends(require_permission(Permission.PROJECT_CREATE))
        ):
            # Only users with project:create permission can access
            pass
    """
    async def check_permission(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
        user_permissions = current_user.get("permissions", [])

        if required_permission.value not in user_permissions:
            logger.warning(
                f"User {current_user.get('id')} with permissions {user_permissions} attempted to access "
                f"endpoint requiring permission '{required_permission.value}'"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required permission: {required_permission.value}",
            )

        return current_user

    return check_permission


def require_any_permission(*required_permissions: Permission):
    """
    Dependency factory to require ANY of the specified permissions.

    Usage:
        @router.get("/projects/{project_id}")
        async def get_project(
            project_id: str,
            current_user: Dict = Depends(require_any_permission(
                Permission.PROJECT_READ,
                Permission.PROJECT_UPDATE
            ))
        ):
            # User needs either project:read OR project:update
            pass
    """
    async def check_permissions(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
        user_permissions = current_user.get("permissions", [])
        required_perms = [p.value for p in required_permissions]

        if not any(perm in user_permissions for perm in required_perms):
            logger.warning(
                f"User {current_user.get('id')} with permissions {user_permissions} attempted to access "
                f"endpoint requiring one of {required_perms}"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required one of: {', '.join(required_perms)}",
            )

        return current_user

    return check_permissions


def has_permission(user: Dict[str, Any], permission: Permission) -> bool:
    """
    Check if a user has a specific permission.
    Useful for conditional logic within route handlers.

    Usage:
        if has_permission(current_user, Permission.PROJECT_DELETE):
            # Show delete button
            pass
    """
    return permission.value in user.get("permissions", [])


def has_role(user: Dict[str, Any], role: UserRole) -> bool:
    """
    Check if a user has a specific role.

    Args:
        user: User dictionary from get_current_user
        role: The role to check

    Returns:
        True if user has the role or is admin, False otherwise
    """
    user_role = user.get("role", UserRole.USER.value)
    return user_role == role.value or user_role == UserRole.ADMIN.value