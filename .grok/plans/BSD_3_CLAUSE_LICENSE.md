# Plan: Add BSD 3-Clause License

**Date**: 2026-09-30
**Task**: Put the project under the BSD 3-Clause License, matching other Koten client repositories.
**Priority**: Medium
**Estimated Effort**: 1 step

## 1. Context & Requirements
- **Goal**: The repository declares BSD-3-Clause in `LICENSE`, `package.json`, `package-lock.json`, and the README.
- **Constraints**: SPDX identifier `BSD-3-Clause`. Copyright notice is `Copyright (c) 2026, Koten AI`.
- **Assumptions**: Koten AI is the copyright holder. The package stays `"private": true`.
- **Out of Scope**: Publishing to npm, rebuilding `dist/`, CDN upload, per-file SPDX headers.

## 2. Analysis & Research
- Key files explored: `package.json`, `package-lock.json`, `README.md`, `LICENSE`
- Potential risks/edge cases:
  - Wrong copyright holder → use the same line as the Python client
  - Lockfile drift → set `license` on the root package entry only
- Alternatives considered: BUSL-1.1 (used by Zeus Client Go) was not requested. BSD 3-Clause was requested and is already the client-repo default.

## 3. Step-by-Step Implementation Plan
1. **Declare the license**
   - Files to change: `LICENSE`, `package.json`, `package-lock.json`, `README.md`
   - Changes: Add the BSD 3-Clause text; set `"license": "BSD-3-Clause"`; add a README License section
   - Commands to run: none
   - Tests needed: confirm `npm pkg get license` prints `BSD-3-Clause`

## 4. Verification & Rollback
- **Tests**: `npm pkg get license`; `LICENSE` matches the Python client text
- **Review Checklist**:
  - [x] Code style/linting passes
  - [x] No breaking changes
  - [x] Feature guide created or updated in `.grok/guides/BSD_3_CLAUSE_LICENSE.md`
- **Rollback Plan**: Delete `LICENSE` and revert the three metadata edits.

## 5. Open Questions / Decisions Needed
- None. Copyright year is 2026, the year of the first commit and of the sibling licenses.
