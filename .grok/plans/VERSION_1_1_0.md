# Plan: Version 1.1.0

**Date**: 2026-08-25
**Task**: Set package and CDN widget version to 1.1.0.
**Priority**: High
**Estimated Effort**: 0.3 hours / 3 steps

## 1. Context & Requirements
- **Goal**: `package.json`, baked `__WIDGET_VERSION__`, and CDN objects report **1.1.0**.
- **Constraints**: Versioned CDN keys are immutable; publish a new `1.1.0/` prefix and update `latest`. Do not rewrite npm dependency versions in the lockfile.
- **Assumptions**: User wants 1.1.0 instead of the 1.0.1 just shipped. Spaces credentials still valid.
- **Out of Scope**: Vendoring into `demo_travel_sample` (still pinned at 1.0.0). Git tag.

## 2. Analysis & Research
- Key files: `package.json`, `package-lock.json` (root), `README.md`, `esbuild.config.mjs` (`__WIDGET_VERSION__`), `scripts/upload_dist_cdn.sh`
- Risks: playground watch overwriting minified dist → run a fresh `npm run build` before publish
- Alternatives: local version only vs also CDN (this plan does both)

## 3. Step-by-Step Implementation Plan
1. **Bump version strings** — `package.json`, lockfile root, README, copy/CDN guides
2. **Build + test** — `npm run build`; `npm test`; confirm `1.1.0` in `dist/`
3. **CDN** — `npm run publish:cdn`; probe `…/1.1.0/…` and `latest`

## 4. Verification & Rollback
- **Tests**: `npm test` (86 passed); CDN probe HTTP 200 on `…/1.1.0/…` and `latest`
- **Review Checklist**:
  - [x] No breaking changes
  - [x] Guides updated
- **Rollback Plan**: hosts pin `…/1.0.1/…` or `…/1.0.0/…`

## 5. Open Questions / Decisions Needed
- None
