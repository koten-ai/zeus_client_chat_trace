# Plan: Turn dropdown stacks above tab navigation

**Date**: 2026-09-03
**Task**: Stop the open turn picker from painting under the Overview…Raw tab strip.
**Priority**: High
**Estimated Effort**: 0.5 hours / 3 steps

## 1. Context & Requirements
- **Goal**: Open `#tt-turn-dropdown` list sits above `.tt-tabs` (and tab panels) in both overlay and docked mounts.
- **Constraints**: Shadow DOM + DaisyUI **4.12.10** `full.min.css` only. No Tailwind CDN / JIT, so HTML utilities `z-20` and `z-[50]` do not exist.
- **Assumptions**: Symptom is stacking, not `overflow` clipping of `#tt-body`.
- **Out of Scope**: Search inside the picker. CDN republish.

## 2. Analysis & Research
- Key files: `src/widget.css`, `src/widget.html`, `src/widget.css.test.js`, `.grok/guides/STYLE_HTML_CSS.md`
- Potential risks/edge cases:
  - DaisyUI `.tab { position: relative }` + later DOM order paints over `position: absolute` `.dropdown-content` with `z-index: auto` → Mitigation: stacking context on `.tt-turn-picker`
  - `z-20` / `z-[50]` in markup are no-ops in shadow (`full.min.css` has no those utilities) → Mitigation: real `z-index` in `widget.css`
- Alternatives considered: Raise only `.dropdown-content` — rejected; a child `z-index: 50` still loses to later siblings if the picker itself stays `auto`.

## 3. Step-by-Step Implementation Plan
1. **CSS stacking**
   - Files to change: `src/widget.css`
   - Changes: `.tt-turn-picker { position: relative; z-index: 20 }`; `.dropdown-content { z-index: 50 }`; `.tt-tabs { z-index: 0 }`
   - Tests needed: computed `z-index` picker > tabs

2. **Contract tests + guide**
   - Files: `src/widget.css.test.js`, `src/style_guide.test.js`, `.grok/guides/STYLE_HTML_CSS.md`, `.grok/guides/V1_INSPECTOR.md`
   - Changes: assert stacking; document that shadow has no Tailwind `z-*` JIT

3. **Verify**
   - Commands: `npx vitest run src/widget.css.test.js src/style_guide.test.js`

## 4. Verification & Rollback
- **Tests**: `npx vitest run src/widget.css.test.js src/style_guide.test.js`
- **Review Checklist**:
  - [x] Code style/linting passes
  - [x] No breaking changes
  - [x] Feature guide created or updated in `.grok/guides/STYLE_HTML_CSS.md`
- **Rollback Plan**: revert `widget.css` z-index rules and the new tests.

## 5. Open Questions / Decisions Needed
- None.
