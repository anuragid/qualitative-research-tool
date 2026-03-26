# Landing Page Micro-Interactions & Animations

**Date:** 2026-03-26
**Status:** Approved
**Scope:** Landing page only (`LandingPage.tsx`, `HeroSection.tsx`, `ContactForm.tsx`, `LandingFooter.tsx`, `landing-page.css`)

## Philosophy

Organic, paper-craft motion. Things feel placed, layered, and unhurried — matching the torn-paper, warm-canvas aesthetic. No flashy tech effects. Every animation serves one of three purposes: **reveal** (content entering), **respond** (user interaction), or **delight** (subtle ambient motion).

## Infrastructure

- **No new dependencies.** GSAP 3.14 + ScrollTrigger (already installed and registered).
- **Reduced motion:** All scroll-triggered and entrance animations respect `prefersReducedMotion()` — skip to final state instantly. Ambient CSS animations (cloud drift, dot pulse) are already handled via `@media (prefers-reduced-motion: reduce)`.
- **Above-the-fold rule:** Hero content animates on page load (staggered entrance), but starts from a subtle offset — never from fully hidden. Everything below the fold uses ScrollTrigger.
- **Easing language:**
  - `power2.out` — standard entrances
  - `back.out(1.4)` — spring/bounce (badges, checkmarks)
  - `power1.inOut` — scrub-linked parallax
- **Reusable hook:** `useTextScramble(text, options)` for footer scramble effect.

## Section-by-Section Spec

### 1. Nav

| Animation | Trigger | Properties | Duration/Ease |
|-----------|---------|-----------|---------------|
| Scroll compact | `window.scrollY > 80` | Add `scale(0.98)` to existing CSS transition | 200ms `ease-out` (CSS) |
| Link hover underline | `:hover` on `.nav-link` | `::after` pseudo, `scaleX(0→1)` from `transform-origin: center`, 1.5px tall, teal | 200ms `ease-out` (CSS) |

The existing spotlight dim (sibling links fade to 35% opacity on parent hover) stays.

### 2. Hero

| Animation | Trigger | Properties | Duration/Ease |
|-----------|---------|-----------|---------------|
| Headline word stagger | Page load | Split `h1` into `<span>` per word. `y: 20, opacity: 0` → final. `<em>` word: 0.5s. Others: 0.35s | 0.06s stagger, `power2.out` |
| Subtitle + CTA fade-in | After headline completes | `opacity: 0` → 1 | 0.4s, `power2.out`, 0.3s delay |
| Product mockup entrance | Page load, sequenced after subtitle | `y: 60, opacity: 0` → final | 0.8s, `power2.out` |
| Video cards stagger | After mockup lands | `y: 16, opacity: 0` → final | 0.12s stagger, 0.35s each, `power2.out` |
| Amber dot pulse | Always (CSS) | Reuse `nodePulse` keyframe pattern with `#F59E0B` | 2s infinite |
| Paper parallax | Scroll (scrub) | Each paper piece translates Y at different rates: piece-0 at 30%, piece-1 at 50%, piece-2 at 60%, piece-3 at 40%, piece-4 at 80% | `scrub: true`, `power1.inOut` |
| Cloud scroll parallax | Scroll (scrub) | Cloud-1 shifts left, cloud-2 shifts right as user scrolls past hero | `scrub: true`, ±40px range |

### 3. Breathing Taglines

| Animation | Trigger | Properties | Duration/Ease |
|-----------|---------|-----------|---------------|
| Masked word reveal | ScrollTrigger `start: 'top 85%'` | Wrap each word in `<span>`. Animate `clipPath: 'inset(0 100% 0 0)'` → `'inset(0 0% 0 0)'` | 0.4s per word, 0.04s stagger, `power2.out` |

Replaces the current `.reveal` fade-up on breathing taglines.

### 4. Collection (Featured Method Card)

| Animation | Trigger | Properties | Duration/Ease |
|-----------|---------|-----------|---------------|
| Progress bar fill | ScrollTrigger on `.featured-mockup` | Each `.mockup-dim-fill` animates `width: 0%` → final (85%, 72%, 58%, 68%, 45%) | 0.6s each, 0.15s stagger, `power2.out` |
| Dimension badges | ScrollTrigger on `.dimensions` | `y: 12, opacity: 0, scale: 0.95` → final | 0.35s each, 0.08s stagger, `back.out(1.4)` |

### 5. Feature 1: Upload & Transcribe (Purple)

| Animation | Trigger | Properties | Duration/Ease |
|-----------|---------|-----------|---------------|
| Upload progress fill | ScrollTrigger on `.upload-mockup` | `.upload-progress-fill` animates `width: 0%` → `72%` | 0.8s, `power2.out` |
| File rows stagger | ScrollTrigger | `x: 30, opacity: 0` → final per `.upload-file-row` | 0.35s each, 0.15s stagger, `power2.out` |
| Checkmark pop | After completed file row lands | `.upload-check` scales `0 → 1` | 0.3s, `back.out(1.7)`, 0.2s delay |
| Dropzone border pulse | Always (CSS) | `.upload-dropzone` border opacity cycles 0.5→1→0.5 | 3s infinite, `ease-in-out` |

### 6. Feature 2: AI-Powered Analysis (Green)

| Animation | Trigger | Properties | Duration/Ease |
|-----------|---------|-----------|---------------|
| Edge line draw-on | ScrollTrigger on `.node-editor` | Set `stroke-dasharray` to path length, animate `stroke-dashoffset` from length → 0 | 0.6s per edge, 0.2s stagger, `power2.inOut` |
| Node entrance | ScrollTrigger, after edges begin | Stagger in pipeline order: input → chunk → infer+relate → explain+activate → ghost. `scale: 0.9, opacity: 0` → final | 0.35s each, 0.12s stagger, `power2.out` |
| Status dot sequence | After nodes land | Dots light up sequentially: done, done, done, running-pulse, queued-appear | 0.15s stagger, 0.2s delay after nodes |

### 7. Feature 3: Cross-Video Insights (Gold)

| Animation | Trigger | Properties | Duration/Ease |
|-----------|---------|-----------|---------------|
| Insight cards stagger | ScrollTrigger on `.insights-mockup` | `y: 24, opacity: 0, rotate: random(-1, 1)deg` → `y: 0, opacity: 1, rotate: 0` | 0.4s each, 0.15s stagger, `power2.out` |
| Tags delayed reveal | After parent card entrance | `.insight-card-tags` children fade in: `opacity: 0` → 1 | 0.25s, 0.05s stagger, 0.3s delay after card |

### 8. Upcoming Methods (Folder Cards)

| Animation | Trigger | Properties | Duration/Ease |
|-----------|---------|-----------|---------------|
| Deal animation | ScrollTrigger on `.methods-grid` | Each card: `y: 20, opacity: 0, rotate: random(±2)deg` → `y: 0, opacity: 1, rotate: random(±2)deg` (keeps slight rotation) | 0.4s each, 0.08s stagger, `power2.out` |
| Hover straighten | CSS `:hover` | `rotate → 0deg`, lift + shadow | 200ms `ease-out` (CSS) |
| Status text delay | After card entrance | `.folder-card-status` fades in: `opacity: 0` → 1 | 0.3s, 0.2s delay |

Rotation values are seeded per-card index (deterministic, not random on each render): `[1.2, -0.8, 1.5, -1.1, 0.7, -1.4]`.

### 9. About

| Animation | Trigger | Properties | Duration/Ease |
|-----------|---------|-----------|---------------|
| Text paragraphs | ScrollTrigger | Per-paragraph `y: 16, opacity: 0` → final | 0.5s each, 0.15s stagger, `power2.out` |
| Org badges | ScrollTrigger on `.about-orgs` | `y: 12, opacity: 0, scale: 0.95` → final | 0.35s each, 0.08s stagger, `back.out(1.4)` |

### 10. Contact Form

| Animation | Trigger | Properties | Duration/Ease |
|-----------|---------|-----------|---------------|
| Field cascade | ScrollTrigger on `.contact-form` | Each `.form-group` + button: `y: 12, opacity: 0` → final | 0.35s each, 0.1s stagger, `power2.out` |
| Focus lift | CSS `:focus-within` | `transform: scale(1.01)` on `.form-group` | 200ms `ease-out` (CSS) |
| Submit success | Form submission success | Button text → "Sent!", background flash teal, `scale: 1→1.05→1` | 0.4s, `power2.out` |

### 11. Footer

| Animation | Trigger | Properties | Duration/Ease |
|-----------|---------|-----------|---------------|
| Text scramble — copyright | ScrollTrigger on `.footer-bottom` | Characters randomize then resolve to final text. Random chars from `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*` | ~1s total, each char resolves over 0.6s with random start delay |
| Text scramble — credits | ScrollTrigger, 0.3s after copyright | Same treatment on "Built at the Institute of Design..." | ~1s total, 0.3s delay |
| Link hover underline | CSS `:hover` | Same draw-from-center `::after` as nav links | 200ms `ease-out` (CSS) |

**Text scramble implementation:** A `useTextScramble` React hook that:
1. Accepts `text: string` and `options: { duration?, stagger?, charSet? }`
2. Returns `{ ref, replay }` — ref to attach to the element, replay to re-trigger
3. On trigger, replaces each character with random chars, then resolves left-to-right with per-character stagger
4. Uses `requestAnimationFrame` loop (not GSAP) to keep it lightweight
5. Preserves spaces and special characters (doesn't scramble them)
6. Triggered via ScrollTrigger `onEnter` callback in the footer component — ScrollTrigger observes `.footer-bottom`, calls `replay()` when it enters the viewport

## Excluded

- No parallax on readable text
- No scroll-jacking or section pinning
- No particle effects or WebGL
- No smooth-scroll library (Lenis etc.)
- No entrance animations on above-the-fold content from fully hidden state (hero word stagger starts from subtle offset, not invisible)

## File Changes

| File | Changes |
|------|---------|
| `src/components/landing/HeroSection.tsx` | Word-split headline, staggered entrance timeline, paper parallax, cloud parallax, amber dot pulse |
| `src/pages/LandingPage.tsx` | ScrollTrigger animations for all sections below hero: breathing taglines, collection, features, upcoming, about, contact. Node editor edge draw-on. Folder card deal animation. |
| `src/pages/landing-page.css` | Nav underline pseudo-element, dropzone pulse keyframe, focus lift, folder card hover straighten, footer link underlines, amber dot pulse keyframe |
| `src/components/landing/ContactForm.tsx` | Field cascade entrance, focus lift class, submit success animation |
| `src/components/landing/LandingFooter.tsx` | Text scramble integration on copyright + credits lines |
| `src/hooks/useTextScramble.ts` | New file — reusable text scramble hook |
| `src/lib/animations.ts` | No changes needed (existing presets are sufficient) |
