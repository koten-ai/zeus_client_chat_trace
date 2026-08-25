# Guide: Zeus Tracer v1 Inspector

**Date**: 2026-08-21
**Feature**: Redesign the embeddable tracer as a v1.0.0 inspector aligned with `zeus_client` Turn traces and `kotenai-zeus-client` 2.3.0
**Status**: Active
**Related Plan**: `.grok/plans/1_V1_INSPECTOR_REDESIGN.md`; hops Bytes: `.grok/plans/HOPS_BYTES_DISPLAY.md`; copy: `.grok/plans/CLICK_TO_COPY.md`

## 1. Overview
- **Purpose**: Ship an embeddable inspector (not stacked cards) that hosts can drop in with one script tag.
- **Scope**: Overlay default + optional docked mount; v2.3.0 debug ingest; diagnosis / hops / LLM I/O / inject / detective / raw. Excludes changing Python projectors and replacing the sample app's in-tree JS.
- **Entry points**: `dist/zeus_client_chat_trace.js`, `dev/index.html` (`npm start` → http://localhost:5199/), `examples/embed.html`, `sketches/v1-overlay-inspector/index.html`

## 2. Architecture & Flow
- **High-level flow**: Host search → `appendTraceCard` → `coerceTraceEntry` → `normalizeTurnEntry` → inspector render inside Shadow DOM.
- **Key components**:
  - `src/normalize.js` — payload coerce (legacy `trace` or `debug.public_trace`)
  - `src/panel.js` — list + tabs (shadow-scoped)
  - `src/helpers.js` — waterfall, spans synthesis, gather, job units
  - `src/trace.js` — overlay toggle / docked always-open
  - `src/bootstrap.js` — kill switch, mount modes
- **Data flow**: `TurnResult.debug` (2.3.0) or sample-app `trace_payload` → view-model → DOM. G2 keys stripped. `business_rules_triggers` object-only.
- **Hop Bytes**: `normalizeHops` fills the Hops table from `bytes` / `byte_size` / `result_bytes` / `content_length`, then a matching tool step, then UTF-8 of `result_json` / `res` / `snippet`. `result_size` is a row count and is never used as Bytes.
- **Dependencies**: esbuild IIFE bundle; optional jsnview CDN; no DaisyUI.

## 3. Setup
- **Prerequisites**: Node.js 18+, npm
- **Environment variables**: `ZEUS_API_URL`, `ZEUS_AUTH_TOKEN` (build-time defaults, optional)
- **Install / bootstrap steps**:
  1. `npm install && npm run build`
  2. `npm start` → http://localhost:5199/ (local playground; `?mount=overlay` for floating chrome)
  3. Host demo: http://localhost:5199/examples/embed.html
  4. Mockup: `npx serve sketches -p 5200`
- **Configuration**: `ZeusTraceConfig.enabled`, `hubBaseUrl`, `mount` (`overlay`|`docked`), `mountSelector`
- **Verification**: `npm test`; lightning toggle appears with `?debug=true` or `enabled: true`

## 4. How to Use
- **Primary workflow**:
  1. Load the bundle with `enabled: true` or `?debug=true`
  2. After each Zeus turn, `appendTraceCard(question, { ...response, trace | debug })`
  3. Inspect Timeline / Hops / LLM / Inject / Detective / Raw
- **Examples**: `dev/index.html` (full-page playground); `examples/embed.html` (host embed; legacy, v2.3.0, fail, cache, job); `../demo_travel_sample` vendors **1.0.0** (`scripts/vendor_trace.sh`)
- **Edge cases**: Missing spans are synthesized from hops/steps; job traces switch the list to units
- **Limitations**: Shadow internals are not a public API (breaking at 1.0.0 vs 0.1.x cards). Job UI is display-only (`multi_agent=docs`).

## 5. Debugging & Known Issues
- **Common symptoms → causes → fixes**:
  | Symptom | Likely Cause | Fix |
  |---------|--------------|-----|
  | No host / panel | Kill switch off | `?debug=true` or `enabled: true` |
  | Empty hops / LLM | Host sent neither hops nor steps | Check `trace_payload` / `debug.hops` |
  | Hops `Bytes` is `—` | Hop has no size field, no matching `steps[].bytes`, and no `result_json` / `res` / `snippet` body | Confirm Python hop includes `result_json` or `bytes`; `result_size` is row count, not bytes |
  | Detective hidden | No `hubBaseUrl` / session id | Set Hub origin; pass `session_id` |
  | DaisyUI 404 | Stale 0.1.x expectation | v1 does not load DaisyUI |
| Unstyled inspector (no dark grid / metrics) | Unclosed rule in `widget.css` nested all `.tt-*` under `.vbar-col .n` | Rebuild after `src/widget.css` brace fix; `npm test` includes brace-balance |
  | Copy / click-to-copy does nothing | `clipboard.writeText` rejected in Shadow DOM after user activation was gone | Current build copies with sync `execCommand` first; see `.grok/guides/CLICK_TO_COPY.md` |
- **Debug checklist**:
  - [ ] `ZeusTrace.config` after ready
  - [ ] Shadow root on `#zeus-trace-host`
  - [ ] Fixture buttons on embed demo
- **Known issues**: None at ship. Sample app still vendors its own `trace_panel.js` (follow-up: docked consume).
- **Logging & observability**: Browser console `[ZeusTrace] Failed to mount widget`

## 6. Related Artifacts
- **Files changed / owned by this feature**:
  - `src/widget.html` / `src/widget.css` — overlay inspector chrome
  - `src/panel.js` / `src/helpers.js` / `src/normalize.js` — inspector + 2.3.0 ingest
  - `src/trace.js` / `src/bootstrap.js` / `src/config.js` — mount API
  - `sketches/v1-overlay-inspector/` — locked mockup
  - `examples/embed.html` — host-page demo
  - `dev/index.html` — local-only playground
- **Tickets**: ZC-31 (original embed); sample-app inspector ZC-68
- **Commits**: (fill at merge)
- **Pull requests**: (fill at merge)

## 7. Changelog
| Date | Author | Change |
|------|--------|--------|
| 2026-08-25 | Grok | Hops `Bytes`: resolve aliases, matching tool-step `bytes`, or UTF-8 of `result_json`/`res`/`snippet` (never `result_size`) |
| 2026-08-25 | Grok | Raw tab jsnview uses inspector `--tt-mono` 11px (same as Hops/LLM dumps) |
| 2026-08-25 | Grok | Pin 1.0.0 into sibling `demo_travel_sample` (`/static/zeus_client_chat_trace.js?v=1.0.0`) |
| 2026-08-25 | Grok | Fix tracer UI: close unclosed `.vbar-col .n` (CSS nesting hid all `.tt-*` rules); restore vbar labels; `display:block` after `all: initial` |
| 2026-08-25 | Grok | Local playground: `npm start` → http://localhost:5199/ |
| 2026-08-25 | Grok | Click-to-copy: delegated `data-copy` / `data-copy-from`, sync clipboard fallback, toast inside the panel |
| 2026-08-25 | Grok | Package / CDN version **1.1.0** |
| 2026-08-21 | Grok | Initial v1.0.0 inspector guide |
