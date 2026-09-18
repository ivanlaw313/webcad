# V130 FIX PLAN — Shell prefers original opening OCCT (no alternate-lid soft toast)

**Ship:** APP_VERSION **1.30** · Grok direct · NO CloudAgent  
**Date:** 2026-09-18 (HKT)  
**Base:** LIVE v1.29 (PR #59) — cavity soft gone for some t===R, but LIVE still falls to alternate planar opening

## Symptom (LIVE @1.29)
- Fuse + outer fillet R2 + Shell t=2: commits with soft toast `原开口 OCCT 未收敛，已启用其他开口面` / `已改用其他平面开口`
- BX02 Cut + Fillet R1 (top rim) + Shell t=1.5 (top open, tangent chain on): same soft path
- No 「备用／型腔」 — different soft path than cavity

## Root cause (verified)
1. MakeThickSolid **throws** on the user-selected planar opening when that face shares a **filleted rim** (fillet on the opening boundary).
2. Fallback step (2) tries **other planar lids** (often the opposite face) and succeeds → soft warning `已改用其他平面开口`.
3. v1.28/v1.29 tests filleted the **bottom** rim and opened **top** (easy) — missed the LIVE top-rim+top-open case.
4. Fuse LIVE: cylinder-top outer fillet (TORUS) + open that top — seeds alone fail; **seed + adjacent TORUS** OCCT succeeds.
5. BX02 LIVE: top-rim fillet is CYLINDRE (not TORUS); seed+TORUS N/A; seed+fillet+hole-cyl OCCT succeeds but **wrong hollow** (vol ~9738 vs ~11034). Full-height cut through fillet depth R then OCCT on new top works; optional wall-height restore brings volume near target.

## Fix
1. After seeds OCCT miss: try **seeds + edge-adjacent TORUS/TORE rim faces** (still user opening family) — no warning.
2. After that: if planar seed has nearby rim fillet (TOR/CYL near seed Z), **trim** a slab through fillet depth, heal, remap seeds, MakeThickSolid; optionally **restore** outer wall height with a hollow frame fuse — no warning on success.
3. **Defer alternate planar lids** until after coplanar + cavity/prismatic on original seeds (prefer correct opening face).
4. Keep cavity/prismatic as last-resort before alt lids / G1 chain.
5. Contract `tests/grok-qa-v1.30-shell-original-opening.test.mjs`: BX02 top-rim+top-open AND fuse cyl-top-fillet+top-open must NOT emit alternate-opening warning; keep v1.28/v1.29 green.
6. Bump `APP_VERSION` → `1.30`; PR → merge → SSH deploy stamp `v1.30-...`.

## Acceptance
- [x] BX02-like cut→top-rim fillet→shell top: OCCT on original side, no `已改用其他平面开口` / `未收敛` soft toast when clean
- [x] Fuse-like outer/cyl-top fillet→shell top: same
- [x] v1.28 / v1.29 contracts still PASS
- [x] Cavity path retained
- [x] APP_VERSION 1.30 live + nginx root verified
