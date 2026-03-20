"""Shared constants used across routes and services."""

# ── Standard models (included, paid by Methodex shared key) ──────────────
# Cheap open-source models that students use without paying.
# ~$0.03-0.09 per analysis via the shared key.
STANDARD_MODELS = [
    {"id": "meta-llama/llama-4-scout", "name": "Llama 4 Scout", "provider": "Meta"},
    {"id": "nvidia/nemotron-3-super-120b-a12b", "name": "Nemotron 3 Super 120B", "provider": "NVIDIA"},
    {"id": "mistralai/ministral-8b", "name": "Ministral 8B", "provider": "Mistral"},
    {"id": "deepseek/deepseek-chat-v3-0324", "name": "DeepSeek V3", "provider": "DeepSeek"},
]

STANDARD_MODEL_IDS = {m["id"] for m in STANDARD_MODELS}

# Default model used when no preference is set
DEFAULT_STANDARD_MODEL = STANDARD_MODELS[0]["id"]  # Llama 4 Scout

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
