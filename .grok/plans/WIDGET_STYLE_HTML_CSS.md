# Plan: Widget UI follows STYLE_HTML_CSS

**Date**: 2026-09-02
**Task**: Restyle the embeddable Zeus Tracer so inspector chrome matches DaisyUI 4.12 / light Detective IA in `.grok/guides/STYLE_HTML_CSS.md`.
**Priority**: High
**Estimated Effort**: 8–12 hours / 8 steps

## 1. Context & Requirements

- **Goal**: Overlay and docked inspector look and behave like the `zeus_client` Turn traces panel after its DaisyUI restyle: light `data-theme`, semantic OKLCH tokens, DaisyUI `btn` / `tabs-boxed` / bordered `card`, tab order Overview → Diagnosis → Prompt → Timeline → Tools → Session → Raw. Inspector `.tt-title` is **Turn traces** (job mode: **Job traces**), never “Zeus Tracer”. Public embed API unchanged. Idle header is title-only (plus overlay close). Unhealthy turns auto-open Diagnosis. No dingbats, no `.tt-btn` inside `#tt-panel`, no Story spine.
- **Constraints**:
  - One IIFE bundle, open Shadow DOM, kill switch, early-call queue.
  - Tailwind CDN **cannot** see Shadow DOM — inject DaisyUI **4.12.10** `full.min.css` into the shadow.
  - `all: initial` stays on `:host` only so DaisyUI `[data-theme]` tokens survive.
  - Host CSS must not leak in; widget CSS must not leak out.
  - Queries for `#tt-*` stay root-scoped (`panel.js`).
  - jsnview Raw tab, click-to-copy, Detective `hubBaseUrl` deep-link, job/units rail all survive.
  - Chart ink exception: waterfall `#f97316` / `#10b981` / `#6366f1` / track `#dbeafe`.
- **Assumptions**:
  - Source of truth for **interior** is sibling `zeus_client` (`templates/index.html` `#tt-panel`, `static/trace_panel.js`, `static/trace_helpers.js`, sketches 007/008) plus this repo’s `.grok/guides/STYLE_HTML_CSS.md`.
  - Source of truth for **shell** is this widget: lightning toggle, overlay card, docked fill, version footer.
  - **Decided (2026-09-02):** `.tt-title` / `#debug-panel-title` is **Turn traces**; job mode sets **Job traces**. The string “Zeus Tracer” does not appear in the inspector title. Product identity stays on the lightning toggle (`aria-label`) and README.
  - v1 dark hex inspector (`sketches/v1-overlay-inspector/`, “No DaisyUI”) is superseded for chrome. Ingest / normalize stay.
- **Out of Scope**:
  - Chat, Catalog, Settings, split-pane / `.zeus-stage-001` (not in this repo).
  - Host-page theme toggle / `ZeusTraceConfig.theme` (default light only).
  - CDN publish / vendoring into `the sample host`.
  - Playwright visual-regression CI.
  - Purged/bundled DaisyUI CSS (first cut uses the pinned jsdelivr link; size follow-up if needed).
  - Changing `appendTraceCard` payload shape or Python projectors.

## 2. Analysis & Research

- Key files explored:
  - `.grok/guides/STYLE_HTML_CSS.md` (source spec)
  - `templates/index.html` (`#tt-panel` markup + tab IA)
  - `static/trace_panel.js` (`renderDetOverview` / Diagnosis / Prompt / Session / `renderTools`)
  - `static/trace_helpers.js` (`detectiveEnvelopeRows`, `detectiveDiagnosisModel`, `detectiveCostResultKpis`, `timelineSpeedKpiHTML`, `detectiveInnerTabs`)
  - `tests/test_trace_style_guide.py` (chrome contract to port as vitest)
  - `src/widget.html`, `src/widget.css`, `src/bootstrap.js`, `src/panel.js`, `src/helpers.js`
  - `src/widget.css.test.js`, `src/trace.test.js`, `src/panel.copy.test.js`
  - `.grok/guides/EMBEDDABLE_TRACE_WIDGET.md`, `.grok/guides/V1_INSPECTOR.md`
  - `sketches/v1-overlay-inspector/` (old IA; superseded)
- Potential risks/edge cases:
  - **Shadow + DaisyUI** → Tailwind CDN no-ops; `:root` theme vars do not apply inside shadow; `all: initial` on `.zeus-trace-root` wipes `--b*` → Mitigation: inject `full.min.css` into shadow; `data-theme` on `.zeus-trace-root`; `all: initial` on `:host` only.
  - **Bundle / CSP** → DaisyUI link needs jsdelivr (same as jsnview). If blocked, overlay still positions via `widget.css` but components look unstyled → Mitigation: document CSP; keep overlay geometry in `widget.css`.
  - **Tab ID break** → Tests click `[data-tab="hops"|"llm"|"inject"|"detective"]` → Mitigation: rewrite tests to Tools / Diagnosis / Prompt; internals are not a public API.
  - **Job mode** → v1 defaults job tab to `hops`; inject lives on its own tab → Mitigation: default Overview; job inject/goal renders inside Prompt (`renderPromptTab`).
  - **Waterfall collapse** → wrapping graph in `card-body` or `min-width: 0`, or bars without `tw-bar` → Mitigation: `.tt-waterfall-host` + `tw-bar` classes; no Story.
  - **`[hidden]` vs Tailwind** → `flex`/`grid` shows idle chrome → Mitigation: keep `display: none !important` list; docked `is-hidden` override after it.
  - **Dingbats / toasts** → `★`, `↗`, `✓ copied` still in `panel.js` → Mitigation: Heroicons + plain “copied” / “exported” text; vitest forbids those code points.
  - **Unclosed CSS** → historically nested all `.tt-*` under `.vbar-col .n` → Mitigation: keep brace-balance test.
- Alternatives considered:
  - Keep dark `.tt-*` hex and only rename tabs — **rejected** (guide forbids hex chrome and `.tt-btn`).
  - Compile purged Tailwind at build time — **deferred** (matches spec less closely; good size follow-up).
  - Put DaisyUI on the host document — **rejected** (restyles hosts; misses shadow).

### Current vs target

| Area | Current (v1.1.1) | Target |
|---|---|---|
| Theme | `data-theme="dark"`, hex `#0b0f14` / `#243041` / `#5b8cff` | `data-theme="light"`, `oklch(var(--b*))` |
| CSS system | Hand-rolled `.tt-*`, no DaisyUI | DaisyUI 4.12.10 in shadow + `widget.css` extras |
| Buttons | `.tt-btn ghost` / `.tt-btn primary` | `btn btn-xs btn-ghost` / `btn-primary` |
| Tabs | Timeline, Hops, LLM I/O, Inject, Detective, Raw | Overview, Diagnosis, Prompt, Timeline, Tools, Session, Raw |
| Default / unhealthy | Timeline / auto Detective | Overview / auto Diagnosis |
| Detective | Inner tab **and** header `Detective ↗` | Header `btn-primary` + Heroicon only |
| Timeline | Optional Story spine; `<i class="ai">` | Waterfall + speed KPIs; `<i class="tw-bar ai">`; no Story |
| Title | “Zeus Tracer” | “Turn traces” / “Job traces” (lightning stays brand) |
| Header extras | `#tt-client-ver` always in header | Version in footer only; tools `hidden` until a turn |
| Search | Unlabelled `<input class="tt-search">` | `<label>` + `sr-only` + `input input-sm input-bordered` |

## 3. Step-by-Step Implementation Plan

1. **Style guide (this cut — done when the guide file is in-repo)**
   - Files to change: `.grok/guides/STYLE_HTML_CSS.md` (created), `.grok/plans/WIDGET_STYLE_HTML_CSS.md` (this file)
   - Changes: Port sample-app spec; replace Chat/split rules with Shadow DOM, overlay/docked, widget paths, vitest checks.
   - Commands to run: none
   - Tests needed: [ ]

2. **Shadow DaisyUI bootstrap**
   - Files to change: `src/bootstrap.js`, `src/widget.css`
   - Changes:
     - Inject pinned `https://cdn.jsdelivr.net/npm/daisyui@4.12.10/dist/full.min.css` as a `<link>` **inside** the shadow (before `widget.css`).
     - Inject Inter `<link>` on `document.head` once if absent.
     - Set `data-theme="light"` on `.zeus-trace-root`; add `bg-base-100 text-base-content`.
     - Move `all: initial` to `:host` only; keep `display: block` after it.
     - Do **not** add Tailwind CDN.
   - Commands to run: `npm start` and inspect shadow root for the DaisyUI link
   - Tests needed: [ ] vitest: shadow mount includes daisyui@4.12.10; root `data-theme="light"`

3. **Inspector markup (DaisyUI chrome + new tab IA)**
   - Files to change: `src/widget.html`
   - Changes: Match sample-app `#tt-panel` interior (header row, labelled search, `tabs tabs-boxed`, seven tab panels). Keep overlay toggle / close / footer. Hide `#tt-turn-count` and `.tt-hdr-actions` until a request. Detective button: `btn btn-xs btn-primary` + Heroicon, no `↗`. Close stays **outside** `.tt-hdr-actions`. Remove `#tt-client-ver`. Title text: `Turn traces`.
   - Commands to run: none
   - Tests needed: [ ] chrome contract asserts tab order and class strings

4. **Custom CSS: tokens, overlay, waterfall, `[hidden]`**
   - Files to change: `src/widget.css`
   - Changes:
     - Map `--tt-*` to `oklch(var(--b*))` / `oklch(var(--bc))`. Delete hex chrome (`#0b0f14`, `#243041`, `#5b8cff`) except lightning artwork and waterfall graph ink.
     - Delete `.tt-btn` fill rules. Size-only `.btn` overrides allowed.
     - Port from `zeus_client/static/app.css`: `.tt-header`, `.tt-tabs` nowrap, `.det-env`, `.pcl` tiles, `.io-card`, `.tt-waterfall-host`, `[hidden]` list. Convert any remaining `hsl(var(--b*))` to `oklch`.
     - Overlay/docked geometry stays here (fixed card, docked inset, toggle, footer, toast).
     - Waterfall track `#dbeafe`; bars `.tw-bar.ai|.tool|.other`.
   - Commands to run: `npx vitest run src/widget.css.test.js`
   - Tests needed: [ ] no hex chrome in inspector rules; `[hidden]` still wins; brace-balance

5. **Port Detective IA renderers**
   - Files to change: `src/panel.js`, `src/helpers.js`
   - Changes:
     - Default `tab = "overview"`; job mode does not force `hops`.
     - Auto-open `diagnosis` when `needsDiagnosis` (replace `tab = "detective"`).
     - Port helpers: `detectiveEnvelopeRows`, `detectiveDiagnosisModel`, `detectiveLayerA`, `detectiveCostResultKpis`, `timelineSpeedKpiHTML`, `detectiveInnerTabs`, `detectiveNeedsAttention` from `zeus_client/static/trace_helpers.js`.
     - Port panel renderers: `renderDetOverview`, `renderDetDiagnosis`, `renderDetPrompt`, `renderDetSession`, `renderTools`; `renderDetailTabs` calls them. Fold current `renderHops` / `renderLlm` into Tools hosts (`#tt-tools-hops`, `#tt-tools-llm`). Job inject/goal into Prompt.
     - Timeline: wrap `waterfallHTML` in `.tt-waterfall-host` + speed KPIs; **remove** Story toggle / `storyHTML` / `hydrateStory`.
     - Waterfall markup: `<i class="tw-bar ai|tool|other">`.
     - Replace every `.tt-btn` with DaisyUI `btn btn-xs …`. IO panes: `card bg-base-200 border border-base-300 io-card`.
     - Hops table: `table table-zebra table-xs`; preferred hop without `★`; Hub links without `↗`.
     - Header JS: `countEl.hidden = !hasRequest`; `actions.hidden = !hasRequest`; drop `#tt-client-ver` updates; job title `Job traces`.
     - `setTab`: toggle `tab-active` + `aria-selected` (keep `.on` if tests still use it).
     - Toasts: “copied …” / “exported” without `✓`.
   - Commands to run: `node --check src/panel.js src/helpers.js src/bootstrap.js src/trace.js`
   - Tests needed: [ ] node --check; existing copy/hops tests retargeted

6. **Chrome contract tests**
   - Files to change: `src/style_guide.test.js` (new), `src/widget.css.test.js`, `src/trace.test.js`, `src/panel.copy.test.js`
   - Changes: Vitest equivalent of `zeus_client/tests/test_trace_style_guide.py` **minus** Chat/split/Catalog assertions:
     - DaisyUI pin + Inter injection + no Tailwind CDN
     - Tab order Overview…Raw; forbidden old `data-tab` values
     - No dingbats in `panel.js` / `helpers.js`
     - No `navbar-start` / `breadcrumbs` / `.tt-btn` in widget HTML / panel JS
     - CSS: `oklch(var(--b1))`, no `#0b0f14` / `#5b8cff` in `.tt-panel` chrome, no `.tt-btn` fill rules, `[hidden] { display: none !important }`
     - Idle header: `#tt-turn-count[hidden]`, `.tt-hdr-actions[hidden]`
     - Unhealthy fixture auto-selects Diagnosis (update `trace.test.js`)
     - Copy tests click Tools / Prompt / Raw instead of hops/llm/inject
   - Commands to run: `npm test`
   - Tests needed: [x] new style-guide file + updated panel/trace tests

7. **Playground / embed / sketch notes**
   - Files to change: `dev/index.html`, `examples/embed.html`, `sketches/v1-overlay-inspector/README.md`
   - Changes: Do not restyle host pages with DaisyUI (shadow owns it). Update any copy that lists old tab names. Mark v1 overlay sketch **superseded** (visual spec is 007/008 + this guide). Optional: copy 007/008 into `sketches/` in a later commit if offline spec is needed.
   - Commands to run: `npm start` → overlay + docked; `npm run build && npm run serve` → `examples/embed.html`
   - Tests needed: [ ] manual overlay/docked/light checklist in the guide §11

8. **Feature docs after the UI lands**
   - Files to change: `.grok/guides/EMBEDDABLE_TRACE_WIDGET.md`, `.grok/guides/V1_INSPECTOR.md`, `README.md`
   - Changes: Replace “No DaisyUI” / dark `.tt-*` / old tab list. Point at `.grok/guides/STYLE_HTML_CSS.md`. Record files touched. Do **not** claim this step done until steps 2–7 are verified.
   - Commands to run: none
   - Tests needed: [ ]

## 4. Verification & Rollback

- **Tests**:
  - `node --check src/panel.js src/helpers.js src/bootstrap.js src/trace.js`
  - `npm test`
  - Manual: `npm start` docked (`http://localhost:5199/`) and overlay (`?mount=overlay`); `examples/embed.html` fixtures (legacy, v2.3.0, fail, cache, job)
  - Guide §11 checklist (light, idle chrome, Diagnosis auto-open, waterfall bars, Detective fill, copy)
- **Review Checklist**:
  - [x] Code style/linting passes (`npm test`, `node --check`)
  - [x] No breaking changes to `appendTraceCard` / `openDebugPanel` / `ZeusTrace.ready` / `hubBaseUrl`
  - [x] Feature guide created or updated in `.grok/guides/STYLE_HTML_CSS.md` (spec) and EMBEDDABLE / V1 / README after implementation
- **Rollback Plan**: `git checkout -- src/widget.html src/widget.css src/bootstrap.js src/panel.js src/helpers.js src/trace.test.js src/panel.copy.test.js src/widget.css.test.js`; delete `src/style_guide.test.js` if added. Public API callers need no rollback.

## 5. Open Questions / Decisions Needed

- **Inspector title (decided):** **Turn traces** / **Job traces**. Not “Zeus Tracer”.
- **DaisyUI delivery**: First cut is a pinned jsdelivr `<link>` in the shadow (matches the sample-app pin, same CSP as jsnview). Revisit a purged build-time CSS if bundle/offline size becomes a problem.
- **Theme config**: No `ZeusTraceConfig.theme` in this cut (always light). Add later if hosts need a dark overlay.
- **Version bump / CDN**: Visual/DOM internals change; public JS API does not. Treat as **1.2.0** when this ships, not part of the style work itself.
