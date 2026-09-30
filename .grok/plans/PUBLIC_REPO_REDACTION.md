# Plan: Remove sensitive data before a public repo

**Date**: 2026-09-30
**Task**: Strip production infrastructure identifiers, tracker links, and private repository paths from tracked files.
**Priority**: High
**Estimated Effort**: 1 step

## 1. Context & Requirements
- **Goal**: A public clone does not contain production object-storage coordinates, a sibling credentials path, the lab hostname, Atlassian URLs, or private checkout paths.
- **Constraints**: Keep the publish script working when bucket, region, and keys are supplied from the environment or `.secrets/`. Do not delete local credential files. Do not rewrite git history.
- **Assumptions**: Local `.env` sets bucket and region, so removing hardcoded defaults does not break an operator who uses that file.
- **Out of Scope**: Rewriting author emails in git history. Removing the trace-field denylist in `src/normalize.js` (that code is what keeps those fields out of the panel).

## 2. Analysis & Research
- Key files explored: `README.md`, `scripts/upload_dist_cdn.sh`, `scripts/spaces-static.env.example`, `.gitignore`, `src/config.test.js`, `.grok/guides/`, `.grok/plans/`
- Potential risks/edge cases:
  - Publish script fails closed without bucket/region → operators set them in `.env`
  - A filled `spaces-static.env` outside `.secrets/` could be committed → gitignore that filename everywhere
- Alternatives considered: Deleting `.grok/` entirely. Rejected; the notes stay, with identifiers replaced.

## 3. Step-by-Step Implementation Plan
1. **Redact tracked files**
   - Files to change: README, upload script, env example, gitignore, tests, source comments, `.grok/` guides and plans
   - Changes: Placeholders for CDN URLs; require bucket and region from the environment; drop the sibling env load; replace the lab hostname with `hub.example`; drop tracker URLs; drop private repo path prefixes
   - Commands to run: `bash -n scripts/upload_dist_cdn.sh`; `npx vitest run src/config.test.js`
   - Tests needed: hub URL normalization still passes

## 4. Verification & Rollback
- **Tests**: `bash -n` on the upload script; `npx vitest run src/config.test.js`; search the tree for the removed identifiers
- **Review Checklist**:
  - [x] Code style/linting passes
  - [x] No breaking changes to the widget runtime
  - [x] Feature guide created or updated in `.grok/guides/PUBLIC_REPO_REDACTION.md`
- **Rollback Plan**: Restore the previous README, script, and docs from git.

## 5. Open Questions / Decisions Needed
- Git author emails remain in history until a history rewrite is requested.
