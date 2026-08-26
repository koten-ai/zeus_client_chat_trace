# Guide: Click to copy

**Date**: 2026-08-25
**Feature**: Every inspector copy control writes the clipboard from Shadow DOM (overlay) and docked mounts, with an in-panel toast.
**Status**: Active
**Related Plan**: `.grok/plans/CLICK_TO_COPY.md`

## 1. Overview
- **Purpose**: IDs and JSON dumps are tools. Clicking them must copy, even when `navigator.clipboard.writeText` rejects inside Shadow DOM.
- **Scope**: Session / job / turn / req IDs, Copy all, hop/LLM/inject/raw Copy, decomp Copy, support pack. Not jsnview tree internals or host-page copy UI.
- **Entry points**: Inspector controls with `title="Click to copy"`, `data-copy`, `data-copy-from`, or `data-action="copy-all"` / `copy-pack`.

## 2. Architecture & Flow
- **High-level flow**:
  1. Click bubbles to the widget root (`.zeus-trace-root`).
  2. `onRootClick` reads `data-copy` (literal), `data-copy-from` (a `<pre>`’s `textContent`), or `data-action`.
  3. `copyToClipboard` runs `document.execCommand("copy")` **synchronously** on a light-DOM textarea (user gesture still valid), then also tries `navigator.clipboard.writeText`.
  4. On success: in-panel toast + `.is-copied` on the control for 1.4s.
- **Key components**:
  - `src/helpers.js` — `copyToClipboard`, `prettyJSON` (always a string), `escapeHtml` (quotes)
  - `src/panel.js` — delegated click handler, `copyText`
  - `src/widget.html` — toast inside `#tt-panel`; Copy all is `data-action="copy-all"`
  - `src/widget.css` — toast `position:absolute` in the panel; `.is-copied`
- **Data flow**: Control → string → light-DOM textarea / Clipboard API → toast
- **Dependencies**: None. `execCommand` is the fallback when Clipboard API is missing or rejects.

## 3. Setup
- **Prerequisites**: Widget enabled (`?debug=true` or `enabled: true`)
- **Environment variables**: none
- **Install / bootstrap steps**: `npm start` → http://localhost:5199/
- **Configuration**: none
- **Verification**: Click session ID in the playground; toast at the panel bottom-right; paste matches the full ID.

## 4. How to Use
- **Primary workflow**:
  1. Click an ID chip / Copy button.
  2. Toast `✓ copied …` appears inside the inspector. Control briefly turns green.
- **Examples**:
  - Session bar ID → full `session_id` / `job_id` / preferred `req_id`
  - Turn ID metric and diagnosis chips → full IDs (not the truncated label)
  - Hops / LLM / Inject / Raw **Copy** → the JSON shown in that pane
  - **Copy all** → session bundle (`chat_id` + traces)
- **Edge cases**: Empty payload toasts `Nothing to copy`. Clipboard API reject still succeeds via `execCommand` if the browser allows it.
- **Limitations**: Some locked-down iframes block both clipboard methods (`Copy failed`).

## 5. Debugging & Known Issues
- **Common symptoms → causes → fixes**:
  | Symptom | Likely Cause | Fix |
  |---------|--------------|-----|
  | Click does nothing, no toast | Listener not on widget root / stale bundle | Rebuild; confirm `#tt-copy-all` has `data-action="copy-all"` |
  | Copy all works, ID chips do not | Stale per-button listeners / Shadow clipboard reject | Current build uses delegated `data-copy` + sync `execCommand` |
  | Toast missing | Toast was `position:fixed` outside 0-height overlay root | Toast is inside `#tt-panel` (`position:absolute`) |
  | `Copy failed` | Both clipboard methods blocked | Check iframe `allow="clipboard-write"`; copy from a top-level page |
- **Debug checklist**:
  - [ ] Control has `data-copy`, `data-copy-from`, or `data-action="copy-all|copy-pack"`
  - [ ] Click bubbles to `.zeus-trace-root`
  - [ ] `#toast` is a child of `#tt-panel`
- **Known issues**: None after this fix.
- **Logging & observability**: Toast text; `.is-copied` class on the control.

## 6. Related Artifacts
- **Files changed / owned by this feature**:
  - `src/helpers.js` — `copyToClipboard`
  - `src/panel.js` — delegated copy
  - `src/widget.html` / `src/widget.css` — toast + copied state
  - `src/helpers.copy.test.js` / `src/panel.copy.test.js`
- **Tickets**: none
- **Commits**: (fill at merge)
- **Pull requests**: none

## 7. Changelog
| Date | Author | Change |
|------|--------|--------|
| 2026-08-25 | Grok | Sync execCommand + delegated data-copy/data-copy-from; in-panel toast |
| 2026-08-25 | Grok | Published **1.0.1** to Spaces CDN (versioned + `latest`) |
| 2026-08-25 | Grok | Version **1.1.0** (package + CDN versioned path and `latest`) |
| 2026-08-26 | Grok | Version **1.1.1** (Hub-redirect config fix on CDN versioned path and `latest`) |
