"""LLM service using OpenRouter API (OpenAI SDK compatible) with retry logic and JSON parsing."""

from openai import AsyncOpenAI, OpenAI, APIError, APIConnectionError, RateLimitError
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)
import json
import logging
import re
from typing import Dict, Any, List, Optional

from app.config import settings

logger = logging.getLogger(__name__)

# Retry-eligible exceptions
RETRYABLE_EXCEPTIONS = (APIError, APIConnectionError, RateLimitError)

# OpenRouter headers for analytics
OPENROUTER_HEADERS = {
    "HTTP-Referer": "https://qualitative-research.app",
    "X-Title": "Qualitative Research Tool",
}


class LLMService:
    """Service for interacting with LLMs via OpenRouter (OpenAI-compatible API)."""

    def __init__(self):
        """Initialize OpenRouter clients (sync and async)."""
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

        # Async client (for use in async endpoints)
        self.async_client = AsyncOpenAI(
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

    def _get_async_client(self, api_key: Optional[str] = None) -> AsyncOpenAI:
        """Get an async client, optionally with a BYOK API key."""
        if api_key and api_key != self.api_key:
            return AsyncOpenAI(
                base_url=self.base_url,
                api_key=api_key,
            )
        return self.async_client

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=30),
        retry=retry_if_exception_type(RETRYABLE_EXCEPTIONS),
    )
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
        Call LLM via OpenRouter with retry logic (synchronous).

        Args:
            system_prompt: System prompt/instructions
            user_message: User message content
            max_tokens: Override default max_tokens
            temperature: Override default temperature
            model: Override default model (e.g. for BYOK premium models)
            api_key: Override default API key (for BYOK)
            json_mode: If True, request JSON output format

        Returns:
            Raw response text from LLM

        Raises:
            APIError: If API call fails after retries
        """
        client = self._get_client(api_key)
        chosen_model = model or self.default_model

        try:
            kwargs = {
                "model": chosen_model,
                "max_tokens": max_tokens or self.max_tokens,
                "temperature": temperature if temperature is not None else self.temperature,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
                "extra_headers": OPENROUTER_HEADERS,
                "timeout": 600.0,  # 10 minute timeout for long operations
            }

            if json_mode:
                kwargs["response_format"] = {"type": "json_object"}

            response = client.chat.completions.create(**kwargs)

            content = response.choices[0].message.content
            logger.info(
                f"LLM API call successful (model={chosen_model}). "
                f"Response length: {len(content)}"
            )
            return content

        except RETRYABLE_EXCEPTIONS as e:
            logger.error(f"LLM API error (model={chosen_model}): {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected LLM error (model={chosen_model}): {e}")
            raise

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=30),
        retry=retry_if_exception_type(RETRYABLE_EXCEPTIONS),
    )
    async def acall_llm(
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
        Call LLM via OpenRouter with retry logic (asynchronous).

        Args:
            system_prompt: System prompt/instructions
            user_message: User message content
            max_tokens: Override default max_tokens
            temperature: Override default temperature
            model: Override default model
            api_key: Override default API key (for BYOK)
            json_mode: If True, request JSON output format

        Returns:
            Raw response text from LLM

        Raises:
            APIError: If API call fails after retries
        """
        client = self._get_async_client(api_key)
        chosen_model = model or self.default_model

        try:
            kwargs = {
                "model": chosen_model,
                "max_tokens": max_tokens or self.max_tokens,
                "temperature": temperature if temperature is not None else self.temperature,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
                "extra_headers": OPENROUTER_HEADERS,
                "timeout": 600.0,
            }

            if json_mode:
                kwargs["response_format"] = {"type": "json_object"}

            response = await client.chat.completions.create(**kwargs)

            content = response.choices[0].message.content
            logger.info(
                f"LLM API call successful (model={chosen_model}). "
                f"Response length: {len(content)}"
            )
            return content

        except RETRYABLE_EXCEPTIONS as e:
            logger.error(f"LLM API error (model={chosen_model}): {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected LLM error (model={chosen_model}): {e}")
            raise

    def parse_json_response(self, response: str) -> Any:
        """
        Parse JSON from LLM response with fallback strategies.

        Uses json-repair as a last resort for malformed JSON from weaker models.

        Args:
            response: Raw response string from LLM

        Returns:
            Parsed JSON object (dict or list)

        Raises:
            ValueError: If JSON cannot be parsed
        """
        # Strategy 1: Try direct JSON parsing
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            pass

        # Strategy 2: Extract JSON from code blocks
        json_match = re.search(r"```(?:json)?\s*(\[.*?\]|\{.*?\})\s*```", response, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except json.JSONDecodeError:
                pass

        # Strategy 3: Find JSON array or object in text
        array_match = re.search(r"(\[.*\])", response, re.DOTALL)
        if array_match:
            try:
                return json.loads(array_match.group(1))
            except json.JSONDecodeError:
                pass

        object_match = re.search(r"(\{.*\})", response, re.DOTALL)
        if object_match:
            try:
                return json.loads(object_match.group(1))
            except json.JSONDecodeError:
                pass

        # Strategy 4: Use json-repair for malformed JSON from weaker models
        try:
            from json_repair import repair_json
            repaired = repair_json(response, return_objects=True)
            if repaired:
                logger.warning("Used json-repair to fix malformed JSON response")
                return repaired
        except Exception as repair_error:
            logger.warning(f"json-repair also failed: {repair_error}")

        # Strategy 5: Last resort - log and raise error
        logger.error(f"Failed to parse JSON from response: {response[:500]}")
        try:
            with open("/tmp/llm_response_debug.txt", "w") as f:
                f.write(response)
            logger.error(f"Full response saved to /tmp/llm_response_debug.txt (length: {len(response)})")
        except Exception:
            pass
        raise ValueError("Could not parse JSON from LLM response")

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
            json_mode=True,
        )

        return self.parse_json_response(response)

    async def acall_with_json_response(
        self,
        system_prompt: str,
        user_message: str,
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
        model: Optional[str] = None,
        api_key: Optional[str] = None,
    ) -> Any:
        """
        Call LLM and parse JSON response (asynchronous).

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
        response = await self.acall_llm(
            system_prompt=system_prompt,
            user_message=user_message,
            max_tokens=max_tokens,
            temperature=temperature,
            model=model,
            api_key=api_key,
            json_mode=True,
        )

        return self.parse_json_response(response)

    def validate_json_structure(
        self,
        data: Any,
        required_fields: List[str],
    ) -> bool:
        """
        Validate that parsed JSON has required structure.

        Args:
            data: Parsed JSON data
            required_fields: List of required field names

        Returns:
            True if valid, False otherwise
        """
        if isinstance(data, list):
            if not data:
                return False
            if isinstance(data[0], dict):
                return all(field in data[0] for field in required_fields)
        elif isinstance(data, dict):
            return all(field in data for field in required_fields)

        return False

    async def astream_llm(
        self,
        system_prompt: str,
        user_message: str,
        max_tokens: Optional[int] = None,
        model: Optional[str] = None,
        api_key: Optional[str] = None,
    ):
        """
        Stream response from LLM via OpenRouter.

        Args:
            system_prompt: System prompt
            user_message: User message
            max_tokens: Override default max_tokens
            model: Override default model
            api_key: Override default API key (for BYOK)

        Yields:
            Text chunks as they arrive
        """
        client = self._get_async_client(api_key)
        chosen_model = model or self.default_model

        try:
            stream = await client.chat.completions.create(
                model=chosen_model,
                max_tokens=max_tokens or self.max_tokens,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
                extra_headers=OPENROUTER_HEADERS,
                stream=True,
            )

            async for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content

        except RETRYABLE_EXCEPTIONS as e:
            logger.error(f"LLM streaming error (model={chosen_model}): {e}")
            raise


# Global service instance
llm_service = LLMService()
