# Migration Guide 04: LLM Integration -- Anthropic Claude to OpenRouter

**Status:** Planning
**Priority:** High -- required for the app to function without a paid Anthropic API key
**Estimated Effort:** 2-3 days

---

## Table of Contents

1. [OpenRouter Overview](#1-openrouter-overview)
2. [Core Service Rewrite: claude_service.py to llm_service.py](#2-core-service-rewrite)
3. [Node Updates (All 8 Nodes)](#3-node-updates)
4. [BYOK Implementation](#4-byok-implementation)
5. [Frontend: Model Settings UI](#5-frontend-model-settings-ui)
6. [Recommended Free Models](#6-recommended-free-models)
7. [Dependencies Changes](#7-dependencies-changes)
8. [Configuration Changes](#8-configuration-changes)
9. [Testing Strategy](#9-testing-strategy)
10. [Risks and Mitigations](#10-risks-and-mitigations)
11. [Migration Checklist](#11-migration-checklist)

---

## 1. OpenRouter Overview

### What Is OpenRouter

OpenRouter is an LLM API router that provides a single, OpenAI-compatible API endpoint for accessing hundreds of models from multiple providers (Anthropic, OpenAI, Google, Meta, Mistral, Qwen, and many more). Instead of managing separate SDKs and API keys for each provider, you point the standard OpenAI Python SDK at `https://openrouter.ai/api/v1` and select models by name.

### Why OpenRouter for This Project

- **Free models available**: OpenRouter hosts genuinely free models (Qwen3, Llama 70B/8B, Gemma, DeepSeek, and others). Users can run the full analysis pipeline at zero cost.
- **BYOK (Bring Your Own Key)**: Users who want premium models (Claude, GPT-4o, etc.) can provide their own API key. OpenRouter routes calls through the user's key directly to the provider.
- **Single integration point**: The app only needs one SDK (OpenAI Python) and one base URL. Switching models is a string change, not a code change.
- **OpenAI-compatible**: The request/response format is identical to the OpenAI Chat Completions API, making migration straightforward.

### Free Tier Limits

- Approximately 20 requests/minute for free models (varies by model).
- Approximately 200-300K tokens/day across all free models.
- These limits are per-IP, not per-key.
- Free models are rate-limited more aggressively than paid models.

### BYOK Economics

- OpenRouter charges a **5% markup** on BYOK requests (i.e., if Claude costs $3/MTok input through Anthropic, it costs $3.15/MTok through OpenRouter BYOK).
- The first **1 million BYOK requests per month** are free of the markup.
- For this project's volume (tens of requests per analysis run), the markup is negligible.

### OpenRouter API Endpoint

```
Base URL: https://openrouter.ai/api/v1
Auth: Bearer <OPENROUTER_API_KEY>  (or user's BYOK key)
```

---

## 2. Core Service Rewrite

### Current Architecture

**File:** `backend/app/services/claude_service.py`

The current implementation is a `ClaudeService` class that wraps the Anthropic Python SDK:

```python
# Current: Anthropic SDK
from anthropic import Anthropic, AnthropicError

class ClaudeService:
    def __init__(self):
        self.client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        self.model = settings.CLAUDE_MODEL             # "claude-sonnet-4-20250514"
        self.max_tokens = settings.CLAUDE_MAX_TOKENS    # 4096
        self.temperature = settings.CLAUDE_TEMPERATURE  # 0.7

    def call_claude(self, system_prompt, user_message, max_tokens=None, temperature=None) -> str:
        ...

    def parse_json_response(self, response: str) -> Any:
        ...  # 4 fallback strategies

    def call_with_json_response(self, system_prompt, user_message, max_tokens=None, temperature=None) -> Any:
        ...

# Global singleton
claude_service = ClaudeService()
```

**Key characteristics:**
- Singleton instance (`claude_service`) imported by all 8 analysis nodes.
- Retry logic via tenacity: 3 attempts, exponential backoff, retries on `AnthropicError`.
- JSON parsing with 4 fallback strategies: direct parse, code block extraction, regex array/object extraction, error with debug dump.
- `call_with_json_response()` is a convenience method combining `call_claude()` + `parse_json_response()`.
- `validate_json_structure()` and `stream_claude()` are defined but not used by the analysis pipeline.

### New Architecture

**New file:** `backend/app/services/llm_service.py`

The replacement `LLMService` class uses the OpenAI Python SDK pointed at OpenRouter:

```python
"""LLM service using OpenRouter (OpenAI-compatible API)."""

import json
import logging
import re
from typing import Any, Dict, List, Optional

import openai
from openai import OpenAI
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from app.config import settings

logger = logging.getLogger(__name__)


class LLMService:
    """Service for interacting with LLMs via OpenRouter."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
    ):
        """
        Initialize LLM client.

        Args:
            api_key: OpenRouter API key. Falls back to settings.OPENROUTER_API_KEY.
            model: Model identifier. Falls back to settings.DEFAULT_LLM_MODEL.
            max_tokens: Default max tokens. Falls back to settings.LLM_MAX_TOKENS.
            temperature: Default temperature. Falls back to settings.LLM_TEMPERATURE.
        """
        self.client = OpenAI(
            base_url=settings.OPENROUTER_BASE_URL,
            api_key=api_key or settings.OPENROUTER_API_KEY,
            default_headers={
                "HTTP-Referer": settings.OPENROUTER_REFERER,
                "X-Title": settings.PROJECT_NAME,
            },
        )
        self.model = model or settings.DEFAULT_LLM_MODEL
        self.max_tokens = max_tokens or settings.LLM_MAX_TOKENS
        self.temperature = temperature or settings.LLM_TEMPERATURE

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=30),
        retry=retry_if_exception_type(
            (openai.APIError, openai.APIConnectionError, openai.RateLimitError)
        ),
    )
    def call_llm(
        self,
        system_prompt: str,
        user_message: str,
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
    ) -> str:
        """
        Call LLM API with retry logic.

        Args:
            system_prompt: System prompt/instructions
            user_message: User message content
            max_tokens: Override default max_tokens
            temperature: Override default temperature

        Returns:
            Raw response text from the LLM

        Raises:
            openai.APIError: If API call fails after retries
        """
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                max_tokens=max_tokens or self.max_tokens,
                temperature=temperature or self.temperature,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
                timeout=600.0,  # 10 minute timeout for long operations
            )

            content = response.choices[0].message.content
            logger.info(
                f"LLM API call successful (model={self.model}). "
                f"Response length: {len(content)}"
            )
            return content

        except openai.RateLimitError as e:
            logger.warning(f"Rate limit hit for model {self.model}: {e}")
            raise
        except openai.APIError as e:
            logger.error(f"LLM API error (model={self.model}): {e}")
            raise

    def parse_json_response(self, response: str) -> Any:
        """
        Parse JSON from LLM response with fallback strategies.

        This method is intentionally robust because free/open-source models
        frequently wrap JSON in markdown code blocks, prepend explanatory text,
        or append trailing commentary.

        Args:
            response: Raw response string from the LLM

        Returns:
            Parsed JSON object (dict or list)

        Raises:
            ValueError: If JSON cannot be parsed after all strategies
        """
        # Strategy 1: Direct JSON parse (ideal case)
        try:
            return json.loads(response.strip())
        except json.JSONDecodeError:
            pass

        # Strategy 2: Extract from markdown code blocks (```json ... ```)
        json_match = re.search(
            r"```(?:json)?\s*(\[.*?\]|\{.*?\})\s*```", response, re.DOTALL
        )
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except json.JSONDecodeError:
                pass

        # Strategy 3: Find JSON array in text
        array_match = re.search(r"(\[.*\])", response, re.DOTALL)
        if array_match:
            try:
                return json.loads(array_match.group(1))
            except json.JSONDecodeError:
                pass

        # Strategy 4: Find JSON object in text
        object_match = re.search(r"(\{.*\})", response, re.DOTALL)
        if object_match:
            try:
                return json.loads(object_match.group(1))
            except json.JSONDecodeError:
                pass

        # Strategy 5: Attempt json-repair if installed (optional dependency)
        try:
            from json_repair import repair_json

            repaired = repair_json(response, return_objects=True)
            if repaired:
                return repaired
        except ImportError:
            pass
        except Exception:
            pass

        # All strategies failed
        logger.error(f"Failed to parse JSON from response: {response[:500]}")
        try:
            with open("/tmp/llm_response_debug.txt", "w") as f:
                f.write(response)
            logger.error(
                f"Full response saved to /tmp/llm_response_debug.txt "
                f"(length: {len(response)})"
            )
        except Exception:
            pass
        raise ValueError("Could not parse JSON from LLM response")

    def call_with_json_response(
        self,
        system_prompt: str,
        user_message: str,
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
    ) -> Any:
        """
        Call LLM and parse JSON response.

        Args:
            system_prompt: System prompt (should instruct to return JSON)
            user_message: User message content
            max_tokens: Override default max_tokens
            temperature: Override default temperature

        Returns:
            Parsed JSON object

        Raises:
            ValueError: If response is not valid JSON
            openai.APIError: If API call fails
        """
        response = self.call_llm(
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
            if isinstance(data[0], dict):
                return all(field in data[0] for field in required_fields)
        elif isinstance(data, dict):
            return all(field in data for field in required_fields)
        return False


def get_service_for_user(user_id: str, db_session) -> LLMService:
    """
    Factory method: return an LLMService configured for a specific user.

    Looks up the user's preferred model and (decrypted) API key from the database.
    Falls back to the default free-model service if no preferences are set.

    Args:
        user_id: The user's ID (primary key in the users table)
        db_session: SQLAlchemy session

    Returns:
        A configured LLMService instance
    """
    from app.models.database_models import User
    from app.services.encryption_service import decrypt

    user = db_session.query(User).filter(User.id == user_id).first()
    if not user:
        logger.warning(f"User {user_id} not found, using default LLM service")
        return default_llm_service

    api_key = None
    if user.openrouter_api_key_encrypted:
        try:
            api_key = decrypt(user.openrouter_api_key_encrypted)
        except Exception as e:
            logger.error(f"Failed to decrypt API key for user {user_id}: {e}")
            # Fall through to default

    model = user.preferred_model if user.preferred_model else None

    if api_key or model:
        return LLMService(api_key=api_key, model=model)

    return default_llm_service


# Default singleton for free-model usage (no user-specific key)
default_llm_service = LLMService()
```

### API Translation Reference

| Anthropic (current) | OpenAI / OpenRouter (new) |
|---|---|
| `from anthropic import Anthropic, AnthropicError` | `from openai import OpenAI` and `import openai` |
| `client = Anthropic(api_key=...)` | `client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=...)` |
| `client.messages.create(model=..., system=system_prompt, messages=[...])` | `client.chat.completions.create(model=..., messages=[{"role":"system","content":system_prompt}, ...])` |
| `system=system_prompt` (top-level param) | `{"role": "system", "content": system_prompt}` (first message) |
| `response.content[0].text` | `response.choices[0].message.content` |
| `AnthropicError` | `openai.APIError`, `openai.RateLimitError`, `openai.APIConnectionError` |
| `timeout=600.0` (param on `messages.create`) | `timeout=600.0` (param on `chat.completions.create`) |
| `response.content[0].text` (always text) | `response.choices[0].message.content` (always text for non-tool calls) |

### OpenRouter-Specific Headers

OpenRouter recommends (but does not require) two custom headers. Set them via `default_headers` on the OpenAI client:

```python
self.client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=api_key,
    default_headers={
        "HTTP-Referer": "https://your-app-url.com",  # Your app's URL
        "X-Title": "Qualitative Research Tool",       # Your app's name
    },
)
```

These headers help OpenRouter track usage and prioritize requests.

### JSON Mode

Some models on OpenRouter support the `response_format` parameter:

```python
response = client.chat.completions.create(
    model="...",
    messages=[...],
    response_format={"type": "json_object"},
)
```

**Important caveats:**
- Not all free models support `response_format`. If the model does not support it, the API will return an error.
- When supported, it guarantees the output is valid JSON but does NOT guarantee the JSON matches a particular schema.
- **Recommendation:** Do NOT use `response_format` in this migration. Instead, rely on the existing prompt instructions ("Return ONLY valid JSON") combined with the robust `parse_json_response()` fallback chain. This approach works with all models. If you want to add `response_format` later, wrap it in a try/except and fall back to the non-JSON-mode path.

### Retry Logic Changes

The current retry decorator targets `AnthropicError`. Update to target OpenAI SDK exceptions:

```python
# Before
@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=4, max=10),
    retry=retry_if_exception_type(AnthropicError),
)

# After
@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=4, max=30),  # longer max for rate limits
    retry=retry_if_exception_type(
        (openai.APIError, openai.APIConnectionError, openai.RateLimitError)
    ),
)
```

**Rate limit handling:** The `max` wait is increased from 10 to 30 seconds. OpenRouter's free-tier rate limits can require longer backoff. The tenacity exponential backoff (4s, 8s, 16s capped at 30s) handles this naturally.

---

## 3. Node Updates (All 8 Nodes)

### Change Pattern

Every node file follows the same pattern. Here is the change required, shown once:

**Before (every node):**
```python
from app.services.claude_service import claude_service

def some_node(state: VideoAnalysisState) -> Dict[str, Any]:
    ...
    result = claude_service.call_with_json_response(
        system_prompt=SOME_PROMPT,
        user_message=user_message,
        max_tokens=NNNN,
    )
    ...
```

**After (every node):**
```python
from app.services.llm_service import LLMService, default_llm_service

def some_node(
    state: VideoAnalysisState,
    llm_service: LLMService = None,
) -> Dict[str, Any]:
    ...
    service = llm_service or default_llm_service
    result = service.call_with_json_response(
        system_prompt=SOME_PROMPT,
        user_message=user_message,
        max_tokens=NNNN,
    )
    ...
```

The `llm_service` parameter is optional. When called by the LangGraph workflow without explicit injection, it defaults to `None` and the node falls back to `default_llm_service` (free model). When called from Celery tasks that have resolved the user's preferences, the task passes a user-specific `LLMService` instance.

### Files That Need This Change

| # | File | Node Function | Current Import |
|---|---|---|---|
| 1 | `backend/app/agents/nodes/chunk.py` | `chunk_node()` | `from app.services.claude_service import claude_service` |
| 2 | `backend/app/agents/nodes/infer.py` | `infer_node()` | `from app.services.claude_service import claude_service` |
| 3 | `backend/app/agents/nodes/relate.py` | `relate_node()` | `from app.services.claude_service import claude_service` |
| 4 | `backend/app/agents/nodes/explain.py` | `explain_node()` | `from app.services.claude_service import claude_service` |
| 5 | `backend/app/agents/nodes/activate.py` | `activate_node()` | `from app.services.claude_service import claude_service` |
| 6 | `backend/app/agents/nodes/cross_relate.py` | `cross_relate_node()` | `from app.services.claude_service import claude_service` |
| 7 | `backend/app/agents/nodes/cross_explain.py` | `cross_explain_node()` | `from app.services.claude_service import claude_service` |
| 8 | `backend/app/agents/nodes/cross_activate.py` | `cross_activate_node()` | `from app.services.claude_service import claude_service` |

### Max Tokens Per Node

The current `max_tokens` settings for each node and their compatibility with free models:

| Node | Current max_tokens | Concern | Recommended Action |
|---|---|---|---|
| CHUNK | 16,384 | Some free models cap output at 8K-16K. Generally safe. | Keep as-is. If a model has a lower output limit, OpenRouter will truncate. |
| INFER | 32,768 | Very high. Many free models cap output at 4K-8K tokens. | Reduce to `16384` for free models. Consider chunking the INFER step (process half the chunks at a time) if output is truncated. |
| RELATE | 16,384 | Generally safe. | Keep as-is. |
| EXPLAIN | 16,384 | Generally safe. | Keep as-is. |
| ACTIVATE | 8,192 | Safe for all models. | Keep as-is. |
| CROSS_RELATE | 8,192 | Safe for all models. | Keep as-is. |
| CROSS_EXPLAIN | 8,192 | Safe for all models. | Keep as-is. |
| CROSS_ACTIVATE | 8,192 | Safe for all models. | Keep as-is. |

**Implementation note:** The `max_tokens` value passed to OpenRouter is a *request*. If the model's actual output limit is lower, OpenRouter returns what the model can produce without erroring. Monitor for truncated JSON in the INFER step.

### Prompt Adjustments

The current prompts end with `CRITICAL: Return ONLY valid JSON, no other text.` This works well for Claude but free/open-source models tend to be chattier. Strengthen the JSON instruction in each prompt.

**Current (all prompts in `backend/app/agents/prompts.py`):**
```
CRITICAL: Return ONLY valid JSON, no other text.
```

**New (replace in all 8 prompts):**
```
CRITICAL FORMATTING RULES:
- You MUST return ONLY a valid JSON array.
- Do NOT include any text before or after the JSON.
- Do NOT wrap the JSON in markdown code blocks (no ```).
- Start your response with [ and end with ].
- Ensure all strings are properly escaped.
```

Optionally, for the prompts where the expected structure is complex (INFER, EXPLAIN), add a truncated one-shot example at the end of the system prompt to anchor the model. For example, in `INFER_SYSTEM_PROMPT`:

```
EXAMPLE (abbreviated):
[
  {
    "chunk_id": "C001",
    "inferences": [
      {
        "inference_id": "I001",
        "meaning": "Example meaning statement",
        "importance": "Example importance",
        "context": "Example context"
      }
    ]
  }
]
```

### LangGraph Workflow -- No Changes Needed

The following files require **ZERO changes:**

- `backend/app/agents/graph.py` -- Defines the LangGraph `StateGraph` with node references. It does not import or reference any LLM service. The graph simply calls the node functions, which internally use the LLM service.
- `backend/app/agents/states.py` -- Pure `TypedDict` definitions. Fully LLM-agnostic.

This is by design: the LangGraph workflow is a pure DAG of function calls. The LLM integration lives entirely within the node functions.

---

## 4. BYOK Implementation

### Database Changes

Add three new columns to the `User` model in `backend/app/models/database_models.py`:

```python
class User(Base):
    __tablename__ = "users"

    # ... existing columns ...

    # LLM preferences (new)
    preferred_model = Column(String(255), nullable=True, default="")
    openrouter_api_key_encrypted = Column(Text, nullable=True)
    provider = Column(String(50), nullable=True, default="openrouter")
```

**Column details:**

| Column | Type | Default | Purpose |
|---|---|---|---|
| `preferred_model` | `String(255)`, nullable | `""` (empty string) | OpenRouter model ID, e.g. `"anthropic/claude-sonnet-4"` or `"qwen/qwen3-235b-a22b:free"`. Empty means use server default. |
| `openrouter_api_key_encrypted` | `Text`, nullable | `NULL` | Fernet-encrypted OpenRouter API key. NULL means use the server's default key (free models only). |
| `provider` | `String(50)`, nullable | `"openrouter"` | Future-proofing for direct-to-provider integrations. For now, always `"openrouter"`. |

**Alembic migration:**

Create a new migration:

```bash
cd backend
alembic revision --autogenerate -m "add_user_llm_preferences"
```

The generated migration should contain:

```python
def upgrade():
    op.add_column('users', sa.Column('preferred_model', sa.String(255), nullable=True, server_default=''))
    op.add_column('users', sa.Column('openrouter_api_key_encrypted', sa.Text(), nullable=True))
    op.add_column('users', sa.Column('provider', sa.String(50), nullable=True, server_default='openrouter'))

def downgrade():
    op.drop_column('users', 'provider')
    op.drop_column('users', 'openrouter_api_key_encrypted')
    op.drop_column('users', 'preferred_model')
```

### Encryption Service

**New file:** `backend/app/services/encryption_service.py`

```python
"""Symmetric encryption for storing user API keys."""

import logging
from cryptography.fernet import Fernet, InvalidToken

from app.config import settings

logger = logging.getLogger(__name__)

# Initialize Fernet cipher from environment variable
_fernet = None


def _get_fernet() -> Fernet:
    """Lazy-initialize Fernet cipher."""
    global _fernet
    if _fernet is None:
        key = settings.FERNET_ENCRYPTION_KEY
        if not key:
            raise RuntimeError(
                "FERNET_ENCRYPTION_KEY is not set. "
                "Generate one with: python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'"
            )
        _fernet = Fernet(key.encode() if isinstance(key, str) else key)
    return _fernet


def encrypt(plaintext: str) -> str:
    """
    Encrypt a plaintext string.

    Args:
        plaintext: The string to encrypt (e.g., an API key)

    Returns:
        Base64-encoded ciphertext string (safe to store in DB)
    """
    f = _get_fernet()
    return f.encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    """
    Decrypt a ciphertext string.

    Args:
        ciphertext: Base64-encoded ciphertext from encrypt()

    Returns:
        Original plaintext string

    Raises:
        ValueError: If decryption fails (wrong key or corrupted data)
    """
    f = _get_fernet()
    try:
        return f.decrypt(ciphertext.encode()).decode()
    except InvalidToken:
        raise ValueError("Failed to decrypt: invalid token or wrong encryption key")
```

**Key points:**
- The `cryptography` package (version 45.0.0) is already in `requirements.txt`.
- The encryption key is loaded from the `FERNET_ENCRYPTION_KEY` env var.
- Generate a key once with: `python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'`
- Never log decrypted API keys. The encryption service only decrypts on-demand when building an `LLMService` instance.

### User Settings API

**Updated file:** `backend/app/routes/users.py`

Add these new endpoints:

```python
from app.services.encryption_service import encrypt, decrypt
from app.services.llm_service import LLMService

# --- New Pydantic schemas (add to backend/app/models/schemas.py) ---

class UserSettingsResponse(BaseModel):
    """Schema for user LLM settings response."""
    preferred_model: str = ""
    has_api_key: bool = False
    provider: str = "openrouter"

class UserSettingsUpdate(BaseModel):
    """Schema for updating user LLM settings."""
    preferred_model: Optional[str] = None
    openrouter_api_key: Optional[str] = None  # plaintext; will be encrypted before storage
    provider: Optional[str] = None

class ModelInfo(BaseModel):
    """Schema for a single model in the available models list."""
    id: str
    name: str
    context_length: int
    max_output_tokens: Optional[int] = None
    pricing_prompt: Optional[float] = None   # $/1M tokens, 0 for free
    pricing_completion: Optional[float] = None
    is_free: bool = False

class AvailableModelsResponse(BaseModel):
    """Schema for listing available models."""
    free_models: List[ModelInfo]
    premium_models: List[ModelInfo]


# --- New endpoints in backend/app/routes/users.py ---

@router.get("/me/settings", response_model=UserSettingsResponse)
async def get_user_settings(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get the current user's LLM settings.
    Returns model preference, whether an API key is stored, and provider.
    """
    user_id = current_user["id"]
    db_user = db.query(database_models.User).filter(
        database_models.User.id == user_id
    ).first()

    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    return UserSettingsResponse(
        preferred_model=db_user.preferred_model or "",
        has_api_key=bool(db_user.openrouter_api_key_encrypted),
        provider=db_user.provider or "openrouter",
    )


@router.put("/me/settings")
async def update_user_settings(
    settings_data: UserSettingsUpdate,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Update the current user's LLM settings.
    Accepts model preference and/or API key (plaintext; encrypted before storage).
    """
    user_id = current_user["id"]
    db_user = db.query(database_models.User).filter(
        database_models.User.id == user_id
    ).first()

    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    if settings_data.preferred_model is not None:
        db_user.preferred_model = settings_data.preferred_model

    if settings_data.openrouter_api_key is not None:
        if settings_data.openrouter_api_key == "":
            # Clear the key
            db_user.openrouter_api_key_encrypted = None
        else:
            db_user.openrouter_api_key_encrypted = encrypt(settings_data.openrouter_api_key)

    if settings_data.provider is not None:
        db_user.provider = settings_data.provider

    db.commit()

    return {"message": "Settings updated successfully"}


@router.delete("/me/settings/api-key")
async def delete_user_api_key(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Remove the stored BYOK API key for the current user.
    """
    user_id = current_user["id"]
    db_user = db.query(database_models.User).filter(
        database_models.User.id == user_id
    ).first()

    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    db_user.openrouter_api_key_encrypted = None
    db.commit()

    return {"message": "API key removed"}


@router.get("/me/settings/models", response_model=AvailableModelsResponse)
async def list_available_models(
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    List available models from OpenRouter.
    Results are grouped into free and premium tiers.

    Note: This endpoint can be cached (e.g., 1 hour TTL) since model
    availability changes infrequently.
    """
    import httpx

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get("https://openrouter.ai/api/v1/models")
            response.raise_for_status()
            data = response.json()
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch models from OpenRouter: {str(e)}"
        )

    free_models = []
    premium_models = []

    for model in data.get("data", []):
        pricing = model.get("pricing", {})
        prompt_price = float(pricing.get("prompt", "0") or "0")
        completion_price = float(pricing.get("completion", "0") or "0")
        is_free = prompt_price == 0 and completion_price == 0

        model_info = ModelInfo(
            id=model["id"],
            name=model.get("name", model["id"]),
            context_length=model.get("context_length", 0),
            max_output_tokens=model.get("top_provider", {}).get("max_completion_tokens"),
            pricing_prompt=prompt_price,
            pricing_completion=completion_price,
            is_free=is_free,
        )

        if is_free:
            free_models.append(model_info)
        else:
            premium_models.append(model_info)

    return AvailableModelsResponse(
        free_models=free_models,
        premium_models=premium_models,
    )


@router.post("/me/settings/test-connection")
async def test_llm_connection(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Test the user's LLM configuration by sending a simple prompt.
    Returns success/failure and the model's response.
    """
    from app.services.llm_service import get_service_for_user

    user_id = current_user["id"]
    service = get_service_for_user(user_id, db)

    try:
        response = service.call_llm(
            system_prompt="You are a helpful assistant.",
            user_message='Respond with exactly: {"status": "ok", "model": "<your model name>"}',
            max_tokens=100,
            temperature=0.0,
        )
        return {
            "status": "success",
            "model": service.model,
            "response": response[:200],
        }
    except Exception as e:
        return {
            "status": "error",
            "model": service.model,
            "error": str(e),
        }
```

### User Context Propagation

Currently, analysis tasks receive only `video_id`. To support per-user models, the user must be threaded through the entire flow.

**Current flow:**
```
POST /api/videos/{id}/analyze
  -> analyze_video_task.delay(video_id)
    -> video_analysis_graph.invoke(initial_state)
      -> chunk_node(state) -> claude_service.call_with_json_response(...)
```

**New flow:**
```
POST /api/videos/{id}/analyze   [auth middleware resolves user_id]
  -> analyze_video_task.delay(video_id, user_id)    [pass user_id]
    -> service = get_service_for_user(user_id, db)   [resolve preferences]
    -> video_analysis_graph.invoke(initial_state)     [state now includes service ref]
      -> chunk_node(state, llm_service=service)       [node uses user's service]
```

**Changes required in task files:**

1. **`backend/app/routes/videos.py`** -- In `trigger_video_analysis()` and each step-by-step endpoint (`trigger_chunk_step`, etc.), extract `user_id` from auth context and pass it to the Celery task:

```python
# Before
task = analyze_video_task.delay(str(video_id))

# After
from app.auth_bridge import get_current_user_id

# Add current_user_id parameter to the endpoint:
async def trigger_video_analysis(
    video_id: UUID,
    current_user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    ...
    task = analyze_video_task.delay(str(video_id), current_user_id)
```

2. **`backend/app/tasks/analysis_tasks.py`** -- Modify `analyze_video_task` and `analyze_project_task` to accept `user_id`, resolve the LLM service, and pass it to nodes:

```python
@celery_app.task(base=DatabaseTask, bind=True, name="analyze_video")
def analyze_video_task(self, video_id: str, user_id: str = None):
    ...
    # Resolve LLM service for this user
    if user_id:
        from app.services.llm_service import get_service_for_user
        llm_service = get_service_for_user(user_id, self.db)
    else:
        from app.services.llm_service import default_llm_service
        llm_service = default_llm_service

    # Option A: Inject into state (requires modifying VideoAnalysisState)
    # Option B: Call nodes directly instead of graph.invoke()

    # Recommended: Option B -- call nodes sequentially with the service
    # This avoids modifying the LangGraph state definition.
    # See "Node Invocation" section below.
```

**Node invocation with LLM service (Option B):**

Instead of `video_analysis_graph.invoke(initial_state)`, call each node directly and pass the service:

```python
# In analyze_video_task:
state = initial_state

# Step 1
state = chunk_node(state, llm_service=llm_service)
if state.get("error"):
    raise Exception(f"CHUNK failed: {state['error']}")

# Step 2
state = infer_node(state, llm_service=llm_service)
if state.get("error"):
    raise Exception(f"INFER failed: {state['error']}")

# ... and so on for relate, explain, activate
```

This approach is simpler than modifying the LangGraph `StateGraph` definition to accept non-serializable objects. The graph can still be used for workflows that do not need per-user services (e.g., batch processing).

3. **`backend/app/tasks/analysis_steps.py`** -- Same pattern: accept `user_id` in each step task, resolve the service, and pass it to the node function.

```python
@celery_app.task(base=DatabaseTask, bind=True, name="analyze_chunk_step")
def analyze_chunk_step(self, video_id: str, user_id: str = None):
    ...
    # Resolve LLM service
    if user_id:
        from app.services.llm_service import get_service_for_user
        llm_service = get_service_for_user(user_id, self.db)
    else:
        from app.services.llm_service import default_llm_service
        llm_service = default_llm_service

    result = chunk_node({
        "video_id": video_id,
        "transcript": state["transcript"],
        "speaker_labels": state["speaker_labels"],
        "speaker_roles": state["speaker_roles"],
    }, llm_service=llm_service)
    ...
```

4. **`backend/app/routes/projects.py`** -- In `trigger_project_analysis()`, extract `user_id` and pass it to `analyze_project_task.delay(str(project_id), current_user_id)`.

---

## 5. Frontend: Model Settings UI

### Settings Dialog Component

**New file:** `frontend/src/components/ModelSettingsDialog.tsx`

This dialog is accessible from the user dropdown in `Layout.tsx`.

```tsx
import { useState, useEffect } from "react";
import { Settings, Eye, EyeOff, Loader2, CheckCircle, XCircle } from "lucide-react";

// Uses existing shadcn/ui components: Dialog, Select, Input, Button, Label
// Import paths depend on your shadcn setup.

interface ModelSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ModelSettingsDialog({ open, onOpenChange }: ModelSettingsDialogProps) {
  const [preferredModel, setPreferredModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [testMessage, setTestMessage] = useState("");
  const [models, setModels] = useState<{ free: any[]; premium: any[] }>({ free: [], premium: [] });
  const [loading, setLoading] = useState(false);

  // Fetch current settings and available models on open
  useEffect(() => {
    if (open) {
      fetchSettings();
      fetchModels();
    }
  }, [open]);

  async function fetchSettings() {
    // GET /api/users/me/settings
    // Populate preferredModel, hasExistingKey
  }

  async function fetchModels() {
    // GET /api/users/me/settings/models
    // Populate models.free and models.premium
  }

  async function handleSave() {
    // PUT /api/users/me/settings
    // Send { preferred_model, openrouter_api_key } (only send key if changed)
  }

  async function handleTestConnection() {
    // POST /api/users/me/settings/test-connection
    // Show success/error feedback
  }

  async function handleRemoveKey() {
    // DELETE /api/users/me/settings/api-key
    // Clear local state
  }

  // Dialog UI:
  // - Model selector dropdown grouped by "Free" and "Premium"
  // - API key password input with show/hide toggle
  // - "Test Connection" button
  // - "Remove API Key" button (if hasExistingKey)
  // - Save / Cancel buttons

  return (
    // ... Dialog component rendering ...
    // Use <Dialog>, <Select>, <Input>, <Button>, <Label> from shadcn/ui
    null
  );
}
```

### Layout.tsx Integration

Add a "Model Settings" menu item to the user dropdown in `Layout.tsx`:

```tsx
// In the dropdown menu, above the "Sign Out" button:
<button
  onClick={() => { setShowMenu(false); setShowSettings(true); }}
  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
>
  <Settings className="h-4 w-4" />
  Model Settings
</button>

// At the component level:
const [showSettings, setShowSettings] = useState(false);

// In the JSX:
<ModelSettingsDialog open={showSettings} onOpenChange={setShowSettings} />
```

### Settings Service

**New file:** `frontend/src/services/settings.ts`

```typescript
import { apiClient } from "./api"; // existing API client with auth headers

export interface UserSettings {
  preferred_model: string;
  has_api_key: boolean;
  provider: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  context_length: number;
  max_output_tokens: number | null;
  pricing_prompt: number | null;
  pricing_completion: number | null;
  is_free: boolean;
}

export interface AvailableModels {
  free_models: ModelInfo[];
  premium_models: ModelInfo[];
}

export interface TestConnectionResult {
  status: "success" | "error";
  model: string;
  response?: string;
  error?: string;
}

export const settingsService = {
  getSettings: () =>
    apiClient.get<UserSettings>("/api/users/me/settings"),

  updateSettings: (data: { preferred_model?: string; openrouter_api_key?: string }) =>
    apiClient.put("/api/users/me/settings", data),

  deleteApiKey: () =>
    apiClient.delete("/api/users/me/settings/api-key"),

  getAvailableModels: () =>
    apiClient.get<AvailableModels>("/api/users/me/settings/models"),

  testConnection: () =>
    apiClient.post<TestConnectionResult>("/api/users/me/settings/test-connection"),
};
```

### Settings Hook

**New file:** `frontend/src/hooks/useSettings.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { settingsService } from "../services/settings";

export function useSettings() {
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ["user-settings"],
    queryFn: () => settingsService.getSettings(),
  });

  const modelsQuery = useQuery({
    queryKey: ["available-models"],
    queryFn: () => settingsService.getAvailableModels(),
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
  });

  const updateMutation = useMutation({
    mutationFn: settingsService.updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
    },
  });

  const deleteKeyMutation = useMutation({
    mutationFn: settingsService.deleteApiKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
    },
  });

  const testMutation = useMutation({
    mutationFn: settingsService.testConnection,
  });

  return {
    settings: settingsQuery.data,
    isLoadingSettings: settingsQuery.isLoading,
    models: modelsQuery.data,
    isLoadingModels: modelsQuery.isLoading,
    updateSettings: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
    deleteApiKey: deleteKeyMutation.mutate,
    testConnection: testMutation.mutateAsync,
    isTesting: testMutation.isPending,
    testResult: testMutation.data,
  };
}
```

### No New Frontend Packages Needed

The settings UI uses:
- **shadcn/ui components** already in the project: `Dialog`, `Select`, `Input`, `Button`, `Label`
- **Lucide icons** already in the project: `Settings`, `Eye`, `EyeOff`, `Loader2`, `CheckCircle`, `XCircle`
- **React Query** (`@tanstack/react-query`) already in the project

---

## 6. Recommended Free Models

Free model availability on OpenRouter changes over time. The following are recommendations at the time of writing. **Make the default model configurable via the `DEFAULT_LLM_MODEL` environment variable** so it can be updated without code changes.

### Best Overall (Large Context + Good JSON Output)

| Model | Context Window | Max Output | JSON Quality | Notes |
|---|---|---|---|---|
| `qwen/qwen3-235b-a22b:free` | 40,960 | ~8K | Good | Qwen 3 235B MoE. Strong reasoning, follows instructions well. |
| `deepseek/deepseek-chat-v3-0324:free` | 163,840 | ~8K | Good | DeepSeek V3. Very large context. |
| `meta-llama/llama-4-maverick:free` | 131,072 | ~8K | Good | Meta's Llama 4 Maverick. Large context window. |

### Best for Structured JSON Output

| Model | JSON Reliability | Notes |
|---|---|---|
| `qwen/qwen3-235b-a22b:free` | High | Follows JSON formatting instructions consistently. |
| `google/gemma-3-27b-it:free` | Medium-High | Smaller model, but good at structured output. |

### Recommended Default

```env
DEFAULT_LLM_MODEL=qwen/qwen3-235b-a22b:free
```

### Fallback Strategy

If the primary free model is unavailable (returns 503 or similar), the system should:

1. Catch the error in `call_llm()`.
2. Log a warning.
3. Retry with a fallback model (configurable via `FALLBACK_LLM_MODEL` env var).
4. If fallback also fails, raise the error to the caller.

This can be implemented as a simple wrapper:

```python
FALLBACK_LLM_MODEL = settings.FALLBACK_LLM_MODEL  # e.g., "google/gemma-3-27b-it:free"

def call_llm_with_fallback(self, ...):
    try:
        return self.call_llm(...)
    except openai.APIError as e:
        if "503" in str(e) or "model_not_available" in str(e):
            logger.warning(f"Primary model {self.model} unavailable, trying fallback {FALLBACK_LLM_MODEL}")
            original_model = self.model
            self.model = FALLBACK_LLM_MODEL
            try:
                return self.call_llm(...)
            finally:
                self.model = original_model
        raise
```

---

## 7. Dependencies Changes

### `backend/requirements.txt`

**Remove:**
```
anthropic
langchain-anthropic
```

`langchain-anthropic` is confirmed unused -- no imports of `langchain_anthropic` or `ChatAnthropic` exist anywhere in the backend codebase. The `anthropic` package is only used in `claude_service.py`, which is being replaced.

**Add:**
```
openai>=1.0.0
json-repair>=0.30.0
```

- `openai` -- The OpenAI Python SDK, used to communicate with OpenRouter's OpenAI-compatible API.
- `json-repair` -- Optional but recommended. Provides a `repair_json()` function that can fix common JSON issues (trailing commas, unquoted keys, etc.) that free models occasionally produce. Used as fallback Strategy 5 in `parse_json_response()`.

**Keep (unchanged):**
```
langchain
langchain-core
langgraph
tenacity==8.2.3
cryptography==45.0.0
```

- `langchain`, `langchain-core`, `langgraph` -- Used for the LangGraph workflow orchestration. They do NOT depend on `langchain-anthropic`.
- `tenacity` -- Still used for retry logic.
- `cryptography` -- Already present, now also used for Fernet encryption of API keys.

### Frontend

No new packages needed. The settings UI uses existing shadcn/ui components and React Query.

---

## 8. Configuration Changes

### Environment Variables to Remove

| Variable | Reason |
|---|---|
| `ANTHROPIC_API_KEY` | Replaced by `OPENROUTER_API_KEY` |
| `CLAUDE_MODEL` | Replaced by `DEFAULT_LLM_MODEL` |
| `CLAUDE_MAX_TOKENS` | Replaced by `LLM_MAX_TOKENS` |
| `CLAUDE_TEMPERATURE` | Replaced by `LLM_TEMPERATURE` |

### Environment Variables to Add

| Variable | Default Value | Description |
|---|---|---|
| `OPENROUTER_API_KEY` | (required) | Server's OpenRouter API key. Used for free models when users have no BYOK key. Obtain from https://openrouter.ai/keys. |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | OpenRouter API base URL. Override for testing or custom proxies. |
| `OPENROUTER_REFERER` | `http://localhost:5173` | Value for the `HTTP-Referer` header sent to OpenRouter. Set to your production URL in deployment. |
| `DEFAULT_LLM_MODEL` | `qwen/qwen3-235b-a22b:free` | Default model for users without a preference. Use a free model ID from OpenRouter. |
| `FALLBACK_LLM_MODEL` | `google/gemma-3-27b-it:free` | Fallback model if default is unavailable. |
| `LLM_MAX_TOKENS` | `4096` | Default max output tokens. Individual nodes override this. |
| `LLM_TEMPERATURE` | `0.7` | Default temperature for LLM calls. |
| `FERNET_ENCRYPTION_KEY` | (required for BYOK) | Fernet symmetric encryption key for API key storage. Generate with `python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'` |

### Updated `backend/app/config.py`

```python
class Settings(BaseSettings):
    ...

    # --- Remove these ---
    # ANTHROPIC_API_KEY: str
    # CLAUDE_MODEL: str = "claude-sonnet-4-20250514"
    # CLAUDE_MAX_TOKENS: int = 4096
    # CLAUDE_TEMPERATURE: float = 0.7

    # --- Add these ---
    # LLM (OpenRouter)
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    OPENROUTER_REFERER: str = "http://localhost:5173"
    DEFAULT_LLM_MODEL: str = "qwen/qwen3-235b-a22b:free"
    FALLBACK_LLM_MODEL: str = "google/gemma-3-27b-it:free"
    LLM_MAX_TOKENS: int = 4096
    LLM_TEMPERATURE: float = 0.7

    # Encryption
    FERNET_ENCRYPTION_KEY: str = ""

    ...
```

### Example `.env` File

```env
# LLM (OpenRouter)
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxx
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_REFERER=http://localhost:5173
DEFAULT_LLM_MODEL=qwen/qwen3-235b-a22b:free
FALLBACK_LLM_MODEL=google/gemma-3-27b-it:free
LLM_MAX_TOKENS=4096
LLM_TEMPERATURE=0.7

# Encryption (generate with: python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')
FERNET_ENCRYPTION_KEY=your-generated-fernet-key-here
```

---

## 9. Testing Strategy

### Test 1: Free Model -- Full Pipeline

Run a complete 5-step video analysis with the default free model.

- **What to verify:** All 5 steps complete without error. JSON is parsed successfully at every step. All output fields are populated.
- **How:** Upload a video, complete transcription, trigger full analysis. Monitor Celery logs for errors.

### Test 2: JSON Parsing Robustness

Verify all 5 fallback strategies work with free model output.

- **What to verify:** Free models often wrap JSON in code blocks, prepend explanatory text, or produce slightly malformed JSON. The parser should handle all of these.
- **How:** Manually call `parse_json_response()` with various malformed inputs: raw JSON, JSON in code blocks, JSON with leading text, JSON with trailing commas (if `json-repair` is installed), JSON with unquoted keys.

### Test 3: BYOK Flow

Verify a user can set their own API key and model, and that it is used for their analysis.

- **What to verify:** User sets an API key via settings UI. Subsequent analysis runs use that key. The key is stored encrypted. Removing the key falls back to the default free model.
- **How:**
  1. Set API key via `PUT /api/users/me/settings`.
  2. Verify `GET /api/users/me/settings` returns `has_api_key: true`.
  3. Trigger analysis and verify logs show the premium model being used.
  4. Delete key via `DELETE /api/users/me/settings/api-key`.
  5. Trigger analysis again and verify it uses the default free model.

### Test 4: Rate Limiting

Verify behavior when free-tier rate limits are hit.

- **What to verify:** The retry logic handles `429 Too Many Requests` errors gracefully. The analysis eventually completes after backoff.
- **How:** Trigger multiple analyses simultaneously on the free tier. Observe retry behavior in logs.

### Test 5: Error Handling

Verify behavior when the model returns garbage, times out, or is unavailable.

- **What to verify:**
  - Garbage response: `parse_json_response()` tries all strategies, then raises `ValueError`. The node catches this and sets `error` in state. The task marks the analysis as errored.
  - Timeout: The 600-second timeout fires. The retry logic retries (exponential backoff). After 3 attempts, the task fails.
  - Model unavailable: If the fallback strategy is implemented, it switches to the fallback model. Otherwise, the task fails after retries.
- **How:** Use a deliberately bad model name to trigger errors. Temporarily set `timeout=1.0` to trigger timeouts.

### Test 6: Concurrent Users

Verify two users triggering analysis simultaneously get correct results with their own model/key.

- **What to verify:** User A (with BYOK Claude key) and User B (using free model) both trigger analysis. User A's analysis uses Claude. User B's uses the free model. Results are stored correctly to each user's videos.
- **How:** Requires two authenticated sessions. Trigger analysis from both, monitor Celery logs for model names.

---

## 10. Risks and Mitigations

### JSON Quality from Free Models

**Risk:** Free models may produce malformed JSON more frequently than Claude, causing analysis steps to fail.

**Mitigations:**
- Keep and enhance the 4-strategy JSON parser (already robust).
- Add `json-repair` as a 5th strategy for common issues (trailing commas, unquoted keys, single quotes).
- Strengthen prompt instructions with explicit formatting rules (no markdown, start with `[`, end with `]`).
- Add one-shot examples to complex prompts.

### Context Window / Output Token Limits

**Risk:** The INFER step requests `max_tokens=32768`. Many free models cap output at 4K-8K tokens, which could truncate the response mid-JSON.

**Mitigations:**
- Reduce INFER `max_tokens` to 16384 for free models.
- Monitor for truncated JSON (the parser will fail, the task will retry).
- Consider splitting the INFER step: process the first half of chunks, then the second half, and concatenate results. This would be a bigger change and should only be done if truncation is a recurring problem.
- For long transcripts, the CHUNK step may produce 100+ chunks. Consider capping at ~50 chunks per INFER call.

### Rate Limits on Free Tier

**Risk:** A single 5-step analysis makes 5 LLM calls. Multiple concurrent analyses could hit free-tier rate limits (approximately 20 req/min).

**Mitigations:**
- Celery naturally serializes tasks (one worker = one task at a time). This prevents concurrent LLM calls from the same worker.
- The retry logic with exponential backoff handles 429 errors.
- For deployments with many concurrent users, recommend BYOK to avoid free-tier congestion.

### Quality Degradation

**Risk:** Free models produce less nuanced analysis than Claude. Insights may be more generic, patterns less insightful.

**Mitigations:**
- This is expected and inherent to free models.
- Make the model choice visible in the UI (show which model produced the analysis).
- Recommend BYOK with Claude or GPT-4o for production-quality analysis.
- Consider showing a quality indicator in the UI (e.g., "Analyzed with free model -- results may be less detailed").

### Model Availability

**Risk:** Free models on OpenRouter can be removed or rate-limited without notice.

**Mitigations:**
- Make `DEFAULT_LLM_MODEL` configurable via environment variable (not hardcoded).
- Implement the fallback model strategy (`FALLBACK_LLM_MODEL`).
- The model list endpoint (`/api/users/me/settings/models`) fetches live data from OpenRouter, so the UI always shows currently available models.

### Prompt Privacy

**Risk:** Some free models on OpenRouter may log prompts for training purposes. Research transcripts contain PII and sensitive data.

**Mitigations:**
- Warn users in the settings UI: "Free models may log prompts for training. For sensitive data, use your own API key (BYOK) with a privacy-respecting provider."
- OpenRouter's documentation indicates which models log prompts and which do not. Surface this information in the model selector.
- BYOK requests go directly to the provider (e.g., Anthropic), where the provider's data policy applies, not OpenRouter's.

---

## 11. Migration Checklist

This is the complete, ordered list of every change required.

### Phase 1: Backend Core (Can deploy independently)

- [ ] **1.1** Create `backend/app/services/llm_service.py`
  - `LLMService` class with OpenAI SDK pointed at OpenRouter
  - `call_llm()` with retry logic targeting `openai.APIError`, `openai.RateLimitError`, `openai.APIConnectionError`
  - `parse_json_response()` with 5 fallback strategies (original 4 + `json-repair`)
  - `call_with_json_response()` convenience method
  - `validate_json_structure()` carried over
  - `get_service_for_user()` factory function
  - `default_llm_service` singleton

- [ ] **1.2** Create `backend/app/services/encryption_service.py`
  - `encrypt()` and `decrypt()` functions using Fernet
  - Lazy initialization from `FERNET_ENCRYPTION_KEY` env var

- [ ] **1.3** Update `backend/app/config.py`
  - Remove: `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `CLAUDE_MAX_TOKENS`, `CLAUDE_TEMPERATURE`
  - Add: `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `OPENROUTER_REFERER`, `DEFAULT_LLM_MODEL`, `FALLBACK_LLM_MODEL`, `LLM_MAX_TOKENS`, `LLM_TEMPERATURE`, `FERNET_ENCRYPTION_KEY`

- [ ] **1.4** Update `backend/app/models/database_models.py`
  - Add to `User` model: `preferred_model`, `openrouter_api_key_encrypted`, `provider` columns

- [ ] **1.5** Create Alembic migration
  - `alembic revision --autogenerate -m "add_user_llm_preferences"`
  - Run: `alembic upgrade head`

- [ ] **1.6** Update `backend/app/agents/prompts.py`
  - Replace `CRITICAL: Return ONLY valid JSON, no other text.` with expanded formatting rules in all 8 prompts
  - Optionally add one-shot JSON examples to INFER and EXPLAIN prompts

- [ ] **1.7** Update all 8 node files to use `LLMService`
  - `backend/app/agents/nodes/chunk.py`
  - `backend/app/agents/nodes/infer.py`
  - `backend/app/agents/nodes/relate.py`
  - `backend/app/agents/nodes/explain.py`
  - `backend/app/agents/nodes/activate.py`
  - `backend/app/agents/nodes/cross_relate.py`
  - `backend/app/agents/nodes/cross_explain.py`
  - `backend/app/agents/nodes/cross_activate.py`
  - For each: change import, add `llm_service` parameter, replace `claude_service.call_with_json_response` with `service.call_with_json_response`

- [ ] **1.8** Update `backend/app/services/__init__.py`
  - Replace `claude_service` / `ClaudeService` exports with `llm_service` / `LLMService` / `default_llm_service` / `get_service_for_user`

- [ ] **1.9** Update `backend/app/tasks/analysis_tasks.py`
  - Add `user_id` parameter to `analyze_video_task` and `analyze_project_task`
  - Resolve LLM service via `get_service_for_user()`
  - Call nodes directly (bypassing `graph.invoke()`) to pass `llm_service`

- [ ] **1.10** Update `backend/app/tasks/analysis_steps.py`
  - Add `user_id` parameter to all 5 step tasks
  - Resolve LLM service and pass to node functions

- [ ] **1.11** Update `backend/app/routes/videos.py`
  - Add `current_user_id` dependency to analysis trigger endpoints
  - Pass `user_id` to Celery task `.delay()` calls

- [ ] **1.12** Update `backend/app/routes/projects.py`
  - Add `current_user_id` dependency to `trigger_project_analysis()`
  - Pass `user_id` to `analyze_project_task.delay()`

- [ ] **1.13** Update `backend/requirements.txt`
  - Remove: `anthropic`, `langchain-anthropic`
  - Add: `openai>=1.0.0`, `json-repair>=0.30.0`

- [ ] **1.14** Update `.env` / `.env.example`
  - Remove Anthropic variables
  - Add OpenRouter and Fernet variables

- [ ] **1.15** Delete or archive `backend/app/services/claude_service.py`
  - After all references are updated, this file is no longer needed.
  - Optionally rename to `claude_service.py.deprecated` for reference.

### Phase 2: User Settings API

- [ ] **2.1** Add Pydantic schemas to `backend/app/models/schemas.py`
  - `UserSettingsResponse`
  - `UserSettingsUpdate`
  - `ModelInfo`
  - `AvailableModelsResponse`

- [ ] **2.2** Add endpoints to `backend/app/routes/users.py`
  - `GET /api/users/me/settings`
  - `PUT /api/users/me/settings`
  - `DELETE /api/users/me/settings/api-key`
  - `GET /api/users/me/settings/models`
  - `POST /api/users/me/settings/test-connection`

### Phase 3: Frontend UI

- [ ] **3.1** Create `frontend/src/services/settings.ts`
  - API client functions for all settings endpoints

- [ ] **3.2** Create `frontend/src/hooks/useSettings.ts`
  - React Query wrapper for settings service

- [ ] **3.3** Create `frontend/src/components/ModelSettingsDialog.tsx`
  - Model selector (grouped by free/premium)
  - API key input with show/hide toggle
  - Test Connection button
  - Remove API Key button
  - Save/Cancel buttons

- [ ] **3.4** Update `frontend/src/components/Layout.tsx`
  - Add "Model Settings" button to user dropdown menu
  - Import and render `ModelSettingsDialog`

### Phase 4: Testing and Verification

- [ ] **4.1** Test with free model: full 5-step pipeline end-to-end
- [ ] **4.2** Test JSON parsing: all 5 fallback strategies with real free model output
- [ ] **4.3** Test BYOK: set key, run analysis, verify correct model used
- [ ] **4.4** Test rate limiting: trigger multiple concurrent analyses
- [ ] **4.5** Test error handling: bad model name, timeout, garbage response
- [ ] **4.6** Test concurrent users: two users with different models
- [ ] **4.7** Test encryption: verify API keys are stored encrypted, decrypted correctly
- [ ] **4.8** Test fallback model: disable primary model, verify fallback kicks in

### Files Not Changed (Confirmed)

These files require zero modifications:

| File | Reason |
|---|---|
| `backend/app/agents/graph.py` | LangGraph workflow definition is LLM-agnostic |
| `backend/app/agents/states.py` | Pure TypedDict state definitions |
| `backend/app/agents/nodes/__init__.py` | Only re-exports node functions |
| `backend/app/models/database_models.py` (VideoAnalysis, ProjectAnalysis) | Analysis result schema unchanged |
| `backend/app/tasks/celery_app.py` | Celery configuration unchanged |
| `backend/app/database.py` | Database connection unchanged |
| Frontend (all existing components except Layout.tsx) | No changes needed |
