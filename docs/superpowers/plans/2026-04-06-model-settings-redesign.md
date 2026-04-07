# Model Settings Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Model Settings dialog around an explicit Standard / Premium mode toggle, eliminating the local-state mirroring and one-shot save bugs that cause the visible UI desyncs and race conditions.

**Architecture:** Split the overloaded `PUT /api/users/settings` into three single-purpose endpoints (`POST /settings/api-key`, `PUT /settings/preferred-model`, modified `DELETE /settings/api-key`). Replace the dialog's tangled `selectedModel` / `currentModel` derivation with three pieces of local state (`mode`, `apiKeyDraft`, `pendingModel`) and a fully-controlled combobox. The `BalanceDisplay`, `useModelSearch`, and analyze-path BYOK gates are unchanged.

**Tech Stack:** React 19 + TypeScript + Vite + Tailwind + shadcn/ui + base-ui combobox + React Query (frontend); FastAPI + SQLAlchemy + slowapi (backend); Vitest + Testing Library + MSW (frontend tests); pytest + httpx + respx (backend tests).

**Dependencies:** This plan branches from `origin/main`, which already contains the BYOK balance work (PRs #3–#7). Local main is stale and uses an outdated `qualitative-research-tool/` path prefix — **do not branch from local main**. Always work from a worktree branched off `origin/main` where the project paths are `frontend/...` and `backend/...`.

**Spec:** `docs/superpowers/specs/2026-04-06-model-settings-redesign-design.md`

---

## File Structure

**Backend (modified)**
- `backend/app/routes/users.py` — split `PUT /settings` into two narrower routes; modify `DELETE /settings/api-key` to reset `preferred_model` to `DEFAULT_STANDARD_MODEL`
- `backend/app/models/schemas.py` — add `ApiKeyAddRequest` and `PreferredModelUpdateRequest`; remove `UserSettingsUpdate` (or keep but unused)
- `backend/tests/test_users_settings.py` — **new file**, replaces the bits of existing settings tests that hit the old `PUT /settings`

**Frontend (modified)**
- `frontend/src/services/settings.ts` — replace `updateSettings` with `addApiKey` and `updatePreferredModel`; types for new request/response shapes
- `frontend/src/hooks/useSettings.ts` — split mutation into `addApiKey` + `updatePreferredModel`; keep `deleteApiKey`, `refreshBalance`
- `frontend/src/components/settings/ModelSettingsDialog.tsx` — full rewrite around mode toggle + sticky `pendingModel`
- `frontend/src/components/settings/ModelSettingsDialog.test.tsx` — replace wholesale; new test scenarios from spec §"Test plan"

**Frontend (read-only / unchanged)**
- `frontend/src/components/settings/BalanceDisplay.tsx` — reused as-is
- `frontend/src/hooks/useModelSearch.ts` — reused as-is
- `frontend/src/types.ts` — `BalanceInfo` reused as-is

---

## Task 0: Worktree setup

**Files:**
- (workspace operation, no file edits)

- [ ] **Step 1: Fetch latest origin/main**

Run from `/Users/idstuart/Projects/ai-prototyping/5d-analysis/qualitative-research-tool`:

```bash
git fetch origin main
```

Expected: fetches the latest. `git log origin/main -1 --oneline` should show `85c8de1 ci: Railway deploy-wait step + secrets inventory doc (#9)` or newer.

- [ ] **Step 2: Create the worktree branched from origin/main**

```bash
git worktree add -b feature/model-settings-redesign \
  /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings \
  origin/main
```

Expected: new worktree at `/Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings`. **All subsequent tasks run in this worktree.** Paths in the worktree are `frontend/...` and `backend/...` (no `qualitative-research-tool/` prefix).

- [ ] **Step 3: Verify worktree state**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings
ls frontend/src/components/settings/
git status
git branch --show-current
```

Expected:
- `BalanceDisplay.tsx`, `ModelOption.tsx`, `ModelSettingsDialog.test.tsx`, `ModelSettingsDialog.tsx` listed
- `git status` clean
- branch `feature/model-settings-redesign`

- [ ] **Step 4: Install dependencies (frontend + backend)**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings/frontend && npm install
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings/backend && pip install -e . 2>&1 | tail -5
```

Expected: no errors. (If `pip install -e .` doesn't apply, fall back to whatever the project's standard backend install is — `requirements.txt` or `poetry install`.)

- [ ] **Step 5: Verify the baseline test suites pass before any edits**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings
cd backend && pytest tests/test_users.py -x 2>&1 | tail -20
cd ../frontend && npm test -- --run src/components/settings/ModelSettingsDialog.test.tsx 2>&1 | tail -30
```

Expected: existing tests pass. **If they don't, stop and report — the worktree base is broken and the plan can't proceed reliably.**

---

## Task 1: Backend — request/response schemas for the new endpoints

**Files:**
- Modify: `backend/app/models/schemas.py`
- Test: `backend/tests/test_users_settings.py` (new file, partial)

- [ ] **Step 1: Read the current schemas file to find `UserSettingsUpdate`**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings
grep -n "UserSettingsUpdate\|UserSettingsResponse" backend/app/models/schemas.py
```

- [ ] **Step 2: Add the new request schemas**

In `backend/app/models/schemas.py`, after the existing `UserSettingsUpdate` class, add:

```python
class ApiKeyAddRequest(BaseModel):
    """Schema for POST /api/users/settings/api-key.

    Sole purpose: add or replace the user's BYOK key. Validation +
    balance check happen server-side; this schema only enforces shape.
    """
    api_key: str = Field(..., min_length=10, max_length=500)

    @field_validator("api_key")
    @classmethod
    def validate_api_key(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("API key cannot be blank or whitespace-only")
        return v


class PreferredModelUpdateRequest(BaseModel):
    """Schema for PUT /api/users/settings/preferred-model.

    Sole purpose: set the active model. Tier enforcement is in the route
    (no key → must be a standard model id).
    """
    preferred_model: str = Field(..., min_length=1, max_length=255)

    @field_validator("preferred_model")
    @classmethod
    def validate_preferred_model(cls, v: str) -> str:
        v = _strip_control_chars(v).strip()
        if not v:
            raise ValueError("Model ID cannot be blank")
        if not re.match(r'^[a-zA-Z0-9_\-]+/[a-zA-Z0-9._\-:]+$', v):
            raise ValueError(
                "Model ID must follow the format 'provider/model-name'"
            )
        return v
```

(`_strip_control_chars` and `re` are already imported at the top of the file via the existing `UserSettingsUpdate` validator. Verify with `grep -n "_strip_control_chars\|^import re" backend/app/models/schemas.py` if uncertain.)

- [ ] **Step 3: Verify the schemas import-load**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings
python -c "from backend.app.models.schemas import ApiKeyAddRequest, PreferredModelUpdateRequest; print('ok')"
```

Expected: `ok`. If `from backend.app.models...` fails because the project uses a different import root, try `cd backend && python -c "from app.models.schemas import ApiKeyAddRequest, PreferredModelUpdateRequest; print('ok')"`.

- [ ] **Step 4: Commit**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings
git add backend/app/models/schemas.py
git commit -m "feat(settings): add request schemas for split api-key + preferred-model endpoints"
```

---

## Task 2: Backend — `POST /api/users/settings/api-key` (TDD)

**Files:**
- Create: `backend/tests/test_users_settings.py`
- Modify: `backend/app/routes/users.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_users_settings.py`:

```python
"""Tests for the split user-settings endpoints introduced in 2026-04 redesign."""

from unittest.mock import patch

import pytest
from fastapi import status

from app.constants import DEFAULT_STANDARD_MODEL, STANDARD_MODEL_IDS
from app.services.openrouter_balance import BalanceInfo, OpenRouterBalanceError


# ── Helpers ──────────────────────────────────────────────────────────────


def _healthy_balance(api_key: str = "sk-or-v1-healthy") -> BalanceInfo:
    return BalanceInfo(
        total_credits=10.0,
        total_usage=1.48,
        key_limit=None,
        key_limit_remaining=None,
        is_free_tier=False,
        key_label=f"{api_key[:8]}...{api_key[-4:]}",
        checked_at="2026-04-06T12:00:00+00:00",
        stale=False,
    )


def _empty_balance(api_key: str = "sk-or-v1-empty") -> BalanceInfo:
    return BalanceInfo(
        total_credits=0.0,
        total_usage=0.0,
        key_limit=None,
        key_limit_remaining=None,
        is_free_tier=True,
        key_label=f"{api_key[:8]}...{api_key[-4:]}",
        checked_at="2026-04-06T12:00:00+00:00",
        stale=False,
    )


# ── POST /settings/api-key ───────────────────────────────────────────────


class TestPostApiKey:
    def test_valid_key_with_credits_returns_200(self, client, db_user_factory):
        """Happy path: paste a valid key with credits, get the full settings response back."""
        user = db_user_factory()  # creates a user with no key
        with patch(
            "app.routes.users.fetch_balance_sync",
            return_value=_healthy_balance("sk-or-v1-test1234"),
        ):
            response = client.post(
                "/api/users/settings/api-key",
                json={"api_key": "sk-or-v1-test1234"},
                headers={"Authorization": f"Bearer {user.id}"},
            )

        assert response.status_code == status.HTTP_200_OK
        body = response.json()
        assert body["has_api_key"] is True
        assert body["key_hint"] == "1234"
        assert body["balance"]["balance_remaining"] == pytest.approx(8.52)
        assert body["balance"]["has_credits"] is True
        # The endpoint must NOT touch preferred_model
        assert body["preferred_model"] is None

    def test_zero_credit_key_returns_400(self, client, db_user_factory):
        """The Baffour Adu case: brand-new key with $0 → reject before saving."""
        user = db_user_factory()
        with patch(
            "app.routes.users.fetch_balance_sync",
            return_value=_empty_balance("sk-or-v1-zerox"),
        ):
            response = client.post(
                "/api/users/settings/api-key",
                json={"api_key": "sk-or-v1-zerox"},
                headers={"Authorization": f"Bearer {user.id}"},
            )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "$0 credits" in response.json()["detail"]
        # Verify the key was NOT persisted
        from app.database import get_db
        from app.models.database_models import User
        db = next(get_db())
        refreshed = db.query(User).filter(User.id == user.id).first()
        assert refreshed.encrypted_api_key is None

    def test_unreachable_openrouter_returns_400(self, client, db_user_factory):
        """fetch_balance_sync raises → 400 with 'invalid or unreachable'."""
        user = db_user_factory()
        with patch(
            "app.routes.users.fetch_balance_sync",
            side_effect=OpenRouterBalanceError("upstream timeout"),
        ):
            response = client.post(
                "/api/users/settings/api-key",
                json={"api_key": "sk-or-v1-broken1"},
                headers={"Authorization": f"Bearer {user.id}"},
            )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "invalid api key or openrouter is temporarily unreachable" in (
            response.json()["detail"].lower()
        )

    def test_replacing_existing_key_overwrites_hint(
        self, client, db_user_factory
    ):
        user = db_user_factory(
            encrypted_api_key=b"old-encrypted",
            key_hint="oldA",
        )
        with patch(
            "app.routes.users.fetch_balance_sync",
            return_value=_healthy_balance("sk-or-v1-newx5678"),
        ):
            response = client.post(
                "/api/users/settings/api-key",
                json={"api_key": "sk-or-v1-newx5678"},
                headers={"Authorization": f"Bearer {user.id}"},
            )
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["key_hint"] == "5678"

    def test_does_not_touch_preferred_model(self, client, db_user_factory):
        """Even if a saved standard model exists, this endpoint must leave it alone."""
        user = db_user_factory(preferred_model="meta-llama/llama-4-scout")
        with patch(
            "app.routes.users.fetch_balance_sync",
            return_value=_healthy_balance(),
        ):
            response = client.post(
                "/api/users/settings/api-key",
                json={"api_key": "sk-or-v1-test1234"},
                headers={"Authorization": f"Bearer {user.id}"},
            )
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["preferred_model"] == "meta-llama/llama-4-scout"

    def test_blank_key_returns_422(self, client, db_user_factory):
        user = db_user_factory()
        response = client.post(
            "/api/users/settings/api-key",
            json={"api_key": "          "},
            headers={"Authorization": f"Bearer {user.id}"},
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
```

**Note on fixtures:** This file assumes `client` and `db_user_factory` fixtures exist in `backend/tests/conftest.py`. Before running, check:

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings
grep -n "db_user_factory\|def client" backend/tests/conftest.py
```

If `db_user_factory` doesn't exist, **substitute the existing pattern** used by `backend/tests/test_users.py` (likely `test_user` fixture or direct `db_session` + `User(...)` construction). Adapt the helper calls in the tests accordingly. **Do not invent fixtures.**

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings/backend
pytest tests/test_users_settings.py::TestPostApiKey -v 2>&1 | tail -40
```

Expected: All tests fail with 404 / "POST not allowed" / "endpoint not found", because we haven't added the route yet.

- [ ] **Step 3: Implement the `POST /settings/api-key` route**

Open `backend/app/routes/users.py`. After the `update_user_settings` function (currently `PUT /settings`), add:

```python
@router.post("/settings/api-key", response_model=UserSettingsResponse)
@limiter.limit("5/minute")
async def add_api_key(
    request: Request,
    payload: ApiKeyAddRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add or replace the user's BYOK API key.

    Validates the key against OpenRouter and rejects keys with no
    credits before persisting. Does NOT touch preferred_model — that's
    a separate endpoint.
    """
    user_id = current_user["id"]
    db_user = db.query(database_models.User).filter(
        database_models.User.id == user_id
    ).first()

    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        balance = fetch_balance_sync(payload.api_key)
    except OpenRouterBalanceError as exc:
        logger.info(f"BYOK key save failed validation for user {user_id}: {exc}")
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid API key or OpenRouter is temporarily unreachable. "
                "Check your key on the OpenRouter dashboard and try again."
            ),
        ) from exc

    if not balance.has_credits:
        raise HTTPException(
            status_code=400,
            detail=(
                "Your OpenRouter key has $0 credits. Add credits at "
                "https://openrouter.ai/settings/credits, then save again."
            ),
        )

    db_user.encrypted_api_key = encryption_service.encrypt(payload.api_key)
    db_user.key_hint = (
        payload.api_key[-4:] if len(payload.api_key) > 8 else "****"
    )
    db_user.key_validated_at = datetime.now(timezone.utc)

    # Persist the freshly-fetched balance fields
    db_user.key_total_credits = balance.total_credits
    db_user.key_total_usage = balance.total_usage
    db_user.key_limit = balance.key_limit
    db_user.key_limit_remaining = balance.key_limit_remaining
    db_user.key_is_free_tier = balance.is_free_tier
    db_user.key_balance_checked_at = balance.checked_at
    db_user.key_balance_error = None

    db.commit()
    db.refresh(db_user)

    fresh_balance = get_cached_balance(db, db_user)
    return UserSettingsResponse(
        preferred_model=db_user.preferred_model,
        has_api_key=True,
        key_hint=db_user.key_hint,
        key_validated_at=db_user.key_validated_at,
        available_models=STANDARD_MODELS,
        balance=_balance_to_response(fresh_balance),
    )
```

Then add the imports at the top of the file (find the existing import block):

```python
from app.models.schemas import (
    ApiKeyAddRequest,
    PreferredModelUpdateRequest,
    UserResponse,
    UserSettingsResponse,
    UserSettingsUpdate,  # still imported for now; deleted in Task 5
)
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings/backend
pytest tests/test_users_settings.py::TestPostApiKey -v 2>&1 | tail -40
```

Expected: All `TestPostApiKey` tests pass. If a test fails because the assertion on `balance.balance_remaining` doesn't match, double-check the `_healthy_balance` helper computes `total_credits - total_usage = 8.52` (10.0 − 1.48). Adjust as needed.

- [ ] **Step 5: Run the full backend test suite to make sure nothing else broke**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings/backend
pytest tests/test_users.py tests/test_users_settings.py tests/test_users_balance_routes.py -v 2>&1 | tail -30
```

Expected: All pass. Existing `PUT /settings` tests in `test_users.py` should still pass (we haven't removed it yet).

- [ ] **Step 6: Commit**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings
git add backend/app/routes/users.py backend/tests/test_users_settings.py
git commit -m "feat(settings): add POST /settings/api-key with save-time balance check"
```

---

## Task 3: Backend — `PUT /api/users/settings/preferred-model` (TDD)

**Files:**
- Modify: `backend/tests/test_users_settings.py`
- Modify: `backend/app/routes/users.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_users_settings.py`:

```python
# ── PUT /settings/preferred-model ────────────────────────────────────────


class TestPutPreferredModel:
    def test_no_key_standard_model_returns_200(self, client, db_user_factory):
        user = db_user_factory()  # no key
        response = client.put(
            "/api/users/settings/preferred-model",
            json={"preferred_model": "meta-llama/llama-4-scout"},
            headers={"Authorization": f"Bearer {user.id}"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["preferred_model"] == "meta-llama/llama-4-scout"

    def test_no_key_premium_model_returns_403(self, client, db_user_factory):
        user = db_user_factory()
        response = client.put(
            "/api/users/settings/preferred-model",
            json={"preferred_model": "anthropic/claude-sonnet-4.6"},
            headers={"Authorization": f"Bearer {user.id}"},
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "openrouter api key" in response.json()["detail"].lower()

    def test_with_key_premium_model_returns_200(
        self, client, db_user_factory
    ):
        user = db_user_factory(
            encrypted_api_key=b"some-encrypted",
            key_hint="abcd",
        )
        response = client.put(
            "/api/users/settings/preferred-model",
            json={"preferred_model": "anthropic/claude-sonnet-4.6"},
            headers={"Authorization": f"Bearer {user.id}"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["preferred_model"] == "anthropic/claude-sonnet-4.6"

    def test_with_key_standard_model_returns_200(
        self, client, db_user_factory
    ):
        """A BYOK user can fall back to a standard model."""
        user = db_user_factory(
            encrypted_api_key=b"some-encrypted",
            key_hint="abcd",
        )
        response = client.put(
            "/api/users/settings/preferred-model",
            json={"preferred_model": "deepseek/deepseek-chat-v3-0324"},
            headers={"Authorization": f"Bearer {user.id}"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["preferred_model"] == "deepseek/deepseek-chat-v3-0324"

    def test_invalid_format_returns_422(self, client, db_user_factory):
        user = db_user_factory()
        response = client.put(
            "/api/users/settings/preferred-model",
            json={"preferred_model": "no-slash-here"},
            headers={"Authorization": f"Bearer {user.id}"},
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_does_not_touch_api_key(self, client, db_user_factory):
        user = db_user_factory(
            encrypted_api_key=b"keep-me",
            key_hint="zzzz",
        )
        response = client.put(
            "/api/users/settings/preferred-model",
            json={"preferred_model": "meta-llama/llama-4-scout"},
            headers={"Authorization": f"Bearer {user.id}"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["has_api_key"] is True
        assert response.json()["key_hint"] == "zzzz"
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings/backend
pytest tests/test_users_settings.py::TestPutPreferredModel -v 2>&1 | tail -40
```

Expected: All fail with 405 / 404.

- [ ] **Step 3: Implement the `PUT /settings/preferred-model` route**

In `backend/app/routes/users.py`, after the `add_api_key` function (added in Task 2), add:

```python
@router.put(
    "/settings/preferred-model",
    response_model=UserSettingsResponse,
)
@limiter.limit("20/minute")
async def update_preferred_model(
    request: Request,
    payload: PreferredModelUpdateRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Set the user's preferred model.

    Tier enforcement: a user without a BYOK key can only pick a model
    from STANDARD_MODEL_IDS. With a key on file, any model id is allowed.
    Does NOT touch the API key.
    """
    user_id = current_user["id"]
    db_user = db.query(database_models.User).filter(
        database_models.User.id == user_id
    ).first()

    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    has_key = bool(db_user.encrypted_api_key)
    if not has_key and payload.preferred_model not in STANDARD_MODEL_IDS:
        raise HTTPException(
            status_code=403,
            detail=(
                "Add your OpenRouter API key in Settings to unlock "
                "premium models."
            ),
        )

    db_user.preferred_model = payload.preferred_model
    db.commit()
    db.refresh(db_user)

    fresh_balance = None
    if db_user.encrypted_api_key:
        try:
            fresh_balance = get_cached_balance(db, db_user)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                f"Unexpected error reading balance after preferred-model "
                f"update for user {user_id}: {exc}"
            )

    return UserSettingsResponse(
        preferred_model=db_user.preferred_model,
        has_api_key=has_key,
        key_hint=db_user.key_hint,
        key_validated_at=db_user.key_validated_at,
        available_models=STANDARD_MODELS,
        balance=_balance_to_response(fresh_balance),
    )
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings/backend
pytest tests/test_users_settings.py::TestPutPreferredModel -v 2>&1 | tail -40
```

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings
git add backend/app/routes/users.py backend/tests/test_users_settings.py
git commit -m "feat(settings): add PUT /settings/preferred-model with tier enforcement"
```

---

## Task 4: Backend — modify `DELETE /settings/api-key` to reset preferred_model (TDD)

**Files:**
- Modify: `backend/tests/test_users_settings.py`
- Modify: `backend/app/routes/users.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_users_settings.py`:

```python
# ── DELETE /settings/api-key ─────────────────────────────────────────────


class TestDeleteApiKey:
    def test_with_key_and_premium_model_resets_to_default(
        self, client, db_user_factory
    ):
        user = db_user_factory(
            encrypted_api_key=b"will-be-cleared",
            key_hint="abcd",
            preferred_model="anthropic/claude-sonnet-4.6",
        )
        response = client.delete(
            "/api/users/settings/api-key",
            headers={"Authorization": f"Bearer {user.id}"},
        )
        assert response.status_code == status.HTTP_200_OK

        # Verify by re-reading settings
        from app.database import get_db
        from app.models.database_models import User
        db = next(get_db())
        refreshed = db.query(User).filter(User.id == user.id).first()
        assert refreshed.encrypted_api_key is None
        assert refreshed.key_hint is None
        assert refreshed.preferred_model == DEFAULT_STANDARD_MODEL

    def test_with_key_and_standard_model_still_resets_to_default(
        self, client, db_user_factory
    ):
        """Always reset on delete — even from a non-default standard."""
        user = db_user_factory(
            encrypted_api_key=b"will-be-cleared",
            key_hint="abcd",
            preferred_model="deepseek/deepseek-chat-v3-0324",
        )
        response = client.delete(
            "/api/users/settings/api-key",
            headers={"Authorization": f"Bearer {user.id}"},
        )
        assert response.status_code == status.HTTP_200_OK

        from app.database import get_db
        from app.models.database_models import User
        db = next(get_db())
        refreshed = db.query(User).filter(User.id == user.id).first()
        assert refreshed.preferred_model == DEFAULT_STANDARD_MODEL

    def test_without_key_is_idempotent(self, client, db_user_factory):
        user = db_user_factory()
        response = client.delete(
            "/api/users/settings/api-key",
            headers={"Authorization": f"Bearer {user.id}"},
        )
        assert response.status_code == status.HTTP_200_OK

    def test_balance_columns_cleared(self, client, db_user_factory):
        user = db_user_factory(
            encrypted_api_key=b"will-be-cleared",
            key_hint="abcd",
            key_total_credits=10.0,
            key_total_usage=2.0,
            key_is_free_tier=False,
        )
        response = client.delete(
            "/api/users/settings/api-key",
            headers={"Authorization": f"Bearer {user.id}"},
        )
        assert response.status_code == status.HTTP_200_OK

        from app.database import get_db
        from app.models.database_models import User
        db = next(get_db())
        refreshed = db.query(User).filter(User.id == user.id).first()
        assert refreshed.key_total_credits is None
        assert refreshed.key_total_usage is None
        assert refreshed.key_is_free_tier is None
```

- [ ] **Step 2: Run the new tests to verify failure mode**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings/backend
pytest tests/test_users_settings.py::TestDeleteApiKey -v 2>&1 | tail -30
```

Expected: `test_with_key_and_premium_model_resets_to_default` and `test_with_key_and_standard_model_still_resets_to_default` fail because the current DELETE sets `preferred_model = None`, not `DEFAULT_STANDARD_MODEL`. The other two should already pass (`test_without_key_is_idempotent`, `test_balance_columns_cleared`).

- [ ] **Step 3: Modify the existing `delete_api_key` function**

In `backend/app/routes/users.py`, locate `delete_api_key` (around the bottom of the file). Replace this line:

```python
    db_user.preferred_model = None
```

with:

```python
    db_user.preferred_model = DEFAULT_STANDARD_MODEL
```

Then add `DEFAULT_STANDARD_MODEL` to the imports near the top:

```python
from app.constants import (
    DEFAULT_STANDARD_MODEL,
    STANDARD_MODEL_IDS,
    STANDARD_MODELS,
)
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings/backend
pytest tests/test_users_settings.py::TestDeleteApiKey -v 2>&1 | tail -20
```

Expected: All four tests pass.

- [ ] **Step 5: Run the full file to confirm no regressions**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings/backend
pytest tests/test_users_settings.py tests/test_users.py -v 2>&1 | tail -30
```

Expected: All pass. Note that any existing test in `test_users.py` that asserted `preferred_model == None` after DELETE will now fail — fix it inline by changing the expected value to `DEFAULT_STANDARD_MODEL`.

- [ ] **Step 6: Commit**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings
git add backend/app/routes/users.py backend/tests/test_users_settings.py
# also stage any test_users.py edits from Step 5
git commit -m "fix(settings): DELETE /api-key resets preferred_model to DEFAULT_STANDARD_MODEL"
```

---

## Task 5: Backend — remove the combined `PUT /settings` route

**Files:**
- Modify: `backend/app/routes/users.py`
- Modify: `backend/app/models/schemas.py`
- Modify: `backend/tests/test_users.py` (remove obsolete tests)

- [ ] **Step 1: Find every consumer of `PUT /settings`**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings
grep -rn '"/api/users/settings"' --include="*.py" backend/
grep -rn 'updateSettings\|PUT.*\/settings\b' --include="*.ts" --include="*.tsx" frontend/src/
```

Expected: only test files in the backend reference it directly. The frontend uses `updateSettings` from `services/settings.ts` — that's the next set of tasks. Note the test files for cleanup.

- [ ] **Step 2: Delete the `update_user_settings` function from `users.py`**

In `backend/app/routes/users.py`, delete the entire `@router.put("/settings", ...)` function (the old `update_user_settings`). Keep `add_api_key`, `update_preferred_model`, `delete_api_key`, and `refresh_balance`.

- [ ] **Step 3: Delete `UserSettingsUpdate` from schemas and remove its import**

In `backend/app/models/schemas.py`, remove the `UserSettingsUpdate` class entirely.

In `backend/app/routes/users.py`, remove `UserSettingsUpdate` from the schemas import block.

- [ ] **Step 4: Update or delete obsolete tests in `test_users.py`**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings
grep -n 'PUT.*settings\|update_settings\|client.put.*"/api/users/settings"' backend/tests/test_users.py
```

For each match: if the test exclusively exercises the combined `PUT /settings`, delete it. The split-endpoint tests in `test_users_settings.py` already cover the equivalent surface area.

- [ ] **Step 5: Run the full backend suite**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings/backend
pytest tests/ -x 2>&1 | tail -30
```

Expected: all pass. If any non-test file tries to import `UserSettingsUpdate`, fix it (likely none).

- [ ] **Step 6: Commit**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings
git add backend/
git commit -m "refactor(settings): remove combined PUT /settings + UserSettingsUpdate schema"
```

---

## Task 6: Frontend — `settings.ts` service updates

**Files:**
- Modify: `frontend/src/services/settings.ts`
- Modify: `frontend/src/services/settings.test.ts`

- [ ] **Step 1: Read the current service test file**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings
cat frontend/src/services/settings.test.ts | head -80
```

Note the testing style (Vitest, MSW, raw `fetch` mocks, etc.) — match it.

- [ ] **Step 2: Write the failing service tests**

In `frontend/src/services/settings.test.ts`, add the following tests at the end of the existing test suite:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { settingsService } from "./settings";
import { api } from "./api";

describe("settingsService split endpoints", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("addApiKey", () => {
    it("POSTs to /api/users/settings/api-key with the key", async () => {
      const postSpy = vi.spyOn(api, "post").mockResolvedValue({
        data: {
          preferred_model: null,
          has_api_key: true,
          key_hint: "1234",
          key_validated_at: "2026-04-06T12:00:00Z",
          available_models: [],
          balance: {
            total_credits: 10,
            total_usage: 1.48,
            balance_remaining: 8.52,
            has_credits: true,
            is_free_tier: false,
            checked_at: "2026-04-06T12:00:00Z",
            stale: false,
          },
        },
      });

      const result = await settingsService.addApiKey("sk-or-v1-test1234");

      expect(postSpy).toHaveBeenCalledWith("/api/users/settings/api-key", {
        api_key: "sk-or-v1-test1234",
      });
      expect(result.has_api_key).toBe(true);
      expect(result.balance?.balance_remaining).toBe(8.52);
    });

    it("propagates 400 errors from the server", async () => {
      vi.spyOn(api, "post").mockRejectedValue({
        response: { status: 400, data: { detail: "Your OpenRouter key has $0 credits..." } },
      });

      await expect(
        settingsService.addApiKey("sk-or-v1-empty1234"),
      ).rejects.toMatchObject({ response: { status: 400 } });
    });
  });

  describe("updatePreferredModel", () => {
    it("PUTs to /api/users/settings/preferred-model", async () => {
      const putSpy = vi.spyOn(api, "put").mockResolvedValue({
        data: {
          preferred_model: "anthropic/claude-sonnet-4.6",
          has_api_key: true,
          key_hint: "1234",
          key_validated_at: "2026-04-06T12:00:00Z",
          available_models: [],
        },
      });

      const result = await settingsService.updatePreferredModel(
        "anthropic/claude-sonnet-4.6",
      );

      expect(putSpy).toHaveBeenCalledWith(
        "/api/users/settings/preferred-model",
        { preferred_model: "anthropic/claude-sonnet-4.6" },
      );
      expect(result.preferred_model).toBe("anthropic/claude-sonnet-4.6");
    });
  });

  describe("removed updateSettings", () => {
    it("no longer exists on the service surface", () => {
      // Type-level: this assertion exists for documentation. The actual
      // safety is enforced by TypeScript at compile time.
      // @ts-expect-error - updateSettings is removed
      expect(settingsService.updateSettings).toBeUndefined();
    });
  });
});
```

- [ ] **Step 3: Run the new tests to verify failure**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings/frontend
npm test -- --run src/services/settings.test.ts 2>&1 | tail -30
```

Expected: failures around `addApiKey`, `updatePreferredModel` ("not a function").

- [ ] **Step 4: Update `frontend/src/services/settings.ts`**

Read the current file first:

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings
cat frontend/src/services/settings.ts
```

Then replace the `settingsService` export with:

```typescript
export const settingsService = {
  getSettings: async (): Promise<UserSettings> => {
    const response = await api.get("/api/users/settings");
    return response.data;
  },

  /** Add or replace the user's BYOK key. Validates + balance-checks server-side. */
  addApiKey: async (apiKey: string): Promise<UserSettings> => {
    const response = await api.post("/api/users/settings/api-key", {
      api_key: apiKey,
    });
    return response.data;
  },

  /** Set the user's preferred model. Server enforces tier (no key → standard only). */
  updatePreferredModel: async (modelId: string): Promise<UserSettings> => {
    const response = await api.put("/api/users/settings/preferred-model", {
      preferred_model: modelId,
    });
    return response.data;
  },

  deleteApiKey: async (): Promise<void> => {
    await api.delete("/api/users/settings/api-key");
  },

  refreshBalance: async (): Promise<BalanceInfo> => {
    const response = await api.post("/api/users/settings/refresh-balance");
    return response.data;
  },

  getRecommendedModels: async (): Promise<RecommendedModels> => {
    const response = await api.get("/api/models/recommended");
    return response.data;
  },

  searchModels: async (
    query: string,
    freeOnly?: boolean,
  ): Promise<SearchModel[]> => {
    const response = await api.get("/api/models/search", {
      params: {
        q: query,
        ...(freeOnly !== undefined && { free_only: freeOnly }),
      },
    });
    return response.data;
  },
};
```

Also delete the now-unused `UserSettingsUpdate` interface from this file.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings/frontend
npm test -- --run src/services/settings.test.ts 2>&1 | tail -30
```

Expected: all pass.

- [ ] **Step 6: Run typecheck**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings/frontend
npx tsc --noEmit 2>&1 | tail -30
```

Expected: errors only in `useSettings.ts` and `ModelSettingsDialog.tsx` (they still reference the removed `updateSettings`). These are fixed in the next tasks.

- [ ] **Step 7: Commit**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings
git add frontend/src/services/settings.ts frontend/src/services/settings.test.ts
git commit -m "feat(settings): split service into addApiKey + updatePreferredModel"
```

---

## Task 7: Frontend — `useSettings` hook updates

**Files:**
- Modify: `frontend/src/hooks/useSettings.ts`
- Create: `frontend/src/hooks/useSettings.test.ts` (or modify if exists)

- [ ] **Step 1: Check for an existing hook test**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings
ls frontend/src/hooks/useSettings.test.ts 2>/dev/null || echo "no test file yet"
```

If a file exists, read it. Otherwise we'll create one.

- [ ] **Step 2: Write hook tests**

Create or replace `frontend/src/hooks/useSettings.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useSettings } from "./useSettings";
import { settingsService } from "../services/settings";
import type { UserSettings } from "../services/settings";

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const baseSettings: UserSettings = {
  preferred_model: null,
  has_api_key: false,
  key_hint: null,
  key_validated_at: null,
  available_models: [
    { id: "meta-llama/llama-4-scout", name: "Llama 4 Scout", tier: "standard", provider: "Meta" },
  ],
  balance: null,
};

describe("useSettings", () => {
  beforeEach(() => {
    vi.spyOn(settingsService, "getSettings").mockResolvedValue(baseSettings);
    vi.spyOn(settingsService, "getRecommendedModels").mockResolvedValue({
      standard: { id: "x", name: "x", description: "x" },
      advanced: { id: "y", name: "y", description: "y" },
    });
  });

  it("exposes addApiKey, updatePreferredModel, deleteApiKey, refreshBalance", async () => {
    const { result } = renderHook(() => useSettings(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(typeof result.current.addApiKey).toBe("function");
    expect(typeof result.current.updatePreferredModel).toBe("function");
    expect(typeof result.current.deleteApiKey).toBe("function");
    expect(typeof result.current.refreshBalance).toBe("function");
    // updateSettings is removed
    expect((result.current as Record<string, unknown>).updateSettings).toBeUndefined();
  });

  it("addApiKey writes the response into the cache", async () => {
    const updated: UserSettings = {
      ...baseSettings,
      has_api_key: true,
      key_hint: "1234",
      balance: {
        total_credits: 10,
        total_usage: 1.48,
        balance_remaining: 8.52,
        has_credits: true,
        is_free_tier: false,
        checked_at: "2026-04-06T12:00:00Z",
        stale: false,
      },
    };
    vi.spyOn(settingsService, "addApiKey").mockResolvedValue(updated);

    const { result } = renderHook(() => useSettings(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.settings).toBeDefined());

    await act(async () => {
      await result.current.addApiKey("sk-or-v1-test1234");
    });

    await waitFor(() => {
      expect(result.current.settings?.has_api_key).toBe(true);
      expect(result.current.settings?.key_hint).toBe("1234");
    });
  });

  it("updatePreferredModel writes the response into the cache", async () => {
    const updated: UserSettings = {
      ...baseSettings,
      preferred_model: "meta-llama/llama-4-scout",
    };
    vi.spyOn(settingsService, "updatePreferredModel").mockResolvedValue(updated);

    const { result } = renderHook(() => useSettings(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.settings).toBeDefined());

    await act(async () => {
      await result.current.updatePreferredModel("meta-llama/llama-4-scout");
    });

    await waitFor(() => {
      expect(result.current.settings?.preferred_model).toBe(
        "meta-llama/llama-4-scout",
      );
    });
  });

  it("addApiKey error surfaces via addKeyError and does not update cache", async () => {
    vi.spyOn(settingsService, "addApiKey").mockRejectedValue(
      new Error("Invalid key"),
    );

    const { result } = renderHook(() => useSettings(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.settings).toBeDefined());

    await act(async () => {
      try {
        await result.current.addApiKey("sk-or-v1-broken");
      } catch {
        /* expected */
      }
    });

    await waitFor(() => {
      expect(result.current.addKeyError).toBeTruthy();
      expect(result.current.settings?.has_api_key).toBe(false);
    });
  });
});
```

- [ ] **Step 3: Run hook tests to verify failure**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings/frontend
npm test -- --run src/hooks/useSettings.test.ts 2>&1 | tail -40
```

Expected: failures because `addApiKey`, `updatePreferredModel`, `addKeyError` don't yet exist on the hook surface.

- [ ] **Step 4: Rewrite `frontend/src/hooks/useSettings.ts`**

Replace the file contents with:

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { settingsService } from "../services/settings";
import type { UserSettings } from "../services/settings";
import type { BalanceInfo } from "../types";

export function useSettings() {
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ["user-settings"],
    queryFn: settingsService.getSettings,
  });

  const recommendedQuery = useQuery({
    queryKey: ["recommended-models"],
    queryFn: settingsService.getRecommendedModels,
    staleTime: 5 * 60 * 1000,
  });

  /** Add or replace the BYOK key. On success, writes the fresh settings into the cache. */
  const addApiKeyMutation = useMutation<UserSettings, Error, string>({
    mutationFn: (apiKey: string) => settingsService.addApiKey(apiKey),
    onSuccess: (data) => {
      queryClient.setQueryData<UserSettings>(["user-settings"], data);
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
    },
  });

  /** Set the preferred model. On success, writes the fresh settings into the cache. */
  const updatePreferredModelMutation = useMutation<UserSettings, Error, string>({
    mutationFn: (modelId: string) =>
      settingsService.updatePreferredModel(modelId),
    onSuccess: (data) => {
      queryClient.setQueryData<UserSettings>(["user-settings"], data);
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
    },
  });

  const deleteKeyMutation = useMutation({
    mutationFn: settingsService.deleteApiKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
    },
  });

  const refreshBalanceMutation = useMutation<BalanceInfo, Error, void>({
    mutationFn: () => settingsService.refreshBalance(),
    onSuccess: (balance) => {
      queryClient.setQueryData<UserSettings | undefined>(
        ["user-settings"],
        (prev) => (prev ? { ...prev, balance } : prev),
      );
    },
  });

  return {
    settings: settingsQuery.data,
    isLoading: settingsQuery.isLoading,
    recommended: recommendedQuery.data,
    isLoadingRecommended: recommendedQuery.isLoading,

    addApiKey: addApiKeyMutation.mutateAsync,
    isAddingKey: addApiKeyMutation.isPending,
    addKeyError: addApiKeyMutation.error,
    resetAddKeyError: addApiKeyMutation.reset,

    updatePreferredModel: updatePreferredModelMutation.mutateAsync,
    isUpdatingModel: updatePreferredModelMutation.isPending,
    updateModelError: updatePreferredModelMutation.error,
    resetUpdateModelError: updatePreferredModelMutation.reset,

    deleteApiKey: deleteKeyMutation.mutateAsync,
    isDeletingKey: deleteKeyMutation.isPending,

    refreshBalance: refreshBalanceMutation.mutateAsync,
    isRefreshingBalance: refreshBalanceMutation.isPending,
    refreshBalanceError: refreshBalanceMutation.error,
  };
}
```

- [ ] **Step 5: Run the hook tests**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings/frontend
npm test -- --run src/hooks/useSettings.test.ts 2>&1 | tail -30
```

Expected: all pass.

- [ ] **Step 6: Run typecheck**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings/frontend
npx tsc --noEmit 2>&1 | tail -30
```

Expected: only `ModelSettingsDialog.tsx` errors remain (it still uses the removed `updateSettings` etc).

- [ ] **Step 7: Commit**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings
git add frontend/src/hooks/useSettings.ts frontend/src/hooks/useSettings.test.ts
git commit -m "feat(settings): split useSettings into addApiKey + updatePreferredModel mutations"
```

---

## Task 8: Frontend — replace `ModelSettingsDialog.test.tsx` (TDD)

We rewrite the test file BEFORE rewriting the dialog so the dialog is built against the new tests.

**Files:**
- Modify: `frontend/src/components/settings/ModelSettingsDialog.test.tsx` (full rewrite)

- [ ] **Step 1: Read the current test file structure**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings
wc -l frontend/src/components/settings/ModelSettingsDialog.test.tsx
head -60 frontend/src/components/settings/ModelSettingsDialog.test.tsx
```

Note the test framework, mock setup, and how it provides QueryClient. We must match these patterns in the new file.

- [ ] **Step 2: Read the current test file in full**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings
cat frontend/src/components/settings/ModelSettingsDialog.test.tsx
```

Identify the pieces we'll reuse: render helper, QueryClient setup, mocked `useSettings`/`useModelSearch` patterns.

- [ ] **Step 3: Replace the test file**

Overwrite `frontend/src/components/settings/ModelSettingsDialog.test.tsx` with the following. **Adapt the mock patterns to whatever the existing file uses (the imports of `vi.mock` etc).** The semantic test bodies are the source of truth for behavior.

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { ModelSettingsDialog } from "./ModelSettingsDialog";
import { settingsService } from "../../services/settings";
import type { UserSettings, SearchModel } from "../../services/settings";

// ── Test helpers ─────────────────────────────────────────────────────────

const STANDARD_MODELS = [
  { id: "meta-llama/llama-4-scout", name: "Llama 4 Scout", tier: "standard", provider: "Meta" },
  { id: "nvidia/nemotron-3-super-120b-a12b", name: "Nemotron 3 Super 120B", tier: "standard", provider: "NVIDIA" },
  { id: "deepseek/deepseek-chat-v3-0324", name: "DeepSeek V3", tier: "standard", provider: "DeepSeek" },
];

function makeSettings(overrides: Partial<UserSettings> = {}): UserSettings {
  return {
    preferred_model: null,
    has_api_key: false,
    key_hint: null,
    key_validated_at: null,
    available_models: STANDARD_MODELS,
    balance: null,
    ...overrides,
  };
}

function healthyBalance() {
  return {
    total_credits: 10,
    total_usage: 1.48,
    balance_remaining: 8.52,
    has_credits: true,
    is_free_tier: false,
    checked_at: "2026-04-06T12:00:00Z",
    stale: false,
  };
}

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function renderDialog() {
  const onOpenChange = vi.fn();
  const utils = render(
    <ModelSettingsDialog open onOpenChange={onOpenChange} />,
    { wrapper: makeWrapper() },
  );
  return { ...utils, onOpenChange };
}

// ── Default mocks ────────────────────────────────────────────────────────

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(settingsService, "getRecommendedModels").mockResolvedValue({
    standard: { id: "x", name: "x", description: "x" },
    advanced: { id: "y", name: "y", description: "y" },
  });
  vi.spyOn(settingsService, "searchModels").mockResolvedValue([]);
});

// ── Mode initialization ──────────────────────────────────────────────────

describe("ModelSettingsDialog — mode initialization", () => {
  it("opens in Standard mode when no key and no preferred model", async () => {
    vi.spyOn(settingsService, "getSettings").mockResolvedValue(makeSettings());
    renderDialog();

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /model settings/i })).toBeInTheDocument(),
    );

    expect(screen.getByRole("tab", { name: /standard/i })).toHaveAttribute(
      "data-state",
      "active",
    );
    // Combobox is not rendered in Standard mode
    expect(screen.queryByPlaceholderText(/search models/i)).not.toBeInTheDocument();
  });

  it("opens in Standard mode when key exists but saved model is standard", async () => {
    vi.spyOn(settingsService, "getSettings").mockResolvedValue(
      makeSettings({
        has_api_key: true,
        key_hint: "1234",
        preferred_model: "meta-llama/llama-4-scout",
        balance: healthyBalance(),
      }),
    );
    renderDialog();

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /standard/i })).toHaveAttribute(
        "data-state",
        "active",
      ),
    );
    // Llama 4 Scout radio is checked
    expect(
      screen.getByRole("radio", { name: /llama 4 scout/i }),
    ).toBeChecked();
    // The "key on file" affordance is visible
    expect(screen.getByText(/key on file.*1234/i)).toBeInTheDocument();
  });

  it("opens in Premium mode when saved model is premium", async () => {
    vi.spyOn(settingsService, "getSettings").mockResolvedValue(
      makeSettings({
        has_api_key: true,
        key_hint: "1234",
        preferred_model: "anthropic/claude-sonnet-4.6",
        balance: healthyBalance(),
      }),
    );
    renderDialog();

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /premium/i })).toHaveAttribute(
        "data-state",
        "active",
      ),
    );
    expect(screen.getByText(/key ending in.*1234/i)).toBeInTheDocument();
    expect(screen.getByText(/8\.52.*of.*\$10/i)).toBeInTheDocument();
  });
});

// ── Standard mode ────────────────────────────────────────────────────────

describe("ModelSettingsDialog — Standard mode", () => {
  beforeEach(() => {
    vi.spyOn(settingsService, "getSettings").mockResolvedValue(
      makeSettings({ preferred_model: "meta-llama/llama-4-scout" }),
    );
  });

  it("Save is disabled with no pending change", async () => {
    renderDialog();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /save/i })).toBeDisabled(),
    );
  });

  it("picking a different standard radio enables Save and PUTs preferred-model", async () => {
    const updateSpy = vi
      .spyOn(settingsService, "updatePreferredModel")
      .mockResolvedValue(
        makeSettings({ preferred_model: "deepseek/deepseek-chat-v3-0324" }),
      );

    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("radio", { name: /deepseek/i }));
    const saveBtn = screen.getByRole("button", { name: /save/i });
    expect(saveBtn).toBeEnabled();

    await user.click(saveBtn);
    await waitFor(() =>
      expect(updateSpy).toHaveBeenCalledWith("deepseek/deepseek-chat-v3-0324"),
    );
  });

  it("clicking the already-selected radio leaves Save disabled", async () => {
    const user = userEvent.setup();
    renderDialog();
    await waitFor(() => screen.getByRole("radio", { name: /llama 4 scout/i }));

    await user.click(screen.getByRole("radio", { name: /llama 4 scout/i }));
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
  });
});

// ── Premium mode, no key ─────────────────────────────────────────────────

describe("ModelSettingsDialog — Premium mode, no key", () => {
  beforeEach(() => {
    vi.spyOn(settingsService, "getSettings").mockResolvedValue(makeSettings());
  });

  it("switching to Premium reveals the key input, no combobox", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("tab", { name: /premium/i }));
    expect(screen.getByPlaceholderText(/sk-or-v1/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/search models/i)).not.toBeInTheDocument();
  });

  it("Validate button is disabled until the key is at least 10 chars", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole("tab", { name: /premium/i }));

    const input = screen.getByPlaceholderText(/sk-or-v1/i);
    const validateBtn = screen.getByRole("button", { name: /validate/i });

    expect(validateBtn).toBeDisabled();
    await user.type(input, "short");
    expect(validateBtn).toBeDisabled();
    await user.type(input, "1234567890");
    expect(validateBtn).toBeEnabled();
  });

  it("on validate success, combobox mounts and balance shows", async () => {
    const addKeySpy = vi
      .spyOn(settingsService, "addApiKey")
      .mockResolvedValue(
        makeSettings({
          has_api_key: true,
          key_hint: "1234",
          balance: healthyBalance(),
        }),
      );

    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("tab", { name: /premium/i }));
    await user.type(
      screen.getByPlaceholderText(/sk-or-v1/i),
      "sk-or-v1-test1234",
    );
    await user.click(screen.getByRole("button", { name: /validate/i }));

    await waitFor(() => expect(addKeySpy).toHaveBeenCalledWith("sk-or-v1-test1234"));
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/search models/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/8\.52.*of.*\$10/i)).toBeInTheDocument();
  });

  it("on validate failure, error surfaces inline and combobox stays absent", async () => {
    vi.spyOn(settingsService, "addApiKey").mockRejectedValue({
      response: {
        status: 400,
        data: { detail: "Your OpenRouter key has $0 credits..." },
      },
      message: "Request failed",
    });

    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("tab", { name: /premium/i }));
    await user.type(
      screen.getByPlaceholderText(/sk-or-v1/i),
      "sk-or-v1-empty1234",
    );
    await user.click(screen.getByRole("button", { name: /validate/i }));

    await waitFor(() =>
      expect(screen.getByText(/\$0 credits|invalid api key/i)).toBeInTheDocument(),
    );
    expect(screen.queryByPlaceholderText(/search models/i)).not.toBeInTheDocument();
  });
});

// ── Premium mode, validated key ──────────────────────────────────────────

describe("ModelSettingsDialog — Premium mode, validated key", () => {
  beforeEach(() => {
    vi.spyOn(settingsService, "getSettings").mockResolvedValue(
      makeSettings({
        has_api_key: true,
        key_hint: "1234",
        preferred_model: "anthropic/claude-sonnet-4.6",
        balance: healthyBalance(),
      }),
    );
  });

  it("controlled combobox shows the saved premium id on open", async () => {
    renderDialog();
    await waitFor(() =>
      expect(screen.getByDisplayValue(/claude/i)).toBeInTheDocument(),
    );
  });

  it("picking a different model enables Save and PUTs preferred-model", async () => {
    const searchResults: SearchModel[] = [
      {
        id: "openai/gpt-4o",
        name: "GPT-4o",
        provider: "OpenAI",
        context_length: 128000,
        is_free: false,
      },
    ];
    vi.spyOn(settingsService, "searchModels").mockResolvedValue(searchResults);
    const updateSpy = vi
      .spyOn(settingsService, "updatePreferredModel")
      .mockResolvedValue(
        makeSettings({
          has_api_key: true,
          key_hint: "1234",
          preferred_model: "openai/gpt-4o",
          balance: healthyBalance(),
        }),
      );

    const user = userEvent.setup();
    renderDialog();

    const input = await screen.findByPlaceholderText(/search models/i);
    await user.clear(input);
    await user.type(input, "gpt-4o");

    await waitFor(() => screen.getByRole("option", { name: /gpt-4o/i }));
    await user.click(screen.getByRole("option", { name: /gpt-4o/i }));

    const saveBtn = screen.getByRole("button", { name: /save/i });
    await waitFor(() => expect(saveBtn).toBeEnabled());
    await user.click(saveBtn);

    await waitFor(() =>
      expect(updateSpy).toHaveBeenCalledWith("openai/gpt-4o"),
    );
  });

  it("clicking Remove key flips mode to Standard and clears the combobox", async () => {
    vi.spyOn(settingsService, "deleteApiKey").mockResolvedValue();
    // After delete, settings refetch returns the default standard
    vi.spyOn(settingsService, "getSettings")
      .mockResolvedValueOnce(
        makeSettings({
          has_api_key: true,
          key_hint: "1234",
          preferred_model: "anthropic/claude-sonnet-4.6",
          balance: healthyBalance(),
        }),
      )
      .mockResolvedValue(
        makeSettings({
          has_api_key: false,
          preferred_model: "meta-llama/llama-4-scout",
        }),
      );

    const user = userEvent.setup();
    renderDialog();

    await waitFor(() =>
      expect(screen.getByText(/key ending in.*1234/i)).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: /remove/i }));

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /standard/i })).toHaveAttribute(
        "data-state",
        "active",
      ),
    );
    expect(screen.queryByPlaceholderText(/search models/i)).not.toBeInTheDocument();
  });
});

// ── Sticky pendingModel ──────────────────────────────────────────────────

describe("ModelSettingsDialog — sticky pendingModel under refetch", () => {
  it("a background settings refetch does not overwrite an in-flight model pick", async () => {
    let getCallCount = 0;
    vi.spyOn(settingsService, "getSettings").mockImplementation(async () => {
      getCallCount += 1;
      return makeSettings({
        has_api_key: true,
        key_hint: "1234",
        preferred_model: "anthropic/claude-sonnet-4.6",
        balance: { ...healthyBalance(), balance_remaining: 8.52 - getCallCount * 0.1 },
      });
    });
    const searchResults: SearchModel[] = [
      {
        id: "openai/gpt-4o",
        name: "GPT-4o",
        provider: "OpenAI",
        context_length: 128000,
        is_free: false,
      },
    ];
    vi.spyOn(settingsService, "searchModels").mockResolvedValue(searchResults);

    const user = userEvent.setup();
    const { rerender } = renderDialog();

    const input = await screen.findByPlaceholderText(/search models/i);
    await user.type(input, "gpt-4o");
    await waitFor(() => screen.getByRole("option", { name: /gpt-4o/i }));
    await user.click(screen.getByRole("option", { name: /gpt-4o/i }));

    // Force a re-render that mimics a background refetch landing
    rerender(<ModelSettingsDialog open onOpenChange={() => {}} />);

    // pendingModel should still be GPT-4o, NOT reset to claude
    expect(screen.getByDisplayValue(/gpt-4o/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save/i })).toBeEnabled();
  });
});
```

- [ ] **Step 4: Run the new tests to verify they all fail**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings/frontend
npm test -- --run src/components/settings/ModelSettingsDialog.test.tsx 2>&1 | tail -50
```

Expected: Most tests fail because the dialog still has the old structure. **Do not commit yet** — the next task makes them pass.

---

## Task 9: Frontend — rewrite `ModelSettingsDialog.tsx`

**Files:**
- Modify: `frontend/src/components/settings/ModelSettingsDialog.tsx` (full rewrite)
- May need: a `Tabs` import from shadcn/ui (or whichever segmented control the project uses)

- [ ] **Step 1: Find the project's Tabs / segmented-control component**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings
ls frontend/src/components/ui/ | grep -i "tab\|segment"
```

If `tabs.tsx` exists, use it. Otherwise install it via the shadcn CLI: `npx shadcn@latest add tabs`. (Verify with the user before installing if uncertain.)

- [ ] **Step 2: Replace `frontend/src/components/settings/ModelSettingsDialog.tsx`**

Overwrite with:

```tsx
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from "../ui/combobox";
import { useSettings } from "../../hooks/useSettings";
import { useModelSearch } from "../../hooks/useModelSearch";
import { ModelOption } from "./ModelOption";
import { BalanceDisplay } from "./BalanceDisplay";
import { LoaderIcon } from "lucide-react";
import type { SearchModel, UserSettings } from "../../services/settings";

type Mode = "standard" | "premium";

interface ModelSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function deriveInitialMode(settings: UserSettings | undefined): Mode {
  if (!settings) return "standard";
  const standardIds = new Set(
    settings.available_models
      .filter((m) => m.tier === "standard")
      .map((m) => m.id),
  );
  if (settings.preferred_model && !standardIds.has(settings.preferred_model)) {
    return "premium";
  }
  return "standard";
}

export function ModelSettingsDialog({
  open,
  onOpenChange,
}: ModelSettingsDialogProps) {
  const {
    settings,
    isLoading,
    addApiKey,
    isAddingKey,
    addKeyError,
    resetAddKeyError,
    updatePreferredModel,
    isUpdatingModel,
    updateModelError,
    resetUpdateModelError,
    deleteApiKey,
    isDeletingKey,
    refreshBalance,
    isRefreshingBalance,
  } = useSettings();

  const [mode, setMode] = useState<Mode>("standard");
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [pendingModel, setPendingModel] = useState<string | null>(null);
  const { results, isSearching, query, setQuery } = useModelSearch();

  const standardModels =
    settings?.available_models.filter((m) => m.tier === "standard") ?? [];

  // ── Reset on open ────────────────────────────────────────────────────
  useEffect(() => {
    if (!open || !settings) return;
    setApiKeyDraft("");
    setPendingModel(null);
    setQuery("");
    resetAddKeyError();
    resetUpdateModelError();
    setMode(deriveInitialMode(settings));
    // Intentionally only re-run when `open` flips. We do NOT want to
    // re-derive mode every time settings refetches in the background.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (isLoading || !settings) return null;

  // ── Derived values (no local mirrors of saved state) ─────────────────
  const effectiveModel = pendingModel ?? settings.preferred_model;
  const isDirty =
    pendingModel != null && pendingModel !== settings.preferred_model;

  // ── Handlers ─────────────────────────────────────────────────────────
  const handleModeChange = (next: string) => {
    setMode(next as Mode);
    // Switching tabs clears any pending pick to avoid carrying a premium
    // pick into Standard mode (or vice versa).
    setPendingModel(null);
    resetAddKeyError();
    resetUpdateModelError();
  };

  const handleStandardPick = (id: string) => {
    setPendingModel(id);
    resetUpdateModelError();
  };

  const handlePremiumPick = (model: SearchModel | null) => {
    if (!model) return;
    setPendingModel(model.id);
    resetUpdateModelError();
  };

  const handleAddKey = async () => {
    if (apiKeyDraft.length < 10) return;
    try {
      await addApiKey(apiKeyDraft);
      setApiKeyDraft("");
    } catch {
      // addKeyError is set by the mutation; the inline error renders it.
    }
  };

  const handleRemoveKey = async () => {
    try {
      await deleteApiKey();
      setMode("standard");
      setPendingModel(null);
      setApiKeyDraft("");
    } catch {
      // surfaced via updateModelError or a future toast
    }
  };

  const handleSave = async () => {
    if (!isDirty || pendingModel == null) {
      onOpenChange(false);
      return;
    }
    try {
      await updatePreferredModel(pendingModel);
      onOpenChange(false);
    } catch {
      // updateModelError is set; user retries
    }
  };

  // ── Render ───────────────────────────────────────────────────────────
  const addKeyErrorMessage = addKeyError
    ? extractErrorMessage(addKeyError, "Could not save the API key.")
    : null;
  const updateModelErrorMessage = updateModelError
    ? extractErrorMessage(updateModelError, "Could not update the model.")
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Model Settings</DialogTitle>
          <DialogDescription>
            Choose between the included standard models, or bring your own
            OpenRouter key to use any premium model.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={handleModeChange} className="py-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="standard">Standard</TabsTrigger>
            <TabsTrigger value="premium">Premium</TabsTrigger>
          </TabsList>

          {/* ── STANDARD MODE ───────────────────────────────────────── */}
          <TabsContent value="standard" className="mt-4">
            <RadioGroup
              value={effectiveModel ?? ""}
              onValueChange={handleStandardPick}
              className="flex flex-col gap-2"
            >
              {standardModels.map((model) => (
                <label
                  key={model.id}
                  className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-[color,background,border-color] duration-[var(--duration-micro)] ease-[var(--ease)] ${
                    effectiveModel === model.id
                      ? "border-interactive-focus bg-interactive-focus-bg"
                      : "border-border hover:bg-interactive-fill"
                  }`}
                >
                  <RadioGroupItem value={model.id} />
                  <div>
                    <div className="font-medium text-sm">{model.name}</div>
                    <div className="text-xs text-text-tertiary">
                      {model.provider ?? "Open source"}
                    </div>
                  </div>
                </label>
              ))}
            </RadioGroup>

            {settings.has_api_key && (
              <div className="mt-3 rounded-lg border border-border bg-card px-3 py-2 text-xs text-text-tertiary">
                OpenRouter key on file (ending …{settings.key_hint ?? "****"}).{" "}
                <button
                  type="button"
                  className="underline hover:text-text-secondary"
                  onClick={handleRemoveKey}
                  disabled={isDeletingKey}
                >
                  Remove key
                </button>
              </div>
            )}
          </TabsContent>

          {/* ── PREMIUM MODE ───────────────────────────────────────── */}
          <TabsContent value="premium" className="mt-4">
            {!settings.has_api_key ? (
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="api-key-input"
                  className="text-section text-text-tertiary"
                >
                  OpenRouter API Key
                </label>
                <Input
                  id="api-key-input"
                  type="password"
                  placeholder="sk-or-v1-..."
                  value={apiKeyDraft}
                  onChange={(e) => setApiKeyDraft(e.target.value)}
                  minLength={10}
                  maxLength={500}
                />
                <p className="text-xs text-text-tertiary">
                  Get your key at{" "}
                  <a
                    href="https://openrouter.ai/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-interactive-focus underline"
                  >
                    openrouter.ai/keys
                  </a>
                </p>
                {addKeyErrorMessage && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {addKeyErrorMessage}
                  </div>
                )}
                <Button
                  onClick={handleAddKey}
                  disabled={apiKeyDraft.length < 10 || isAddingKey}
                  className="w-fit"
                >
                  {isAddingKey ? "Validating..." : "Validate & Save Key"}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
                    Key ending in …{settings.key_hint ?? "****"}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveKey}
                    disabled={isDeletingKey}
                  >
                    Remove
                  </Button>
                </div>

                <BalanceDisplay
                  balance={settings.balance ?? null}
                  onRefresh={() => {
                    void refreshBalance().catch(() => {
                      // surfaced by stale flag in the component
                    });
                  }}
                  isRefreshing={isRefreshingBalance}
                />

                <Combobox<SearchModel>
                  items={results}
                  filteredItems={results}
                  filter={null}
                  itemToStringLabel={(m) => m?.name ?? ""}
                  itemToStringValue={(m) => m?.id ?? ""}
                  // Controlled: the displayed value is always the
                  // current effective model (pending OR saved).
                  value={
                    results.find((m) => m.id === effectiveModel) ??
                    (effectiveModel
                      ? ({
                          id: effectiveModel,
                          name: effectiveModel,
                          provider: "",
                          context_length: null,
                          is_free: false,
                        } as SearchModel)
                      : null)
                  }
                  onInputValueChange={setQuery}
                  onValueChange={handlePremiumPick}
                >
                  <ComboboxInput placeholder="Search models..." />
                  <ComboboxContent>
                    <ComboboxEmpty>
                      <span className="flex items-center gap-2">
                        {isSearching && (
                          <LoaderIcon className="size-3.5 animate-spin" />
                        )}
                        {isSearching
                          ? "Searching..."
                          : query.length < 2
                            ? "Type to search models"
                            : "No models found"}
                      </span>
                    </ComboboxEmpty>
                    <ComboboxList>
                      {(model) => (
                        <ComboboxItem key={model.id} value={model}>
                          <ModelOption
                            name={model.name}
                            provider={model.provider}
                            isFree={model.is_free}
                            contextLength={model.context_length}
                          />
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>

                {updateModelErrorMessage && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {updateModelErrorMessage}
                  </div>
                )}

                <p className="text-xs text-text-tertiary">
                  Browse models at{" "}
                  <a
                    href="https://openrouter.ai/models"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-interactive-focus underline"
                  >
                    openrouter.ai/models
                  </a>
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!isDirty || isUpdatingModel}
          >
            {isUpdatingModel ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function extractErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null) {
    const e = err as {
      response?: { data?: { detail?: string } };
      message?: string;
    };
    return e.response?.data?.detail ?? e.message ?? fallback;
  }
  return fallback;
}
```

- [ ] **Step 3: Run the dialog tests**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings/frontend
npm test -- --run src/components/settings/ModelSettingsDialog.test.tsx 2>&1 | tail -60
```

Expected: most or all of the new tests pass. Failures will likely be small things — selector mismatches, the Combobox `value` shape, the way tabs expose `data-state`. Iterate by reading the failure, fixing either the test selector or the dialog code, and re-running.

- [ ] **Step 4: Run typecheck**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings/frontend
npx tsc --noEmit 2>&1 | tail -30
```

Expected: zero errors.

- [ ] **Step 5: Run lint**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings/frontend
npm run lint 2>&1 | tail -30
```

Expected: zero errors. Fix any inline.

- [ ] **Step 6: Commit**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings
git add frontend/src/components/settings/ModelSettingsDialog.tsx \
        frontend/src/components/settings/ModelSettingsDialog.test.tsx
git commit -m "feat(settings): rewrite ModelSettingsDialog around mode toggle + sticky pendingModel"
```

---

## Task 10: End-to-end verification

**Files:**
- (no edits — pure verification)

- [ ] **Step 1: Run the full backend test suite**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings/backend
pytest tests/ 2>&1 | tail -20
```

Expected: 100% green. If failures appear in unrelated tests (e.g. analyze pipeline), inspect them — they should not be touched by this work.

- [ ] **Step 2: Run the full frontend test suite**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings/frontend
npm test -- --run 2>&1 | tail -30
```

Expected: 100% green.

- [ ] **Step 3: Run frontend typecheck and lint**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings/frontend
npx tsc --noEmit && npm run lint
```

Expected: zero errors.

- [ ] **Step 4: Backend typecheck (if configured)**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings/backend
mypy app/ 2>&1 | tail -20 || echo "(mypy not configured — skipping)"
```

- [ ] **Step 5: Manual smoke test in dev**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings
# Start backend in one shell:
cd backend && uvicorn app.main:app --reload --port 8000

# Start frontend in another:
cd frontend && npm run dev
```

In the browser at http://localhost:5173:
1. Open Settings → Model Settings dialog
2. Verify Standard tab shows three radios, no key affordance (assuming dev user has no key)
3. Click each radio → Save → confirm `PUT /api/users/settings/preferred-model` in network tab
4. Switch to Premium tab → enter a real test key → click Validate → confirm `POST /api/users/settings/api-key` in network tab → balance appears
5. Type in combobox → confirm `GET /api/models/search` calls debounced
6. Pick a premium model → Save → confirm `PUT /api/users/settings/preferred-model`
7. Click Remove → confirm `DELETE /api/users/settings/api-key` → mode flips to Standard, default radio selected

Document any anomalies in the PR description.

- [ ] **Step 6: Final commit (only if any post-test fixes were needed)**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings
git status
# If there are uncommitted fixes from Step 1-5:
git add -A
git commit -m "fix(settings): post-verification adjustments"
```

---

## Task 11: Push branch and open PR

**Files:**
- (no edits)

- [ ] **Step 1: Push the branch**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings
git push -u origin feature/model-settings-redesign
```

- [ ] **Step 2: Open a PR via gh**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-worktrees/ws-model-settings
gh pr create --title "feat(settings): rebuild Model Settings dialog around explicit mode toggle" --body "$(cat <<'EOF'
## Summary

- Splits the overloaded `PUT /api/users/settings` into `POST /settings/api-key` (validate + balance-check + persist) and `PUT /settings/preferred-model` (tier-enforced model setter).
- Modifies `DELETE /settings/api-key` to reset `preferred_model` to `DEFAULT_STANDARD_MODEL` instead of `null`, eliminating the orphan-state bug.
- Rewrites `ModelSettingsDialog` around an explicit Standard / Premium mode toggle, a controlled Combobox, and a sticky `pendingModel` draft. Eliminates the local-state mirroring (`selectedModel`, `currentModel`) that caused selection drift, uncontrolled-combobox desync, and the "first standard wins" visual default bug.

Spec: `docs/superpowers/specs/2026-04-06-model-settings-redesign-design.md`

## Test plan

- [x] Backend `pytest tests/` — all green
- [x] Frontend `npm test -- --run` — all green
- [x] Frontend `tsc --noEmit` + `npm run lint` — zero errors
- [x] Manual smoke test end-to-end:
  - [x] Standard tab: pick + save
  - [x] Premium tab no key: validate key → combobox mounts → balance shows
  - [x] Premium tab validated key: search + pick + save
  - [x] Remove key: mode flips to Standard, default radio selected
  - [x] Background `refreshBalance` does not clobber an in-flight model pick
EOF
)"
```

- [ ] **Step 3: Print the PR URL**

The previous command outputs the PR URL. Copy it to the user.

---

## Self-review notes

- **Spec coverage:** every spec section maps to a task — schema (T1), POST api-key (T2), PUT preferred-model (T3), DELETE update (T4), old route removal (T5), service (T6), hook (T7), test rewrite (T8), dialog rewrite (T9), e2e (T10), PR (T11).
- **Type consistency:** `addApiKey`, `updatePreferredModel`, `deleteApiKey`, `refreshBalance` are used identically across hook, service, dialog, and tests. `pendingModel`, `apiKeyDraft`, `mode` are the only local state pieces and are referenced consistently.
- **No placeholders:** every step shows the actual file content or command. The two intentionally context-dependent steps (T2 fixture detection, T9 Tabs component check) explicitly tell the engineer what to look for and how to substitute.
- **TDD discipline:** every implementation task is preceded by a failing-test step. Task 8 writes failing dialog tests before Task 9 builds the dialog to make them pass.
- **Commit cadence:** every task ends in a commit. The history will be readable.
