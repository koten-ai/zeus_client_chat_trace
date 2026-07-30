# Plan: Fix missing tool-call rounds in trace dumps

**Date**: 2026-07-13
**Task**: Make multi-round tool calls visible in the Zeus Trace widget  
**Priority**: High  
**Estimated Effort**: 1 hour / 4 steps

## 1. Context & Requirements
- **Goal**: Each turn card shows round-by-round tool activity (Hash Traces + Tool calls dump + AI request/response rounds)
- **Constraints**: Keep Shadow DOM embed; jsnview remains optional with pre fallback
- **Assumptions**: Host still passes full `responseJson.trace` with `steps` / `tool_calls`
- **Out of Scope**: Changing Zeus server / host search APIs

## 2. Analysis & Research
- Key files: `src/jsnview-loader.js`, `src/trace.js`, tests, guide
- Root causes:
  - Wrong jsnview CDN path (`index.umd.js` → 404; correct is `index.min.js`)
  - After first 404, a dead script tag made later `loadJsnview()` hang forever
  - `appendTraceDump` only attached the dump wrap after all awaits → hang hid all dumps
  - Missing `ai_responses` section and weaker Hash Traces formatting vs zeus_client
- Alternatives considered: drop jsnview entirely → rejected; keep optional CDN with solid fallback

## 3. Step-by-Step Implementation Plan
1. **Fix jsnview loader** — correct URL; clear failed tags; no hang on retry  
2. **Resilient dumps** — attach wrap early; parallel mount; checkbox collapse-plus; AI responses + round labels  
3. **Hash Traces rounds** — richer step lines; fallback to `tool_calls` when steps empty  
4. **Tests + guide + rebuild**

## 4. Verification & Rollback
- **Tests**: `NODE_ENV=development npm test` (28 passed)
- **Build**: `npm run build`
- **Review Checklist**:
  - [x] Multi-round Hash Traces visible
  - [x] Tool calls dump title + open-by-default when non-empty
  - [x] Feature guide updated
- **Rollback Plan**: Revert loader/trace/css/test/guide commits

## 5. Open Questions / Decisions Needed
- None

---
