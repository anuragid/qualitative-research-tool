"""Clerk authentication with RBAC for FastAPI."""

import base64
import json
import logging
import time
from enum import Enum
from typing import Any, Dict, List, Optional

import httpx
import jwt
import sentry_sdk
from fastapi import HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings

logger = logging.getLogger(__name__)

# Dev bypass constants
DEV_USER_ID = "dev_user_local"
DEV_BYPASS_TOKEN = "dev-bypass"
_is_dev = settings.APP_ENV == "development"

# Defense-in-depth: if APP_ENV is "production", _is_dev must be False.
# main.py also validates at startup, but this catches it at import time.
if settings.APP_ENV == "production" and _is_dev:
    raise RuntimeError(
        "FATAL: _is_dev is True but APP_ENV is 'production'. "
        "This indicates a logic error in environment detection."
    )

# In development, make the bearer token optional so requests with no
# Authorization header don't get an automatic 403 from FastAPI.
security = HTTPBearer(auto_error=not _is_dev)


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

    # TTL for JWKS cache: 1 hour
    JWKS_CACHE_TTL = 3600
    # Maximum age for stale cache before rejecting (24 hours)
    JWKS_MAX_STALE_AGE = 86400

    def __init__(self):
        self.secret_key = settings.CLERK_SECRET_KEY
        self.publishable_key = settings.CLERK_PUBLISHABLE_KEY
        self.jwks_url = None
        self._jwks_headers: Dict[str, str] = {}
        self._cached_keys: Optional[Dict[str, Any]] = None
        self._keys_fetched_at: float = 0.0
        self.is_production = "pk_live" in self.publishable_key

        if self.is_production:
            logger.info("Running with PRODUCTION Clerk keys")
        else:
            logger.warning("Running with DEVELOPMENT Clerk keys - not for production use!")

        logger.info(f"Initializing ClerkAuth with publishable_key: {self.publishable_key[:20]}...")

        # JWKS URL priority: explicit override > Clerk Backend API > derived domain
        if settings.CLERK_JWKS_URL:
            self.jwks_url = settings.CLERK_JWKS_URL
            logger.info(f"Using explicit CLERK_JWKS_URL: {self.jwks_url}")
            if "api.clerk.com" in self.jwks_url and self.secret_key:
                self._jwks_headers = {"Authorization": f"Bearer {self.secret_key}"}
        elif self.secret_key:
            self.jwks_url = "https://api.clerk.com/v1/jwks"
            self._jwks_headers = {"Authorization": f"Bearer {self.secret_key}"}
            logger.info(f"Using Clerk Backend API for JWKS: {self.jwks_url}")
        elif self.publishable_key:
            self._derive_jwks_url()
            logger.info(f"Using derived JWKS URL: {self.jwks_url}")
        else:
            raise ValueError("No Clerk keys configured - cannot determine JWKS URL")

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

    def get_public_keys(self, force_refresh: bool = False) -> Optional[Dict[str, Any]]:
        """Fetch and cache Clerk's public keys for JWT verification.

        Keys are cached for JWKS_CACHE_TTL seconds. Pass force_refresh=True to bypass cache.
        On fetch failure, returns stale cached keys if available (resilience).
        """
        now = time.monotonic()

        # Return cached keys if still valid
        if (
            not force_refresh
            and self._cached_keys is not None
            and (now - self._keys_fetched_at) < self.JWKS_CACHE_TTL
        ):
            return self._cached_keys

        if not self.jwks_url:
            logger.error("JWKS URL not configured")
            return None

        try:
            response = httpx.get(
                self.jwks_url,
                headers=self._jwks_headers,
                timeout=10.0,
            )
            response.raise_for_status()
            jwks = response.json()

            # Convert JWKS to a dict of kid -> key
            keys = {}
            for key in jwks.get("keys", []):
                if key.get("kty") == "RSA" and key.get("use") == "sig":
                    keys[key["kid"]] = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(key))

            if keys:
                logger.info(f"Successfully fetched {len(keys)} public keys from Clerk")
                self._cached_keys = keys
                self._keys_fetched_at = now
            else:
                logger.warning("JWKS response contained no usable RSA signing keys")

            return keys
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP {e.response.status_code} fetching JWKS from {self.jwks_url}")
            if self._cached_keys is not None:
                stale_age = now - self._keys_fetched_at
                if stale_age > self.JWKS_MAX_STALE_AGE:
                    logger.error("JWKS cache is too stale, rejecting")
                    return None
            return self._cached_keys
        except httpx.TimeoutException:
            logger.error(f"Timeout fetching JWKS from {self.jwks_url}")
            if self._cached_keys is not None:
                stale_age = now - self._keys_fetched_at
                if stale_age > self.JWKS_MAX_STALE_AGE:
                    logger.error("JWKS cache is too stale, rejecting")
                    return None
            return self._cached_keys
        except Exception as e:
            logger.error(f"Failed to fetch JWKS: {e}")
            if self._cached_keys is not None:
                stale_age = now - self._keys_fetched_at
                if stale_age > self.JWKS_MAX_STALE_AGE:
                    logger.error("JWKS cache is too stale, rejecting")
                    return None
            return self._cached_keys

    def verify_token(self, token: str, leeway: int = 0) -> Dict[str, Any]:
        """Verify a Clerk JWT token and return the payload with role information.

        Args:
            token: The JWT token string.
            leeway: Seconds of clock-skew tolerance for expiry checks.
                    Use 0 (default) for normal endpoints. Use a larger value
                    for long-running requests like video uploads where the
                    token may expire mid-transfer.
        """
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
                # Force refresh and retry once
                public_keys = self.get_public_keys(force_refresh=True)

                if not public_keys or kid not in public_keys:
                    available = list(public_keys.keys()) if public_keys else []
                    logger.error(f"Token kid {kid} not found. Available: {available}")
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Invalid token: signature verification failed",
                    )

            # Verify the token with Clerk's public key
            payload = jwt.decode(
                token,
                public_keys[kid],
                algorithms=["RS256"],
                options={"verify_aud": False},  # Clerk doesn't use standard aud claim
                leeway=leeway,
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


# Global instance — in development mode, tolerate missing/invalid Clerk keys
# since the dev bypass will handle authentication.
if _is_dev:
    try:
        clerk_auth = ClerkAuth()
    except Exception as e:
        logger.warning(f"ClerkAuth init failed (dev mode, bypass is available): {e}")

        class _NoOpClerkAuth:
            """Stub that raises clear errors if Clerk verification is attempted without valid keys."""
            def verify_token(self, token: str, leeway: int = 0) -> Dict[str, Any]:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Clerk is not configured. Use dev bypass (no auth header) or set Clerk keys.",
                )

        clerk_auth = _NoOpClerkAuth()  # type: ignore[assignment]
else:
    clerk_auth = ClerkAuth()


def _make_get_current_user(leeway: int = 0):
    """Factory for auth dependencies with configurable JWT leeway."""

    async def get_current_user(
        credentials: Optional[HTTPAuthorizationCredentials] = Security(security),
    ) -> Dict[str, Any]:
        """
        Dependency to get the current authenticated user from the JWT token with RBAC info.

        In development mode (APP_ENV=development), a dev bypass is available:
        - No Authorization header at all -> returns dev user
        - Authorization: Bearer dev-bypass -> returns dev user
        - A real Clerk JWT is still verified normally

        Returns:
            Dict containing user information from the JWT payload including role and permissions
        """
        # --- Dev bypass (APP_ENV=development only) ---
        if _is_dev:
            # No credentials supplied at all
            if credentials is None:
                logger.debug("Dev auth bypass: no credentials provided, returning dev user")
                return _dev_user_dict()

            # Explicit dev-bypass token
            if credentials.credentials == DEV_BYPASS_TOKEN:
                logger.debug("Dev auth bypass: dev-bypass token provided, returning dev user")
                return _dev_user_dict()

            # Otherwise fall through to normal Clerk verification so real
            # tokens still work during local development.

        if not credentials:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing authentication credentials",
            )

        token = credentials.credentials
        user_data = clerk_auth.verify_token(token, leeway=leeway)

        # Extract user info from Clerk JWT with RBAC
        user = {
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

        # Tag Sentry events with the authenticated user
        sentry_sdk.set_user({"id": user["id"], "email": user.get("email")})

        return user

    return get_current_user


# Default: strict auth (no leeway) for normal endpoints
get_current_user = _make_get_current_user(leeway=0)

# Upload auth: 5-minute leeway for long video uploads.
# Clerk JWTs have ~60s lifetimes. Large uploads (300-450 MB) take 3-5 min,
# so the token may expire mid-transfer before the server validates it.
get_current_user_upload = _make_get_current_user(leeway=300)


def _dev_user_dict() -> Dict[str, Any]:
    """Return a synthetic user dict for local development."""
    sentry_sdk.set_user({"id": DEV_USER_ID, "email": "dev@localhost"})
    return {
        "id": DEV_USER_ID,
        "email": "dev@localhost",
        "email_verified": True,
        "first_name": "Dev",
        "last_name": "User",
        "username": "dev",
        "session_id": "dev_session",
        "role": UserRole.USER.value,
        "permissions": [p.value for p in ROLE_PERMISSIONS[UserRole.USER]],
        "raw_payload": {},
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


async def get_current_user_id_upload(
    current_user: Dict[str, Any] = Security(get_current_user_upload),
) -> str:
    """Get user ID with upload-tolerant JWT leeway (5 min)."""
    return current_user["id"]


def require_permissions(*required_perms: Permission):
    """Factory for route dependencies that enforce RBAC permissions."""
    async def _check_permissions(
        current_user: Dict[str, Any] = Security(get_current_user),
    ) -> Dict[str, Any]:
        user_perms = set(current_user.get("permissions", []))
        missing = {p.value for p in required_perms} - user_perms
        if missing:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user
    return _check_permissions


def require_permissions_upload(*required_perms: Permission):
    """Like require_permissions but with upload-tolerant JWT leeway."""
    get_current_user_upl = _make_get_current_user(leeway=300)
    async def _check_permissions(
        current_user: Dict[str, Any] = Security(get_current_user_upl),
    ) -> Dict[str, Any]:
        user_perms = set(current_user.get("permissions", []))
        missing = {p.value for p in required_perms} - user_perms
        if missing:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user
    return _check_permissions


