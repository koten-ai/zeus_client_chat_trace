# Plan: Turn picker dropdown (style guide 009)

**Date**: 2026-09-03
**Task**: Apply the latest `zeus_client` STYLE_HTML_CSS update: drop the left-pane turn rail and pick turns from a DaisyUI details dropdown above the tabs.
**Priority**: High
**Estimated Effort**: 2 hours / 5 steps

## 1. Context & Requirements
- **Goal**: Widget inspector matches sketch 009 / live `zeus_client` Traces: labelled `#tt-turn-dropdown` above Overview…Raw. No `nav.tt-turn-list`, `#tt-search`, or filter chips. Job mode relabels the picker **Unit**.
- **Constraints**: Shadow DOM + DaisyUI 4.12.10; keep overlay/docked chrome, public embed API, copy wiring, Detective IA tabs.
- **Assumptions**: Source is `zeus_client` commit `656d938` (`sketches/009-turn-dropdown/`, `templates/index.html` `#tt-turn-picker`, `static/trace_panel.js`).
- **Out of Scope**: Search/filter inside the dropdown (dropped with the rail). CDN publish. Chat split-pane CSS.

## 2. Analysis & Research
- Key files: `../zeus_client/.grok/guides/STYLE_HTML_CSS.md`, `../zeus_client/static/trace_panel.js`, `src/widget.html`, `src/widget.css`, `src/panel.js`, `src/style_guide.test.js`
- Risks:
  - Overlay `overflow: hidden` clips the menu → Mitigation: match sample `overflow-visible` on `.tt-detail`; absolute `.dropdown-content`; `z-20` on picker
  - Tests still expect `#tt-search` / 2-col `.tt-body` grid → Mitigation: rewrite chrome contract
- Alternatives considered: Keep rail on overlay-only — rejected (guide forbids left-pane rail).

## 3. Step-by-Step Implementation Plan
1. **Markup** — `src/widget.html`: single-column `#tt-body`; picker above tabs.
2. **CSS** — `src/widget.css`: trigger, chevron, dropdown panel, `[hidden]` on trigger children; drop 220px rail grid.
3. **JS** — `src/panel.js`: `syncTurnTrigger` / `closeTurnDropdown`; render all turns/units as `role="option"`; job label Unit.
4. **Tests + guide** — `src/style_guide.test.js`, `src/widget.css.test.js`; port anatomy into `.grok/guides/STYLE_HTML_CSS.md`.
5. **Verify** — `node --check`; `npm test`.

## 4. Verification & Rollback
- **Tests**: `npm test`; idle = no picker (body hidden); after a turn, dropdown above tabs; no `#tt-search`.
- **Follow-up**: menu hiding under tabs → `.grok/plans/TURN_DROPDOWN_ZINDEX.md`
- **Review Checklist**:
  - [x] `node --check` / `npm test`
  - [x] No breaking embed API
  - [x] Guide updated `.grok/guides/STYLE_HTML_CSS.md`
- **Rollback Plan**: revert widget.html / widget.css / panel.js / tests / guide.

## 5. Open Questions / Decisions Needed
- None.
