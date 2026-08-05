# Plan: Trace Card Collapse

**Date**: 2026-08-05
**Task**: Make each `.trace-card` collapsible via its head  
**Priority**: Medium  
**Estimated Effort**: 0.5 hours / 3 steps

## 1. Context & Requirements
- **Goal**: Clicking a trace card head collapses/expands the card body; head stays visible with chevron + a11y attrs.
- **Constraints**: Shadow DOM widget; keep existing card content/layout; no DaisyUI dependency for card chrome.
- Assumptions: Cards start expanded; collapse is per-card only (not persisted). Expanded body scrolls internally (`max-height: min(45vh, 480px)`).
- Out of Scope: Collapse-all chrome; remembering collapse across reloads; custom per-card body heights.

## 2. Analysis & Research
- Key files explored: `src/trace.js`, `src/widget.css`, `src/trace.test.js`
- Potential risks/edge cases:
  - Head was a `div` → convert to `button` for keyboard/a11y → Mitigation: reset button styles in CSS
  - Nested DaisyUI collapses in body still work when expanded → Mitigation: only hide body container
- Alternatives considered: DaisyUI collapse on whole card (heavier, CSS coupling) vs lightweight `is-collapsed` class (chosen)

## 3. Step-by-Step Implementation Plan
1. **Wire head toggle in appendTraceCard**  
   - Files: `src/trace.js`
   - Changes: head=`button`; `aria-expanded`/`aria-controls`; chevron; click toggles `.is-collapsed`
2. **CSS for button head + collapsed body**  
   - Files: `src/widget.css`
3. **Tests + guide**  
   - Files: `src/trace.test.js`, `.grok/guides/EMBEDDABLE_TRACE_WIDGET.md`

## 4. Verification & Rollback
- **Tests**: `npm test`; `npm run build`
- **Review Checklist**:
  - [x] Code style/linting passes
  - [x] No breaking changes
  - [x] Feature guide created or updated in `.grok/guides/EMBEDDABLE_TRACE_WIDGET.md`
- **Rollback Plan**: Revert the three source files above

## 5. Open Questions / Decisions Needed
- None
