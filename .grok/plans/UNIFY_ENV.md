# Plan: One .env for widget build and CDN publish

**Date**: 2026-09-30
**Task**: Stop using a separate Spaces env file and read CDN credentials from `.env`.
**Priority**: Medium
**Estimated Effort**: 1 step

## 1. Context & Requirements
- **Goal**: `.env.example` lists widget and CDN variables. `npm run publish:cdn` reads `.env`. The widget bundle still inlines only the three Zeus build keys.
- **Constraints**: Do not commit filled secrets. Do not bake `DO_SPACES_*` into `dist/`.
- **Assumptions**: A local `.secrets/spaces-static.env` may hold the current CDN values and should be merged into the gitignored `.env`.
- **Out of Scope**: Changing the generated `.secrets/cdn-urls.env` pointer written after a successful upload.

## 2. Analysis & Research
- Key files explored: `esbuild.config.mjs`, `scripts/upload_dist_cdn.sh`, `.env.example`, `README.md`
- Potential risks/edge cases:
  - CDN secrets copied into the bundle → esbuild defines only `ZEUS_API_URL`, `ZEUS_AUTH_TOKEN`, `HUB_BASE_URL`
  - Shell and file disagree → a non-empty shell export wins
- Alternatives considered: Keep both files and have the script read them in order. Rejected; one file was requested.

## 3. Step-by-Step Implementation Plan
1. **Point publish at .env**
   - Files to change: `scripts/upload_dist_cdn.sh`, `.env.example`, `README.md`, guides
   - Changes: Parse `.env` without overriding non-empty exports. Remove `scripts/spaces-static.env.example`. Merge local Spaces values into `.env`.
   - Commands to run: `bash -n scripts/upload_dist_cdn.sh`; a dotenv parser check with dummy values
   - Tests needed: parser keeps shell overrides and strips quotes

## 4. Verification & Rollback
- **Tests**: `bash -n`; dummy dotenv load prints only key names and match flags
- **Review Checklist**:
  - [x] Code style/linting passes
  - [x] No breaking changes to the widget bundle inputs
  - [x] Feature guide updated in `.grok/guides/PUBLIC_REPO_REDACTION.md`
- **Rollback Plan**: Restore the script’s `.secrets/spaces-static.env` load and the example file from git.

## 5. Open Questions / Decisions Needed
- None.
