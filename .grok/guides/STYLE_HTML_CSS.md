# HTML & CSS Style Guide — Zeus Tracer widget

> Port of `zeus_client/.grok/guides/STYLE_HTML_CSS.md` for this repo.
> Same DaisyUI / Tailwind / OKLCH conventions. Widget paths, Shadow DOM,
> overlay/docked chrome. There is **no** Chat ‖ Catalog ‖ Settings surface here.
>
> **Scope:** Embeddable inspector under `src/widget.html`, `src/widget.css`,
> `src/panel.js`, `src/helpers.js`. Mounted in an open Shadow DOM on
> `#zeus-trace-host` (overlay) or `mountSelector` (docked). The inspector
> (`#tt-panel` / `.tt-panel`) must follow this guide, not the v1 dark
> DevTools hex theme and not a parallel `.tt-btn` sketch theme.
>
> **Replication:** Use this file as the spec when restyling the widget or
> when a host consumes it docked. Copy the anatomy, class strings, and
> [§ Lessons learned](#9-lessons-learned--do-not-skip) — do not restyle
> from memory. Visual mocks: sibling `zeus_client/sketches/007-traces-detective/`
> (Detective IA), `zeus_client/sketches/008-traces-light/` (tab content), and
> `zeus_client/sketches/009-turn-dropdown/` (turn list as a dropdown above the tabs).
> Overlay chrome (lightning toggle, close, version footer) is **this repo
> only** — do not copy Chat split-pane rules from the sample app.
>
> Component reference: https://daisyui.com/components/
>
> Component gallery & inspiration: https://willpinha.github.io/daisy-components/

**Related Plan**: `.grok/plans/TURN_TRACE_UI_DETAIL.md`; `.grok/plans/TURN_DROPDOWN.md`; `.grok/plans/TURN_DROPDOWN_ZINDEX.md`; `.grok/plans/WIDGET_STACKING_SPACING.md`; `.grok/plans/WIDGET_STYLE_HTML_CSS.md`

---

## 1. Golden Rules

- **No HTML emojis or dingbats.** Use SVG icons (Heroicons outline, 24×24
  viewBox, `stroke-width="1.5"`) for every icon. Do not use `★`, `✓`,
  `✗`, `⚠`, `📁`, or `↗` as UI chrome — prefer a Heroicon plus visible
  text (for example Detective + arrow-top-right-on-square). The overlay
  **lightning toggle** is a brand mark (inline SVG), not a dingbat.
- **DaisyUI first.** Use DaisyUI component classes before writing custom
  CSS. Only add custom styles when DaisyUI does not cover the need
  (span waterfall, tool-frequency bars, overlay/docked positioning,
  Shadow DOM `[hidden]`).
- **Tailwind utilities** for layout, spacing, and one-off tweaks. Never
  write raw CSS for something Tailwind covers (`flex`, `gap-2`, `p-4`,
  `text-xs`, …). In this repo those utilities come from **DaisyUI
  `full.min.css` injected into the shadow**, not from `cdn.tailwindcss.com`
  (Tailwind CDN JIT scans the light DOM and never sees the widget).
- **Separate files.** Markup in `src/widget.html`, styles in
  `src/widget.css`, inspector logic in `src/panel.js` + `src/helpers.js`.
  New inspector logic belongs in those JS files, not a growing inline
  `<script>` in `dev/index.html` / `examples/embed.html`.
- **No inline `<style>` blocks** in HTML. Dynamic chart geometry
  (waterfall bar `left`/`width` percentages) may use element `style`
  attributes.
- **Never nest raw backticks inside JS template literals** that build
  HTML (see [§ JS template literals](#js-template-literals--nested-backticks)).
  Prefer string concatenation for HTML, or `<code>` instead of markdown
  ticks.
- **DaisyUI `card` has no border.** Every raised card, tile, dropdown,
  KPI, and IO pane must include `border border-base-300` (or an
  OKLCH `border: 1px solid oklch(var(--b3))` equivalent). `shadow-sm`
  is not a substitute for a border.
- **DaisyUI `btn` fill comes from a color modifier.** `btn-ghost` is
  transparent on purpose. Header Detective uses `btn-primary`. Export /
  Copy all / copy chips use `btn-ghost`. Close (overlay) is `btn-ghost`.
  Never override `.btn { background; color }` — that greys every semantic
  fill. Size-only overrides are allowed. **Do not use `.tt-btn` inside
  `#tt-panel`.**
- **Surfaces and 1px rules use `oklch(var(--b*))`, never `hsl(var(--b*))`.**
  DaisyUI **4.12** stores OKLCH components in `--b1`/`--b3`. Wrapping
  them in `hsl()` is invalid (IACVT) and paints **transparent** —
  this is the usual “missing background / missing border” bug.
- **Shadow isolation is not a second design system.** `all: initial` on
  `:host` blocks host-page CSS. DaisyUI tokens live on
  `.zeus-trace-root[data-theme]`. Do not reintroduce locked hex chrome
  (`#0b0f14`, `#243041`, `#5b8cff`) to “win” against the host.

---

## JS template literals / nested backticks

Most inspector HTML is built as:

```js
panel.innerHTML =
  "<p>help text…</p>";
```

Markdown-style code ticks **inside** a JS template literal terminate the
outer string and throw a parse-time `SyntaxError`.

```js
// BAD — nested ` ends the template early
content.innerHTML = `
  Run the `search` verb with `strategy: fts`.
`;

// GOOD — HTML <code> inside templates
content.innerHTML =
  "Run the <code>search</code> verb with <code>strategy: fts</code>.";
```

### Mandatory check after any JS edit

```bash
node --check src/panel.js src/helpers.js src/bootstrap.js src/trace.js
```

Do not claim a Trace/UI change is done if `node --check` fails.

---

## 2. File Structure

```
src/widget.html     # Overlay + inspector markup (string-loaded into shadow)
src/widget.css      # Overlay/docked chrome + inspector extras DaisyUI cannot cover
src/bootstrap.js    # Shadow mount, DaisyUI link, Inter, data-theme
src/panel.js        # Turn traces inspector (ported from zeus_client/static/trace_panel.js)
src/helpers.js      # Waterfall, Detective formatters, hops/LLM, jsnview
src/trace.js        # Overlay toggle / docked always-open / toast
```

### Rules

- New Trace features add to the files above. Do not add a third design
  system (`tt-btn` vs `btn`) inside `#tt-panel`.
- Overlay-only chrome: `#debug-toggle`, `#debug-close`,
  `#debug-panel-footer`. Docked mount hides toggle + close and fills the
  slot. Widget package version lives in the footer, **not** the traces
  header. Sample-app client version on a top navbar does not exist here.
- Traces header tools (turn count, Export, Copy all, Detective) stay
  hidden until a turn or job request exists. Overlay **close** stays
  visible whenever the overlay is open (needed to dismiss).
- When aligning with `zeus_client`, port inspector interior from
  `templates/index.html` `#tt-panel` + `static/trace_panel.js` +
  `static/trace_helpers.js` + the 007/008 sketches. Do not invent a new
  token set. Do **not** port Chat, Catalog, Settings, or split-pane CSS.

---

## 3. CDN / Shadow stack

The widget is an IIFE bundle (`dist/zeus_client_chat_trace.js`) with
HTML/CSS loaded as text. **Do not** put DaisyUI or Tailwind `<link>` /
`<script>` on the **host** document — that styles the host and still
misses the shadow tree.

Load **inside the shadow root**, in this order:

1. DaisyUI **4.12.10** `full.min.css` (OKLCH themes + Tailwind utilities)
2. `widget.css` (overlay/docked + waterfall + `[hidden]`)
3. `.zeus-trace-root[data-theme="light"]` markup

```js
// bootstrap.js — pin the same DaisyUI patch as zeus_client
const daisy = document.createElement("link");
daisy.rel = "stylesheet";
daisy.href = "https://cdn.jsdelivr.net/npm/daisyui@4.12.10/dist/full.min.css";
shadow.append(daisy, style /* widget.css */, themeRoot);
```

**Inter** is a document-level font (fonts pierce shadow). Inject once on
`document.head` if missing:

```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

**Do not** add `https://cdn.tailwindcss.com`. The CDN runtime never
scans Shadow DOM, so utility classes in `widget.html` / `panel.js` would
be missing. DaisyUI `full.min.css` already includes the utilities this
inspector uses.

jsnview stays a lazy CDN load (`jsnview-loader.js`) for the Raw tab.
Hosts that CSP-block `cdn.jsdelivr.net` already lose jsnview; they would
also lose DaisyUI fills. Overlay chrome in `widget.css` must still
position the panel if the DaisyUI link fails.

Do not add icon-font libraries (Font Awesome). Help pages in other repos
that already use FA are not a reason to use `<i class="fa-…">` here.

---

## 4. Theming

Use DaisyUI's built-in themes. Pick one light + one dark and set them
on **`.zeus-trace-root`**, not `<html>` (the host page owns `<html>`).
This widget defaults to **light**:

```html
<div class="zeus-trace-root bg-base-100 text-base-content" data-theme="light" data-mount="overlay">
```

DaisyUI 4.12 `--b1`, `--b2`, `--b3`, `--bc`, `--p`, `--pc`, `--su`,
`--wa`, `--er`, `--in` are **OKLCH component triples**, not HSL.

| Need | Class (preferred) | Custom CSS (only if you must) |
|---|---|---|
| Page / panel surface | `bg-base-100` | `background: oklch(var(--b1));` |
| Raised surface | `bg-base-200` | `background: oklch(var(--b2));` |
| Border | `border-base-300` | `border: 1px solid oklch(var(--b3));` |
| Text | `text-base-content` | `color: oklch(var(--bc));` |
| Primary action | `btn-primary` | `background: oklch(var(--p)); color: oklch(var(--pc));` |
| Status | `badge-success`, `badge-warning`, `badge-error`, `badge-info` | `oklch(var(--su\|wa\|er\|in))` |

```css
/* BAD — IACVT-invalid on DaisyUI 4.12; header/divider vanish */
background: hsl(var(--b1));
border-color: hsl(var(--b3));

/* GOOD */
background: oklch(var(--b1));
border: 1px solid oklch(var(--b3));
```

Do not hardcode `#0b0f14`, `#243041`, `#5b8cff`, `#ffffff`, or
`42.3889px` on inspector or overlay chrome. Light theme must restyle
the whole widget, not leave a dark island inside a light host (or a
dark hex island inside DaisyUI light).

`--tt-*` aliases, when kept for leftover inspector CSS, **must** map to
the same OKLCH tokens:

```css
.tt-panel {
  --tt-bg: oklch(var(--b1));
  --tt-elev: oklch(var(--b2));
  --tt-elev-2: oklch(var(--b3));
  --tt-border: oklch(var(--b3));
  --tt-fg: oklch(var(--bc));
  --tt-muted: oklch(var(--bc) / 0.7);
  --tt-dim: oklch(var(--bc) / 0.5);
}
```

Custom palettes stay limited to ~6 brand colors plus DaisyUI semantic
tokens (`primary`, `secondary`, `accent`, `base-100`, `info`,
`success`, `warning`, `error`).

**Exception (charts only):** Hub Detective Timeline bars keep the Hub
ai/tool/other palette (`#f97316` / `#10b981` / `#6366f1`, track
`#dbeafe`) on `.trace-waterfall`. That is graph ink, not chrome.

**Exception (brand mark only):** the lightning toggle artwork may keep
its own fills. Focus ring on the toggle uses `oklch(var(--p))`, not
`#5b8cff`.

---

## 5. Iconography

- All icons are inline SVG (Heroicons outline, 24×24 viewBox,
  `stroke-width="1.5"`), except the lightning toggle brand mark.
- Wrap icons in a `<span class="inline-block w-4 h-4">` for sizing
  (header actions often use `w-3.5 h-3.5`).
- Never use Unicode emoji or dingbats anywhere in Trace chrome
  (including “copied” / “exported” toast text).
- Standalone icons need `aria-label`; decorative icons inside a labelled
  control get `aria-hidden="true"`. Overlay close is `aria-label="Close"`.

---

## Trace inspector tabs

`#tt-panel` uses one DaisyUI `tabs tabs-boxed` strip (no nested Detective
nav, no inner Detective tab). Order:

1. **Overview** — Envelope (`<dl class="det-env">`)
2. **Diagnosis** — grade chips, first-question cards, playbooks
3. **Prompt** — checklist tiles (`.pcl .tiles`); job units also show goal/inject
4. **Timeline** — Hub Detective **Spans waterfall** (3-column grid `max-content 1fr max-content`, `<i class="tw-bar">` bars, Hub ai/tool/other palette, speed KPI strip). Host is `.tt-waterfall-host` only. No DaisyUI `card-body` around the graph (that collapses `1fr`). No `min-width: 0` on `.trace-waterfall`. No Story spine, Hub Step flow, or mermaid.
5. **Tools** — cost/result KPI tiles, AI request (LLM req‖res), tool-call table + req‖res
6. **Session** — ids and related hops
7. **Raw** — JSON dump

Default tab is Overview. Unhealthy turns auto-open **Diagnosis** (not
the old Detective tab). Hub **Detective** remains a header deep-link
(`#tt-detective`), not an inner tab.

Envelope is facts only. Cost / result KPIs live on **Tools**. Token IN is
omitted when usage is missing (never painted as `0`). Prompt `skip` /
`n/a` is not fail.

Removed v1 tabs (do not resurrect): `data-tab="hops"`, `data-tab="llm"`,
`data-tab="inject"`, `data-tab="detective"`. Hops + LLM I/O fold into
**Tools**. Inject / goal folds into **Prompt** (job units). Detective
briefing folds into **Diagnosis** + **Overview**.

---

## 6. Component Patterns

| Need | DaisyUI class |
|---|---|
| Overlay / docked panel | `card bg-base-100 border border-base-300 shadow-sm` (overlay floating card keeps radius + border). Docked: flush in the slot, **no** extra outer radius |
| Inner card / tile / KPI / IO pane | Always `border border-base-300`. Status tint: `border-error/40`, `border-warning/40`, `border-success/40` |
| Primary action | `btn btn-xs btn-primary` (dense inspector) |
| Ghost / tertiary / copy chip | `btn btn-xs btn-ghost` (transparent — do not use this when a fill is required) |
| Destructive | `btn btn-error` |
| Badge / count | `badge badge-sm` + semantic modifier (`badge-ghost` on idle counts) |
| Modal | `<dialog class="modal">` + `modal-box` / `modal-action` / `modal-backdrop` (if Prompt inspect is added) |
| Tab strip | `tabs tabs-boxed` + `tab` / `tab-active` (nowrap + `overflow-x: auto` in the overlay) |
| Inspector header | Compact `.tt-header` row, `bg-base-100`. **Do not** use DaisyUI `navbar` / `navbar-start` / `navbar-end` inside `#tt-panel` — those sections are `width: 50%` and wrap into a messy stack in a ~720px overlay. |
| Session row | Truncated copyable chips (`.tt-session`, `.tt-id`). Never DaisyUI `.breadcrumbs` (`overflow-x: auto` + nowrap overflows UUIDs). |
| Envelope / Session tab IDs | Full UUID as **text** plus a `btn-square` clipboard icon (`.tt-copy-id`). Do **not** wrap `req_id` / `session_id` / `chat_id` / `turn_id` in a `btn`. |
| Text input | `input input-sm input-bordered` (wrap with `<label>`). There is **no** `#tt-search` — the left-pane filter rail is gone. |
| Dropdown panel | `dropdown-content … bg-base-100 rounded-xl border border-base-300 shadow-xl` (turn picker: `#tt-turn-dropdown`). Stacking is **not** HTML `z-20` / `z-[50]` — those utilities are absent from DaisyUI `full.min.css`. Use `widget.css`: `.tt-turn-picker { z-index: 20 }` and `.dropdown-content { z-index: 50 }` above `.tt-tabs { z-index: 0 }`. |
| Alert | `alert alert-{info,success,warning,error}` (`#tt-diagnosis`) |
| Table | `table table-zebra table-xs` |
| Loading | `loading loading-spinner` |
| Tooltip | `tooltip` |
| Req ‖ res split | `tt-split-io grid grid-cols-1 md:grid-cols-2 gap-2.5` + two `card bg-base-200 border border-base-300 io-card` |

Reach for raw Tailwind for spacing/flex/grid layouts. Only write custom
CSS in `widget.css` when neither DaisyUI nor Tailwind covers the case
(overlay geometry, docked fill, waterfall, `[hidden]`).

### Size-only button CSS (allowed)

```css
.tt-header .btn,
.tt-hdr-actions .btn {
  font-size: 11px;
  font-weight: 600;
  height: 24px;
  min-height: 24px;
  padding: 0 8px;
  /* DO NOT set background or color — DaisyUI fills must survive */
}
```

---

## 7. JavaScript

- Vanilla JS — no full SPA framework. Bundle with esbuild IIFE.
- Group Trace code in `createTracePanel` (`src/panel.js`) and helper
  exports (`src/helpers.js`). Queries are **root-scoped** (shadow), never
  `document.getElementById` for `#tt-*`.
- Network calls: optional background `/api/tool-order`; Hub Detective
  opens in a new tab. Do not `fetch` Hub HTML into the widget.
- Public embed API stays `appendTraceCard` / `openDebugPanel` /
  `ZeusTrace.ready`. Shadow internals are not a public API.

---

## 8. Accessibility

- All actionable elements MUST be `<button>` or `<a>` (not `<div
  role="button">`). Turn list rows and Prompt inspect tiles are
  `<button type="button">`.
- All form controls MUST have a `<label>` (visible or `sr-only`).
  The turn picker `#tt-turn-summary` is labelled by `#tt-turn-picker-label`.
- Tabs expose `role="tab"` / `role="tablist"` and `aria-selected`.
  Active tab also has DaisyUI `tab-active` (and may keep `.on` during
  the port).
- Overlay panel: `role="dialog"`, `aria-labelledby="debug-panel-title"`,
  `aria-expanded` on the toggle.
- Color contrast: at least 4.5:1 for text. Prefer `text-base-content`
  and `/70` opacity over one-off grey hex.

---

## 9. Lessons learned — do not skip

These are bugs that already shipped while restyling Chat ‖ Traces onto
DaisyUI in `zeus_client`, plus Shadow DOM traps unique to this widget.
Replicating the inspector **without** this section reproduces them:
missing borders, missing button fills, collapsed waterfall, dark hex
island, DaisyUI tokens wiped by `all: initial`, Tailwind CDN no-ops in
shadow.

### 9.1 Symptom → cause → fix

| What you see | Why | Required fix |
|---|---|---|
| Header / panel **transparent**; divider **invisible** | `hsl(var(--b1))` / `hsl(var(--b3))` on DaisyUI 4.12 OKLCH vars (IACVT-invalid) | `background: oklch(var(--b1));` `border: 1px solid oklch(var(--b3));` (or Tailwind `bg-base-100` / `border-base-300`). Never wrap `--b*` / `--p` / `--pc` in `hsl()`. |
| Cards / tiles / dropdowns look **borderless** | DaisyUI `card`, `dropdown-content`, and `stat` have **no** border | Add `border border-base-300` on every raised surface. Inner inspector cards: `card bg-base-100 shadow-sm border border-base-300`. |
| Detective / primary actions look **grey / empty** | Custom `.btn { background; color }` flattened DaisyUI fills, **or** `btn-ghost` / leftover `.tt-btn` used where a fill is required | Markup: `btn btn-xs btn-primary` (Detective). CSS may size `.btn` but must **not** set `background` or `color`. Delete `.tt-btn` rules that paint fills. |
| Overlay / inspector still a **dark island** | Locked hex chrome (`#0b0f14`, `#243041`, `#5b8cff`, `#e8eef6`) on `.debug-panel` / `.tt-panel` | Semantic tokens only. `data-theme="light"` on `.zeus-trace-root` restyles the panel. Lightning artwork is the only hex exception. |
| DaisyUI classes **do nothing** | Tailwind CDN on the host; or DaisyUI CSS in `document` while markup is in shadow | Inject DaisyUI `full.min.css` **into the shadow**. Do not use `cdn.tailwindcss.com`. |
| DaisyUI theme tokens **empty** after mount | `all: initial` on `.zeus-trace-root` resets custom properties | `all: initial` on `:host` only. Theme + `bg-base-100` on `.zeus-trace-root`. Then `display: block`. |
| Waterfall **bars vanish** / track is a sliver | Wrapped in DaisyUI `card-body` (flex column collapses `1fr`) **or** `min-width: 0` on `.trace-waterfall` **or** bars missing `tw-bar` | Host: `<div class="tt-waterfall-host">` + `<div class="trace-waterfall">`. Grid: `grid-template-columns: max-content 1fr max-content`. Do **not** put `card-body` around it. Bars: `<i class="tw-bar ai\|tool\|other">`. |
| Tab labels wrap into two rows in the overlay | Default `tabs` wrap | `.tt-panel .tt-tabs { flex-wrap: nowrap !important; overflow-x: auto; }` and `.tab { flex: 0 0 auto; white-space: nowrap; }` |
| Turn dropdown **hides under** Overview…Raw tabs | DaisyUI `.tab` is `position: relative` and comes after the picker. HTML `z-20` / `z-[50]` are Tailwind utilities **not** in shadow `full.min.css` (no JIT), so `.dropdown-content` stays `z-index: auto` and the tab strip paints on top | In `widget.css`: `.tt-turn-picker { position: relative; z-index: 20 }`, `.tt-turn-picker .dropdown-content { z-index: 50 }`, `.tt-panel .tt-tabs { z-index: 0 }`. Do not rely on markup `z-*` classes. |
| Active turn row **hidden** under a host overlay | `button.tt-turn-item.active` is `position: static`, so `z-index` is ignored. Overlay host is `position: fixed; z-index: 99999` | In `widget.css`: `button.tt-turn-item.active { position: relative; z-index: 100000 }`. `z-index` only applies to positioned boxes. |
| Title **flush** to the card edge; header `padding-left: 0` | HTML `px-3 py-2` / `ml-2` are Tailwind spacing utilities **not** in shadow `full.min.css` (same trap as `z-20`) | In `widget.css`: `.tt-header { padding: 8px 12px }` and `.tt-title { margin-left: 8px }`. Do not rely on markup `px-*` / `ml-*` for inspector chrome. |
| Session UUIDs **overflow** the pane | DaisyUI `.breadcrumbs` is nowrap + `overflow-x: auto` | `.tt-session` + truncated `.tt-id` copy chips (`max-width` + ellipsis). |
| Empty / idle chrome still **visible**; tools show before a turn | Tailwind `flex`/`grid`/`block` beats the `hidden` attribute | `[hidden] { display: none !important; }` for `.tt-body`, `.tt-session`, `.tt-hdr-actions`, `#tt-turn-count`, `#tt-empty`, `.tt-tab[hidden]`, … Idle traces = title (+ overlay close). JS: `countEl.hidden = !hasRequest`. |
| Headers **clipped** or fractional-px | Locked `height: 42.3889px` / `#ffffff` from a screenshot | `min-height` only. No fractional-px heights. No hex white. |
| Buttons look like **text**, not controls | `btn-ghost` everywhere, or no `btn` class, or leftover `.tt-btn.ghost` | Ghost = tertiary (Export, Copy, copy-id, close). Filled = semantic modifier. |
| Alignment: title baseline vs `btn-xs` | Mixing `navbar`, `h2` default margin, missing `box-border` | `h2.tt-title`: `margin: 0; font-size: 14px; font-weight: 700; line-height: 1.2`. Header `box-sizing: border-box`. |
| Unstyled inspector (all `.tt-*` missing) | Unclosed `{` in `widget.css` nested later rules under an earlier selector | Keep the brace-balance test in `src/widget.css.test.js`. |
| Host page **restyled** / fonts / buttons changed | DaisyUI/Tailwind injected on `document` | Shadow-only DaisyUI. Inter `<link>` on `document.head` is allowed (font only). |
| Overview `req_id` / `session_id` / `chat_id` / `turn_id` look like **buttons** and wrap | DaisyUI `btn` wrapping the UUID (`max-width: 11rem`, inherited `word-break`) | `copyValueRow`: mono `.tt-copy-id-val` + `btn-xs btn-square` clipboard icon. `.tt-copy-id { white-space: nowrap }`. Session **row** still uses truncated `.tt-id` chips. |
| Diagnosis / Prompt / Tools **cards look broken** (no border, stacked, huge KPI numbers, Copy not aligned) | DaisyUI **4.12 `full.min.css` is components only** — no Tailwind utilities (`.flex`, `.p-4`, `.border` width, `.grid-cols-2`, `.text-xl`, `.ml-auto`). `.stat-value` is **2.25rem**; `.btn-square` is **3rem**; `.border-base-300` sets **color** not width; leftover `.det-diag-card { padding; background }` fought DaisyUI `card-body` | Keep DaisyUI class strings for the sample-app port. **Implement layout in `widget.css`**: 1px border on `.card.border`; `.diag-grid` / `.pcl .tiles` / `.env-kpi` / `.tt-split-io` grids; `io-card > header` and `.raw-head` flex + `ml-auto`; compact `.kpi-val` 15px; size `.tt-copy-id .btn` to 1.25rem. Do **not** add `cdn.tailwindcss.com`. Diagnosis findings are nested `card bg-base-200` (no `list-disc`); do **not** reintroduce `.tt-panel .det-diag-card {`. |
| Raw **Copy JSON** not on the title row | `flex items-center ml-auto` is a no-op in shadow | `.raw-head { display: flex; align-items: center; }` and `#tt-raw-copy { margin-left: auto }` |

### 9.2 DaisyUI components that fight a ~720px overlay

Do **not** use these inside `#tt-panel` or `.tt-header`:

| Component | What it does in a ~720px overlay |
|---|---|
| `navbar` / `navbar-start` / `navbar-end` | Each start/end is `width: 50%` → title and actions wrap into a stack |
| `breadcrumbs` | Nowrap row of UUIDs overflows |
| `card-body` around a `1fr` grid | Flex column + min-width:0 **collapses** the waterfall track |
| `menu` as the turn list | Extra padding / hover chrome; turn rows are `<button class="tt-turn-item">` |

Sketch 008 may use a page `navbar` because it is a **full-page** mock, not
this overlay.

### 9.3 Header recipe (overlay inspector)

One compact row. Overlay adds close on the right of actions.

```css
.tt-header {
  min-height: 2.75rem;
  box-sizing: border-box;
  padding: 8px 12px;          /* match Tailwind px-3 py-2; those classes are no-ops in shadow */
  background: oklch(var(--b1));
  border-bottom: 1px solid oklch(var(--b3));
}
.tt-title { margin: 0; margin-left: 8px; font-size: 14px; font-weight: 700; line-height: 1.2; }
.tt-header-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.tt-hdr-actions { margin-left: auto; flex-shrink: 0; display: flex; gap: 4px; }
```

Markup (classes must stay in sync with `zeus_client` interior):

```html
<header class="tt-header shrink-0 px-3 py-2 bg-base-100 border-b border-base-300 box-border">
  <div class="tt-header-row">
    <h2 id="debug-panel-title" class="tt-title text-sm font-semibold m-0 shrink-0">Turn traces</h2>
    <span class="badge badge-ghost badge-sm" id="tt-turn-count" hidden>0 turns</span>
    <div class="tt-hdr-actions" hidden>
      <button type="button" class="btn btn-xs btn-ghost" id="tt-export">Export</button>
      <button type="button" class="btn btn-xs btn-ghost" id="tt-copy-all" data-action="copy-all">Copy all</button>
      <a class="btn btn-xs btn-primary gap-1" id="tt-detective">Detective …svg…</a>
    </div>
    <button type="button" class="btn btn-xs btn-ghost tt-close" id="debug-close" aria-label="Close">…svg…</button>
  </div>
</header>
```

Idle Traces = **title only** (`#tt-turn-count` and `.tt-hdr-actions` stay
`hidden` until `setEntries` / `appendTraceCard` has a turn or job).
`.tt-title` is always **Turn traces**. Job mode switches it to **Job
traces**. Never use the string “Zeus Tracer” in the header (the lightning
toggle is the brand mark). Overlay close is **not** inside
`.tt-hdr-actions` so it remains clickable while idle.

Widget version stays in `#debug-panel-footer`, never in `.tt-header`.
Do not restore `#tt-client-ver` on the header.

### 9.4 Overlay / docked chrome

```
:host                     all: initial; display: block
  .zeus-trace-root        data-theme=light; bg-base-100
    #debug-toggle         overlay only; position fixed bottom-left
    aside#debug-panel     overlay: fixed card, min(720px,94vw) × min(70vh,720px)
                          border 1px oklch(--b3), radius 12px
      #tt-panel           flex column; inner cards keep borders
        footer            package version; border-t oklch(--b3)
```

Docked (`data-mount="docked"`):

- Hide `#debug-toggle` and `#debug-close`
- `.debug-panel` `position: absolute; inset: 0; width/height 100%;`
  `border-radius: 0; box-shadow: none;`
- `.debug-panel.is-hidden` still **shows** (always open)

Host `#zeus-trace-host` for overlay uses `pointer-events: none` on the
host and `pointer-events: auto` on `.zeus-trace-root` so the page stays
clickable around the card.

There is **no** Chat column and **no** `.zeus-stage-001`. Do not copy
sample-app split `gap: 0` / `border-r` / view-routing CSS.

### 9.5 `[hidden]` vs Tailwind display

Tailwind `flex` / `grid` / `block` utilities win over the HTML `hidden`
attribute. Trace idle/empty/tab state **must** force:

```css
.tt-tab[hidden],
.tt-chip[hidden],
.tt-body[hidden],
.tt-session[hidden],
.tt-diagnosis[hidden],
.tt-detail-head[hidden],
#tt-empty[hidden],
#tt-turn-count[hidden],
.tt-hdr-actions[hidden],
.debug-panel.is-hidden {
  display: none !important;
}
```

Docked override (must come after the rule above):

```css
.zeus-trace-root[data-mount="docked"] .debug-panel.is-hidden {
  display: flex !important;
}
```

### 9.6 Waterfall (Timeline) — exact host

```html
<div class="tt-waterfall-host">
  <h2 class="text-base font-semibold m-0 mb-2">Spans waterfall</h2>
  <!-- .tab-kpi speed tiles (not inside card-body) -->
  <div class="trace-waterfall">
    <div class="tw-lab">ai.chat.round.1</div>
    <div class="tw-track"><i class="tw-bar ai" style="left:0%;width:62%"></i></div>
    <div class="tw-dur">1840 ms</div>
    <!-- … rows … -->
    <div class="tw-legend">…</div>
  </div>
</div>
```

```css
.trace-waterfall {
  display: grid;
  grid-template-columns: max-content 1fr max-content;
  gap: 2px 10px;
  align-items: center;
  width: 100%;
}
```

Bars are `<i class="tw-bar ai|tool|other">` with inline `left`/`width` %.
Palette: ai `#f97316`, tool `#10b981`, other `#6366f1`, track `#dbeafe`.

Current v1 helpers emit `<i class="ai">` without `tw-bar` — that must
change when porting.

No Story checkbox, no mermaid, no Hub Step flow on Timeline.

### 9.7 Inner cards, tiles, req‖res

Every JS-built card uses **all three**: surface + border + optional
status tint.

```html
<div class="card bg-base-100 shadow-sm border border-base-300 det-card">
  <div class="card-body p-4">…</div>
</div>

<div class="card bg-base-200 border border-base-300 io-card">
  <header class="flex items-center gap-1.5 px-2 py-1.5 border-b border-base-300 text-xs font-semibold">
    AI request
    <button type="button" class="btn btn-xs btn-ghost ml-auto">Copy</button>
  </header>
  <pre id="tt-llm-req"></pre>
</div>

<div class="card bg-base-100 border border-success/40 shadow-sm tile pass">…</div>
```

Diagnosis / prompt tiles pick `border-error/40` · `border-warning/40` ·
`border-success/40` · `border-base-300`. Missing the `border` class is
how tiles “lose” their outline even when a tint class is present
(`border-success/40` only sets **color**, not the width).

Req ‖ res:

```html
<div class="tt-split-io grid grid-cols-1 md:grid-cols-2 gap-2.5">
  <!-- two io-card columns -->
</div>
```

### 9.8 What not to copy from v1 widget or sample-app Chat

- **Do not** keep `.tt-btn` / `.tt-btn.primary` / `.tt-btn.ghost` inside
  `#tt-panel`. Trace buttons are DaisyUI `btn`.
- **Do not** keep `data-tab="detective"` / `hops` / `llm` / `inject`.
- **Do not** keep Timeline Story (`#tt-story`).
- **Do not** port `.chat-panel`, `.zeus-stage-001`, Catalog view-routing,
  or Chat header Catalog/Verify/Publish/Run Test buttons.
- **Do not** put client/widget version in `.tt-header`.
- **Do not** use preferred-hop `★` or “Hub session ↗” dingbats.

---

## 10. Anatomy to replicate

Copy this tree. Rename IDs only if you update `panel.js` in lockstep.

```
:host (#zeus-trace-host shadow)
├── link daisyui@4.12.10/full.min.css
├── style widget.css
└── .zeus-trace-root[data-theme=light][data-mount=overlay|docked]
    ├── #debug-toggle                 overlay only (brand SVG)
    └── aside#debug-panel.card.bg-base-100.border.border-base-300
        └── #tt-panel.tt-panel-inner
            ├── .tt-header            Turn traces · (hidden until request: count, Export, Copy all, Detective)
            │                         overlay: #debug-close always available
            ├── #tt-session           copy chips (not breadcrumbs)
            ├── #tt-body              hidden until a turn exists (single column)
            │   └── .tt-detail
            │       ├── #tt-detail-head
            │       ├── #tt-diagnosis.alert
            │       ├── .tt-turn-picker     details#tt-turn-dropdown above tabs · button.tt-turn-item
            │       ├── .tabs.tabs-boxed.tt-tabs
            │       │     Overview · Diagnosis · Prompt · Timeline · Tools · Session · Raw
            │       └── .tt-tab-panels
            ├── #tt-empty             “No turn run yet.”
            ├── footer                widget version
            └── #toast
```

Tab **content** (JS):

| Tab | Must include |
|---|---|
| Overview | Envelope `<dl class="det-env">`; ID keys use `copyValueRow` (text + icon); no cost KPIs here |
| Diagnosis | Headline card, grade chips, nested `card bg-base-200` findings (`diagNestedCardHTML`), playbooks |
| Prompt | `.pcl` verdict + `.tiles` as bordered cards; skip ≠ fail; job: goal/inject |
| Timeline | `.tt-waterfall-host` + `.tab-kpi` + `.trace-waterfall` |
| Tools | `.env-kpi` cost/result tiles (compact `.kpi-val`, not DaisyUI 2.25rem `.stat-value`), AI request req‖res, hops table + req‖res |
| Session | `det-env` kv with `copyValueRow`; hop pills |
| Raw | bordered `io-card` + `.raw-head` (title + right-aligned Copy JSON) |

Port renderers from `zeus_client/static/trace_panel.js`:
`renderDetOverview`, `renderDetDiagnosis`, `renderDetPrompt`,
`renderDetSession`, `renderTools`. Port helpers:
`detectiveEnvelopeRows`, `detectiveDiagnosisModel`,
`detectiveCostResultKpis`, `timelineSpeedKpiHTML`, `detectiveInnerTabs`.

---

## 11. Agent verification checklist

Do not claim a port is done until **all** of these are true. Check
**light** (`data-theme="light"`) in both **overlay** (`npm start` →
`http://localhost:5199/?mount=overlay`) and **docked** playground
(`http://localhost:5199/`), plus `examples/embed.html`.

Chrome

- [ ] DaisyUI **4.12.10** `full.min.css` injected **into the shadow**; Inter on `document.head`; no Tailwind CDN
- [ ] `.zeus-trace-root[data-theme="light"]` restyles the inspector
- [ ] `all: initial` is on `:host` only (not `.zeus-trace-root`)
- [ ] No `hsl(var(--b1))` / `hsl(var(--p))` on inspector **surfaces or borders**
- [ ] No `#0b0f14`, `#ffffff`, `#5b8cff`, `42.3889px` in chrome CSS (lightning artwork excepted)
- [ ] Overlay: one `border-base-300` on the floating card; docked: flush, no radius
- [ ] Idle header is title (+ overlay close); titles `14px/700`; `box-border`
- [ ] Detective keeps **primary** fill (not grey); Export/Copy are ghost
- [ ] Dropdowns are `bg-base-100 border border-base-300`

Traces

- [ ] No `navbar-start` / `navbar-end` / `.breadcrumbs` inside `#tt-panel`
- [ ] No `.tt-btn` inside `#tt-panel`
- [ ] Inner cards/tiles/IO panes include `border border-base-300` (status tiles also set a `border-*` color)
- [ ] Tabs: one `tabs-boxed` strip, nowrap + horizontal scroll, order Overview → … → Raw
- [ ] No `data-tab="hops"|"llm"|"inject"|"detective"`
- [ ] Timeline waterfall is **not** inside `card-body`; grid is `max-content 1fr max-content`; bars use `tw-bar`
- [ ] No Story spine / mermaid / Step flow
- [ ] `[hidden]` still hides (inspect idle overlay: no Export/Copy/Detective, no turn picker; close still there)
- [ ] No left-pane `nav.tt-turn-list` / `#tt-search`; turns are `#tt-turn-dropdown` above `.tt-tabs`
- [ ] Open turn menu paints **above** `.tt-tabs` (`widget.css` picker `z-index: 20`, menu `50`, tabs `0` — not HTML `z-[50]`)
- [ ] Active turn row is `position: relative; z-index: 100000` (above overlay host `99999`)
- [ ] `.tt-header` has `padding: 8px 12px` and `.tt-title` has `margin-left: 8px` (HTML `px-3` / `ml-2` are no-ops)
- [ ] Unhealthy turns auto-open **Diagnosis**
- [ ] Detective is a header `btn-primary` deep-link, not an inner tab
- [ ] Dingbats `★ ↗ ✓ ✗ ⚠ 📁` absent from `src/panel.js` and `src/helpers.js`
- [ ] Overview/Session envelope IDs are `.tt-copy-id` text + icon (no `button.tt-id` in `.det-env`)
- [ ] Diagnosis findings are nested `card bg-base-200` (no `list-disc`); no `.tt-panel .det-diag-card {` chrome
- [ ] Tools KPI values are compact (~15px), not DaisyUI `.stat-value` 2.25rem; IO Copy sits on the header row
- [ ] Raw **Copy JSON** is on the same row as **Raw bundle**, right-aligned (`.raw-head`)
- [ ] `node --check src/panel.js src/helpers.js src/bootstrap.js src/trace.js`
- [ ] `npx vitest run src/widget.css.test.js src/style_guide.test.js` (chrome contract) plus existing panel/trace tests

If a screenshot shows a **missing border**, first search for a `card` /
`dropdown-content` without `border-base-300`, then search for
`hsl(var(--b3))` on that rule.

If a screenshot shows a **missing button fill**, first check the markup
for a color modifier (`btn-primary` …), then grep CSS for `.btn {` or
`.tt-btn` rules that set `background` or `color`.

If a screenshot shows **crooked / uneven headers**, first remove
`navbar-*`, then enforce compact flex + nowrap.

If DaisyUI looks **unstyled in the playground**, inspect the shadow root
for the 4.12.10 `<link>` and confirm the host CSP allows jsdelivr.

---

## See Also

- This guide is the style spec for the widget.
- Current overlay mock (v1 IA, **superseded** by this guide): `sketches/v1-overlay-inspector/`
- Feature guides: [EMBEDDABLE_TRACE_WIDGET.md](EMBEDDABLE_TRACE_WIDGET.md), [V1_INSPECTOR.md](V1_INSPECTOR.md)
- Plan: `.grok/plans/TURN_DROPDOWN.md` (chrome); `.grok/plans/TURN_DROPDOWN_ZINDEX.md` (menu stacking); `.grok/plans/WIDGET_STACKING_SPACING.md` (active row + title inset); `.grok/plans/WIDGET_STYLE_HTML_CSS.md`
