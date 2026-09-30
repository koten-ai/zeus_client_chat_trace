# Plan: Publish 1.2.2 to CDN and pin TravelPlan

**Date**: 2026-09-04
**Task**: Ship stacking/spacing CSS as `zeus_client_chat_trace@1.2.2` to DigitalOcean Spaces (versioned + latest), then vendor that build into `the sample host`.
**Priority**: High
**Estimated Effort**: 1 hour / 5 steps

## 1. Context & Requirements
- **Goal**:
  1. CDN serves `…/zeus_client_chat_trace/1.2.2/zeus_client_chat_trace.js` (immutable) and updates `…/latest/`.
  2. TravelPlan loads `/static/zeus_client_chat_trace.js?v=1.2.2` (vendored copy of the same build, not CDN `latest`).
- **Constraints**: Do not overwrite CDN `1.2.1/` (immutable cache). Demo stays on `/static/` vendor pin, not `latest`. Credentials from `.env`.
- **Assumptions**: Tree includes active-row `z-index: 100000` + header padding / title `margin-left: 8px` (`.grok/plans/WIDGET_STACKING_SPACING.md`). Package is still labeled 1.2.1 locally.
- **Out of Scope**: npm registry; git tag; changing TravelPlan BFF / `appendTraceCard`.

## 2. Analysis & Research
- Key files: `scripts/upload_dist_cdn.sh`, `package.json`, `scripts/vendor_trace.sh`, `src/templates/index.html`
- Risks:
  - Publishing as 1.2.1 would collide with the already-shipped dropdown build and any immutable CDN object → Mitigation: **1.2.2**
  - `latest` CDN edge stale → Mitigation: upload script purges `latest/*` when a DO token is present
- Alternatives considered: Re-upload 1.2.1 — rejected (immutable cache). Point TravelPlan at the versioned CDN URL — rejected; demo pin contract is a vendored `/static/` file plus `?v=`.

## 3. Step-by-Step Implementation Plan
1. **Bump to 1.2.2** — `package.json`, lockfile root, README, guides
2. **Test + build** — `npm test`; `npm run build`; confirm `1.2.2` and `z-index:100000` in `dist/`
3. **CDN upload** — `npm run publish:cdn`; probe `…/1.2.2/…` and `latest`
4. **Vendor + pin demo** — `scripts/vendor_trace.sh`; index `?v=1.2.2`; demo PINNED guide / README
5. **Widget docs** — EMBEDDABLE + V1_INSPECTOR + PIN_DEMO plan checklists

## 4. Verification & Rollback
- **Tests**: `npm test`; CDN HTTP 200 on versioned URL; vendored JS contains `1.2.2` and `z-index:100000`; index src `/static/zeus_client_chat_trace.js?v=1.2.2`
- **Review Checklist**:
  - [x] `npm test` — 111 passed; CDN HTTP 200 on `…/1.2.2/` and `latest`; vendored JS is 1.2.2
  - [x] No embed API break
  - [x] Guides updated
- **Rollback Plan**: hosts pin previous versioned CDN URL (`1.2.1`); revert demo static + script tag.

## 5. Open Questions / Decisions Needed
- None — patch bump required because 1.2.1 is already the demo pin without the stacking/spacing CSS.
