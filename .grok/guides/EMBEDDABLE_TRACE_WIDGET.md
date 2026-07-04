# Guide: Embeddable Trace Widget

**Date**: 2026-07-03
**Feature**: Single-script Zeus trace debugger embeddable in any host page
**Status**: Active
**Related Plan**: `.grok/plans/EMBEDDABLE_TRACE_WIDGET.md`

## 1. Overview

- **Purpose**: Inject a floating Zeus trace panel into third-party pages via one async script tag.
- **Scope**: UI widget, trace rendering, tool-order chart, JSON dumps (lazy jsnview). Does not perform searches itself.
- **Entry points**: `dist/zeus_client_chat_trace.js`, `window.appendTraceCard`, `window.openDebugPanel`

## 2. Architecture & Flow

1. Host sets `window.ZeusTraceConfig` (optional) and loads the bundle.
2. `bootstrap.js` queues early API calls, mounts Shadow DOM on `#zeus-trace-host`.
3. DaisyUI CSS + `widget.css` + `widget.html` injected inside shadow root.
4. `initZeusTrace` wires UI and fetches `/api/tool-order` from Zeus API.
5. Host calls `appendTraceCard(question, responseJson)` after each search.

**Key components**:
- `src/bootstrap.js` — mount, queue, global API
- `src/trace.js` — trace card rendering
- `src/config.js` — `zeusApiUrl` / `zeusAuthToken` resolution
- `src/jsnview-loader.js` — lazy CDN load for JSON viewer

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
  };
</script>
<script src="/dist/zeus_client_chat_trace.js" async></script>
```

Or via script data attributes: `data-zeus-api-url`, `data-zeus-auth-token`.

## 4. How to Use

**Primary workflow**:
1. Build or host `dist/zeus_client_chat_trace.js`.
2. Add script tag to host page (see above).
3. After API response: `window.appendTraceCard(query, data); window.openDebugPanel?.();`

**Local demo**: `npm run build && npm run serve` then open `http://localhost:5199/embed.html`

**`appendTraceCard(question, j)`** requires `j.trace` object (steps, spans, tool_calls, etc.).

## 5. Debugging & Known Issues

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Tool chart empty order | No `zeusApiUrl` or API unreachable | Set `ZeusTraceConfig.zeusApiUrl`; check Network tab |
| JSON dumps show plain pre | jsnview CDN blocked | Allow cdn.jsdelivr.net or use pre fallback |
| Early calls lost | Script not async-safe | Use built-in queue (calls before load are buffered) |
| Styles missing | DaisyUI CDN blocked | Allow cdn.jsdelivr.net |

## 6. Related Artifacts

- `src/widget.html`, `src/widget.css`, `src/bootstrap.js`, `src/trace.js`
- `dist/zeus_client_chat_trace.js`
- `examples/embed.html`
- Jira: [ZC-31](https://kotenai.atlassian.net/browse/ZC-31)

## 7. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-07-03 | agent | Initial embeddable widget implementation |