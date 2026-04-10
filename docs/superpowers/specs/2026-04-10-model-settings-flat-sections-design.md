# Model Settings: Flat Sections Redesign

**Date:** 2026-04-10
**Status:** Approved
**Supersedes:** 2026-04-06-model-settings-redesign-design.md (tabs-based)

## Problem

The current Model Settings dialog uses Standard/Premium tabs. When a BYOK key is on file, the Standard tab is disabled with no obvious recovery path — the user must find "Remove key" inside the Premium tab to get back to free models. This is a UX dead end.

## Solution

Replace tabs with two always-visible sections in a single dialog. The user picks from one section or the other — mutual exclusion, not tab switching.

### UI Layout

```
┌─────────────────────────────────────────────┐
│ Model Settings                            ✕ │
│ Choose which model to use for analysis.     │
│                                             │
│ ── Included ────────────────────────────── │
│ ◉ Llama 4 Scout            Meta       Free  │
│ ○ Nemotron 3 Super 120B    NVIDIA     Free  │
│ ○ DeepSeek V3              DeepSeek   Free  │
│                                             │
│ ── Bring Your Own Key ──────────────────── │
│ Use any model from OpenRouter with your     │
│ own API key.                                │
│                                             │
│ [if no key: add-key form]                   │
│ [if has key: balance + model picker]        │
│                                             │
│                       [Cancel]  [Save]      │
└─────────────────────────────────────────────┘
```

### Interaction Rules

1. Picking an Included radio button deselects any BYOK combobox pick. Selection = `{ tier: "included", model: "<id>" }`.
2. Picking from the BYOK combobox deselects Included radio buttons. Selection = `{ tier: "byok", model: "<id>" }`.
3. They are one logical selection split across two visual sections.
4. Save validates: BYOK tier + $0 balance → block with "Not enough credits" + "Add credits" link.
5. BYOK tier + no key → Save disabled until key is validated.

### Billing Model

- **Included models** = server-paid (methodex's OpenRouter key, hidden from user). Limited to 3 cheaper open-source models.
- **BYOK models** = student-paid (their own OpenRouter key). Any model on OpenRouter.
- If a student picks a standard model from the BYOK combobox, it's billed to their key (their choice).
- Routing is based on which section the user picked from, NOT the model ID.

## Data Model

### New column

```sql
ALTER TABLE users ADD COLUMN model_tier VARCHAR(10) NOT NULL DEFAULT 'included';
```

### Migration

- Users with `encrypted_api_key IS NOT NULL` AND `preferred_model NOT IN STANDARD_MODEL_IDS` → `model_tier = 'byok'`
- Everyone else → `model_tier = 'included'`

### API Changes

**`GET /api/users/settings`** — response adds `model_tier: "included" | "byok"`.

**`PUT /api/users/settings/preferred-model`** — payload becomes `{ preferred_model: string, model_tier: "included" | "byok" }`:
- `tier == "included"` + model not in `STANDARD_MODEL_IDS` → 400
- `tier == "byok"` + no key on file → 403
- `tier == "byok"` + $0 balance (fresh check) → 402
- Otherwise → save both fields

**`DELETE /api/users/settings/api-key`** — also resets `model_tier = "included"` and `preferred_model = DEFAULT_STANDARD_MODEL`.

## Backend Routing

### `resolve_byok_with_preflight()`

```python
if user.model_tier == "included":
    return (None, user.preferred_model or DEFAULT_STANDARD_MODEL, None)
elif user.model_tier == "byok":
    # decrypt key, check balance, return (key, model, balance)
```

### `require_byok_credits` gate

```python
if user.model_tier == "included":
    return None  # skip — no balance check needed
# else: existing BYOK balance check
```

### Fallback chain

- **Included tier:** full standard model fallback chain (server key) — unchanged
- **BYOK tier:** retry same model 3x, then error. No silent fallback to server key.

### `call_llm()` safety net

Existing `_METHODEX_ALLOWED_MODELS` enforcement stays as defense-in-depth. If `api_key is None` and model not in whitelist → fall back to default. This catches any routing bugs.

## Validation Chain

Four checkpoints, deepening in cost:

| Check | Frontend | Backend save | Analysis gate | Task execution |
|-------|----------|-------------|---------------|----------------|
| Valid model for tier | — | 400 | — | — |
| Key exists for BYOK | Disables Save | 403 | 403 | error |
| Balance > $0 for BYOK | Disables Save (cached) | 402 (fresh) | 402 (fresh) | error (force-refresh) |
| Model on server whitelist | — | — | — | `call_llm()` safety net |

## Transformation Map

### Files that CHANGE

**Frontend:**
| File | Change |
|------|--------|
| `ModelSettingsDialog.tsx` | Remove Tabs imports/usage. Two flat sections. Mutual exclusion logic. Send `tier` with save. |
| `ModelSettingsDialog.test.tsx` | Rewrite: section interaction, mutual exclusion, tier-based validation, $0 balance blocking. |
| `settings.ts` | Add `model_tier` to `UserSettings` type. `updatePreferredModel()` sends `{ model, tier }`. |

**Backend:**
| File | Change |
|------|--------|
| `database_models.py` | Add `model_tier` column |
| `schemas.py` | Add `model_tier` to response/request schemas |
| `users.py` | Accept/return `model_tier`. Validate tier+model combos. Reset on key delete. |
| `byok_service.py` | Route by `model_tier` not `has_api_key` |
| `byok_gate.py` | Skip gate when `model_tier == "included"` |
| `constants.py` | Add `MODEL_TIER_INCLUDED`/`MODEL_TIER_BYOK` constants |
| New migration file | Add column + data migration |

**Tests:**
| File | Change |
|------|--------|
| `test_users_settings.py` | Tier validation tests (400/403/402 per tier) |
| `test_byok_gate.py` | Included tier skips gate even with key |
| `test_llm_service_retry.py` | Verify routing per tier |

### Files that STAY AS-IS

BalanceDisplay, ModelOption, useSettings, useModelSearch, Sidebar, AnalysisSection, InsufficientCreditsAlert, tabs.tsx (used elsewhere), llm_service.py (safety net stays), analysis_steps.py (calls resolve which changes internally), openrouter_balance.py, encryption_service.py, openrouter_validation.py.

### Code REMOVED (no dead code)

- `Tabs` import from ModelSettingsDialog
- `mode` state ("standard" | "premium")
- Auto-switch effect (lines 127-136)
- `handleModeChange` guard (lines 146-155)
- `disabled={settings.has_api_key}` on Standard tab
- Standard tab's "Remove key" banner (lines 282-300)

## Edge Cases

| # | Scenario | Expected | Risk if missed |
|---|----------|----------|----------------|
| 1 | BYOK user picks Included model → analysis | Server key, $0 BYOK cost | User charged for "free" models |
| 2 | BYOK user, $0 balance, Included selected | Analysis works (server key) | False 402 locks user out |
| 3 | BYOK user, $0 balance, BYOK selected | 402 blocked | Free premium usage |
| 4 | Remove key while BYOK model saved | Reset to Included + default model | Orphaned premium → 403 |
| 5 | Add key while Included selected | Stays Included, key saved for later | Forced switch |
| 6 | No-key user, BYOK tier via API | 403 | Unauthorized premium |
| 7 | Dialog opens, BYOK model saved | BYOK section shows selected model, radios deselected | Wrong section highlighted |
| 8 | Dialog opens, Included model saved | Radio selected, BYOK section neutral | Wrong section highlighted |
| 9 | Pick Included → pick BYOK → pick Included | Final state: Included, radios correct | Stale BYOK selection |
| 10 | Credits exhaust between enqueue and execution | Task-level check catches it | Silent failure |
