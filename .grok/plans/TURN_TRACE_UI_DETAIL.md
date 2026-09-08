# Plan: Replicate zeus_client Turn Trace UI in detail

**Date**: 2026-09-08
**Task**: Match the sample-app Turn traces inspector: envelope IDs as text + copy icon, Diagnosis/Prompt/Tools cards, Session IDs, Raw Copy JSON alignment.
**Priority**: High
**Estimated Effort**: 3 hours / 6 steps

## 1. Context & Requirements
- **Goal**: Overlay and docked inspector interiors match `zeus_client` Turn traces: Overview/Session ID values are mono text with a clipboard icon (not a `btn` wrapping the UUID); Diagnosis findings are nested DaisyUI cards (no bullet lists, no leftover `.det-diag-card` padding/fill); Prompt tiles and Tools KPI/IO cards layout correctly; Raw **Copy JSON** sits on the same row as **Raw bundle**, right-aligned.
- **Constraints**: Open Shadow DOM. DaisyUI **4.12.10** `full.min.css` is components-only (no Tailwind utilities: no `.flex`, `.p-4`, `.border` width, `.grid-cols-2`, `.text-xl`, `.ml-auto`). Layout must live in `widget.css`. Public embed API unchanged. Session-row `.tt-id` chips stay truncated buttons.
- **Assumptions**: Source of truth is sibling `zeus_client/static/trace_panel.js` + `app.css` (copyValueRow, nested diagnosis cards) and this repo’s `.grok/guides/STYLE_HTML_CSS.md`.
- **Out of Scope**: Chat/Catalog/Settings; CDN publish; Tailwind CDN; changing ingest/normalize.

## 2. Analysis & Research
- Key files explored:
  - `../zeus_client/static/trace_panel.js` (`copyValueRow`, `diagNestedCardHTML`, `renderDetOverview` / Diagnosis / Prompt / Tools / Session / Raw)
  - `../zeus_client/static/app.css` (`.det-env`, `.tt-copy-id`, no `.det-diag-card {` chrome, `.pcl`, `.env-kpi`)
  - `../zeus_client/tests/test_trace_style_guide.py` (`test_envelope_ids_are_value_plus_copy_icon`, `test_diagnosis_items_are_nested_daisyui_cards`)
  - `src/panel.js`, `src/widget.css`, `src/panel.copy.test.js`, `src/style_guide.test.js`
- Potential risks/edge cases:
  - DaisyUI `.stat-value` is **2.25rem** — Tools KPIs look huge without Tailwind `text-xl` → Mitigation: override `.tt-panel .kpi-val` / `.stat-value.kpi-val`
  - DaisyUI `.btn-square` is **3rem** — copy icon would dwarf the UUID without `h-5 w-5` → Mitigation: size `.tt-copy-id .btn` in CSS
  - `.border-base-300` sets **color only**; Tailwind `.border` (width) is missing → Mitigation: `border-width: 1px` on `.tt-panel .card.border` / `.border-base-300`
  - SVG click on copy icon must still hit `[data-copy]` via `closest` → keep `data-copy` on the button
  - Session bar `#tt-session button.tt-id` tests must keep working
- Alternatives considered: Load Tailwind CDN (rejected — does not scan Shadow DOM). Compile a purged Tailwind layer (deferred). Semantic CSS + a small utility pack in `widget.css` (this plan).

## 3. Step-by-Step Implementation Plan
1. **Envelope / Session IDs: text + copy icon**
   - Files to change: `src/panel.js`, `src/widget.css`
   - Changes: Port `copyValueRow` + clipboard Heroicon; `valueCell` uses it; `.det-env` grid `max-content 1fr`; nowrap `.tt-copy-id`
   - Tests needed: [x] style_guide + copy tests

2. **Diagnosis nested cards; drop old `.det-diag-card` chrome**
   - Files to change: `src/panel.js`, `src/widget.css`
   - Changes: `diagNestedCardHTML` / stack; headline + slowTop as cards; no `list-disc`; delete `.tt-panel .det-diag-card { padding/background }`; `.diag-grid` two columns
   - Tests needed: [x]

3. **Prompt / Tools / Raw card layout in CSS**
   - Files to change: `src/widget.css`, `src/panel.js` (Raw `raw-head` class)
   - Changes: `.pcl` verdict/tiles/top row; `.env-kpi` grid + compact `.stat` / `.kpi-val`; `io-card > header` flex + `ml-auto`; `.raw-head` flex; inspector `.card` 1px border; compact `.card-title`
   - Tests needed: [x] computed-style

4. **Shadow layout utilities (no Tailwind JIT)**
   - Files to change: `src/widget.css`
   - Changes: Scoped flex/grid/gap/spacing/typography/overflow utilities used by inspector markup (`flex`, `items-center`, `ml-auto`, `p-3`, `text-xs`, `border-error/40`, `w-3.5`, …)
   - Tests needed: [x] brace-balance

5. **Tests + style guide**
   - Files to change: `src/style_guide.test.js`, `src/panel.copy.test.js`, `src/widget.css.test.js`, `.grok/guides/STYLE_HTML_CSS.md`, `.grok/guides/V1_INSPECTOR.md`
   - Changes: Port envelope-id and nested-diagnosis contracts; copy icon click; card border / kpi / raw-head computed styles; document missing Tailwind utilities
   - Tests needed: [x]

6. **Verify**
   - Commands: `node --check src/panel.js`; `npm test`; playground Overview / Diagnosis / Prompt / Tools / Session / Raw
   - Tests needed: [x]

## 4. Verification & Rollback
- **Tests**: `node --check src/panel.js src/helpers.js`; `npm test`; manual `http://localhost:5199/` and `?mount=overlay` with v2.3.0 fixture
- **Review Checklist**:
  - [x] Code style/linting passes
  - [x] No breaking changes to `appendTraceCard` / `openDebugPanel`
  - [x] Feature guide created or updated in `.grok/guides/STYLE_HTML_CSS.md`
- **Rollback Plan**: revert `src/panel.js`, `src/widget.css`, tests, guides

## 5. Open Questions / Decisions Needed
- None — sample-app markup and CSS are the spec.
