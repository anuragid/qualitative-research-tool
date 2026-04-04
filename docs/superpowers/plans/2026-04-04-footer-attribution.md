# Footer Attribution Line Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a personal attribution line ("A Jeremy Alexis method · Crafted with ♥ in Chicago by Anurag Duddu") to the landing page footer with teal highlighter hover effect on names.

**Architecture:** Purely additive — new CSS classes and new JSX below the existing `footer-credits` element, separated by a hairline rule. No changes to existing markup or styles.

**Tech Stack:** React, CSS (landing-page.css custom properties)

**Spec:** `docs/superpowers/specs/2026-04-04-footer-attribution-design.md`

---

### Task 1: Add attribution styles to landing-page.css

**Files:**
- Modify: `frontend/src/pages/landing-page.css:1763` (after `.footer-credits a:hover`)
- Modify: `frontend/src/pages/landing-page.css:2186` (responsive ≤768px)
- Modify: `frontend/src/pages/landing-page.css:2402` (responsive ≤480px)

- [ ] **Step 1: Add base attribution styles after the existing footer-credits rules**

Insert after line 1763 (`.landing-page .footer-credits a:hover { color: white; }`):

```css
.landing-page .footer-separator {
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin-top: 16px;
  margin-bottom: 12px;
}
.landing-page .footer-attribution {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.35);
  letter-spacing: 0.02em;
}
.landing-page .footer-attribution a {
  color: rgba(255, 255, 255, 0.5);
  text-decoration: none;
  padding: 2px 4px;
  margin: -2px -4px;
  border-radius: 2px;
  transition: all var(--duration-base) var(--ease-out);
}
.landing-page .footer-attribution a:hover {
  background: rgba(13, 148, 136, 0.25);
  color: rgba(255, 255, 255, 0.8);
}
```

- [ ] **Step 2: Add responsive rule for ≤768px breakpoint**

Find the existing rule block (around line 2185-2188):
```css
  .landing-page .footer-copyright,
  .landing-page .footer-credits {
    font-size: 12px;
  }
```

Replace with:
```css
  .landing-page .footer-copyright,
  .landing-page .footer-credits {
    font-size: 12px;
  }
  .landing-page .footer-attribution {
    font-size: 11px;
  }
```

- [ ] **Step 3: Add responsive rule for ≤480px breakpoint**

Find the existing rule (around line 2402-2403):
```css
  .landing-page .footer-copyright,
  .landing-page .footer-credits { font-size: 11px; }
```

Replace with:
```css
  .landing-page .footer-copyright,
  .landing-page .footer-credits { font-size: 11px; }
  .landing-page .footer-attribution { font-size: 10px; }
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/landing-page.css
git commit -m "style: add footer attribution line styles with teal highlighter hover"
```

---

### Task 2: Add attribution markup to LandingFooter.tsx

**Files:**
- Modify: `frontend/src/components/landing/LandingFooter.tsx:116` (inside `footer-bottom` div, after `footer-credits`)

- [ ] **Step 1: Add separator and attribution line**

Insert after the closing `</p>` of `footer-credits` (line 116) and before the closing `</div>` of `footer-bottom` (line 117):

```tsx
          <div className="footer-separator" />
          <p className="footer-attribution">
            A{' '}
            <a
              href="https://id.iit.edu/people/jeremy-alexis/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Jeremy Alexis
            </a>{' '}
            method · Crafted with ♥ in Chicago by{' '}
            <a
              href="https://www.linkedin.com/in/anuragduddu/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Anurag Duddu
            </a>
          </p>
```

- [ ] **Step 2: Verify locally**

Run: `cd frontend && npm run dev`

Open landing page, scroll to footer. Verify:
1. Existing copyright and credits lines are unchanged
2. Hairline rule appears below credits
3. Attribution line reads: "A Jeremy Alexis method · Crafted with ♥ in Chicago by Anurag Duddu"
4. Hovering over "Jeremy Alexis" shows teal highlighter background
5. Hovering over "Anurag Duddu" shows teal highlighter background
6. "Jeremy Alexis" links to https://id.iit.edu/people/jeremy-alexis/
7. "Anurag Duddu" links to https://www.linkedin.com/in/anuragduddu/
8. On mobile viewport (≤480px), text is centered and smaller

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/landing/LandingFooter.tsx
git commit -m "feat: add attribution line to landing footer for Jeremy Alexis and Anurag Duddu"
```
