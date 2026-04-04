"""Periodic task to validate that our standard models still exist on OpenRouter.

Celery Beat runs this every 6 hours.  It fetches the full model list from
OpenRouter, checks which of our STANDARD_MODELS are still available, and
caches the valid set in Redis.  Routes and the LLM service read from that
cache so deprecated models are automatically excluded.
"""

import logging

import httpx
import sentry_sdk

from app.config import settings
from app.constants import STANDARD_MODELS
from app.services.model_cache import set_valid_models
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)

OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models"


@celery_app.task(name="validate_openrouter_models", ignore_result=True)
def validate_openrouter_models():
    """Fetch the OpenRouter model catalogue and update the valid-models cache."""
    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.get(
                OPENROUTER_MODELS_URL,
                headers={"Authorization": f"Bearer {settings.OPENROUTER_API_KEY}"},
            )
            resp.raise_for_status()
            available = {m["id"] for m in resp.json().get("data", [])}

    except httpx.HTTPError as e:
        logger.error(f"Failed to fetch OpenRouter models: {e}")
        # Don't clear the cache on transient failures — stale data is better
        # than no data.
        return

    our_ids = [m["id"] for m in STANDARD_MODELS]
    valid = [mid for mid in our_ids if mid in available]
    deprecated = [mid for mid in our_ids if mid not in available]

    if deprecated:
        msg = f"Standard models no longer on OpenRouter: {deprecated}"
        logger.warning(msg)
        sentry_sdk.capture_message(msg, level="warning")

    set_valid_models(valid)
    logger.info(
        f"Model validation complete: {len(valid)}/{len(our_ids)} standard models valid"
    )
