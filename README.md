# zeus_client_chat_trace

Embeddable Zeus Tracer **v1.2.3**. Drop a single script tag into any host page to surface a floating (or docked) inspector aligned with the `zeus_client` Turn traces panel and `kotenai-zeus-client` **2.3.0** debug data (`TurnResult.debug` / `public_trace` / detective / hops).

## What it does

When a host application calls the Zeus search API, the response includes a `trace` object with step-by-step execution data (LLM rounds, tool calls, spans, token usage, and more). This widget renders that data in a developer-friendly panel without modifying the host app's layout or styles.

**Key capabilities:**

- **One-script embed** — Load `dist/zeus_client_chat_trace.js` asynchronously; the widget mounts itself in an isolated Shadow DOM.
- **Debug kill switch** — UI is **off by default**. Show it with `?debug=true` on the host page URL, or set `ZeusTraceConfig.enabled = true` / `data-enabled="true"`.
- **Inspector chrome** — Light DaisyUI 4.12 inspector (Shadow DOM): turn (or unit) dropdown above tabs Overview · Diagnosis · Prompt · Timeline · Tools · Session · Raw. Title is **Turn traces**. Diagnosis strip auto-opens **Diagnosis** on warn/fail. Hub Detective is a header deep-link.
- **v2.3.0 payloads** — `appendTraceCard` accepts legacy `{ trace }` cards **and** `debug` / `public_trace` bags (hops, tokens rollup, catalog flags, semantic_cache notes, stamp.user).
- **Performance metrics** — Wall / AI / Zeus bar, token in/out/total (+ cached), synthesized spans when `public_trace` omits them.
- **Waterfall** — Timeline spans waterfall (Hub ai/tool/other palette) plus speed KPIs. No Story spine.
- **Job / units rail** — When `trace.multi_agent` is set, the list becomes units (Mode 3 UI only).
- **JSON dumps** — Raw tab uses [jsnview](https://www.npmjs.com/package/jsnview) (lazy CDN) with a plain-text fallback. DaisyUI **4.12.10** `full.min.css` is injected **into the shadow** (not the host document).
- **Early-call queue** — Calls to `appendTraceCard` or `openDebugPanel` made before the script finishes loading are buffered and replayed automatically.
- **Copy all** — Export the current trace session to the clipboard as JSON.
- **Click to copy** — Session / job / turn / req IDs and hop/LLM/inject/raw Copy buttons write the clipboard (Shadow DOM safe).

The widget does **not** perform searches itself. The host app is responsible for calling Zeus and passing the response to `appendTraceCard`.

## Chat trace flow

The widget sits beside your chat UI as a passive observer. Your app owns the conversation and the Zeus API call; the widget only receives the response and renders the `trace` payload.

```mermaid
sequenceDiagram
    participant User
    participant Host as Host app
    participant Zeus as Zeus API
    participant Widget as Trace widget

    Note over Host,Widget: Setup (once per page load)
    Host->>Widget: Set ZeusTraceConfig (optional)
    Host->>Widget: Load zeus_client_chat_trace.js (async)
    Widget->>Widget: Install early-call queue
    Widget->>Widget: Resolve enabled (?debug=true / enabled config)
    alt enabled
        Widget->>Widget: Mount Shadow DOM panel + toggle
        Widget->>Widget: Background /api/tool-order (optional)
        Widget->>Widget: Drain queued appendTraceCard / openDebugPanel calls
    else disabled
        Widget->>Widget: Install no-op APIs (no DOM)
    end
    Widget-->>Host: ZeusTrace.ready resolves

    Note over User,Zeus: Each chat turn
    User->>Host: Send message / search query
    Host->>Zeus: POST search (question, session, etc.)
    Zeus-->>Host: Response JSON (answer + trace)
    Host->>Widget: appendTraceCard(question, responseJson)
    Widget->>Widget: Build trace card (metrics, waterfall, charts, dumps)
    opt User opens panel
        Host->>Widget: openDebugPanel()
        User->>Widget: Toggle button (bottom-left)
    end
```

### Phases

**1. Embed and bootstrap**

1. The host page optionally sets `window.ZeusTraceConfig` (or `data-*` attributes on the script tag).
2. The async bundle loads. Before mount completes, `appendTraceCard` and `openDebugPanel` are stubbed to push into an **early-call queue** so nothing is lost.
3. On `DOMContentLoaded`, `bootstrap.js` resolves config and the **enabled kill switch** (see below). If disabled, it installs no-op APIs, skips DOM, and resolves `ZeusTrace.ready` immediately.
4. When enabled, it creates `#zeus-trace-host` (or a docked `mountSelector`), attaches an open Shadow DOM, injects DaisyUI 4.12.10 + widget markup/styles, calls `initZeusTrace`, installs globals, and drains the early-call queue. `ZeusTrace.ready` resolves at this point.
5. Config is resolved (`ZeusTraceConfig` → script `data-*` → build-time `.env` defaults). If `toolOrder` is injected it is used immediately; otherwise, when `zeusApiUrl` is set, the widget **best-effort** fetches `/api/tool-order` (3s timeout) in the background to order tool-frequency bars. This fetch never blocks the widget or `appendTraceCard`.
6. Host calls continue to work even if tool-order is slow, fails, or hangs (and are silent no-ops when the widget is disabled).

### Kill switch (show / hide)

The floating panel is **hidden by default** so end users never see the debugger unless you opt in.

| Source | How to enable | Notes |
|--------|---------------|--------|
| Page URL | `?debug=true` (also `1`, `yes`, `on`) | Most common for demos / support |
| Config | `window.ZeusTraceConfig.enabled = true` | Always on for that host |
| Script attr | `data-enabled="true"` | Same as config |
| Disable | `enabled: false`, `data-enabled="false"`, or `?debug=false` | Explicit config wins over the query string |

Resolution order: **explicit `enabled` / `data-enabled`** → **`debug` query param** → **default `false`**.

When disabled: no `#zeus-trace-host`, no tool-order fetch. `appendTraceCard` / `openDebugPanel` remain safe no-ops. Check `ZeusTrace.config.enabled` after ready.

**2. Search (host responsibility)**

The widget never calls Zeus search. For each user turn, the host app:

1. Sends the user's question to the Zeus search endpoint.
2. Receives a JSON body that includes `answer` and a `trace` object (rounds, spans, steps, `ai_requests`, `tool_calls`, optional session/contract metadata).

**3. Ingest trace (`appendTraceCard`)**

When the host calls `appendTraceCard(question, responseJson)`:

| Step | What happens |
|------|----------------|
| Coerce | Requires `responseJson.trace` **or** `responseJson.debug` (2.3.0 `DebugBundle`). G2 keys and array `business_rules_triggers` are stripped. |
| Session | Updates `chat_id`; session bar shows sid / round / contract / preferred req / cache notes |
| List | Newest turn selected in the dropdown above the tabs (job mode: Unit) |
| Detail | Question, wall/AI/Zeus metrics, token in/out/cached, catalog chips (MINI / BRIEF / base_id / floor) |
| Overview | Envelope facts (`det-env`). Cost KPIs live on Tools. |
| Diagnosis | If detective grade is warn/fail or a hop is ≥400, show the strip and auto-open **Diagnosis** once |
| Prompt | Checklist tiles; job units also show goal/inject |
| Timeline | Waterfall from `spans` or synthesized hops/steps; speed KPIs; tool-frequency fold |
| Tools | Cost/result KPIs, AI request req‖res, hops table + req‖res. Bytes from hop size fields, matching tool step, or UTF-8 of `result_json` / `res` / `snippet` |
| Session | Ids and related hops |
| Raw | jsnview tree of the public_trace projection |
| Retention | Keeps the latest 12 turns |

**4. User interaction**

- The floating toggle (bottom-left) opens/closes the overlay without host code. Docked mount (`mount: "docked"`) fills `mountSelector` and stays open.
- `openDebugPanel()` lets the host surface the panel immediately after a search.
- **Copy all** exports the current session (`chat_id` + trace entries) as JSON to the clipboard.
- Click-to-copy IDs and per-pane Copy buttons use a Shadow DOM–safe clipboard path (sync `execCommand` plus Clipboard API). Toast appears inside the inspector.

### Data path (one turn)

```
User query
    → Host app → Zeus search API
        → responseJson { answer, trace: { spans, steps, ai_requests, tool_calls, ... } }
            → appendTraceCard(question, responseJson)
                → Shadow DOM trace card (#1, #2, …)
                    → metrics · waterfall · tool chart · JSON dumps
```

See `examples/embed.html` for a working host that queues an early trace, then appends fixture data on button click.

Sibling **TravelPlan** (`../demo_travel_sample`) vendors this package at **1.2.3** (`/static/zeus_client_chat_trace.js?v=1.2.3`). Refresh that pin with `../demo_travel_sample/scripts/vendor_trace.sh`. CDN: `https://koten-static-cdn.nyc3.cdn.digitaloceanspaces.com/zeus_client_chat_trace/1.2.3/zeus_client_chat_trace.js`.

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

### Publish to CDN (DigitalOcean Spaces)

Versioned public CDN for the built bundle (Space `koten-static-cdn`, region `nyc3`):

```bash
npm run build
npm run publish:cdn   # scripts/upload_dist_cdn.sh
```

Uploads both a **semver path** (immutable cache) and a **`latest`** pointer (short cache):

| URL | Cache |
|-----|--------|
| `https://koten-static-cdn.nyc3.cdn.digitaloceanspaces.com/zeus_client_chat_trace/<version>/zeus_client_chat_trace.js` | 1y immutable |
| `https://koten-static-cdn.nyc3.cdn.digitaloceanspaces.com/zeus_client_chat_trace/latest/zeus_client_chat_trace.js` | 60s |

Credentials: `DO_SPACES_KEY` / `DO_SPACES_SECRET` (see `.secrets/spaces-static.env`, gitignored). Optional `DIGITALOCEAN_TOKEN` creates/ensures the CDN endpoint. Origin (non-CDN) URLs use the same host without `.cdn.`.

**Optional — build-time defaults:** Copy `.env.example` to `.env` and set defaults that apply when no runtime config is provided:

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `ZEUS_API_URL` | Default Zeus API base URL (e.g. `http://localhost:8080`) |
| `ZEUS_AUTH_TOKEN` | Default Bearer token for Zeus API requests |
| `HUB_BASE_URL` | Default Hub / Detective origin (e.g. `http://127.0.0.1:9091`). Leave empty for CDN builds. |

Runtime config always overrides these build-time values.

### 2. Embed in your host page

Add configuration and the script tag to any HTML page:

```html
<script>
  window.ZeusTraceConfig = {
    zeusApiUrl: "https://zeus.example.com",
    zeusAuthToken: "optional-bearer-token",
    hubBaseUrl: "http://zeus-dev.local:9091",
    // Optional hard enable. Omit and use ?debug=true on the page instead.
    // enabled: true,
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
  data-hub-base-url="http://zeus-dev.local:9091"
  data-enabled="true"
></script>
```

Config resolution order:

| Field | Resolution |
|-------|------------|
| `zeusApiUrl`, `zeusAuthToken`, `toolOrder`, `enabled` | `window.ZeusTraceConfig` → script `data-*` → build-time `.env` defaults (where applicable) |
| **`hubBaseUrl`** | `window.ZeusTraceConfig.hubBaseUrl` (or `hub_url`) → script `data-hub-base-url` → `.env` `HUB_BASE_URL` → `""` |
| `mount`, `mountSelector` | `overlay` (default floating panel) or `docked` plus a CSS selector for the host slot |

**Visibility:** without `enabled: true` / `data-enabled="true"`, open the host page with `?debug=true` (e.g. `https://app.example/?debug=true`) or the panel will not mount.

### Hub base URL (`hubBaseUrl`) — Detective link

`hubBaseUrl` is the **Zeus Hub / Detective origin**. It is often **not** the same host as the public Zeus API (`zeusApiUrl`). Local Hub admin commonly listens on port **`:9091`**.

When `hubBaseUrl` is set, Detective / Hub controls open that origin (never a hardcoded host):

```text
Detective / Open in Hub / preferred req  →  {hubBaseUrl}/hub/#/debug/req/{req_id}
Hub session ↗ / session                    →  {hubBaseUrl}/hub/debug/session/{session_id}
```

Hostname `http://hub` is a valid origin (it is not treated as a `/hub` path). When `hubBaseUrl` is unset/empty, those controls do not open a tab (toast: set `ZeusTraceConfig.hubBaseUrl`).

#### How to set or change it

1. **Preferred — host page config (before the widget script loads):**

   ```js
   window.ZeusTraceConfig = {
     ...(window.ZeusTraceConfig || {}),
     hubBaseUrl: "http://127.0.0.1:9091", // or http://zeus-dev.local:9091
   };
   ```

2. **Script attribute:**

   ```html
   <script
     src="…/zeus_client_chat_trace.js"
     async
     data-hub-base-url="http://127.0.0.1:9091"
   ></script>
   ```

   (`data-hub-base-url` → `dataset.hubBaseUrl`. Trailing slashes are stripped.)

3. **Optional `.env` `HUB_BASE_URL`:** used only when runtime config and `data-hub-base-url` are empty. Prefer runtime config for hosts; leave `HUB_BASE_URL` empty when publishing the CDN bundle.

4. **After the widget is already loaded:** Detective / Hub clicks re-read `window.ZeusTraceConfig.hubBaseUrl` (or `hub_url`). Confirm with:

   ```js
   (await window.ZeusTrace.ready).config.hubBaseUrl
   // or
   window.ZeusTrace.config.hubBaseUrl
   ```

#### Examples

| Environment | Typical `hubBaseUrl` |
|-------------|----------------------|
| Local Hub admin | `http://127.0.0.1:9091` |
| Lab / hosts file | `http://zeus-dev.local:9091` |
| Demo placeholder | `http://hub` (see `examples/embed.html`) |

Do **not** point `hubBaseUrl` at the public API port (often `:8080`) unless Hub is actually served there — Detective routes live on the Hub origin.

### 3. Feed traces after each search

After your app receives a Zeus API response, pass the user query and full JSON body to the widget. Ensure `session_id` is on the payload when available (Detective links by session):

```js
// responseJson must include a `trace` object
window.appendTraceCard(userQuery, {
  ...responseJson,
  session_id: responseJson.session_id,
});

// Optionally open the panel immediately
window.openDebugPanel?.();
```

Wait for the widget to finish mounting before relying on the real implementations (optional, but useful if you need config or error handling):

```js
const { api, config } = await window.ZeusTrace.ready;
api.appendTraceCard(userQuery, responseJson);
api.openDebugPanel();
```

A floating toggle button (bottom-left) lets users open and close the overlay at any time.

Detective link behavior (needs both `hubBaseUrl` and session id) is described in [Hub base URL](#hub-base-url-hubbaseurl--detective-link) above.

Session-id resolution: top-level `session_id` → `trace.session_id` → `trace.session.id` → `trace.session.session_id` → `session.id`.

### 4. Open the widget locally (development)

The playground is a **local-only** page. It is not uploaded with `npm run publish:cdn`.

```bash
npm start
```

Then open [http://localhost:5199/](http://localhost:5199/). The inspector fills the browser (docked). Fixture buttons, paste JSON, and a file picker feed traces without a host app.

| URL | What you see |
|-----|----------------|
| [http://localhost:5199/](http://localhost:5199/) | Full-page widget (docked) |
| [http://localhost:5199/?mount=overlay](http://localhost:5199/?mount=overlay) | Same page, floating overlay |
| [http://localhost:5199/examples/embed.html](http://localhost:5199/examples/embed.html) | Host-page embed demo |

`npm start` builds once, then watches `src/` and serves on port **5199**. Refresh the browser after a rebuild. Override the port with `PORT=5200 npm start`.

The host-only demo (no watch) is still:

```bash
npm run build
npm run serve
```

## API reference

| Global | Description |
|--------|-------------|
| `window.ZeusTraceConfig` | Set **before** loading the script. `{ zeusApiUrl, zeusAuthToken, hubBaseUrl, toolOrder, enabled, mount, mountSelector }` (`mount`: `"overlay"` default or `"docked"`) |
| `window.appendTraceCard(question, responseJson)` | Append a trace card. `responseJson.trace` is required. Prefer also passing `session_id` for the Detective deep-link. No-op when the widget is disabled. |
| `window.openDebugPanel()` | Show the debug panel. No-op when disabled. |
| `window.ZeusTrace.ready` | Promise resolving to `{ api, config }` once bootstrap finishes (mounted or intentionally disabled). |
| `window.ZeusTrace.config` | Read-only public config (`zeusApiUrl`, `hubBaseUrl`, `toolOrder`, `enabled`, `mount`, `mountSelector`, `version`; token is never exposed). |
| `window.ZeusTrace.version` | Built widget version from `package.json` (also shown in the panel footer when mounted). |

### Expected response shape

`appendTraceCard` expects a Zeus API response **or** a 2.3.0 BFF bag. At minimum `responseJson.trace` **or** `responseJson.debug` must be present. Recommended BFF recipe: sample-app `python3/turn_mapper.trace_payload(TurnResult)`.

Legacy / merged `trace` shape:

```js
{
  chat_id: "optional-host-chat-id",
  session_id: "optional-zeus-session-id",
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

Or pass a 2.3.0 debug bag (spans optional; hops/tokens/detective live on `debug` + `public_trace`):

```js
window.appendTraceCard(question, {
  session_id: result.debug.session_id,
  debug: result.debug, // DebugBundle.to_dict() + public_trace
});
```

See `examples/embed.html` for legacy and v2.3.0 fixtures.

## Development

| Command | Description |
|---------|-------------|
| `npm start` | Build, watch, and serve the local playground on port 5199 |
| `npm run dev` | Rebuild on file changes (`esbuild --watch`) |
| `npm run serve` | Static file server on port 5199 (no watch) |
| `npm test` | Run unit tests once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run publish:cdn` | Upload `dist/` to DO Spaces + ensure CDN (`scripts/upload_dist_cdn.sh`) |

### Project layout

```
src/
  bootstrap.js      Entry point — mounts Shadow DOM, exposes globals
  trace.js          Overlay/docked facade (`appendTraceCard`, toggle)
  panel.js          Inspector (list + tabs), ported from zeus_client
  normalize.js      Legacy + 2.3.0 `TurnResult.debug` view-model
  helpers.js        Waterfall, hops, detective formatters
  config.js         Config resolution and Zeus API fetch helper
  jsnview-loader.js Lazy-loads jsnview from CDN
  widget.html       Overlay + inspector markup
  widget.css        Dark `.tt-*` inspector + overlay chrome
sketches/
  v1-overlay-inspector/  Locked visual mockup (review before CSS/JS changes)
dist/
  zeus_client_chat_trace.js   Built bundle (commit or deploy this)
scripts/
  upload_dist_cdn.sh          Publish dist/ to Spaces CDN (versioned + latest)
dev/
  index.html        Local-only full-page playground (`npm start` → http://localhost:5199/)
examples/
  embed.html        Host-page integration demo
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| No toggle / no `#zeus-trace-host` | Kill switch off (default) | Add `?debug=true` to the page URL, or set `ZeusTraceConfig.enabled = true` / `data-enabled="true"` |
| Tool frequency chart has no canonical order | `zeusApiUrl` unset, `/api/tool-order` unreachable, or only `toolOrder.v1` filled while turns are v2 | Inject `ZeusTraceConfig.toolOrder`, or set a same-origin `zeusApiUrl`; check Network tab |
| Widget toggle present but no cards after search | Host never called `appendTraceCard`, or payload missing `trace` | Call `appendTraceCard(query, data)` with `data.trace` |
| Panel not visible (toggle exists) | Panel starts closed (`is-hidden`) | Click the lightning toggle (bottom-left) or call `openDebugPanel()` |
| JSON dumps show plain `<pre>` instead of tree viewer | jsnview CDN blocked | Allow `cdn.jsdelivr.net`, or rely on the text fallback |
| No tool-call rounds / dumps never appear | Stale bundle with broken jsnview URL hanging load | Redeploy rebuilt `dist/zeus_client_chat_trace.js` |
| Widget styles missing | Bundle not rebuilt / Shadow DOM blocked | Rebuild `dist/`; check `#zeus-trace-host` shadow root |
| Playground 404 / no inspector | `npm start` not running, or port taken | `npm start` then open http://localhost:5199/; `PORT=5200 npm start` if 5199 is busy |
| Early `appendTraceCard` calls lost | Custom stub overwrote the queue | Use the built bundle as-is; it installs the queue before mount |
| Detective link hidden or wrong | Missing `hubBaseUrl` / `session_id`, wrong Hub origin, or stale bundle still on `/hub/debug/req/...` | Set `hubBaseUrl` (see [Hub base URL](#hub-base-url-hubbaseurl--detective-link)); ensure payload includes `session_id`; reload after config change; rebuild/sync widget |

## Docs

- Feature guide: [`.grok/guides/EMBEDDABLE_TRACE_WIDGET.md`](.grok/guides/EMBEDDABLE_TRACE_WIDGET.md)
- Local playground: [`.grok/guides/LOCAL_DEV_PLAYGROUND.md`](.grok/guides/LOCAL_DEV_PLAYGROUND.md)
- v1 inspector: [`.grok/guides/V1_INSPECTOR.md`](.grok/guides/V1_INSPECTOR.md)
- Mockup: [`sketches/v1-overlay-inspector/`](sketches/v1-overlay-inspector/)
- Jira: [ZC-31](https://kotenai.atlassian.net/browse/ZC-31)