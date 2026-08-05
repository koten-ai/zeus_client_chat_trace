# Plan: Fix trace-card-body flex collapse / KPI–Layer A overlap

**Date**: 2026-08-05
**Task**: Stop `.trace-card-body` sections from collapsing and painting on top of each other  
**Priority**: High  
**Estimated Effort**: 0.5 hours / 2 steps

## 1. Context & Requirements
- **Goal**: KPI grid and Layer A stack cleanly inside `.trace-card-body` with no overlapping labels/values; card body remains scrollable under a pinned head.
- **Constraints**: Shadow DOM + DaisyUI `.stats`; keep selectors/tests (`tc-kpi-mini`, `layer-a-panel`, collapse a11y).
- **Assumptions**: User screenshot shows MINI-SCHEMA / SCOPE BRIEF / big “2” over INTENT pills — KPI height collapsed to 0 while tiles `overflow: visible`.
- **Out of Scope**: Panel chrome proportions; CDN publish (host may request separately).

## 2. Analysis & Research
- Key files: `src/widget.css`, `src/trace.js` (DOM order OK), live embed metrics
- Root cause:
  1. `.trace-list` is column flex; `.trace-card { overflow: hidden }` without `flex-shrink: 0` shrinks below content and clips the body.
  2. `.trace-card-body` is column flex under `max-height`; `.tc-kpi-mini` had `min-height: 0` → flex item height **0** while children still paint → overlaps Layer A.
- Mitigation: card/body children `flex-shrink: 0`; KPI `min-height: auto` + `height: auto !important`.

## 3. Step-by-Step Implementation Plan
1. **CSS layout lock** — `src/widget.css` (card, head, body `> *`, tc-kpi-mini, layer-a-panel)
2. **Verify** — `npm test` / `npm run build`; browser metrics (kpi height > 0, gap between kpi and Layer A)

## 4. Verification & Rollback
- **Tests**: unit suite green; manual embed: badges → 3×2 KPI → Layer A pills → code blocks, no overlap
- **Review Checklist**:
  - [x] No breaking changes
  - [x] Guide updated
- **Rollback Plan**: Revert `src/widget.css` + version bump

## 5. Open Questions / Decisions Needed
- None
