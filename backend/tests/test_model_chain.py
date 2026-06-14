"""Tests for the standard (shared-key) model chain ordering.

Regression guard for the production performance bug fixed in
fix/default-model-chain-ordering: the paid-default model chain used to order
two structurally-unsuitable models AHEAD of the only reliable one. For a user
with no BYOK key and no preferred model, EVERY analysis step walked the whole
chain:

  - meta-llama/llama-4-scout (was position 0) → NULL content, finish_reason=stop
  - nvidia/nemotron-3-super-120b-a12b (was position 1) → NULL content,
    finish_reason=length (its ~16K output cap is blown by the nodes' large
    max_tokens requests)
  - deepseek/deepseek-chat-v3-0324 (was position 2) → SUCCEEDS

That wasted ~6 min/step (up to 3 tenacity retries × ~300s timeout each on the
two doomed models), turning the full pipeline into ~1.75 hr vs the <15 min SLO.
DeepSeek already does all the real work — it just needed to be first in line.

These tests pin DeepSeek as the primary so a future edit can't silently
re-promote Scout/Nemotron and reintroduce the regression.
"""

from app.config import settings
from app.constants import (
    DEFAULT_STANDARD_MODEL,
    RECOMMENDED_MODELS,
    STANDARD_MODEL_FALLBACKS,
    STANDARD_MODELS,
)

DEEPSEEK = "deepseek/deepseek-chat-v3-0324"
SCOUT = "meta-llama/llama-4-scout"
NEMOTRON = "nvidia/nemotron-3-super-120b-a12b"


def test_deepseek_is_the_primary_standard_model():
    """DeepSeek V3 must be position 0 of STANDARD_MODELS — it is the only
    model that reliably returns usable content for our nodes' large outputs."""
    assert STANDARD_MODELS[0]["id"] == DEEPSEEK, (
        "DeepSeek V3 must be the first/primary standard model. Scout and "
        "Nemotron always fail before producing usable output and only waste "
        "retries (~6 min/step)."
    )


def test_default_standard_model_is_deepseek():
    """The no-preference default resolves to DeepSeek V3."""
    assert DEFAULT_STANDARD_MODEL == DEEPSEEK


def test_default_model_config_is_deepseek():
    """The hardcoded config default (also the BYOK last-resort fallback) is
    DeepSeek V3, not Scout."""
    assert settings.DEFAULT_MODEL == DEEPSEEK


def test_fallback_chain_tries_deepseek_first():
    """The shared-key fallback chain is DeepSeek-first; Scout/Nemotron remain
    only as later last-ditch fallbacks for rate-limit cases."""
    assert STANDARD_MODEL_FALLBACKS[0] == DEEPSEEK
    # The demoted models are still present (rate-limit fallbacks) but after DeepSeek.
    assert SCOUT in STANDARD_MODEL_FALLBACKS
    assert NEMOTRON in STANDARD_MODEL_FALLBACKS
    assert STANDARD_MODEL_FALLBACKS.index(DEEPSEEK) < STANDARD_MODEL_FALLBACKS.index(SCOUT)
    assert STANDARD_MODEL_FALLBACKS.index(DEEPSEEK) < STANDARD_MODEL_FALLBACKS.index(NEMOTRON)


def test_recommended_standard_model_names_deepseek():
    """The settings dialog's recommended standard model points at DeepSeek V3
    and labels it correctly (no stale 'Llama 4 Scout' name)."""
    std = RECOMMENDED_MODELS["standard"]
    assert std["id"] == DEEPSEEK
    assert std["name"] == "DeepSeek V3"


def test_nemotron_output_cap_clamps_large_requests():
    """Demoted Nemotron has a known output cap; requests above it are clamped
    so it can produce (shorter) output instead of failing on finish_reason=length.
    DeepSeek (primary) has NO cap so its large outputs are never truncated."""
    from app.services.llm_service import _MODEL_OUTPUT_CAPS

    assert _MODEL_OUTPUT_CAPS.get(NEMOTRON) == 16384
    # The primary must NOT be clamped — that would risk truncating legit output.
    assert DEEPSEEK not in _MODEL_OUTPUT_CAPS
