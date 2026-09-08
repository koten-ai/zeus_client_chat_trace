# Guide: Zeus Tracer v1 Inspector

**Date**: 2026-09-02
**Feature**: Redesign the embeddable tracer as a v1.0.0 inspector aligned with `zeus_client` Turn traces and `kotenai-zeus-client` 2.3.0
**Status**: Active
**Related Plan**: `.grok/plans/WIDGET_STYLE_HTML_CSS.md` (chrome); `.grok/plans/TURN_DROPDOWN_ZINDEX.md` (picker stacking); `.grok/plans/WIDGET_STACKING_SPACING.md` (active row + title inset); `.grok/plans/1_V1_INSPECTOR_REDESIGN.md` (ingest); hops Bytes: `.grok/plans/HOPS_BYTES_DISPLAY.md`; copy: `.grok/plans/CLICK_TO_COPY.md`

## 1. Overview
- **Purpose**: Ship an embeddable inspector (not stacked cards) that hosts can drop in with one script tag.
- **Scope**: Overlay default + optional docked mount; v2.3.0 debug ingest; Detective IA tabs (Overview · Diagnosis · Prompt · Timeline · Tools · Session · Raw). Excludes changing Python projectors and replacing the sample app's in-tree JS. Chrome: `.grok/guides/STYLE_HTML_CSS.md`.
- **Entry points**: `dist/zeus_client_chat_trace.js`, `dev/index.html` (`npm start` → http://localhost:5199/), `examples/embed.html`, `sketches/v1-overlay-inspector/index.html`

## 2. Architecture & Flow
- **High-level flow**: Host search → `appendTraceCard` → `coerceTraceEntry` → `normalizeTurnEntry` → inspector render inside Shadow DOM.
- **Key components**:
  - `src/normalize.js` — payload coerce (legacy `trace` or `debug.public_trace`)
  - `src/panel.js` — turn dropdown + tabs (shadow-scoped)
  - `src/helpers.js` — waterfall, spans synthesis, gather, job units
  - `src/trace.js` — overlay toggle / docked always-open
  - `src/bootstrap.js` — kill switch, mount modes
- **Data flow**: `TurnResult.debug` (2.3.0) or sample-app `trace_payload` → view-model → DOM. G2 keys stripped. `business_rules_triggers` object-only.
- **Hop Bytes**: `normalizeHops` fills the Hops table from `bytes` / `byte_size` / `result_bytes` / `content_length`, then a matching tool step, then UTF-8 of `result_json` / `res` / `snippet`. `result_size` is a row count and is never used as Bytes.
- **Dependencies**: esbuild IIFE bundle; DaisyUI 4.12.10 in shadow; optional jsnview CDN.

## 3. Setup
- **Prerequisites**: Node.js 18+, npm
- **Environment variables**: `ZEUS_API_URL`, `ZEUS_AUTH_TOKEN`, `HUB_BASE_URL` (build-time defaults, optional)
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
  3. Inspect Overview / Diagnosis / Prompt / Timeline / Tools / Session / Raw
- **Examples**: `dev/index.html` (full-page playground); `examples/embed.html` (host embed; legacy, v2.3.0, fail, cache, job); `../demo_travel_sample` vendors **1.2.3** (`scripts/vendor_trace.sh`)
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
  | Unstyled DaisyUI | jsdelivr blocked or DaisyUI not in shadow | Inspect shadow for daisyui@4.12.10 `<link>`; same CSP as jsnview |
| Unstyled inspector (rules missing) | Unclosed rule in `widget.css` nested all `.tt-*` under `.vbar-col .n` | Rebuild after `src/widget.css` brace fix; `npm test` includes brace-balance |
  | Turn dropdown hides behind tabs | HTML `z-20` / `z-[50]` no-ops in shadow (DaisyUI `full.min.css` has no Tailwind `z-*`); DaisyUI `.tab` is `position: relative` and later in the tree | `widget.css` `.tt-turn-picker { z-index: 20 }`, `.dropdown-content { z-index: 50 }`, `.tt-tabs { z-index: 0 }` |
  | Active turn row hidden under overlay | `button.tt-turn-item.active` is `position: static` so `z-index` is ignored; overlay host is `z-index: 99999` | `widget.css` `button.tt-turn-item.active { position: relative; z-index: 100000 }` |
  | “Turn traces” flush to the card edge | Header `padding-left` is `0`; HTML `px-3` / `ml-2` are not in shadow `full.min.css` | `widget.css` `.tt-header { padding: 8px 12px }` and `.tt-title { margin-left: 8px }` |
  | Overview IDs look like buttons; Diagnosis/Prompt/Tools cards messy; Raw Copy JSON unaligned | DaisyUI `full.min.css` has **no Tailwind utilities**; envelope IDs were `btn`; `.det-diag-card` padding fought `card-body`; `.stat-value` is 2.25rem | `copyValueRow` text+icon; nested diagnosis cards; layout in `widget.css` (see `.grok/guides/STYLE_HTML_CSS.md`) |
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
  - `sketches/v1-overlay-inspector/` — superseded v1 IA mockup
  - `.grok/guides/STYLE_HTML_CSS.md` — DaisyUI chrome spec
  - `examples/embed.html` — host-page demo
  - `dev/index.html` — local-only playground
- **Tickets**: ZC-31 (original embed); sample-app inspector ZC-68
- **Commits**: (fill at merge)
- **Pull requests**: (fill at merge)

## 7. Changelog
| Date | Author | Change |
|------|--------|--------|
| 2026-09-08 | Grok | Package **1.2.3**; CDN `…/1.2.3/` + `latest`; pin TravelPlan `/static/?v=1.2.3` (Turn traces UI detail) |
| 2026-09-08 | Grok | Envelope/Session IDs are text + copy icon; Diagnosis nested cards; Prompt/Tools/Raw card layout in `widget.css` (DaisyUI full.min.css has no Tailwind utilities) |
| 2026-09-04 | Grok | Package **1.2.2**; CDN `…/1.2.2/` + `latest`; pin TravelPlan `/static/?v=1.2.2` (active-row stacking + title inset) |
| 2026-09-04 | Grok | Active turn row `position: relative; z-index: 100000`; header padding `8px 12px` + title `margin-left: 8px` (shadow has no Tailwind `px-*` / `ml-*`) |
| 2026-09-03 | Grok | Turn dropdown `z-index` in `widget.css` so the open list paints above the tab strip |
| 2026-09-03 | Grok | Package **1.2.1** (turn dropdown); CDN `…/1.2.1/` + `latest`; pin TravelPlan `/static/?v=1.2.1` |
| 2026-09-02 | Grok | Package **1.2.0**; pin into `demo_travel_sample` `/static/zeus_client_chat_trace.js?v=1.2.0` |
| 2026-09-02 | Grok | Light DaisyUI Detective IA in Shadow DOM; title Turn traces; tabs Overview→Raw |
| 2026-08-25 | Grok | Hops `Bytes`: resolve aliases, matching tool-step `bytes`, or UTF-8 of `result_json`/`res`/`snippet` (never `result_size`) |
| 2026-08-25 | Grok | Raw tab jsnview uses inspector `--tt-mono` 11px (same as Hops/LLM dumps) |
| 2026-08-25 | Grok | Pin 1.0.0 into sibling `demo_travel_sample` (`/static/zeus_client_chat_trace.js?v=1.0.0`) |
| 2026-08-25 | Grok | Fix tracer UI: close unclosed `.vbar-col .n` (CSS nesting hid all `.tt-*` rules); restore vbar labels; `display:block` after `all: initial` |
| 2026-08-25 | Grok | Local playground: `npm start` → http://localhost:5199/ |
| 2026-08-25 | Grok | Click-to-copy: delegated `data-copy` / `data-copy-from`, sync clipboard fallback, toast inside the panel |
| 2026-08-25 | Grok | Package / CDN version **1.1.0** |
| 2026-08-21 | Grok | Initial v1.0.0 inspector guide |
