# Folder Card Design System Quality Fix

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all magic numbers and Tailwind defaults in FolderCard with proper design system tokens, fix clip-path bleeding, and fix overflow-hidden breaking thumbnail hover animation.

**Architecture:** Add a new `FOLDER CARD` section to the design system tokens in `index.css` (+ dark mode overrides), then refactor `FolderCard.tsx` to consume only those tokens. No visual changes — this is a quality/correctness pass.

**Tech Stack:** Tailwind v4 CSS custom properties, React, SVG clip-path with objectBoundingBox.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/src/index.css` | Modify | Add folder card tokens to `@theme` block + dark mode |
| `frontend/src/components/projects/FolderCard.tsx` | Modify | Replace all magic numbers with token references |
| `frontend/src/pages/ProjectsPage.tsx` | Modify | Use token for skeleton max-width |

---

### Task 1: Add Folder Card Design Tokens

**Files:**
- Modify: `frontend/src/index.css` (inside `@theme` block, after line 189 — Sizing section)

- [ ] **Step 1: Add folder card token section to `@theme` block**

Add these tokens after the `/* ===== 17. SIZING ===== */` section (before the closing `}` of `@theme`):

```css
/* ===== 18. FOLDER CARD ===== */
--folder-max-w: 20rem;              /* 320px — max card width in grid */
--folder-aspect: 4 / 3;             /* width:height ratio of folder area */
--folder-front-height: 83%;         /* front panel covers this much of folder area */
--folder-thumb-width: 30%;          /* thumbnail width relative to folder */
--folder-thumb-aspect: 16 / 11;     /* landscape video thumbnail ratio */
--folder-thumb-top: 12%;            /* how far down thumbnails sit from top */
--folder-hover-outline-radius: 1.25rem; /* 20px — hover container radius */
--folder-hover-outline-width: 1.5px;
--folder-hover-outline-color: var(--color-base-05);
--folder-front-tilt: -14deg;        /* rotateX on hover */
--duration-folder: 0.4s;            /* folder-specific animation duration */
```

- [ ] **Step 2: Add dark mode overrides for folder tokens**

Inside the `.dark { ... }` block (after the existing shadow overrides around line 303), add:

```css
/* Folder card — dark mode */
--folder-hover-outline-color: rgba(237, 235, 233, 0.06);
```

- [ ] **Step 3: Verify build compiles with new tokens**

Run: `cd frontend && npm run build`
Expected: Build succeeds. New tokens are available via `var(--folder-*)`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/index.css
git commit -m "design: add folder card tokens to design system

Adds --folder-* tokens for max-width, aspect ratio, front panel height,
thumbnail dimensions, hover outline, tilt angle, and animation duration.
Includes dark mode override for outline color."
```

---

### Task 2: Fix FolderCard Component — Replace Magic Numbers

**Files:**
- Modify: `frontend/src/components/projects/FolderCard.tsx`

- [ ] **Step 1: Replace `max-w-xs` with design token**

Line 122 — change:
```tsx
className="group/folder relative cursor-pointer outline-none max-w-xs mx-auto"
```
to:
```tsx
className="group/folder relative cursor-pointer outline-none mx-auto"
style={{ maxWidth: "var(--folder-max-w)" }}
```

> Note: Tailwind v4 can't consume arbitrary CSS vars in `max-w-[]` without `@theme` registration as a spacing value. Using inline style for a single token reference is acceptable here.

- [ ] **Step 2: Replace hover outline magic numbers**

Lines 135-140 — change the hover outline div:
```tsx
className="rounded-[20px] p-[var(--space-inline-gap)] overflow-hidden
  transition-all duration-[var(--duration-normal)] ease-[var(--ease)]
  border-[1.5px] border-transparent
  group-hover/folder:border-base-05
  group-active/folder:scale-[0.98]"
```
to:
```tsx
className="p-[var(--space-inline-gap)]
  transition-all duration-[var(--duration-normal)] ease-[var(--ease)]
  border-transparent
  group-hover/folder:border-[var(--folder-hover-outline-color)]
  group-active/folder:scale-[0.98]"
style={{
  borderRadius: "var(--folder-hover-outline-radius)",
  borderWidth: "var(--folder-hover-outline-width)",
}}
```

**IMPORTANT:** Remove `overflow-hidden` from this div. The hover outline container must NOT clip overflow — thumbnails need to escape upward on hover. Instead, we will ensure thumbnails are constrained by their transform values (already handled by the CSS custom properties).

- [ ] **Step 3: Replace folder area magic numbers**

Line 143 — change:
```tsx
<div className="relative aspect-[4/3] overflow-hidden" style={{ perspective: "800px" }}>
```
to:
```tsx
<div className="relative overflow-hidden" style={{ aspectRatio: "var(--folder-aspect)", perspective: "800px" }}>
```

> `overflow-hidden` stays on the folder area (not the outline container) — this clips the back panel's border-radius correctly. Thumbnails sit between back and front panels inside this area in default state, and their hover transforms move them upward but they're constrained to the outline container bounds by their CSS var values.

- [ ] **Step 4: Replace front panel magic numbers**

Lines 182-192 — change the front panel div:
```tsx
className="absolute inset-x-0 bottom-0 z-[5]
  transition-transform duration-[0.4s] ease-[var(--ease)]
  origin-bottom
  group-hover/folder:[transform:rotateX(-14deg)]
  motion-reduce:group-hover/folder:transform-none"
style={{
  height: "83%",
  clipPath: `url(#folder-clip-${project.id})`,
  backgroundColor: color.body,
}}
```
to:
```tsx
className="absolute inset-x-0 bottom-0 z-[5]
  transition-transform ease-[var(--ease)]
  origin-bottom
  motion-reduce:group-hover/folder:transform-none"
style={{
  height: "var(--folder-front-height)",
  clipPath: `url(#folder-clip-${project.id})`,
  backgroundColor: color.body,
  transitionDuration: "var(--duration-folder)",
  transform: undefined, // set via group-hover below
}}
```

For the hover transform, we can't use a CSS var directly inside `group-hover/folder:[transform:...]` since the tilt value is a token. Instead, add a CSS rule. In `index.css`, add after the folder-thumbnail rules:

```css
.group\/folder:hover .folder-front-panel {
  transform: rotateX(var(--folder-front-tilt));
}
```

And add `folder-front-panel` class to the front panel div.

- [ ] **Step 5: Replace thumbnail magic numbers**

Lines 161-170 — change thumbnail div:
```tsx
className="folder-thumbnail absolute rounded-[var(--radius-md)] overflow-hidden
  shadow-subtle motion-reduce:!transition-none"
style={{
  background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`,
  width: "30%",
  aspectRatio: "16/11",
  top: "12%",
  zIndex: 2 + (recentVideos.length - i),
  ...getThumbStyle(recentVideos.length, i),
}}
```
to:
```tsx
className="folder-thumbnail absolute rounded-[var(--radius-md)] overflow-hidden
  shadow-subtle motion-reduce:!transition-none"
style={{
  background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`,
  width: "var(--folder-thumb-width)",
  aspectRatio: "var(--folder-thumb-aspect)",
  top: "var(--folder-thumb-top)",
  zIndex: 2 + (recentVideos.length - i),
  ...getThumbStyle(recentVideos.length, i),
}}
```

- [ ] **Step 6: Build and verify**

Run: `cd frontend && npm run build`
Expected: Build succeeds with zero errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/projects/FolderCard.tsx frontend/src/index.css
git commit -m "refactor: replace all FolderCard magic numbers with design tokens

- max-w-xs → var(--folder-max-w)
- aspect-ratio, front panel height, thumbnail dimensions → tokens
- hover outline radius, width, color → tokens
- animation duration → var(--duration-folder)
- front panel tilt → var(--folder-front-tilt) via CSS rule
- Remove overflow-hidden from outline container (was breaking
  thumbnail hover animation); keep on folder area only"
```

---

### Task 3: Fix ProjectsPage Skeleton

**Files:**
- Modify: `frontend/src/pages/ProjectsPage.tsx`

- [ ] **Step 1: Replace skeleton max-w-xs with token**

Line 45 — change:
```tsx
<div key={i} className="max-w-xs mx-auto p-2">
```
to:
```tsx
<div key={i} className="mx-auto p-2" style={{ maxWidth: "var(--folder-max-w)" }}>
```

- [ ] **Step 2: Build and verify**

Run: `cd frontend && npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/ProjectsPage.tsx
git commit -m "refactor: use folder-max-w token for skeleton loading state"
```

---

### Task 4: Visual Verification

- [ ] **Step 1: Push and wait for CI/CD**

```bash
git push
```
Wait for CI/CD: `sleep 90 && gh run list --limit 1 --json status,conclusion`
Expected: `{"conclusion":"success","status":"completed"}`

- [ ] **Step 2: Hard-reload production and screenshot**

Navigate to `https://methodex.ai/projects`, hard reload (`Cmd+Shift+R`).

**Verify:**
- Folders are constrained width (~320px), centered in grid
- No colored bleeding at front panel corners
- Noise texture is fully contained within front panel shape
- Thumbnails peek in default state
- On hover: thumbnails fan out, front panel tilts, hover outline appears
- Thumbnails do NOT escape beyond the hover outline
- All three color variants render correctly (mustard, forest, maroon)

- [ ] **Step 3: Screenshot hover state**

Hover the first folder and screenshot. Verify the tilt animation and thumbnail fan-out work correctly (they should NOT be clipped by overflow-hidden since we moved that to only the folder area, not the outline container).
