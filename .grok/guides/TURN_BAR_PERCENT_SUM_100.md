# Guide: Turn Bar Percent Labels Sum to 100%

**Date**: 2026-08-05  
**Feature**: AI / Zeus / Other integer percent labels always total 100%  
**Status**: Active  
**Related Plan**: `.grok/plans/TURN_BAR_PERCENT_SUM_100.md`

## 1. Overview
- **Purpose**: Avoid confusing 99% (or 101%) totals when three independently rounded percentages are shown next to the turn/total progress bar.
- **Scope**: Label integers only; CSS bar widths still use fractional `%` via `.toFixed(1)`.
- **Entry points**: Per-card `.msg-metrics` row and session `#trace-total.total-progress` meta.

## 2. Architecture & Flow
- **High-level flow**:
  1. `traceMetrics(t)` computes `aiMs`, `zeusMs`, `other`, `total`.
  2. `roundPctParts([ai, zeus, other], total)` returns three integers summing to 100 (largest-remainder method).
  3. Labels render as `fmtMs(ms)/{pct}% AI|Zeus|Other`.
- **Key components**:
  - `src/trace.js` — `roundPctParts`, `buildMetricsRow`, `renderTraceTotal`
  - `src/trace.test.js` — regression for screenshot 8.89s/15ms/5.81s case
- **Data flow**: Step timings → metrics bag → reconciled percents → DOM labels
- **Dependencies**: None beyond existing vitest/jsdom tests

## 3. Setup
- **Prerequisites**: Node + `npm install`
- **Install / bootstrap steps**:
  1. `npm install`
  2. `npm run test`
- **Verification**: New tests mention “percent labels always sum to 100”

## 4. How to Use
- **Primary workflow**: Open Zeus Tracer after a turn; AI + Zeus + Other % labels must add to 100.
- **Examples**: 8890 + 15 + 5810 ms → **60% / 0% / 40%** (not 60/0/39).
- **Edge cases**:
  - `total <= 0` → `0% / 0% / 0%`
  - Equal 1 ms thirds → `34 / 33 / 33` (order by largest remainder, stable index tie-break)
- **Limitations**: Labels are integers; bar widths remain continuous and may not match label pixels exactly.

## 5. Debugging & Known Issues
- **Common symptoms → causes → fixes**:
  | Symptom | Likely Cause | Fix |
  |---------|--------------|-----|
  | Labels sum to 99 or 101 | Old independent `Math.round` | Ensure `roundPctParts` is used |
  | All 0% with activity | `total_ms` missing and steps empty | Check trace payload |
- **Debug checklist**:
  - [ ] Inspect `.msg-metrics` and `#trace-total.total-progress` text
  - [ ] Confirm `trace.total_ms` and step `ms` values
  - [ ] `npm run test -- src/trace.test.js`
- **Known issues**: None after this fix

## 6. Related Artifacts
- **Files changed / owned by this feature**:
  - `src/trace.js` — `roundPctParts` + label wiring
  - `src/trace.test.js` — sum-to-100 regressions
- **Commits**: Release v0.1.13

## 7. Changelog
| Date | Author | Change |
|------|--------|--------|
| 2026-08-05 | agent | Initial guide — largest-remainder percent labels; shipped in v0.1.13 |
