"""Tests for the per-model output limits and the length/null fallback.

THE BUG (production, 2026-10-24, video 054097a6): every analysis step tried
nvidia/nemotron-3-super-120b-a12b FIRST, because the user's saved
``preferred_model`` was Nemotron and ``call_llm`` put the preferred model at
the head of the chain without checking DEMOTED_MODELS (config.py only
validates DEFAULT_MODEL). Nemotron is a reasoning model; with the nodes'
16K budgets it thought until it hit max_tokens:

- chunk (max_tokens=16384): null content, finish_reason=length, after ~11 min;
- infer (32768, clamped to 16384): truncated JSON after 8m21s, which
  json-repair turned into inferences for 66 of 155 chunks, and the step
  "succeeded".

THE FIX:
- a demoted model never leads the chain;
- a model whose usable output budget is below the request is skipped, not
  clamped;
- finish_reason=length with null content falls back at once (BYOK too) and
  the model is skipped for the rest of the step.
"""

from unittest.mock import MagicMock, patch

import pytest

from app.services.llm_budget import step_budget
from app.services.llm_service import (
    LLMOutputBudgetExhaustedError,
    LLMService,
    LLMUnusableResponseError,
)

V32 = "deepseek/deepseek-v3.2"
V3 = "deepseek/deepseek-chat-v3-0324"
SCOUT = "meta-llama/llama-4-scout"
NEMOTRON = "nvidia/nemotron-3-super-120b-a12b"
REASONER = "vendor/some-reasoning-model"  # a BYOK model with no known limit


@pytest.fixture(autouse=True)
def _no_real_sleep():
    with patch("tenacity.nap.time.sleep"):
        yield


def _response(content, finish_reason="stop"):
    choice = MagicMock()
    choice.message.content = content
    choice.message.refusal = None
    choice.finish_reason = finish_reason
    response = MagicMock()
    response.choices = [choice]
    return response


OK = _response('[{"ok": true}]')
EMPTY_STOP = _response(None, "stop")  # Scout's failure mode
EMPTY_LENGTH = _response(None, "length")  # Nemotron's failure mode


class _Script:
    """Fake ``client.chat.completions.create`` answering per model."""

    def __init__(self, answers):
        self.answers = answers
        self.calls = []

    def __call__(self, **kwargs):
        self.calls.append((kwargs["model"], kwargs["max_tokens"]))
        return self.answers.get(kwargs["model"], OK)

    @property
    def models(self):
        return [m for m, _ in self.calls]


@pytest.fixture
def svc(monkeypatch):
    service = LLMService()
    client = MagicMock()
    service._client = client
    # BYOK calls build their own client; hand them the same fake.
    monkeypatch.setattr(service, "_new_client", lambda api_key: client)
    return service


def _script(svc, answers):
    script = _Script(answers)
    svc._client.chat.completions.create.side_effect = script
    return script


class TestDemotedModelNeverLeads:
    def test_production_replay_preferred_nemotron(self, svc):
        """The 2026-10-24 chunk call: preferred model Nemotron, 16K budget."""
        script = _script(svc, {})

        svc.call_llm("sys", "user", max_tokens=16384, model=NEMOTRON)

        assert script.models == [V32]

    def test_demoted_model_keeps_its_place_as_last_resort(self, svc):
        script = _script(svc, {V32: EMPTY_STOP, V3: EMPTY_STOP, SCOUT: EMPTY_STOP})

        svc.call_llm("sys", "user", max_tokens=8192, model=NEMOTRON)

        assert script.models == [V32, V3, SCOUT, NEMOTRON]

    def test_byok_demoted_choice_uses_the_default(self, svc):
        script = _script(svc, {})

        svc.call_llm("sys", "user", max_tokens=8192, model=SCOUT, api_key="sk-or-v1-user")

        assert script.models == [V32]


class TestOutputLimits:
    def test_nemotron_is_skipped_for_16k_and_32k(self, svc):
        script = _script(svc, {V32: EMPTY_STOP, V3: EMPTY_STOP, SCOUT: EMPTY_STOP})

        with pytest.raises(LLMUnusableResponseError):
            svc.call_llm("sys", "user", max_tokens=16384)
        assert NEMOTRON not in script.models

        script.calls.clear()
        with pytest.raises(LLMUnusableResponseError):
            svc.call_llm("sys", "user", max_tokens=32768)
        assert NEMOTRON not in script.models

    def test_scout_is_skipped_for_infer_32k_but_tried_for_16k(self, svc):
        script = _script(svc, {V32: EMPTY_STOP, V3: EMPTY_STOP, SCOUT: EMPTY_STOP})

        with pytest.raises(LLMUnusableResponseError):
            svc.call_llm("sys", "user", max_tokens=32768)
        assert script.models == [V32, V3]

        script.calls.clear()
        with pytest.raises(LLMUnusableResponseError):
            svc.call_llm("sys", "user", max_tokens=16384)
        assert script.models == [V32, V3, SCOUT]

    def test_max_tokens_is_never_clamped(self, svc):
        """Clamping truncated Nemotron's infer answer to 66 of 155 chunks."""
        script = _script(svc, {V32: EMPTY_STOP, V3: EMPTY_STOP, SCOUT: EMPTY_STOP})

        svc.call_llm("sys", "user", max_tokens=8192)

        assert script.models == [V32, V3, SCOUT, NEMOTRON]
        assert {max_tokens for _, max_tokens in script.calls} == {8192}

    def test_byok_premium_models_are_never_skipped(self, svc):
        script = _script(svc, {})

        svc.call_llm("sys", "user", max_tokens=32768, model=REASONER, api_key="sk-or-v1-user")

        assert script.calls == [(REASONER, 32768)]


class TestLengthWithNullContent:
    def test_falls_back_immediately_without_retrying_the_model(self, svc):
        script = _script(svc, {V32: EMPTY_LENGTH})

        assert svc.call_llm("sys", "user", max_tokens=16384) == '[{"ok": true}]'

        assert script.models == [V32, V3]

    def test_byok_falls_back_to_the_default_instead_of_failing(self, svc):
        script = _script(svc, {REASONER: EMPTY_LENGTH})

        result = svc.call_llm("sys", "user", max_tokens=16384, model=REASONER, api_key="sk-or-v1-user")

        assert result == '[{"ok": true}]'
        assert script.models == [REASONER, V32]

    def test_byok_other_unusable_responses_still_raise(self, svc):
        """Only the length case changed; e.g. null with finish_reason=stop on a
        BYOK model still surfaces as an error, as before."""
        script = _script(svc, {REASONER: EMPTY_STOP})

        with pytest.raises(LLMUnusableResponseError) as excinfo:
            svc.call_llm("sys", "user", max_tokens=16384, model=REASONER, api_key="sk-or-v1-user")

        assert not isinstance(excinfo.value, LLMOutputBudgetExhaustedError)
        assert script.models == [REASONER]

    def test_exhausted_model_is_skipped_for_the_rest_of_the_step(self, svc):
        script = _script(svc, {REASONER: EMPTY_LENGTH})
        byok = {"model": REASONER, "api_key": "sk-or-v1-user"}

        with step_budget(720):
            svc.call_llm("sys", "user", max_tokens=16384, **byok)
            # e.g. the node's validation retry: same budget -> skip at once.
            svc.call_llm("sys", "user", max_tokens=16384, **byok)
            # a smaller request may still fit
            svc.call_llm("sys", "user", max_tokens=8192, **byok)

        assert script.calls == [
            (REASONER, 16384), (V32, 16384),
            (V32, 16384),
            (REASONER, 8192), (V32, 8192),
        ]

    def test_memory_does_not_outlive_the_step(self, svc):
        script = _script(svc, {REASONER: EMPTY_LENGTH})
        byok = {"model": REASONER, "api_key": "sk-or-v1-user"}

        with step_budget(720):
            svc.call_llm("sys", "user", max_tokens=16384, **byok)
        with step_budget(720):
            svc.call_llm("sys", "user", max_tokens=16384, **byok)

        assert script.models == [REASONER, V32, REASONER, V32]
