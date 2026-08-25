# Plan: Pin Widget into demo_travel_sample

**Date**: 2026-08-25
**Task**: Vendor `zeus_client_chat_trace@1.0.0` into sibling `demo_travel_sample` so TravelPlan does not follow CDN `latest`.
**Priority**: High
**Estimated Effort**: 0.5 hours / 3 steps

## 1. Context & Requirements
- **Goal**: TravelPlan serves this repo’s 1.0.0 inspector from `/static/zeus_client_chat_trace.js?v=1.0.0`.
- **Constraints**: Do not require CDN publish. Keep embed API (`appendTraceCard` / `?debug=true`).
- **Assumptions**: `../demo_travel_sample` exists beside this repo.
- **Out of Scope**: Changing TravelPlan BFF or publishing Spaces.

## 2. Analysis & Research
- Key files explored: `package.json` (1.0.0), `dist/`, `../demo_travel_sample/templates/index.html` (CDN latest in WT; vendored path on `main`)
- Potential risks/edge cases:
  - Unreleased inspector not on CDN → Mitigation: copy `dist/` into demo static
- Alternatives considered: CDN semver URL vs vendor copy (vendor).

## 3. Step-by-Step Implementation Plan
1. **Build + copy** — `npm run build`; `demo_travel_sample/scripts/vendor_trace.sh`
2. **Demo HTML** — pin query `?v=1.0.0`, `hubBaseUrl`
3. **Guides** — widget + demo docs

## 4. Verification & Rollback
- **Tests**: vendored file contains version `1.0.0` and `.tt-panel`; demo `pytest tests/test_app.py` 6 passed
- **Review Checklist**:
  - [x] Feature guide updated
- **Rollback Plan**: revert demo static + `index.html`

## 5. Open Questions / Decisions Needed
- None
