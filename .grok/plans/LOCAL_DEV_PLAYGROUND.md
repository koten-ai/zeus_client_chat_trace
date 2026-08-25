# Plan: Local Dev Playground

**Date**: 2026-08-25
**Task**: Give developers a local-only HTML page that opens the trace widget directly in the browser while working on this app.
**Priority**: Medium
**Estimated Effort**: 1 hour / 4 steps

## 1. Context & Requirements
- **Goal**: `npm start` serves a full-page inspector at `http://localhost:5199/` that is never published to CDN. Developers can load fixtures, paste JSON, and switch overlay vs docked without embedding the widget in a host app.
- **Constraints**: Vanilla HTML + existing `npx serve` / esbuild watch. No extra runtime deps. Widget still mounts via `dist/zeus_client_chat_trace.js`.
- **Assumptions**: `examples/embed.html` stays the public host-integration demo. This playground is a development harness only.
- **Out of Scope**: Live-reload WebSocket, Playwright, publishing `dev/` to Spaces, changing widget APIs.

## 2. Analysis & Research
- Key files explored: `package.json`, `serve.json`, `esbuild.config.mjs`, `examples/embed.html`, `src/bootstrap.js`, `src/widget.css` (docked mount)
- Potential risks/edge cases:
  - Stale `dist/` while watching → no-store headers + cache-bust query on the script tag
  - Kill switch defaults off → playground sets `enabled: true`
  - First request before watch build → `npm start` runs an initial build, then watch + serve
  - `ZeusTrace.clear` never attached when `document.body` already exists → assign `window.ZeusTrace` before `mountWidget()`
- Alternatives considered: gitignored personal HTML (not shareable); esbuild `serve` (no path rewrites); only document existing `embed.html` (does not fill the viewport as the widget)

## 3. Step-by-Step Implementation Plan
1. **Playground page**
   - Files to change: `dev/index.html` (new)
   - Changes: Docked full-viewport inspector, fixture buttons, paste JSON, clear, overlay/docked toggle
   - Commands to run: none
   - Tests needed: [ ] manual load

2. **Local server entry**
   - Files to change: `scripts/dev.mjs` (new), `package.json`, `serve.json`
   - Changes: `npm start` = build + watch + serve; rewrite `/` to playground; no-store for `dist/`
   - Commands to run: `npm start`
   - Tests needed: [ ] curl `/` and `/dev/index.html`

3. **Docs**
   - Files to change: `README.md`, `.grok/guides/LOCAL_DEV_PLAYGROUND.md`, `.grok/guides/EMBEDDABLE_TRACE_WIDGET.md`, `.grok/guides/V1_INSPECTOR.md`
   - Changes: Document the local-only URL and that it is not on CDN
   - Tests needed: [ ]

4. **Verify**
   - Files to change: none
   - Changes: curl the playground; confirm script + fixtures; run existing tests
   - Commands to run: `npm test`; `curl -sI http://localhost:5199/`
   - Tests needed: [x]

## 4. Verification & Rollback
- **Tests**: `npm test` (59 passed); curl `/` → `dev/index.html`; jsdom load of docked/overlay/paste/clear
- **Review Checklist**:
  - [x] Code style/linting passes
  - [x] No breaking changes
  - [x] Feature guide created or updated in `.grok/guides/LOCAL_DEV_PLAYGROUND.md`
- **Rollback Plan**: Remove `dev/`, `scripts/dev.mjs`, revert `package.json` / `serve.json` / README / guides

## 5. Open Questions / Decisions Needed
- None — playground is local-only and does not change the embed contract.

---
