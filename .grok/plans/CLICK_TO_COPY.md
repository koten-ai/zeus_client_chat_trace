# Plan: Fix click-to-copy buttons

**Date**: 2026-08-25
**Task**: Make every inspector copy control actually write the clipboard and show visible feedback.
**Priority**: High
**Estimated Effort**: 2 hours / 4 steps

## 1. Context & Requirements
- **Goal**: Session IDs, turn IDs, req IDs, Copy all, hop/LLM/inject/raw Copy, support pack, and decomp Copy all write the clipboard from overlay (Shadow DOM) and docked mounts. User sees a toast inside the panel plus a brief copied state on the control.
- **Constraints**: Widget lives in Shadow DOM. `navigator.clipboard.writeText` often rejects (`NotAllowedError`) or is missing; a rejection handler runs after user activation is gone, so a late `execCommand` fallback also fails. Must copy synchronously during the click.
- **Assumptions**: Light-DOM jsdom tests currently pass because they stub `clipboard.writeText`. The playground/embed fail in a real browser.
- **Out of Scope**: Host-page copy UI, jsnview tree copy, Hub Detective navigation.

## 2. Analysis & Research
- Key files explored: `src/panel.js`, `src/helpers.js`, `src/widget.html`, `src/widget.css`, `src/trace.js`, `src/bootstrap.js`, `src/trace.test.js`
- Potential risks/edge cases:
  - Shadow DOM + async clipboard → Mitigation: sync `execCommand` on a light-DOM textarea **during the click**, then also try `clipboard.writeText`
  - Per-render listeners on Copy JSON buttons vs innerHTML replace → Mitigation: delegate `data-copy` / `data-copy-from` / `data-action` on the widget root
  - Toast `position:fixed` as a sibling of a 0-size overlay root → Mitigation: toast `position:absolute` inside `.tt-panel-inner`
  - `prettyJSON(undefined)` returns `undefined` so Copy toasts “Nothing to copy” → Mitigation: always return a string
- Alternatives considered: Keep per-button listeners (fragile after tab re-render) vs one delegated click path (this plan).

## 3. Step-by-Step Implementation Plan
1. **Robust clipboard helper**
   - Files to change: `src/helpers.js`
   - Changes: `copyToClipboard` (sync execCommand first, then Clipboard API); `prettyJSON` always returns a string; `escapeHtml` encodes quotes for attributes
   - Tests needed: [x] helper unit tests; panel click tests with clipboard missing

2. **Delegate every copy control**
   - Files to change: `src/panel.js`, `src/widget.html`, `src/helpers.js` (decomp button)
   - Changes: `root` click handler for `[data-copy]`, `[data-copy-from]`, `copy-all` / `copy-pack` / `copy-decomp`; drop per-render Copy listeners; titles “Click to copy”; `is-copied` flash
   - Tests needed: [x] every copy surface

3. **Visible feedback**
   - Files to change: `src/widget.html`, `src/widget.css`
   - Changes: toast inside panel; `.is-copied` styles
   - Tests needed: [ ]

4. **Docs + playground verify**
   - Files to change: `.grok/guides/V1_INSPECTOR.md`, `.grok/guides/EMBEDDABLE_TRACE_WIDGET.md`
   - Commands to run: `npm test`; playground click-through
   - Tests needed: [x]

## 4. Verification & Rollback
- **Tests**: `npm test` (86 passed, including `helpers.copy.test.js` and `panel.copy.test.js`); Chromium playground docked + overlay — every copy control wrote the clipboard and showed an in-panel toast
- **Review Checklist**:
  - [x] Code style/linting passes
  - [x] No breaking changes
  - [x] Feature guide created or updated in `.grok/guides/CLICK_TO_COPY.md` and `.grok/guides/V1_INSPECTOR.md`
- **Rollback Plan**: revert `src/helpers.js`, `src/panel.js`, `src/widget.html`, `src/widget.css`, copy tests, guides

## 5. Open Questions / Decisions Needed
- None — sync-first copy is the established Shadow DOM workaround (textarea on `document.body`).
