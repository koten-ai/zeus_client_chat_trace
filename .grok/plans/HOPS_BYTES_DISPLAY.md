# Plan: Hops Tab Bytes Display

**Date**: 2026-08-25
**Task**: Show hop response size in the Hops `Bytes` column for 2.3.0 traces that omit `hop.bytes`.
**Priority**: High
**Estimated Effort**: 1 hour / 4 steps

## 1. Context & Requirements
- **Goal**: Hops table `Bytes` cell shows a size (e.g. `3.1kB`) whenever the turn payload has hop/step bytes **or** a body we can measure. Empty stays `—` only when there is no size and no payload.
- **Constraints**: Widget remains a passive observer; do not treat `result_size` as bytes (that field is a row/item count). Keep sketch-formatted strings like `"6.1kB"`.
- **Assumptions**: Hosts send `kotenai-zeus-client` 2.3.0 hops (`result_json`, `snippet`, optional `step_costs`) without a `bytes` key. Legacy steps still set `bytes`.
- **Out of Scope**: Changing Python `hop_rec` (follow-up). Token stats. Hub Detective payloads.

## 2. Analysis & Research
- Key files explored: `src/normalize.js`, `src/helpers.js`, `src/panel.js`, `src/normalize.test.js`, `examples/embed.html`, `dev/index.html`, `../zeus_client_python/src/zeus_client/application/agent_turn.py`, `../zeus_client_python/src_v1_legacy/zeus_client/agent/tool_round.py`
- Potential risks/edge cases:
  - `result_size` is **row count**, not bytes → never map it to `Bytes`
  - `hops[]` present without `bytes` shadows `steps[].bytes` → match tool steps by `req_id` then verb
  - 2.3.0 hops store the body on `result_json` (not `res`) → map `result_json` → `res` and size that payload
  - Truncated `snippet` (2k cap) undercounts if used instead of `result_json` → prefer `result_json`
  - Empty `{}` / `[]` must not become `2B` / `2B`
- Alternatives considered: Patch Python to emit `bytes` (correct source of truth, but existing traces and this widget still need a fallback) vs widget-side resolve (ship here).

## 3. Step-by-Step Implementation Plan
1. **Resolve hop bytes in helpers**
   - Files to change: `src/helpers.js`
   - Changes: `resolveHopBytes`, `matchingToolStep`, `estimatePayloadBytes`; use aliases `bytes` / `byte_size` / `result_bytes` / `content_length`; estimate UTF-8 of `result_json` / `res` / `snippet` / step result; apply on job-unit hops
   - Tests needed: [x] unit tests in `normalize.test.js`

2. **Normalize hops to carry bytes + 2.3.0 I/O**
   - Files to change: `src/normalize.js`
   - Changes: `normalizeHops` fills `bytes` via helper; map `result_json` → `res`; fill `req` from matching step `args` when hop has no request
   - Tests needed: [x]

3. **Fixtures + inspector test**
   - Files to change: `examples/embed.html`, `dev/index.html`, `src/normalize.test.js`, `src/trace.test.js`
   - Changes: demo hops include explicit `bytes`; Hops tab click asserts a non-`—` Bytes cell for 2.3.0 `result_json`
   - Tests needed: [x]

4. **Docs**
   - Files to change: `.grok/guides/V1_INSPECTOR.md`, `.grok/guides/EMBEDDABLE_TRACE_WIDGET.md`
   - Changes: document Bytes source order and `result_size` pitfall
   - Tests needed: [ ]

## 4. Verification & Rollback
- **Tests**: `npm test` (74 passed); jsdom click Hops tab on a 2.3.0 hop with `result_json` and on a hop that only has `steps[].bytes`
- **Review Checklist**:
  - [x] Code style/linting passes
  - [x] No breaking changes
  - [x] Feature guide created or updated in `.grok/guides/V1_INSPECTOR.md`
- **Rollback Plan**: revert `src/helpers.js`, `src/normalize.js`, tests, fixtures, guides

## 5. Open Questions / Decisions Needed
- Should `kotenai-zeus-client` 2.3.0 set `hop_rec["bytes"] = len(text.encode("utf-8"))` like v1 `tool_round`? Yes, as a follow-up so the widget does not have to estimate.
