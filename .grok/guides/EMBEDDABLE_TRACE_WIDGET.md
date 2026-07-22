# Guide: Embeddable Trace Widget

**Date**: 2026-07-22  
**Feature**: Single-script Zeus trace debugger embeddable in any host page  
**Status**: Active  
**Related Plan**: `.grok/plans/EMBEDDABLE_TRACE_WIDGET.md`, `.grok/plans/TOOL_CALL_ROUNDS_DUMP.md`, `.grok/plans/ZC43_REQUEST_ID_DETECTIVE_LINK.md`

## 1. Overview

- **Purpose**: Inject a floating Zeus trace panel into third-party pages via one async script tag.
- **Scope**: UI widget, trace rendering, tool-order chart, JSON dumps (lazy jsnview), panel title with latest Zeus request ID + Hub Detective deep-link. Does not perform searches itself.
- **Entry points**: `dist/zeus_client_chat_trace.js`, `window.appendTraceCard`, `window.openDebugPanel`

## 2. Architecture & Flow

1. Host sets `window.ZeusTraceConfig` (optional) and loads the bundle.
2. `bootstrap.js` queues early API calls, mounts Shadow DOM on `#zeus-trace-host`.
3. DaisyUI CSS + `widget.css` + `widget.html` injected inside shadow root.
4. `initZeusTrace` wires UI. tool-order is applied from injected `toolOrder` when present; otherwise a **background** fetch of `/api/tool-order` runs (default 3s abort) and never blocks mount.
5. Host calls `appendTraceCard(question, responseJson)` after each search. Globals are live as soon as the widget mounts (`ZeusTrace.ready`), independent of tool-order.
6. Each card renders metrics, waterfall, tool-frequency chart, **Hash Traces** (`[rN] LLM/TOOL…`), and collapsible dumps: AI requests/responses (labeled by rounds), tool calls (open when non-empty), raw turn bundle.
7. When a request ID is present on the payload, the panel title updates to `Zeus Tracer: {requestID}` and (if `hubBaseUrl` is set) the **Detective ↗** link points at `{hubBaseUrl}/hub/debug/req/{requestID}` (`target="_blank"`).

**Key components**:
- `src/bootstrap.js` — mount, queue, global API
- `src/trace.js` — trace card rendering; `extractRequestId` / `updateDebugTitle` for panel header
- `src/config.js` — `zeusApiUrl` / `zeusAuthToken` / `hubBaseUrl` resolution; `detectiveUrl`
- `src/jsnview-loader.js` — lazy CDN load for JSON viewer (`index.min.js`; pre fallback)
- `src/widget.html` / `src/widget.css` — panel chrome including title + Detective link

**Request ID extraction priority** (first non-empty wins):  
`req_id` → `request_id` → `zeus_req_id` → `trace.req_id` → `trace.request_id` → last of `req_ids[]` / `meta.req_ids[]`.

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
  };
</script>
<script src="/dist/zeus_client_chat_trace.js" async></script>
```

Or via script data attributes: `data-zeus-api-url`, `data-zeus-auth-token`, `data-hub-base-url`.

`hubBaseUrl` is host-supplied only (not derived from `zeusApiUrl`). Empty → Detective link hidden.

## 4. How to Use

**Primary workflow**:
1. Build or host `dist/zeus_client_chat_trace.js`.
2. Add script tag + optional `hubBaseUrl` (see above).
3. After API response, forward request id when needed:

```js
window.appendTraceCard(query, {
  ...data,
  req_id: data.req_id || response.headers.get("X-Zeus-Req-Id"),
});
window.openDebugPanel?.();
```

**Local demo**: `npm run build && npm run serve` then open `http://localhost:5199/embed.html`

**`appendTraceCard(question, j)`** requires `j.trace` object (steps, spans, tool_calls, etc.). Prefer also passing `req_id`.

**Panel header**:
- No id yet → title `Zeus Tracer`, Detective hidden
- With id → `Zeus Tracer: {id}`; Detective enabled only when `hubBaseUrl` is set
- Latest successful card with an id wins; cards without an id do not clear the previous title

## 5. Debugging & Known Issues

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Tool chart empty order | No `toolOrder` / no `zeusApiUrl` or API unreachable | Inject `ZeusTraceConfig.toolOrder` or set same-origin `zeusApiUrl`; check Network tab |
| Widget open but no cards | Missing `appendTraceCard` call or `trace` field | Host must pass response with `trace` |
| Panel not visible | Starts with `is-hidden` | Click toggle or `openDebugPanel()` |
| Detective link hidden | Missing `hubBaseUrl` or `req_id` | Set `ZeusTraceConfig.hubBaseUrl`; forward `X-Zeus-Req-Id` as `req_id` |
| Title stuck on Zeus Tracer | Payload has no request id fields | Attach `req_id` (or `trace.req_id`) in host |
| No Tool calls / AI rounds dumps | Stale bundle with broken jsnview URL (`index.umd.js` 404) hanging dump attach | Rebuild/redeploy `dist/zeus_client_chat_trace.js` (uses `index.min.js`; dumps attach before jsnview) |
| Hash Traces empty | `trace.steps` and `trace.tool_calls` both empty | Confirm host forwards full search `trace` payload |
| JSON dumps show plain pre | jsnview CDN blocked | Allow cdn.jsdelivr.net; pre fallback is expected and still shows data |
| Early calls lost | Script not async-safe | Use built-in queue (calls before load are buffered) |
| Styles missing | DaisyUI CDN blocked | Allow cdn.jsdelivr.net |

**Debug checklist**:
- [ ] Network: `jsnview` loads from `…/jsnview@3.0.0/dist/index.min.js` (not `index.umd.js`)
- [ ] Card header shows `N rounds`
- [ ] Expand **Hash Traces** for `[r1] LLM` / `[r1] TOOL …` lines
- [ ] Expand **Tool calls · N** (open by default when N > 0); each record has `round`
- [ ] Panel title shows request id after a card with `req_id`
- [ ] Detective link href is `{hubBaseUrl}/hub/debug/req/{id}` and opens in a new tab

## 6. Related Artifacts

- **Files**: `src/widget.html`, `src/widget.css`, `src/bootstrap.js`, `src/trace.js`, `src/config.js`, `examples/embed.html`, `dist/zeus_client_chat_trace.js`
- **Tickets**:
  - [ZC-31](https://kotenai.atlassian.net/browse/ZC-31) — embeddable widget
  - [ZC-43](https://kotenai.atlassian.net/browse/ZC-43) — request ID title + Hub Detective link
- **Plans**: `.grok/plans/ZC43_REQUEST_ID_DETECTIVE_LINK.md`

## 7. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-07-22 | agent | ZC-43: panel title shows request ID (incl. session_turn/tool_call fallbacks); Detective deep-link via host `hubBaseUrl`; footer build version |
| 2026-07-13 | agent | Fix tool-call rounds dumps: jsnview CDN path, hang on failed script, early dump attach, AI responses, checkbox collapse |
| 2026-07-13 | agent | Do not block mount on tool-order; 3s fetch timeout; default chart api_version to v2 |
| 2026-07-03 | agent | Initial embeddable widget implementation |
