# methodex Frontend Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completely redesign the frontend of the methodex qualitative research tool with Craft.do-inspired design language, tokenized design system, folder card metaphor, and polished interactions.

**Architecture:** Design system tokens defined in `index.css` via Tailwind v4 `@theme inline`. All existing shadcn/ui components restyled by remapping token values. New FolderCard signature component replaces ProjectCard. Sidebar navigation replaces header nav. All components documented in Storybook.

**Tech Stack:** React 19, Tailwind CSS v4 (inline theme), shadcn/ui (Radix), GSAP, DM Serif Display + Inter (Google Fonts), Storybook 10

**Spec:** `docs/superpowers/specs/2026-03-13-methodex-frontend-redesign.md`

---

## Chunk 1: Design System Foundation

> This chunk establishes the tokenized design system — the foundation everything else depends on. No component changes yet. After this chunk, the entire color palette, typography, spacing, shadows, and utility classes are in place.

### Task 1: Font Loading & index.html

**Files:**
- Modify: `frontend/index.html`

- [ ] **Step 1: Add Google Fonts preconnect and stylesheet links**

Replace the entire `index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>methodex</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Verify fonts load**

Run: `cd frontend && npm run dev`
Open browser, check Network tab: `DM+Serif+Display` and `Inter` font files should load.

- [ ] **Step 3: Commit**

```bash
git add frontend/index.html
git commit -m "feat: add DM Serif Display + Inter font loading"
```

---

### Task 2: Design System Tokens in index.css

**Files:**
- Modify: `frontend/src/index.css` (complete rewrite)

- [ ] **Step 1: Replace entire index.css with new design system**

```css
@import "tailwindcss";

@theme inline {
  /* ===== TYPOGRAPHY ===== */
  --font-display: 'DM Serif Display', 'Georgia', serif;
  --font-body: 'Inter', -apple-system, 'system-ui', sans-serif;

  /* ===== COLORS — Base neutrals (opacity-based hierarchy) ===== */
  --color-base: rgb(26, 28, 30);
  --color-base-90: rgba(26, 28, 30, 0.90);
  --color-base-85: rgba(26, 28, 30, 0.85);
  --color-base-62: rgba(26, 28, 30, 0.62);
  --color-base-55: rgba(26, 28, 30, 0.55);
  --color-base-40: rgba(26, 28, 30, 0.40);
  --color-base-25: rgba(26, 28, 30, 0.25);
  --color-base-09: rgba(26, 28, 30, 0.09);
  --color-base-05: rgba(26, 28, 30, 0.05);
  --color-base-04: rgba(26, 28, 30, 0.04);
  --color-base-08: rgba(26, 28, 30, 0.08);

  /* ===== COLORS — Surfaces ===== */
  --color-surface-page: #FCF9F7;
  --color-surface-card: #FFFFFF;
  --color-surface-app: #FCFDFE;

  /* ===== COLORS — shadcn/ui compatibility layer ===== */
  --color-background: #FCF9F7;
  --color-foreground: rgb(26, 28, 30);
  --color-card: #FFFFFF;
  --color-card-foreground: rgb(26, 28, 30);
  --color-popover: #FFFFFF;
  --color-popover-foreground: rgb(26, 28, 30);
  --color-primary: rgb(26, 28, 30);
  --color-primary-foreground: #FFFFFF;
  --color-secondary: rgba(26, 28, 30, 0.04);
  --color-secondary-foreground: rgb(26, 28, 30);
  --color-muted: rgba(26, 28, 30, 0.04);
  --color-muted-foreground: rgba(26, 28, 30, 0.55);
  --color-accent: rgba(26, 28, 30, 0.04);
  --color-accent-foreground: rgb(26, 28, 30);
  --color-destructive: rgb(255, 56, 60);
  --color-destructive-foreground: #FFFFFF;
  --color-border: rgba(26, 28, 30, 0.09);
  --color-input: rgba(26, 28, 30, 0.09);
  --color-ring: rgb(0, 136, 255);

  /* ===== COLORS — Accent ===== */
  --color-accent-blue: rgb(0, 136, 255);
  --color-accent-blue-bg: rgba(0, 136, 255, 0.12);
  --color-accent-blue-border: rgba(0, 136, 255, 0.4);

  /* ===== COLORS — Semantic status ===== */
  --color-success: #5D9F55;
  --color-success-foreground: #FFFFFF;
  --color-warning: #D3A848;
  --color-warning-foreground: #FFFFFF;
  --color-info: rgb(0, 136, 255);
  --color-info-foreground: #FFFFFF;

  /* ===== COLORS — Brand palette: Saturated (folder tabs, accents) ===== */
  --color-brand-mustard: #D3A848;
  --color-brand-forest: #5D9F55;
  --color-brand-maroon: #7D4D54;
  --color-brand-crimson: #A11735;
  --color-brand-burnt-orange: #D25600;
  --color-brand-olive: #B8AC00;

  /* ===== COLORS — Brand palette: Medium (card fills) ===== */
  --color-brand-ice: #B9A8B6;
  --color-brand-emerald: #1AA53C;
  --color-brand-sand: #C7A898;
  --color-brand-gold: #EEB834;
  --color-brand-lemon: #E4DC57;
  --color-brand-peach: #E3C3B8;

  /* ===== COLORS — Brand palette: Pastel (backgrounds) ===== */
  --color-brand-pale-blue: #DBE5F0;
  --color-brand-pale-green: #EBF0D6;
  --color-brand-lavender: #D7D8E8;
  --color-brand-sage: #C8CAC0;
  --color-brand-pale-gold: #F0DAA7;
  --color-brand-pale-yellow: #F0E587;

  /* ===== COLORS — Chart / data palette (analysis types) ===== */
  --color-chart-1: #3D8B8B;
  --color-chart-2: #D3A848;
  --color-chart-3: #7D4D9A;
  --color-chart-4: #5D9F55;
  --color-chart-5: #A11735;

  /* ===== BORDER RADIUS ===== */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 10px;
  --radius-xl: 12px;
  --radius-2xl: 16px;
  --radius-3xl: 18px;
  --radius-full: 9999px;

  /* ===== SHADOWS ===== */
  --shadow-subtle: 0 4px 12px rgba(0, 0, 0, 0.1);
  --shadow-card: 0 8px 24px rgba(0, 0, 0, 0.08), 0 8px 12px -6px rgba(0, 0, 0, 0.04), 0 0 0 1px rgba(0, 0, 0, 0.03);
  --shadow-block: 0 50px 40px rgba(0, 0, 0, 0.01), 0 50px 40px rgba(0, 0, 0, 0.02), 0 20px 40px rgba(0, 0, 0, 0.05), 0 3px 10px rgba(0, 0, 0, 0.08);
  --shadow-popup: 0 4px 9px rgba(0, 0, 0, 0.07), 0 16px 16px rgba(0, 0, 0, 0.06), 0 36px 22px rgba(0, 0, 0, 0.04), 0 65px 26px rgba(0, 0, 0, 0.01), 0 0 0 1px rgba(0, 0, 0, 0.03);
  --shadow-hover: 0 20px 25px 4px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);

  /* ===== Z-INDEX ===== */
  --z-base: 0;
  --z-noise: 1;
  --z-content: 2;
  --z-sticky: 10;
  --z-sidebar: 50;
  --z-dropdown: 60;
  --z-modal-backdrop: 90;
  --z-modal: 100;
  --z-toast: 200;

  /* ===== TRANSITIONS ===== */
  --ease: cubic-bezier(0.4, 0, 0.2, 1);
  --duration-micro: 0.15s;
  --duration-normal: 0.2s;
  --duration-slow: 0.5s;
}

/* ===== GLOBAL STYLES ===== */
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: var(--font-body);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background-color: var(--color-background);
  color: var(--color-foreground);
  font-size: 16px;
  line-height: 1.5;
  letter-spacing: -0.16px;
}

/* ===== TYPOGRAPHY UTILITIES ===== */
@utility text-h1 {
  font-family: var(--font-display);
  font-size: 48px;
  font-weight: 400;
  line-height: 1.1;
  letter-spacing: -1.44px;
}

@utility text-h2 {
  font-family: var(--font-display);
  font-size: 36px;
  font-weight: 400;
  line-height: 1.15;
  letter-spacing: -1.08px;
}

@utility text-h3 {
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 400;
  line-height: 1.2;
  letter-spacing: -0.56px;
}

@utility text-h4 {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 400;
  line-height: 1.25;
  letter-spacing: -0.44px;
}

@utility text-ui {
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.38;
}

@utility text-label {
  font-family: var(--font-body);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.33;
  letter-spacing: -0.04px;
}

@utility text-section {
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 500;
  line-height: 1.4;
  letter-spacing: 0.56px;
  text-transform: uppercase;
}

/* ===== NOISE TEXTURE UTILITIES ===== */
@utility noise-texture {
  position: relative;
  overflow: hidden;
}

@utility noise-light {
  --noise-opacity: 0.25;
}

@utility noise-medium {
  --noise-opacity: 0.4;
}

@utility noise-heavy {
  --noise-opacity: 0.55;
}

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
  z-index: var(--z-noise);
}

/* ===== FROSTED GLASS UTILITY ===== */
@utility frosted-glass {
  background: rgba(250, 250, 250, 0.85);
  backdrop-filter: saturate(1.5) blur(32px);
  -webkit-backdrop-filter: saturate(1.5) blur(32px);
}

/* ===== ANIMATIONS ===== */
@keyframes accordion-down {
  from { height: 0; }
  to { height: var(--radix-accordion-content-height); }
}

@keyframes accordion-up {
  from { height: var(--radix-accordion-content-height); }
  to { height: 0; }
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes scale-in {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes modal-enter {
  from { opacity: 0; transform: scale(0.9); }
  to { opacity: 1; transform: scale(1); }
}

/* ===== ACCESSIBILITY ===== */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 2: Verify the app still compiles and renders**

Run: `cd frontend && npm run build`
Expected: Build succeeds. The app may look different (token values changed) but should not crash.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat: replace design system tokens with methodex brand palette"
```

---

### Task 3: Update animations.ts

**Files:**
- Modify: `frontend/src/lib/animations.ts`

- [ ] **Step 1: Update GSAP presets to match new design language**

Replace the file content with updated presets. Remove `bounce` easing, update durations to match token system:

```typescript
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";

// Register GSAP plugins
gsap.registerPlugin(useGSAP);

// Design system easing presets (match CSS cubic-bezier(0.4, 0, 0.2, 1))
export const ease = {
  standard: "power2.out", // closest GSAP match to our CSS ease
  gentle: "power1.out",   // for stagger ease
  enter: "power2.out",    // entrance animations
} as const;

// Duration presets matching design tokens
export const duration = {
  micro: 0.15,   // matches --duration-micro
  normal: 0.2,   // matches --duration-normal
  slow: 0.5,     // matches --duration-slow
  entrance: 0.4, // card/page entrance animations
} as const;

// Reusable animation presets
export const animations = {
  fadeInUp: {
    y: 20,
    opacity: 0,
    duration: duration.entrance,
    ease: ease.standard,
  },
  fadeIn: {
    opacity: 0,
    duration: duration.normal,
    ease: ease.gentle,
  },
  scaleIn: {
    scale: 0.95,
    opacity: 0,
    duration: duration.normal,
    ease: ease.standard,
  },
  stagger: {
    each: 0.08,
    ease: ease.gentle,
  },
} as const;

// Check for reduced motion preference
export const prefersReducedMotion = (): boolean => {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/animations.ts
git commit -m "feat: update GSAP presets to match methodex design tokens"
```

---

### Task 4: Noise texture utility module

**Files:**
- Create: `frontend/src/lib/noise.ts`

- [ ] **Step 1: Create the noise utility module**

```typescript
/**
 * Noise texture utilities for the methodex design system.
 * Provides CSS class names and the folder color mapping.
 */

// Folder color pairs: saturated (tab) + pastel (body)
export const FOLDER_COLORS = [
  { tab: "var(--color-brand-mustard)", body: "var(--color-brand-pale-gold)", name: "mustard" },
  { tab: "var(--color-brand-forest)", body: "var(--color-brand-pale-green)", name: "forest" },
  { tab: "var(--color-brand-maroon)", body: "var(--color-brand-lavender)", name: "maroon" },
  { tab: "var(--color-brand-crimson)", body: "var(--color-brand-peach)", name: "crimson" },
  { tab: "var(--color-brand-burnt-orange)", body: "var(--color-brand-pale-yellow)", name: "burnt-orange" },
  { tab: "var(--color-brand-olive)", body: "var(--color-brand-sage)", name: "olive" },
] as const;

/** Get folder color pair by index (cycles through 6 colors) */
export function getFolderColor(index: number) {
  return FOLDER_COLORS[index % FOLDER_COLORS.length];
}

/** Noise texture intensity levels */
export type NoiseIntensity = "light" | "medium" | "heavy";

/** Get noise CSS classes */
export function getNoiseClasses(intensity: NoiseIntensity = "medium"): string {
  return `noise-texture noise-${intensity}`;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/noise.ts
git commit -m "feat: add noise texture utilities and folder color mapping"
```

---

### Task 5: Remove geist dependency

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Uninstall geist**

Run: `cd frontend && npm uninstall geist`

- [ ] **Step 2: Search for geist imports and remove them**

Run: `grep -r "geist" frontend/src/` — remove any import references found.

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: remove geist font dependency (replaced by DM Serif Display + Inter)"
```

---

### Task 6: Design System Storybook Stories

**Files:**
- Create: `frontend/src/stories/design-system/Colors.stories.tsx`
- Create: `frontend/src/stories/design-system/Typography.stories.tsx`
- Create: `frontend/src/stories/design-system/Shadows.stories.tsx`
- Create: `frontend/src/stories/design-system/Noise.stories.tsx`

- [ ] **Step 1: Create Colors story**

```tsx
import type { Meta, StoryObj } from "@storybook/react";

const BRAND_SATURATED = [
  { name: "Mustard", var: "--color-brand-mustard", hex: "#D3A848" },
  { name: "Forest", var: "--color-brand-forest", hex: "#5D9F55" },
  { name: "Maroon", var: "--color-brand-maroon", hex: "#7D4D54" },
  { name: "Crimson", var: "--color-brand-crimson", hex: "#A11735" },
  { name: "Burnt Orange", var: "--color-brand-burnt-orange", hex: "#D25600" },
  { name: "Olive", var: "--color-brand-olive", hex: "#B8AC00" },
];

const BRAND_PASTEL = [
  { name: "Pale Blue", var: "--color-brand-pale-blue", hex: "#DBE5F0" },
  { name: "Pale Green", var: "--color-brand-pale-green", hex: "#EBF0D6" },
  { name: "Lavender", var: "--color-brand-lavender", hex: "#D7D8E8" },
  { name: "Sage", var: "--color-brand-sage", hex: "#C8CAC0" },
  { name: "Pale Gold", var: "--color-brand-pale-gold", hex: "#F0DAA7" },
  { name: "Pale Yellow", var: "--color-brand-pale-yellow", hex: "#F0E587" },
];

function ColorSwatch({ name, cssVar, hex }: { name: string; cssVar: string; hex: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="w-20 h-20 rounded-xl noise-texture noise-medium"
        style={{ backgroundColor: hex }}
      />
      <span className="text-ui text-base-55">{name}</span>
      <code className="text-[10px] text-base-40">{hex}</code>
    </div>
  );
}

function ColorsPage() {
  return (
    <div className="p-8 bg-surface-page space-y-12">
      <div>
        <h2 className="text-h3 mb-6">Brand — Saturated</h2>
        <div className="flex gap-6 flex-wrap">
          {BRAND_SATURATED.map((c) => (
            <ColorSwatch key={c.name} name={c.name} cssVar={c.var} hex={c.hex} />
          ))}
        </div>
      </div>
      <div>
        <h2 className="text-h3 mb-6">Brand — Pastel</h2>
        <div className="flex gap-6 flex-wrap">
          {BRAND_PASTEL.map((c) => (
            <ColorSwatch key={c.name} name={c.name} cssVar={c.var} hex={c.hex} />
          ))}
        </div>
      </div>
    </div>
  );
}

const meta: Meta = {
  title: "Design System/Colors",
  component: ColorsPage,
};
export default meta;

type Story = StoryObj;
export const Default: Story = {};
```

- [ ] **Step 2: Create Typography story**

```tsx
import type { Meta, StoryObj } from "@storybook/react";

function TypographyPage() {
  return (
    <div className="p-8 bg-surface-page space-y-8">
      <div>
        <span className="text-label text-base-55 mb-2 block">text-h1 — DM Serif Display 48px</span>
        <h1 className="text-h1">The quick brown fox jumps</h1>
      </div>
      <div>
        <span className="text-label text-base-55 mb-2 block">text-h2 — DM Serif Display 36px</span>
        <h2 className="text-h2">The quick brown fox jumps</h2>
      </div>
      <div>
        <span className="text-label text-base-55 mb-2 block">text-h3 — DM Serif Display 28px</span>
        <h3 className="text-h3">The quick brown fox jumps</h3>
      </div>
      <div>
        <span className="text-label text-base-55 mb-2 block">text-h4 — DM Serif Display 22px</span>
        <h4 className="text-h4">The quick brown fox jumps</h4>
      </div>
      <hr className="border-border" />
      <div>
        <span className="text-label text-base-55 mb-2 block">Body — Inter 16px</span>
        <p>The quick brown fox jumps over the lazy dog. This is body text at the default size.</p>
      </div>
      <div>
        <span className="text-label text-base-55 mb-2 block">text-ui — Inter 13px/500</span>
        <p className="text-ui">UI text for buttons, controls, and navigation items</p>
      </div>
      <div>
        <span className="text-label text-base-55 mb-2 block">text-label — Inter 12px/600</span>
        <p className="text-label">Section labels and metadata</p>
      </div>
      <div>
        <span className="text-label text-base-55 mb-2 block">text-section — Inter 14px/500 uppercase</span>
        <p className="text-section">Section Header</p>
      </div>
    </div>
  );
}

const meta: Meta = {
  title: "Design System/Typography",
  component: TypographyPage,
};
export default meta;

type Story = StoryObj;
export const Default: Story = {};
```

- [ ] **Step 3: Create Shadows and Noise stories**

Create `Shadows.stories.tsx` showing all 5 shadow tokens as cards, and `Noise.stories.tsx` showing light/medium/heavy noise on each brand color.

- [ ] **Step 4: Verify Storybook renders**

Run: `cd frontend && npm run storybook`
Expected: Design System stories appear and render correctly.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/stories/
git commit -m "feat: add design system Storybook stories (colors, typography, shadows, noise)"
```

---

## Chunk 2: UI Primitives Restyling

> This chunk restyles all existing shadcn/ui components to use the new design tokens. No new components yet — just updating existing ones.

### Task 7: Restyle Button component

**Files:**
- Modify: `frontend/src/components/ui/Button.tsx`

- [ ] **Step 1: Update Button variants to match spec**

Replace the `buttonVariants` CVA definition (lines 5-30):

```typescript
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-ui transition-[color,background,box-shadow,opacity] duration-[var(--duration-micro)] ease-[var(--ease)] focus-visible:outline-2 focus-visible:outline-accent-blue focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground rounded-full hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground rounded-full hover:bg-destructive/90",
        outline: "border border-border bg-transparent rounded-full hover:bg-accent",
        secondary: "bg-secondary text-secondary-foreground rounded-lg hover:bg-base-08",
        ghost: "hover:bg-accent rounded-md",
        link: "text-foreground underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);
```

Key changes: pill-shaped default/outline/destructive (rounded-full), ghost is rounded-md, focus ring uses accent-blue, transition uses token values.

- [ ] **Step 2: Verify TypeScript compiles and Storybook renders**

Run: `cd frontend && npx tsc --noEmit && npm run storybook`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ui/Button.tsx
git commit -m "feat: restyle Button with methodex design tokens (pill shape, new focus ring)"
```

---

### Task 8: Restyle Card component

**Files:**
- Modify: `frontend/src/components/ui/Card.tsx`

- [ ] **Step 1: Update Card styling**

Update the Card component's base className to use new tokens:
- Card: `rounded-2xl bg-card text-card-foreground` (no shadow at rest — flat on warm bg)
- CardHeader: padding `p-5`
- CardTitle: `text-h4` utility class
- CardDescription: `text-sm text-base-55`
- CardContent: `px-5 pb-5`
- CardFooter: `flex items-center px-5 pb-5`

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ui/Card.tsx
git commit -m "feat: restyle Card with methodex tokens (rounded-2xl, no resting shadow)"
```

---

### Task 9: Restyle Badge component

**Files:**
- Modify: `frontend/src/components/ui/Badge.tsx`

- [ ] **Step 1: Update Badge variants**

Update CVA definition to use new tokens:
- Base: `text-label rounded-sm px-2 py-0.5 transition-[color,background] duration-[var(--duration-micro)] ease-[var(--ease)]`
- `default`: `bg-primary text-primary-foreground`
- `secondary`: `bg-base-04 text-base-62`
- `destructive`: `bg-destructive text-destructive-foreground`
- `outline`: `border border-border text-base-62`
- `success`: `bg-brand-forest text-white`
- `warning`: `bg-brand-mustard text-white`

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ui/Badge.tsx
git commit -m "feat: restyle Badge with methodex brand colors"
```

---

### Task 10: Restyle Dialog component

**Files:**
- Modify: `frontend/src/components/ui/Dialog.tsx`

- [ ] **Step 1: Update Dialog styling**

Update overlay and content styles:
- Overlay: `bg-black/30` (was black/80), animation `fade-in 0.15s`
- Content: `bg-card rounded-2xl shadow-popup`, animation `modal-enter 0.2s var(--ease)`
- Close button: `text-base-40 hover:text-base-85`
- Title: `text-h4`
- Description: `text-sm text-base-55`

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ui/Dialog.tsx
git commit -m "feat: restyle Dialog with frosted glass overlay and modal animation"
```

---

### Task 11: Restyle Tabs component

**Files:**
- Modify: `frontend/src/components/ui/Tabs.tsx`

- [ ] **Step 1: Update Tabs styling**

- TabsList: `bg-transparent flex gap-1`
- TabsTrigger: `text-ui font-medium text-base-40 rounded-lg px-3 py-1.5 transition-[color,background,box-shadow,opacity] duration-[var(--duration-micro)] ease-[var(--ease)] data-[state=active]:font-semibold data-[state=active]:text-base-85 data-[state=active]:bg-base-08`
- TabsContent: `mt-4`

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ui/Tabs.tsx
git commit -m "feat: restyle Tabs with pill indicator and opacity-based text"
```

---

### Task 12: Restyle Accordion component

**Files:**
- Modify: `frontend/src/components/ui/Accordion.tsx`

- [ ] **Step 1: Update Accordion styling**

- AccordionTrigger: `text-ui font-medium text-base-85 hover:text-foreground py-3 transition-[color] duration-[var(--duration-micro)]`
- AccordionContent: `text-sm text-base-62 pb-4`
- Remove heavy border styling, use subtle `border-b border-border`

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ui/Accordion.tsx
git commit -m "feat: restyle Accordion with subtle borders and opacity text"
```

---

### Task 13: Restyle DropdownMenu (frosted glass)

**Files:**
- Modify: `frontend/src/components/ui/DropdownMenu.tsx`

- [ ] **Step 1: Update DropdownMenu content styling**

- Content: `frosted-glass rounded-3xl shadow-popup z-[var(--z-dropdown)]`
- MenuItem: `text-ui h-8 px-2 rounded-md transition-[color,background] duration-[var(--duration-micro)] hover:bg-base-04`
- Separator: `h-px bg-base-09 mx-2`
- Destructive items: `text-destructive`

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ui/DropdownMenu.tsx
git commit -m "feat: restyle DropdownMenu with frosted glass and popup shadow"
```

---

### Task 14: Restyle remaining UI primitives (Input, Select, Textarea, Progress, Tooltip, Separator, Skeleton)

**Files:**
- Modify: `frontend/src/components/ui/Input.tsx`
- Modify: `frontend/src/components/ui/Select.tsx`
- Modify: `frontend/src/components/ui/Textarea.tsx`
- Modify: `frontend/src/components/ui/Progress.tsx`
- Modify: `frontend/src/components/ui/Tooltip.tsx`
- Modify: `frontend/src/components/ui/Separator.tsx`
- Modify: `frontend/src/components/ui/Skeleton.tsx`

- [ ] **Step 1: Update each component per spec Section 12**

Key changes:
- **Input**: h-10, rounded-lg, border-border, focus ring accent-blue, text-body, placeholder text-base-40
- **Textarea**: same as input but min-h-20, resize-y
- **Select**: same as input, chevron text-base-40, dropdown frosted-glass
- **Progress**: h-1.5, rounded-full, bg-base-04 track, accent-blue fill
- **Tooltip**: bg-primary text-white, rounded-md, text-body-sm, shadow-subtle, animation scale-in
- **Separator**: h-px bg-base-09
- **Skeleton**: linear gradient shimmer on bg-base-04/bg-base-08, rounded-md

- [ ] **Step 2: Verify all compile**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ui/
git commit -m "feat: restyle all UI primitives (Input, Select, Textarea, Progress, Tooltip, Separator, Skeleton)"
```

---

### Task 15: Storybook stories for all restyled primitives

**Files:**
- Update/create stories for all modified components

- [ ] **Step 1: Update existing stories to show new styling**

Each story should show all variants and states. Verify in Storybook.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ui/
git commit -m "feat: update Storybook stories for restyled UI primitives"
```

---

## Chunk 3: FolderCard Component

> The signature component. This replaces ProjectCard.

### Task 16: Create FolderCard component

**Files:**
- Create: `frontend/src/components/projects/FolderCard.tsx`
- Create: `frontend/src/components/projects/FolderCard.stories.tsx`

- [ ] **Step 1: Create the FolderCard component**

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDate } from "../../lib/utils";
import { getFolderColor } from "../../lib/noise";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import type { Project, ProjectStatus } from "../../types";
import {
  MoreHorizontal,
  Edit,
  Trash2,
  Archive,
  ArchiveRestore,
  AlertCircle,
  Video,
  ArrowRight,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/DropdownMenu";
import { DeleteProjectDialog } from "./DeleteProjectDialog";
import { EditProjectDialog } from "./EditProjectDialog";
import { useUpdateProject } from "../../hooks/useProjects";

interface FolderCardProps {
  project: Project;
  colorIndex: number;
}

const STATUS_BADGE_VARIANT: Record<ProjectStatus, "default" | "secondary" | "destructive" | "outline" | "success" | "warning"> = {
  planning: "secondary",
  ready: "secondary",
  processing: "warning",
  completed: "success",
  archived: "outline",
  error: "destructive",
};

export default function FolderCard({ project, colorIndex }: FolderCardProps) {
  const navigate = useNavigate();
  const { mutate: updateProject } = useUpdateProject();
  const videoCount = project.videos?.length || 0;
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const color = getFolderColor(colorIndex);

  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-dropdown-menu]")) return;
    navigate(`/projects/${project.id}`);
  };

  const handleArchiveToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (project.status === "archived") {
      updateProject({ id: project.id, data: { status: videoCount > 0 ? "ready" : "planning" } });
    } else {
      updateProject({ id: project.id, data: { status: "archived" } });
    }
  };

  return (
    <>
      <div
        className="relative cursor-pointer pt-6 group"
        onClick={handleCardClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            navigate(`/projects/${project.id}`);
          }
        }}
        style={{
          transition: `transform var(--duration-normal) var(--ease), box-shadow var(--duration-normal) var(--ease)`,
          transform: isHovered ? "translateY(-2px)" : "translateY(0)",
        }}
      >
        {/* Folder Tab */}
        <div
          className="absolute top-0 left-4 w-20 h-7 rounded-t-md noise-texture noise-medium"
          style={{ backgroundColor: color.tab }}
        >
          <span className="relative z-[2]" />
        </div>

        {/* Folder Body */}
        <div
          className="relative rounded-2xl min-h-[160px] p-5 noise-texture noise-light flex flex-col justify-between"
          style={{
            backgroundColor: color.body,
            boxShadow: isHovered ? "var(--shadow-subtle)" : "none",
          }}
        >
          {/* Content sits above noise layer */}
          <div className="relative z-[2]">
            {/* Top row: icon + title + menu */}
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-4 h-4 rounded border border-base-25 flex-shrink-0" />
                <h3 className="text-h4 truncate">{project.name}</h3>
              </div>

              <div className="flex items-center gap-2">
                {project.status !== "planning" && (
                  <Badge variant={STATUS_BADGE_VARIANT[project.status]}>
                    {project.status === "error" && <AlertCircle className="h-3 w-3 mr-1" />}
                    {project.status}
                  </Badge>
                )}

                {/* Menu — appears on hover */}
                <div
                  data-dropdown-menu
                  onClick={(e) => e.stopPropagation()}
                  className="transition-opacity duration-[var(--duration-micro)]"
                  style={{ opacity: isHovered ? 1 : 0 }}
                >
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Open menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setShowEditDialog(true); }}>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleArchiveToggle}>
                        {project.status === "archived" ? (
                          <><ArchiveRestore className="mr-2 h-4 w-4" />Unarchive</>
                        ) : (
                          <><Archive className="mr-2 h-4 w-4" />Archive</>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={(e) => { e.stopPropagation(); setShowDeleteDialog(true); }}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>

            {project.description && (
              <p className="text-sm text-base-55 line-clamp-2 mb-2">{project.description}</p>
            )}

            {project.status === "error" && project.error_message && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-md p-2 mb-2">
                <p className="text-xs text-destructive flex items-start gap-1">
                  <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  <span className="line-clamp-2">{project.error_message}</span>
                </p>
              </div>
            )}
          </div>

          {/* Bottom row: metadata + arrow */}
          <div className="relative z-[2] flex items-center justify-between mt-auto pt-3">
            <div className="flex items-center gap-3">
              <span className="text-label uppercase text-base-55">
                {formatDate(project.created_at)}
              </span>
              {videoCount > 0 && (
                <span className="flex items-center gap-1 text-label text-base-40">
                  <Video className="h-3 w-3" />
                  {videoCount}
                </span>
              )}
            </div>
            <ArrowRight className="h-4 w-4 text-base-40" />
          </div>
        </div>
      </div>

      <DeleteProjectDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        project={{ id: project.id, name: project.name, videoCount }}
      />
      <EditProjectDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        project={{ id: project.id, name: project.name, description: project.description, status: project.status }}
      />
    </>
  );
}
```

- [ ] **Step 2: Create Storybook story**

```tsx
import type { Meta, StoryObj } from "@storybook/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import FolderCard from "./FolderCard";

const queryClient = new QueryClient();

const mockProject = {
  id: "1",
  user_id: "user1",
  name: "Daily Notes",
  description: "Research observations from field studies",
  status: "ready" as const,
  error_message: null,
  created_at: "2025-04-08T00:00:00Z",
  updated_at: "2025-04-08T00:00:00Z",
  videos: [{ id: "v1" }, { id: "v2" }] as any[],
};

const meta: Meta<typeof FolderCard> = {
  title: "Components/FolderCard",
  component: FolderCard,
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <div className="p-8 bg-surface-page">
            <div className="grid grid-cols-3 gap-5 max-w-4xl">
              <Story />
            </div>
          </div>
        </MemoryRouter>
      </QueryClientProvider>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof FolderCard>;

export const Default: Story = {
  args: { project: mockProject, colorIndex: 0 },
};

export const AllColors: Story = {
  render: () => (
    <>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <FolderCard
          key={i}
          project={{ ...mockProject, id: String(i), name: ["Daily Notes", "Journal", "Milestones", "Music", "Wellness Tracker", "Client Notes"][i] }}
          colorIndex={i}
        />
      ))}
    </>
  ),
};

export const ErrorState: Story = {
  args: {
    project: { ...mockProject, status: "error" as const, error_message: "Analysis pipeline failed at step 3" },
    colorIndex: 3,
  },
};

export const Archived: Story = {
  args: {
    project: { ...mockProject, status: "archived" as const },
    colorIndex: 2,
  },
};
```

- [ ] **Step 3: Verify Storybook renders all stories**

Run: `cd frontend && npm run storybook`
Expected: FolderCard appears with colored tabs, noise texture, hover effects.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/projects/FolderCard.tsx frontend/src/components/projects/FolderCard.stories.tsx
git commit -m "feat: create FolderCard component with folder tab, noise texture, and color system"
```

---

## Chunk 4: Navigation & Layout

### Task 17: Create Sidebar component

**Files:**
- Create: `frontend/src/components/navigation/Sidebar.tsx`

- [ ] **Step 1: Create Sidebar with nav items**

Build sidebar with:
- methodex typemark at top
- "All Projects" link
- Recent projects section (from props)
- Settings link
- User info at bottom (Clerk UserButton)
- Mobile: overlay with backdrop, slides from left
- Desktop: always visible, 288px

- [ ] **Step 2: Create Storybook story**
- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/navigation/
git commit -m "feat: create Sidebar navigation component"
```

---

### Task 18: Rebuild Layout.tsx

**Files:**
- Modify: `frontend/src/components/Layout.tsx`

- [ ] **Step 1: Replace header layout with sidebar + content layout**

The Layout should:
- Render Sidebar (always visible on desktop, toggleable on mobile)
- Main content area pushed right by 288px on desktop
- Warm cream background
- UploadManager stays as-is (global toast)

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/Layout.tsx
git commit -m "feat: rebuild Layout with sidebar navigation"
```

---

## Chunk 5: Page Redesigns

### Task 19: Redesign ProjectsPage

**Files:**
- Modify: `frontend/src/pages/ProjectsPage.tsx`

- [ ] **Step 1: Replace ProjectCard with FolderCard**

Update imports, replace ProjectCard with FolderCard. Pass `colorIndex={index}` from the map. Update grid classes:
- `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5`
- Warm cream background
- GSAP staggered entrance animation on cards
- Empty state with inviting text in display font

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/ProjectsPage.tsx
git commit -m "feat: redesign ProjectsPage with FolderCard grid"
```

---

### Task 20: Redesign LandingPage

**Files:**
- Modify: `frontend/src/pages/LandingPage.tsx`

- [ ] **Step 1: Complete visual redesign**

Key sections:
- Hero: warm pastel gradient bg, methodex typemark, serif heading "Your research, beautifully organized", glass CTA button
- Features: 3 cards with pastel backgrounds and noise texture, serif titles
- How it works: numbered steps with brand colors
- Footer: near-black bg, rounded-3xl, light text

Uses GSAP ScrollTrigger for scroll-reveal animations on sections.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/LandingPage.tsx
git commit -m "feat: redesign LandingPage with methodex brand identity"
```

---

### Task 21: Redesign ProjectDetailPage

**Files:**
- Modify: `frontend/src/pages/ProjectDetailPage.tsx`

- [ ] **Step 1: Add folder-themed header with project color**

Project detail shows a header band in the project's folder color (pastel + noise), with the project name in display font. Videos below in styled VideoCards. Analysis tabs use new Tabs component.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/ProjectDetailPage.tsx
git commit -m "feat: redesign ProjectDetailPage with folder-themed header"
```

---

### Task 22: Redesign VideoDetailPage

**Files:**
- Modify: `frontend/src/pages/VideoDetailPage.tsx`

- [ ] **Step 1: Craft document-view inspired layout**

Video player in elevated white card with shadow-card. Transcript viewer below/alongside in clean white panel. Analysis tabs styled with new components. Warm cream background.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/VideoDetailPage.tsx
git commit -m "feat: redesign VideoDetailPage with Craft editor-style layout"
```

---

### Task 23: Restyle VideoCard

**Files:**
- Modify: `frontend/src/components/videos/VideoCard.tsx`

- [ ] **Step 1: Update styling**

White card on cream bg, rounded-2xl, no resting shadow, hover reveals menu, hover adds shadow-subtle + translateY(-1px). Status badges use brand colors.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/videos/VideoCard.tsx
git commit -m "feat: restyle VideoCard with methodex design tokens"
```

---

### Task 24: Restyle Analysis Display Components

**Files:**
- Modify all 8 files in `frontend/src/components/analysis/`

- [ ] **Step 1: Update all analysis list components**

Apply brand palette for type indicators:
- Quote chunks: `--brand-forest` left border
- Fact chunks: `--brand-mustard` left border
- Context chunks: `--brand-maroon` left border
- Observation chunks: `--brand-olive` left border

Accordions use restyled Accordion component. Badges use brand colors. Confidence bars use Progress component.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/analysis/
git commit -m "feat: restyle analysis display components with brand palette"
```

---

## Chunk 6: Polish & Verification

### Task 25: Restyle form dialogs

**Files:**
- Modify: `frontend/src/components/projects/CreateProjectDialog.tsx`
- Modify: `frontend/src/components/projects/EditProjectDialog.tsx`
- Modify: `frontend/src/components/projects/DeleteProjectDialog.tsx`
- Modify: `frontend/src/components/settings/ModelSettingsDialog.tsx`
- Modify: `frontend/src/components/videos/VideoUploadDialogSimple.tsx`

- [ ] **Step 1: Update all dialogs to use new Dialog styling**

Dialogs inherit from restyled Dialog component. Verify form layouts use vertical stack with gap-4. Submit → primary pill. Cancel → ghost.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/projects/ frontend/src/components/settings/ frontend/src/components/videos/
git commit -m "feat: restyle all form dialogs with methodex design tokens"
```

---

### Task 26: Restyle TranscriptViewer

**Files:**
- Modify: `frontend/src/components/videos/TranscriptViewer.tsx`

- [ ] **Step 1: Update styling**

White card with shadow-card. Search bar uses frosted-glass. Word highlights use accent colors. Speaker labels use brand palette. Clean, editor-like feel.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/videos/TranscriptViewer.tsx
git commit -m "feat: restyle TranscriptViewer with Craft editor-style layout"
```

---

### Task 27: Full integration test

- [ ] **Step 1: Run full build**

Run: `cd frontend && npm run build`
Expected: Build succeeds with zero errors.

- [ ] **Step 2: Run TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Run existing tests**

Run: `cd frontend && npm run test`
Expected: All existing tests pass.

- [ ] **Step 4: Visual review in Storybook**

Run: `cd frontend && npm run storybook`
Verify all stories render with consistent design language.

- [ ] **Step 5: Visual review in dev server**

Run: `cd frontend && npm run dev`
Navigate through all pages: Landing → Sign In → Projects → Project Detail → Video Detail.
Verify:
- Warm cream backgrounds throughout
- DM Serif Display headings, Inter body text
- Folder cards with colored tabs and noise texture
- Frosted glass menus and dialogs
- Smooth hover transitions
- Sidebar navigation on authenticated pages
- No hardcoded colors or fonts

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "feat: complete methodex frontend redesign"
```
