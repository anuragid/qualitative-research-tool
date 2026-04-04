# Footer Attribution Line

## Summary

Add a personal attribution line to the landing page footer crediting Jeremy Alexis (method creator) and Anurag Duddu (builder). Sits below the existing institutional credit, separated by a hairline rule. Names are hyperlinked with a teal highlighter hover effect.

## Copy

> A [Jeremy Alexis](https://id.iit.edu/people/jeremy-alexis/) method · Crafted with ♥ in Chicago by [Anurag Duddu](https://www.linkedin.com/in/anuragduddu/)

## Placement

Third line in `footer-bottom`, below the existing two lines:
1. `© 2026 methodex. All rights reserved.` (unchanged)
2. `Built at the Institute of Design, Illinois Institute of Technology` (unchanged)
3. _(hairline rule)_
4. **New:** `A Jeremy Alexis method · Crafted with ♥ in Chicago by Anurag Duddu`

## Styling

### Hairline separator
- `height: 1px`
- `background: rgba(255, 255, 255, 0.08)`
- `margin-top: 16px; margin-bottom: 12px`

### Attribution text
- `font-size: 12px` (one step below the 13px credits)
- `color: rgba(255, 255, 255, 0.35)` — dimmer than existing credits
- `letter-spacing: 0.02em`

### Name links (base state)
- `color: rgba(255, 255, 255, 0.5)`
- `text-decoration: none`
- `padding: 2px 4px; margin: -2px -4px` (negative margin so highlight doesn't shift layout)
- `border-radius: 2px`
- `transition: all 0.2s ease`

### Name links (hover state — teal highlighter)
- `background: rgba(13, 148, 136, 0.25)`
- `color: rgba(255, 255, 255, 0.8)`

### Heart symbol
- Same color as surrounding text, no special treatment
- Uses `♥` HTML entity

### Responsive
- Stacks and centers on mobile, same as existing `footer-bottom` behavior
- Drops to `11px` at smallest breakpoint (matching existing credits scaling)

## Files touched

1. `frontend/src/components/landing/LandingFooter.tsx` — add separator + attribution markup after existing `footer-credits`
2. `frontend/src/pages/landing-page.css` — add `.footer-attribution`, `.footer-attribution a`, `.footer-attribution a:hover`, `.footer-separator` styles + responsive overrides

## What stays the same

- Copyright line — untouched
- "Built at the Institute of Design" credit line — untouched
- About section mentioning Jeremy Alexis — untouched
- Text scramble animations — only on existing lines, not on the new attribution
- No changes to the authenticated app layout (no footer there)
