"""LLM service using OpenRouter API (OpenAI SDK compatible) with retry logic and JSON parsing."""

import json
import logging
import re
import time
from dataclasses import dataclass
from typing import Any, Optional

import httpx
from tenacity import (
    RetryCallState,
    RetryError,
    before_sleep_log,
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)

from app.config import settings
from app.constants import (
    DEMOTED_MODELS,
    LLM_CALL_TIMEOUT_SECONDS,
    LLM_READ_TIMEOUT_SECONDS,
    STANDARD_MODEL_FALLBACKS,
)
from app.services.llm_budget import (
    DeadlineTransport,
    LLMCallTimeoutError,
    LLMDeadlineExceededError,
    call_deadline,
    current_step_budget,
)

logger = logging.getLogger(__name__)


class LLMUnusableResponseError(ValueError):
    """The LLM call completed but produced no usable content.

    Covers: empty/missing choices, ``content is None`` (e.g. finish_reason
    ``length``/``stop``/``error``), an explicit refusal, an empty string, or
    output that could not be parsed as JSON after every strategy.

    Subclasses :class:`ValueError` so ``call_llm``'s existing
    ``except ValueError`` model-fallback loop still advances to the next model.
    It is classified as a *retryable* ``llm_error`` (see
    ``app.utils.error_classification.classify_error``) — a single bad model
    response is transient and must NOT permanently fail the analysis.
    """


class LLMOutputBudgetExhaustedError(LLMUnusableResponseError):
    """The model hit max_tokens before writing any answer.

    ``finish_reason=length`` with null content: a reasoning model spent the
    whole output budget thinking. Asking the same model again with the same
    budget fails the same way, so ``call_llm`` falls back to the next model at
    once (BYOK included) and skips this model for the rest of the step.
    """


# A model attempt is only started with at least this much step budget left;
# with less, no model can write a useful answer before the deadline.
_MIN_ATTEMPT_SECONDS = 30.0


def _ensure_step_time_left(model: str) -> None:
    """Raise LLMDeadlineExceededError if the step budget is (nearly) spent."""
    budget = current_step_budget()
    if budget is not None and budget.remaining() < _MIN_ATTEMPT_SECONDS:
        raise LLMDeadlineExceededError(
            f"Step LLM budget exhausted before calling {model} "
            f"({max(budget.remaining(), 0.0):.0f}s left)"
        )


def _stop_at_step_deadline(retry_state: RetryCallState) -> bool:
    """Tenacity stop: don't sleep into (or past) the step deadline."""
    budget = current_step_budget()
    if budget is None:
        return False
    return budget.remaining() < retry_state.upcoming_sleep + _MIN_ATTEMPT_SECONDS


# HTTP status codes that are PERMANENT — no retry or model fallback can fix
# them with the same key. 404 is excluded (model removed → fallback can help)
# and 408/429 are excluded (transient, handled by their own paths).
_PERMANENT_HTTP_CODES = frozenset({400, 401, 402, 403, 422})


def _is_permanent_api_error(exc: BaseException) -> bool:
    """True iff *exc* is an APIStatusError with a permanent 4xx code."""
    from openai import APIStatusError
    if not isinstance(exc, APIStatusError):
        return False
    return getattr(exc, "status_code", None) in _PERMANENT_HTTP_CODES


def _should_retry_llm_exception(exc: BaseException) -> bool:
    """Tenacity predicate: retry transient errors, fail fast on permanent ones.

    - APIConnectionError → retry (transient network)
    - RateLimitError (429) → retry (transient)
    - APIStatusError with 5xx → retry (transient server)
    - APIStatusError with 400/401/402/403/422 → DO NOT retry (permanent)
    - APIStatusError with 404 → DO NOT retry here; let model fallback handle it
    - APIError (no specific status) → retry (assume transient)
    - json.JSONDecodeError / httpx.RemoteProtocolError → retry. OpenRouter
      occasionally returns HTTP 200 with a malformed/truncated body; the OpenAI
      SDK then raises one of these *inside* ``create()`` while deserializing the
      envelope (Sentry PYTHON-FASTAPI-R/-12). That is a transient transport
      glitch, so retry in place before falling back.
    """
    from openai import APIConnectionError, APIError, APIStatusError, NotFoundError, RateLimitError
    if isinstance(exc, (json.JSONDecodeError, httpx.RemoteProtocolError, httpx.DecodingError)):
        return True
    if isinstance(exc, (APIConnectionError, RateLimitError)):
        return True
    if isinstance(exc, NotFoundError):
        # 404 is handled by the fallback chain in call_llm; don't retry here.
        return False
    if isinstance(exc, APIStatusError):
        if _is_permanent_api_error(exc):
            return False
        return True  # 5xx, 408, etc.
    if isinstance(exc, APIError):
        return True
    return False

# OpenRouter headers for analytics
OPENROUTER_HEADERS = {
    "HTTP-Referer": "https://methodex.ai",
    "X-Title": "Qualitative Research Tool",
}

# Set of allowed model IDs when using the Methodex (shared) key.
# The Methodex key must never be used with premium models.
_METHODEX_ALLOWED_MODELS = set(STANDARD_MODEL_FALLBACKS)

@dataclass(frozen=True)
class _OutputLimit:
    """How much answer a model can be trusted to write in one call."""

    max_output_tokens: int  # hard completion cap
    # Tokens a reasoning-by-default model spends thinking before it answers.
    # They count against max_tokens, so they come out of the answer's budget.
    reasoning_reserve: int = 0

    @property
    def usable_output_tokens(self) -> int:
        return self.max_output_tokens - self.reasoning_reserve


# Models whose usable output is smaller than some of our nodes' max_tokens
# requests (infer asks for 32K; chunk/relate/explain/cross_* for 16K; activate
# for 8K). A request that doesn't fit is NOT sent to the model: the fallback
# chain skips it. Clamping max_tokens instead keeps the model in play but
# truncates the JSON answer, and json-repair then silently keeps a fragment.
# In production on 2026-10-24 a clamped Nemotron infer call returned
# inferences for 66 of 155 chunks and the step "succeeded".
#
# Only list models with a KNOWN limit. Models not listed here (DeepSeek, which
# is the primary, and every BYOK/premium model) are never skipped by this check.
_MODEL_OUTPUT_LIMITS = {
    # OpenRouter's top provider for Scout caps completions at 16384.
    "meta-llama/llama-4-scout": _OutputLimit(max_output_tokens=16384),
    # One of Nemotron's providers (DeepInfra) caps completions at 16384, and
    # the model thinks before answering. With 16384 tokens it used the whole
    # budget on the chunk and infer prompts (null or truncated output after
    # 5-13 minutes). The half-budget reserve is an assumption, not a
    # measurement: it keeps Nemotron only for requests of 8192 tokens or less.
    "nvidia/nemotron-3-super-120b-a12b": _OutputLimit(
        max_output_tokens=16384, reasoning_reserve=8192
    ),
}


class LLMService:
    """Service for interacting with LLMs via OpenRouter (OpenAI-compatible API)."""

    def __init__(self):
        """Initialize OpenRouter client config (openai SDK imported lazily on first use)."""
        self.api_key = settings.OPENROUTER_API_KEY
        self.base_url = settings.OPENROUTER_BASE_URL
        self.default_model = settings.DEFAULT_MODEL
        self.max_tokens = settings.LLM_MAX_TOKENS
        self.temperature = settings.LLM_TEMPERATURE
        self._client = None

    def _new_client(self, api_key: str):
        """Build an OpenAI client whose calls honour :func:`call_deadline`.

        ``max_retries=0`` turns off the SDK's own retries (2 by default), which
        would otherwise re-send a timed-out request behind the deadline's back.
        Tenacity in ``_call_llm_single`` is the only retry layer, and it checks
        the step budget before every attempt.
        """
        from openai import DefaultHttpxClient, OpenAI

        class _HttpClient(DefaultHttpxClient):
            # The SDK only closes http clients it created itself. BYOK builds a
            # client per call, so close ours when it is garbage-collected, as
            # the SDK's own SyncHttpxClientWrapper does.
            def __del__(self) -> None:
                if self.is_closed:
                    return
                try:
                    self.close()
                except Exception:
                    pass

        return OpenAI(
            base_url=self.base_url,
            api_key=api_key,
            max_retries=0,
            http_client=_HttpClient(transport=DeadlineTransport()),
        )

    @property
    def client(self):
        """Return a cached OpenAI client for the Methodex shared key."""
        if self._client is None:
            self._client = self._new_client(self.api_key)
        return self._client

    def _get_client(self, api_key: Optional[str] = None):
        """Get a sync client, optionally with a BYOK API key."""
        if api_key and api_key != self.api_key:
            return self._new_client(api_key)
        return self.client

    @retry(
        stop=stop_after_attempt(3) | _stop_at_step_deadline,
        wait=wait_exponential(multiplier=2, min=2, max=30),
        retry=retry_if_exception(_should_retry_llm_exception),
        before_sleep=before_sleep_log(logger, logging.WARNING),
    )
    def _call_llm_single(
        self,
        system_prompt: str,
        user_message: str,
        max_tokens: int,
        temperature: float,
        model: str,
        client: Any,
    ) -> str:
        """
        Single LLM call with retries (used internally).

        Raises retryable exceptions so tenacity can handle them. Running out of
        time raises LLMCallTimeoutError / LLMDeadlineExceededError, which
        tenacity does not retry.
        """
        from openai import APIConnectionError, APIError, APITimeoutError

        _ensure_step_time_left(model)
        try:
            kwargs = {
                "model": model,
                "max_tokens": max_tokens,
                "temperature": temperature,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
                "extra_headers": OPENROUTER_HEADERS,
                # Per socket operation. OpenRouter's keepalive bytes reset it,
                # so the total is capped separately by call_deadline().
                "timeout": float(LLM_READ_TIMEOUT_SECONDS),
            }

            with call_deadline(LLM_CALL_TIMEOUT_SECONDS) as deadline:
                try:
                    response = client.chat.completions.create(**kwargs)
                except APITimeoutError as e:
                    if time.monotonic() < deadline:
                        raise  # an ordinary read timeout; tenacity retries it
                    budget = current_step_budget()
                    if budget is not None and budget.remaining() <= 0:
                        raise LLMDeadlineExceededError(
                            f"Step LLM budget ran out during the call to {model}"
                        ) from e
                    raise LLMCallTimeoutError(
                        f"{model} did not finish within "
                        f"{LLM_CALL_TIMEOUT_SECONDS}s"
                    ) from e

            # Guard against empty/missing response choices
            if not response.choices:
                raise LLMUnusableResponseError(
                    f"LLM returned empty choices (model={model}). "
                    f"This may indicate the request was filtered or the model is unavailable."
                )

            content = response.choices[0].message.content
            if content is None:
                # Some models return null content with a refusal or tool_calls
                refusal = getattr(response.choices[0].message, "refusal", None)
                if refusal:
                    raise LLMUnusableResponseError(f"LLM refused the request: {refusal}")
                if response.choices[0].finish_reason == "length":
                    raise LLMOutputBudgetExhaustedError(
                        f"LLM returned null content (model={model}). "
                        f"Finish reason: length (max_tokens={max_tokens})"
                    )
                raise LLMUnusableResponseError(
                    f"LLM returned null content (model={model}). "
                    f"Finish reason: {response.choices[0].finish_reason}"
                )

            logger.info(
                f"LLM API call successful (model={model}). "
                f"Response length: {len(content)}, "
                f"finish_reason: {response.choices[0].finish_reason}"
            )

            # Warn if response was truncated (might mean incomplete JSON)
            if response.choices[0].finish_reason == "length":
                logger.warning(
                    f"LLM response was truncated (finish_reason=length, "
                    f"max_tokens={max_tokens}). "
                    f"Output may be incomplete/malformed JSON."
                )

            return content

        except (APIError, APIConnectionError) as e:
            # Inner helper: log at WARNING, not ERROR. tenacity (retries) and
            # call_llm (model fallback) decide whether this is truly fatal —
            # if they recover, an ERROR here would be a false Sentry issue.
            logger.warning(f"LLM API error (model={model}): {e}")
            raise
        except Exception as e:
            # Same rationale: a handled/recoverable failure (e.g. null content
            # routed to the next fallback model, or a decode error tenacity will
            # retry) must not surface as an ERROR-level Sentry event here. The
            # outer layers log ERROR if the whole operation ultimately fails.
            logger.warning(f"LLM call did not return usable content (model={model}): {e}")
            raise

    def call_llm(
        self,
        system_prompt: str,
        user_message: str,
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
        model: Optional[str] = None,
        api_key: Optional[str] = None,
        json_mode: bool = False,
    ) -> str:
        """
        Call LLM via OpenRouter with retry logic and model fallback (synchronous).

        NOTE: json_mode is accepted for API compatibility but is intentionally
        NOT sent to OpenRouter. The ``response_format: json_object`` parameter
        forces models to return a top-level JSON *object* (``{}``), which breaks
        prompts that expect a JSON *array* (``[]``).  Instead we rely on the
        system prompt to instruct the model to return valid JSON, and use robust
        parsing in ``parse_json_response``.

        When the primary model is persistently rate-limited, this method
        automatically tries fallback models from STANDARD_MODEL_FALLBACKS.

        Args:
            system_prompt: System prompt/instructions
            user_message: User message content
            max_tokens: Override default max_tokens
            temperature: Override default temperature
            model: Override default model (e.g. for BYOK premium models)
            api_key: Override default API key (for BYOK)
            json_mode: Accepted but ignored (see note above)

        Returns:
            Raw response text from LLM

        Raises:
            APIError: If API call fails after retries on all models
            ValueError: If response has no content
        """
        from openai import APIConnectionError, APIError, APIStatusError, NotFoundError, RateLimitError
        client = self._get_client(api_key)
        chosen_model = model or self.default_model
        effective_max_tokens = max_tokens or self.max_tokens
        effective_temperature = temperature if temperature is not None else self.temperature

        # Server-side enforcement: Methodex key can only be used with open-source models
        if api_key is None and chosen_model not in _METHODEX_ALLOWED_MODELS:
            logger.warning(
                f"Blocked premium model '{chosen_model}' request without BYOK key. "
                f"Falling back to default model."
            )
            chosen_model = self.default_model

        # A demoted model must never lead the chain. The DEFAULT_MODEL
        # validator in config.py can't see a user's saved preferred_model, and
        # the settings dialog still offers Scout and Nemotron. A user whose
        # preference was Nemotron made every step try it first (production,
        # 2026-10-24). The model keeps its place further down the chain.
        if chosen_model in DEMOTED_MODELS:
            logger.warning(
                f"Preferred model {chosen_model} is a demoted fallback; "
                f"using {self.default_model} as the primary instead."
            )
            chosen_model = self.default_model

        # Build list of models to try: primary first, then fallbacks.
        # Shared-key users get the full fallback chain for rate limits.
        # BYOK users get the default standard model as a last resort
        # (handles deprecated/removed models gracefully).
        models_to_try = [chosen_model]
        if api_key is None:
            for fallback in STANDARD_MODEL_FALLBACKS:
                if fallback != chosen_model and fallback not in models_to_try:
                    models_to_try.append(fallback)
        else:
            if self.default_model not in models_to_try:
                models_to_try.append(self.default_model)

        budget = current_step_budget()
        last_error: Optional[Exception] = None
        for model_name in models_to_try:
            limit = _MODEL_OUTPUT_LIMITS.get(model_name)
            if limit is not None and effective_max_tokens > limit.usable_output_tokens:
                logger.info(
                    f"Skipping {model_name}: max_tokens={effective_max_tokens} "
                    f"exceeds its usable output budget "
                    f"({limit.usable_output_tokens} tokens)."
                )
                continue
            exhausted_at = budget.exhausted_at.get(model_name) if budget else None
            if exhausted_at is not None and effective_max_tokens >= exhausted_at:
                logger.info(
                    f"Skipping {model_name}: it already ran out of output tokens "
                    f"at max_tokens={exhausted_at} in this step."
                )
                continue
            _ensure_step_time_left(model_name)
            try:
                return self._call_llm_single(
                    system_prompt=system_prompt,
                    user_message=user_message,
                    max_tokens=effective_max_tokens,
                    temperature=effective_temperature,
                    model=model_name,
                    client=client,
                )
            except LLMCallTimeoutError as e:
                logger.warning(f"{e}. Trying next fallback model...")
                last_error = e
                continue
            except LLMOutputBudgetExhaustedError as e:
                # Not worth a retry: the same budget runs out the same way.
                # Fall back at once (BYOK too) and remember it for this step.
                logger.warning(
                    f"Model {model_name} used its whole output budget without "
                    f"answering: {e}. Trying next fallback model..."
                )
                if budget is not None:
                    budget.exhausted_at[model_name] = min(
                        effective_max_tokens,
                        budget.exhausted_at.get(model_name, effective_max_tokens),
                    )
                last_error = e
                continue
            except NotFoundError as e:
                # Model was removed/deprecated on OpenRouter.  Always fall
                # back regardless of BYOK — a missing model can't be fixed
                # by retrying.
                logger.warning(
                    f"Model {model_name} not found on OpenRouter (404). "
                    f"Falling back to next model..."
                )
                last_error = e
                continue
            except (RateLimitError, RetryError) as e:
                logger.warning(
                    f"Model {model_name} is rate-limited/failed after retries: "
                    f"{type(e).__name__}. Trying next fallback model..."
                )
                last_error = e
                continue
            except APIStatusError as e:
                # Permanent 4xx (insufficient credits, bad key, forbidden,
                # etc.) cannot be fixed by trying another model with the same
                # key — fail fast instead of walking the entire fallback chain.
                if _is_permanent_api_error(e):
                    logger.error(
                        f"Model {model_name} returned permanent error "
                        f"(status={e.status_code}): {e}. Aborting fallback chain."
                    )
                    raise
                logger.warning(
                    f"Model {model_name} API error after retries: {e}. "
                    f"Trying next fallback model..."
                )
                last_error = e
                continue
            except (APIError, APIConnectionError) as e:
                logger.warning(
                    f"Model {model_name} API error after retries: {e}. "
                    f"Trying next fallback model..."
                )
                last_error = e
                continue
            except ValueError as e:
                # Open-source models may return null content (e.g. finish_reason:
                # length with no output). Fall back to next model when using shared key.
                if api_key is None:
                    logger.warning(
                        f"Model {model_name} returned unusable response: {e}. "
                        f"Trying next fallback model..."
                    )
                    last_error = e
                    continue
                raise

        # All models exhausted - raise the underlying error, not RetryError
        if last_error is not None:
            if isinstance(last_error, RetryError) and last_error.__cause__:
                raise last_error.__cause__
            raise last_error
        raise LLMUnusableResponseError(
            f"No model in the fallback chain can write max_tokens="
            f"{effective_max_tokens}: {models_to_try}"
        )

    def parse_json_response(self, response: str) -> Any:
        """
        Parse JSON from LLM response with fallback strategies.

        Handles common LLM output quirks:
        - Wrapped in markdown code blocks
        - Preceded/followed by explanatory text
        - Wrapped in {"result": [...]} when json_mode forces object wrapper
        - Minor JSON syntax errors (trailing commas, etc.)

        Args:
            response: Raw response string from LLM

        Returns:
            Parsed JSON object (dict or list)

        Raises:
            ValueError: If JSON cannot be parsed after all strategies
        """
        if not response or not response.strip():
            raise LLMUnusableResponseError("Empty response from LLM")

        response = response.strip()

        def _return_checked(result):
            self._check_output_anomalies(result)
            return result

        # Strategy 1: Try direct JSON parsing
        try:
            parsed = json.loads(response)
            # Unwrap {"result": [...]} or {"data": [...]} patterns that
            # json_mode sometimes forces when the model wants to return an array
            if isinstance(parsed, dict) and len(parsed) == 1:
                key = next(iter(parsed))
                if isinstance(parsed[key], list):
                    logger.debug(f"Unwrapped JSON object with single key '{key}' to array")
                    return _return_checked(parsed[key])
            return _return_checked(parsed)
        except json.JSONDecodeError as e:
            logger.debug(f"Strategy 1 (direct parse) failed: {e}")
            pass

        # Strategy 2: Extract JSON from markdown code blocks
        # Use non-greedy match within code blocks
        json_match = re.search(r"```(?:json)?\s*(\[.*?\]|\{.*?\})\s*```", response, re.DOTALL)
        if json_match:
            try:
                parsed = json.loads(json_match.group(1))
                return _return_checked(self._unwrap_single_key_object(parsed))
            except json.JSONDecodeError as e:
                logger.debug(f"Strategy 2 (markdown code block) failed: {e}")
                pass

        # Strategy 3: Find outermost JSON array in text
        # Use bracket matching instead of greedy regex for reliability
        array_start = response.find("[")
        if array_start != -1:
            extracted = self._extract_balanced_json(response, array_start, "[", "]")
            if extracted:
                try:
                    return _return_checked(json.loads(extracted))
                except json.JSONDecodeError as e:
                    logger.debug(f"Strategy 3 (balanced array extraction) failed: {e}")
                    pass

        # Strategy 4: Find outermost JSON object in text
        object_start = response.find("{")
        if object_start != -1:
            extracted = self._extract_balanced_json(response, object_start, "{", "}")
            if extracted:
                try:
                    parsed = json.loads(extracted)
                    return _return_checked(self._unwrap_single_key_object(parsed))
                except json.JSONDecodeError as e:
                    logger.debug(f"Strategy 4 (balanced object extraction) failed: {e}")
                    pass

        # Strategy 5: Use json-repair for malformed JSON from weaker models
        try:
            from json_repair import repair_json
            repaired = repair_json(response, return_objects=True)
            if repaired:
                logger.warning("Used json-repair to fix malformed JSON response")
                return _return_checked(self._unwrap_single_key_object(repaired) if isinstance(repaired, dict) else repaired)
        except Exception as repair_error:
            logger.warning(f"json-repair also failed: {repair_error}")

        # Strategy 6: Last resort. Log at WARNING (not ERROR): the caller (node)
        # turns this into a retryable llm_error and the step autoretries, so it
        # is a handled/recoverable condition, not a Sentry-worthy event. The
        # node logs ERROR only if the error is genuinely non-retryable.
        if settings.APP_ENV == "development":
            logger.warning(f"Failed to parse JSON from response (length: {len(response)}): {response[:200]}...")
        else:
            logger.warning(f"Failed to parse JSON from LLM response (length: {len(response)})")
        raise LLMUnusableResponseError("Could not parse JSON from LLM response")

    @staticmethod
    def _unwrap_single_key_object(parsed: Any) -> Any:
        """Unwrap {"result": [...]} style wrappers that json_mode can produce."""
        if isinstance(parsed, dict) and len(parsed) == 1:
            key = next(iter(parsed))
            if isinstance(parsed[key], list):
                return parsed[key]
        return parsed

    @staticmethod
    def _extract_balanced_json(text: str, start: int, open_char: str, close_char: str) -> Optional[str]:
        """Extract a balanced JSON structure using bracket counting.

        This is more reliable than greedy regex for nested structures,
        and avoids matching across multiple separate JSON blocks.
        """
        depth = 0
        in_string = False
        escape_next = False

        for i in range(start, len(text)):
            char = text[i]

            if escape_next:
                escape_next = False
                continue

            if char == "\\":
                if in_string:
                    escape_next = True
                continue

            if char == '"':
                in_string = not in_string
                continue

            if in_string:
                continue

            if char == open_char:
                depth += 1
            elif char == close_char:
                depth -= 1
                if depth == 0:
                    return text[start:i + 1]

        return None

    # Patterns that may indicate prompt injection echo in LLM output
    _SUSPICIOUS_PATTERNS = [
        "IGNORE PREVIOUS",
        "IGNORE ALL",
        "SYSTEM:",
        "ASSISTANT:",
        "### INSTRUCTION",
        "<script>",
    ]

    def _check_output_anomalies(self, parsed: Any) -> None:
        """Log warnings for suspicious or anomalous LLM output. Non-blocking."""
        if isinstance(parsed, list) and len(parsed) == 0:
            logger.warning("LLM output anomaly: empty array returned")
            return

        content_str = json.dumps(parsed) if not isinstance(parsed, str) else parsed
        matched = [p for p in self._SUSPICIOUS_PATTERNS if p.lower() in content_str.lower()]
        if matched:
            logger.warning(
                "LLM output anomaly: suspicious injection-like pattern detected "
                "(matched: %s). Output may have been influenced by injected content.",
                matched,
            )

    def call_with_json_response(
        self,
        system_prompt: str,
        user_message: str,
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
        model: Optional[str] = None,
        api_key: Optional[str] = None,
    ) -> Any:
        """
        Call LLM and parse JSON response (synchronous).

        Does NOT use ``response_format: json_object`` because that forces
        models to return a top-level ``{}`` which breaks prompts expecting
        ``[]``.  Instead we rely on the system prompt to request JSON and
        parse robustly with ``parse_json_response``.

        Args:
            system_prompt: System prompt (should instruct to return JSON)
            user_message: User message content
            max_tokens: Override default max_tokens
            temperature: Override default temperature
            model: Override default model
            api_key: Override default API key (for BYOK)

        Returns:
            Parsed JSON object

        Raises:
            ValueError: If response is not valid JSON
            APIError: If API call fails
        """
        response = self.call_llm(
            system_prompt=system_prompt,
            user_message=user_message,
            max_tokens=max_tokens,
            temperature=temperature,
            model=model,
            api_key=api_key,
            json_mode=False,
        )

        if settings.APP_ENV == "development":
            logger.debug(f"Raw LLM response (first 500 chars): {response[:500]}")

        return self.parse_json_response(response)

    def call_with_json_list_response(self, **kwargs) -> list:
        """Like call_with_json_response but guarantees a list result.

        If the LLM wraps the list in a dict (e.g. {"insights": [...]}),
        extracts the first list-valued field.

        If the LLM returns a single dict instead of a list, retries once
        with an explicit instruction to return a JSON array.  Only falls
        back to wrapping in a list if the retry also returns a single dict.

        Raises ValueError if no list can be extracted.
        """
        result = self.call_with_json_response(**kwargs)
        if isinstance(result, list):
            return result
        if isinstance(result, dict):
            for value in result.values():
                if isinstance(value, list):
                    logger.debug("Extracted list from dict wrapper in LLM response")
                    return value

            # LLM returned a single item as a dict — retry with explicit instruction
            model_name = kwargs.get("model") or self.default_model
            logger.warning(
                f"LLM returned single dict instead of list (model={model_name}). "
                f"Retrying with explicit array instruction."
            )

            # Build retry kwargs with augmented system prompt
            retry_kwargs = dict(kwargs)
            original_prompt = retry_kwargs.get("system_prompt", "")
            retry_kwargs["system_prompt"] = (
                original_prompt
                + "\n\nIMPORTANT: Return a JSON array [...], not a single object. "
                "The response MUST be a JSON array containing one or more objects."
            )

            retry_result = self.call_with_json_response(**retry_kwargs)
            if isinstance(retry_result, list):
                logger.info(
                    f"Retry succeeded: LLM returned list on second attempt (model={model_name})"
                )
                return retry_result
            if isinstance(retry_result, dict):
                for value in retry_result.values():
                    if isinstance(value, list):
                        logger.debug("Extracted list from dict wrapper on retry")
                        return value
                # Retry also returned single dict — fall back to wrapping
                logger.warning(
                    f"LLM returned single dict even after retry (model={model_name}). "
                    f"Wrapping in list as last resort."
                )
                return [retry_result]

        # A wrong-shaped (non-list, non-dict) result is an unusable LLM response,
        # not a data-validation error of ours: treat it as retryable (a re-run
        # may return the expected array) rather than permanently failing.
        raise LLMUnusableResponseError(
            f"Expected list from LLM but got {type(result).__name__}: "
            f"{str(result)[:200]}"
        )


# Global service instance
llm_service = LLMService()
