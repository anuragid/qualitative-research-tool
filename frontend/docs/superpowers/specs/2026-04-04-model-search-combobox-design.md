# Model Search Combobox

Replace the raw text input for BYOK premium model selection with a searchable combobox that queries OpenRouter's model catalog.

## Scope

Only the premium model selection UX changes. Standard models (RadioGroup), API key management, and save/cancel flow remain untouched. No backend changes needed.

## Components

### 1. Install shadcn Combobox

`pnpm dlx shadcn@latest add combobox`

This brings in the Base UI-backed combobox with `Combobox`, `ComboboxInput`, `ComboboxContent`, `ComboboxList`, `ComboboxItem`, `ComboboxEmpty`. After install, restyle to match the design system (frosted glass popup, warm tokens, generous spacing, rounded corners matching existing Select/DropdownMenu patterns).

### 2. `ModelOption` (reusable component)

**File:** `src/components/settings/ModelOption.tsx`

Renders a single model result row used inside combobox items.

```
Props: { name: string; provider: string; isFree: boolean; contextLength?: number | null }
```

Layout:
- **Primary line:** model name, `text-sm font-medium text-text-primary`
- **Secondary line:** provider + context length (if present), `text-xs text-text-tertiary`
- Free models get a subtle "Free" badge

This is a presentational component — no state, no API calls. Reusable anywhere a model needs to be displayed.

### 3. `useModelSearch` hook

**File:** `src/hooks/useModelSearch.ts`

- Wraps `settingsService.searchModels(query)` with debounce (300ms)
- Minimum 2 characters before firing
- Returns `{ results: SearchModel[], isSearching: boolean, query: string, setQuery: (q: string) => void }`
- Clears results when query drops below 2 chars

### 4. Modify `ModelSettingsDialog.tsx`

In the premium models section (currently lines 155-186), replace the raw `<Input>` with:

```tsx
<Combobox
  items={results}
  itemToStringValue={(m) => m.name}
  value={selectedPremiumModel}
  onValueChange={(model) => setSelectedModel(model?.id ?? null)}
>
  <ComboboxInput
    placeholder="Search models..."
    value={query}
    onChange={(e) => setQuery(e.target.value)}
  />
  <ComboboxContent>
    <ComboboxEmpty>
      {isSearching ? "Searching..." : query.length < 2 ? "Type to search models" : "No models found"}
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
```

The trigger displays the selected model's name. When no model is selected, shows "Search models..." placeholder.

### 5. Storybook story

**File:** `src/components/ui/combobox.stories.tsx`

Stories under `"Primitives/Combobox"`:
- **Default** — basic string items list
- **WithObjects** — object items with `itemToStringValue`
- **Empty** — shows empty state message
- **ModelSearch** — domain-specific story showing the model search pattern with mock data and `ModelOption` rendering

Follow existing story patterns: `satisfies Meta`, `tags: ["autodocs"]`, play functions for interaction testing.

## Design System Styling

The installed combobox component must be styled to match existing patterns in `select.tsx` and `dropdown-menu.tsx`:

| Element | Styling |
|---------|---------|
| Input | Same as existing `Input` — `rounded-lg`, `border-border`, `bg-card`, focus ring with `interactive-focus` |
| Content/Popup | `frosted-glass`, `rounded-3xl`, `shadow-popup`, open/close animations (fade + zoom) |
| Items | `px-3 py-2.5`, `hover:bg-interactive-fill`, `focus:bg-interactive-fill`, `rounded-xl` |
| Empty state | `text-sm text-text-tertiary`, centered, comfortable padding |
| Transitions | `duration-[var(--duration-micro)]`, `ease-[var(--ease)]` |

## Data Flow

```
User types in combobox input
  -> useModelSearch debounces 300ms
  -> GET /api/models/search?q={query} (existing endpoint)
  -> Results rendered as ComboboxItems with ModelOption
  -> User selects -> setSelectedModel(model.id)
  -> Save button submits preferred_model as before
```

## What Does NOT Change

- Standard models RadioGroup section
- API key input/management section
- Save/cancel dialog footer
- Backend endpoints
- `useSettings` hook
- `settingsService` (already has `searchModels`)
