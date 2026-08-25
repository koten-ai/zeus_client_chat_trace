# Plan: Widget UI Redesign (code.html guide)

**Date**: 2026-08-05
**Task**: Restyle the Zeus Tracer embeddable panel to match the `code.html` dashboard mockup  
**Priority**: High  
**Status**: Superseded by `.grok/plans/1_V1_INSPECTOR_REDESIGN.md` (v1.0.0 inspector)  
**Estimated Effort**: 2–3 hours / 5 steps

## 1. Context & Requirements
- **Goal**: Visual redesign of the floating debug widget to match `.hermes/desktop-attachments/code.html` — card chrome, token stat tiles, total progress bar, session details grid, Layer A pills + code blocks, footer/version — while preserving APIs, data extraction, and test-critical selectors/ids.
- **Constraints**: Shadow DOM embed; DaisyUI still loaded for collapse/toast; no Font Awesome CDN (inline SVG); keep `#tokens-total`, `.stat-title`/`.stat-value`, `.tc-kpi-mini`, `.layer-a-panel`, Detective link behavior.
- **Assumptions**: Mockup is visual guide only; keep waterfall, tool-frequency, Hash Traces, JSON dumps.
- **Out of Scope**: CDN publish, host app changes, new metrics fields.

## 2. Analysis & Research
- Key files: `src/widget.html`, `src/widget.css`, `src/trace.js`, `src/trace.test.js`, `.grok/guides/EMBEDDABLE_TRACE_WIDGET.md`
- Risks:
  - Tests couple to DaisyUI class names (`stats`, `.stat-title`) → keep those class hooks under new skins
  - Wider panel may clip on mobile → `min(720px, 94vw)` + scroll
- Alternatives: Full Tailwind rewrite vs hand-rolled CSS matching mockup tokens — choose hand-rolled (no Tailwind runtime in bundle).

## 3. Step-by-Step Implementation Plan
1. **Panel chrome (HTML)** — header title · Detective, primary Copy All, close; structure for totals/list/footer.
2. **CSS redesign** — token cards, full-width AI/Zeus/Other bar, session card, KPI grid tiles, Layer A pills/code blocks, waterfall rows.
3. **JS renderers** — `tokensStatsHTML`, `renderTraceTotal`, `buildMetricsRow`, `buildCardHeadStatsEl`, `buildLayerAEl`, badges, card head.
4. **Tests / guide** — update only if selectors change; document new UI in guide.
5. **Verify** — `npm test`, `npm run build`.

## 4. Verification & Rollback
- **Tests**: `npm test`; manual `npm run serve` + embed demo
- **Review Checklist**:
  - [ ] Code style/linting passes
  - [ ] No breaking changes to `appendTraceCard` / Detective
  - [ ] Guide updated
- **Rollback Plan**: `git checkout -- src/widget.html src/widget.css src/trace.js`

## 5. Open Questions / Decisions Needed
- None — mockup is the visual source of truth.
