# V143 FIX PLAN — BUG-BD-4101 STL drop still no-op @1.42

**Ship:** APP_VERSION **1.43** · Grok direct · gh PR · SSH deploy  
**Date:** 2026-09-19 (HKT)  
**Base:** LIVE v1.42 (PR #85) — capture-phase on App/Viewport still FAIL for BOT-D

## Investigation
- Synthetic DragEvent + File on LIVE 1.42 **canvas works** → `acceptMeshDropFile` / insert dialog path is fine when File payload exists.
- BOT-D real drag still no-op with **no status** → either dragover never armed (drop cancelled) **or** drop with empty FileList → silent `if (!file) return`.
- Hypothesis incomplete: canvas swallow alone; need document-level + overlay + items fallback + visible empty-drop status.

## Fix
1. `filesFromDataTransfer` / `resolveMeshDropFromDataTransfer` (items.getAsFile fallback)
2. Broader `shouldAllowMeshDragOver` (uri-list, plain-only, application/*)
3. `meshDropHost` singleton: document/window capture + overlay arming
4. Viewport overlay above canvas (`data-mesh-drop-overlay`) while armed
5. Chinese status on empty drop / while armed — never silent
6. APP_VERSION 1.43 + contract `grok-qa-v1.43-stl-drop-overlay`
