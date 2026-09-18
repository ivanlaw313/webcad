# V128 FIX PLAN — Shell OCCT after cut+fillet (BX02 cavity)

**Ship:** APP_VERSION **1.28** · Grok直改 · NO CloudAgent  
**Date:** 2026-09-18  
**Base:** LIVE v1.27 (PR #57) — BX02 cut+fillet+shell functionally PASS but soft-falls to cavity

## Symptom
Status: `抽壳完成（备用：开口面偏移型腔）` after classic BX02: bodyboolean cut → Fillet R1 → Shell t=1.5.

## Root cause (verified)
Inward `BRepOffsetAPI_MakeThickSolid.MakeThickSolidByJoin` with default flags  
`Intersection=false, SelfInter=false, RemoveIntEdges=false` **fails when wall thickness ≥ local fillet radius**.

Kernel sweep (R1 rim fillet):
- t ∈ {0.3 … 0.99} → OCCT clean  
- t ≥ 1.0 (= fillet R) → cavity soft fallback  

Control cut-without-fillet at t=1.5 stays OCCT. Outside direction also OCCT (no concave self-intersection).

Prior v1.19–v1.24 attempts (heal / Unify / sew / copy-heal / planarSameZ / alt lids / wider tol) help dirty topology but **do not** enable the Intersection calculation that resolves offset self-intersection at the filleted rim.

## Fix
1. In `_shellExactFaces`, keep the existing join×tol ladder on the **default** flag combo first (CX02/byte-compat).
2. **v1.28:** also try flag combos:
   - `{ intersection: true, selfInter: false, removeInt: false }`
   - `{ intersection: true, selfInter: false, removeInt: true }`
3. Keep cavity/prismatic as last resort (do not remove).
4. Hard contract: `tests/grok-qa-v1.28-shell-occt-after-fillet.test.mjs` — BX02 cut+fillet+shell top/bottom **must not** emit cavity soft marker.
5. Bump `APP_VERSION` → `1.28`; PR → merge → SSH deploy stamp `v1.28-YYYYMMDD-HHMMSS`; verify nginx root.

## Acceptance
- [x] Root cause documented (t ≥ fillet R + Intersection=false)
- [x] BX02-like cut→fillet→shell prefers OCCT without 「备用」
- [x] Control no-fillet still OCCT
- [x] Cavity path retained as last resort
- [x] APP_VERSION 1.28 live + nginx root verified
