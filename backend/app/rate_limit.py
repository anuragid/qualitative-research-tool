"""Rate-limit primitives — isolated to break the ``app.main`` ↔ ``app.routes.*``
circular import.

Background
----------
``app.main`` used to own the ``limiter`` instance directly, and every
``app/routes/*.py`` did ``from app.main import limiter`` at module load
time. Together with ``app/routes/__init__.py``'s eager ``from app.routes
import models, projects, ...``, that formed a cycle that only surfaced
when something other than ``app.main`` was the first thing Python
imported from ``app.routes`` — causing the production
``AttributeError: partially initialized module 'app.routes.projects' has
no attribute 'router'`` crash (Sentry PYTHON-FASTAPI-X).

Pulling the limiter and its key function into their own leaf module
removes the cycle entirely: ``app.main`` and each route now both import
from ``app.rate_limit``, and ``app.rate_limit`` imports nothing from
either.

The regression is guarded by ``tests/test_import_order.py``.
"""

from __future__ import annotations

import base64
import json

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings


def _get_rate_limit_key(request: Request) -> str:
    """Extract a rate-limit key from the request.

    For authenticated requests, use the user's ID (``sub`` claim from the JWT)
    so rate limits are per-user rather than per-IP.  This prevents all users
    behind a shared proxy/CDN (e.g. Cloudflare) from sharing one bucket.

    For unauthenticated endpoints (health, Clerk proxy), fall back to IP.

    This function intentionally does *not* verify the JWT signature -- it only
    base64-decodes the payload to read the ``sub`` claim.  This is acceptable
    because rate limiting is a best-effort defense, not an auth mechanism.
    """
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        try:
            # JWT structure: header.payload.signature
            parts = token.split(".")
            if len(parts) == 3:
                payload_b64 = parts[1]
                # Add padding for base64
                padding = 4 - len(payload_b64) % 4
                if padding != 4:
                    payload_b64 += "=" * padding
                payload = json.loads(base64.urlsafe_b64decode(payload_b64))
                sub = payload.get("sub")
                if sub and isinstance(sub, str):
                    return f"user:{sub}"
        except Exception:
            # Any decode error -- fall back to IP silently.
            pass

    return get_remote_address(request)


# Rate limiter — uses settings for default limit
limiter = Limiter(
    key_func=_get_rate_limit_key,
    default_limits=[settings.RATE_LIMIT_DEFAULT],
)
