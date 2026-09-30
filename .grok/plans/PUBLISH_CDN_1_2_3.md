# Plan: Publish 1.2.3 to CDN and pin TravelPlan

**Date**: 2026-09-08
**Task**: Ship Turn traces UI detail (envelope copy-id, diagnosis nested cards, shadow layout) as `zeus_client_chat_trace@1.2.3` to DigitalOcean Spaces (versioned + latest), then vendor that build into `the sample host`. Commit and push.
**Priority**: High
**Estimated Effort**: 1 hour / 5 steps

## 1. Context & Requirements
- **Goal**:
  1. CDN serves `…/zeus_client_chat_trace/1.2.3/zeus_client_chat_trace.js` (immutable) and updates `…/latest/`.
  2. TravelPlan loads `/static/zeus_client_chat_trace.js?v=1.2.3` (vendored copy of the same build, not CDN `latest`).
  3. Git `main` records the DaisyUI inspector + this UI fix (origin is still 1.1.1).
- **Constraints**: Do not overwrite CDN `1.2.2/` (immutable cache, HTTP 200 today). Demo stays on `/static/` vendor pin, not `latest`. Credentials from `.env`.
- **Assumptions**: Tree includes Turn traces UI detail (`.grok/plans/TURN_TRACE_UI_DETAIL.md`) plus uncommitted 1.2.x inspector work. Package is labeled 1.2.2 locally.
- **Out of Scope**: npm registry; git tag; changing TravelPlan BFF / `appendTraceCard`.

## 2. Analysis & Research
- Key files: `scripts/upload_dist_cdn.sh`, `package.json`, `scripts/vendor_trace.sh`, `src/templates/index.html`
- Risks:
  - Publishing as 1.2.2 would collide with the already-shipped stacking/spacing build (128089 bytes, immutable) → Mitigation: **1.2.3**
  - `latest` CDN edge stale → Mitigation: upload script purges `latest/*` when a DO token is present
- Alternatives considered: Re-upload 1.2.2 — rejected (immutable cache).

## 3. Step-by-Step Implementation Plan
1. **Bump to 1.2.3** — `package.json`, lockfile root, README, guides
2. **Test + build** — `npm test`; `npm run build`; confirm `1.2.3` and `copyValueRow` / `tt-copy-id` in `dist/`
3. **CDN upload** — `npm run publish:cdn`; probe `…/1.2.3/…` and `latest`
4. **Vendor + pin demo** — `scripts/vendor_trace.sh`; index `?v=1.2.3`; demo PINNED guide / README
5. **Git** — commit this repo; push `origin/main`. Pin-only commit in `the sample host` if vendored.

## 4. Verification & Rollback
- **Tests**: `npm test`; CDN HTTP 200 on versioned URL; vendored JS contains `1.2.3` and `tt-copy-id`; index src `/static/zeus_client_chat_trace.js?v=1.2.3`
- **Review Checklist**:
  - [x] Tests pass (`npm test` 115 passed)
  - [x] No embed API break
  - [x] Feature guide created or updated in `.grok/guides/EMBEDDABLE_TRACE_WIDGET.md`
- **Rollback Plan**: hosts pin previous versioned CDN URL (`1.2.2`); revert demo static + script tag.

## 5. Open Questions / Decisions Needed
- None — patch bump required because 1.2.2 is already on CDN without the Turn traces UI detail fix.
