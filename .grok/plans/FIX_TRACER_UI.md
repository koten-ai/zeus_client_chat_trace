# Plan: Fix Tracer UI

**Date**: 2026-08-25
**Task**: Restore the v1 inspector chrome so the playground and overlay match the locked sketch instead of unstyled / collapsed layout.
**Priority**: High
**Estimated Effort**: 1 hour / 4 steps

## 1. Context & Requirements
- **Goal**: Inspector paints with `.tt-*` tokens (dark panel, 2-column body, metrics, tabs). Docked mount fills the host. Tool-frequency chart labels render.
- **Constraints**: No DaisyUI. Keep public embed API. Sketch at `sketches/v1-overlay-inspector/` is visual source of truth.
- **Assumptions**: User saw the broken playground after `npm start`. Root cause is CSS, not ingest.
- **Out of Scope**: Live-reload, new tabs, payload shape changes.

## 2. Analysis & Research
- Key files explored: `src/widget.css`, `src/widget.html`, `src/bootstrap.js`, `src/helpers.js`, `sketches/v1-overlay-inspector/index.html`
- Potential risks/edge cases:
  - Unclosed `.vbar-col .n` at `src/widget.css:230` → CSS nesting puts **all** inspector rules under `.vbar-col .n`, so `.tt-panel` never matches → Mitigation: close the rule; add a brace-balance test
  - DaisyUI `hsl(var(--b3))` on leftover vbar → transparent borders on dark UI → Mitigation: restyle vbar with `--tt-*`
  - Missing `.vbar-labels` after the rewrite → x-axis verbs missing → Mitigation: restore labels CSS
  - `:host { all: initial }` sets `display: inline` → docked slot may not fill → Mitigation: `display: block` after `all`
  - Author `display: grid/flex` on `.tt-body` / `.tt-session` / `.tt-badge` overrides the HTML `hidden` attribute → Mitigation: `[hidden] { display: none !important }`
- Alternatives considered: Rewrite CSS from the sketch only (large diff) vs surgical brace + leftover-chart fix (this plan).

## 3. Step-by-Step Implementation Plan
1. **Close the nested CSS trap and restyle leftover chart**
   - Files to change: `src/widget.css`
   - Changes: close `.vbar-col .n`; restore `.vbar-labels`; replace DaisyUI hsl; dark waterfall track default
   - Tests needed: [x] brace-balance

2. **Host display**
   - Files to change: `src/widget.css`, `src/bootstrap.js`
   - Changes: `display: block` after `all: initial` on `:host` / `.zeus-trace-root` and created hosts
   - Tests needed: [ ]

3. **Regression test + docs**
   - Files to change: `src/widget.css.test.js`, `.grok/guides/V1_INSPECTOR.md`, `.grok/guides/LOCAL_DEV_PLAYGROUND.md`
   - Changes: fail if `widget.css` braces are unbalanced; document the nesting symptom
   - Tests needed: [x]

4. **Verify**
   - Commands to run: `npm test`; jsdom load of playground after rebuild
   - Tests needed: [x]

## 4. Verification & Rollback
- **Tests**: `npm test` (62 passed, including brace-balance and `[hidden]` vs `display:grid`); playground v2.3.0 fixture shows session, metrics, tabs, waterfall
- **Review Checklist**:
  - [x] Code style/linting passes
  - [x] No breaking changes
  - [x] Feature guide created or updated in `.grok/guides/V1_INSPECTOR.md`
- **Rollback Plan**: revert `src/widget.css`, `src/bootstrap.js`, `src/widget.css.test.js`

## 5. Open Questions / Decisions Needed
- None — unclosed rule is a confirmed parse error (`opens 225 / closes 224`, first unclosed at line 230).
