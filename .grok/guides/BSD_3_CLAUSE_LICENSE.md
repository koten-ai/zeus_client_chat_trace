# Guide: BSD 3-Clause License

**Date**: 2026-09-30
**Feature**: This repository is licensed under the BSD 3-Clause License (SPDX `BSD-3-Clause`).
**Status**: Active
**Related Plan**: `.grok/plans/BSD_3_CLAUSE_LICENSE.md`

## 1. Overview
- **Purpose**: State the terms under which `zeus_client_chat_trace` may be used, copied, and redistributed.
- **Scope**: Project source and the files shipped with this repository. Third-party packages under `node_modules` keep their own licenses. The built widget in `dist/` does not embed the license banner; ship `LICENSE` with any binary redistribution.
- **Entry points**: [`LICENSE`](../../LICENSE), `package.json` `license` field, README License section.

## 2. Architecture & Flow
- **High-level flow**:
  1. `LICENSE` holds the full BSD 3-Clause text.
  2. `package.json` and the root entry of `package-lock.json` declare SPDX `BSD-3-Clause`.
  3. The README points readers at `LICENSE`.
- **Key components**:
  - `LICENSE` — full license text and copyright notice
  - `package.json` — SPDX identifier consumed by npm
  - `README.md` — short License section
- **Data flow**: None. This is repository metadata.
- **Dependencies**: None. Copyright holder is Koten AI, year 2026.

## 3. Setup
- **Prerequisites**: None.
- **Environment variables**: None.
- **Install / bootstrap steps**:
  1. No install step. The license applies as soon as the files are in the tree.
- **Configuration**: `"license": "BSD-3-Clause"` in `package.json`. The package remains `"private": true`.
- **Verification**: `npm pkg get license` prints `"BSD-3-Clause"`.

## 4. How to Use
- **Primary workflow**:
  1. Read `LICENSE` before redistributing the widget.
  2. Keep the copyright notice, the three conditions, and the disclaimer with source redistributions.
  3. Include that same notice in documentation or other materials shipped with a binary build such as `dist/zeus_client_chat_trace.js`.
- **Examples**: `npm pkg get license`
- **Edge cases**: Dependency licenses (MIT, Apache-2.0, ISC, BSD-3-Clause, BlueOak-1.0.0) apply only to those packages.
- **Limitations**: Clause 3 bars using the name "Koten AI" or contributor names to endorse derived products without prior written permission.

## 5. Debugging & Known Issues
- **Common symptoms → causes → fixes**:
  | Symptom | Likely Cause | Fix |
  |---------|--------------|-----|
  | GitHub shows no license | `LICENSE` not pushed, or the filename is not `LICENSE` | Commit and push `LICENSE` at the repository root |
  | `npm pkg get license` is empty | `license` missing from `package.json` | Set `"license": "BSD-3-Clause"` |
- **Debug checklist**:
  - [ ] `LICENSE` exists at the repository root
  - [ ] `package.json` `license` is `BSD-3-Clause`
  - [ ] README License section links to `LICENSE`
- **Known issues**:
  - **Bundle has no license banner** — CDN or `dist/` copies of the script do not include the notice inside the file. Distribute `LICENSE` alongside the script.
- **Logging & observability**: Not applicable.

## 6. Related Artifacts
- **Files changed / owned by this feature**:
  - `LICENSE` — BSD 3-Clause text, Copyright (c) 2026, Koten AI
  - `package.json` — SPDX `BSD-3-Clause`
  - `package-lock.json` — root package `license`
  - `README.md` — License section
- **Tickets**:
  - None
- **Commits**:
  - Not committed in this change
- **Pull requests** (if applicable):
  - None

## 7. Changelog
| Date | Author | Change |
|------|--------|--------|
| 2026-09-30 | Grok | Initial BSD 3-Clause license for the repository |
