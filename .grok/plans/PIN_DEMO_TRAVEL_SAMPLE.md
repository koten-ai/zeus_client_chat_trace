# Plan: Pin Widget 1.2.0 into demo_travel_sample

**Date**: 2026-09-02
**Status**: Superseded by `.grok/plans/PUBLISH_CDN_1_2_3.md` (current pin **1.2.3**)
**Task**: Vendor the DaisyUI Detective IA widget (`zeus_client_chat_trace@1.2.0`) into sibling TravelPlan so the demo does not follow CDN `latest`.
**Priority**: High
**Estimated Effort**: 0.5 hours / 4 steps

## 1. Context & Requirements
- **Goal**: TravelPlan serves this repo’s **1.2.0** inspector from `/static/zeus_client_chat_trace.js?v=1.2.0`. Footer reports `v1.2.0`. Index does **not** load CDN `latest`.
- **Constraints**: Do not require CDN publish. Keep embed API (`appendTraceCard` / `?debug=true`). Public JS API unchanged from 1.1.1.
- **Assumptions**: `../demo_travel_sample` exists beside this repo. Style restyle is complete (`.grok/plans/WIDGET_STYLE_HTML_CSS.md`).
- **Out of Scope**: Publishing Spaces, changing TravelPlan BFF / `appendTraceCard` contract.

## 2. Analysis & Research
- Key files explored:
  - `package.json` (was 1.1.1; STYLE plan called for **1.2.0** at ship)
  - `../demo_travel_sample/scripts/vendor_trace.sh`
  - `../demo_travel_sample/src/travel_planner/templates/index.html` (currently CDN `latest` despite docs)
  - `../demo_travel_sample/.grok/guides/PINNED_TRACE_WIDGET.md` (still 1.0.0)
- Potential risks/edge cases:
  - Pinning as 1.1.1 would collide with the already-published dark inspector → Mitigation: bump to **1.2.0**
  - Index still on CDN `latest` would ignore the vendor copy → Mitigation: script src `/static/…?v=1.2.0`
  - Browser cache of old `/static/` file → Mitigation: query pin
- Alternatives considered: Keep package 1.1.1 and only copy dist — rejected (footer/version collision).

## 3. Step-by-Step Implementation Plan
1. **Bump widget to 1.2.0**
   - Files to change: `package.json`, `package-lock.json`, widget README / guides
   - Changes: version `1.2.0`
   - Commands to run: `npm version 1.2.0 --no-git-tag-version` (or edit JSON)
   - Tests needed: [ ] `npm test` still green

2. **Build + copy**
   - Files to change: `../demo_travel_sample/src/travel_planner/static/zeus_client_chat_trace.js`, `.map`
   - Changes: rebuild sibling dist; copy via vendor script
   - Commands to run: `../demo_travel_sample/scripts/vendor_trace.sh`
   - Tests needed: [ ] vendored file contains `1.2.0` and `data-tab="overview"`

3. **Demo HTML pin**
   - Files to change: `../demo_travel_sample/src/travel_planner/templates/index.html`
   - Changes: `/static/zeus_client_chat_trace.js?v=1.2.0` (drop CDN latest)
   - Tests needed: [ ]

4. **Docs**
   - Files to change: this repo README + EMBEDDABLE / V1 guides; demo README, `PINNED_TRACE_WIDGET.md`, `TRAVEL_PLANNER.md`
   - Changes: pin version 1.2.0; how to re-vendor
   - Tests needed: [ ]

## 4. Verification & Rollback
- **Tests**:
  - `npm test` in this repo
  - vendored JS embeds version `1.2.0`, DaisyUI pin URL, `data-tab="overview"`
  - index script is `/static/zeus_client_chat_trace.js?v=1.2.0`
- **Review Checklist**:
  - [x] Code style/linting passes
  - [x] No breaking changes to embed API
  - [x] Feature guide created or updated in `.grok/guides/EMBEDDABLE_TRACE_WIDGET.md` and demo `PINNED_TRACE_WIDGET.md`
- **Rollback Plan**: revert `package.json` version, demo static JS, and `index.html` script tag.

## 5. Open Questions / Decisions Needed
- None — 1.2.0 was decided in `WIDGET_STYLE_HTML_CSS.md` for this visual ship.
