# BYOK Balance API Contract

This is the stable contract that backend (Worktree A), backend gates
(Worktree B) and frontend (Worktree C) all depend on. Each worktree
codes against this document so they can develop in parallel without
waiting for A's implementation to land.

**Verified against live OpenRouter 2026-04-06** via
`backend/scripts/openrouter_balance_spike.py` and
`backend/tests/test_openrouter_integration.py`.

## OpenRouter upstream endpoints

Both `/api/v1/auth/key` and `/api/v1/key` return identical bodies. We
use `/auth/key` as the canonical URL because existing
`openrouter_validation.py` already hits it.

### `GET /api/v1/auth/key`

```json
{
  "data": {
    "label": "sk-or-v1-313...880",
    "is_management_key": false,
    "is_provisioning_key": false,
    "limit": null,
    "limit_reset": null,
    "limit_remaining": null,
    "include_byok_in_limit": false,
    "usage": 0.645181061,
    "usage_daily": 0.06999292,
    "usage_weekly": 0.06999292,
    "usage_monthly": 0.11780604,
    "byok_usage": 0,
    "byok_usage_daily": 0,
    "byok_usage_weekly": 0,
    "byok_usage_monthly": 0,
    "is_free_tier": false,
    "expires_at": null,
    "creator_user_id": "user_...",
    "rate_limit": { "requests": -1, "interval": "10s", "note": "deprecated" }
  }
}
```

**Key fields we use:**
- `label` — masked key hint for UI display
- `is_free_tier` — True iff the account has never purchased credits
- `limit` — per-key credit cap, **nullable** (pay-as-you-go accounts return `null`)
- `limit_remaining` — per-key cap remaining, **nullable** (same)

### `GET /api/v1/credits`

```json
{ "data": { "total_credits": 10, "total_usage": 0.645181061 } }
```

**This is the canonical source of truth for account balance.** Works
with regular keys (contrary to some third-party docs that claim it
requires a provisioning key — verified 2026-04-06 to be wrong).

**Key fields we use:**
- `total_credits` — account's topped-up allotment
- `total_usage` — account's lifetime spend
- **Derived**: `balance_remaining = total_credits - total_usage`

### 402 "Insufficient credits" response shape

When the account is out of credits, OpenRouter returns HTTP 402 on any
LLM call. The response body:

```json
{ "error": { "code": 402, "message": "Insufficient credits...", "metadata": {} } }
```

The `openai` Python client raises `APIStatusError(status_code=402)` for
this. Classified by `classify_error()` as `ERROR_TYPE_INSUFFICIENT_CREDITS`
(a new constant added in Phase 0).

## Backend `BalanceInfo` dataclass

**Location**: `backend/app/services/openrouter_balance.py` (Worktree A)

```python
from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class BalanceInfo:
    # From /credits (account-level truth)
    total_credits: float           # topped-up allotment
    total_usage: float             # lifetime spend
    balance_remaining: float       # total_credits - total_usage (the spendable amount)

    # From /auth/key (key metadata + per-key cap)
    is_free_tier: bool
    key_label: str                 # masked label, e.g. "sk-or-v1-313...880"
    key_limit: float | None        # per-key cap, null if none set
    key_limit_remaining: float | None  # per-key cap remaining, null if no cap

    # Derived state
    has_credits: bool              # True iff balance_remaining > 0 AND
                                   #   (key_limit_remaining is None OR key_limit_remaining > 0)

    # Metadata
    checked_at: datetime
    stale: bool                    # True if returned from DB cache without live refresh

    def as_dict(self) -> dict:
        return {
            "total_credits": self.total_credits,
            "total_usage": self.total_usage,
            "balance_remaining": self.balance_remaining,
            "is_free_tier": self.is_free_tier,
            "key_label": self.key_label,
            "key_limit": self.key_limit,
            "key_limit_remaining": self.key_limit_remaining,
            "has_credits": self.has_credits,
            "checked_at": self.checked_at.isoformat(),
            "stale": self.stale,
        }
```

### `has_credits` formula

```python
has_credits = (
    balance_remaining > 0
    and (key_limit_remaining is None or key_limit_remaining > 0)
)
```

Rationale: the spendable amount is the **minimum** of the account
balance and the per-key cap. If either is 0, the user can't make an
LLM call.

### Fetch logic

`fetch_balance_sync(api_key: str) -> BalanceInfo` makes **two** HTTP
calls (in parallel if convenient) and merges:

```
GET /auth/key → label, is_free_tier, limit, limit_remaining
GET /credits  → total_credits, total_usage
```

On any HTTP error or malformed response → raise `OpenRouterBalanceError`.

## Backend DB schema

**Migration**: `add_byok_balance_columns` (Worktree A)

All additive, nullable. No backfill needed.

| Column | Type | Source |
|---|---|---|
| `key_total_credits` | `Float` | `/credits.data.total_credits` |
| `key_total_usage` | `Float` | `/credits.data.total_usage` |
| `key_limit` | `Float` | `/auth/key.data.limit` (nullable) |
| `key_limit_remaining` | `Float` | `/auth/key.data.limit_remaining` (nullable) |
| `key_is_free_tier` | `Boolean` | `/auth/key.data.is_free_tier` |
| `key_balance_checked_at` | `DateTime(tz)` | when we last refreshed successfully |
| `key_balance_error` | `String(255)` | last error message or null when healthy |

## Backend REST endpoints

### `GET /users/settings` (existing — extended)

**Worktree A** extends the existing `UserSettingsResponse` Pydantic
model with an optional `balance` field:

```json
{
  "has_api_key": true,
  "key_hint": "abcd",
  "key_validated_at": "2026-04-06T19:00:00Z",
  "preferred_model": "meta-llama/llama-4-scout",
  "available_models": ["..."],
  "balance": {
    "total_credits": 10.0,
    "total_usage": 2.75,
    "balance_remaining": 7.25,
    "is_free_tier": false,
    "key_label": "sk-or-v1-abc...xyz",
    "key_limit": null,
    "key_limit_remaining": null,
    "has_credits": true,
    "checked_at": "2026-04-06T22:00:00Z",
    "stale": false
  }
}
```

For non-BYOK users, `balance` is `null`. For BYOK users whose last
refresh errored, `balance` is the last cached value with `stale: true`
(or `null` if never successfully refreshed).

### `POST /users/settings/refresh-balance` (new)

**Worktree A** adds this endpoint. Force-refreshes from OpenRouter,
persists to DB, returns fresh `BalanceInfo` as JSON.

Rate-limited at **10 requests/minute/user** via the existing
per-user `slowapi` limiter in `backend/app/main.py::_get_rate_limit_key`.

Errors:
- 400 if user has no BYOK key configured
- 503 if OpenRouter unreachable (returns last stale value if available)
- 429 on rate-limit

### `PUT /users/settings` (existing — extended)

**Worktree A** extends the existing handler so that when `api_key` is
submitted, we fetch the balance before encrypting and persist the
balance fields on the user row. If `balance_remaining <= 0`:

```json
{
  "detail": "Your OpenRouter key has $0 credits. Add credits at https://openrouter.ai/settings/credits, then save again."
}
```

Returns HTTP 400.

### 402 gate response (at all analyze routes)

**Worktree B** adds `Depends(require_byok_credits)` to all 7 analyze-
triggering routes. When balance is known-zero:

```json
{
  "status_code": 402,
  "detail": {
    "error_type": "insufficient_credits",
    "message": "Your OpenRouter key has no remaining credits. Add credits at https://openrouter.ai/settings/credits and try again.",
    "balance": { "total_credits": 10.0, "total_usage": 10.0, "balance_remaining": 0.0, "...": "..." }
  }
}
```

## Frontend TypeScript types

**Location**: `frontend/src/types/api.ts` (Worktree C)

```ts
/** Balance info matching backend BalanceInfo.as_dict() — verified 2026-04-06. */
export interface BalanceInfo {
  total_credits: number;
  total_usage: number;
  balance_remaining: number;
  is_free_tier: boolean;
  key_label: string;
  key_limit: number | null;
  key_limit_remaining: number | null;
  has_credits: boolean;
  checked_at: string; // ISO8601
  stale: boolean;
}

/** Extended UserSettings response shape. */
export interface UserSettingsResponse {
  has_api_key: boolean;
  key_hint: string | null;
  key_validated_at: string | null;
  preferred_model: string | null;
  available_models: string[];
  balance: BalanceInfo | null; // null for non-BYOK users
}
```

## Frontend error_type union

**Already updated in Phase 0** at `frontend/src/lib/parseError.ts`:

```ts
export type ErrorType =
  | "rate_limit"
  | "timeout"
  | "llm_error"
  | "llm_permanent"          // permanent 4xx other than 402 (400, 401, 403, 422)
  | "insufficient_credits"   // 402 — triggers "Add credits" CTA
  | "network"
  | "validation"
  | "unknown";
```

Backend emits `insufficient_credits` for 402 via
`backend/app/utils/error_classification.py::classify_error()`.

## Error flow — end to end

1. **User pastes key** → `PUT /users/settings` → Worktree A fetches balance → if zero, 400 with specific message
2. **User clicks Analyze** → any of 7 routes → Worktree B `require_byok_credits` dependency refreshes balance → if zero, 402 with structured detail
3. **Task starts** → Worktree B `resolve_byok_with_preflight` → if zero, raises `NonRetryableAnalysisError(error_type="insufficient_credits")` — no LLM call made
4. **Mid-task 402** → node catches `APIStatusError(402)` → `classify_error()` returns `insufficient_credits` → pipeline halts, partial results preserved, error stored as structured JSON in `video.error_message`
5. **Frontend reads error** → `parseErrorMessage` returns `{ errorType: "insufficient_credits", ... }` → `AnalysisSection.tsx` branches to `InsufficientCreditsAlert` → shows "Add credits on OpenRouter" CTA + "I've added credits — retry" button
6. **User tops up** → clicks "retry" button → Worktree C calls `/users/settings/refresh-balance` → if `has_credits === true` calls step-retry endpoint → otherwise shows inline "still no credits"

## Rate limiting

- `/users/settings/refresh-balance` → **10/min/user** via existing `slowapi` limiter at `backend/app/main.py:75`. No new middleware needed.
- Balance cache TTL: **60 seconds** server-side. Config constant `BALANCE_CACHE_TTL_SECONDS` in `backend/app/config.py`.
- Low-balance threshold: **$0.50 USD**. Config constant `LOW_BALANCE_THRESHOLD_USD` in `backend/app/config.py`.

## Out of scope (documented, not fixed)

- **Concurrent upload race**: User uploads N videos simultaneously with $0.50 balance. All N route checks see the same cached value and all pass. First burns the balance, others 402 mid-pipeline. Cannot be fixed without atomic reservations OpenRouter doesn't expose.
- **Mid-pipeline key deletion**: If user deletes their BYOK key between analysis steps, the next step's `resolve_byok` returns `(None, model)` and silently falls back to the shared Methodex key. This is existing behavior, preserved deliberately in test #29 of the ralph loop.
- **Pre-flight cost estimation**: OpenRouter has no dry-run API. We can't predict whether a specific analysis will cost more than the current balance.
