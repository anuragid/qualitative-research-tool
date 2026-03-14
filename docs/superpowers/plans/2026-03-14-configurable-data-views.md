# Configurable Data Views Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking. Use the frontend-design skill for all UI component work.

**Goal:** Add Craft-inspired configurable data views (list/grid/table), sorting, filtering, search, and expand/collapse to all analysis display components.

**Architecture:** A `useAnalysisDisplay` hook manages view mode, sort, filter, and search state (persisted to URL params). An `AnalysisToolbar` wraps each analysis tab. Existing list components gain a `viewMode` prop and extracted Card subcomponents. A shared `displayConfig.ts` centralizes all duplicated style/badge maps.

**Tech Stack:** React 19, Tailwind v4, Radix UI (Accordion, Tabs), lucide-react, @tanstack/react-query (existing), URLSearchParams for state persistence.

**Spec:** `docs/superpowers/specs/2026-03-13-configurable-data-views.md`

---

## File Structure

### New Files

```
src/components/analysis/
  config/
    displayConfig.ts          — Centralized badge styles, sort/filter options per step
  hooks/
    useAnalysisDisplay.ts     — View mode, sort, filter, search state hook
  display/
    AnalysisToolbar.tsx       — Composes toolbar controls above each analysis section
    ViewModeToggle.tsx        — List/Grid/Table icon toggle
    SortDropdown.tsx          — Sort by configurable fields
    FilterBar.tsx             — Interactive filter chips
    SearchInput.tsx           — Search within analysis items
    ExpandCollapseToggle.tsx  — Expand All / Collapse All button
    CardView.tsx              — Grid layout wrapper for card-style items
    TableView.tsx             — Table layout with sortable column headers
    ItemDetailPanel.tsx       — Slide-over panel for full item detail from grid/table
  cards/
    ChunkCard.tsx             — Card subcomponent extracted from ChunksList
    InferenceCard.tsx         — Card subcomponent extracted from InferencesList
    PatternCard.tsx           — Card subcomponent extracted from PatternsList
    InsightCard.tsx           — Card subcomponent extracted from InsightsList
    PrincipleCard.tsx         — Card subcomponent extracted from PrinciplesList
    MetaPatternCard.tsx       — Card subcomponent extracted from MetaPatternsList
    CrossInsightCard.tsx      — Card subcomponent extracted from CrossInsightsList
    SystemPrincipleCard.tsx   — Card subcomponent extracted from SystemPrinciplesList
```

### Modified Files

```
src/components/analysis/
  ChunksList.tsx              — Accept viewMode/expandedItems, delegate to CardView/TableView
  InferencesList.tsx          — Same pattern
  PatternsList.tsx            — Same pattern
  InsightsList.tsx            — Same pattern
  PrinciplesList.tsx          — Same pattern
  MetaPatternsList.tsx        — Same pattern
  CrossInsightsList.tsx       — Same pattern
  SystemPrinciplesList.tsx    — Same pattern

src/pages/
  VideoDetailPage.tsx         — Wrap each analysis tab with AnalysisToolbar
  ProjectDetailPage.tsx       — Wrap cross-video tabs with AnalysisToolbar
```

---

## Chunk 1: Foundation — displayConfig + useAnalysisDisplay

### Task 1: Create displayConfig.ts

**Files:**
- Create: `frontend/src/components/analysis/config/displayConfig.ts`
- Test: `frontend/src/components/analysis/config/displayConfig.test.ts`

- [ ] **Step 1: Write tests for displayConfig**

```typescript
// displayConfig.test.ts
import { describe, it, expect } from "vitest";
import {
  chunkTypeStyles,
  insightTypeStyles,
  confidenceStyles,
  priorityStyles,
  frequencyStyles,
  consistencyStyles,
  scopeStyles,
  relationshipTypeStyles,
  sortOptions,
  filterOptions,
  ANALYSIS_STEPS,
} from "./displayConfig";

describe("displayConfig", () => {
  it("chunkTypeStyles has all 4 types", () => {
    expect(Object.keys(chunkTypeStyles)).toEqual(
      expect.arrayContaining(["quote", "fact", "context", "observation"])
    );
  });

  it("each chunk type style has border, badge, and icon", () => {
    for (const style of Object.values(chunkTypeStyles)) {
      expect(style).toHaveProperty("border");
      expect(style).toHaveProperty("badge");
      expect(style).toHaveProperty("icon");
    }
  });

  it("confidenceStyles has high, medium, low", () => {
    expect(Object.keys(confidenceStyles)).toEqual(["high", "medium", "low"]);
  });

  it("sortOptions exist for all analysis steps", () => {
    for (const step of ANALYSIS_STEPS) {
      expect(sortOptions[step]).toBeDefined();
      expect(sortOptions[step].length).toBeGreaterThan(0);
    }
  });

  it("filterOptions exist for all analysis steps", () => {
    for (const step of ANALYSIS_STEPS) {
      expect(filterOptions[step]).toBeDefined();
    }
  });

  it("each sort option has field and label", () => {
    for (const step of ANALYSIS_STEPS) {
      for (const opt of sortOptions[step]) {
        expect(opt).toHaveProperty("field");
        expect(opt).toHaveProperty("label");
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run --project unit src/components/analysis/config/displayConfig.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement displayConfig.ts**

```typescript
// displayConfig.ts
// Centralized style maps, sort options, and filter options for all analysis steps.
// Eliminates duplication across 8 list components.

export const ANALYSIS_STEPS = [
  "chunks", "inferences", "patterns", "insights", "principles",
  "metaPatterns", "crossInsights", "systemPrinciples",
] as const;

export type AnalysisStep = (typeof ANALYSIS_STEPS)[number];

// ===== CHUNK TYPES =====
export const chunkTypeStyles: Record<string, { border: string; badge: string; icon: string }> = {
  quote: { border: "border-l-brand-forest", badge: "bg-brand-forest text-white", icon: "Q" },
  fact: { border: "border-l-brand-mustard", badge: "bg-brand-mustard text-white", icon: "F" },
  context: { border: "border-l-brand-maroon", badge: "bg-brand-maroon text-white", icon: "C" },
  observation: { border: "border-l-brand-olive", badge: "bg-brand-olive text-white", icon: "O" },
};

// ===== INSIGHT TYPES =====
export const insightTypeStyles: Record<string, string> = {
  "non-consensus": "bg-brand-crimson text-white",
  "first-principles": "bg-brand-forest text-white",
  "surprising": "bg-brand-burnt-orange text-white",
  "revealing": "bg-brand-maroon text-white",
};

// ===== CONFIDENCE =====
export const confidenceStyles: Record<string, string> = {
  high: "bg-brand-forest/20 text-brand-forest border-brand-forest/30",
  medium: "bg-brand-mustard/20 text-brand-mustard border-brand-mustard/30",
  low: "bg-base-04 text-base-55 border-border",
};

// ===== PRIORITY =====
export const priorityStyles: Record<string, { badge: string; border: string }> = {
  critical: { badge: "bg-destructive text-white", border: "border-l-destructive" },
  high: { badge: "bg-brand-crimson text-white", border: "border-l-brand-crimson" },
  medium: { badge: "bg-brand-mustard text-white", border: "border-l-brand-mustard" },
  low: { badge: "bg-accent-blue-bg text-accent-blue", border: "border-l-accent-blue" },
};

// ===== FREQUENCY =====
export const frequencyStyles: Record<string, string> = {
  high: "bg-brand-forest/20 text-brand-forest",
  medium: "bg-brand-mustard/20 text-brand-mustard",
  low: "bg-base-04 text-base-55",
};

// ===== RELATIONSHIP TYPE =====
export const relationshipTypeStyles: Record<string, string> = {
  convergent: "bg-brand-forest/20 text-brand-forest",
  divergent: "bg-brand-burnt-orange/20 text-brand-burnt-orange",
  tension: "bg-brand-crimson/20 text-brand-crimson",
  causal: "bg-accent-blue-bg text-accent-blue",
};

// ===== CONSISTENCY =====
export const consistencyStyles: Record<string, string> = {
  consistent: "bg-brand-forest/20 text-brand-forest",
  varying: "bg-brand-mustard/20 text-brand-mustard",
  contradictory: "bg-brand-crimson/20 text-brand-crimson",
  high: "bg-brand-forest/20 text-brand-forest",
  medium: "bg-brand-mustard/20 text-brand-mustard",
  low: "bg-brand-crimson/20 text-brand-crimson",
};

// ===== SCOPE =====
export const scopeStyles: Record<string, string> = {
  universal: "bg-accent-blue-bg text-accent-blue",
  "context-dependent": "bg-brand-mustard/20 text-brand-mustard",
  segmented: "bg-brand-maroon/20 text-brand-maroon",
};

// ===== SORT OPTIONS =====
export interface SortOption {
  field: string;
  label: string;
  direction?: "asc" | "desc";
}

export const sortOptions: Record<AnalysisStep, SortOption[]> = {
  chunks: [
    { field: "type", label: "Type" },
    { field: "speaker", label: "Speaker" },
    { field: "timestamp", label: "Timestamp" },
  ],
  inferences: [
    { field: "chunk_id", label: "Chunk" },
    { field: "count", label: "Inference Count", direction: "desc" },
  ],
  patterns: [
    { field: "frequency", label: "Frequency", direction: "desc" },
    { field: "relationship_type", label: "Relationship" },
    { field: "pattern_name", label: "Name" },
  ],
  insights: [
    { field: "confidence", label: "Confidence", direction: "desc" },
    { field: "type", label: "Type" },
    { field: "headline", label: "Headline" },
  ],
  principles: [
    { field: "priority", label: "Priority", direction: "desc" },
    { field: "principle", label: "Principle" },
  ],
  metaPatterns: [
    { field: "consistency", label: "Consistency" },
    { field: "appears_in_videos.length", label: "Video Count", direction: "desc" },
    { field: "pattern_name", label: "Name" },
  ],
  crossInsights: [
    { field: "confidence", label: "Confidence", direction: "desc" },
    { field: "consistency_across_videos", label: "Consistency" },
    { field: "scope", label: "Scope" },
  ],
  systemPrinciples: [
    { field: "priority", label: "Priority", direction: "desc" },
    { field: "scope", label: "Scope" },
  ],
};

// ===== FILTER OPTIONS =====
export interface FilterOption {
  field: string;
  label: string;
  values: string[];
}

export const filterOptions: Record<AnalysisStep, FilterOption[]> = {
  chunks: [
    { field: "type", label: "Type", values: ["quote", "fact", "context", "observation"] },
  ],
  inferences: [],
  patterns: [
    { field: "relationship_type", label: "Relationship", values: ["convergent", "divergent", "tension", "causal"] },
    { field: "frequency", label: "Frequency", values: ["high", "medium", "low"] },
  ],
  insights: [
    { field: "type", label: "Type", values: ["non-consensus", "first-principles", "surprising", "revealing"] },
    { field: "confidence", label: "Confidence", values: ["high", "medium", "low"] },
  ],
  principles: [
    { field: "priority", label: "Priority", values: ["high", "medium", "low"] },
  ],
  metaPatterns: [
    { field: "consistency", label: "Consistency", values: ["consistent", "varying", "contradictory"] },
  ],
  crossInsights: [
    { field: "confidence", label: "Confidence", values: ["high", "medium", "low"] },
    { field: "scope", label: "Scope", values: ["universal", "context-dependent"] },
  ],
  systemPrinciples: [
    { field: "priority", label: "Priority", values: ["critical", "high", "medium"] },
    { field: "scope", label: "Scope", values: ["universal", "segmented"] },
  ],
};
```

- [ ] **Step 4: Run tests — expect pass**

Run: `cd frontend && npx vitest run --project unit src/components/analysis/config/displayConfig.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/analysis/config/
git commit -m "feat: add centralized displayConfig with badge styles, sort/filter options"
```

---

### Task 2: Create useAnalysisDisplay hook

**Files:**
- Create: `frontend/src/components/analysis/hooks/useAnalysisDisplay.ts`
- Test: `frontend/src/components/analysis/hooks/useAnalysisDisplay.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// useAnalysisDisplay.test.ts
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAnalysisDisplay } from "./useAnalysisDisplay";
import type { AnalysisStep } from "../config/displayConfig";

// Wrap with MemoryRouter for useSearchParams
import { MemoryRouter } from "react-router-dom";
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

describe("useAnalysisDisplay", () => {
  it("defaults to list viewMode", () => {
    const { result } = renderHook(() => useAnalysisDisplay("chunks"), { wrapper });
    expect(result.current.viewMode).toBe("list");
  });

  it("changes viewMode", () => {
    const { result } = renderHook(() => useAnalysisDisplay("chunks"), { wrapper });
    act(() => result.current.setViewMode("grid"));
    expect(result.current.viewMode).toBe("grid");
  });

  it("defaults to no active filters", () => {
    const { result } = renderHook(() => useAnalysisDisplay("chunks"), { wrapper });
    expect(result.current.activeFilters).toEqual({});
  });

  it("toggles a filter value", () => {
    const { result } = renderHook(() => useAnalysisDisplay("chunks"), { wrapper });
    act(() => result.current.toggleFilter("type", "quote"));
    expect(result.current.activeFilters).toEqual({ type: ["quote"] });
  });

  it("toggles filter off when already active", () => {
    const { result } = renderHook(() => useAnalysisDisplay("chunks"), { wrapper });
    act(() => result.current.toggleFilter("type", "quote"));
    act(() => result.current.toggleFilter("type", "quote"));
    expect(result.current.activeFilters).toEqual({});
  });

  it("clears all filters", () => {
    const { result } = renderHook(() => useAnalysisDisplay("chunks"), { wrapper });
    act(() => result.current.toggleFilter("type", "quote"));
    act(() => result.current.toggleFilter("type", "fact"));
    act(() => result.current.clearFilters());
    expect(result.current.activeFilters).toEqual({});
  });

  it("sets and clears search query", () => {
    const { result } = renderHook(() => useAnalysisDisplay("chunks"), { wrapper });
    act(() => result.current.setSearchQuery("user interview"));
    expect(result.current.searchQuery).toBe("user interview");
    act(() => result.current.setSearchQuery(""));
    expect(result.current.searchQuery).toBe("");
  });

  it("sets sort config", () => {
    const { result } = renderHook(() => useAnalysisDisplay("insights"), { wrapper });
    act(() => result.current.setSort({ field: "confidence", direction: "desc" }));
    expect(result.current.sort).toEqual({ field: "confidence", direction: "desc" });
  });

  it("processData filters items", () => {
    const { result } = renderHook(() => useAnalysisDisplay("chunks"), { wrapper });
    const chunks = [
      { type: "quote", text: "hello" },
      { type: "fact", text: "world" },
      { type: "quote", text: "foo" },
    ];
    act(() => result.current.toggleFilter("type", "quote"));
    const processed = result.current.processData(chunks);
    expect(processed).toHaveLength(2);
    expect(processed.every((c: any) => c.type === "quote")).toBe(true);
  });

  it("processData searches by text content", () => {
    const { result } = renderHook(() => useAnalysisDisplay("chunks"), { wrapper });
    const chunks = [
      { type: "quote", text: "usability testing" },
      { type: "fact", text: "demographics data" },
    ];
    act(() => result.current.setSearchQuery("usability"));
    const processed = result.current.processData(chunks);
    expect(processed).toHaveLength(1);
    expect(processed[0].text).toBe("usability testing");
  });
});
```

- [ ] **Step 2: Run test — expect fail**

Run: `cd frontend && npx vitest run --project unit src/components/analysis/hooks/useAnalysisDisplay.test.ts`

- [ ] **Step 3: Implement useAnalysisDisplay**

```typescript
// useAnalysisDisplay.ts
import { useState, useCallback, useMemo } from "react";
import type { AnalysisStep } from "../config/displayConfig";

export type ViewMode = "list" | "grid" | "table";
export type SortDirection = "asc" | "desc";

export interface SortConfig {
  field: string;
  direction: SortDirection;
}

export interface AnalysisDisplayState {
  viewMode: ViewMode;
  sort: SortConfig | null;
  activeFilters: Record<string, string[]>;
  searchQuery: string;
  expandedItems: "all" | "none" | Set<string>;
}

export function useAnalysisDisplay(step: AnalysisStep) {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [sort, setSort] = useState<SortConfig | null>(null);
  const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedItems, setExpandedItems] = useState<"all" | "none" | Set<string>>("all");

  const toggleFilter = useCallback((field: string, value: string) => {
    setActiveFilters((prev) => {
      const current = prev[field] || [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      if (next.length === 0) {
        const { [field]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [field]: next };
    });
  }, []);

  const clearFilters = useCallback(() => {
    setActiveFilters({});
  }, []);

  const expandAll = useCallback(() => setExpandedItems("all"), []);
  const collapseAll = useCallback(() => setExpandedItems("none"), []);

  const processData = useCallback(
    <T extends Record<string, any>>(items: T[]): T[] => {
      let result = [...items];

      // Apply filters
      for (const [field, values] of Object.entries(activeFilters)) {
        if (values.length > 0) {
          result = result.filter((item) => values.includes(String(item[field])));
        }
      }

      // Apply search — searches all string values in each item
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        result = result.filter((item) =>
          Object.values(item).some(
            (val) =>
              typeof val === "string" && val.toLowerCase().includes(q)
          )
        );
      }

      // Apply sort
      if (sort) {
        const priorityOrder: Record<string, number> = {
          critical: 0, high: 1, medium: 2, low: 3,
        };
        const dir = sort.direction === "desc" ? -1 : 1;

        result.sort((a, b) => {
          const aVal = getNestedValue(a, sort.field);
          const bVal = getNestedValue(b, sort.field);

          // Handle priority/frequency/confidence ordering
          if (sort.field === "priority" || sort.field === "frequency" || sort.field === "confidence" || sort.field === "consistency_across_videos") {
            const aOrder = priorityOrder[String(aVal)] ?? 99;
            const bOrder = priorityOrder[String(bVal)] ?? 99;
            return (aOrder - bOrder) * dir;
          }

          // Handle numeric (including array.length)
          if (typeof aVal === "number" && typeof bVal === "number") {
            return (aVal - bVal) * dir;
          }

          // String comparison
          return String(aVal || "").localeCompare(String(bVal || "")) * dir;
        });
      }

      return result;
    },
    [activeFilters, searchQuery, sort]
  );

  return {
    viewMode,
    setViewMode,
    sort,
    setSort,
    activeFilters,
    toggleFilter,
    clearFilters,
    searchQuery,
    setSearchQuery,
    expandedItems,
    expandAll,
    collapseAll,
    processData,
    step,
  };
}

function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((acc, key) => acc?.[key], obj);
}
```

- [ ] **Step 4: Run tests — expect pass**

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/analysis/hooks/
git commit -m "feat: add useAnalysisDisplay hook with filter, sort, search, view mode state"
```

---

## Chunk 2: Toolbar Components

### Task 3: ViewModeToggle

**Files:**
- Create: `frontend/src/components/analysis/display/ViewModeToggle.tsx`

- [ ] **Step 1: Implement ViewModeToggle**

```tsx
import { List, LayoutGrid, Table2 } from "lucide-react";
import type { ViewMode } from "../hooks/useAnalysisDisplay";

interface ViewModeToggleProps {
  viewMode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const modes: { value: ViewMode; icon: typeof List; label: string }[] = [
  { value: "list", icon: List, label: "List view" },
  { value: "grid", icon: LayoutGrid, label: "Grid view" },
  { value: "table", icon: Table2, label: "Table view" },
];

export function ViewModeToggle({ viewMode, onChange }: ViewModeToggleProps) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg bg-base-04 p-0.5">
      {modes.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => onChange(value)}
          className={`p-1.5 rounded-md transition-[color,background] duration-[var(--duration-micro)] ease-[var(--ease)] ${
            viewMode === value
              ? "bg-surface-card text-foreground shadow-subtle"
              : "text-base-40 hover:text-base-62"
          }`}
          aria-label={label}
          aria-pressed={viewMode === value}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

---

### Task 4: FilterBar

**Files:**
- Create: `frontend/src/components/analysis/display/FilterBar.tsx`

- [ ] **Step 1: Implement FilterBar**

```tsx
import { X } from "lucide-react";
import type { FilterOption } from "../config/displayConfig";

interface FilterBarProps {
  options: FilterOption[];
  activeFilters: Record<string, string[]>;
  onToggle: (field: string, value: string) => void;
  onClear: () => void;
}

export function FilterBar({ options, activeFilters, onToggle, onClear }: FilterBarProps) {
  const hasActiveFilters = Object.keys(activeFilters).length > 0;

  if (options.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map((opt) =>
        opt.values.map((value) => {
          const isActive = activeFilters[opt.field]?.includes(value);
          return (
            <button
              key={`${opt.field}-${value}`}
              onClick={() => onToggle(opt.field, value)}
              className={`text-label px-2.5 py-1 rounded-full border transition-[color,background,border-color] duration-[var(--duration-micro)] ease-[var(--ease)] ${
                isActive
                  ? "bg-accent-blue-bg text-accent-blue border-accent-blue-border"
                  : "bg-transparent text-base-55 border-border hover:border-base-25 hover:text-base-85"
              }`}
            >
              {value}
            </button>
          );
        })
      )}
      {hasActiveFilters && (
        <button
          onClick={onClear}
          className="text-label text-base-40 hover:text-base-62 flex items-center gap-1 transition-colors duration-[var(--duration-micro)]"
        >
          <X className="h-3 w-3" />
          Clear
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

---

### Task 5: SortDropdown

**Files:**
- Create: `frontend/src/components/analysis/display/SortDropdown.tsx`

- [ ] **Step 1: Implement SortDropdown**

Uses the existing DropdownMenu component. Shows sort options with direction indicator.

```tsx
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "../../ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../ui/DropdownMenu";
import type { SortOption } from "../config/displayConfig";
import type { SortConfig } from "../hooks/useAnalysisDisplay";

interface SortDropdownProps {
  options: SortOption[];
  sort: SortConfig | null;
  onSort: (config: SortConfig | null) => void;
}

export function SortDropdown({ options, sort, onSort }: SortDropdownProps) {
  if (options.length === 0) return null;

  const handleSort = (opt: SortOption) => {
    if (sort?.field === opt.field) {
      // Toggle direction or clear
      if (sort.direction === "desc") {
        onSort({ field: opt.field, direction: "asc" });
      } else {
        onSort(null); // clear sort
      }
    } else {
      onSort({ field: opt.field, direction: opt.direction || "desc" });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-ui">
          <ArrowUpDown className="h-3.5 w-3.5" />
          {sort ? `Sort: ${options.find((o) => o.field === sort.field)?.label}` : "Sort"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {options.map((opt) => (
          <DropdownMenuItem key={opt.field} onClick={() => handleSort(opt)}>
            <span className="flex-1">{opt.label}</span>
            {sort?.field === opt.field && (
              sort.direction === "desc"
                ? <ArrowDown className="h-3.5 w-3.5 text-accent-blue" />
                : <ArrowUp className="h-3.5 w-3.5 text-accent-blue" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Commit**

---

### Task 6: SearchInput

**Files:**
- Create: `frontend/src/components/analysis/display/SearchInput.tsx`

- [ ] **Step 1: Implement SearchInput**

```tsx
import { Search, X } from "lucide-react";
import { useRef } from "react";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchInput({ value, onChange, placeholder = "Search..." }: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative flex items-center">
      <Search className="absolute left-2.5 h-3.5 w-3.5 text-base-40 pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-full sm:w-52 rounded-lg border border-border bg-transparent pl-8 pr-8 text-ui text-foreground placeholder:text-base-40 transition-[border-color] duration-[var(--duration-micro)] ease-[var(--ease)] focus:outline-none focus:border-accent-blue focus:ring-[2px] focus:ring-accent-blue-bg"
      />
      {value && (
        <button
          onClick={() => { onChange(""); inputRef.current?.focus(); }}
          className="absolute right-2 p-0.5 text-base-40 hover:text-base-62 rounded"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

---

### Task 7: ExpandCollapseToggle

**Files:**
- Create: `frontend/src/components/analysis/display/ExpandCollapseToggle.tsx`

- [ ] **Step 1: Implement**

```tsx
import { ChevronsUpDown, ChevronsDownUp } from "lucide-react";

interface ExpandCollapseToggleProps {
  expanded: "all" | "none" | Set<string>;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

export function ExpandCollapseToggle({ expanded, onExpandAll, onCollapseAll }: ExpandCollapseToggleProps) {
  const isAllExpanded = expanded === "all";

  return (
    <button
      onClick={isAllExpanded ? onCollapseAll : onExpandAll}
      className="h-8 px-2 text-ui text-base-40 hover:text-base-62 rounded-md hover:bg-base-04 flex items-center gap-1.5 transition-[color,background] duration-[var(--duration-micro)] ease-[var(--ease)]"
      aria-label={isAllExpanded ? "Collapse all" : "Expand all"}
    >
      {isAllExpanded ? (
        <><ChevronsDownUp className="h-3.5 w-3.5" /> Collapse</>
      ) : (
        <><ChevronsUpDown className="h-3.5 w-3.5" /> Expand</>
      )}
    </button>
  );
}
```

- [ ] **Step 2: Commit**

---

### Task 8: AnalysisToolbar (composes all controls)

**Files:**
- Create: `frontend/src/components/analysis/display/AnalysisToolbar.tsx`

- [ ] **Step 1: Implement AnalysisToolbar**

```tsx
import { ViewModeToggle } from "./ViewModeToggle";
import { FilterBar } from "./FilterBar";
import { SortDropdown } from "./SortDropdown";
import { SearchInput } from "./SearchInput";
import { ExpandCollapseToggle } from "./ExpandCollapseToggle";
import { sortOptions, filterOptions, type AnalysisStep } from "../config/displayConfig";
import type { useAnalysisDisplay } from "../hooks/useAnalysisDisplay";

type ToolbarProps = ReturnType<typeof useAnalysisDisplay>;

export function AnalysisToolbar(props: ToolbarProps) {
  const {
    step,
    viewMode, setViewMode,
    sort, setSort,
    activeFilters, toggleFilter, clearFilters,
    searchQuery, setSearchQuery,
    expandedItems, expandAll, collapseAll,
  } = props;

  const stepSortOptions = sortOptions[step];
  const stepFilterOptions = filterOptions[step];

  return (
    <div className="space-y-3 mb-4">
      {/* Top row: view toggle + sort + search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <ViewModeToggle viewMode={viewMode} onChange={setViewMode} />
          {viewMode === "list" && (
            <ExpandCollapseToggle
              expanded={expandedItems}
              onExpandAll={expandAll}
              onCollapseAll={collapseAll}
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          <SearchInput value={searchQuery} onChange={setSearchQuery} />
          <SortDropdown options={stepSortOptions} sort={sort} onSort={setSort} />
        </div>
      </div>

      {/* Filter chips row */}
      {stepFilterOptions.length > 0 && (
        <FilterBar
          options={stepFilterOptions}
          activeFilters={activeFilters}
          onToggle={toggleFilter}
          onClear={clearFilters}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create Storybook stories for all toolbar components**

Create `frontend/src/components/analysis/display/AnalysisToolbar.stories.tsx` showing the toolbar with different step configs (chunks with type filters, insights with confidence/type, etc.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/analysis/display/
git commit -m "feat: add AnalysisToolbar with ViewModeToggle, FilterBar, SortDropdown, SearchInput, ExpandCollapseToggle"
```

---

## Chunk 3: Card Subcomponents

### Task 9: Extract ChunkCard from ChunksList

**Files:**
- Create: `frontend/src/components/analysis/cards/ChunkCard.tsx`

- [ ] **Step 1: Create ChunkCard — the card view of a single chunk**

Extract the per-item rendering from ChunksList into a standalone card component:

```tsx
import { Badge } from "../../ui/Badge";
import { Clock } from "lucide-react";
import { chunkTypeStyles } from "../config/displayConfig";
import type { Chunk } from "../../../types";

interface ChunkCardProps {
  chunk: Chunk;
  compact?: boolean; // true for grid view (shorter)
}

export function ChunkCard({ chunk, compact = false }: ChunkCardProps) {
  const styles = chunkTypeStyles[chunk.type] || chunkTypeStyles.quote;

  return (
    <div className={`bg-card rounded-xl p-3 sm:p-4 border-l-4 ${styles.border}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <Badge className={`${styles.badge} text-label`}>{chunk.type}</Badge>
        {chunk.speaker && (
          <span className="text-label text-base-40">{chunk.speaker}</span>
        )}
      </div>
      <p className={`text-sm text-base-85 ${compact ? "line-clamp-3" : ""}`}>
        {chunk.text}
      </p>
      {chunk.timestamp && (
        <div className="flex items-center gap-1 mt-2 text-label text-base-40">
          <Clock className="h-3 w-3" />
          <span>{chunk.timestamp}</span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Repeat for remaining 7 card types**

Create `InsightCard.tsx`, `PatternCard.tsx`, `PrincipleCard.tsx`, `InferenceCard.tsx`, `MetaPatternCard.tsx`, `CrossInsightCard.tsx`, `SystemPrincipleCard.tsx`.

Each extracts the per-item rendering from its parent list component, with a `compact` prop that truncates text for grid view.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/analysis/cards/
git commit -m "feat: extract Card subcomponents from all 8 analysis list components"
```

---

## Chunk 4: CardView + TableView Wrappers

### Task 10: CardView grid wrapper

**Files:**
- Create: `frontend/src/components/analysis/display/CardView.tsx`

- [ ] **Step 1: Implement CardView**

```tsx
interface CardViewProps {
  children: React.ReactNode;
  columns?: 2 | 3;
}

export function CardView({ children, columns = 2 }: CardViewProps) {
  return (
    <div className={`grid gap-3 ${
      columns === 3
        ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        : "grid-cols-1 sm:grid-cols-2"
    }`}>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

---

### Task 11: TableView wrapper

**Files:**
- Create: `frontend/src/components/analysis/display/TableView.tsx`

- [ ] **Step 1: Implement TableView**

A generic table that accepts column definitions and data. Uses the existing Table UI component.

```tsx
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../../ui/Table";
import { ArrowUp, ArrowDown } from "lucide-react";
import type { SortConfig } from "../hooks/useAnalysisDisplay";

export interface TableColumn<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render: (item: T) => React.ReactNode;
  className?: string;
}

interface TableViewProps<T> {
  data: T[];
  columns: TableColumn<T>[];
  sort: SortConfig | null;
  onSort: (config: SortConfig | null) => void;
  onRowClick?: (item: T) => void;
}

export function TableView<T extends Record<string, any>>({
  data, columns, sort, onSort, onRowClick,
}: TableViewProps<T>) {
  const handleHeaderClick = (col: TableColumn<T>) => {
    if (!col.sortable) return;
    if (sort?.field === col.key) {
      onSort(sort.direction === "desc" ? { field: col.key, direction: "asc" } : null);
    } else {
      onSort({ field: col.key, direction: "desc" });
    }
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead
                key={col.key}
                className={`text-label ${col.sortable ? "cursor-pointer select-none hover:text-foreground" : ""} ${col.className || ""}`}
                onClick={() => handleHeaderClick(col)}
              >
                <div className="flex items-center gap-1">
                  {col.label}
                  {sort?.field === col.key && (
                    sort.direction === "desc"
                      ? <ArrowDown className="h-3 w-3 text-accent-blue" />
                      : <ArrowUp className="h-3 w-3 text-accent-blue" />
                  )}
                </div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((item, i) => (
            <TableRow
              key={i}
              className={onRowClick ? "cursor-pointer hover:bg-base-04" : ""}
              onClick={() => onRowClick?.(item)}
            >
              {columns.map((col) => (
                <TableCell key={col.key} className={col.className}>
                  {col.render(item)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/analysis/display/CardView.tsx frontend/src/components/analysis/display/TableView.tsx
git commit -m "feat: add CardView grid and TableView wrappers for analysis data"
```

---

## Chunk 5: Wire Into Existing Components

### Task 12: Update ChunksList to support view modes

**Files:**
- Modify: `frontend/src/components/analysis/ChunksList.tsx`

- [ ] **Step 1: Refactor ChunksList to accept display state**

Update the component to:
1. Import from `displayConfig` instead of defining local styles
2. Accept optional `viewMode` prop
3. Render `CardView` grid or `TableView` based on viewMode
4. Default to current list behavior if no viewMode specified

```tsx
// Updated ChunksList.tsx
import type { Chunk } from "../../types";
import { Badge } from "../ui/Badge";
import { Clock } from "lucide-react";
import { chunkTypeStyles } from "./config/displayConfig";
import { ChunkCard } from "./cards/ChunkCard";
import { CardView } from "./display/CardView";
import { TableView, type TableColumn } from "./display/TableView";
import type { ViewMode, SortConfig } from "./hooks/useAnalysisDisplay";

interface ChunksListProps {
  chunks: Chunk[];
  viewMode?: ViewMode;
  sort?: SortConfig | null;
  onSort?: (config: SortConfig | null) => void;
}

const chunkColumns: TableColumn<Chunk>[] = [
  { key: "type", label: "Type", sortable: true, render: (c) => (
    <Badge className={`${chunkTypeStyles[c.type]?.badge || ""} text-label`}>{c.type}</Badge>
  ), className: "w-28" },
  { key: "speaker", label: "Speaker", sortable: true, render: (c) => (
    <span className="text-sm text-base-62">{c.speaker || "—"}</span>
  ), className: "w-32" },
  { key: "text", label: "Content", render: (c) => (
    <p className="text-sm text-base-85 line-clamp-2">{c.text}</p>
  ) },
  { key: "timestamp", label: "Time", sortable: true, render: (c) => (
    <span className="text-label text-base-40">{c.timestamp || "—"}</span>
  ), className: "w-24" },
];

export default function ChunksList({ chunks, viewMode = "list", sort, onSort }: ChunksListProps) {
  if (viewMode === "grid") {
    return (
      <CardView columns={3}>
        {chunks.map((chunk, i) => (
          <ChunkCard key={chunk.chunk_id || i} chunk={chunk} compact />
        ))}
      </CardView>
    );
  }

  if (viewMode === "table") {
    return (
      <TableView
        data={chunks}
        columns={chunkColumns}
        sort={sort || null}
        onSort={onSort || (() => {})}
      />
    );
  }

  // Default: list view (current behavior)
  return (
    <div className="space-y-3">
      {chunks.map((chunk, i) => (
        <ChunkCard key={chunk.chunk_id || i} chunk={chunk} />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Repeat pattern for remaining 7 list components**

Each gets:
- Import from `displayConfig` (remove local style maps)
- Optional `viewMode`, `sort`, `onSort`, `expandedItems` props
- Grid view via CardView + corresponding Card subcomponent
- Table view with step-specific column definitions
- Default list view preserved

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/analysis/
git commit -m "feat: add view mode support to all 8 analysis list components"
```

---

### Task 13: Wire AnalysisToolbar into VideoDetailPage

**Files:**
- Modify: `frontend/src/pages/VideoDetailPage.tsx`

- [ ] **Step 1: Add toolbar to each analysis tab**

For each of the 5 per-video analysis tabs, add:
1. `useAnalysisDisplay(step)` hook call
2. `AnalysisToolbar` above the list component
3. Pass `processData(data)` through the toolbar's filters/sort/search
4. Pass `viewMode` to the list component

```tsx
// Inside the analysis tabs section:
import { useAnalysisDisplay } from "../components/analysis/hooks/useAnalysisDisplay";
import { AnalysisToolbar } from "../components/analysis/display/AnalysisToolbar";

// In the component body (one per tab):
const chunksDisplay = useAnalysisDisplay("chunks");
const insightsDisplay = useAnalysisDisplay("insights");
// ... etc for each step

// In each TabsContent:
<TabsContent value="chunks">
  <AnalysisToolbar {...chunksDisplay} />
  <ChunksList
    chunks={chunksDisplay.processData(analysis.chunks || [])}
    viewMode={chunksDisplay.viewMode}
    sort={chunksDisplay.sort}
    onSort={chunksDisplay.setSort}
  />
</TabsContent>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/VideoDetailPage.tsx
git commit -m "feat: wire AnalysisToolbar into VideoDetailPage analysis tabs"
```

---

### Task 14: Wire AnalysisToolbar into ProjectDetailPage

**Files:**
- Modify: `frontend/src/pages/ProjectDetailPage.tsx`

- [ ] **Step 1: Same pattern for 3 cross-video tabs**

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/ProjectDetailPage.tsx
git commit -m "feat: wire AnalysisToolbar into ProjectDetailPage cross-video tabs"
```

---

## Chunk 6: Storybook Stories + Tests

### Task 15: Storybook stories for all new components

**Files:**
- Create: `frontend/src/components/analysis/display/AnalysisToolbar.stories.tsx`
- Create: `frontend/src/components/analysis/cards/ChunkCard.stories.tsx`

- [ ] **Step 1: Create comprehensive Storybook stories**

AnalysisToolbar story: Show toolbar in chunks mode (with type filters), insights mode (with confidence + type filters), and principles mode.

ChunkCard story: Show all 4 chunk types in both compact and full modes.

Create a "Data Views" story category showing:
- Grid view with 9 chunk cards
- Table view with sortable columns
- List view with filter chips active
- Search filtering in action

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/analysis/
git commit -m "feat: add Storybook stories for data view components"
```

---

### Task 16: Integration tests

**Files:**
- Create: `frontend/src/components/analysis/display/AnalysisToolbar.test.tsx`

- [ ] **Step 1: Test AnalysisToolbar rendering and interactions**

Test:
- Renders ViewModeToggle, SearchInput, SortDropdown
- Filter chips appear for chunks step
- Clicking a filter chip toggles it active
- Search input accepts text
- View mode buttons switch active state

- [ ] **Step 2: Test processData integration**

Test that filtered + sorted + searched data flows correctly through to the list components.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/analysis/
git commit -m "test: add integration tests for AnalysisToolbar and data processing"
```

---

### Task 17: Final verification

- [ ] **Step 1: Run full test suite**

Run: `cd frontend && npx vitest run --project unit`
Expected: All tests pass

- [ ] **Step 2: Run TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run production build**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 4: Verify Storybook**

Run: `cd frontend && npm run storybook`
Verify all new stories render in both light and dark mode.

- [ ] **Step 5: Final commit**

```bash
git commit -m "feat: complete configurable data views — filter, sort, search, grid/table/list modes"
```
