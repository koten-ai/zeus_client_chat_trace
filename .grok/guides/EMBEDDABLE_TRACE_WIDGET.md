# Guide: Embeddable Trace Widget

**Date**: 2026-08-21  
**Feature**: Single-script Zeus Tracer inspector embeddable in any host page  
**Status**: Active  
**Related Plan**: `.grok/plans/1_V1_INSPECTOR_REDESIGN.md` (supersedes stacked-card `WIDGET_UI_REDESIGN.md`)

## 1. Overview
- **Purpose**: Inject a floating (or docked) Zeus Tracer inspector into third-party pages via one async script tag.
- **Scope**: Inspector UI aligned with `zeus_client` Turn traces; ingest of `kotenai-zeus-client` 2.3.0 `TurnResult.debug` / `public_trace`. Kill switch via `?debug=true` / `enabled`. Does not perform searches.
- **Entry points**: `dist/zeus_client_chat_trace.js`, `window.appendTraceCard`, `window.openDebugPanel`, `ZeusTrace.ready`

## 2. Architecture & Flow

1. Host sets `window.ZeusTraceConfig` (optional) and loads the bundle.
2. `bootstrap.js` queues early API calls, resolves **enabled** (explicit config → `?debug=` → default false).
3. If **disabled**: install no-op APIs, no DOM, resolve `ZeusTrace.ready`.
4. If **enabled**: mounts Shadow DOM on `#zeus-trace-host` (overlay) or `mountSelector` (docked). **No DaisyUI.**
5. tool-order is applied from injected `toolOrder` when present; otherwise a **background** fetch of `/api/tool-order` runs (default 3s abort) and never blocks mount.
6. Host calls `appendTraceCard(question, responseJson)` after each search (`trace` or `debug` required).
7. `normalize.js` builds a turn view-model; `panel.js` renders list + tabs (Timeline, Hops, LLM I/O, Inject, Detective, Raw). Diagnosis strip auto-opens Detective when grade ≠ pass or hop ≥ 400. Hops `Bytes` is filled from hop size fields, matching tool-step `bytes`, or UTF-8 of `result_json` / `res` / `snippet` (`result_size` is a row count, not bytes).
8. Overlay chrome: lightning toggle, close, version footer. Docked chrome hides toggle/close and fills the slot.

**Key components**:
- `src/bootstrap.js` — mount (or skip), queue, global API
- `src/trace.js` — overlay/docked facade, tool-order, toast
- `src/panel.js` — inspector (ported from `zeus_client/static/trace_panel.js`)
- `src/normalize.js` — legacy + 2.3.0 payload coerce / view-model
- `src/helpers.js` — waterfall, hops, detective formatters
- `src/config.js` — `zeusApiUrl` / `hubBaseUrl` / `enabled` / `mount` / `mountSelector`
- `src/jsnview-loader.js` — lazy CDN load for JSON viewer
- `src/widget.html` / `src/widget.css` — overlay + `.tt-*` inspector
- `sketches/v1-overlay-inspector/` — locked visual mockup

**Enabled resolution** (first decisive wins):
1. `ZeusTraceConfig.enabled` or script `data-enabled` (`true`/`false`/`1`/`0`/`yes`/`no`/`on`/`off`)
2. Page query `debug` (`?debug=true` → on; `?debug=false` → off)
3. Default **false** (no UI)

**Session ID extraction priority** (first non-empty wins):  
`session_id` → `trace.session_id` → `trace.session.id` → `trace.session.session_id` → `session.id`.

**Layer A extraction priority** (first hit wins; panel omitted if none):
1. `responseJson.layer_a`
2. `responseJson.structured_response.layer_a` (or structured_response itself if it looks like Layer A)
3. Reverse `trace.steps`: `return` / `return_result` args, then terminating `tool`/`pipeline` args or `pipeline_json`
4. Reverse `trace.tool_calls` pipeline args
5. Flat top-level keys on the response (`summary`, `confidence`, `query_decomposition`, …)

## 3. Setup

**Prerequisites**: Node.js 18+, npm

```bash
npm install
npm run build
```

**CDN publish** (DigitalOcean Spaces `koten-static-cdn` / nyc3):

```bash
# credentials: DO_SPACES_KEY + DO_SPACES_SECRET
# (optional template: scripts/spaces-static.env.example → .secrets/spaces-static.env)
npm run publish:cdn
```

| Path | URL |
|------|-----|
| Versioned (v0.1.6+) | `https://koten-static-cdn.nyc3.cdn.digitaloceanspaces.com/zeus_client_chat_trace/<version>/zeus_client_chat_trace.js` |
| Latest pointer | `https://koten-static-cdn.nyc3.cdn.digitaloceanspaces.com/zeus_client_chat_trace/latest/zeus_client_chat_trace.js` |

Prefer the **versioned** URL in production embeds (immutable cache). Use `latest` only for demos.

**Environment variables** (build-time defaults, optional):
- `ZEUS_API_URL` — default Zeus API base URL
- `ZEUS_AUTH_TOKEN` — default Bearer token
- `HUB_BASE_URL` — default Hub / Detective origin (runtime `ZeusTraceConfig.hubBaseUrl` still wins)

Copy `.env.example` to `.env` for local builds.

**Runtime config** (overrides build defaults):

```html
<script>
  window.ZeusTraceConfig = {
    zeusApiUrl: "https://zeus.example.com",
    zeusAuthToken: "optional-bearer-token",
    hubBaseUrl: "http://zeus-dev.local:9091",
    // enabled: true,  // or use ?debug=true on the host URL
  };
</script>
<script
  src="https://koten-static-cdn.nyc3.cdn.digitaloceanspaces.com/zeus_client_chat_trace/0.1.9/zeus_client_chat_trace.js"
  async
></script>
```

Or via script data attributes: `data-zeus-api-url`, `data-zeus-auth-token`, `data-hub-base-url`, `data-enabled`.

**Hub base URL (`hubBaseUrl`)** — not derived from `zeusApiUrl`. Every Detective / Hub redirect uses this origin:

| How | Example |
|-----|---------|
| `window.ZeusTraceConfig.hubBaseUrl` (or `hub_url`) | `"http://127.0.0.1:9091"` |
| Script `data-hub-base-url` | `data-hub-base-url="http://zeus-dev.local:9091"` |
| `.env` `HUB_BASE_URL` (build-time fallback) | `HUB_BASE_URL=http://127.0.0.1:9091` |
| Host build env (e.g. demo_yelp) | `VITE_HUB_BASE_URL=…` → host injects `ZeusTraceConfig` |

Resolution: window config → `data-hub-base-url` → `HUB_BASE_URL` → `""`. Empty → no tab opened. Session links: `{hubBaseUrl}/hub/debug/session/{session_id}`. Req / Detective ↗ / Open in Hub: `{hubBaseUrl}/hub/#/debug/req/{req_id}`. Clicks re-read live `ZeusTraceConfig`. Hostname `http://hub` is kept (not stripped as a `/hub` path). Verify: `window.ZeusTrace.config.hubBaseUrl`. Full steps: `README.md` § Hub base URL.

## 4. How to Use

**Primary workflow**:
1. Build or host `dist/zeus_client_chat_trace.js`.
2. Add script tag + optional `hubBaseUrl` (see above).
3. Open the host page with `?debug=true` (or set `enabled: true`).
4. After API response, ensure session id is on the payload:

```js
window.appendTraceCard(query, {
  ...data,
  session_id: data.session_id,
});
window.openDebugPanel?.();
```

**Local playground** (widget fills the browser, not published): `npm start` then open `http://localhost:5199/`. Overlay: `http://localhost:5199/?mount=overlay`. See `.grok/guides/LOCAL_DEV_PLAYGROUND.md`.

**Host-page demo**: `npm run build && npm run serve` then open `http://localhost:5199/examples/embed.html` (demo sets `enabled: true`).

**`appendTraceCard(question, j)`** requires `j.trace` object (steps, spans, tool_calls, etc.). Prefer also passing `session_id`. No-op when disabled.

**Token stats** (TOTAL area — three colored tiles matching dashboard mockup):
- Reads each step’s `usage.prompt_tokens` → **Token In**, `usage.completion_tokens` → **Token Out**, `usage.total_tokens` → **Total Tokens**
- Values sum across LLM steps in the turn (and across cards for TOTAL)
- Missing fields show `?`; if only in/out are present, total is derived as in+out
- Rendered as `#tokens-total` grid with `.stat-title` / `.stat-value` (blue / purple / green tiles); below it a full-width AI/Zeus/Other progress bar with % labels

**Trace card collapse**:
- Head is a `<button class="trace-card-head">` with `aria-expanded` / `aria-controls` pointing at `trace-card-body-{N}`
- Click toggles `.is-collapsed` on `.trace-card` and flips `aria-expanded`
- Chevron (`.tc-chevron`) rotates when collapsed; body is hidden via CSS
- Not persisted across reloads; new cards start expanded
- Expanded body is scrollable (`max-height: min(45vh, 480px)`; overflow-y auto) so the card head stays visible while long turn content scrolls
- **Layout lock (v0.1.12)**: `.trace-card` is `flex-shrink: 0` inside `.trace-list` (avoids head-only clip under `overflow: hidden`). Body direct children are `flex-shrink: 0`; `.tc-kpi-mini` uses `min-height: auto` / `height: auto` so the KPI grid cannot collapse to 0px and paint over Layer A

**Head KPI strip** (inside `div.trace-card-body`, class `stats shadow tc-kpi-mini` — gray tiles + blue value pills):

| Label | Value | Source |
|-------|--------|--------|
| MINI-SCHEMA | Yes / No | `trace.catalog.has_mini_schema`, else `## MINI-SCHEMA` in system text / detective inject |
| SCOPE BRIEF | Yes / No | `trace.catalog.has_scope_brief`, else `## SCOPE BRIEF` marker |
| LLM Rounds | integer | `trace.rounds`, else count LLM `steps` / `ai_requests` |
| Tool Calls | integer | `trace.tool_calls.length`, else count tool `steps` |
| Avg / round | seconds | `total_ms ÷ rounds` (e.g. `1.25s`); `—` if no rounds/wall |
| Edges | integer or `—` | Parse `edges_total: N` from SCOPE BRIEF / system message (scope inventory) |

Missing catalog (fast-tier / stripped payloads) → inject tiles **No**, Edges **—**. Hover a cell for tip text (`title` on each `.stat`).

**Layer A panel** (when terminate bag found — class `layer-a-panel`):
- Harvest order: `response.layer_a` → `structured_response.layer_a` → return/pipeline steps → flat keys
- Primary row: Confidence / Policy / Intent / Output / OK as key|value pills (`.la-stats-primary` keeps `.stat` / `.stat-title` / `.stat-value` hooks)
- `query_decomposition` and `decomposition` (Targets / Predicates / …) as monospaced code blocks
- Optional `business_rules_triggers` as secondary tiles
- `summary` is harvested for detection + Layer A JSON dump only — **not** rendered in the panel
- Via text shows source path (e.g. `structured_response.layer_a`)

**Panel header**:
- Title always `Zeus Tracer` (session id available as `title` tooltip when known)
- **Detective** (blue text after middle-dot) enabled only when both `hubBaseUrl` and a resolved session id are set
- Latest successful card with a session id wins; cards without a session id do not clear the previous Detective link
- **Copy All** is a primary blue button; close is a ghost icon button

## 5. Debugging & Known Issues

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| No `#zeus-trace-host` / no toggle | Kill switch default off | `?debug=true` or `enabled: true` |
| Tool chart empty order | No `toolOrder` / no `zeusApiUrl` or API unreachable | Inject `ZeusTraceConfig.toolOrder` or set same-origin `zeusApiUrl`; check Network tab |
| Widget open but no cards | Missing `appendTraceCard` call or `trace`/`debug` field | Host must pass response with `trace` or `debug` |
| Hops `Bytes` is `—` | 2.3.0 hop omitted `bytes` and had no `result_json`/`snippet`/step bytes | Widget estimates from body when present; `result_size` is rows, not bytes |
| Panel not visible (host present) | Starts with `is-hidden` | Click toggle or `openDebugPanel()` |
| Detective link hidden | Missing `hubBaseUrl` or `session_id` | Set `ZeusTraceConfig.hubBaseUrl`; ensure host forwards `session_id` |
| Detective opens `http:/hub/...` | Hostname `http://hub` was treated as a `/hub` path | Rebuild; `normalizeHubBase` keeps hostname `hub` |
| Detective still uses a stale origin | Expected config to apply only at bootstrap | Clicks re-read `ZeusTraceConfig.hubBaseUrl`; set it then click again |
| Detective still hits `/hub/debug/req/...` | Stale vendored bundle | Rebuild + sync `zeus_client_chat_trace.js` to host static |
| No Tool calls / AI rounds dumps | Stale bundle with broken jsnview URL (`index.umd.js` 404) hanging dump attach | Rebuild/redeploy `dist/zeus_client_chat_trace.js` (uses `index.min.js`; dumps attach before jsnview) |
| Hash Traces empty | `trace.steps` and `trace.tool_calls` both empty | Confirm host forwards full search `trace` payload |
| Click-to-copy / Copy does nothing | `clipboard.writeText` rejected in Shadow DOM; toast was off-panel | Rebuild; copy uses sync `execCommand` first; toast lives inside `#tt-panel`. See `.grok/guides/CLICK_TO_COPY.md` |
| JSON dumps show plain pre | jsnview CDN blocked | Allow cdn.jsdelivr.net; pre fallback is expected and still shows data |
| Early calls lost | Script not async-safe | Use built-in queue (calls before load are buffered) |
| Styles missing | Stale 0.1.x bundle or blocked shadow | Rebuild v1.0.0 (no DaisyUI); inspect `#zeus-trace-host` shadow root |
| KPI tiles / Layer A labels overlap; huge floating numbers | Flex column + `min-height:0` collapsed `.tc-kpi-mini` to 0 while tiles overflow | v0.1.12+ layout lock (`flex-shrink:0` on card/body children; KPI `min-height:auto`) — rebuild/redeploy bundle |

**Debug checklist**:
- [ ] `ZeusTrace.config.enabled === true` (or open with `?debug=true`)
- [ ] Network: `jsnview` loads from `…/jsnview@3.0.0/dist/index.min.js` (not `index.umd.js`)
- [ ] Turn list shows the query; Timeline waterfall renders
- [ ] Card header shows `N rounds`
- [ ] Expand **Hash Traces** for `[r1] LLM` / `[r1] TOOL …` lines
- [ ] Expand **Tool calls · N** (open by default when N > 0); each record has `round`
- [ ] TOTAL area shows three colored token tiles with titles `Token In` / `Token Out` / `Total Tokens` when step `usage` is present, plus AI/Zeus/Other bar
- [ ] Card head click collapses/expands body (`aria-expanded`, `.is-collapsed`); chevron visible
- [ ] Under card head body: KPI tile grid shows MINI-SCHEMA / SCOPE BRIEF / LLM Rounds / Tool Calls / Avg / round / Edges
- [ ] When terminate bag present: **Layer A** primary pills + code blocks for query_decomposition / decomposition; no Summary row
- [ ] Panel title is `Zeus Tracer`
- [ ] Detective link href is `{hubBaseUrl}/hub/debug/session/{session_id}` and opens in a new tab

## 6. Related Artifacts
- **Files**: `src/widget.html`, `src/widget.css`, `src/bootstrap.js`, `src/trace.js`, `src/panel.js`, `src/normalize.js`, `src/helpers.js`, `src/config.js`, `sketches/v1-overlay-inspector/`, `dev/index.html`, `examples/embed.html`, `dist/zeus_client_chat_trace.js`
- **CDN**: Space `koten-static-cdn` (nyc3) → `*.cdn.digitaloceanspaces.com`; publish via `npm run publish:cdn`
- **Tickets**:
  - [ZC-31](https://kotenai.atlassian.net/browse/ZC-31) — embeddable widget
  - [ZC-43](https://kotenai.atlassian.net/browse/ZC-43) — original request-id Detective link (superseded path by session link)
- **Plans**: `.grok/plans/1_V1_INSPECTOR_REDESIGN.md` (current); older stacked-card plans superseded

## 7. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-08-26 | Grok | Detective / Hub redirects use live `hubBaseUrl` from config; `http://hub` hostname no longer mangled; optional `.env` `HUB_BASE_URL` |
| 2026-08-26 | Grok | Package / CDN version **1.1.1** (versioned + `latest`) |
| 2026-08-25 | Grok | Hops `Bytes` column: aliases + matching step + payload estimate (2.3.0 hops omit `bytes`) |
| 2026-08-25 | Grok | Raw tab JSON viewer font matches inspector `--tt-mono` 11px |
| 2026-08-25 | Grok | Pin 1.0.0 into `demo_travel_sample` (vendored `/static/…?v=1.0.0`, not CDN latest) |
| 2026-08-25 | Grok | Fix tracer UI: unclosed `.vbar-col .n` nested all `.tt-*` CSS; `[hidden]` honor; docked `display:block` |
| 2026-08-25 | Grok | Local playground: `npm start` → http://localhost:5199/ |
| 2026-08-25 | Grok | Click-to-copy: Shadow DOM–safe clipboard (sync execCommand + Clipboard API); in-panel toast |
| 2026-08-25 | Grok | Package / CDN version **1.1.0** |
| 2026-08-21 | Grok | **v1.0.0** inspector: drop DaisyUI stacked cards; align with `zeus_client` Turn traces + python 2.3.0 `debug`/`public_trace` |
| 2026-08-05 | agent | Release v0.1.13: AI/Zeus/Other % labels always sum to 100 (largest-remainder); tighter card/totals padding |
| 2026-08-05 | agent | Release v0.1.12: fix trace-card-body flex collapse (KPI/Layer A overlap) |
| 2026-08-05 | agent | Release v0.1.11: tighter panel header + token tile padding; CDN publish |
| 2026-08-05 | agent | Release v0.1.10: collapsible scrollable trace cards; CDN publish |
| 2026-08-05 | agent | `.trace-card-body` scrollable: max-height min(45vh, 480px) + overflow-y auto (head stays pinned) |
| 2026-08-05 | agent | `.trace-card` collapsible: head button + chevron toggles body (`.is-collapsed`) |
| 2026-08-05 | agent | Release v0.1.9: dashboard UI redesign (code.html), 3-col KPI grid, list y-scroll; CDN publish |
| 2026-08-05 | agent | Dashboard UI redesign from `code.html` guide: token tiles, total progress bar, session card chrome, split badges, Layer A pills + code blocks; 3-col KPI; list scrollbar |
| 2026-08-05 | agent | Release v0.1.8: Layer A panel drops Summary row (still in JSON dump); CDN publish |
| 2026-08-05 | agent | Layer A panel: remove Summary row (still in JSON dump / harvest) |
| 2026-08-05 | agent | Release v0.1.7: compact DaisyUI `stat` for head KPI + Layer A (smaller than tokens; horizontal strip); CDN publish |
| 2026-08-05 | agent | Head KPI + Layer A use compact DaisyUI `stat` (smaller than token stats; fix vertical stack from DaisyUI width:100%) |
| 2026-08-05 | agent | Release v0.1.6: Layer A DaisyUI stats cards; publish CDN versioned + latest |
| 2026-08-05 | agent | Layer A as DaisyUI stats cards (Confidence / Policy / Intent / Output + Summary + QD/decomp rows) for scannability |
| 2026-08-05 | agent | Layer A terminate panel: summary, confidence, policy_action, query_decomposition, decomposition (targets / predicates / output); harvest from layer_a / structured_response / return/pipeline steps |
| 2026-08-05 | agent | Document how to set/change `hubBaseUrl` (runtime only; not package `.env`); README § Hub base URL |
| 2026-08-05 | agent | Publish `dist/` to DO Spaces CDN (`koten-static-cdn`): versioned + `latest` paths; `npm run publish:cdn` |
| 2026-08-04 | agent | Head KPI mini grid under `trace-card-head`: MINI-SCHEMA, SCOPE BRIEF, LLM Rounds, Tool Calls, Avg / round, Edges |
| 2026-08-04 | agent | Kill switch: default off; show with `?debug=true` or `enabled`/`data-enabled` (v0.1.4) |
| 2026-08-03 | agent | Detective deep-link uses `/hub/debug/session/{session_id}`; panel title fixed as `Zeus Tracer` |
| 2026-07-30 | agent | Token metrics: DaisyUI `stats` for in/out/total from step `usage`; shown on TOTAL area |
| 2026-07-22 | agent | ZC-43: panel title shows request ID (incl. session_turn/tool_call fallbacks); Detective deep-link via host `hubBaseUrl`; footer build version |
| 2026-07-13 | agent | Fix tool-call rounds dumps: jsnview CDN path, hang on failed script, early dump attach, AI responses, checkbox collapse |
| 2026-07-13 | agent | Do not block mount on tool-order; 3s fetch timeout; default chart api_version to v2 |
| 2026-07-03 | agent | Initial embeddable widget implementation |
