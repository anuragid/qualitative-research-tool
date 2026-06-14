"""Validate OpenRouter API keys against the OpenRouter auth endpoint."""

import logging

import httpx

logger = logging.getLogger(__name__)

OPENROUTER_AUTH_URL = "https://openrouter.ai/api/v1/auth/key"


def validate_openrouter_key_sync(api_key: str) -> bool:
    """Synchronous version for use in Celery workers."""
    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.get(
                OPENROUTER_AUTH_URL,
                headers={"Authorization": f"Bearer {api_key}"},
            )
            if response.status_code == 200:
                return True
            logger.warning(f"OpenRouter key validation failed: HTTP {response.status_code}")
            return False
    except httpx.HTTPError as e:
        logger.error(f"OpenRouter key validation request failed: {e}")
        return False
