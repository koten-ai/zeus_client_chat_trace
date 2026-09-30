# Plan: Token Stats Component

**Date**: 2026-07-30
**Task**: Add DaisyUI `stat` component for token in / out / total on chat trace metrics  
**Priority**: Medium  
**Estimated Effort**: 1 hour / done

## 1. Context & Requirements
- **Goal**: Metrics row and TOTAL bar show token **in**, **out**, and **total** via DaisyUI `stats`/`stat`
- **Constraints**: Shadow DOM + DaisyUI 4 CDN already loaded; keep compact in narrow panel
- **Assumptions**: LLM steps carry OpenAI-style `usage.prompt_tokens` / `completion_tokens` / `total_tokens`
- **Out of Scope**: Cost estimation, per-model breakdown

## 2. Analysis & Research
- Key files: `src/trace.js` (`traceMetrics`, `buildMetricsRow`, `renderTraceTotal`), `src/widget.css`, `src/trace.test.js`
- Risks: Huge DaisyUI default `stat-value` → compact CSS override; missing usage → `?`

## 3. Step-by-Step Implementation Plan
1. Extend `traceMetrics` for tokensIn/tokensOut + flags; derive total from in+out when needed
2. Add `tokensStatsHTML` DaisyUI markup; wire into metrics row + TOTAL
3. CSS `.mm-token-stats` compact layout
4. Tests + docs + build + a host app sync

## 4. Verification & Rollback
- **Tests**: `npm test` (token stats cases) + `npm run build`
- **Review Checklist**:
  - [x] Code style/linting passes
  - [x] No breaking changes
  - [x] Feature guide updated in `.grok/guides/EMBEDDABLE_TRACE_WIDGET.md`
- **Rollback Plan**: Revert `trace.js` / `widget.css` / tests

## 5. Open Questions / Decisions Needed
- None
