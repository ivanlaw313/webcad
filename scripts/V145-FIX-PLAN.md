# V145 FIX PLAN — BUG-BD-4401 Create Form→Box plane pick soft-lock

**Ship:** APP_VERSION **1.45** · Grok direct · gh PR · SSH deploy  
**Date:** 2026-09-19 (HKT)  
**Base:** LIVE v1.44 (PR #89) — MESH chooser parity PASS; BOT-D FORM **FAIL** BUG-BD-4401

## Bug
BOT-D @ v1.44: Create Form → Box stuck on「Select a plane or planar face」; Finish Form requires Cancel to exit. MESH drag-drop PASS; ASSY Gear Pair PASS. FORM Box previously PASS on v1.43 — intermittent / fragile plane-pick UX (not proven MESH-caused).

## Root cause
Form Box interactive draft only advanced via fragile 3D datum clicks (80mm orange quads). After MESH fit-zoom the origin planes are hard to hit; Create Form dialog had **no** XY/XZ/YZ controls (unlike other Form primitives). `finishForm` hard-blocked while `formCreateKind` set → soft-lock until Cancel. Construction origin planes were pickable only in sketch `pickplane` mode, not during Form Box plane stage.

## Fix
1. Dialog **Plane** buttons XY/XZ/YZ → `placeFormBoxOnOriginPlane` (plane + center [0,0] → stage `ready`).
2. `commitFormBoxDraft` OK enabled when `plane` set; fills default center if needed.
3. `finishForm` auto-`cancelFormCreate` then exits if no cage (no Cancel-required soft-lock).
4. Origin construction planes pickable during `formBoxDraft.stage==='plane'`; larger RGB Form Box datums (160); camera frames origin on plane stage.
5. APP_VERSION 1.45 + contract `grok-qa-v1.45-form-box-plane`.

## Do not
- Regress MESH drag-drop / chooser parity from v1.41–1.44.
- Regress Shell CLEAN / DXF / component boolean Chinese / STL cancel.
