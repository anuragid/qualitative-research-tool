"""Shared constants used across routes and services."""

# ── Standard models (included, paid by Methodex shared key) ──────────────
# Cheap open-source models that students use without paying.
# ~$0.03-0.09 per analysis via the shared key.
STANDARD_MODELS = [
    {"id": "meta-llama/llama-4-scout", "name": "Llama 4 Scout", "provider": "Meta", "tier": "standard"},
    {"id": "nvidia/nemotron-3-super-120b-a12b", "name": "Nemotron 3 Super 120B", "provider": "NVIDIA", "tier": "standard"},
    {"id": "deepseek/deepseek-chat-v3-0324", "name": "DeepSeek V3", "provider": "DeepSeek", "tier": "standard"},
]

STANDARD_MODEL_IDS = {m["id"] for m in STANDARD_MODELS}

# Default model used when no preference is set
DEFAULT_STANDARD_MODEL = STANDARD_MODELS[0]["id"]  # Llama 4 Scout

# Ordered fallback chain for the Methodex shared key.
# If the primary model is rate-limited/unavailable, try the next.
FREE_MODEL_FALLBACKS = [m["id"] for m in STANDARD_MODELS]

# ── Recommended model per tier (shown in the settings dialog) ────────────
RECOMMENDED_MODELS = {
    "standard": {
        "id": DEFAULT_STANDARD_MODEL,
        "name": "Llama 4 Scout",
        "description": "Included -- no API key needed",
    },
    "advanced": {
        "id": "anthropic/claude-sonnet-4.6",
        "name": "Claude Sonnet 4.6",
        "description": "Premium -- requires your own API key",
    },
}
