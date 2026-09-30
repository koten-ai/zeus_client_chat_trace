# Plan: ZC-43 Request ID Title + Hub Detective Link

**Date**: 2026-07-22  
**Task**: Show the latest Zeus request ID in the debugger panel title and deep-link to Hub Detective in a new tab.  
**Priority**: Medium  
**Estimated Effort**: ~2–3 hours / 8 steps  
**Jira**: ZC-43  
**Status**: Plan only (no implementation in this step)

## 1. Context & Requirements

- **Goal**: Update the embeddable Zeus Trace debugger so operators can see `Zeus Tracer: {requestID}` and open Hub Detective for that request without manually copying IDs.
- **Success criteria** (from ZC-43 AC):
  1. With a known request ID, title is exactly `Zeus Tracer: {requestID}`.
  2. With no request ID, title is `Zeus Tracer` (no dangling colon/empty id).
  3. A control next to the title (e.g. `Detective ↗`) opens Hub Detective for that ID.
  4. Link opens in a **new** tab/window: `target="_blank"` + `rel="noopener noreferrer"` (do not navigate the host).
  5. After each successful `appendTraceCard`, title/link update to the **latest** request ID for that session.
  6. If `hubBaseUrl` or request ID is missing, hide/disable the link (no broken URL). Optional toast: `No request ID for Detective`.
  7. Unit tests cover title with/without ID and Detective URL construction.
- **Constraints**:
  - Shadow DOM widget (`src/widget.html` + `src/widget.css` + `src/trace.js`); no host style leakage.
  - Widget does not see HTTP response headers; request ID must come from host-forwarded body fields (or host attaching `req_id` when calling `appendTraceCard`).
  - Hub admin base (`:9091`) is often **not** the same as `zeusApiUrl` (`:8080`) — require explicit `hubBaseUrl`.
  - Existing test harness uses minimal inline HTML in `src/trace.test.js` (not live `widget.html`); keep test markup in sync with new ids.
  - Verify with `npm test` and `npm run build`.
- **Assumptions**:
  - Canonical Detective path: `/hub/debug/req/{req_id}` (legacy `/admin/debug/req/{req_id}` is out of scope unless product asks).
  - AC prefers **full** request ID in the title string (not shortened); `title` tooltip / URL always use full id.
  - `publicConfig` may expose `hubBaseUrl` (safe; not a secret) alongside `zeusApiUrl` / `toolOrder`.
  - **`hubBaseUrl` is always host-supplied at runtime** (implementation will wire config; no derivation from `zeusApiUrl`). Host sets it before/with the widget, e.g.:

```html
<script>
  window.ZeusTraceConfig = {
    zeusApiUrl: "http://localhost:8080",
    hubBaseUrl: "http://hub", // e.g. local hub / detective origin
  };
</script>
<script src="/dist/zeus_client_chat_trace.js" async></script>
```

  Or via script attribute: `data-hub-base-url="http://hub"`.
  Default when unset remains `""` (Detective link hidden). Demo/embed can use `http://hub` or `http://localhost:9091` as a concrete sample.
- **Out of Scope**:
  - Per-card Detective links.
  - Implementing or changing Hub Detective / Zeus server routes.
  - Reading response headers from inside the widget without host cooperation.
  - Auto-deriving Hub URL from `zeusApiUrl`.

## 2. Analysis & Research

- **Key files explored**:
  - `src/widget.html` — static `<h2 class="font-bold text-sm">Zeus Trace</h2>` (line 16); header has Copy all + close only.
  - `src/widget.css` — `.debug-panel-header` flex row (lines 51–59); no title-row / detective link styles yet.
  - `src/config.js` — `resolveConfig()` returns `{ zeusApiUrl, zeusAuthToken, toolOrder }`; `publicConfig` strips token only.
  - `src/config.test.js` — expects exact config object shapes (will need `hubBaseUrl` updates).
  - `src/trace.js` — `initZeusTrace`; tracks `chatId` but not request id; `appendTraceCard` (≈452+) validates `j.trace`, applies tool order, renders card; `shortId` / `showToast` already exist.
  - `src/trace.test.js` — minimal `widgetHtml` fixture still says `Zeus Trace` and lacks detective link nodes.
  - `examples/embed.html` — demo fixtures lack `req_id` / `hubBaseUrl`.
  - `README.md`, `.grok/guides/EMBEDDABLE_TRACE_WIDGET.md` — document config + host integration; need hub + req_id notes.
- **Potential risks/edge cases**:
  - Request ID only in `X-Zeus-Req-Id` header → widget never sees it → Mitigation: document host must attach `req_id` on `appendTraceCard`; extract from multiple body fields as fallback.
  - Broken Detective URL if hub base empty → Mitigation: hide/disable link when `!hubBaseUrl || !requestId`.
  - Special characters in req ids → Mitigation: `encodeURIComponent` in URL builder.
  - Card without id after one with id → AC: leave previous title unchanged (do not clear).
  - Payload without `trace` → existing early return; do not update title for ignored payloads.
  - Test fixture HTML drift from real `widget.html` → update both in the same change.
  - Config tests assert full object equality → adding `hubBaseUrl` breaks tests unless all expected objects updated.
- **Alternatives considered**:
  - Derive hub from `zeusApiUrl` by port swap → fragile across deploys; ticket prefers explicit `hubBaseUrl`.
  - `window.open` on title click → popup blockers; prefer real `<a target="_blank">`.
  - Per-card Detective links → nice-to-have follow-up; out of scope for ZC-43.

## 3. Step-by-Step Implementation Plan

### 1. Add `hubBaseUrl` to config resolution

- **Files to change**: `src/config.js`, `src/config.test.js`
- **Changes**:
  - In `resolveConfig()`, resolve and strip trailing slash:

```javascript
const hubBaseUrl = (
  fromWindow.hubBaseUrl ||
  script?.dataset?.hubBaseUrl ||
  ""
).replace(/\/$/, "");
```

  - Include `hubBaseUrl` in the returned config object.
  - In `publicConfig(config)`, expose `hubBaseUrl` (do **not** expose token):

```javascript
return {
  zeusApiUrl: config.zeusApiUrl,
  hubBaseUrl: config.hubBaseUrl,
  toolOrder: config.toolOrder,
};
```

  - Optional pure helper (same file or `trace.js` — prefer `config.js` if shared/tested with config):

```javascript
export function detectiveUrl(hubBaseUrl, requestId) {
  if (!hubBaseUrl || !requestId) return "";
  const base = String(hubBaseUrl).replace(/\/$/, "");
  return `${base}/hub/debug/req/${encodeURIComponent(requestId)}`;
}
```

  - Dataset attribute name: `data-hub-base-url` → `dataset.hubBaseUrl` (standard camelCase).
- **Tests needed** (`src/config.test.js`):
  - Window `hubBaseUrl` with trailing slash stripped.
  - Script dataset fallback.
  - Window wins over dataset.
  - Empty string when unset (update **all** `toEqual` expectations that list full config to include `hubBaseUrl: ""` or the set value).
  - `publicConfig` includes `hubBaseUrl`, still omits `zeusAuthToken`.
  - `detectiveUrl("http://localhost:9091", "abc")` → `http://localhost:9091/hub/debug/req/abc`.
  - `detectiveUrl("", "abc")` / `detectiveUrl("http://h", "")` → `""`.
  - `detectiveUrl("http://h", "a/b")` encodes slash via `encodeURIComponent`.
- **Commands**: `npx vitest run src/config.test.js`

### 2. Update panel header markup

- **Files to change**: `src/widget.html`
- **Changes**: Replace static title block with structured left-side title row (keep Copy all + close on the right):

```html
<header class="debug-panel-header">
  <div class="debug-panel-title-row">
    <h2 id="debug-panel-title" class="font-bold text-sm">Zeus Tracer</h2>
    <a
      id="debug-detective-link"
      class="debug-detective-link is-disabled"
      href="#"
      target="_blank"
      rel="noopener noreferrer"
      aria-disabled="true"
      title="Open Hub Detective for this request"
      hidden
    >Detective ↗</a>
  </div>
  <div class="flex gap-2">
    <button type="button" id="trace-copy-full" class="btn btn-xs btn-ghost">Copy all</button>
    <button type="button" id="debug-close" class="btn btn-xs btn-ghost" aria-label="Close">×</button>
  </div>
</header>
```

- **Note**: Product string is **Zeus Tracer** (ticket AC), not the current **Zeus Trace**.
- **Tests needed**: Covered via trace tests once fixture HTML is updated (step 4).

### 3. Style title row + Detective link

- **Files to change**: `src/widget.css`
- **Changes** (after `.debug-panel-header`):

```css
.debug-panel-title-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  min-width: 0;
}

.debug-panel-title-row h2 {
  margin: 0;
  word-break: break-all;
}

.debug-detective-link {
  font-size: 0.75rem;
  line-height: 1;
  text-decoration: underline;
  color: hsl(var(--p));
  white-space: nowrap;
  cursor: pointer;
}

.debug-detective-link.is-disabled,
.debug-detective-link[aria-disabled="true"] {
  opacity: 0.45;
  pointer-events: none;
  cursor: not-allowed;
  text-decoration: none;
}
```

- Keep styles inside the shadow stylesheet only.

### 4. Wire request-id extraction + title/link updates in `trace.js`

- **Files to change**: `src/trace.js`
- **Changes**:
  1. Import `detectiveUrl` from `./config.js` if exported there (or keep local pure helper next to extractors).
  2. Module state inside `initZeusTrace`: `let latestRequestId = null;`
  3. Add extractors:

```javascript
function extractRequestId(j) {
  if (!j || typeof j !== "object") return "";
  return String(
    j.req_id ||
    j.request_id ||
    j.zeus_req_id ||
    j.trace?.req_id ||
    j.trace?.request_id ||
    (Array.isArray(j.req_ids) && j.req_ids[j.req_ids.length - 1]) ||
    (Array.isArray(j.meta?.req_ids) && j.meta.req_ids[j.meta.req_ids.length - 1]) ||
    ""
  ).trim();
}

function updateDebugTitle(requestId) {
  const titleEl = $("debug-panel-title");
  const linkEl = $("debug-detective-link");
  const rid = (requestId || "").trim();

  if (titleEl) {
    titleEl.textContent = rid ? `Zeus Tracer: ${rid}` : "Zeus Tracer";
    if (rid) titleEl.setAttribute("title", rid);
    else titleEl.removeAttribute("title");
  }

  if (!linkEl) return;

  const href = detectiveUrl(config.hubBaseUrl, rid);
  if (href) {
    linkEl.href = href;
    linkEl.hidden = false;
    linkEl.classList.remove("is-disabled");
    linkEl.setAttribute("aria-disabled", "false");
    linkEl.setAttribute("title", `Open Hub Detective for ${rid}`);
  } else {
    linkEl.removeAttribute("href"); // or href="#"
    linkEl.hidden = true;
    linkEl.classList.add("is-disabled");
    linkEl.setAttribute("aria-disabled", "true");
    linkEl.setAttribute("title", "Open Hub Detective for this request");
  }
}
```

  4. Call `updateDebugTitle(null)` once during init so default title is correct even if HTML drifts.
  5. At start of `appendTraceCard`, after `if (!t) return;`:

```javascript
const rid = extractRequestId(j);
if (rid) {
  latestRequestId = rid;
  updateDebugTitle(rid);
}
```

  6. Do **not** clear title when a later card has no id.
  7. Do **not** use `window.open`; rely on the `<a>`.
  8. Optional: if product wants toast when user somehow activates disabled control — prefer keep link hidden; toast is optional AC.
- **Commands**: none until tests land.

### 5. Unit tests (TDD-friendly; can write before/with step 4)

- **Files to change**: `src/trace.test.js` (and `src/config.test.js` from step 1)
- **Changes to fixture HTML** — mirror production ids:

```html
<header class="debug-panel-header">
  <div class="debug-panel-title-row">
    <h2 id="debug-panel-title">Zeus Tracer</h2>
    <a id="debug-detective-link" class="debug-detective-link is-disabled" href="#"
       target="_blank" rel="noopener noreferrer" aria-disabled="true" hidden>Detective ↗</a>
  </div>
  <button type="button" id="trace-copy-full">Copy all</button>
  <button type="button" id="debug-close">×</button>
</header>
```

- **New cases** (describe block e.g. `debug panel title / Detective link`):
  1. **Default**: after `initZeusTrace`, `#debug-panel-title` text is `Zeus Tracer`; link is `hidden` / `aria-disabled="true"`.
  2. **With id + hub**: `initZeusTrace(root, { hubBaseUrl: "http://hub", zeusApiUrl: "", zeusAuthToken: "" })` then `appendTraceCard(..., makeTraceFixture({ req_id: "req-abc" }))` → title `Zeus Tracer: req-abc`; link `href` is `http://hub/hub/debug/req/req-abc`; `target="_blank"`; `rel` contains `noopener`; not hidden.
  3. **Latest wins**: second card with `req_id: "req-xyz"` updates title/link to `req-xyz`.
  4. **Missing id fields**: card without any request-id keys leaves previous title unchanged (seed with a first card that sets id, then append without id).
  5. **Missing hub only**: id present but `hubBaseUrl: ""` → title still shows id; link stays hidden/disabled (no broken URL).
  6. **Encoding**: `req_id: "a/b c"` → href ends with encoded segment (`a%2Fb%20c` or equivalent from `encodeURIComponent`).
  7. **Field priority** (optional one-liner): fixture with only `trace.req_id` still extracts.
  8. **No-trace payload**: still ignored; title unchanged.
- **Commands**:

```bash
npm test
npm run build
```

### 6. Demo + host docs

- **Files to change**: `examples/embed.html`, `README.md`
- **`examples/embed.html`**:
  - Add explicit `hubBaseUrl: "http://hub"` (or real local hub origin) to `ZeusTraceConfig` — host-set only; widget does not invent a default.
  - Add distinct `req_id` values on early fixture and main `fixture` (e.g. `demo-req-early`, `demo-req-001`) so the Detective link is visible and points at `{hubBaseUrl}/hub/debug/req/{req_id}`.
- **`README.md`**:
  - Document `hubBaseUrl` / `data-hub-base-url` in config table.
  - Document host responsibility:

```js
// Prefer body field if Zeus includes it; else forward header:
appendTraceCard(query, {
  ...data,
  req_id: data.req_id || response.headers.get("X-Zeus-Req-Id"),
});
```

  - Note Detective URL shape: `{hubBaseUrl}/hub/debug/req/{req_id}`.
  - Update any “Zeus Trace” panel naming if README describes the header string.

### 7. Feature guide update

- **Files to change**: `.grok/guides/EMBEDDABLE_TRACE_WIDGET.md`
- **Changes** (per AGENTS.md guide template sections; prefer update over new guide):
  - Overview: panel title shows latest request ID; Detective deep-link.
  - Architecture: extractRequestId → updateDebugTitle on appendTraceCard; config.hubBaseUrl.
  - Setup/config: `hubBaseUrl` example in `ZeusTraceConfig`.
  - How to use: host must pass `req_id` from `X-Zeus-Req-Id` when body lacks it.
  - Debugging table rows:
    | Detective link hidden | Missing `hubBaseUrl` or `req_id` | Set config + forward header |
    | Title stuck on Zeus Tracer | Payload has no req id fields | Attach `req_id` in host |
  - Related artifacts: ZC-43 link; this plan path; list files touched.
  - Changelog row for 2026-07-22 / ZC-43.

### 8. Final verification

- **Commands**:

```bash
npm test
npm run build
# optional manual:
npm run serve
# open http://localhost:5199/embed.html — run simulate search; confirm title + Detective link
```

- **Manual checklist**:
  - [ ] Empty session: title `Zeus Tracer`, no Detective link.
  - [ ] After fixture with `req_id` + `hubBaseUrl`: title includes full id; Detective opens new tab to `/hub/debug/req/...`.
  - [ ] Host page URL unchanged when clicking Detective.
  - [ ] Second turn with new id updates header.
  - [ ] Bundle builds; no test regressions.

## 4. Verification & Rollback

- **Tests**:
  - Automated: `npm test` (config + trace cases above).
  - Build: `npm run build`.
  - Manual: `examples/embed.html` with fixture `req_id` + `hubBaseUrl`.
- **Review Checklist**:
  - [ ] Code style matches existing ES modules / vitest patterns
  - [ ] No breaking change to `appendTraceCard(question, j)` signature
  - [ ] Token still never exposed via `publicConfig` / `ZeusTrace.config`
  - [ ] Feature guide updated: `.grok/guides/EMBEDDABLE_TRACE_WIDGET.md`
  - [ ] README documents `hubBaseUrl` + host `req_id` forwarding
  - [ ] AC strings exact: `Zeus Tracer` / `Zeus Tracer: {id}`
  - [ ] Link uses `target="_blank"` + `rel="noopener noreferrer"`
- **Rollback Plan**:
  - Revert the feature commit(s) touching the files listed below.
  - No DB/migrations; pure UI/config client change.

## 5. Open Questions / Decisions Needed

1. **Toast on missing Detective context** — AC says optional. Default in this plan: hide link only (no toast) unless product wants clickable disabled state + toast.
2. **Title rename** — AC uses `Zeus Tracer`; UI currently says `Zeus Trace`. Plan follows AC (`Zeus Tracer`). Confirm if branding elsewhere should stay “Zeus Trace”.
3. **`hubBaseUrl` source** — **Decided (2026-07-22):** host sets it in implementation/runtime config, e.g. `window.ZeusTraceConfig = { hubBaseUrl: "http://hub" }` or `data-hub-base-url="http://hub"`. No derivation from `zeusApiUrl`; empty default hides Detective link. No build-time `.env` default required unless we later want one for demos.
4. **Export surface** — Should `extractRequestId` / `detectiveUrl` be exported for host unit tests outside the bundle, or remain internal + tested via config/trace only? Prefer export `detectiveUrl` from `config.js`; keep `extractRequestId` internal to `trace.js` unless reuse appears.

---

## Files to touch (summary)

| File | Role |
|------|------|
| `src/config.js` | `hubBaseUrl`, `detectiveUrl`, `publicConfig` |
| `src/config.test.js` | Config + URL unit tests |
| `src/widget.html` | Title id + Detective anchor |
| `src/widget.css` | Title row / link styles |
| `src/trace.js` | `extractRequestId`, `updateDebugTitle`, hook in `appendTraceCard` |
| `src/trace.test.js` | Fixture HTML + title/link cases |
| `examples/embed.html` | Demo `hubBaseUrl` + `req_id` |
| `README.md` | Config + host integration |
| `.grok/guides/EMBEDDABLE_TRACE_WIDGET.md` | Guide update |

## Suggested commit message (when implementing)

```
ZC-43: Show request ID in tracer title and link to Hub Detective
```
