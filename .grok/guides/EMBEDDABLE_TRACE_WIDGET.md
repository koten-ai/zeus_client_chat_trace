# Guide: Embeddable Trace Widget

**Date**: 2026-08-05  
**Feature**: Single-script Zeus trace debugger embeddable in any host page  
**Status**: Active  
**Related Plan**: `.grok/plans/EMBEDDABLE_TRACE_WIDGET.md`, `.grok/plans/WIDGET_UI_REDESIGN.md`, `.grok/plans/TOOL_CALL_ROUNDS_DUMP.md`, `.grok/plans/ZC43_REQUEST_ID_DETECTIVE_LINK.md`, `.grok/plans/DETECTIVE_SESSION_LINK.md`, `.grok/plans/DEBUG_QUERY_KILL_SWITCH.md`, `.grok/plans/CARD_HEAD_STAT_GRID.md`, `.grok/plans/LAYER_A_TRACE_PANEL.md`

## 1. Overview
- **Purpose**: Inject a floating Zeus trace panel into third-party pages via one async script tag.
- **Scope**: UI widget, trace rendering, tool-order chart, JSON dumps (lazy jsnview), panel title **Zeus Tracer** + Hub Detective deep-link by **session_id**. Does not perform searches itself. **Kill switch** gates mount via `?debug=true` / `enabled`.
- **Entry points**: `dist/zeus_client_chat_trace.js`, `window.appendTraceCard`, `window.openDebugPanel`

## 2. Architecture & Flow

1. Host sets `window.ZeusTraceConfig` (optional) and loads the bundle.
2. `bootstrap.js` queues early API calls, resolves **enabled** (explicit config → `?debug=` → default false).
3. If **disabled**: install no-op APIs, no DOM, resolve `ZeusTrace.ready`.
4. If **enabled**: mounts Shadow DOM on `#zeus-trace-host`, injects DaisyUI + CSS/HTML, `initZeusTrace`.
5. tool-order is applied from injected `toolOrder` when present; otherwise a **background** fetch of `/api/tool-order` runs (default 3s abort) and never blocks mount.
6. Host calls `appendTraceCard(question, responseJson)` after each search. Globals are live as soon as bootstrap finishes (`ZeusTrace.ready`), independent of tool-order.
7. Each card renders a **session head** (`#N` + query + meta), optional **contract/session badges** (split pills), **KPI tile grid** (under head body), optional **Layer A** (primary key|value pills + code blocks for QD/decomp), per-card timing bar, waterfall rows, tool-frequency chart, **Hash Traces**, and collapsible dumps.
8. Panel chrome: **Zeus Tracer · Detective** header, blue **Copy All**, close; top **token tiles** (In/Out/Total) + **Total progress bar** (AI orange / Zeus teal / Other gray); footer version pill.

**Key components**:
- `src/bootstrap.js` — mount (or skip), queue, global API
- `src/trace.js` — trace card rendering; `extractSessionId` / `updateDebugTitle` for panel header; `extractLayerA` / `buildLayerAEl` for base-5 terminate
- `src/config.js` — `zeusApiUrl` / `zeusAuthToken` / `hubBaseUrl` / **`enabled`** resolution; `detectiveUrl`; `resolveEnabled` / `readDebugQueryParam`
- `src/jsnview-loader.js` — lazy CDN load for JSON viewer (`index.min.js`; pre fallback)
- `src/widget.html` / `src/widget.css` — panel chrome including title + Detective link + Layer A styles

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

**Hub base URL (`hubBaseUrl`)** — host-supplied only (not derived from `zeusApiUrl`, **not** in this package’s `.env`):

| How | Example |
|-----|---------|
| `window.ZeusTraceConfig.hubBaseUrl` (before script load) | `"http://127.0.0.1:9091"` |
| Script `data-hub-base-url` | `data-hub-base-url="http://zeus-dev.local:9091"` |
| Host build env (e.g. demo_yelp) | `VITE_HUB_BASE_URL=…` → host injects `ZeusTraceConfig` |

Resolution: config → `data-hub-base-url` → `""`. Empty → Detective link hidden. Link target: `{hubBaseUrl}/hub/debug/session/{session_id}`. Config is read once at bootstrap — reload after changing. Verify: `window.ZeusTrace.config.hubBaseUrl`. Full steps: `README.md` § Hub base URL.

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

**Local demo**: `npm run build && npm run serve` then open `http://localhost:5199/examples/embed.html` (demo sets `enabled: true`).

**`appendTraceCard(question, j)`** requires `j.trace` object (steps, spans, tool_calls, etc.). Prefer also passing `session_id`. No-op when disabled.

**Token stats** (TOTAL area — three colored tiles matching dashboard mockup):
- Reads each step’s `usage.prompt_tokens` → **Token In**, `usage.completion_tokens` → **Token Out**, `usage.total_tokens` → **Total Tokens**
- Values sum across LLM steps in the turn (and across cards for TOTAL)
- Missing fields show `?`; if only in/out are present, total is derived as in+out
- Rendered as `#tokens-total` grid with `.stat-title` / `.stat-value` (blue / purple / green tiles); below it a full-width AI/Zeus/Other progress bar with % labels

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
| Widget open but no cards | Missing `appendTraceCard` call or `trace` field | Host must pass response with `trace` |
| Panel not visible (host present) | Starts with `is-hidden` | Click toggle or `openDebugPanel()` |
| Detective link hidden | Missing `hubBaseUrl` or `session_id` | Set `ZeusTraceConfig.hubBaseUrl`; ensure host forwards `session_id` |
| Detective still hits `/hub/debug/req/...` | Stale vendored bundle | Rebuild + sync `zeus_client_chat_trace.js` to host static |
| No Tool calls / AI rounds dumps | Stale bundle with broken jsnview URL (`index.umd.js` 404) hanging dump attach | Rebuild/redeploy `dist/zeus_client_chat_trace.js` (uses `index.min.js`; dumps attach before jsnview) |
| Hash Traces empty | `trace.steps` and `trace.tool_calls` both empty | Confirm host forwards full search `trace` payload |
| JSON dumps show plain pre | jsnview CDN blocked | Allow cdn.jsdelivr.net; pre fallback is expected and still shows data |
| Early calls lost | Script not async-safe | Use built-in queue (calls before load are buffered) |
| Styles missing | DaisyUI CDN blocked | Allow cdn.jsdelivr.net (collapse/toast); core chrome is self-contained CSS |

**Debug checklist**:
- [ ] `ZeusTrace.config.enabled === true` (or open with `?debug=true`)
- [ ] Network: `jsnview` loads from `…/jsnview@3.0.0/dist/index.min.js` (not `index.umd.js`)
- [ ] Card header shows `N rounds`
- [ ] Expand **Hash Traces** for `[r1] LLM` / `[r1] TOOL …` lines
- [ ] Expand **Tool calls · N** (open by default when N > 0); each record has `round`
- [ ] TOTAL area shows three colored token tiles with titles `Token In` / `Token Out` / `Total Tokens` when step `usage` is present, plus AI/Zeus/Other bar
- [ ] Under card head body: KPI tile grid shows MINI-SCHEMA / SCOPE BRIEF / LLM Rounds / Tool Calls / Avg / round / Edges
- [ ] When terminate bag present: **Layer A** primary pills + code blocks for query_decomposition / decomposition; no Summary row
- [ ] Panel title is `Zeus Tracer`
- [ ] Detective link href is `{hubBaseUrl}/hub/debug/session/{session_id}` and opens in a new tab

## 6. Related Artifacts
- **Files**: `src/widget.html`, `src/widget.css`, `src/bootstrap.js`, `src/trace.js`, `src/config.js`, `examples/embed.html`, `dist/zeus_client_chat_trace.js`, `scripts/upload_dist_cdn.sh`
- **CDN**: Space `koten-static-cdn` (nyc3) → `*.cdn.digitaloceanspaces.com`; publish via `npm run publish:cdn`
- **Tickets**:
  - [ZC-31](https://kotenai.atlassian.net/browse/ZC-31) — embeddable widget
  - [ZC-43](https://kotenai.atlassian.net/browse/ZC-43) — original request-id Detective link (superseded path by session link)
- **Plans**: `.grok/plans/WIDGET_UI_REDESIGN.md`, `.grok/plans/ZC43_REQUEST_ID_DETECTIVE_LINK.md`, `.grok/plans/DETECTIVE_SESSION_LINK.md`, `.grok/plans/DEBUG_QUERY_KILL_SWITCH.md`, `.grok/plans/LAYER_A_TRACE_PANEL.md`

## 7. Changelog

| Date | Author | Change |
|------|--------|--------|
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
