# Plan: Raw Tab JSON Font

**Date**: 2026-08-25
**Task**: Make the Raw tab JSON viewer use the same type as the rest of the inspector (11px `--tt-mono`, like Hops/LLM `<pre>` dumps).
**Priority**: Medium
**Estimated Effort**: 0.5 hours / 3 steps

## 1. Context & Requirements
- **Goal**: `.trace-dump-viewer` / jsnview `.jsv` / fallback `.trace-pre` render with `font: 11px/1.4 var(--tt-mono)` and inspector colors, not inherited Inter/`medium` or jsnview Tailwind `text-sm` / `bg-white`.
- **Constraints**: Shadow DOM (host Tailwind does not apply). Keep jsnview CDN. No DaisyUI.
- **Assumptions**: Other JSON surfaces (`.io-card pre`) are the visual match.
- **Out of Scope**: Replacing jsnview, changing Raw payload shape.

## 2. Analysis & Research
- Key files explored: `src/widget.css`, `src/helpers.js` (`mountJsnviewViewer`), `src/panel.js` (`renderRaw`), jsnview@3.0.0 (Tailwind class names, no bundled CSS)
- Potential risks/edge cases:
  - jsnview root classes `text-sm p-4 bg-white` are inert in shadow → inherit 16px Inter → Mitigation: explicit font on `.trace-dump-viewer` and `.jsv`
  - Fallback `<pre class="trace-pre">` had no CSS → Mitigation: same stack as `.io-card pre`
- Alternatives considered: Switch Raw to `<pre>` only (loses tree) vs restyle jsnview (this plan).

## 3. Step-by-Step Implementation Plan
1. **CSS** — `src/widget.css`: font + neutralize jsv chrome; dark-readable key/value colors
2. **Test** — `src/widget.css.test.js` asserts `--tt-mono` on dump viewer
3. **Docs + pin** — V1 guide changelog; re-vendor TravelPlan static

## 4. Verification & Rollback
- **Tests**: `npm test` (63 passed, including `--tt-mono` on `.trace-dump-viewer`)
- **Review Checklist**:
  - [x] No breaking changes
  - [x] Feature guide updated in `.grok/guides/V1_INSPECTOR.md`
- **Rollback Plan**: revert `src/widget.css` dump-viewer rules

## 5. Open Questions / Decisions Needed
- None — match `.io-card pre`.
