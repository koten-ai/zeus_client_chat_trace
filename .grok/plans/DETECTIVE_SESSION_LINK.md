# Plan: Detective Session Link + Zeus Tracer Title

**Date**: 2026-08-03
**Task**: Point Hub Detective at `/hub/debug/session/{session_id}` and keep the panel title as `Zeus Tracer`.
**Priority**: High
**Estimated Effort**: 1 hour / 4 steps

## 1. Context & Requirements
- **Goal**: Detective deep-link uses Zeus `session_id` (not request id). Panel title remains `Zeus Tracer`.
- **Constraints**: Embeddable widget; host-supplied `hubBaseUrl` only; Shadow DOM panel chrome.
- **Assumptions**: Host payloads already include `session_id` (or nested `trace.session.id`) after sessioned search turns.
- **Out of Scope**: Changing Hub Detective backend routes; host app session plumbing beyond docs.

## 2. Analysis & Research
- Key files: `src/config.js` (`detectiveUrl`), `src/trace.js` (extract + title/link), `src/widget.html`, tests, README/guide.
- Risks:
  - Hosts that only forward `req_id` lose Detective until `session_id` is present → document + prefer nested session fields.
  - Stale vendored bundles in demo apps → build + sync skill.
- Alternatives: Keep req path as fallback — rejected; product wants session path only.

## 3. Step-by-Step Implementation Plan
1. **detectiveUrl** — `/hub/debug/session/{sessionId}`
2. **extractSessionId + updateDebugTitle** — fixed title `Zeus Tracer`; link from session id
3. **Tests + docs + embed fixtures**
4. **npm test, build, sync demo consumers; bump package version**

## 4. Verification & Rollback
- **Tests**: `npm test` (config + trace Detective cases)
- **Review Checklist**:
  - [x] Code style/linting passes
  - [x] No breaking API on `appendTraceCard` (session_id additive)
  - [x] Feature guide updated
- **Rollback Plan**: Revert commit; restore `/hub/debug/req/{req_id}` path.

## 5. Open Questions / Decisions Needed
- None — product specified session URL and title text.
