"""LLM service using OpenRouter API (OpenAI SDK compatible) with retry logic and JSON parsing."""

import json
import logging
import re
from typing import Any, Optional

from openai import APIConnectionError, APIError, NotFoundError, OpenAI, RateLimitError
from tenacity import (
    RetryError,
    before_sleep_log,
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.config import settings
from app.constants import FREE_MODEL_FALLBACKS

logger = logging.getLogger(__name__)

# Retry-eligible exceptions
RETRYABLE_EXCEPTIONS = (APIError, APIConnectionError, RateLimitError)

# OpenRouter headers for analytics
OPENROUTER_HEADERS = {
    "HTTP-Referer": "https://methodex.ai",
    "X-Title": "Qualitative Research Tool",
}

# Set of allowed model IDs when using the Methodex (shared) key.
# The Methodex key must never be used with premium models.
_METHODEX_ALLOWED_MODELS = set(FREE_MODEL_FALLBACKS)


class LLMService:
    """Service for interacting with LLMs via OpenRouter (OpenAI-compatible API)."""

    def __init__(self):
        """Initialize OpenRouter client (sync, for Celery workers)."""
        self.api_key = settings.OPENROUTER_API_KEY
        self.base_url = settings.OPENROUTER_BASE_URL
        self.default_model = settings.DEFAULT_MODEL
        self.max_tokens = settings.LLM_MAX_TOKENS
        self.temperature = settings.LLM_TEMPERATURE

        # Sync client (for use in Celery workers / LangGraph nodes)
        self.client = OpenAI(
            base_url=self.base_url,
            api_key=self.api_key,
        )

    def _get_client(self, api_key: Optional[str] = None) -> OpenAI:
        """Get a sync client, optionally with a BYOK API key."""
        if api_key and api_key != self.api_key:
            return OpenAI(
                base_url=self.base_url,
                api_key=api_key,
            )
        return self.client

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=2, max=30),
        retry=retry_if_exception_type(RETRYABLE_EXCEPTIONS),
        before_sleep=before_sleep_log(logger, logging.WARNING),
    )
    def _call_llm_single(
        self,
        system_prompt: str,
        user_message: str,
        max_tokens: int,
        temperature: float,
        model: str,
        client: OpenAI,
    ) -> str:
        """
        Single LLM call with retries (used internally).

        Raises retryable exceptions so tenacity can handle them.
        """
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
                "timeout": 300.0,  # 5 minute timeout per LLM call
            }

            response = client.chat.completions.create(**kwargs)

            # Guard against empty/missing response choices
            if not response.choices:
                raise ValueError(
                    f"LLM returned empty choices (model={model}). "
                    f"This may indicate the request was filtered or the model is unavailable."
                )

            content = response.choices[0].message.content
            if content is None:
                # Some models return null content with a refusal or tool_calls
                refusal = getattr(response.choices[0].message, "refusal", None)
                if refusal:
                    raise ValueError(f"LLM refused the request: {refusal}")
                raise ValueError(
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

        except RETRYABLE_EXCEPTIONS as e:
            logger.error(f"LLM API error (model={model}): {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected LLM error (model={model}): {e}")
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

        When the primary model is persistently rate-limited (common with free
        OpenRouter models), this method automatically tries fallback models.

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

        # Build list of models to try: primary first, then fallbacks.
        # Shared-key users get the full fallback chain for rate limits.
        # BYOK users get the default standard model as a last resort
        # (handles deprecated/removed models gracefully).
        models_to_try = [chosen_model]
        if api_key is None:
            for fallback in FREE_MODEL_FALLBACKS:
                if fallback != chosen_model and fallback not in models_to_try:
                    models_to_try.append(fallback)
        else:
            if self.default_model not in models_to_try:
                models_to_try.append(self.default_model)

        last_error: Optional[Exception] = None
        for model_name in models_to_try:
            try:
                return self._call_llm_single(
                    system_prompt=system_prompt,
                    user_message=user_message,
                    max_tokens=effective_max_tokens,
                    temperature=effective_temperature,
                    model=model_name,
                    client=client,
                )
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
            except (APIError, APIConnectionError) as e:
                logger.warning(
                    f"Model {model_name} API error after retries: {e}. "
                    f"Trying next fallback model..."
                )
                last_error = e
                continue
            except ValueError as e:
                # Free models may return null content (e.g. finish_reason: length
                # with no output). Fall back to next model when using shared key.
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
        raise RuntimeError("All models failed")

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
            raise ValueError("Empty response from LLM")

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

        # Strategy 6: Last resort - log length (and truncated content in dev only)
        if settings.APP_ENV == "development":
            logger.error(f"Failed to parse JSON from response (length: {len(response)}): {response[:200]}...")
        else:
            logger.error(f"Failed to parse JSON from LLM response (length: {len(response)})")
        raise ValueError("Could not parse JSON from LLM response")

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

        raise ValueError(
            f"Expected list from LLM but got {type(result).__name__}: "
            f"{str(result)[:200]}"
        )


# Global service instance
llm_service = LLMService()
