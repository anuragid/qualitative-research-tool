# Model Settings Redesign — Design Spec

**Date:** 2026-04-06
**Status:** Draft, awaiting user review
**Author:** Claude (with @idstuart)
**Touches:** `frontend/src/components/settings/ModelSettingsDialog.tsx`, `frontend/src/hooks/useSettings.ts`, `frontend/src/services/settings.ts`, `backend/app/routes/users.py`

## Background

The current `ModelSettingsDialog` mixes saved server state with several layers of local React state to render two model groups (Standard / Premium) and an API-key input. The result is a fundamentally tangled state model with multiple visible bugs:

1. **Visual default ≠ committed value.** When `preferred_model` is `null`, the radio group defaults its visual value to `standardModels[0]?.id`, but the dialog's `currentModel` is still `null`. Save sends `null` while the UI says "Llama 4 Scout selected".
2. **Uncontrolled combobox.** `<Combobox>` (base-ui Root) is rendered with `onValueChange` only — no `value` prop. Its internal selection survives independently of `selectedModel`. Re-renders silently desync the displayed value from React state.
3. **Selecting a premium model after the standard radio is "selected" doesn't deselect the standard.** Because `currentModel = selectedModel ?? settings.preferred_model`, a saved standard model wins until the user picks a premium — and even then, an in-flight `["user-settings"]` invalidation can clobber the local override mid-interaction.
4. **`PUT /settings` is overloaded.** It validates and stores the API key *and* validates and stores the model in one request. Failure modes are ambiguous (key saved, model rejected; key invalid, model untouched). Tier-enforcement ordering is fragile.
5. **`DELETE /settings/api-key` silently nukes `preferred_model`.** It sets it to `null` rather than falling back to a usable default.

The user wants the dialog rebuilt around an explicit, sequential mental model: **Standard or Premium are mutually exclusive top-level modes, and Premium requires a validated key before any model can be picked.**

Note: This spec is written against the **post-BYOK-balance state** (i.e., after `feature/byok-balance-backend` and `feature/byok-frontend-ux` merge to main). The BYOK balance display, refresh endpoint, save-time `has_credits` check, and `InsufficientCreditsAlert` are dependencies; this redesign builds on top of them.

## Goals

- Replace the "two groups visible together" layout with an explicit Standard / Premium mode toggle.
- Make Premium mode strictly sequential: enter key → validate → pick a model → save.
- Eliminate every race condition listed above by removing local mirrors of server state.
- Preserve every piece of background logic that exists today: balance display, refresh button, balance auto-refetch on settings invalidation, model search debounce/abort, recommended-models query, save-time `has_credits` rejection, `require_byok_credits` analyze gates.
- Ship a clean test suite that exercises the new state machine end-to-end.

## Non-Goals

- Re-architecting the database (no new columns; `preferred_model` stays a single field).
- Changing the analyze pipeline or `byok_service.resolve_byok` behavior.
- Touching `BalanceDisplay`, `useModelSearch`, `InsufficientCreditsAlert`, or `AnalysisSection`.
- Persisting "remembered" premium picks across key removals. On key delete, the premium pick is dropped.

## Conceptual model

The dialog has exactly **one** piece of selection state visible to the user: a top-level mode switch.

```
Mode = "standard" | "premium"
```

Mode is **derived from the saved model**, not from key presence:

```
mode_initial =
  "premium" if settings.preferred_model is a premium id
  else "standard"
```

A user can have an API key on file AND a standard model selected — that's a valid state (they once used premium, then chose to fall back). It opens in Standard mode with a small affordance to manage the still-on-file key (see "Standard mode" below).

After the dialog is open, the user can flip the mode with a tab/segmented control. Mode is part of the dialog's local form state; it does not commit until Save (or until a key is added/removed, which happens via dedicated mutations).

### Mode: Standard

- Renders the three radios (`standardModels` from `settings.available_models`).
- Save button is enabled when `pendingModel !== settings.preferred_model`.
- Switching to Premium does not clear the saved standard pick (still on the server until something else changes).
- The API key card and balance display are **not** rendered in Standard mode.
- **Exception:** if `settings.has_api_key === true`, render a single-line affordance under the radios:
  > "OpenRouter key on file (ending …XXXX). Switch to Premium to use it or remove it." with an inline `Remove key` link that fires `deleteApiKey`.

  This guarantees the user can always see and manage a stored key without needing to flip into Premium mode first.

### Mode: Premium

Premium mode has two sub-states based on `settings.has_api_key`:

**Premium / no key on file**
- Renders the API key input + `Validate & Save Key` button.
- The combobox is **not rendered**.
- A short helper line: "Add your OpenRouter API key to unlock any model."

**Premium / validated key on file**
- Renders the masked key card (`Key ending in …XXXX`), `Remove` button, and the existing `BalanceDisplay`.
- Renders the search combobox with `useModelSearch`.
- If `settings.preferred_model` is already a premium id, the combobox shows it as the selected value (controlled). The user can type to change.
- Save button is enabled when `pendingModel !== settings.preferred_model`.

## Backend contract

### Routes (replacing `PUT /api/users/settings`)

#### `POST /api/users/settings/api-key`

Adds or replaces the user's BYOK key. Atomic: validates against OpenRouter (`fetch_balance_sync`) and rejects keys with no credits before persisting.

**Request body**

```json
{ "api_key": "sk-or-v1-..." }
```

**Behavior**
1. Decrypt-test → encrypt → write to `encrypted_api_key`, `key_hint`, `key_validated_at`, plus the seven balance columns from `fetch_balance_sync`.
2. If `not balance.has_credits` → `400` with `{"detail": "This key has no credits. Add credits at openrouter.ai/settings/credits before saving."}`.
3. If `OpenRouterBalanceError` → `400` with the existing "invalid or unreachable" copy.
4. Does **not** touch `preferred_model`.
5. Returns the full updated `UserSettingsResponse` (so the client can `setQueryData` directly without an extra refetch).

**Rate limit:** `5/minute` per user (same as today's `PUT /settings`).

#### `PUT /api/users/settings/preferred-model`

Sets `preferred_model`. Tier enforcement is the only rule.

**Request body**

```json
{ "preferred_model": "anthropic/claude-3-5-sonnet" }
```

or

```json
{ "preferred_model": "meta/llama-4-scout" }
```

**Behavior**
1. If `not has_api_key` and the id is **not** in `STANDARD_MODEL_IDS` → `403` with `"Add your OpenRouter API key in Settings to unlock premium models."`
2. Otherwise write `preferred_model` and return the full updated `UserSettingsResponse`.
3. Does **not** touch the API key.

**Rate limit:** `20/minute` per user (model picks are cheap, no upstream call).

#### `DELETE /api/users/settings/api-key` *(modified)*

Atomically clears the key and resets `preferred_model` to a default standard id.

**Behavior**
1. Clear `encrypted_api_key`, `key_hint`, `key_validated_at`, and the seven balance columns (already done on `feature/byok-balance-backend`).
2. **NEW:** Set `preferred_model = DEFAULT_STANDARD_MODEL` (a new constant in `app.constants`, defaulting to `STANDARD_MODEL_IDS[0]`).
3. Returns the full updated `UserSettingsResponse`.

#### `POST /api/users/settings/refresh-balance` *(unchanged)*

Already exists. The dialog reuses it via `useSettings().refreshBalance`.

#### Removing `PUT /api/users/settings`

The old combined endpoint is **removed**, not deprecated. The only consumer is the SPA, which we update in the same PR. Any in-flight test fixtures get migrated.

### Backend constants (`app.constants`)

`DEFAULT_STANDARD_MODEL` already exists on `origin/main` (set to `STANDARD_MODELS[0]["id"]`, i.e. Llama 4 Scout). The redesign reuses it in `DELETE /settings/api-key`. No new constant needed.

## Frontend state model

### `useSettings()` hook

```ts
return {
  settings,                    // UserSettings | undefined
  isLoading,
  recommended,
  isLoadingRecommended,

  addApiKey,                   // mutation: POST /settings/api-key
  isAddingKey,
  addKeyError,
  resetAddKeyError,

  updatePreferredModel,        // mutation: PUT /settings/preferred-model
  isUpdatingModel,
  updateModelError,
  resetUpdateModelError,

  deleteApiKey,                // mutation: DELETE /settings/api-key (existing)
  isDeletingKey,

  refreshBalance,              // existing (added by feature/byok-frontend-ux)
  isRefreshingBalance,
};
```

Each mutation:
1. On success, calls `queryClient.setQueryData(["user-settings"], data)` with the response body (no extra refetch).
2. Also invalidates `["user-settings"]` defensively (cheap).
3. Surfaces errors via its own `*Error` field — no shared error bag.

The old combined `updateSettings` and its `updateError` are removed from the hook surface.

### `ModelSettingsDialog` state

```ts
type Mode = "standard" | "premium";

const [mode, setMode] = useState<Mode>(/* derived from settings on open */);
const [apiKeyDraft, setApiKeyDraft] = useState("");
const [pendingModel, setPendingModel] = useState<string | null>(null);
```

That's it. Three pieces of local state. No `selectedModel`, no `selectedModelName`, no `currentModel` derived blob.

**`pendingModel` semantics**
- Initialized to `null` when the dialog opens.
- Set when the user clicks a standard radio or picks a combobox item.
- Cleared when the user switches mode (to avoid carrying a premium pick into Standard mode).
- The combobox is controlled by `value={pendingModel ?? settings.preferred_model}`.
- The radio group is controlled by `value={pendingModel ?? settings.preferred_model ?? ""}`.
- Save sends `pendingModel` (or skips the call if `pendingModel === null`).

**Mode initialization (on `open === true`)**

```ts
useEffect(() => {
  if (!open || !settings) return;
  setApiKeyDraft("");
  setPendingModel(null);
  resetAddKeyError();
  resetUpdateModelError();

  const savedIsPremium =
    settings.preferred_model != null &&
    !standardModels.some((m) => m.id === settings.preferred_model);
  setMode(savedIsPremium ? "premium" : "standard");
}, [open, settings]);
```

The effect runs once per open. While the dialog is open, `mode` is user-controlled and not re-derived.

### Sticky-draft behavior under background invalidation

When a background event invalidates `["user-settings"]` (e.g., the `InsufficientCreditsAlert` 30s poll, or `refreshBalance`), React Query refetches and `settings` updates. The dialog:

- Re-renders the **balance card** (`BalanceDisplay` reads `settings.balance`).
- **Does not** touch `pendingModel`. The user's in-flight pick is preserved.
- **Does not** touch `mode`. The user's mode toggle is preserved.

This is the entire fix for the "refetch clobbers selection" race today.

### Save handler

```ts
async function handleSave() {
  if (pendingModel != null && pendingModel !== settings.preferred_model) {
    await updatePreferredModel({ preferred_model: pendingModel });
  }
  onOpenChange(false);
}
```

Save is disabled when `pendingModel === null` or `pendingModel === settings.preferred_model`. Adding a key is **not** part of Save — it has its own `Validate & Save Key` button that triggers `addApiKey` directly.

### Add-key handler

```ts
async function handleAddKey() {
  if (apiKeyDraft.length < 10) return;
  await addApiKey({ api_key: apiKeyDraft });
  // Mutation onSuccess writes the response into the cache, so settings now has
  // has_api_key === true and a fresh balance. No further state changes needed
  // — the dialog re-renders into the "Premium / validated key on file" branch,
  // which mounts the combobox.
  setApiKeyDraft("");
}
```

If the mutation errors, `addKeyError` displays inline above the input. The draft is not cleared on error.

### Remove-key handler

```ts
async function handleRemoveKey() {
  await deleteApiKey();
  // Server returned UserSettings with preferred_model = DEFAULT_STANDARD_MODEL and
  // has_api_key = false. The dialog re-derives mode from this on next render
  // ONLY IF the dialog re-opens — but during this open session, we want the
  // mode to fall back to standard immediately.
  setMode("standard");
  setPendingModel(null);
  setApiKeyDraft("");
}
```

The `setMode("standard")` here is the one place where a mutation result drives a mode change during an open session. It's explicit and tied to a deliberate user action.

### What we delete

- `selectedModel`, `selectedModelName` state
- `currentModel` derived value
- `isPremiumModel` derived value
- The "Change model" inline card with its embedded clear-state side-effects
- The combined `updateSettings` mutation
- The `RadioGroup`'s fallback `value={currentModel || standardModels[0]?.id || ""}` — replaced with a strict `pendingModel ?? settings.preferred_model ?? ""`

## Race conditions, addressed

| # | Race | Fix |
|---|---|---|
| 1 | Combobox selection lost on re-render | Combobox is controlled by `pendingModel`; re-renders are idempotent. |
| 2 | `selectedModel ?? settings.preferred_model` drift after refetch | No `selectedModel` exists. `pendingModel` is a draft, not a mirror. |
| 3 | Visual radio default ≠ committed value | Radio's `value` falls through to `""` when nothing is set. No silent first-standard-wins. |
| 4 | Add-key + pick-premium one-shot validation/ordering | Two sequential round-trips. Combobox cannot mount until `addApiKey` returns 200. |
| 5 | Background `["user-settings"]` invalidation clobbering an in-progress pick | `pendingModel` is sticky for the lifetime of the open dialog. |
| 6 | `DELETE /settings/api-key` leaves orphan premium id | Backend sets `preferred_model = DEFAULT_STANDARD_MODEL` atomically; frontend also flips `mode = "standard"`. |
| 7 | Combobox typeahead landing after a pick | Picked value lives in `pendingModel`; late-arriving `useModelSearch` results re-render the dropdown but don't touch `pendingModel`. |
| 8 | Concurrent `refreshBalance` while user picks a model | Same as #5. Balance updates, model pick is preserved. |

## Error handling

| Error source | Where it surfaces | UX |
|---|---|---|
| `addApiKey` 400 (invalid/unreachable) | Inline above the API key input | Red helper text, draft preserved |
| `addApiKey` 400 (no credits) | Inline above the API key input | Red helper text with a "Get credits" link to `openrouter.ai/settings/credits` |
| `addApiKey` 5xx | Inline above the API key input | "Something went wrong, try again" |
| `updatePreferredModel` 403 (premium without key) | Inline above the radio group | Should not be reachable from the UI in normal flow, but defended against. Error text: "Add your OpenRouter API key to use this model." |
| `updatePreferredModel` 5xx | Inline above the model section | Generic retry message |
| `deleteApiKey` failure | Toast (or inline if dialog is open) | Generic retry message |
| `refreshBalance` failure | Handled by existing `BalanceDisplay` (stale flag) | Unchanged |

## Test plan

### Frontend (`ModelSettingsDialog.test.tsx`)

Replace the existing test file. New scenarios, all using MSW for the new endpoints:

**Mode initialization**
1. `has_api_key=false`, `preferred_model=null` → opens in Standard mode, no radio checked
2. `has_api_key=false`, `preferred_model=standard-id` → Standard mode, that radio checked
3. `has_api_key=true`, `preferred_model=standard-id` → Standard mode (mode follows the saved model, not the key), the standard radio is checked, the "OpenRouter key on file" affordance is visible
4. `has_api_key=true`, `preferred_model=premium-id` → Premium mode, combobox shows premium id

**Standard mode**
5. Click a different standard radio → `pendingModel` updates, Save enabled, click Save → `PUT /settings/preferred-model` called once, dialog closes
6. Click the already-selected radio → Save stays disabled
7. Switch to Premium mode without a key → key input visible, combobox absent
8. Save with no pending change → button disabled, no network call

**Premium mode, no key**
9. Type a short key (<10 chars) → Validate button disabled
10. Type a valid key → click Validate → `POST /settings/api-key` called, success → combobox mounts, key card shows, balance shows
11. Validate fails (400 invalid) → inline error, draft preserved, combobox still absent
12. Validate fails (400 no credits) → inline error with "Get credits" link
13. Validate fails (5xx) → generic error

**Premium mode, validated key**
14. Open with `has_api_key=true`, `preferred_model=premium-id` → mode=premium, combobox controlled value matches the saved id, key card + balance visible
15. Type in combobox → `useModelSearch` debounces, results render
16. Pick a different model → `pendingModel` set, combobox shows it, Save enabled
17. Save → `PUT /settings/preferred-model` called once, dialog closes
18. From the same opened state, click the Standard tab → `pendingModel` cleared, the radio for `settings.preferred_model` (still premium-id) is unchecked, no radio is checked
19. Click Remove key from inside Premium mode → `DELETE /settings/api-key` called, mode flips to Standard, the standard default radio is now checked
20. Background `refreshBalance` lands while user is typing in combobox → balance updates, combobox controlled value preserved, no re-render glitch
21. Open with `has_api_key=true`, `preferred_model=null` → mode=standard (not premium, because mode follows the model not the key); user can switch to Premium tab and the combobox mounts immediately because the key is on file

**State sticky-ness**
22. Mock a `["user-settings"]` invalidation while `pendingModel` is set → `pendingModel` survives
23. Close dialog without saving → reopen → `pendingModel` reset to null, mode re-derived from server state

### Backend (`tests/test_users_settings.py`, new file)

Replace the bits of the existing settings tests that touch `PUT /settings`. New cases:

**`POST /settings/api-key`**
1. Valid key + has credits → 200, response includes new balance
2. Valid key + zero credits → 400 with "no credits" detail
3. Invalid key (OpenRouterBalanceError) → 400 with "invalid or unreachable"
4. Rate limit: 6th request in a minute → 429
5. Existing key gets replaced (not appended) → previous `key_hint` overwritten
6. Does not touch `preferred_model` (asserts before/after)

**`PUT /settings/preferred-model`**
7. No key + standard id → 200
8. No key + premium id → 403
9. Key on file + premium id → 200
10. Key on file + standard id → 200 (allowed; user wants to fall back to standard)
11. Invalid model id format → 422 (Pydantic validator)
12. Does not touch `encrypted_api_key` (asserts before/after)

**`DELETE /settings/api-key`**
13. Key on file + premium model → 200, `has_api_key=false`, `preferred_model = DEFAULT_STANDARD_MODEL`, all balance columns nulled
14. Key on file + standard model → 200, `preferred_model = DEFAULT_STANDARD_MODEL` (always reset, even if it was already standard, for consistency)
15. No key on file → 200 (idempotent)

## Migration / rollout

Single PR. The combined `PUT /settings` endpoint and the dialog rewrite ship together. There is no backwards-compat shim because:

- The only consumer is the SPA (same repo).
- The BYOK feature branches haven't merged to main yet, so this work sequences after them. Order:
  1. `feature/byok-balance-backend` merges to main.
  2. `feature/byok-frontend-ux` merges to main.
  3. This redesign branches from the post-merge main.

The dialog's existing test file (`ModelSettingsDialog.test.tsx`) is replaced wholesale, not patched.

## Open questions

None at this time. The user explicitly approved:
- Top-level binary mode (Standard / Premium)
- Sequential validate-then-pick in Premium mode
- Auto-fallback to default standard on key removal
- Keeping `preferred_model` as a single column

If anything in this spec contradicts those decisions, treat the user's prior word as authoritative and update the spec.
