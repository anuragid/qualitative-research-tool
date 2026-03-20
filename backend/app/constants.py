"""Shared constants used across routes and services."""

# ── Recommended model tiers (easy to update in one place) ────────────────
RECOMMENDED_MODELS = {
    "standard": {
        "id": "meta-llama/llama-4-scout",
        "name": "Llama 4 Scout",
        "description": "Included model -- no API key needed",
    },
    "advanced": {
        "id": "anthropic/claude-sonnet-4.6",
        "name": "Claude Sonnet 4.6",
        "description": "Premium model -- requires your own API key",
    },
}

# ── Standard models (included, paid by Methodex shared key) ──────────────
# These are cheap open-source models that don't require students to pay.
# Llama family: best cost/quality ratio for qualitative research analysis.
AVAILABLE_MODELS = [
    {"id": "meta-llama/llama-4-scout", "name": "Llama 4 Scout", "tier": "standard"},
    {"id": "meta-llama/llama-3.3-70b-instruct", "name": "Llama 3.3 70B", "tier": "standard"},
    {"id": "anthropic/claude-sonnet-4.6", "name": "Claude Sonnet 4.6", "tier": "premium"},
    {"id": "anthropic/claude-opus-4.6", "name": "Claude Opus 4.6", "tier": "premium"},
    {"id": "openai/gpt-5.4", "name": "GPT-5.4", "tier": "premium"},
    {"id": "google/gemini-3.1-pro-preview", "name": "Gemini 3.1 Pro", "tier": "premium"},
]

STANDARD_MODEL_IDS = {m["id"] for m in AVAILABLE_MODELS if m["tier"] == "standard"}
