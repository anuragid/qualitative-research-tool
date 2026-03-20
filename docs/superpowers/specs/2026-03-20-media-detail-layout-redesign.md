# Media Detail Page Layout Redesign

## Summary

Restructure the VideoDetailPage to place the transcript in a side panel next to the video (YouTube-style) instead of in a separate tab. Remove the outer Transcript/Analysis tab bar. Analysis section with its 5 step tabs becomes the sole bottom section.

## Design Decisions

| Decision | Choice |
|----------|--------|
| Video:Transcript ratio | 80-90% : 10-20% (YouTube-style) |
| Transcript panel behavior | Toggle button, video goes full width when hidden |
| Speaker role assignment | Inline in transcript panel + status in analysis section |
| Analysis layout | "Analysis" heading + action buttons row, 5 step tabs below |
| Mobile transcript | Bottom sheet/drawer (shadcn Sheet, side="bottom") |
| Implementation approach | Extract sub-components first, then restructure layout |

## Component Architecture

### New Components

**`MediaPlayerSection.tsx`** (~80 lines)
- Renders `<video>` or `<audio>` in a card container
- Props: `playbackUrl`, `filename`, `videoStatus`
- Keeps `id="main-video-player"` for transcript sync

**`TranscriptSidePanel.tsx`** (~250 lines)
- Wraps `TranscriptViewer` in a collapsible panel
- Toggle button to collapse/expand (parent manages `isOpen` state)
- Contains speaker role assignment UI (moved from prerequisites section)
- Desktop: fixed-height scrollable sidebar with border-left
- Mobile (`< md`): shadcn `Sheet` component with `side="bottom"`
- Props: `transcript`, `speakerLabels`, `videoId`, `isOpen`, `onToggle`, speaker editing handlers

**`AnalysisSection.tsx`** (~300 lines)
- Header row: "Analysis" title (left), action buttons (right) — Start Full Analysis, Continue Step, loading states
- Prerequisites alert: if roles not assigned, inline warning replaces old prerequisite card
- 5 step tabs: Chunks, Inferences, Patterns, Insights, Principles
- Step-by-step mode: progress indicator + step status icons on tabs
- Props: analysis data, step handlers, display hooks, canStartAnalysis, workflow state

**`VideoDetailPage.tsx`** refactored (~150 lines)
- Data fetching (all hooks)
- Layout composition:
  - Two-column flex at top: `MediaPlayerSection` (flex-1) + `TranscriptSidePanel` (w-[200px] to w-[280px])
  - `AnalysisSection` below (full width)
- Manages transcript panel open/close state
- Passes data and handlers to children

### Layout Structure (Desktop)

```
+-------------------------------------------------------+
| Back link                                              |
| Page Header (filename, metadata, status)               |
+--------------------------------------------+----------+
|                                            |          |
|           Video Player                     | Transcript|
|           (80-90%)                         | Panel    |
|                                            | (10-20%) |
|                                            |          |
+--------------------------------------------+----------+
| Analysis                    [Start Analysis] [Continue]|
+-------------------------------------------------------+
| [Chunks] [Inferences] [Patterns] [Insights] [Princ.]  |
+-------------------------------------------------------+
| Tab content (list/grid/table + toolbar)                |
|                                                        |
+-------------------------------------------------------+
```

### Layout Structure (Mobile < md)

```
+-------------------------+
| Back link               |
| Page Header             |
+-------------------------+
| Video Player (full)     |
|                         |
+-------------------------+
| [Transcript] fab button |
+-------------------------+
| Analysis     [Actions]  |
+-------------------------+
| [Tab bar - scrollable]  |
+-------------------------+
| Tab content             |
+-------------------------+

Bottom sheet (when open):
+-------------------------+
| --- drag handle ---     |
| Transcript              |
| [search bar]            |
| Speaker A: text...      |
| Speaker B: text...      |
+-------------------------+
```

## What Stays the Same

- All analysis list components (ChunksList, InferencesList, etc.)
- AnalysisToolbar component
- useAnalysisDisplay hook
- TranscriptViewer internal logic (word highlighting, auto-scroll, search, click-to-seek)
- All data fetching hooks
- All backend APIs
- ContinueStepButton component

## Files Modified

- `frontend/src/pages/VideoDetailPage.tsx` — refactored to thin orchestrator
- `frontend/src/components/videos/TranscriptViewer.tsx` — may need minor prop adjustments

## Files Created

- `frontend/src/components/videos/MediaPlayerSection.tsx`
- `frontend/src/components/videos/TranscriptSidePanel.tsx`
- `frontend/src/components/analysis/AnalysisSection.tsx`

## Testing Strategy

1. **Type checking**: `tsc --noEmit` passes
2. **Lint**: `eslint` passes
3. **Build**: `vite build` succeeds
4. **Unit tests**: New components render correctly with mock data
5. **Browser testing**: No console errors, correct layout, responsive behavior
6. **E2E**: Video plays, transcript syncs, analysis tabs work, speaker roles editable
