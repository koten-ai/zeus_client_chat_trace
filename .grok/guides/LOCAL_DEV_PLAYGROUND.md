# Guide: Local Dev Playground

**Date**: 2026-08-25
**Feature**: Local-only HTML page that opens the Zeus Tracer inspector in the browser while developing this app
**Status**: Active
**Related Plan**: `.grok/plans/LOCAL_DEV_PLAYGROUND.md`

## 1. Overview
- **Purpose**: Let developers see and drive the widget without embedding it in a host application. Not a production surface and not published to CDN.
- **Scope**: Full-page docked playground, overlay variant, fixture/paste/file ingest. Excludes live-reload, CDN hosting, and changes to the embed contract.
- **Entry points**: `npm start` → `http://localhost:5199/` (`dev/index.html`)

## 2. Architecture & Flow
- **High-level flow**:
  1. `scripts/dev.mjs` runs a one-shot `esbuild` build, then watch + `npx serve` on port 5199.
  2. `serve.json` rewrites `/` (and `/dev`) to `dev/index.html` and sends `Cache-Control: no-store` for `dist/**` and `dev/**`.
  3. The playground sets `ZeusTraceConfig.enabled = true` and docks into `#trace-slot` (or overlay when `?mount=overlay`).
  4. After `ZeusTrace.ready`, it auto-loads the v2.3.0 fixture and wires fixture / paste / file controls.
- **Key components**:
  - `dev/index.html` — playground UI + fixtures
  - `scripts/dev.mjs` — `npm start` orchestrator
  - `serve.json` — local static-server rewrites and no-store headers
  - `dist/zeus_client_chat_trace.js` — the widget bundle (cache-busted query on the script tag)
- **Data flow**: Fixture JSON or pasted Zeus payload → `appendTraceCard` → Shadow DOM inspector
- **Dependencies**: Node 18+, esbuild, `npx serve`. No extra npm packages.

## 3. Setup
- **Prerequisites**: Node.js 18+, npm
- **Environment variables**:
  - `PORT` — optional; static server port (default `5199`)
  - `ZEUS_API_URL` / `ZEUS_AUTH_TOKEN` / `HUB_BASE_URL` — optional build-time widget defaults (playground still sets local URLs in `ZeusTraceConfig`; Detective/Hub clicks honor that config)
- **Install / bootstrap steps**:
  1. `npm install`
  2. `npm start`
  3. Open http://localhost:5199/
- **Configuration**: Overlay vs docked is the `mount` query param. Hub/API URLs are set in `dev/index.html`.
- **Verification**: Lightning inspector fills the page with the v2.3.0 IPA fixture; fixture buttons append more turns.

## 4. How to Use
- **Primary workflow**:
  1. Run `npm start`.
  2. Open http://localhost:5199/.
  3. Click Legacy / v2.3.0 / Fail / Cache / Job, or paste / load a JSON file with `trace` or `debug`.
  4. Edit `src/`, wait for the watch rebuild, refresh the browser.
- **Examples**:
  - Docked (default): http://localhost:5199/
  - Overlay: http://localhost:5199/?mount=overlay
  - Host-page demo: http://localhost:5199/examples/embed.html
  - Serve without watch: `npm run build && npm run serve`
- **Edge cases**: Paste must be an object with `trace` or `debug`. Overlay mode hides `#trace-slot` and uses the floating toggle.
- **Limitations**: No automatic browser reload. Page is local-only (`npm run publish:cdn` uploads `dist/` only). TravelPlan does not use this playground; it vendors `dist/` via `../demo_travel_sample/scripts/vendor_trace.sh`.

## 5. Debugging & Known Issues
- **Common symptoms → causes → fixes**:
  | Symptom | Likely Cause | Fix |
  |---------|--------------|-----|
  | “Could not load /dist/…” | Bundle missing | Run `npm start` or `npm run build` |
  | Stale UI after save | Browser cache / no refresh | Hard-refresh; headers are `no-store` |
  | Unstyled inspector (plain text, no columns) | `widget.css` rule nested under unclosed `.vbar-col .n` | Rebuild `dist/`; brace-balance test in `src/widget.css.test.js` |
| Empty panel | Kill switch or missing payload | Playground forces `enabled: true`; payload needs `trace` or `debug` |
  | Port in use | Another `serve` on 5199 | `PORT=5200 npm start` |
- **Debug checklist**:
  - [ ] Terminal shows the playground URL after `npm start`
  - [ ] `GET /` returns `dev/index.html`
  - [ ] Shadow root exists on `#trace-slot` (docked) or `#zeus-trace-host` (overlay)
  - [ ] `ZeusTrace.config.enabled === true`
- **Known issues**:
  - **No live reload** — refresh after the watch rebuild prints `built` / `watching`
- **Logging & observability**: Browser console `[ZeusTrace] Failed to mount widget`; esbuild watch stdout

## 6. Related Artifacts
- **Files changed / owned by this feature**:
  - `dev/index.html` — local playground
  - `scripts/dev.mjs` — start script
  - `serve.json` — `/` rewrite + no-store
  - `package.json` — `npm start`
  - `src/bootstrap.js` — assign `ZeusTrace` before mount so `clear` / `exportBundle` attach
  - `README.md` — development URLs
- **Tickets**: none
- **Commits**: (fill at merge)
- **Pull requests**: none

## 7. Changelog
| Date | Author | Change |
|------|--------|--------|
| 2026-08-25 | Grok | Tracer UI: unclosed `.vbar-col .n` nested all inspector CSS; docked host `display:block` |
| 2026-08-25 | Grok | Initial local playground (`npm start` → http://localhost:5199/). Bootstrap assigns `ZeusTrace` before mount so Clear/export attach. |
