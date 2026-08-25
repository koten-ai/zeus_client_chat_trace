# Plan: Publish click-to-copy fix to CDN

**Date**: 2026-08-25
**Task**: Ship widget 1.0.1 (click-to-copy) to DigitalOcean Spaces CDN as versioned + latest.
**Priority**: High
**Estimated Effort**: 0.5 hours / 3 steps

## 1. Context & Requirements
- **Goal**: Public CDN serves the click-to-copy fix. Versioned URL is new (`1.0.1`); `latest` pointer is updated and purged.
- **Constraints**: `1.0.0` is already published with `Cache-Control: public, max-age=31536000, immutable`. Do not overwrite that key as the only ship path.
- **Assumptions**: `.secrets/spaces-static.env` has `DO_SPACES_KEY` / `DO_SPACES_SECRET`. Production build is minified (`npm run build`), not the playground watch bundle.
- **Out of Scope**: Git tag/release, vendoring into `demo_travel_sample`, npm registry.

## 2. Analysis & Research
- Key files explored: `scripts/upload_dist_cdn.sh`, `package.json`, `.secrets/cdn-urls.env` (currently `TRACE_CDN_VERSION=1.0.0`)
- Potential risks/edge cases:
  - Playground `esbuild --watch` writes unminified `dist/` → Mitigation: stop watch, then `npm run build`
  - CDN `latest` still stale after overwrite → Mitigation: script purges `latest/*` when `DIGITALOCEAN_TOKEN` is present
- Alternatives considered: Re-upload 1.0.0 (rejected: immutable cache) vs patch bump (this plan).

## 3. Step-by-Step Implementation Plan
1. **Version + production build**
   - Files to change: `package.json` (`1.0.1`)
   - Commands: `npm run build`; `npm test`
   - Tests needed: [x]

2. **Upload**
   - Commands: `npm run publish:cdn`
   - Tests needed: [ ] probe HTTP 200 on versioned + latest CDN URLs

3. **Record URLs**
   - Files: `.grok/guides/CLICK_TO_COPY.md` changelog; `.secrets/cdn-urls.env` (script)

## 4. Verification & Rollback
- **Tests**: `npm test` (86 passed); CDN probe HTTP 200 on `…/1.0.1/…` and `…/latest/…`
- **Review Checklist**:
  - [x] Code style/linting passes
  - [x] No breaking changes
  - [x] Feature guide created or updated in `.grok/guides/CLICK_TO_COPY.md`
- **Rollback Plan**: hosts pin `…/1.0.0/zeus_client_chat_trace.js`; re-upload previous `latest` from a 1.0.0 artifact if needed

## 5. Open Questions / Decisions Needed
- None — patch bump is required because 1.0.0 is immutable on CDN.
