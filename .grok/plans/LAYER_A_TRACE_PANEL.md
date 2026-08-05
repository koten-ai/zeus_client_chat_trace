# Plan: Layer A Trace Panel

**Date**: 2026-08-05
**Task**: Surface Layer A terminate fields on each Zeus Tracer card  
**Priority**: High  
**Estimated Effort**: 1–2 hours / 4 steps

## 1. Context & Requirements
- **Goal**: When `appendTraceCard` receives a response with Layer A (base-5 terminate bag), show `summary`, `confidence`, `policy_action`, `query_decomposition`, `decomposition` (including nested `predicates` and `output`) on the card without digging into Raw turn bundle.
- **Constraints**: Vanilla JS widget; Shadow DOM + existing DaisyUI/widget.css patterns; harvest from multiple payload shapes (top-level `layer_a`, `structured_response.layer_a`, return/pipeline steps).
- **Assumptions**: Hosts (e.g. demo_yelp) pass the search response JSON to `appendTraceCard`; Layer A may only live on `trace.steps` return/pipeline args.
- **Out of Scope**: Changing Zeus/Detective server paths; rewriting host peeling of user-facing answers.

## 2. Analysis & Research
- Key files explored: `src/trace.js`, `src/widget.css`, `src/trace.test.js`, Detective `collectLayerAExtras` / client `layer_a_for_session_trace`
- Potential risks/edge cases:
  - Missing Layer A → no panel (must not blank the card) → Mitigation: render only when found
  - Nested vs flat bag → Mitigation: multi-source extract with same keys as base-5
- Alternatives considered: Dump-only JSON section vs dedicated panel — dedicated panel for scanability + optional full JSON collapse

## 3. Step-by-Step Implementation Plan
1. **Extract Layer A** from response + trace steps  
   - Files: `src/trace.js`  
   - Changes: `extractLayerA(j, t)`  
2. **Render panel** with chips + summary + QD + decomp/predicates/output  
   - Files: `src/trace.js`, `src/widget.css`  
3. **Tests + fixture** covering `layer_a` bag and step harvest  
4. **Guide update** in `.grok/guides/EMBEDDABLE_TRACE_WIDGET.md`

## 4. Verification & Rollback
- **Tests**: `npm test`; `npm run build`
- **Review Checklist**:
  - [ ] Code style consistent
  - [ ] No breaking changes when Layer A absent
  - [ ] Feature guide updated
- **Rollback Plan**: Revert `trace.js` / `widget.css` / tests / guide

## 5. Open Questions / Decisions Needed
- None — fields and sample shape provided by user.
