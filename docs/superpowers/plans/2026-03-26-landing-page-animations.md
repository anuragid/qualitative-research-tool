# Landing Page Animations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add craft-quality micro-interactions and scroll-triggered animations to every section of the methodex landing page.

**Architecture:** All animations use GSAP 3.14 + ScrollTrigger (already installed). Hero uses a load-time GSAP timeline in HeroSection.tsx. Everything below the fold uses ScrollTrigger instances in the existing `useGSAP` block in LandingPage.tsx. CSS handles hover states and ambient loops. One new file: `useTextScramble.ts` hook for footer.

**Tech Stack:** GSAP 3.14, @gsap/react, ScrollTrigger, CSS animations, React hooks

---

### Task 1: CSS-Only Animations (hover states, ambient loops)

**Files:**
- Modify: `src/pages/landing-page.css`

Pure CSS — no JS changes. Adds: nav link hover underlines, dropzone border pulse, amber dot pulse, form focus lift, folder card hover straighten, footer link hover underlines.

- [ ] **Step 1: Add nav link hover underline**

Add after the existing `.nav-link` styles (~line 233):

```css
.landing-page .nav-link {
  position: relative;
}
.landing-page .nav-link::after {
  content: '';
  position: absolute;
  bottom: 2px;
  left: 14px;
  right: 14px;
  height: 1.5px;
  background: var(--color-teal);
  border-radius: 1px;
  transform: scaleX(0);
  transform-origin: center;
  transition: transform var(--duration-base) var(--ease-out);
}
.landing-page .nav-links:hover .nav-link:hover::after {
  transform: scaleX(1);
}
```

- [ ] **Step 2: Add nav scroll compact scale**

In `.nav.scrolled` (~line 193), add `transform`:

```css
.landing-page .nav.scrolled {
  top: 16px;
  background: rgba(255, 255, 255, 0.85);
  transform: translateX(-50%) scale(0.98);
}
```

Update the base `.nav` transition to include transform:

```css
  transition:
    top var(--duration-base) var(--ease-out),
    box-shadow var(--duration-base) var(--ease-out),
    background var(--duration-base) var(--ease-out),
    transform var(--duration-base) var(--ease-out);
```

- [ ] **Step 3: Add amber dot pulse keyframe**

After the existing `nodePulse` keyframe, add:

```css
@keyframes amberPulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.3); }
  50% { opacity: 0.6; box-shadow: 0 0 0 4px rgba(245, 158, 11, 0); }
}
```

- [ ] **Step 4: Add dropzone border pulse**

```css
@keyframes dropzonePulse {
  0%, 100% { border-color: var(--color-ink-20); }
  50% { border-color: var(--color-ink-35); }
}
.landing-page .upload-dropzone {
  animation: dropzonePulse 3s ease-in-out infinite;
}
```

- [ ] **Step 5: Add form focus lift**

```css
.landing-page .form-group {
  transition: transform var(--duration-base) var(--ease-out);
}
.landing-page .form-group:focus-within {
  transform: scale(1.01);
}
```

- [ ] **Step 6: Add folder card hover straighten + rotation setup**

The JS will set initial rotations via inline style. CSS handles the hover transition:

```css
.landing-page .folder-card {
  transition:
    transform var(--duration-base) var(--ease-out),
    box-shadow var(--duration-base) var(--ease-out),
    rotate var(--duration-base) var(--ease-out);
}
.landing-page .folder-card:hover {
  transform: translateY(-3px);
  rotate: 0deg;
  box-shadow: var(--shadow-card);
}
```

- [ ] **Step 7: Add footer link hover underlines**

```css
.landing-page .footer-col a,
.landing-page .footer-col button {
  position: relative;
}
.landing-page .footer-col a::after,
.landing-page .footer-col button::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: currentColor;
  transform: scaleX(0);
  transform-origin: center;
  transition: transform var(--duration-base) var(--ease-out);
}
.landing-page .footer-col a:hover::after,
.landing-page .footer-col button:hover::after {
  transform: scaleX(1);
}
```

- [ ] **Step 8: Add reduced motion overrides for new CSS animations**

Inside the existing `@media (prefers-reduced-motion: reduce)` block:

```css
  .landing-page .upload-dropzone {
    animation: none;
  }
```

- [ ] **Step 9: Commit**

```bash
git add src/pages/landing-page.css
git commit -m "style: CSS micro-interactions — nav underline, dropzone pulse, amber dot, focus lift, folder hover, footer links"
```

---

### Task 2: Hero Entrance Timeline

**Files:**
- Modify: `src/components/landing/HeroSection.tsx`

Add GSAP timeline that fires on page load: headline word stagger, subtitle+CTA fade, mockup slide-up, video card stagger, amber dot pulse.

- [ ] **Step 1: Import GSAP and add refs**

Add imports and refs for the animation targets.

- [ ] **Step 2: Split headline into word spans**

Replace the static `h1` text with mapped word spans. The `<em>` tag wraps "digitized" as before.

- [ ] **Step 3: Build the entrance timeline in useGSAP**

Create a `gsap.timeline()` that sequences:
1. Word spans stagger in (0.06s each, `y:20, opacity:0`)
2. Subtitle + CTA fade in (0.3s delay)
3. Product mockup slides up (`y:60, opacity:0`, 0.8s)
4. Video cards stagger in (0.12s apart)

All behind a `prefersReducedMotion()` guard.

- [ ] **Step 4: Add amber dot pulse class to Card 2 status dot**

Apply the CSS `amberPulse` animation to the amber status dot inline.

- [ ] **Step 5: Verify build compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/components/landing/HeroSection.tsx
git commit -m "feat: hero entrance timeline — word stagger, mockup slide-up, card cascade"
```

---

### Task 3: Hero Parallax (Paper + Clouds)

**Files:**
- Modify: `src/components/landing/HeroSection.tsx`

Add ScrollTrigger scrub-based parallax on the 5 torn paper pieces and 2 cloud elements.

- [ ] **Step 1: Add refs for paper pieces and clouds**

- [ ] **Step 2: Add scrub parallax in useGSAP**

For each paper piece, create a ScrollTrigger with `scrub: true` that translates Y at different rates as the hero section scrolls. Clouds shift horizontally (cloud-1 left, cloud-2 right, ±40px).

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/HeroSection.tsx
git commit -m "feat: hero parallax — paper pieces + clouds with scrub-based depth"
```

---

### Task 4: Breathing Tagline Word Reveal

**Files:**
- Modify: `src/pages/LandingPage.tsx`

Replace the generic `.reveal` fade-up on breathing taglines with per-word clip-path reveal.

- [ ] **Step 1: Wrap breathing tagline text in word spans**

Replace each static `<p className="breathing-tagline reveal">` with word-split spans.

- [ ] **Step 2: Add ScrollTrigger clip-path animation in useGSAP**

For each breathing tagline, animate word spans with `clipPath: 'inset(0 100% 0 0)'` → `'inset(0 0% 0 0)'`, 0.04s stagger.

- [ ] **Step 3: Commit**

```bash
git add src/pages/LandingPage.tsx
git commit -m "feat: breathing taglines — masked word reveal with clip-path"
```

---

### Task 5: Collection Section Animations

**Files:**
- Modify: `src/pages/LandingPage.tsx`
- Modify: `src/pages/landing-page.css`

Animate progress bar fills and dimension badge entrances.

- [ ] **Step 1: Set initial width to 0 on progress bars**

In CSS, add `.mockup-dim-fill { width: 0%; }` as base state. The final widths are set via inline style and will be animated to by GSAP.

- [ ] **Step 2: Add ScrollTrigger for progress bar fill**

In `useGSAP`, target each `.mockup-dim-fill` element, read its inline `style.width`, animate from `width: 0` to that value. Stagger 0.15s.

- [ ] **Step 3: Add dimension badge stagger**

Target `.dimensions .dimension-badge` elements. Animate from `y:12, opacity:0, scale:0.95` with `back.out(1.4)`, stagger 0.08s.

- [ ] **Step 4: Commit**

```bash
git add src/pages/LandingPage.tsx src/pages/landing-page.css
git commit -m "feat: collection section — progress bar fill + dimension badge spring entrance"
```

---

### Task 6: Upload Section Animations

**Files:**
- Modify: `src/pages/LandingPage.tsx`

Animate upload progress fill, file row stagger, checkmark pop.

- [ ] **Step 1: Add ScrollTrigger animations**

In `useGSAP`:
- `.upload-progress-fill`: animate `width: 0` → `72%`
- `.upload-file-row`: stagger `x:30, opacity:0` → final, 0.15s apart
- `.upload-check`: scale `0→1` with `back.out(1.7)`, 0.2s delay after file rows

- [ ] **Step 2: Commit**

```bash
git add src/pages/LandingPage.tsx
git commit -m "feat: upload section — progress fill, file row stagger, checkmark pop"
```

---

### Task 7: Node Editor Animations

**Files:**
- Modify: `src/pages/LandingPage.tsx`

Edge line draw-on, node entrance stagger, status dot light-up sequence.

- [ ] **Step 1: Add edge draw-on with stroke-dashoffset**

After SVG paths are computed, set `stroke-dasharray` and `stroke-dashoffset` to each path's total length. On ScrollTrigger enter, animate `stroke-dashoffset` to 0. Stagger 0.2s.

- [ ] **Step 2: Add node entrance stagger**

Animate nodes in pipeline order. `scale:0.9, opacity:0` → final. 0.12s stagger.

- [ ] **Step 3: Add status dot sequence**

After node entrance completes, light up status dots sequentially. The "running" dot starts its CSS pulse. The "queued" dot fades in grey.

- [ ] **Step 4: Commit**

```bash
git add src/pages/LandingPage.tsx
git commit -m "feat: node editor — edge draw-on, node entrance, status dot sequence"
```

---

### Task 8: Cross-Video Insights Animations

**Files:**
- Modify: `src/pages/LandingPage.tsx`

Insight card stagger with rotation + tag delayed reveal.

- [ ] **Step 1: Add insight card stagger**

Target `.insight-card` elements. Animate `y:24, opacity:0` with random rotation (-1 to 1deg) → `y:0, opacity:1, rotate:0`. Stagger 0.15s.

- [ ] **Step 2: Add tag delayed reveal**

After each card entrance, animate `.insight-card-tags` children from `opacity:0` → 1, 0.05s stagger, 0.3s delay.

- [ ] **Step 3: Commit**

```bash
git add src/pages/LandingPage.tsx
git commit -m "feat: insights section — card stagger with rotation + delayed tag reveal"
```

---

### Task 9: Upcoming Methods + About + Contact Animations

**Files:**
- Modify: `src/pages/LandingPage.tsx`
- Modify: `src/components/landing/ContactForm.tsx`

Folder card deal, about paragraph/badge entrances, contact field cascade.

- [ ] **Step 1: Folder card deal animation**

Target `.folder-card` elements. Set deterministic rotation per index: `[1.2, -0.8, 1.5, -1.1, 0.7, -1.4]`. Animate from `y:20, opacity:0` → final with rotation preserved. Status text (`.folder-card-status`) fades in 0.2s after card lands.

- [ ] **Step 2: About section animations**

Animate `.about-text` paragraphs: `y:16, opacity:0`, 0.15s stagger.
Animate `.about-org` badges: `y:12, opacity:0, scale:0.95`, `back.out(1.4)`, 0.08s stagger.

- [ ] **Step 3: Contact form field cascade**

In ContactForm.tsx, add refs and useGSAP to animate `.form-group` elements + submit button: `y:12, opacity:0`, 0.1s stagger on ScrollTrigger enter.

- [ ] **Step 4: Commit**

```bash
git add src/pages/LandingPage.tsx src/components/landing/ContactForm.tsx
git commit -m "feat: folder deal, about entrance, contact field cascade"
```

---

### Task 10: Text Scramble Hook + Footer

**Files:**
- Create: `src/hooks/useTextScramble.ts`
- Modify: `src/components/landing/LandingFooter.tsx`

Build the reusable text scramble hook and integrate it into the footer.

- [ ] **Step 1: Create useTextScramble hook**

Implements a requestAnimationFrame-based text scramble effect. Accepts text string and options (duration, stagger, charSet). Returns ref and replay function. Preserves spaces/special chars.

- [ ] **Step 2: Integrate into LandingFooter**

Use the hook for both copyright line and credits line. Trigger via ScrollTrigger `onEnter` on `.footer-bottom`. Credits line starts 0.3s after copyright.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useTextScramble.ts src/components/landing/LandingFooter.tsx
git commit -m "feat: footer text scramble effect on scroll-in"
```

---

### Task 11: Reduced Motion + Final Verification

**Files:**
- Modify: `src/pages/LandingPage.tsx`
- Modify: `src/components/landing/HeroSection.tsx`

Ensure all GSAP animations respect `prefersReducedMotion()`. Type check. Visual verification.

- [ ] **Step 1: Audit all useGSAP blocks for reduced motion guard**

Every `useGSAP` block must check `prefersReducedMotion()` at the top and `gsap.set()` elements to final state if true.

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "fix: ensure all animations respect prefers-reduced-motion"
```

- [ ] **Step 5: Push to deploy**

```bash
git push origin main
```
