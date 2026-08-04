# Guide: Embeddable Trace Widget

**Date**: 2026-08-04  
**Feature**: Single-script Zeus trace debugger embeddable in any host page  
**Status**: Active  
**Related Plan**: `.grok/plans/EMBEDDABLE_TRACE_WIDGET.md`, `.grok/plans/TOOL_CALL_ROUNDS_DUMP.md`, `.grok/plans/ZC43_REQUEST_ID_DETECTIVE_LINK.md`, `.grok/plans/DETECTIVE_SESSION_LINK.md`, `.grok/plans/DEBUG_QUERY_KILL_SWITCH.md`

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
7. Each card renders metrics (AI/Zeus/Other bar + DaisyUI token **stats** for `in`/`out`/`total` + bytes), waterfall, tool-frequency chart, **Hash Traces** (`[rN] LLM/TOOL…`), and collapsible dumps: AI requests/responses (labeled by rounds), tool calls (open when non-empty), raw turn bundle.
8. Panel title stays **`Zeus Tracer`**. When a session id is present on the payload and `hubBaseUrl` is set, **Detective ↗** points at `{hubBaseUrl}/hub/debug/session/{session_id}` (`target="_blank"`).

**Key components**:
- `src/bootstrap.js` — mount (or skip), queue, global API
- `src/trace.js` — trace card rendering; `extractSessionId` / `updateDebugTitle` for panel header
- `src/config.js` — `zeusApiUrl` / `zeusAuthToken` / `hubBaseUrl` / **`enabled`** resolution; `detectiveUrl`; `resolveEnabled` / `readDebugQueryParam`
- `src/jsnview-loader.js` — lazy CDN load for JSON viewer (`index.min.js`; pre fallback)
- `src/widget.html` / `src/widget.css` — panel chrome including title + Detective link

**Enabled resolution** (first decisive wins):
1. `ZeusTraceConfig.enabled` or script `data-enabled` (`true`/`false`/`1`/`0`/`yes`/`no`/`on`/`off`)
2. Page query `debug` (`?debug=true` → on; `?debug=false` → off)
3. Default **false** (no UI)

**Session ID extraction priority** (first non-empty wins):  
`session_id` → `trace.session_id` → `trace.session.id` → `trace.session.session_id` → `session.id`.

## 3. Setup

**Prerequisites**: Node.js 18+, npm

```bash
npm install
npm run build
```

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
    hubBaseUrl: "http://hub",
    // enabled: true,  // or use ?debug=true on the host URL
  };
</script>
<script src="/dist/zeus_client_chat_trace.js" async></script>
```

Or via script data attributes: `data-zeus-api-url`, `data-zeus-auth-token`, `data-hub-base-url`, `data-enabled`.

`hubBaseUrl` is host-supplied only (not derived from `zeusApiUrl`). Empty → Detective link hidden.

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

**Token stats** (TOTAL area):
- Reads each step’s `usage.prompt_tokens` → **Token In**, `usage.completion_tokens` → **Token Out**, `usage.total_tokens` → **Total Tokens**
- Values sum across LLM steps in the turn (and across cards for TOTAL)
- Missing fields show `?`; if only in/out are present, total is derived as in+out
- Rendered as DaisyUI `stats` / `stat` / `stat-title` / `stat-value` inside `#tokens-total`; TOTAL bar stays timing-only

**Panel header**:
- Title always `Zeus Tracer` (session id available as `title` tooltip when known)
- Detective enabled only when both `hubBaseUrl` and a resolved session id are set
- Latest successful card with a session id wins; cards without a session id do not clear the previous Detective link

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
| Styles missing | DaisyUI CDN blocked | Allow cdn.jsdelivr.net |

**Debug checklist**:
- [ ] `ZeusTrace.config.enabled === true` (or open with `?debug=true`)
- [ ] Network: `jsnview` loads from `…/jsnview@3.0.0/dist/index.min.js` (not `index.umd.js`)
- [ ] Card header shows `N rounds`
- [ ] Expand **Hash Traces** for `[r1] LLM` / `[r1] TOOL …` lines
- [ ] Expand **Tool calls · N** (open by default when N > 0); each record has `round`
- [ ] TOTAL area shows DaisyUI token stats with titles `Token In` / `Token Out` / `Total Tokens` when step `usage` is present
- [ ] Panel title is `Zeus Tracer`
- [ ] Detective link href is `{hubBaseUrl}/hub/debug/session/{session_id}` and opens in a new tab

## 6. Related Artifacts
- **Files**: `src/widget.html`, `src/widget.css`, `src/bootstrap.js`, `src/trace.js`, `src/config.js`, `examples/embed.html`, `dist/zeus_client_chat_trace.js`
- **Tickets**:
  - [ZC-31](https://kotenai.atlassian.net/browse/ZC-31) — embeddable widget
  - [ZC-43](https://kotenai.atlassian.net/browse/ZC-43) — original request-id Detective link (superseded path by session link)
- **Plans**: `.grok/plans/ZC43_REQUEST_ID_DETECTIVE_LINK.md`, `.grok/plans/DETECTIVE_SESSION_LINK.md`, `.grok/plans/DEBUG_QUERY_KILL_SWITCH.md`

## 7. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-08-04 | agent | Kill switch: default off; show with `?debug=true` or `enabled`/`data-enabled` (v0.1.4) |
| 2026-08-03 | agent | Detective deep-link uses `/hub/debug/session/{session_id}`; panel title fixed as `Zeus Tracer` |
| 2026-07-30 | agent | Token metrics: DaisyUI `stats` for in/out/total from step `usage`; shown on TOTAL area |
| 2026-07-22 | agent | ZC-43: panel title shows request ID (incl. session_turn/tool_call fallbacks); Detective deep-link via host `hubBaseUrl`; footer build version |
| 2026-07-13 | agent | Fix tool-call rounds dumps: jsnview CDN path, hang on failed script, early dump attach, AI responses, checkbox collapse |
| 2026-07-13 | agent | Do not block mount on tool-order; 3s fetch timeout; default chart api_version to v2 |
| 2026-07-03 | agent | Initial embeddable widget implementation |
