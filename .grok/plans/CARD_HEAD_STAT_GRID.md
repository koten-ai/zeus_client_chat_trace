# Plan: Card Head Stat Grid

**Date**: 2026-08-04
**Task**: Add Detective-style KPI mini grid under `div.trace-card-head` with inject + turn stats  
**Priority**: Medium  
**Estimated Effort**: 1–2 hours

## 1. Context & Requirements
- **Goal**: Under each trace card head, show a 2-col mini grid: MINI-SCHEMA, SCOPE BRIEF, LLM Rounds, Tool Calls, Avg / round, Edges.
- **Constraints**: Vanilla JS widget; DaisyUI/shadow CSS; no new host API; graceful missing data.
- **Assumptions**: Agent traces from kotenai-zeus-client include `trace.catalog` with flags + system_message; `rounds`/`tool_calls`/`total_ms` already present.
- **Out of Scope**: Full Detective tabs; Hub hydrate; TTFT/AI%/API% tiles from the screenshot labels.

## 2. Analysis & Research
- Key files: `src/trace.js`, `src/widget.css`, `src/trace.test.js`, guide `EMBEDDABLE_TRACE_WIDGET.md`
- Hub parity: `.kpi-mini` tiles in Detective (`debug_view.go`); edges via `edges_total:` parse on SCOPE BRIEF text
- Risks:
  - Missing `catalog` on fast-tier → Yes/No false + Edges `—`
  - Zero rounds → Avg `—`

## 3. Step-by-Step Implementation Plan
1. **Extract + render helpers in `trace.js`**
2. **CSS `.tc-kpi-mini` under card head**
3. **Tests for full/missing catalog**
4. **Guide update + test/build**

## 4. Verification & Rollback
- **Tests**: `npm test` — 60 passed including head KPI cases
- **Review Checklist**:
  - [x] Code style/linting passes
  - [x] No breaking changes
  - [x] Feature guide updated in `.grok/guides/EMBEDDABLE_TRACE_WIDGET.md`
- **Rollback Plan**: Revert `trace.js` / `widget.css` / tests / guide / package 0.1.5

## 5. Open Questions / Decisions Needed
- None — shipped Avg / round in seconds; Edges from brief parse.

