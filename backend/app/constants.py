"""Shared constants used across routes and services."""

# ── Standard models (included, paid by Methodex shared key) ──────────────
# Open-source models that students use without paying via the shared key.
# DeepSeek V3 is the primary: $0.20 in / $0.77 out per 1M tokens, ~$0.03-0.09
# per analysis. It does all the real work today and reliably returns content.
#
# ORDER MATTERS: this list is the fallback chain (see STANDARD_MODEL_FALLBACKS)
# and position 0 is the default (see DEFAULT_STANDARD_MODEL). DeepSeek is first
# because the other two ALWAYS fail before producing usable output and only
# waste retries (~6 min/step end-to-end). They are kept solely as last-ditch
# fallbacks for the rare case DeepSeek itself is rate-limited:
#   - Llama 4 Scout: returns NULL content with finish_reason=stop on every
#     call (no usable output) → wasted retries → fallback.
#   - Nemotron 3 Super 120B: ~16K output cap, so the nodes' large max_tokens
#     requests (e.g. infer=32K, chunk/explain/relate=16K) blow past it and it
#     returns NULL with finish_reason=length → wasted retries → fallback.
# See fix/default-model-chain-ordering for the e2e evidence.
STANDARD_MODELS = [
    {"id": "deepseek/deepseek-chat-v3-0324", "name": "DeepSeek V3", "provider": "DeepSeek", "tier": "standard"},
    {"id": "meta-llama/llama-4-scout", "name": "Llama 4 Scout", "provider": "Meta", "tier": "standard"},
    {"id": "nvidia/nemotron-3-super-120b-a12b", "name": "Nemotron 3 Super 120B", "provider": "NVIDIA", "tier": "standard"},
]

STANDARD_MODEL_IDS = {m["id"] for m in STANDARD_MODELS}

# Default model used when no preference is set
DEFAULT_STANDARD_MODEL = STANDARD_MODELS[0]["id"]  # DeepSeek V3

# Ordered fallback chain for the Methodex shared key.
# If the primary model is rate-limited/unavailable, try the next.
STANDARD_MODEL_FALLBACKS = [m["id"] for m in STANDARD_MODELS]

# ── Model tier constants ────────────────────────────────────────────────
MODEL_TIER_INCLUDED = "included"
MODEL_TIER_BYOK = "byok"

# ── Recommended model per tier (shown in the settings dialog) ────────────
RECOMMENDED_MODELS = {
    "standard": {
        "id": DEFAULT_STANDARD_MODEL,
        "name": "DeepSeek V3",
        "description": "Included -- no API key needed",
    },
    "advanced": {
        "id": "anthropic/claude-sonnet-4.6",
        "name": "Claude Sonnet 4.6",
        "description": "Premium -- requires your own API key",
    },
}
