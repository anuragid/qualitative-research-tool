"""Redis-backed cache for validated OpenRouter models.

The periodic validate_openrouter_models task writes to this cache;
routes and the LLM service read from it.  Falls back to the hardcoded
constants when the cache is empty (e.g. first boot, Redis unavailable).
"""

import json
import logging
from typing import List, Optional, Set

import redis

from app.config import settings
from app.constants import STANDARD_MODEL_FALLBACKS, STANDARD_MODELS

logger = logging.getLogger(__name__)

_CACHE_KEY = "methodex:valid_standard_models"
_CACHE_TTL = 25 * 3600  # 25 hours — survives a few missed beat runs


def _get_redis() -> redis.Redis:
    return redis.from_url(settings.REDIS_URL, decode_responses=True)


def set_valid_models(model_ids: List[str]) -> None:
    """Store the set of validated standard model IDs in Redis."""
    try:
        r = _get_redis()
        r.set(_CACHE_KEY, json.dumps(model_ids), ex=_CACHE_TTL)
    except redis.RedisError as e:
        logger.warning(f"Failed to write model cache: {e}")


def get_valid_model_ids() -> Optional[Set[str]]:
    """Return cached valid model IDs, or None if cache is empty/unavailable."""
    try:
        r = _get_redis()
        raw = r.get(_CACHE_KEY)
        if raw:
            return set(json.loads(raw))
    except (redis.RedisError, json.JSONDecodeError) as e:
        logger.warning(f"Failed to read model cache: {e}")
    return None


def get_valid_standard_models() -> list:
    """Return STANDARD_MODELS filtered to only currently valid ones.

    Falls back to the full hardcoded list when the cache is unavailable.
    """
    valid_ids = get_valid_model_ids()
    if valid_ids is None:
        return STANDARD_MODELS
    return [m for m in STANDARD_MODELS if m["id"] in valid_ids]


def get_valid_fallbacks() -> List[str]:
    """Return STANDARD_MODEL_FALLBACKS filtered to only currently valid ones.

    Falls back to the full hardcoded list when the cache is unavailable.
    """
    valid_ids = get_valid_model_ids()
    if valid_ids is None:
        return STANDARD_MODEL_FALLBACKS
    return [m for m in STANDARD_MODEL_FALLBACKS if m in valid_ids]
