"""Claude API service with retry logic and JSON parsing."""

from anthropic import Anthropic, AnthropicError
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


class ClaudeService:
    """Service for interacting with Claude API."""

    def __init__(self):
        """Initialize Claude client."""
        self.client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        self.model = settings.CLAUDE_MODEL
        self.max_tokens = settings.CLAUDE_MAX_TOKENS
        self.temperature = settings.CLAUDE_TEMPERATURE

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=10),
        retry=retry_if_exception_type(AnthropicError),
    )
    def call_claude(
        self,
        system_prompt: str,
        user_message: str,
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
    ) -> str:
        """
        Call Claude API with retry logic.

        Args:
            system_prompt: System prompt/instructions
            user_message: User message content
            max_tokens: Override default max_tokens
            temperature: Override default temperature

        Returns:
            Raw response text from Claude

        Raises:
            AnthropicError: If API call fails after retries
        """
        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=max_tokens or self.max_tokens,
                temperature=temperature or self.temperature,
                system=system_prompt,
                messages=[
                    {
                        "role": "user",
                        "content": user_message,
                    }
                ],
            )

            # Extract text from response
            content = response.content[0].text
            logger.info(f"Claude API call successful. Response length: {len(content)}")
            return content

        except AnthropicError as e:
            logger.error(f"Claude API error: {e}")
            raise

    def parse_json_response(self, response: str) -> Any:
        """
        Parse JSON from Claude response with fallback strategies.

        Args:
            response: Raw response string from Claude

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
        # Look for [...] or {...}
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

        # Strategy 4: Last resort - log and raise error
        logger.error(f"Failed to parse JSON from response: {response[:500]}")
        # DEBUG: Save full response to file for debugging
        try:
            with open("/tmp/claude_response_debug.txt", "w") as f:
                f.write(response)
            logger.error(f"Full response saved to /tmp/claude_response_debug.txt (length: {len(response)})")
        except:
            pass
        raise ValueError("Could not parse JSON from Claude response")

    def call_with_json_response(
        self,
        system_prompt: str,
        user_message: str,
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
    ) -> Any:
        """
        Call Claude and parse JSON response.

        Args:
            system_prompt: System prompt (should instruct to return JSON)
            user_message: User message content
            max_tokens: Override default max_tokens
            temperature: Override default temperature

        Returns:
            Parsed JSON object

        Raises:
            ValueError: If response is not valid JSON
            AnthropicError: If API call fails
        """
        response = self.call_claude(
            system_prompt=system_prompt,
            user_message=user_message,
            max_tokens=max_tokens,
            temperature=temperature,
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
            # Check first item has required fields
            if isinstance(data[0], dict):
                return all(field in data[0] for field in required_fields)
        elif isinstance(data, dict):
            return all(field in data for field in required_fields)

        return False

    async def stream_claude(
        self,
        system_prompt: str,
        user_message: str,
        max_tokens: Optional[int] = None,
    ):
        """
        Stream response from Claude (for future use).

        Args:
            system_prompt: System prompt
            user_message: User message
            max_tokens: Override default max_tokens

        Yields:
            Text chunks as they arrive
        """
        try:
            with self.client.messages.stream(
                model=self.model,
                max_tokens=max_tokens or self.max_tokens,
                system=system_prompt,
                messages=[{"role": "user", "content": user_message}],
            ) as stream:
                for text in stream.text_stream:
                    yield text

        except AnthropicError as e:
            logger.error(f"Claude streaming error: {e}")
            raise


# Global service instance
claude_service = ClaudeService()
