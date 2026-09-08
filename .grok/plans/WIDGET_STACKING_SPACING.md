# Plan: Widget stacking and title spacing

**Date**: 2026-09-04
**Task**: Keep the active turn row visible above host overlays and inset the “Turn traces” title from the panel edge.
**Priority**: High
**Estimated Effort**: 1 hour / 4 steps

## 1. Context & Requirements
- **Goal**: `button.tt-turn-item.active` paints above the overlay host (`z-index: 99999`). `#debug-panel-title` / `.tt-title` has horizontal inset from the card edge. Both live in the widget Shadow DOM.
- **Constraints**: Shadow DOM + DaisyUI **4.12.10** `full.min.css` only. No Tailwind CDN / JIT. HTML utilities `px-3`, `py-2`, `ml-2`, `m-0`, `z-20`, `z-[50]` are **not** in `full.min.css` (confirmed against the published file). Spacing and stacking must be real rules in `src/widget.css`.
- **Assumptions**: Live DevTools found `button.tt-turn-item.active` at `position: static; z-index: auto` (so `z-index` was ignored), `h2#debug-panel-title` at `margin-left: 0`, header `padding-left: 0`, and a `position: fixed; z-index: 99999` overlay (the `#zeus-trace-host` overlay mount).
- **Out of Scope**: CDN republish. Raising every in-panel layer to 100000. Tailwind rebuild.

## 2. Analysis & Research
- Key files explored: `src/widget.css`, `src/widget.html`, `src/bootstrap.js`, `src/widget.css.test.js`, `src/style_guide.test.js`, `.grok/guides/STYLE_HTML_CSS.md` §9.3, `.grok/plans/TURN_DROPDOWN_ZINDEX.md`
- Potential risks/edge cases:
  - `position: static` ignores `z-index` → Mitigation: `position: relative` on the active row
  - Inner `z-index: 100000` does not escape the overlay host stacking context → Mitigation: still apply it so the row wins in-shadow paint order (tabs, later siblings); host stays `99999` so embed stacking vs the page is unchanged
  - HTML `px-3 py-2` on `.tt-header` is a no-op → Mitigation: author `padding: 8px 12px` on `.tt-header` (style-guide recipe) **and** `margin-left: 8px` on `.tt-title` (live inset)
  - Combining header padding (12px) + title margin (8px) is 20px left vs 12px right → Accepted: title was the flush element; close/actions keep the 12px header inset
- Alternatives considered:
  - Tailwind `ml-2` / `px-3` in markup — rejected; those classes are missing from shadow `full.min.css`
  - Bump overlay host from `99999` to `100000` — deferred; the live patch targeted the active row, not the host

## 3. Step-by-Step Implementation Plan
1. **Shadow CSS**
   - Files to change: `src/widget.css`
   - Changes:
     - `.tt-header { padding: 8px 12px }` (missing style-guide recipe; `px-3 py-2` no-op)
     - `.tt-title { margin-left: 8px }`
     - `button.tt-turn-item.active { position: relative; z-index: 100000 }`
   - Tests needed: computed `position` / `z-index` / `margin-left` / header padding

2. **Contract tests**
   - Files: `src/widget.css.test.js`, `src/style_guide.test.js`
   - Changes: assert source + `getComputedStyle` for the three rules
   - Commands to run: `npx vitest run src/widget.css.test.js src/style_guide.test.js`

3. **Guides**
   - Files: `.grok/guides/STYLE_HTML_CSS.md`, `.grok/guides/V1_INSPECTOR.md`
   - Changes: header recipe + lessons-learned row; inspector debug table

4. **Verify**
   - Commands: `npx vitest run src/widget.css.test.js src/style_guide.test.js`
   - Manual: overlay + docked playground if a server is up

## 4. Verification & Rollback
- **Tests**: `npx vitest run src/widget.css.test.js src/style_guide.test.js`
- **Review Checklist**:
  - [x] `npx vitest run` — 111 tests passed
  - [x] No breaking changes
  - [x] Feature guide created or updated in `.grok/guides/STYLE_HTML_CSS.md`
- **Rollback Plan**: revert `src/widget.css` header/title/active-item rules and the new tests.

## 5. Open Questions / Decisions Needed
- None. Overlay host stays `z-index: 99999`; active row uses `100000` inside the shadow.
