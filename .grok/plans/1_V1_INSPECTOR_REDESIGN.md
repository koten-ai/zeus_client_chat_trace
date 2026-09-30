# Plan: Zeus Tracer v1.0.0 (Inspector Redesign + Python 2.3.0)

**Date**: 2026-08-21
**Task**: Redesign `zeus_client_chat_trace` from stacked-card v0.1.13 to inspector v1.0.0, matching the shipped `zeus_client` Turn traces panel and ingesting `kotenai-zeus-client` 2.3.0 debug data.
**Priority**: High
**Estimated Effort**: 4–6 days / 8 gated steps (mockup is a hard stop before production JS)

## 1. Context & Requirements

- **Goal**: Ship `zeus_client_chat_trace@1.0.0` as the embeddable Zeus tracer. Interior UI matches the sample-app inspector already live in `zeus_client` (sketches hybrid 001 chrome + 003 diagnosis strip + 002 Story on Timeline + 004 units rail). Payload handling matches `the Python client` 2.3.0 `TurnResult.debug` / `public_trace` / detective. A **static HTML mockup** of the overlay widget is reviewed and locked **before any production JS/CSS rewrite**.
- **Constraints**:
  - Keep the embed contract: one IIFE bundle, Shadow DOM, kill switch (`?debug=true` / `enabled`), early-call queue, `appendTraceCard` / `openDebugPanel` / `ZeusTrace.ready`.
  - Widget remains a **passive observer** — hosts call Zeus; widget only renders.
  - No DaisyUI CDN in v1.0 (sample-app inspector is self-contained `.tt-*` tokens). Bundle stays vanilla JS + esbuild.
  - G2 fields (`wish_i_knew`, `jail_break_attempt`, `hooks_jailbreak_score`) stay quarantined — never primary chrome.
  - `business_rules_triggers` is object `{id: bool}` only (V2.2 breaking change); arrays fail closed / omitted.
  - XSS: all user/trace strings escaped; JSON via `textContent` / jsnview, never `innerHTML` of raw payloads.
- **Assumptions**:
  - Visual source of truth is the **shipped** inspector in `zeus_client/templates/index.html` + `static/app.css` (`.tt-*`) + `static/trace_panel.js` + `static/trace_helpers.js`, not the 0.1.x light stacked cards.
  - Sketches under `zeus_client/sketches/` remain living reference; this repo gets its **own** overlay mockup (floating chrome + inspector interior).
  - Hosts today pass `{ question, answer, session_id, trace }`. V2 BFFs (sample app `python3/turn_mapper.trace_payload`) already merge `debug.public_trace` + `detective` + `hops` + gather fields into `trace`.
  - Python 2.3.0 `build_public_trace` does **not** emit `spans` / `ai_requests` / `ai_responses`. The widget must synthesize those from `steps` + `hops` the same way `zeus_client` helpers do.
- **Out of Scope**:
  - Changes to `the Python client` projectors or Detective builders.
  - Replacing the sample app’s in-tree `trace_panel.js` in this cut (follow-up: vendor v1.0 docked mode).
  - Playwright / visual-regression CI.
  - Claiming MATRIX `semantic_cache=supported` or `multi_agent=demo`.
  - Building a full journal event explorer (Story spine is enough).

### Success criteria (v1.0.0)

1. Mockup HTML is committed and signed off before production rewrite.
2. Overlay widget looks and behaves like the sample-app inspector (header, session bar, turn list, tabs, diagnosis strip).
3. `appendTraceCard` still works for legacy fixtures **and** a 2.3.0-shaped `trace_payload`.
4. Kill switch, Detective session link, Copy all / Export, tool-order chart, jsnview Raw tab all survive.
5. `package.json` version is `1.0.0`; README + feature guide describe the inspector, not stacked cards.
6. `npm test` covers normalizer + chrome; `examples/embed.html` demos a v2.3.0 fixture.

## 2. Analysis & Research

### Key files explored

| Path | Role |
|------|------|
| `src/widget.html`, `src/widget.css`, `src/trace.js` | Current stacked-card overlay (v0.1.13) |
| `src/bootstrap.js`, `src/config.js` | Shadow DOM mount, kill switch, Detective URL |
| `static/trace_panel.js` (~1814 lines) | Shipped inspector: list + tabs + diagnosis + job rail |
| `static/trace_helpers.js` (~1146 lines) | Metrics, waterfall, hops, jsnview, gather extract |
| `templates/index.html` (~L309–356) | Inspector DOM: `#tt-panel` header / session / body / tabs |
| `static/app.css` (`.tt-*` from ~L628) | Dark inspector tokens + layout |
| `sketches/README.md` | Locked hybrid: 001 + 003 strip + 002 Story |
| `python3/turn_mapper.py` | `trace_payload(TurnResult)` — the wire format hosts should send |
| `src/zeus_client/domain/messages.py` | `TurnResult` / `DebugBundle` |
| `src/zeus_client/application/projectors/public_trace.py` | Widget-facing `public_trace` keys |
| `CHANGELOG.md` | 2.3.0 semantic cache; 2.2.0 stamps / tokens / object triggers |

### Gap: current widget vs sample-app inspector

```
CURRENT (0.1.13 overlay)                 TARGET (1.0.0 overlay)
───────────────────────────────────      ──────────────────────────────────
Light DaisyUI stacked cards              Dark .tt-panel island (sketch tokens)
Header: Zeus Tracer · Detective          Header: Turn traces · N turns · client v
Token tiles + AI/Zeus/Other bar          Session bar: sid · round · contract · pref req
Per-turn card: KPI grid, Layer A         Body grid: turn list | detail
  pills, waterfall, freq chart,            Detail: Q + metrics + turn_id
  Hash Traces, JSON <details>              [003 diagnosis strip if warn/fail]
                                           Tabs: Timeline | Hops | LLM I/O |
                                                 Inject | Detective | Raw
No hops table / req‖res                  Hops + LLM I/O first-class split
No detective briefing surface            Detective tab + auto-open on fail
No click-to-copy IDs                     IDs are tools
Answer buried in dumps                   Answer stays in host chat (never re-hosted)
```

### v2.3.0 payload the widget must ingest

Hosts should keep calling `appendTraceCard(question, responseJson)` with `responseJson.trace` present. Recommended shape is what `turn_mapper.trace_payload` already produces:

```text
responseJson.trace  ←  DebugBundle.public_trace
                    + detective
                    + preferred_req_id / session.preferred_req_id
                    + hops (if missing on public_trace)
                    + gather: chat_id, turn_id, session_id, req_ids,
                      zeus_url, client_version, target, catalog,
                      contract_status, tokens, export_ref
                    + layer_a (promoted, no G2)
```

`build_public_trace` (2.3.0) already includes: `turn_id`, `status`, `rounds`, `notes`, `steps`, `hops`, `ai_process_result`, `layer_a`, `policy`, `flags`, `tokens`, `session`, `inject`, `stamp` / `user`.

**Normalizer must also accept** legacy 0.x fixtures (`spans`, `ai_requests`, `ai_responses`, `tool_calls`) so TravelPlan / `examples/embed.html` do not break.

**2.3.0-specific chrome** (new vs 0.1.x):

| UI | Source |
|----|--------|
| Token In/Out/Total (+ cached if `tokens.cached`) | `trace.tokens` `{prompt,completion,total,cached,ok}` |
| Catalog / inject chips | `trace.catalog` / `trace.inject` (`has_mini_schema`, `has_scope_brief`, `base_id`, `client_floor`) |
| Semantic cache | `trace.notes` matching `semantic_cache.recall|write|probe`; optional inject key `semantic_memory` |
| Stamp | `trace.stamp.user` (product sink `user=zeus_client`) |
| Preferred hop ★ | `debug.preferred_req_id` / `session.preferred_req_id` |
| Detective grade / playbooks | `trace.detective.diagnosis` + `.prompt` + `.overview` |
| Job / units rail | `trace.multi_agent` + `trace.units[]` (UI only; claim stays `docs`) |

### Potential risks / edge cases

- **Narrow overlay vs full pane** → Mockup uses a 720×640 floating card; below 720px stack turn list above detail (same as sketch `@media`).
- **public_trace lacks spans / LLM I/O arrays** → Port `synthesizeTraceSpans` + `normalizeLlmRounds` from `trace_helpers.js`.
- **DaisyUI class hooks in tests** (`.stats`, collapse-plus) → Rewrite tests to `.tt-*` selectors; do not keep DaisyUI just for tests.
- **Shadow DOM + existing sample-app IDs** → Inspector IDs stay `#tt-*` inside the shadow root; no document-level collision.
- **Job mode empty hops** → Keep 004 rail: when `multi_agent`, turn list becomes units; Inject / goal tab visible.
- **Host CSS leakage** → Continue `all: initial` on host + shadow; inspector tokens scoped under `.tt-panel`.
- **Auto-open Detective annoyance** → Only when selected turn **changes** and grade is warn/fail or hop ≥ 400 (sample-app rule).
- **CDN hosts pinned to 0.1.x** → Semver 1.0.0 is a breaking visual/DOM change; keep public JS API; document internals as unstable.

### Alternatives considered

| Option | Verdict |
|--------|---------|
| Restyle stacked cards to look denser | Reject — sample app already abandoned this IA |
| iframe the sketches | Reject — dead mock data, two UIs |
| Rewrite inspector from scratch in this repo | Reject — 3k lines of proven behavior in `zeus_client/static` |
| **Port inspector modules into this package, adapt overlay/docked** | **Ship** |
| Overlay-only (no docked) | Weaker alignment; demos still float, but sample app cannot vendor |
| Overlay default + optional docked mount | **Ship** — one inspector, two chrome modes |

## 3. Step-by-Step Implementation Plan

### Gate: mockup before production code

No edits to `src/trace.js`, `src/widget.css`, or `src/widget.html` until the mockup in step 1 is reviewed. Production work starts at step 2.

---

1. **Static overlay mockup (no production JS)**  
   - Files to add: `sketches/v1-overlay-inspector/index.html`, `sketches/v1-overlay-inspector/README.md`, `sketches/README.md`  
   - Changes:
     - Self-contained HTML (inline CSS from `zeus_client/sketches/themes/tokens.css` + overlay chrome).
     - Show the **floating widget**, not a full-page split: lightning toggle (bottom-left), dark inspector card (`min(720px, 94vw)` × `min(70vh, 720px)`), version footer.
     - Interior = sample-app IA (see wireframe below).
     - Fixture states in the mockup (switcher chips): empty · healthy turn · failed hop + diagnosis · semantic-cache recall note · Layer A terminate · job units.
     - No esbuild, no `src/` changes.
   - Commands: `npx serve sketches -p 5200` → open `/v1-overlay-inspector/`
   - Tests needed: none (visual review)

**Locked overlay wireframe**

```
┌ host page (dimmed) ─────────────────────────────────────────┐
│                                                              │
│   ┌ Zeus Tracer  v1.0.0 · 3 turns · client 2.3.0  [Export] [Copy] [Detective ↗] [×]
│   ├ session  sess_8f3a…  r3  contract:match  ★ 25ef66…  Hub ↗  cache:recall
│   ├──────────────┬───────────────────────────────────────────┤
│   │ Filter…      │ #3  How many IPA breweries in Colorado…   │
│   │ All Err Tools│ wall 1.81s   AI 62%  Zeus 31%  Other 7%   │
│   │              │ tok in 4,102  out 388  cached 512         │
│   │ ● #3 1.81s   │ [MINI yes] [BRIEF yes] [base-5.3] [floor-5]
│   │   query…     │                                           │
│   │ ● #2 0.94s   │ ⚠ Diagnosis  grade:warn  “0-row hop then broaden”
│   │ ○ #1 2.10s   │ Playbooks: relax filter · check collection │
│   │              │                                           │
│   │              │ Timeline | Hops(3) | LLM I/O | Inject | Detective | Raw
│   │              │ ───────────────────────────────────────── │
│   │              │  [Story]  waterfall + tool-frequency      │
│   ├──────────────┴───────────────────────────────────────────┤
│   │                                              v1.0.0      │
│   └──────────────────────────────────────────────────────────┘
│  [⚡]                                                        │
└──────────────────────────────────────────────────────────────┘
```

Narrow (`<720px`): turn list stacks on top (max-height ~160px); tabs stay; session IDs wrap.

Docked variant (same mockup, toggle “overlay / docked”): no lightning button; panel fills a host `#zeus-trace-slot`.

---

2. **Extract inspector CSS tokens into the widget chrome**  
   - Files: `src/widget.html`, `src/widget.css` (replace stacked-card rules)  
   - Changes:
     - Drop DaisyUI `<link>` from bootstrap (step 4).
     - Copy `.tt-*` token block from `zeus_client/static/app.css` into `widget.css` (scope under `.zeus-trace-root` / `.tt-panel`).
     - Markup matches sample-app inspector + overlay extras: `#debug-toggle`, close, version footer, toast (no DaisyUI toast — simple `.tt-toast`).
     - Keep public ids needed by tests after rewrite: `#debug-toggle`, `#debug-panel`, `#debug-close`, plus `#tt-*`.
   - Commands: visual check against mockup (static HTML in shadow via bootstrap later)
   - Tests needed: smoke that markup ids exist (`widget.html` fixture in tests)

3. **Port helpers as ES modules (behavior, not UI)**  
   - Files to add: `src/helpers.js` (from `zeus_client/static/trace_helpers.js`), `src/normalize.js`  
   - Changes:
     - Convert IIFE `ZeusTraceHelpers` → named exports: `escapeHtml`, `fmtMs`, `fmtBytes`, `traceMetrics`, `roundPctParts`, `waterfallHTML`, `toolFrequencyChartHTML`, `synthesizeTraceSpans`, `attachPipelineCostsToSteps`, `extractGather`, `extractJobUnits`, `isMultiAgentTrace`, detective formatters.
     - `normalize.js`: `normalizeTurnEntry(entry)` accepting:
       1. `{ question, trace }` (legacy + `trace_payload`)
       2. `{ question, debug, trace? }` (`DebugBundle.to_dict()` + optional public_trace)
       3. Missing `trace` → no-op (preserve 0.1.x)
     - Token rollup prefers `trace.tokens` (`ok` / `prompt` / `completion` / `total` / `cached`) then step `usage`.
     - `business_rules_triggers`: object only; ignore arrays.
     - Semantic-cache chips from notes prefixes `semantic_cache.`.
     - Layer A: reuse current harvest order from `trace.js` (`layer_a` → structured → return/pipeline → flat), minus G2 keys.
   - Commands: `npx vitest run src/normalize.test.js`
   - Tests needed: fixtures for 0.1.x embed payload, 2.3.0 `public_trace`, detective warn, object vs array triggers, semantic_cache notes, missing spans

4. **Port inspector panel module into Shadow DOM**  
   - Files to add: `src/panel.js` (from `trace_panel.js`)  
   - Files to change: `src/trace.js` becomes a thin facade (`initZeusTrace` → `createOverlayController`)  
   - Changes:
     - Query inside `root` (shadow), not `document.getElementById`.
     - Tabs: Timeline (waterfall + optional Story + tool-frequency), Hops (table → req‖res), LLM I/O (round pills → req‖res + Layer A / decomposition), Inject / goal (job + `trace.inject` + semantic_memory), Detective (overview, prompt checklist, playbooks, support pack), Raw (jsnview).
     - Diagnosis strip from 003 when grade ≠ pass or hop ≥ 400; auto-open Detective once per selection change.
     - Session bar: click-to-copy `session_id`, `turn_id`, `preferred_req_id`; Detective uses existing `detectiveUrl(hubBaseUrl, sessionId)` and req link `{hub}/hub/debug/req/{id}` when preferred id exists.
     - Job mode: `setJobMode` / auto-detect `trace.multi_agent` — replace turn list with units rail (004).
     - Copy all = JSON bundle; Export = same file download.
   - Commands: `npm test`
   - Tests needed: selection, filter chips, diagnosis visibility, Detective auto-tab, copy-all bundle shape, job-mode chrome

5. **Bootstrap: overlay default, optional docked mount, drop DaisyUI**  
   - Files: `src/bootstrap.js`, `src/config.js`  
   - Changes:
     - Remove `DAISYUI_CDN`.
     - Config: `mount` = `"overlay"` (default) | `"docked"`; `mountSelector` (e.g. `#zeus-trace-slot`).
     - Overlay: keep `#zeus-trace-host` + `pointer-events` + lightning toggle.
     - Docked: attach shadow (or light DOM if host requests — default shadow) inside the slot; hide toggle; panel `position: relative; width/height 100%`.
     - Preserve kill switch, early queue, `publicConfig` (add `mount`, never leak token).
     - Public API additions (non-breaking): `setEntries`, `clear`, `exportBundle`, `setJobMode`. Keep `appendTraceCard` / `openDebugPanel`.
   - Commands: `npm run build`
   - Tests needed: `config.test.js` for `mount` / enabled; bootstrap disabled = no DaisyUI request (assert no `daisyui` URL)

6. **Fixtures, demo host, CDN-facing example**  
   - Files: `examples/embed.html`, `examples/fixtures/turn-v230.json`, `examples/fixtures/turn-legacy.json`  
   - Changes:
     - Demo buttons: legacy card, 2.3.0 healthy, 2.3.0 fail+detective, semantic cache, optional job units.
     - `?debug=true` still required unless `enabled: true` (keep demo `enabled: true`).
   - Commands: `npm run build && npm run serve` → `http://localhost:5199/examples/embed.html`
   - Tests needed: fixture files loaded in normalize tests

7. **Version, docs, feature guide**  
   - Files: `package.json` (`1.0.0`), `README.md`, `.grok/guides/EMBEDDABLE_TRACE_WIDGET.md` (rewrite IA), `.grok/guides/V1_INSPECTOR.md` (new), `.grok/plans/1_V1_INSPECTOR_REDESIGN.md` (copy of this plan)  
   - Changes:
     - Document expected 2.3.0 `trace` keys and `turn_mapper.trace_payload` as the BFF recipe.
     - Breaking: shadow internals / DaisyUI / stacked cards gone; public functions kept.
     - Changelog table in the guide.
     - Mark `.grok/plans/WIDGET_UI_REDESIGN.md` as superseded.
   - Commands: none
   - Tests needed: none

8. **Verification + 1.0.0 cut**  
   - Files: `dist/zeus_client_chat_trace.js` (build artifact)  
   - Changes: `npm test`, `npm run test:coverage` (do not regress helper coverage on normalize/panel), `npm run build`.
   - Manual: overlay demo + mockup side-by-side; docked demo (add a second example or a toggle on embed.html).
   - CDN publish is **optional** after tag (`npm run publish:cdn`) — not required to call the code complete.

## 4. Verification & Rollback

- **Tests**:
  - Unit: `normalize.js` against legacy + 2.3.0 fixtures (tokens, hops, detective grade, triggers object-only, semantic_cache notes).
  - Unit: panel — empty / filter / diagnosis / Detective auto-tab / copy bundle / job rail.
  - Unit: config kill switch + mount resolution.
  - Manual: `examples/embed.html` overlay; mockup at `sketches/v1-overlay-inspector/`; docked slot.
  - Cross-check: one real `TurnResult` dump from `zeus_client` sample app (copy JSON into fixture) renders the same hops / tokens / detective grade as the in-app panel.
- **Review Checklist**:
  - [ ] Mockup reviewed before `src/` inspector rewrite
  - [ ] No DaisyUI network request when enabled
  - [ ] `appendTraceCard` / `openDebugPanel` / `ZeusTrace.ready` still exist
  - [ ] Kill switch default off
  - [ ] G2 keys not shown as primary chrome
  - [ ] Feature guide updated; plan copied to `.grok/plans/`
  - [ ] Version is `1.0.0`
- **Rollback Plan**: revert the v1.0 branch; CDN `latest` stays on last 0.1.x until 1.0.0 is published. Hosts pinning `/zeus_client_chat_trace/0.1.13/` are unaffected.

## 5. Open Questions / Decisions Needed

Locked in this plan unless you override:

1. **Visual source of truth** = shipped `zeus_client` inspector (hybrid 001+003+002 Story + 004 job rail), not 0.1.x cards.
2. **Mockup is a hard gate** — static HTML in this repo, then code.
3. **Mount** = overlay default + optional docked (`ZeusTraceConfig.mount`).
4. **DaisyUI removed** in 1.0.0.
5. **Job/units UI** included, gated on `trace.multi_agent` (no new job client).
6. **Public JS API** kept; shadow DOM internals are a breaking visual change (semver 1.0.0).

Ask only if you want a different default:

- Overlay-only (drop docked) to shrink v1.0.
- Defer job/units to 1.1.
- Keep a light theme instead of the dark inspector island.

---

## Implementation notes (for the executing agent)

- Copy this file to `.grok/plans/1_V1_INSPECTOR_REDESIGN.md` when implementation starts.
- After ship, write `.grok/guides/V1_INSPECTOR.md` using the AGENTS.md guide template and rewrite `EMBEDDABLE_TRACE_WIDGET.md` section 2 to the inspector flow.
- Port, don’t rewrite: `trace_panel.js` + `trace_helpers.js` are the behavior oracle; adapt queries to the shadow `root`.
- Do not generate production CSS/JS until `sketches/v1-overlay-inspector/index.html` exists and matches the wireframe above.
- Do not edit `zeus_client` or `the Python client` in this workstream.
