# Sketch: v1 overlay inspector

**Date**: 2026-08-21  
**Status**: Locked visual source for `zeus_client_chat_trace@1.0.0`  
**Related Plan**: `.grok/plans/1_V1_INSPECTOR_REDESIGN.md`

## What this mocks

Floating **Zeus Tracer** overlay (lightning toggle, bottom-left) whose interior matches the shipped `zeus_client` Turn traces inspector:

- Header: title · turn count · client version · Export · Copy all · Detective ↗ · close
- Session bar: session_id · round · contract · preferred req · Hub · cache chip
- Turn list (filter/search) + detail (metrics, diagnosis strip, tabs)
- Tabs: Timeline · Hops · LLM I/O · Inject · Detective · Raw

Use the **state chips** (empty / healthy / failed / cache / Layer A / job) and **overlay / docked** toggle.

## Out of scope for the sketch

Live Zeus calls, jsnview, real clipboard. Production code ports `zeus_client/static/trace_panel.js`.
