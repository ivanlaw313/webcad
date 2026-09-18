# V129 FIX PLAN — Shell OCCT after fuse+outer-fillet

**Ship:** APP_VERSION **1.29** · Grok direct · NO CloudAgent  
**Date:** 2026-09-18 (HKT)  
**Base:** LIVE v1.28 (PR #58) — BX02 cut+fillet+shell OCCT-clean; residual fuse+outer-fillet soft cavity

## Symptom
Status: `抽壳完成（备用：开口面偏移型腔）` after fuse → outer fillet R → shell with thickness **exactly equal** to fillet radius (classic soft case from v1.19: fuse+R2+shell t=2).

## Root cause (verified)
1. **Discarded:** “Intersection=false only” — already fixed in v1.28; fuse+outer still cavities at t===R with Intersection=true.
2. **Discarded:** SelfInter flags — probe with SelfInter=true still cavities at t===R (~38s ladder then cavity).
3. **Verified:** When wall thickness **exactly equals** local outer fillet radius (`t === R`), `MakeThickSolidByJoin` hits a geometric singularity (offset of the fillet arc collapses). Kernel sweep on fuse+outer R2:
   - t ∈ {0.5 … 1.99} → OCCT clean
   - **t = 2.0 (= R)** → cavity soft fallback (~20s)
   - t ∈ {2.01, 2.5} → OCCT clean again
4. Cut+fillet BX02 (v1.28) is a different failure mode (concave rim self-intersection for t≥R) fixed by Intersection=true; fuse+outer exact-equality is orthogonal.

## Fix
1. Keep v1.28 Intersection/RemoveIntEdges flag ladder on exact thickness first (BX02 byte-compat).
2. **v1.29:** if exact thickness exhausts, retry MakeThickSolid with tiny thickness nudges `±{1e-4, 1e-3, 1e-2}` and a reduced flag/tol ladder (Intersection-first). Geometry change is sub-print-tolerance; UI thickness unchanged.
3. Keep cavity/prismatic as last resort (do not remove).
4. Hard contract: `tests/grok-qa-v1.29-shell-occt-after-fuse-fillet.test.mjs` — fuse+outer R2+shell t=2 top/bottom **must not** emit cavity soft marker.
5. Do not regress `tests/grok-qa-v1.28-shell-occt-after-fillet.test.mjs`.
6. Bump `APP_VERSION` → `1.29`; PR → merge → SSH deploy stamp `v1.29-YYYYMMDD-HHMMSS`; verify nginx root.

## Acceptance
- [x] Root cause documented (t===R singularity on fuse+outer; Intersection/SelfInter insufficient)
- [x] Fuse+outer R2+shell t=2 prefers OCCT without 「备用」
- [x] BX02 cut+fillet+shell still OCCT (v1.28 regression)
- [x] Cavity path retained as last resort
- [x] APP_VERSION 1.29 live + nginx root verified
