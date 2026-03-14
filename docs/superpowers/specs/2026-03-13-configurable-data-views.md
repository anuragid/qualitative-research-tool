# Configurable Data Views — Design Proposal

> Craft-inspired view modes, sorting, filtering, and search for analysis data.
> **Status:** Awaiting user review before implementation.

## Problem

Analysis data (chunks, inferences, patterns, insights, principles) is displayed in one fixed format — vertical accordion lists. Users cannot:
- Switch between grid/list/table views
- Sort by confidence, priority, or frequency
- Filter by type or category
- Search within results
- Expand/collapse all items at once
- Compare items side-by-side

## Proposed Solution

### New Components

| Component | Purpose |
|-----------|---------|
| `ViewModeToggle` | Switch between list / grid / table |
| `SortDropdown` | Sort by type-specific fields (confidence, priority, frequency) |
| `FilterBar` | Clickable filter chips (currently decorative badges become interactive) |
| `SearchInput` | Text search within analysis items |
| `AnalysisToolbar` | Composes all above into a toolbar above each analysis tab |
| `ExpandCollapseToggle` | Expand All / Collapse All for accordion views |
| `CardView` | Grid layout wrapper for card-style items |
| `TableView` | Compact table with sortable columns |
| `ItemDetailPanel` | Slide-over panel for viewing full details from grid/table |

### State Management

`useAnalysisDisplay` hook persisted to URL search params:
- `?view=grid&sort=confidence:desc&filter.type=quote,fact&q=usability`
- localStorage for default preferences

### Phased Rollout

1. **Phase 1** — FilterBar (interactive type badges) + SearchInput + Expand/Collapse All
2. **Phase 2** — SortDropdown with per-step options
3. **Phase 3** — ViewModeToggle + CardView grid + TableView
4. **Phase 4** — URL param persistence + ItemDetailPanel

### Files Changed

- 8 analysis list components (add viewMode prop, extract Card subcomponents)
- VideoDetailPage + ProjectDetailPage (wrap tabs with AnalysisToolbar)
- 11 new files in `src/components/analysis/display/` and `hooks/`
- 1 new config file consolidating duplicated badge styles

See full proposal in research output for complete token details and data flow diagrams.
