# V124 FIX PLAN — Shell soft bilingual + bake primary action

**Ship:** APP_VERSION **1.24** · Grok直改 · NO CloudAgent  
**Date:** 2026-09-14

## Context (V123)

- BX02 Shell still often soft-falls to cavity/prismatic; EN status mangled to `抽殼done (备用rebuild…)` because short i18n fragments (`完成`→`done`, `重建`→`rebuild`) rewrite substrings.
- Component Boolean bake is a blocking `appConfirm` only — testers want a clearer **primary status/button** path (fewer forced steps).
- Fillet on mesh after boolean already has guided text; optional one-click if we add a status action hook.

## P0 — Shell soft status EN/ZH unify (must ship)

1. Rewrite `_shellCavityStatus` + alternate-opening warning to **full phrases** that have complete i18n entries (long-match first → no mixed `done`/`rebuild`).
2. Prefer simplified `抽壳` consistently in soft strings.

## P1 — One more OCCT path before cavity (stretch; soft OK)

- Before cavity/prismatic: try **coplanar same-Z planar seed set** (`planarSameZ`) via `tryBases` (this was after cavity in v1.23; move up — not G1 chain, so CX02-safe).
- Do **not** move G1 tangent chain before cavity (CX02 swallows filleted hole).
- Soft cavity wording stays if OCCT still misses.

## P0 — Component Boolean bake primary path

1. Add optional `statusAction: { id, label, run }` (or commandId) on store.
2. After successful `componentBoolean`: **do not block** on confirm; set status + primary button **「烘焙为零件实体」** that runs `convertMeshComponent` (+ `editComponent` if needed).
3. Keep MeshFit/实体布尔 tip in status text for discoverability.
4. PromptDialog: optional custom `okLabel`/`cancelLabel` unused if we drop modal — prefer status button.

## P2 — Fillet blocked → one-click MeshFit (nice)

- When `partSolidRequiredStatus` fires with mesh comps, set `statusAction` → `meshfit` / convert selected.

## Process

1. Plan (this file)  
2. Implement + `tests/grok-qa-v1.24-*.mjs`  
3. `APP_VERSION = '1.24'`  
4. PR → merge → deploy → `DEPLOY-RESULT-v1.24.md` + brief FINAL  
5. Copy docs to `/workspace/webcad-qa/out/`

## Acceptance

- [x] Soft Shell warnings have clean EN via full-phrase i18n (no `抽殼done`)
- [x] planarSameZ OCCT attempted before cavity; prior copy-heal/alt lids preserved
- [x] Post-boolean: status + primary bake button (no required modal)
- [x] Fillet/Shell dead-end can show MeshFit statusAction when mesh present
- [x] APP_VERSION 1.24; deploy recorded
