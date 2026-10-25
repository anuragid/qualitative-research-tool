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
#   - Nemotron 3 Super 120B: a reasoning model whose thinking tokens count
#     against max_tokens, and one of its OpenRouter providers (DeepInfra) caps
#     output at 16384. With the nodes' 16K-32K requests it spends the whole
#     budget thinking and returns NULL (or truncated JSON) with
#     finish_reason=length, after 5-13 minutes per call (production,
#     2026-10-24). See _MODEL_OUTPUT_LIMITS in services/llm_service.py.
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

# ── Analysis step time budgets (seconds) ────────────────────────────────
# The worker runs --pool=threads, which cannot enforce Celery's
# task_time_limit, so these budgets are what actually bound a step. They form
# one chain of inequalities, locked by tests/test_celery_lifecycle.py:
#
#   STEP_MAX_RUNTIME < STEP_LEASE_TTL < BROKER_VISIBILITY_TIMEOUT
#                                     < ANALYSIS_STALL_TIMEOUT (watchdog)
#
# - A step attempt stops starting LLM work at STEP_DEADLINE. The slowest way
#   past it is an HTTP read that stalls right after the last byte arrived,
#   which httpx can hold for up to one LLM_READ_TIMEOUT, so the worst-case run
#   is STEP_DEADLINE + LLM_READ_TIMEOUT.
# - The step lease (app/tasks/step_guard.py) must outlive the longest run, so a
#   redelivered copy always sees it, and expire before the broker redelivers,
#   so a run whose worker died is picked up again.
# - The broker only redelivers an unacked message after
#   BROKER_VISIBILITY_TIMEOUT, so a live run always acks first.
# - The watchdog only errors an analysis that has shown no step activity for
#   ANALYSIS_STALL_TIMEOUT, so a run whose worker died is redelivered (and
#   shows activity again) before the watchdog gives up on it.
#
# Sized from production on 2026-10-24: DeepSeek V3.2 took 4m19s to write the
# chunk step's ~14K-token answer (~55 tokens/s), so infer's 32K budget needs up
# to ~10 minutes, which is LLM_CALL_TIMEOUT.
LLM_READ_TIMEOUT_SECONDS = 300  # longest gap between two received bytes
LLM_CALL_TIMEOUT_SECONDS = 600  # total wall time for one HTTP call to one model
STEP_DEADLINE_SECONDS = 720  # all LLM calls of one step attempt, fallbacks included
STEP_MAX_RUNTIME_SECONDS = STEP_DEADLINE_SECONDS + LLM_READ_TIMEOUT_SECONDS
STEP_LEASE_TTL_SECONDS = STEP_MAX_RUNTIME_SECONDS + 60
BROKER_VISIBILITY_TIMEOUT_SECONDS = 1200
ANALYSIS_STALL_TIMEOUT_SECONDS = BROKER_VISIBILITY_TIMEOUT_SECONDS + 300

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
