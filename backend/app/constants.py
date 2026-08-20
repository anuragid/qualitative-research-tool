"""Shared constants used across routes and services."""

# ── Standard models (included, paid by Methodex shared key) ──────────────
# Open-source models that students use without paying via the shared key.
# DeepSeek V3.2 is the primary: $0.269 in / $0.400 out per 1M tokens. It
# supersedes v3-0324 (same $0.25 in but $1.00 out -- 2.5x the output price,
# which dominates our bill because the nodes generate 16-32K-token responses).
# v3.2 advertises a 65536 output cap, comfortably above infer's 32K request,
# so it needs no _MODEL_OUTPUT_CAPS entry. v3-0324 is retained at position 1
# as a proven-good fallback -- previously the chain fell straight from the
# primary to two models that never work.
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
    {"id": "deepseek/deepseek-v3.2", "name": "DeepSeek V3.2", "provider": "DeepSeek", "tier": "standard"},
    {"id": "deepseek/deepseek-chat-v3-0324", "name": "DeepSeek V3", "provider": "DeepSeek", "tier": "standard"},
    {"id": "meta-llama/llama-4-scout", "name": "Llama 4 Scout", "provider": "Meta", "tier": "standard"},
    {"id": "nvidia/nemotron-3-super-120b-a12b", "name": "Nemotron 3 Super 120B", "provider": "NVIDIA", "tier": "standard"},
]

STANDARD_MODEL_IDS = {m["id"] for m in STANDARD_MODELS}

# Default model used when no preference is set
DEFAULT_STANDARD_MODEL = STANDARD_MODELS[0]["id"]  # DeepSeek V3.2

# Ordered fallback chain for the Methodex shared key.
# If the primary model is rate-limited/unavailable, try the next.
STANDARD_MODEL_FALLBACKS = [m["id"] for m in STANDARD_MODELS]

# Models that are kept in the fallback chain as last-ditch options but must
# NEVER be the primary/default: both are documented above as returning NULL
# content, so making either the default burns a full round-trip (~6 min/step)
# on every request before falling back. Railway had DEFAULT_MODEL set to Scout
# for ~2 months, silently undoing the fix that reordered this chain. Settings
# validates DEFAULT_MODEL against this set so that can't happen silently again.
DEMOTED_MODELS = {
    "meta-llama/llama-4-scout",
    "nvidia/nemotron-3-super-120b-a12b",
}

# ── Model tier constants ────────────────────────────────────────────────
MODEL_TIER_INCLUDED = "included"
MODEL_TIER_BYOK = "byok"

# ── Recommended model per tier (shown in the settings dialog) ────────────
RECOMMENDED_MODELS = {
    "standard": {
        "id": DEFAULT_STANDARD_MODEL,
        "name": "DeepSeek V3.2",
        "description": "Included -- no API key needed",
    },
    "advanced": {
        "id": "anthropic/claude-sonnet-4.6",
        "name": "Claude Sonnet 4.6",
        "description": "Premium -- requires your own API key",
    },
}
