# Plan: Turn Bar Percent Labels Sum to 100%

**Date**: 2026-08-05
**Task**: Fix AI/Zeus/Other percentage labels so they always total 100% (not 99%).  
**Priority**: Medium  
**Estimated Effort**: 0.5 hours / 3 steps

## 1. Context & Requirements
- **Goal**: Integer percent labels on per-turn metrics and session total bar always sum to exactly 100.
- **Constraints**: Keep bar segment widths as continuous percentages; only labels need integer reconciliation.
- **Assumptions**: Three buckets (AI, Zeus, Other); Other is residual of total − AI − Zeus.
- **Out of Scope**: Changing ms formatting, bar pixel layout, or token stats.

## 2. Analysis & Research
- Key files explored: `src/trace.js` (`buildMetricsRow`, `renderTraceTotal`), `src/trace.test.js`
- Potential risks/edge cases:
  - Independent `Math.round` → 99% or 101% → Mitigation: largest-remainder (`roundPctParts`)
  - Zero total → Mitigation: return all 0%
  - Equal thirds (1+1+1) → one bucket gets 34%, others 33%
- Alternatives considered: Always put remainder on Other (biased); round then nudge largest error (similar to LRM).

## 3. Step-by-Step Implementation Plan
1. **Add `roundPctParts` helper**  
   - Files: `src/trace.js`
   - Changes: floor each share, distribute leftover 1% by largest fractional remainder
2. **Wire helper into card + total UIs**  
   - Files: `src/trace.js` (`buildMetricsRow`, `renderTraceTotal`)
3. **Regression tests**  
   - Files: `src/trace.test.js`
   - Screenshot case 8890/15/5810 → 60/0/40; equal thirds → sum 100

## 4. Verification & Rollback
- **Tests**: `npm run test`; `npm run build`
- **Review Checklist**:
  - [x] Code style/linting passes
  - [x] No breaking changes
  - [x] Feature guide created or updated in `.grok/guides/TURN_BAR_PERCENT_SUM_100.md`
- **Rollback Plan**: Revert helper usage to `Math.round(n / sum * 100)`.

## 5. Open Questions / Decisions Needed
- None
