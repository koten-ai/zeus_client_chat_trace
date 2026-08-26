# Plan: Hub Redirects Use Config Base URL

**Date**: 2026-08-26
**Task**: Make every Detective / Hub “open in new tab” control use `hubBaseUrl` from config, not a mangled or snapshot origin.
**Priority**: High
**Estimated Effort**: 1.5 hours / 5 steps

## 1. Context & Requirements
- **Goal**: Session, request, Detective ↗, and “Open in Hub” links/buttons open `{hubBaseUrl}` from `ZeusTraceConfig` / `data-hub-base-url` (optional `.env` `HUB_BASE_URL` fallback).
- **Constraints**: Embeddable widget; Hub origin is not `zeusApiUrl`; keep existing Detective path shapes (`/hub/debug/session/{id}`, `/hub/#/debug/req/{id}`).
- **Assumptions**: Hosts set `hubBaseUrl` (or `hub_url`) before or after mount; demo pages may still pass an explicit sample origin.
- **Out of Scope**: Changing Hub SPA routes; deriving Hub from `zeusApiUrl`.

## 2. Analysis & Research
- Key files explored: `src/config.js`, `src/helpers.js` (`normalizeHubBase`), `src/panel.js`, `src/trace.js`, `dev/index.html`, `examples/embed.html`, `.env` / `.env.example`
- Potential risks/edge cases:
  - `normalizeHubBase` treats `/hub` as a string suffix, so `http://hub` becomes `http:` → Mitigation: strip `/hub` only as a URL path.
  - Panel snapshots `config.hubBaseUrl` at init → Mitigation: re-resolve on each open.
  - Empty hub must not invent an origin → Mitigation: hide/disable / toast; no hardcoded fallback.
- Alternatives considered: Bake only playground HTML origins — rejected; widget must honor live config for all hosts.

## 3. Step-by-Step Implementation Plan
1. **URL builders in `config.js`**
   - Files: `src/config.js`, `src/helpers.js`, `src/config.test.js`
   - Changes: Move/share `normalizeHubBase`, `hubDebugReqUrl`, `hubDebugSessionUrl`; `detectiveUrl` aliases session builder; optional `__HUB_BASE_URL__` fallback.
   - Tests: hostname `http://hub` preserved; workbench `/hub/#/workbench` stripped to origin.

2. **Live hub base**
   - Files: `src/trace.js`, `src/config.js`
   - Changes: `getHubBase` uses `resolveConfig()` then init snapshot; accept `hub_url` alias.

3. **Panel redirects**
   - Files: `src/panel.js`
   - Changes: Keep all open/href paths on `hubDebug*`; toast mentions `ZeusTraceConfig.hubBaseUrl`.

4. **Tests**
   - Files: `src/trace.test.js`, `src/config.test.js`
   - Commands: `npm test`

5. **Docs**
   - Files: `.grok/guides/EMBEDDABLE_TRACE_WIDGET.md`, `README.md`, `.env.example`

## 4. Verification & Rollback
- **Tests**: `npm test`; click Detective / Hub session / Open in Hub with two different `hubBaseUrl` values.
- **Review Checklist**:
  - [x] Code style/linting passes
  - [x] No breaking changes
  - [x] Feature guide created or updated in `.grok/guides/EMBEDDABLE_TRACE_WIDGET.md`
- **Rollback Plan**: Revert the commit; restore previous `normalizeHubBase` string replace.

## 5. Open Questions / Decisions Needed
- None — runtime `ZeusTraceConfig.hubBaseUrl` remains the source of truth.

---
