"""Shared constants used across routes and services."""

# ── Recommended model tiers (easy to update in one place) ────────────────
RECOMMENDED_MODELS = {
    "standard": {
        "id": "nvidia/nemotron-3-super-120b-a12b:free",
        "name": "Nemotron 3 Super 120B",
        "description": "High-quality free model -- no API key needed",
    },
    "advanced": {
        "id": "anthropic/claude-sonnet-4.6",
        "name": "Claude Sonnet 4.6",
        "description": "Premium model -- requires your own API key",
    },
}

# ── Available models exposed by GET/PUT /settings ────────────────────────
AVAILABLE_MODELS = [
    {"id": "nvidia/nemotron-3-super-120b-a12b:free", "name": "Nemotron 3 Super 120B", "tier": "free"},
    {"id": "qwen/qwen3.5-flash-02-23", "name": "Qwen 3.5 Flash", "tier": "free"},
    {"id": "stepfun/step-3.5-flash:free", "name": "Step 3.5 Flash", "tier": "free"},
    {"id": "z-ai/glm-5", "name": "GLM-5", "tier": "free"},
    {"id": "anthropic/claude-sonnet-4.6", "name": "Claude Sonnet 4.6", "tier": "premium"},
    {"id": "anthropic/claude-opus-4.6", "name": "Claude Opus 4.6", "tier": "premium"},
    {"id": "openai/gpt-5.4", "name": "GPT-5.4", "tier": "premium"},
    {"id": "google/gemini-3.1-pro-preview", "name": "Gemini 3.1 Pro", "tier": "premium"},
]

FREE_MODEL_IDS = {m["id"] for m in AVAILABLE_MODELS if m["tier"] == "free"}
