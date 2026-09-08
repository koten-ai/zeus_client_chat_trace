# Sketch: v1 overlay inspector

**Date**: 2026-08-21  
**Status**: Superseded — chrome spec is `.grok/guides/STYLE_HTML_CSS.md` (DaisyUI light Detective IA). Overlay shell (lightning toggle, close, footer) still applies.  
**Related Plan**: `.grok/plans/WIDGET_STYLE_HTML_CSS.md` (current); `.grok/plans/1_V1_INSPECTOR_REDESIGN.md` (v1 ingest)

## What this mocks (historical v1 IA)

Floating **Zeus Tracer** overlay (lightning toggle, bottom-left). **Do not** copy this sketch's dark DevTools tabs into production.

Current inspector tabs: Overview · Diagnosis · Prompt · Timeline · Tools · Session · Raw. Title: **Turn traces**. Visual spec: sibling `zeus_client/sketches/007-traces-detective/` and `008-traces-light/`.

Use the **state chips** (empty / healthy / failed / cache / Layer A / job) and **overlay / docked** toggle.

## Out of scope for the sketch

Live Zeus calls, jsnview, real clipboard. Production code ports `zeus_client/static/trace_panel.js`.
