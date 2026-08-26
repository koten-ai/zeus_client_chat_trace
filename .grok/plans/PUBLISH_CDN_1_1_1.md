# Plan: Publish Hub-redirect fix to CDN as 1.1.1

**Date**: 2026-08-26
**Task**: Ship widget 1.1.1 (Hub/Detective links use config `hubBaseUrl`) to DigitalOcean Spaces CDN as versioned + latest, then commit.
**Priority**: High
**Estimated Effort**: 0.5 hours / 4 steps

## 1. Context & Requirements
- **Goal**: Public CDN serves the Hub-origin fix. Versioned URL is new (`1.1.1`); `latest` pointer is updated and purged. Git commit records the change.
- **Constraints**: `1.1.0` is already published with `Cache-Control: public, max-age=31536000, immutable`. Do not treat overwriting `1.1.0/` as the ship path.
- **Assumptions**: `.secrets/spaces-static.env` has `DO_SPACES_KEY` / `DO_SPACES_SECRET`. Production build is minified (`npm run build`).
- **Out of Scope**: Vendoring into `demo_travel_sample`; git tag; npm registry.

## 2. Analysis & Research
- Key files: `package.json` (1.1.0), `scripts/upload_dist_cdn.sh`, `.secrets/cdn-urls.env` (`TRACE_CDN_VERSION=1.1.0`)
- Potential risks/edge cases:
  - Watch/unminified `dist/` → Mitigation: fresh `npm run build` before publish
  - CDN `latest` stale → Mitigation: script purges `latest/*` when token is present
- Alternatives considered: Re-upload 1.1.0 (rejected: immutable cache) vs patch bump (this plan).

## 3. Step-by-Step Implementation Plan
1. **Bump to 1.1.1** — `package.json`, lockfile root, README, guides
2. **Build + test** — `npm test`; `npm run build`; confirm `1.1.1` in `dist/`
3. **Upload** — `npm run publish:cdn`; probe `…/1.1.1/…` and `latest`
4. **Commit** — include Hub-redirect source + version bump (not `.secrets/` / `dist/`)

## 4. Verification & Rollback
- **Tests**: `npm test`; CDN probe HTTP 200 on versioned + latest
- **Review Checklist**:
  - [x] Code style/linting passes
  - [x] No breaking changes
  - [x] Feature guide created or updated in `.grok/guides/EMBEDDABLE_TRACE_WIDGET.md`
- **Rollback Plan**: hosts pin `…/1.1.0/zeus_client_chat_trace.js`; restore previous `latest` from the 1.1.0 artifact if needed

## 5. Open Questions / Decisions Needed
- None — patch bump required because 1.1.0 is immutable on CDN.
