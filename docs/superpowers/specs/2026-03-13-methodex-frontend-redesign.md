# methodex Frontend Redesign — Design Specification

**Date:** 2026-03-13
**Product:** methodex (methods + rolodex) — methodex.ai
**Scope:** Complete frontend visual redesign of the qualitative research tool

---

## 1. Design Philosophy

The methodex product UI takes its interaction patterns, layout, and component design from **Craft.do's docs app** — clean, minimal, progressive disclosure, frosted glass surfaces, physically-realistic shadows, and a monochromatic opacity-based text hierarchy.

The **visual identity** (colors, textures, warmth, folder metaphor) comes from the brand inspiration palette — 18 colors across saturated/medium/pastel tiers with paper-like noise grain textures.

**Core principles:**
- Everything is tokenized — zero hardcoded values
- Storybook-first — every component built and documented in Storybook before page integration
- Progressive disclosure — actions appear on hover, not at rest
- Physically-realistic shadows — multi-layer shadows simulating real light
- Single CSS easing curve, two speeds — consistency across all CSS transitions (GSAP uses its own equivalent presets)
- Noise/grain as brand texture — CSS SVG feTurbulence on colored surfaces
- All colors in `rgb()`/`rgba()`/hex format — replacing existing oklch values
- Dark mode is **out of scope** for this redesign
- Remove `geist` font package dependency (replaced by DM Serif Display + Inter)

---

## 2. Tailwind v4 Integration Strategy

All design tokens are defined inside the `@theme inline {}` block in `src/index.css`. This makes them available as Tailwind utility classes automatically.

**Token → Tailwind mapping:**
- `--color-*` tokens → `bg-*`, `text-*`, `border-*` utilities (e.g., `--color-brand-mustard` → `bg-brand-mustard`)
- `--radius-*` tokens → `rounded-*` utilities
- `--shadow-*` tokens → `shadow-*` utilities
- `--font-*` tokens → `font-*` utilities

**Composite typography styles** (heading scales) are NOT individual Tailwind theme values. They are implemented as `@utility` classes:
```css
@utility text-h1 {
  font-family: var(--font-display);
  font-size: 48px;
  font-weight: 400;
  line-height: 1.1;
  letter-spacing: -1.44px;
}
```

**shadcn/ui token migration:** The existing shadcn tokens (`--color-primary`, `--color-secondary`, etc.) are remapped to our new system:
- `--color-primary` → `var(--color-base)` (near-black)
- `--color-primary-foreground` → `#FFFFFF`
- `--color-secondary` → `var(--surface-hover)`
- `--color-secondary-foreground` → `var(--text-primary)`
- `--color-muted` → `var(--surface-hover)`
- `--color-muted-foreground` → `var(--text-muted)`
- `--color-accent` → `var(--accent)`
- `--color-accent-foreground` → `#FFFFFF`
- `--color-destructive` → `var(--destructive)`
- `--color-border` → `var(--border-default)`
- `--color-input` → `var(--border-default)`
- `--color-ring` → `var(--accent)` (focus ring)
- `--color-background` → `var(--surface-page)`
- `--color-foreground` → `var(--text-primary)`
- `--color-card` → `var(--surface-card)`
- `--color-card-foreground` → `var(--text-primary)`

This preserves shadcn component compatibility — their internal className references continue to work without modification.

---

## 3. Design Tokens

### 2.1 Typography

| Token | Value | Usage |
|-------|-------|-------|
| `--font-display` | `'DM Serif Display', 'Georgia', serif` | Headings, hero text, folder titles, emphasis |
| `--font-body` | `'Inter', -apple-system, 'system-ui', sans-serif` | Body text, UI controls, labels, buttons |

**Heading scale (display font):**

| Token | Size | Weight | Line Height | Letter Spacing |
|-------|------|--------|-------------|----------------|
| `--text-h1` | 48px | 400 | 1.1 | -1.44px (-3%) |
| `--text-h2` | 36px | 400 | 1.15 | -1.08px (-3%) |
| `--text-h3` | 28px | 400 | 1.2 | -0.56px (-2%) |
| `--text-h4` | 22px | 400 | 1.25 | -0.44px (-2%) |

**Body scale (body font):**

| Token | Size | Weight | Line Height | Letter Spacing |
|-------|------|--------|-------------|----------------|
| `--text-body` | 16px | 400 | 1.5 | -0.16px |
| `--text-body-sm` | 14px | 400 | 1.43 | normal |
| `--text-ui` | 13px | 500 | 1.38 | normal |
| `--text-label` | 12px | 600 | 1.33 | -0.04px |
| `--text-section` | 14px | 500 | 1.4 | 0.56px (uppercase) |

### 2.2 Color System

**Base neutrals (opacity-based text hierarchy on single warm-black):**

| Token | Value | Usage |
|-------|-------|-------|
| `--color-base` | `rgb(26, 28, 30)` | Base color for all text |
| `--text-primary` | `rgba(26, 28, 30, 1.0)` | Headings, primary text |
| `--text-secondary` | `rgba(26, 28, 30, 0.85)` | Active labels |
| `--text-tertiary` | `rgba(26, 28, 30, 0.62)` | Secondary info |
| `--text-muted` | `rgba(26, 28, 30, 0.55)` | Metadata, timestamps |
| `--text-placeholder` | `rgba(26, 28, 30, 0.4)` | Inactive elements |
| `--text-disabled` | `rgba(26, 28, 30, 0.25)` | Disabled state |

**Surfaces:**

| Token | Value | Usage |
|-------|-------|-------|
| `--surface-page` | `#FCF9F7` | Page background (warm cream) |
| `--surface-card` | `#FFFFFF` | Cards, panels |
| `--surface-app` | `rgb(252, 253, 254)` | App chrome background |
| `--surface-hover` | `rgba(26, 28, 30, 0.04)` | Hover state fill |
| `--surface-active` | `rgba(26, 28, 30, 0.08)` | Active/selected fill |

**Borders:**

| Token | Value |
|-------|-------|
| `--border-default` | `rgba(26, 28, 30, 0.09)` |
| `--border-subtle` | `rgba(26, 28, 30, 0.05)` |

**Brand palette — Saturated (folder accents, status, categories):**

| Token | Hex | Name |
|-------|-----|------|
| `--brand-mustard` | `#D3A848` | Mustard |
| `--brand-forest` | `#5D9F55` | Forest Green |
| `--brand-maroon` | `#7D4D54` | Maroon |
| `--brand-crimson` | `#A11735` | Deep Red |
| `--brand-burnt-orange` | `#D25600` | Burnt Orange |
| `--brand-olive` | `#B8AC00` | Olive Gold |

**Brand palette — Medium (card fills, section tints):**

| Token | Hex | Name |
|-------|-----|------|
| `--brand-ice` | `#B9A8B6` | Ice Mauve |
| `--brand-emerald` | `#1AA53C` | Bright Green |
| `--brand-sand` | `#C7A898` | Warm Sand |
| `--brand-gold` | `#EEB834` | Golden |
| `--brand-lemon` | `#E4DC57` | Lemon |
| `--brand-peach` | `#E3C3B8` | Peach |

**Brand palette — Pastel (backgrounds, surface tints):**

| Token | Hex | Name |
|-------|-----|------|
| `--brand-pale-blue` | `#DBE5F0` | Pale Blue |
| `--brand-pale-green` | `#EBF0D6` | Pale Green |
| `--brand-lavender` | `#D7D8E8` | Lavender |
| `--brand-sage` | `#C8CAC0` | Sage |
| `--brand-pale-gold` | `#F0DAA7` | Pale Gold |
| `--brand-pale-yellow` | `#F0E587` | Pale Yellow |

**Accent (interactive elements):**

| Token | Value |
|-------|-------|
| `--accent` | `rgb(0, 136, 255)` |
| `--accent-bg` | `rgba(0, 136, 255, 0.12)` |
| `--accent-border` | `rgba(0, 136, 255, 0.4)` |
| `--destructive` | `rgb(255, 56, 60)` |

### 2.3 Spacing Scale

| Token | Value |
|-------|-------|
| `--space-1` | 4px |
| `--space-2` | 8px |
| `--space-3` | 12px |
| `--space-4` | 16px |
| `--space-5` | 20px |
| `--space-6` | 24px |
| `--space-8` | 32px |
| `--space-10` | 40px |
| `--space-12` | 48px |
| `--space-16` | 64px |

### 2.4 Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 6px | Small elements, links |
| `--radius-md` | 8px | Icon buttons, small controls |
| `--radius-lg` | 10px | Sidebar items, pills, tabs |
| `--radius-xl` | 12px | Document cards (editor view) |
| `--radius-2xl` | 16px | Grid cards, folder cards |
| `--radius-3xl` | 18px | Context menus, popovers |
| `--radius-full` | 9999px | Pill buttons, nav bar |

### 2.5 Shadows

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-card` | `0 8px 24px rgba(0,0,0,0.08), 0 8px 12px -6px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.03)` | Document page cards |
| `--shadow-block` | `0 50px 40px rgba(0,0,0,0.01), 0 50px 40px rgba(0,0,0,0.02), 0 20px 40px rgba(0,0,0,0.05), 0 3px 10px rgba(0,0,0,0.08)` | Feature blocks, elevated cards |
| `--shadow-popup` | `0 4px 9px rgba(0,0,0,0.07), 0 16px 16px rgba(0,0,0,0.06), 0 36px 22px rgba(0,0,0,0.04), 0 65px 26px rgba(0,0,0,0.01), 0 0 0 1px rgba(0,0,0,0.03)` | Frosted glass menus |
| `--shadow-subtle` | `0 4px 12px rgba(0,0,0,0.1)` | Hover cards |
| `--shadow-hover` | `0 20px 25px 4px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)` | Hover-elevated elements |

### 2.6 Transitions

| Token | Value | Usage |
|-------|-------|-------|
| `--ease` | `cubic-bezier(0.4, 0, 0.2, 1)` | Universal easing |
| `--duration-micro` | `0.15s` | Color, opacity, background |
| `--duration-normal` | `0.2s` | Transform, layout, structural |
| `--duration-slow` | `0.5s` | Glass transitions, page transitions |
| `--transition-colors` | `color var(--duration-micro) var(--ease), background var(--duration-micro) var(--ease)` | Text and background changes |
| `--transition-button` | `color var(--duration-micro) var(--ease), background var(--duration-micro) var(--ease), box-shadow var(--duration-micro) var(--ease), opacity var(--duration-micro) var(--ease)` | Full button transition |
| `--transition-transform` | `transform var(--duration-normal) var(--ease)` | Movement, scale |

---

## 3. Noise/Texture System

### 3.1 CSS SVG feTurbulence Paper Grain

```css
@utility noise-texture {
  position: relative;
  overflow: hidden;
}

/* Applied via a utility function that generates the data URI */
.noise-texture::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: var(--noise-opacity, 0.4);
  mix-blend-mode: multiply;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E");
  background-repeat: repeat;
  border-radius: inherit;
  z-index: 1;
}

/* Variants for different noise intensities */
@utility noise-light { --noise-opacity: 0.25; }
@utility noise-medium { --noise-opacity: 0.4; }
@utility noise-heavy { --noise-opacity: 0.55; }
```

Parameters exposed as tokens:
- `--noise-opacity`: 0.25 (light) / 0.4 (medium, default) / 0.55 (heavy)
- feTurbulence `baseFrequency`: 0.65 (paper grain feel)
- feTurbulence `numOctaves`: 4 (sufficient detail without performance cost)
- `stitchTiles="stitch"` ensures seamless tiling

### 4.2 Frosted Glass

```css
@utility frosted-glass {
  background: rgba(250, 250, 250, 0.85);
  backdrop-filter: saturate(1.5) blur(32px);
  -webkit-backdrop-filter: saturate(1.5) blur(32px);
}
```

Usage: context menus, popovers, dialog overlays, navigation overlay on scroll.

Note: This is a CSS utility class (`.frosted-glass`), not a CSS custom property.

---

## 4. Core Components

### 5.1 FolderCard (Projects)

The signature component — projects displayed as physical folders. **Replaces ProjectCard.tsx entirely** — must absorb all existing ProjectCard functionality.

**Structure:**
```
     ┌──────┐
     │ TAB  │                    ← Tab: 80px wide, 28px tall, saturated brand color + noise
┌────┴──────┴────────────────┐
│ □ Project Title             │  ← Icon + title in display font
│                             │  ← Folder body: pastel tint + noise texture
│                             │
│ APR 8, 2025            →   │  ← Date (small caps) + arrow + hover: ⋯ menu
└─────────────────────────────┘
```

**Folder tab geometry (CSS, not clip-path — built with a positioned div):**
```css
/* Tab is a separate div positioned above the folder body */
.folder-tab {
  position: absolute;
  top: -24px;
  left: var(--space-4); /* 16px from left */
  width: 80px;
  height: 28px;
  border-radius: var(--radius-sm) var(--radius-sm) 0 0; /* 6px top corners */
  /* Color set via inline style from color prop */
}

.folder-body {
  border-radius: var(--radius-2xl); /* 16px */
  min-height: 160px;
  padding: var(--space-5); /* 20px */
  position: relative;
}
```

The tab overlaps the body by 4px to create the visual connection. The overall card wrapper has `padding-top: 24px` to make room for the tab.

**Dimensions:**
- Card width: flexible (fills grid column)
- Card min-height: 160px (body only, tab adds 24px above)
- Tab: 80px × 28px
- Grid gap: `--space-5` (20px)

**Functionality (migrated from ProjectCard):**
- Click anywhere → navigates to `/projects/:projectId`
- Hover reveals `⋯` menu button (top-right, `--text-placeholder` color)
- `⋯` menu contains: Edit, Archive, Delete (uses existing DropdownMenu)
- Status badge: top-right area, uses Badge component with brand colors
- Video count: shown in footer area next to date
- Error state: subtle border change to `--destructive` + error icon

**Props interface:**
```typescript
interface FolderCardProps {
  project: Project;
  colorIndex: number; // 0-5, determines color pair
  onEdit: (project: Project) => void;
  onDelete: (project: Project) => void;
  onArchive: (project: Project) => void;
}
```

**Color assignment:** Derived from project creation order, NOT stored in DB. Algorithm: `colorIndex = projectIndex % 6` where projectIndex is the project's position in the user's project list sorted by creation date. No database schema changes needed.

| Index | Saturated (Tab) | Pastel (Body) |
|-------|-----------------|---------------|
| 0 | `--brand-mustard` | `--brand-pale-gold` |
| 1 | `--brand-forest` | `--brand-pale-green` |
| 2 | `--brand-maroon` | `--brand-lavender` |
| 3 | `--brand-crimson` | `--brand-peach` |
| 4 | `--brand-burnt-orange` | `--brand-pale-yellow` |
| 5 | `--brand-olive` | `--brand-sage` |

**Interactions:**
- Hover: `translateY(-2px)`, shadow from none → `--shadow-subtle`, brightness filter 1.02
- Click: `scale(0.98)` for 100ms then navigate
- Enter animation: GSAP staggered `fadeInUp` (y:20→0, opacity:0→1, duration:0.4s, stagger:0.08s, ease: power2.out)
- Menu button: opacity 0→1 on card hover, transition `--duration-micro`

**Responsive grid:**
- Mobile (`<640px`): 1 column
- Tablet (`640px-1023px`): 2 columns
- Desktop (`≥1024px`): 3 columns
- Uses Tailwind default breakpoints (`sm`, `md`, `lg`)

### 5.2 Navigation / App Shell

**methodex typemark:** DM Serif Display at 22px, weight 400, tracking -0.44px. Text-only wordmark reading "methodex" in `--text-primary`. No logo icon — the typography IS the brand. If a more distinctive mark is achievable, use a slight stylistic treatment on the "x" (e.g., italic or `--brand-burnt-orange` color accent).

**Sidebar (Craft docs app pattern):**
- Width: 288px
- Desktop (`≥1024px`): always visible, pushes content right
- Tablet/Mobile (`<1024px`): hidden by default, slides in as overlay on toggle, with semi-transparent backdrop
- Slide animation: `transform var(--duration-normal) var(--ease)` (translateX -288px → 0)
- Toggle button: hamburger icon in top bar on mobile
- Nav items: 32px height, `--radius-lg`, hover `--surface-hover`, active `--surface-active`
- Section headers: `--text-label`, `--text-muted`
- Progressive disclosure: "+" action buttons appear on item hover

**Sidebar content:**
- methodex typemark (top)
- "All Projects" link (navigates to /projects)
- Section: "Recent Projects" — list of 5 most recent projects as nav items
- Section: "Settings" — model settings link
- User avatar + name at bottom (Clerk user)

**Top bar (non-sidebar pages — landing, sign-in):**
- methodex typemark (left)
- Nav links (right)
- Glass-style on scroll: `frosted-glass` class applied when scrollY > 0
- Settings, user menu (right)

**Sidebar persists on:** All authenticated pages (Projects, ProjectDetail, VideoDetail)
**Top bar only on:** Landing page, sign-in page

### 4.3 Buttons

**Primary (black pill):**
- Background: `--color-base`
- Text: white
- Border radius: `--radius-full`
- Padding: 8px 16px
- Font: `--text-ui`
- Transition: `--transition-button`

**Secondary (outlined pill):**
- Background: transparent
- Border: 1px `--border-default`
- Border radius: `--radius-full`
- Transition: `--transition-button`

**Ghost:**
- Background: transparent
- Hover: `--surface-hover`
- Border radius: `--radius-md`

### 4.4 Cards (Generic)

- Background: `--surface-card`
- Border radius: `--radius-2xl`
- Shadow: none at rest (flat on warm background) OR `--shadow-card` when elevated
- Content padding: `--space-6`
- Hover: actions appear (progressive disclosure)

### 4.5 Context Menus / Popovers

- Frosted glass: `--frosted-glass` class
- Border radius: `--radius-3xl`
- Shadow: `--shadow-popup`
- Items: 32px height, `--text-ui`, padding 6px 8px
- Separator: 1px `--border-default`
- Destructive items: `--destructive` color

### 4.6 Dialogs / Modals

- Overlay: `rgba(0,0,0,0.3)`, fade-in
- Content: scale(0.9) + opacity 0 → scale(1) + opacity 1
- Background: `--surface-card`
- Border radius: `--radius-2xl`
- Shadow: `--shadow-popup`

### 5.7 Tabs

- Font: `--text-ui`
- Active: weight 600, `--text-secondary`
- Inactive: weight 500, `--text-placeholder` (0.4 opacity — visible but clearly secondary)
- Indicator: **pill background** — active tab gets `--surface-active` pill behind it (no bottom border)
- Transition: `--transition-colors` on text, `--transition-button` on pill

### 4.8 Badges

- Small: `--text-label`, padding 2px 8px
- Border radius: `--radius-sm`
- Use brand palette for category colors

### 4.9 VideoCard

- Within project detail: clean white card on warm background
- Thumbnail / icon, filename, duration, status badge
- Hover: action menu appears
- Border radius: `--radius-2xl`

### 4.10 TranscriptViewer

- Clean editor-like layout (inspired by Craft's document view)
- White card with `--shadow-card` on pastel background
- Word-level highlights using brand accent colors
- Speaker labels with brand palette colors
- Search: frosted glass input bar

### 4.11 Analysis Display Components

- Accordion pattern with brand-colored left borders
- Category badges using saturated brand colors
- Confidence indicators with opacity-based fills
- Evidence blocks in subtle pastel backgrounds

---

## 5. Page Layouts

### 5.1 Landing Page

- Hero: methodex typemark, warm pastel gradient background, serif heading
- Feature sections: each with distinct pastel background tint
- Glass CTA buttons
- Footer: near-black, rounded-3xl

### 5.2 Projects Page (Folder Grid)

- Warm cream background (`--surface-page`)
- Top: methodex typemark + "Create Project" button
- Grid: FolderCard components, responsive columns
- Empty state: warm, inviting illustration/text
- Staggered entrance animation

### 5.3 Project Detail Page

- Project "folder" header with color accent
- Video grid below (VideoCards within the folder metaphor)
- Cross-video analysis tabs with frosted glass style
- Analysis results in styled accordion cards

### 5.4 Video Detail Page

- Craft document-view inspired layout
- Video player in elevated white card
- Transcript viewer alongside/below
- Per-video analysis in tabbed accordion sections
- Right panel possible for metadata/settings

---

## 6. Animation Patterns

| Pattern | Implementation | Trigger |
|---------|---------------|---------|
| Card entrance | GSAP staggered fadeInUp (y:20 → 0, opacity:0 → 1) | Page load |
| Hover lift | CSS translateY(-2px) + shadow transition | Hover |
| Click feedback | CSS scale(0.98) → scale(1) | Active |
| Sidebar slide | CSS transform translateX | Toggle |
| Modal enter | CSS scale(0.9) + opacity → scale(1) + opacity 1 | Open |
| Modal exit | Reverse of enter | Close |
| Accordion expand | CSS max-height + opacity | Toggle |
| Progressive disclosure | CSS opacity 0 → 1 | Hover parent |
| Page transition | GSAP crossfade | Route change |
| Scroll reveal | GSAP ScrollTrigger fadeInUp | Scroll (landing page) |

---

## 7. Storybook Structure

All components documented with:
- Default story
- All variant stories (states, sizes, colors)
- Interactive controls
- Dark mode consideration (future)

```
stories/
├── Design System/
│   ├── Colors.stories.tsx
│   ├── Typography.stories.tsx
│   ├── Spacing.stories.tsx
│   ├── Shadows.stories.tsx
│   └── Noise.stories.tsx
├── Primitives/
│   ├── Button.stories.tsx
│   ├── Badge.stories.tsx
│   ├── Card.stories.tsx
│   ├── Input.stories.tsx
│   ├── Tabs.stories.tsx
│   ├── Dialog.stories.tsx
│   ├── DropdownMenu.stories.tsx
│   └── Accordion.stories.tsx
├── Components/
│   ├── FolderCard.stories.tsx
│   ├── VideoCard.stories.tsx
│   ├── TranscriptViewer.stories.tsx
│   ├── Navigation.stories.tsx
│   └── UploadManager.stories.tsx
└── Pages/
    ├── LandingPage.stories.tsx
    ├── ProjectsPage.stories.tsx
    ├── ProjectDetailPage.stories.tsx
    └── VideoDetailPage.stories.tsx
```

---

## 8. Implementation Architecture

### Agent Team Structure

| Agent | Worktree | Responsibility | Dependencies |
|-------|----------|---------------|-------------|
| **Design System** | `wt-design-system` | Tokens in index.css, noise utilities, global styles, typography setup, font loading | None |
| **Primitives** | `wt-primitives` | Button, Badge, Card, Input, Tabs, Dialog, DropdownMenu, Accordion — all restyled + Storybook stories | Design System |
| **FolderCard** | `wt-folder-card` | FolderCard component + Storybook story + all interactions | Design System, Primitives (Card, Badge) |
| **Navigation** | `wt-navigation` | Layout.tsx, sidebar, top bar, methodex typemark | Design System, Primitives (Button) |
| **Landing Page** | `wt-landing` | Complete landing page redesign | Design System, Primitives, Navigation |
| **Projects Page** | `wt-projects` | Projects grid with FolderCards | Design System, FolderCard, Navigation |
| **Detail Pages** | `wt-detail-pages` | ProjectDetail + VideoDetail + analysis components | All above |

### Merge Order

1. Design System → main
2. Primitives → main
3. FolderCard + Navigation → main (parallel, no conflicts)
4. Landing + Projects pages → main (parallel)
5. Detail Pages → main

### Quality Gates

Each agent's work must pass:
- Storybook stories render correctly
- TypeScript compiles clean
- All tokens reference design system variables (no hardcoded values)
- Consistent with spec (parent agent reviews)
- No regressions in existing functionality

---

## 9. Font Loading Strategy

```html
<!-- Google Fonts -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

Add to `index.html` with `display=swap` for performance.

---

## 10. File Changes Summary

**New files:**
- `src/components/ui/FolderCard.tsx` — new signature component
- `src/components/ui/FolderCard.stories.tsx`
- `src/components/Navigation/Sidebar.tsx` — new sidebar component
- `src/lib/noise.ts` — noise texture utilities
- `src/lib/design-tokens.ts` — token type definitions (optional)
- Design System Storybook stories (Colors, Typography, etc.)

**Major modifications:**
- `src/index.css` — complete theme rewrite
- `index.html` — font loading
- `src/components/Layout.tsx` — new app shell with sidebar
- `src/pages/LandingPage.tsx` — complete visual redesign
- `src/pages/ProjectsPage.tsx` — folder grid
- `src/pages/ProjectDetailPage.tsx` — folder detail view
- `src/pages/VideoDetailPage.tsx` — Craft editor-style layout
- All `src/components/ui/*.tsx` — restyled to design system
- All `src/components/analysis/*.tsx` — restyled with brand colors
- `src/components/projects/ProjectCard.tsx` → replaced by FolderCard
- `src/components/videos/VideoCard.tsx` — restyled

**Unchanged:**
- All hooks, services, contexts, types
- API layer, auth logic, routing structure
- Backend (no changes)

**Dependencies to remove:** `geist` (replaced by DM Serif Display + Inter via Google Fonts)

---

## 12. Missing UI Primitive Specs

All primitives follow the design token system. Here are specs for components not covered in Section 5:

### Input
- Height: 40px
- Border: 1px `--border-default`
- Border radius: `--radius-lg` (10px)
- Font: `--text-body` (16px)
- Padding: 0 `--space-3` (12px)
- Focus: border color → `--accent`, ring `0 0 0 2px var(--accent-bg)`
- Placeholder color: `--text-placeholder`
- Background: `--surface-card`
- Transition: `--transition-colors`

### Textarea
- Same as Input but min-height: 80px, padding: `--space-3`
- Resize: vertical only

### Label
- Font: `--text-body-sm` (14px), weight 500
- Color: `--text-primary`
- Margin bottom: `--space-1` (4px)

### Select
- Same height, border, radius as Input
- Chevron icon: `--text-placeholder` color
- Dropdown: uses `frosted-glass` class with `--shadow-popup`

### Progress
- Height: 6px
- Background: `--surface-hover`
- Fill: `--accent` (or brand color contextually)
- Border radius: `--radius-full`
- Transition: width `--duration-normal` `--ease`

### Tooltip
- Background: `--color-base` (near-black)
- Text: white, `--text-body-sm`
- Border radius: `--radius-md`
- Padding: `--space-1` `--space-2`
- Shadow: `--shadow-subtle`
- Enter: fade-in + scale(0.95→1), `--duration-micro`

### Separator
- Height: 1px
- Color: `--border-default`
- Margin: `--space-2` 0

### Skeleton
- Background: linear-gradient(90deg, `--surface-hover` 25%, `--surface-active` 50%, `--surface-hover` 75%)
- Background-size: 200% 100%
- Animation: shimmer 1.5s ease infinite
- Border radius: `--radius-md`

### Table
- Header: `--text-label`, `--text-muted` color, border-bottom `--border-default`
- Cells: `--text-body-sm`, padding `--space-3`
- Row hover: `--surface-hover`
- Transition: `--transition-colors`

### Toast (sonner)
- Background: `--surface-card`
- Border: 1px `--border-default`
- Border radius: `--radius-2xl`
- Shadow: `--shadow-card`
- Font: `--text-body-sm`
- Success icon: `--brand-forest`
- Error icon: `--destructive`

### UploadManager
- Fixed bottom-right position
- Card style: `--surface-card`, `--shadow-card`, `--radius-2xl`
- Progress bars: `--accent` fill, `--surface-hover` track
- File list: `--text-body-sm`, icon + filename + progress
- Complete state: checkmark with `--brand-forest` color
- Dismiss: fade-out after 3s on completion

---

## 13. Form Component Styling

All form dialogs (CreateProjectDialog, EditProjectDialog, ModelSettingsDialog, VideoUploadDialogSimple) use:
- Dialog component spec from Section 5.6
- Input/Textarea/Select/Label specs from Section 12
- Form layout: vertical stack with `--space-4` gap between fields
- Submit button: Primary (black pill)
- Cancel button: Ghost
- Drag-drop area (upload): dashed border `--border-default`, `--radius-2xl`, hover `--surface-hover` + solid border `--accent`

---

## 14. Z-Index Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--z-base` | 0 | Default content |
| `--z-noise` | 1 | Noise texture overlays |
| `--z-content` | 2 | Interactive content above noise |
| `--z-sticky` | 10 | Sticky headers |
| `--z-sidebar` | 50 | Sidebar |
| `--z-dropdown` | 60 | Dropdown menus, popovers |
| `--z-modal-backdrop` | 90 | Modal overlay |
| `--z-modal` | 100 | Modal content |
| `--z-toast` | 200 | Toast notifications |

---

## 15. Accessibility

### Focus Rings
- All interactive elements: `outline: 2px solid var(--accent)`, `outline-offset: 2px`
- Visible on `:focus-visible` only (not on click)
- Implemented via Tailwind: `focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2`

### Keyboard Navigation
- FolderCards: focusable with tabindex, Enter/Space to navigate, arrow keys for grid navigation
- Sidebar nav items: standard link/button focus behavior
- Progressive disclosure: hover-revealed actions also accessible via keyboard focus on parent

### Reduced Motion
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```
GSAP animations: check `window.matchMedia('(prefers-reduced-motion: reduce)').matches` before animating.

### Color Contrast
- All text on `--surface-page` (#FCF9F7): `--text-primary` (1.0) passes WCAG AAA
- `--text-muted` (0.55) on cream: contrast ~5.8:1 — passes AA
- `--text-placeholder` (0.4) on cream: contrast ~4.1:1 — passes AA for large text only. Use only for placeholder/decorative text, never for essential content.
- Brand saturated colors on white cards: all pass AA for large text (22px+). For smaller text, use on pastel backgrounds where contrast is not required (decorative folder surfaces).

### Icon System
- Continue using `lucide-react`
- Icon size: 16px for inline, 20px for buttons, 24px for navigation
- Stroke width: 2px (default)
- Color: inherits from parent text color

---

## 16. Responsive Breakpoints

Use Tailwind defaults:
| Breakpoint | Min-width | Usage |
|-----------|-----------|-------|
| `sm` | 640px | Mobile → tablet transition |
| `md` | 768px | Tablet adjustments |
| `lg` | 1024px | Sidebar always visible, desktop layout |
| `xl` | 1280px | Wide desktop |
| `2xl` | 1536px | Ultra-wide |

---

## 17. Auth Pages

SignIn page uses Clerk's `<SignIn>` component on warm cream `--surface-page` background with the methodex typemark centered above. No other custom styling — Clerk's default appearance is acceptable.

---

## 18. Shadow Usage Rules

| Context | Resting Shadow | Hover Shadow |
|---------|---------------|--------------|
| FolderCard | none | `--shadow-subtle` |
| VideoCard | none | `--shadow-subtle` |
| Document/Editor card | `--shadow-card` | (no change) |
| Feature block (landing) | `--shadow-block` | (no change) |
| Popovers/menus | `--shadow-popup` | (no change) |
| Buttons | none | (scale/color change only) |

Rule: Cards on `--surface-page` (warm cream) have **no resting shadow** — the cream/white contrast provides visual separation. Cards on `--surface-card` (white-on-white) use `--shadow-card` for separation.

---

## 19. GSAP vs CSS Transition Boundary

- **CSS transitions** for: hover states, focus states, color changes, opacity, simple transforms — anything with `--duration-micro` or `--duration-normal`
- **GSAP** for: staggered animations, scroll-triggered reveals, page transitions, complex sequenced animations, entrance animations
- GSAP easing presets (in `lib/animations.ts`): update `power2.out` to match the CSS cubic-bezier feel. Keep GSAP's `power2.out` (it's close enough to `cubic-bezier(0.4, 0, 0.2, 1)`)
- Remove `back.out(1.4)` (bounce) — not part of the new design language
- Keep `power1.out` for stagger ease
