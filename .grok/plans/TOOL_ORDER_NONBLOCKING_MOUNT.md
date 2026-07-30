# Plan: Non-blocking tool-order for Zeus Trace widget

**Date**: 2026-07-13
**Task**: Stop tool-order loading from blocking widget mount / appendTraceCard  
**Priority**: High  
**Estimated Effort**: 1 hour

## 1. Context & Requirements
- **Goal**: Floating Zeus Trace widget and `appendTraceCard` work even when `/api/tool-order` is slow, missing, or hangs
- **Constraints**: Keep injected `toolOrder` path; keep optional fetch for chart order; no host API changes required
- **Assumptions**: Chart order may lag behind first card when order is fetched asynchronously
- **Out of Scope**: Changing Zeus server endpoints; host app search flow

## 2. Analysis & Research
- Key files: `src/bootstrap.js`, `src/trace.js`, `src/config.js`, tests, README/guide
- Risks:
  - Hung `fetch` blocked `ZeusTrace.ready` and early-queue drain → mitigated by not awaiting tool-order on mount + 3s AbortController timeout
  - Missing `api_version` used v1 chart axis while UI showed V2 → default to v2

## 3. Step-by-Step Implementation Plan
1. **Unblock bootstrap** — remove `await api.readyToolOrder` before installing globals  
2. **Timeout tool-order fetch** — AbortController default 3s; configurable via `toolOrderTimeoutMs`  
3. **Align api version** — chart + header default to v2  
4. **Tests + docs + rebuild**

## 4. Verification & Rollback
- **Tests**: `NODE_ENV=development npm test` (24 passed)
- **Build**: `npm run build`
- **Review Checklist**:
  - [x] Feature guide updated
  - [x] No blocking on tool-order for mount
- **Rollback Plan**: Revert commits touching bootstrap/trace/config

## 5. Open Questions / Decisions Needed
- None

---
