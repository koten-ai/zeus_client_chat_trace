# Plan: Debug Query Kill Switch

**Date**: 2026-08-04
**Task**: Show the chat trace widget only when enabled via `?debug=true` or explicit config.  
**Priority**: High  
**Estimated Effort**: 1 hour / 4 steps

## 1. Context & Requirements
- **Goal**: Widget UI is hidden by default; appears when the host page URL has `debug=true` (or host sets `enabled: true`).
- **Constraints**: Single-script embed, Shadow DOM bootstrap, no-op host APIs when disabled, backward-compatible API surface (`appendTraceCard` / `openDebugPanel` still exist).
- **Assumptions**: Page reload is required after changing the query string; hosts that always want the panel set `ZeusTraceConfig.enabled = true`.
- **Out of Scope**: Runtime toggle UI without reload; gating script download on the host (optional later).

## 2. Analysis & Research
- Key files explored: `src/bootstrap.js`, `src/config.js`, `src/config.test.js`, `examples/embed.html`, `demo_yelp/frontend/src/lib/trace.ts`
- Potential risks/edge cases:
  - Silent no-op looks broken → document kill switch + expose `config.enabled`
  - Exact `toEqual` config tests break → update expectations
  - Local embed demo without `?debug=` → set `enabled: true` in demo config
- Alternatives considered: Host-only gate in demo_yelp (weaker; every host reimplements) vs widget-owned (chosen).

## 3. Step-by-Step Implementation Plan
1. **Config: parse enabled + debug query**  
   - Files: `src/config.js`, `src/config.test.js`
   - Changes: `parseBoolFlag`, `readDebugQueryParam`, `resolveEnabled`; include `enabled` on resolve/public config
   - Tests: truthy/falsy debug, explicit override, default false

2. **Bootstrap: skip mount when disabled**  
   - Files: `src/bootstrap.js`
   - Changes: resolve config first; if `!enabled`, install no-ops, resolve `ready`, do not create host DOM

3. **Docs + demo + version**  
   - Files: `examples/embed.html`, `README.md`, `.grok/guides/*`, `package.json`

4. **Verify + vendor**  
   - Commands: `npm test`, `npm run build`, sync skill

## 4. Verification & Rollback
- **Tests**: unit tests for enabled resolution; full suite green; manual `?debug=true` on demo
- **Review Checklist**:
  - [ ] Code style/linting passes
  - [ ] No breaking host API names (only default visibility changes)
  - [ ] Feature guide created or updated
- **Rollback Plan**: revert commit / set default `enabled` true

## 5. Open Questions / Decisions Needed
- Default is **off** unless `debug=true` or `enabled: true` (intentional product kill switch).
