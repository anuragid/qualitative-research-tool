# Design System Comparative Analysis
## Methodex (shadcn/ui) vs. Shopify Polaris vs. Google Material Web

**Date:** 2026-03-15
**Purpose:** Deep comparative analysis to identify gaps, strengths, and improvement opportunities in our design system approach.

> **Note:** We will NOT adopt Polaris or Material components. This analysis informs how to improve our shadcn/ui-based system using lessons from these mature design systems.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Token Architecture](#2-token-architecture)
3. [Color System](#3-color-system)
4. [Typography](#4-typography)
5. [Spacing & Layout](#5-spacing--layout)
6. [Component Architecture](#6-component-architecture)
7. [Theming & Customization](#7-theming--customization)
8. [Accessibility](#8-accessibility)
9. [Animation & Motion](#9-animation--motion)
10. [Responsive Design](#10-responsive-design)
11. [Testing](#11-testing)
12. [Documentation & Guidelines](#12-documentation--guidelines)
13. [Migration & Tooling](#13-migration--tooling)
14. [Scorecard](#14-scorecard)
15. [What We Got Right](#15-what-we-got-right)
16. [Critical Gaps](#16-critical-gaps)
17. [Recommendations](#17-recommendations)

---

## 1. Executive Summary

### The Three Systems at a Glance

| Dimension | Methodex (Ours) | Polaris (Shopify) | Material Web (Google) |
|-----------|----------------|-------------------|----------------------|
| **Tech Stack** | React 19 + Tailwind v4 + Radix UI + shadcn/ui | React + CSS Modules + Radix-like primitives | Lit Web Components + Sass |
| **Token Count** | ~80 CSS variables | 453 tokens | ~252 system + 2000+ component tokens |
| **Components** | 16 base UI + ~30 domain | 122 components | 30 stable + 9 labs |
| **Styling** | Tailwind utilities + CVA | CSS Modules + CSS vars | Sass -> CSS -> Lit constructable stylesheets |
| **Token Enforcement** | None | Stylelint plugin (10 categories) | Sass compile-time validation |
| **Documentation** | Storybook stories only | Full docs site + MDX + guidelines | Auto-generated API docs + catalog site |
| **Testing** | Vitest + Storybook | Jest + @shopify/react-testing (~27,500 lines) | Jasmine + Web Test Runner + Playwright |
| **Migration Tooling** | None | 47 codemods across 6 major versions | 2 migration utilities |
| **A11y Depth** | Basic (focus rings, touch targets) | Systematic (ARIA, i18n, focus traps) | Comprehensive (ARIA delegation, soft-disabled, form internals) |

### Bottom Line

Our system has a **strong visual foundation** -- good color palette, thoughtful typography, nice motion system. But compared to Polaris and Material, we are significantly behind in **structural maturity**: token governance, documentation depth, accessibility rigor, and developer guardrails. The good news: these are all fixable without changing our technology choices.

---

## 2. Token Architecture

### How Each System Structures Tokens

#### Methodex (Ours)
- **Format:** CSS custom properties defined inline in `src/index.css` via Tailwind v4 `@theme` block
- **Organization:** Flat list of ~80 variables grouped by comments (colors, surfaces, radii, shadows, z-index, animation)
- **Naming:** Mix of conventions -- `--color-surface-card`, `--color-base-85`, `--color-brand-mustard`, `--radius-md`, `--shadow-card`
- **Layers:** Single layer -- all tokens are at the same level

#### Polaris
- **Format:** TypeScript source -> CSS/SCSS/JS output via build pipeline
- **Organization:** 11 token groups (color, text, font, shadow, motion, space, height, width, border, zIndex, breakpoints)
- **Naming:** Strict convention: `--p-{group}-{name}` (e.g., `--p-color-bg-fill-brand`, `--p-space-400`)
- **Layers:** Three layers:
  1. **Primitives** (raw color scales, size values -- not exposed)
  2. **Base theme tokens** (453 semantic tokens as `--p-*`)
  3. **Component-private tokens** (`--pc-*` for internal component use)
- **Enforcement:** `stylelint-polaris` validates token usage across 10 categories, blocking raw values

#### Material Web
- **Format:** Sass maps with `values()` functions -> CSS custom properties
- **Organization:** Three-tier hierarchy: Reference (`--md-ref-*`) -> System (`--md-sys-*`) -> Component (`--md-{component}-*`)
- **Naming:** `--md-{scope}-{category}-{name}` (e.g., `--md-sys-color-primary`, `--md-filled-button-container-color`)
- **Layers:** Three layers with dependency injection:
  1. **Reference tokens** (91 palette values, 5 typeface values)
  2. **System tokens** (~252 role-based tokens)
  3. **Component tokens** (20-95 per component, 2000+ total)
- **Enforcement:** Compile-time Sass validation errors on invalid token names

### Gap Analysis: Tokens

| What | Ours | Polaris | Material | Gap Severity |
|------|------|---------|----------|-------------|
| Token count | ~80 | 453 | 252+ system | **Medium** -- we're missing many semantic tokens |
| Naming consistency | Mixed conventions | Strict `--p-*` system | Strict `--md-*` hierarchy | **High** -- inconsistent names hurt adoption |
| Primitive/semantic separation | None -- all flat | Yes -- 3 layers | Yes -- 3 tiers | **High** -- makes theming fragile |
| Component-scoped tokens | None | Yes (`--pc-*`) | Yes (`--_*` private) | **Medium** -- components use Tailwind directly |
| Token enforcement | None | Stylelint plugin | Sass compile-time | **High** -- nothing prevents raw values |
| Build pipeline for tokens | None -- inline CSS | TS -> CSS/SCSS/JS | Sass -> CSS -> TS | **Low** -- Tailwind v4 handles this |
| Token documentation | None | Auto-generated reference | Auto-generated docs | **Medium** |

### Key Insight: The Two-Layer Pattern

Both Polaris and Material implement a **two-layer custom property pattern**:
- **Public tokens** that consumers can set (theming API)
- **Private tokens** used internally by components

Polaris: `--p-color-bg-fill-brand` (public) -> `--pc-button-bg` (private)
Material: `--md-filled-button-container-color` (public) -> `--_container-color` (private in Shadow DOM)

We don't have this pattern. Our components reference Tailwind classes directly, meaning there's no clean customization API and no insulation between design system changes and component internals.

---

## 3. Color System

### Palette Comparison

| Aspect | Methodex | Polaris | Material |
|--------|----------|---------|----------|
| **Base approach** | Opacity-based neutral scale + named brand colors | 15 palettes x 16-step tonal scale (242 primitives) | 6 palettes x 13-24 tone steps (91 primitives) |
| **Semantic colors** | ~12 surface/border tokens + 6 brand + 6 pastel + 5 chart | 226 semantic color tokens | 50 color role tokens |
| **Color roles** | Destructive, success, warning, info, accent-blue | brand, info, success, caution, warning, critical, emphasis, magic | primary, secondary, tertiary, error + containers |
| **Surface system** | 3 surfaces (page, card, app) | 95 background tokens (surface vs. fill distinction) | 9 surface containers (lowest through highest) |
| **"On" colors** | None explicit | Yes -- `text-*-on-bg-fill` for every fill | Yes -- `on-primary`, `on-surface`, etc. |
| **Dark mode** | Full dark mode via `.dark` class | 4 themes (light, dark-experimental, mobile, high-contrast) | Light/dark via tone inversion (same palette, different tones) |
| **Contrast management** | None formal | Explicit contrast-pairing tokens + high-contrast theme | Tonal system guarantees contrast by construction |
| **Data visualization** | 5-color chart palette | Not in token system | Not in token system |

### What We Got Right
- **Opacity-based neutrals** are elegant and produce natural hierarchies
- **Brand palette** (mustard, forest, maroon, crimson, burnt-orange, olive) is distinctive
- **Three-tier brand colors** (saturated for tabs, medium for fills, pastel for backgrounds) shows good design thinking
- **Dark mode** works well with both `.dark` class toggle and system preference

### What We're Missing
1. **No explicit "on" colors** -- when you have a colored background, there's no token guaranteeing the text color has sufficient contrast. Polaris has `text-critical-on-bg-fill` (guaranteed readable on critical fill); Material has `on-primary`, `on-error`, etc. We have nothing.
2. **Surface vs. fill distinction** -- Polaris separates large surfaces (`bg-surface-*`) from small interactive elements (`bg-fill-*`). This enables different visual treatment for cards vs. buttons using the same semantic role.
3. **No state modifiers** -- No `hover`, `active`, `disabled` variants of semantic colors. We rely on Tailwind's opacity modifiers (`hover:opacity-80`), which is less precise.
4. **No high-contrast theme** -- Important for accessibility compliance.
5. **Limited surface hierarchy** -- 3 surfaces vs. Polaris's 95 background tokens or Material's 9-level surface container system.

---

## 4. Typography

### Type Scale Comparison

| Aspect | Methodex | Polaris | Material |
|--------|----------|---------|----------|
| **Font stack** | DM Serif Display (headings) + Inter (body) | Inter (everything) | Roboto (brand + plain) |
| **Display font** | Yes (serif for headings) | No -- single font family | Brand typeface for display/headline |
| **Scale definition** | 9 utilities via `@utility` blocks | 11 variants x 5 properties = 55 tokens | 15 scales x 4 properties = 62 tokens |
| **Responsive type** | CSS `clamp()` for fluid sizing | Mobile theme overrides (bump sizes up 1 step) | No responsive type tokens |
| **Letter spacing** | Per-utility, negative for headings | 4 tokens (densest to normal) | Part of typescale but unsupported in CSS API |
| **Composite tokens** | No -- each property separate in utilities | Yes -- `text-heading-lg-font-size`, etc. | Yes -- `display-large-size`, etc. |
| **Minimum sizes** | Not enforced | `body-xs` = 11px | `label-small` = 11px |

### What We Got Right
- **Dual font stack** (DM Serif Display + Inter) creates visual hierarchy that neither Polaris nor Material achieves with their single-family systems
- **Fluid typography** via `clamp()` is more elegant than Polaris's mobile-theme override approach
- **Careful letter-spacing** (negative for large text, positive for small UI labels) matches professional typography practice

### What We're Missing
1. **No composite type tokens** -- Polaris defines complete typography "recipes" (font + size + weight + line-height + letter-spacing) as named variants. Our utilities define these individually, making it easy for developers to mix and match incorrectly.
2. **No formal type scale** -- Our sizes (text-h1 through text-body-sm) cover the basics but lack the semantic richness of Polaris's 11 variants or Material's 15. We have no equivalent of `label-medium`, `title-small`, or `body-xs`.
3. **No type tokens** -- Our typography lives in `@utility` blocks, not as CSS custom properties. This means they can't be overridden via theming.

---

## 5. Spacing & Layout

### Spacing System Comparison

| Aspect | Methodex | Polaris | Material |
|--------|----------|---------|----------|
| **Base grid** | Standard Tailwind (4px base) | 4px base grid (100=4px, 200=8px, ...) | 8px informal grid |
| **Token count** | 0 custom (Tailwind defaults) | 22 tokens (18 scale + 4 semantic aliases) | 0 formal tokens (hardcoded per-component) |
| **Semantic spacing** | None | `space-card-gap`, `space-card-padding`, `space-table-cell-padding`, `space-button-group-gap` | None |
| **Responsive spacing** | Tailwind `sm:`, `lg:` modifiers | `ResponsiveProp<SpaceScale>` type + per-breakpoint CSS vars | None |
| **Height/width tokens** | None | 20 each (0 through 3200) | None |

### Key Insight

Polaris's **semantic spacing aliases** are powerful: `space-card-padding` means every card in the system uses the same padding, and changing it updates all cards. We rely on developers remembering to use `p-4` or `p-6` consistently -- there's no enforcement.

Material Web notably has **no formal spacing tokens** either, relying on per-component hardcoded values. This is a recognized gap (tracked as bug b/198759625).

### What We're Missing
1. **Semantic spacing tokens** -- `--space-card-padding`, `--space-section-gap`, etc.
2. **Size tokens for interactive elements** -- Polaris has height/width scales ensuring consistent sizing
3. **Spacing enforcement** -- Nothing prevents a developer from using `p-3` instead of the intended `p-4`

---

## 6. Component Architecture

### Architecture Patterns Comparison

| Pattern | Methodex | Polaris | Material |
|---------|----------|---------|----------|
| **Variant system** | CVA (class-variance-authority) | CSS Module class + `--pc-*` vars | Separate element per variant |
| **Composition** | Radix primitives + multi-part exports | Static property compound components (`Modal.Section`) | Slot-based composition (Web Components) |
| **Styling** | Tailwind utilities via `cn()` | CSS Modules + `classNames()` | Constructable stylesheets (Shadow DOM) |
| **Props API** | Standard React props | Token-typed props (`SpaceScale`, `ColorBackgroundAlias`) | Lit `@property()` decorators |
| **Action pattern** | None | Action descriptors (`{content, onAction}`) + `buttonFrom()` | Standard events |
| **Context system** | ThemeProvider only | 8+ nested context providers in AppProvider | None (Web Components) |
| **Primitive layer** | `cn()` utility only | Box, Text, InlineStack, BlockStack primitives | None -- components are self-contained |
| **Form integration** | HTML5 form controls | Labelled wrapper + Connected pattern | Form Associated Custom Elements (FACE) API |

### What We Got Right
1. **CVA for variants** is well-regarded in the React ecosystem and produces clean, predictable variant APIs
2. **Radix UI primitives** give us solid accessibility foundations for free (dialog, dropdown, accordion, etc.)
3. **`cn()` utility** (clsx + tailwind-merge) is the standard approach for Tailwind component libraries

### What We're Missing

#### 1. Token-Typed Props (High Impact)
Polaris props accept **only valid design tokens**:
```tsx
// Polaris: TypeScript errors if you pass an invalid token
<Box padding="400" background="bg-surface-critical" />

// Ours: Any Tailwind class works, no guardrails
<div className="p-4 bg-red-50" />
```
This is perhaps the single most impactful difference. Token-typed props make the design system **self-enforcing** at the TypeScript level.

#### 2. Layout Primitives (High Impact)
Polaris has `Box`, `InlineStack`, `BlockStack` as typed layout primitives that accept only token values. We have no equivalent -- developers use raw Tailwind `flex`, `gap-*`, etc.

#### 3. Compound Component Pattern (Medium Impact)
Polaris: `<Modal.Section>`, `<Layout.AnnotatedSection>`, `<Navigation.Item>`
Ours: Components are standalone, composed via children

The compound pattern provides better discoverability and enforces correct composition. However, shadcn/ui intentionally avoids this pattern in favor of explicit composition, which has its own advantages.

#### 4. Context-Aware Rendering (Medium Impact)
Polaris components change their rendering based on context:
- `Banner` renders differently inside a `Card` vs. standalone
- `Badge` adjusts when inside a filter
- This is handled via `WithinContentContext`, `BannerContext`, etc.

We have no context-aware component adaptation.

#### 5. Action Descriptor Pattern (Low Impact)
Polaris: `<Modal primaryAction={{ content: 'Save', onAction: handleSave }} />`
Ours: `<Button onClick={handleSave}>Save</Button>` passed as children

The action descriptor is more concise for modal/page patterns but less flexible. Not a critical gap.

---

## 7. Theming & Customization

### Theming Comparison

| Aspect | Methodex | Polaris | Material |
|--------|----------|---------|----------|
| **Theme switching** | `.dark` class on `<html>` + localStorage | Theme class on `<html>` via AppProvider | CSS custom properties (no framework) |
| **System preference** | Yes (`prefers-color-scheme` listener) | Yes (via ThemeProvider) | Manual (app implements media query) |
| **Nested themes** | No | Yes (ThemeProvider renders themed `<div>`) | Yes (CSS inheritance through DOM) |
| **Theme variants** | 2 (light/dark) | 4 (light, dark, mobile, high-contrast) | 2 (light/dark) + dynamic color |
| **Custom themes** | Requires editing `index.css` | Partial override deep-merge | Inject different reference palette |
| **Customization API** | Override CSS vars manually | Override `--p-*` vars | Override `--md-*` vars (compile-time validated) |
| **Mobile theme** | None | Yes -- larger type, simplified shadows | None |
| **High-contrast** | None | Yes -- experimental | None |
| **Dynamic color** | No | No | Yes -- derive theme from any source color |

### Key Insights

1. **Mobile-specific theming** (Polaris): On mobile, Polaris bumps body text from 13px to 16px, simplifies shadows to flat styles, and tightens card spacing. We don't adapt our design system for touch devices -- we only rearrange layout via breakpoints.

2. **Nested themes** (Polaris/Material): Both support rendering a dark card inside a light page, or a branded section with different tokens. Our system is global-only.

3. **Dynamic color** (Material): Material can derive a complete theme from a single source color. This is overkill for our use case but demonstrates the power of a well-structured token hierarchy.

---

## 8. Accessibility

### Accessibility Comparison

| Aspect | Methodex | Polaris | Material |
|--------|----------|---------|----------|
| **Focus indicators** | `focus-visible` with accent-blue outline | `focus-visible` via standardized styling | Dedicated `<md-focus-ring>` component |
| **Focus trapping** | Via Radix Dialog (built-in) | Dedicated `TrapFocus` component with portal awareness | Sentinel-based focus trap with TreeWalker |
| **Touch targets** | `--size-touch: 44px` defined | Minimum sizes enforced via tokens | `delegatesFocus: true` on shadow roots |
| **ARIA patterns** | Basic `aria-*` on some components | Systematic `aria-describedby` arrays, `aria-invalid`, `aria-busy` | ARIA delegation mixin (host -> internal element) |
| **Keyboard navigation** | Via Radix primitives | Full numeric keyboard control, roving tabindex | Arrow keys, Home/End, roving tabindex, typeahead |
| **Screen reader** | Basic (via Radix) | `VisuallyHidden` component, i18n for all strings | ARIA delegation prevents double-announcement |
| **Reduced motion** | CSS `prefers-reduced-motion` check | Not documented | `isServer` guards for SSR |
| **Soft-disabled** | No | No | Yes -- disabled but focusable (WAI-ARIA compliant) |
| **Internationalization** | No | Full i18n system (`useI18n()` hook, all strings translated) | No |
| **Focus management** | Radix handles dialog focus | `handleMouseUpByBlurring` on all interactive elements | Separate focus-ring/ripple via `for` attribute |
| **Storybook a11y addon** | Yes (installed) | Not in their setup | N/A |
| **High-contrast mode** | No | High-contrast theme variant | `@media (forced-colors: active)` support |

### What We Got Right
- **Radix UI does heavy lifting** -- Dialog, Dropdown, Accordion, Tooltip all have solid a11y built in
- **Focus visible styling** is correctly implemented (shows ring only on keyboard focus)
- **Touch target minimum** (44px) is defined and used
- **Reduced motion** is respected
- **Storybook a11y addon** enables accessibility auditing during development

### Critical Gaps

#### 1. No `aria-describedby` Patterns (High)
Polaris builds `aria-describedby` arrays linking inputs to their help text, error messages, and character counts. Our form inputs have no such systematic ARIA linking.

#### 2. No Internationalization (Medium for now, High at scale)
Polaris has `useI18n()` with all UI strings going through translation. Our strings are hardcoded in English. For a research tool used by students, this may matter less now, but it's a structural decision.

#### 3. No Focus Management Beyond Radix (Medium)
Polaris has `handleMouseUpByBlurring` applied to **every** interactive element, ensuring focus rings only appear on keyboard navigation. We rely on `:focus-visible` CSS alone, which works for modern browsers but isn't as reliable.

#### 4. No High-Contrast / Forced-Colors Support (Medium)
Material Web includes `@media (forced-colors: active)` fallbacks on every component. Polaris has a high-contrast theme. We have neither.

---

## 9. Animation & Motion

### Motion System Comparison

| Aspect | Methodex | Polaris | Material |
|--------|----------|---------|----------|
| **Token count** | 3 duration + 1 easing | 23 tokens (12 duration + 5 easing + 6 keyframes) | 27 tokens (16 duration + 10 easing + 1 path) |
| **Library** | CSS + GSAP | CSS only | CSS + Web Animations API |
| **Presets** | `fadeInUp`, `fadeIn`, `scaleIn`, `stagger` | `bounce`, `fade-in`, `pulse`, `spin`, `appear-above/below` | No preset animations (custom per-component) |
| **Duration scale** | micro/normal/slow (0.15/0.2/0.5s) | 0ms-5000ms in 50ms steps | 50ms-1000ms in 4 tiers x 4 levels |
| **Easing** | 1 curve (standard) | 5 curves | 10 curves (emphasized, standard, legacy variants) |
| **Reduced motion** | CSS media query check | Not formally documented | Not formally documented |
| **Enter/exit distinction** | No | Separate `appear-above`/`appear-below` keyframes | Separate `accelerate`/`decelerate` easings |

### What We Got Right
- **GSAP integration** gives us more sophisticated animation capabilities than either Polaris or Material
- **Animation presets** (`fadeInUp`, `stagger`) are practical and reusable
- **Reduced motion** support is properly implemented

### What We're Missing
1. **Enter/exit easing distinction** -- Material defines separate `emphasized-decelerate` (enter) and `emphasized-accelerate` (exit) curves. Our single easing is used for everything.
2. **Duration scale** is too coarse -- 3 values vs. Polaris's 12 or Material's 16. Missing `200ms` and `300ms` ranges that are common for UI transitions.
3. **No state layer system** -- Material's state layer (8% opacity on hover, 12% on focus/press, 16% on drag) is a systematic approach to interactive feedback. We use ad-hoc Tailwind hover/focus states.

---

## 10. Responsive Design

### Responsive Comparison

| Aspect | Methodex | Polaris | Material |
|--------|----------|---------|----------|
| **Approach** | Mobile-first Tailwind + `clamp()` | Mobile-first CSS + `useBreakpoints()` hook + `ResponsiveProp<T>` | Intrinsic sizing (no breakpoint tokens) |
| **Breakpoint tokens** | Tailwind defaults (640/768/1024/1280) | 5 tokenized breakpoints with `up`/`down`/`only` | None |
| **Responsive props** | Via Tailwind `sm:`/`lg:` modifiers | `<Box padding={{xs: '200', md: '400'}} />` | N/A |
| **Touch adaptation** | Touch target defined | Mobile theme with larger type + simpler shadows | `delegatesFocus` for touch |
| **Fluid type** | Yes (`clamp()`) | No (step-based via theme) | No |

### What We Got Right
- **Fluid typography** is arguably superior to Polaris's step-based approach
- **Mobile-first Tailwind** gives us responsive utilities out of the box

### What We're Missing
1. **Responsive prop types** -- Polaris's `ResponsiveProp<T>` pattern lets components accept per-breakpoint values with type safety. Our responsive behavior is purely CSS-class-based.
2. **Mobile theme variant** -- Polaris provides a dedicated mobile theme with larger type and simplified visuals. We adapt layout but not visual treatment.

---

## 11. Testing

### Testing Comparison

| Aspect | Methodex | Polaris | Material |
|--------|----------|---------|----------|
| **Framework** | Vitest + Storybook | Jest + @shopify/react-testing | Jasmine + Web Test Runner + Playwright |
| **Test lines** | Minimal | ~27,500 lines across all components | Extensive (per-component test files) |
| **Test mount** | No custom mount | `mountWithApp()` wraps in full provider hierarchy | `Environment` class with stability helpers |
| **Coverage** | Stories serve as visual tests | Every prop/behavior gets describe block | Harness-based interaction testing |
| **Interaction testing** | Via Storybook play functions | `.trigger('onClick', event)` | `Harness.clickWithMouse()`, `.focusWithKeyboard()` |
| **Visual regression** | No | `All` story renders every variant on one page | Component catalog with screenshots |

### What We Got Right
- **Storybook + Vitest integration** is modern and well-configured
- **19 story files** cover the base component library

### Critical Gaps
1. **No unit tests for components** -- We rely entirely on Storybook stories. Polaris has 27,500 lines of component tests.
2. **No test mount utility** -- Polaris's `mountWithApp()` wraps every test in the full provider hierarchy. We'd need a similar utility for theme, query client, and router context.
3. **No visual regression testing** -- No automated way to catch visual changes.

---

## 12. Documentation & Guidelines

### Documentation Comparison

| Aspect | Methodex | Polaris | Material |
|--------|----------|---------|----------|
| **Component docs** | 19 Storybook stories with autodocs | Full MDX docs site with examples, best practices, Do/Don't, a11y guidance | Markdown docs with auto-generated API tables |
| **Design guidelines** | None | 12+ pages: color usage, typography usage, layout density, interaction states, pro design language | Theming docs only |
| **Content/UX writing** | None | 7 pages: fundamentals, grammar, errors, naming, alt text, inclusive language | None |
| **Pattern docs** | None | 7+ patterns: app settings, resource index, resource detail, card layout, date picking | None |
| **Token reference** | Comments in `index.css` | Auto-generated token pages | Token tables in component docs |
| **When-to-use guidance** | None | Every component: when to use, when not to use, related components | Links to M3 design articles |
| **Props documentation** | TypeScript interfaces | Auto-generated from TS + JSDoc `@default` annotations | Auto-generated from Lit analyzers |
| **Contribution guide** | None | Detailed: component, docs, Figma, changeset workflow | CONTRIBUTING.md with scope rules |

### This Is Our Biggest Gap

Polaris's documentation is in a different league. Key areas we completely lack:

1. **Design usage guidelines** -- HOW to use colors (not just WHAT colors exist). When to use fill vs. surface. When to use which text hierarchy.
2. **Content/UX writing standards** -- Grammar rules, error message patterns, capitalization conventions, pronoun usage.
3. **Component usage guidance** -- Best practices, Do/Don't examples, when-to-use each component.
4. **Pattern documentation** -- Composing multiple components into standard page layouts.

---

## 13. Migration & Tooling

### Tooling Comparison

| Tool | Methodex | Polaris | Material |
|------|----------|---------|----------|
| **Version migration** | None | 47 codemods via `polaris-migrator` | 2 migration utilities |
| **Linting** | ESLint only | `stylelint-polaris` (10 categories) + ESLint | Sass compile-time validation |
| **IDE integration** | None | `polaris-for-vscode` (token autocomplete, color preview) | None |
| **Design tool sync** | None | Figma UI Kit with branch-and-merge workflow | None |
| **Bundle size tracking** | None | `size-limit` enforced in CI | Auto-generated size docs |

### What We're Missing
1. **Token enforcement via linting** -- Nothing prevents developers from using raw hex colors or pixel values instead of tokens
2. **IDE support** -- No autocomplete for our design tokens
3. **Bundle size awareness** -- No tracking of component sizes

---

## 14. Scorecard

Rating scale: 1 (minimal) to 5 (industry-leading)

| Dimension | Methodex | Polaris | Material | Notes |
|-----------|---------|---------|----------|-------|
| **Token architecture** | 2 | 5 | 5 | We have tokens but no governance |
| **Color system** | 3 | 5 | 5 | Good palette, weak semantics |
| **Typography** | 4 | 4 | 4 | Dual fonts + fluid type is strong |
| **Spacing** | 2 | 4 | 2 | Relying on Tailwind defaults |
| **Component quality** | 3 | 5 | 5 | Functional but not deeply engineered |
| **Theming** | 3 | 5 | 5 | Light/dark works, lacks depth |
| **Accessibility** | 2.5 | 4 | 5 | Radix covers basics, no systematic approach |
| **Animation** | 3.5 | 3 | 4 | GSAP is powerful, system is informal |
| **Responsive** | 3 | 4 | 3 | Fluid type is good, no mobile theme |
| **Testing** | 2 | 5 | 4 | Stories only, no unit tests |
| **Documentation** | 1.5 | 5 | 3 | Our biggest gap |
| **Tooling** | 1 | 5 | 3 | No enforcement, no IDE support |
| **Visual identity** | 4 | 3 | 3 | Our design is distinctive |
| **Overall** | **2.7** | **4.5** | **3.9** | |

---

## 15. What We Got Right

These are genuine strengths that neither Polaris nor Material have:

### 1. Visual Distinctiveness (Our #1 Strength)
Our dual-font system (DM Serif Display + Inter), warm cream surfaces, and noise texture overlays create a **visually distinctive product**. Polaris looks like a Shopify product. Material looks like a Google product. Methodex looks like *itself*. This is rare and valuable.

### 2. Fluid Typography
CSS `clamp()` for responsive type is technically superior to Polaris's mobile-theme step-up approach. It provides smooth scaling without jarring breakpoint jumps.

### 3. Noise Texture System
The `noise-texture`, `noise-light`, `noise-medium`, `noise-heavy` overlays and `frosted-glass` backdrop-blur effect are unique tactile elements that neither system has.

### 4. Folder Color System
The cycling 6-color folder palette (`getFolderColor(index)`) with separate tab/body colors is a thoughtful domain-specific design element.

### 5. Three-Tier Brand Palette
Saturated (tabs/accents), medium (card fills), pastel (backgrounds) -- this three-tier system for the brand palette shows sophisticated color thinking.

### 6. GSAP Integration
Having GSAP available alongside CSS animations gives us capabilities for complex interactions that neither Polaris nor Material can match without additional libraries.

### 7. Tailwind v4 Modernity
We're on the latest Tailwind version with native CSS-based configuration (`@theme` blocks). This is more modern than Polaris's separate CSS Modules approach.

### 8. shadcn/ui DX
The "copy and own" model means we can modify any component without fighting upstream. Neither Polaris nor Material offer this level of control without forking.

---

## 16. Critical Gaps

Prioritized by impact and effort:

### Tier 1: High Impact, Moderate Effort

#### Gap 1: No Token Governance
**Problem:** Developers can bypass the design system entirely by using raw Tailwind classes, hex colors, or pixel values. Nothing enforces token usage.
**What Polaris does:** `stylelint-polaris` flags 10 categories of violations (color, spacing, border, shadow, motion, typography, z-index, media queries, layout, conventions).
**Recommendation:** Create an ESLint/Stylelint rule that warns on raw color/spacing values in component files.

#### Gap 2: Inconsistent Token Naming
**Problem:** Tokens mix conventions: `--color-surface-card`, `--color-base-85`, `--color-brand-mustard`, `--radius-md`, `--shadow-card`. No systematic naming.
**What Polaris does:** Strict `--p-{group}-{name}` pattern documented in `polaris-tokens-structure.md`.
**Recommendation:** Establish and document a naming convention: `--mx-{group}-{role}-{variant}-{state}` (e.g., `--mx-color-bg-surface-card`, `--mx-color-text-primary-hover`).

#### Gap 3: No "On" Color Tokens
**Problem:** When placing text on colored backgrounds, developers must manually ensure contrast. No guardrails.
**What Polaris does:** Every fill color has a paired `text-*-on-bg-fill` token.
**What Material does:** Every color role has an `on-*` counterpart.
**Recommendation:** Add `--color-text-on-destructive`, `--color-text-on-success`, `--color-text-on-accent`, etc.

#### Gap 4: No Component Documentation Beyond Stories
**Problem:** Storybook shows WHAT components look like but not WHEN or HOW to use them. No best practices, no Do/Don't, no usage guidance.
**Recommendation:** Add a `## Usage` section to each story file using Storybook's `docs` addon. Start with the 5 most-used components.

### Tier 2: Medium Impact, Low-to-Moderate Effort

#### Gap 5: No Semantic Spacing Tokens
**Problem:** Spacing is ad-hoc via Tailwind classes. No `--space-card-padding`, `--space-section-gap`.
**Recommendation:** Define 5-8 semantic spacing tokens for recurring patterns (card padding, section gap, form field gap, page margin).

#### Gap 6: No State Color Modifiers
**Problem:** Hover/focus/disabled colors are handled via Tailwind opacity modifiers, not semantic tokens.
**Recommendation:** Add hover/active/disabled variants for primary interactive colors.

#### Gap 7: No Type Scale Tokens
**Problem:** Typography is defined in `@utility` blocks, not as themeable CSS custom properties.
**Recommendation:** Extract typography utilities into CSS custom properties (`--mx-text-heading-lg-size`, etc.).

#### Gap 8: No Component Unit Tests
**Problem:** 0 component unit tests. Only Storybook visual coverage.
**Recommendation:** Add basic render + interaction tests for the 10 most critical components. Create a `mountWithProviders()` utility.

### Tier 3: Lower Priority, Higher Effort

#### Gap 9: No Layout Primitives
**Problem:** No typed `Box`, `Stack`, `Inline` primitives that enforce token usage.
**Recommendation:** Consider creating thin wrapper components that map token values to Tailwind classes.

#### Gap 10: No High-Contrast / Mobile Theme
**Problem:** Single light + single dark theme. No accessibility-enhanced or mobile-optimized variants.
**Recommendation:** Add a high-contrast variant that boosts text contrast and border visibility.

#### Gap 11: No Token IDE Support
**Problem:** No autocomplete for design tokens in VS Code.
**Recommendation:** Evaluate `cssvar-autocomplete` VS Code extension or create a tokens JSON file for editor consumption.

---

## 17. Recommendations

### Phase 1: Foundation (1-2 weeks)
*Low risk, high reward -- can be done without breaking existing components*

1. **Document token naming convention** -- Write a `DESIGN_TOKENS.md` defining the `--mx-{group}-{name}` pattern
2. **Add "on" color tokens** -- 5-6 tokens for text-on-colored-background pairs
3. **Add semantic spacing tokens** -- `--mx-space-card-padding`, `--mx-space-section-gap`, etc. (5-8 tokens)
4. **Add state color variants** -- `--mx-color-bg-primary-hover`, `--mx-color-bg-primary-active` (10-15 tokens)
5. **Create a `mountWithProviders()` test utility** -- For future component tests

### Phase 2: Enforcement (2-3 weeks)
*Introduces guardrails without requiring component rewrites*

6. **Add ESLint/Stylelint rules** -- Warn on raw hex colors and pixel values in component files
7. **Add usage docs to top 5 components** -- Button, Card, Dialog, Badge, Input -- with best practices and Do/Don't
8. **Add enter/exit easing tokens** -- Separate decelerate (enter) and accelerate (exit) curves
9. **Expand duration scale** -- Add 200ms and 300ms to bridge the gap between micro and normal

### Phase 3: Architecture (3-4 weeks)
*Structural improvements that touch component internals*

10. **Extract type tokens** -- Move typography from `@utility` blocks into CSS custom properties
11. **Add component tests** -- Start with Button, Dialog, Select -- basic render + interaction coverage
12. **Consider layout primitives** -- Evaluate whether a typed `Stack`/`Box` wrapper adds value for our team
13. **Add high-contrast theme** -- Boost text contrast, border visibility, shadow definition

### What NOT To Do
- **Don't adopt Polaris's CSS Modules** -- Tailwind + CVA is a good fit for our codebase
- **Don't create 453 tokens** -- We're a small product; start with ~120-150 well-chosen tokens
- **Don't build migration codemods** -- We don't have enough consumers to justify this investment
- **Don't build an IDE extension** -- Use existing CSS variable autocomplete tools
- **Don't add i18n** -- English-only is fine for a university research tool
- **Don't build a docs site** -- Storybook with enhanced docs is sufficient

---

## Appendix A: Token Count Targets

Based on this analysis, here's a reasonable target token set for Methodex:

| Category | Current | Target | Notes |
|----------|---------|--------|-------|
| Color - Neutrals | ~10 | 12-15 | Add state variants |
| Color - Surfaces | 3 | 6-8 | Add surface hierarchy |
| Color - Semantic | ~6 | 12-15 | Add "on" colors + state variants |
| Color - Brand | ~18 | 18 | Keep as-is (strong) |
| Color - Chart | 5 | 5 | Keep as-is |
| Typography | 0 | 15-20 | Extract from utilities |
| Spacing | 0 | 8-10 | Semantic spacing |
| Border radius | 7 | 7 | Keep as-is |
| Shadow | 5 | 5-7 | Add subtle + pressed |
| Z-index | 9 | 9 | Keep as-is |
| Animation | 4 | 8-10 | Add duration steps + enter/exit easing |
| **Total** | **~80** | **~120-140** | **~60% increase** |

## Appendix B: Research Sources

- **Polaris source:** https://github.com/Shopify/polaris (cloned at `/tmp/design-system-study/polaris`)
- **Material Web source:** https://github.com/material-components/material-web (cloned at `/tmp/design-system-study/material-web`)
- **Our source:** `/Users/idstuart/Projects/ai-prototyping/5d-analysis/qualitative-research-tool/frontend/`
- **Analysis date:** 2026-03-15
- **Analysis method:** 6 parallel deep-dive agents analyzing tokens, components, and docs/ecosystem for each system, plus comprehensive exploration of our own codebase
