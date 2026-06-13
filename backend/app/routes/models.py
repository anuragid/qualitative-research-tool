"""Model discovery routes — recommended models and OpenRouter search proxy."""

import logging
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, Query

from app.auth_bridge import Permission, require_permissions
from app.config import settings
from app.constants import RECOMMENDED_MODELS
from app.services.model_cache import get_valid_model_ids

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/recommended")
def get_recommended_models(
    _current_user: Dict[str, Any] = Depends(require_permissions(Permission.PROJECT_READ)),
):
    """Return the currently recommended standard and advanced models.

    If the periodic validation task has flagged the standard model as
    deprecated, falls back to the first still-valid standard model.
    """
    valid_ids = get_valid_model_ids()
    result = dict(RECOMMENDED_MODELS)

    if valid_ids is not None:
        std = result["standard"]
        if std["id"] not in valid_ids and valid_ids:
            # Current recommended standard model is deprecated — pick first valid one
            from app.constants import STANDARD_MODELS
            for m in STANDARD_MODELS:
                if m["id"] in valid_ids:
                    result["standard"] = {
                        "id": m["id"],
                        "name": m["name"],
                        "description": std["description"],
                    }
                    break

    return result


@router.get("/search")
async def search_models(
    q: str = Query("", min_length=0, max_length=200),
    free_only: bool = Query(False),
    _current_user: Dict[str, Any] = Depends(require_permissions(Permission.PROJECT_READ)),
):
    """Proxy search to OpenRouter /api/v1/models and return formatted results.

    Keeps the server-side OpenRouter API key private and avoids CORS issues.

    When ``free_only=True``, results are restricted to models with zero pricing
    (prompt and completion both $0).  The frontend should set this for users
    who have not provided a BYOK API key.
    """
    # Return empty list for empty/whitespace-only queries to avoid returning all models
    if not q or not q.strip():
        return []

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://openrouter.ai/api/v1/models",
                headers={
                    "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                },
            )
            if resp.status_code != 200:
                logger.warning(f"OpenRouter models endpoint returned {resp.status_code}")
                return []

            data = resp.json()
            models_list: List[Dict[str, Any]] = data.get("data", [])

    except httpx.HTTPError as e:
        logger.error(f"OpenRouter models request failed: {e}")
        return []

    # Filter by query string (case-insensitive match on id or name)
    query_lower = q.strip().lower()
    results: List[Dict[str, Any]] = []

    for m in models_list:
        model_id: str = m.get("id", "")
        model_name: str = m.get("name", model_id)

        if query_lower and query_lower not in model_id.lower() and query_lower not in model_name.lower():
            continue

        # Determine provider from the model id prefix (e.g. "anthropic/claude-..." -> "Anthropic")
        provider = model_id.split("/")[0].replace("-", " ").title() if "/" in model_id else ""

        # Determine if free (pricing is 0 for both prompt and completion)
        pricing = m.get("pricing") or {}
        try:
            prompt_price = float(pricing.get("prompt", "1") or "1")
        except (ValueError, TypeError):
            prompt_price = 1.0
        try:
            completion_price = float(pricing.get("completion", "1") or "1")
        except (ValueError, TypeError):
            completion_price = 1.0
        is_free = prompt_price == 0 and completion_price == 0

        # Gate: non-BYOK users only see free models
        if free_only and not is_free:
            continue

        try:
            context_length: Optional[int] = int(m.get("context_length") or 0) or None
        except (ValueError, TypeError):
            context_length = None

        results.append({
            "id": model_id,
            "name": model_name,
            "provider": provider,
            "context_length": context_length,
            "is_free": is_free,
        })

        if len(results) >= 20:
            break

    return results
