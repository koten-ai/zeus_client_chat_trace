# zeus_client_chat_trace

Embeddable Zeus trace debugger widget. Drop a single script tag into any host page to surface a floating debug panel that visualizes Zeus search traces — timing breakdowns, waterfall timelines, tool-call frequency, and expandable JSON dumps.

## What it does

When a host application calls the Zeus search API, the response includes a `trace` object with step-by-step execution data (LLM rounds, tool calls, spans, token usage, and more). This widget renders that data in a developer-friendly panel without modifying the host app's layout or styles.

**Key capabilities:**

- **One-script embed** — Load `dist/zeus_client_chat_trace.js` asynchronously; the widget mounts itself in an isolated Shadow DOM.
- **Trace cards** — Each search turn becomes a card showing the user query, API version, target, round count, and session/contract badges.
- **Performance metrics** — Stacked bar showing AI vs Zeus vs other time, plus token and byte totals. A running total aggregates across turns.
- **Waterfall timeline** — Visual span chart for LLM and tool execution, with pipeline steps expanded inline.
- **Tool-call frequency chart** — Bar chart ordered by the Zeus `/api/tool-order` endpoint (falls back gracefully when the API is unreachable).
- **JSON dumps** — Collapsible sections for AI requests, tool calls, and the raw turn bundle. Uses [jsnview](https://www.npmjs.com/package/jsnview) (lazy-loaded from CDN) with a plain-text fallback.
- **Early-call queue** — Calls to `appendTraceCard` or `openDebugPanel` made before the script finishes loading are buffered and replayed automatically.
- **Copy all** — Export the current trace session to the clipboard as JSON.

The widget does **not** perform searches itself. The host app is responsible for calling Zeus and passing the response to `appendTraceCard`.

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- npm

## Quick start

### 1. Install and build

```bash
git clone <repo-url>
cd zeus_client_chat_trace
npm install
npm run build
```

This produces `dist/zeus_client_chat_trace.js` (minified, with source map).

**Optional — build-time defaults:** Copy `.env.example` to `.env` and set defaults that apply when no runtime config is provided:

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `ZEUS_API_URL` | Default Zeus API base URL (e.g. `http://localhost:8080`) |
| `ZEUS_AUTH_TOKEN` | Default Bearer token for Zeus API requests |

Runtime config always overrides these build-time values.

### 2. Embed in your host page

Add configuration and the script tag to any HTML page:

```html
<script>
  window.ZeusTraceConfig = {
    zeusApiUrl: "https://zeus.example.com",
    zeusAuthToken: "optional-bearer-token",
  };
</script>
<script src="/dist/zeus_client_chat_trace.js" async></script>
```

Alternatively, pass config via data attributes on the script tag:

```html
<script
  src="/dist/zeus_client_chat_trace.js"
  async
  data-zeus-api-url="https://zeus.example.com"
  data-zeus-auth-token="optional-bearer-token"
></script>
```

Config resolution order: `window.ZeusTraceConfig` → script `data-*` attributes → build-time `.env` defaults.

### 3. Feed traces after each search

After your app receives a Zeus API response, pass the user query and full JSON body to the widget:

```js
// responseJson must include a `trace` object
window.appendTraceCard(userQuery, responseJson);

// Optionally open the panel immediately
window.openDebugPanel?.();
```

Wait for the widget to finish mounting before relying on the real implementations (optional, but useful if you need config or error handling):

```js
const { api, config } = await window.ZeusTrace.ready;
api.appendTraceCard(userQuery, responseJson);
api.openDebugPanel();
```

A floating toggle button (bottom-right) lets users open and close the panel at any time.

### 4. Try the local demo

```bash
npm run build
npm run serve
```

Open [http://localhost:5199/examples/embed.html](http://localhost:5199/examples/embed.html) (or [http://localhost:5199/embed.html](http://localhost:5199/embed.html)).

The demo page simulates a host app: it queues an early trace before the script loads, then lets you append additional fixture traces and open the panel.

## API reference

| Global | Description |
|--------|-------------|
| `window.ZeusTraceConfig` | Set **before** loading the script. `{ zeusApiUrl, zeusAuthToken }` |
| `window.appendTraceCard(question, responseJson)` | Append a trace card. `responseJson.trace` is required. |
| `window.openDebugPanel()` | Show the debug panel. |
| `window.ZeusTrace.ready` | Promise resolving to `{ api, config }` once the widget is mounted. |
| `window.ZeusTrace.config` | Read-only public config (`zeusApiUrl` only; token is never exposed). |

### Expected response shape

`appendTraceCard` expects the Zeus API response JSON. At minimum, `responseJson.trace` must be present:

```js
{
  chat_id: "optional-session-id",
  api_version: "v2",
  target: "search-target",
  answer: "...",
  trace: {
    rounds: 2,
    total_ms: 1250,
    spans: [ /* { name, cls, at, ms } */ ],
    steps: [ /* { type, round, ms, name, status, ... } */ ],
    ai_requests: [ /* ... */ ],
    tool_calls: [ /* ... */ ],
    session: { /* optional */ },
    contract: { /* optional */ },
  }
}
```

See `examples/embed.html` for a complete fixture.

## Development

| Command | Description |
|---------|-------------|
| `npm run dev` | Rebuild on file changes (`esbuild --watch`) |
| `npm run serve` | Static file server on port 5199 |
| `npm test` | Run unit tests once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |

### Project layout

```
src/
  bootstrap.js      Entry point — mounts Shadow DOM, exposes globals
  trace.js          Trace card rendering, charts, metrics
  config.js         Config resolution and Zeus API fetch helper
  jsnview-loader.js Lazy-loads jsnview from CDN
  widget.html       Panel markup (injected into shadow root)
  widget.css        Widget styles
dist/
  zeus_client_chat_trace.js   Built bundle (commit or deploy this)
examples/
  embed.html        Local integration demo
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Tool frequency chart has no canonical order | `zeusApiUrl` unset or `/api/tool-order` unreachable | Set `ZeusTraceConfig.zeusApiUrl`; check Network tab |
| JSON dumps show plain `<pre>` instead of tree viewer | jsnview CDN blocked | Allow `cdn.jsdelivr.net`, or rely on the text fallback |
| Widget styles missing | DaisyUI CDN blocked | Allow `cdn.jsdelivr.net` |
| Early `appendTraceCard` calls lost | Custom stub overwrote the queue | Use the built bundle as-is; it installs the queue before mount |

## Docs

- Feature guide: [`.grok/guides/EMBEDDABLE_TRACE_WIDGET.md`](.grok/guides/EMBEDDABLE_TRACE_WIDGET.md)
- Jira: [ZC-31](https://kotenai.atlassian.net/browse/ZC-31)