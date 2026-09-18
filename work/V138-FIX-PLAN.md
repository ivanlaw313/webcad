# V138 FIX PLAN — Solid-op success toasts proper Chinese (extend v1.37)

**Ship:** APP_VERSION **1.38** · Grok direct · gh PR · SSH deploy · NO CloudAgent  
**Date:** 2026-09-19 (HKT)  
**Base:** LIVE v1.37 (PR #75) — Shell/Fillet/Chamfer success Chinese under EN `tStatus`  
**Evidence:** `/workspace/webcad-qa/out/DEPLOY-RESULT-v1.37.md`

## Symptom (LIVE @1.37)
Shell/Fillet/Chamfer fixed. Other common solid success toasts still hybrid/English under EN `tStatus`:

| Op | Toast under EN (mangled) |
|----|--------------------------|
| Extrude | `Done: extrudeto make a body — real  OCCT B-rep` |
| Cut | `Cut (Boolean subtract) done — true OCCT B-rep` |
| Multi-profile Extrude/Cut | `Done: extrude N 个profile…` / `Done: 切除 N 个profile…` |
| Body Boolean / Fuse | `Done: boolean: 活动body …` / `Merged : 活动body …` |
| New Body | `Done: 开新body …Done: 泊车…` |
| Revolve / Loft / Sweep | `Done: revolve…` / `Done: loft…` / `Done: …sweep…` |
| Draft / Thicken | `Done: Draft …` / `Done: thicken that face…` |
| Fillet/Chamfer all edges | `Done: 对所有棱倒fillet…` / `Done: …chamfer…` |

## Root cause
1. Status HUD always runs `tStatus(status, lang)`.
2. Short STATUS_PHRASES tokens (`已`→`Done: `, `拉伸`→`extrude`, `实体`→`body`, `旋转`→`revolve`, …) carve inside Chinese success phrases.
3. Some whole-string EN translations (`已切割（布尔减）— 真实 OCCT B-rep`, `已在顶面叠加拉伸特征`) force full English.
4. v1.37 LTR longest-match + identity guards only covered Shell/Fillet/Chamfer units.

## Fix (v1.38)
1. **Builders** in `src/ui/featureStatus.ts` — Extrude/Cut/Boolean/Fuse (merge) Chinese success helpers; store wired for representative paths.
2. **STATUS_PHRASES_X guards** — long Chinese identities for Extrude/Cut/Boolean/Fuse/Revolve/Loft/Sweep/Draft/Thicken/all-edge Fillet·Chamfer (+ override whole-string EN translations).
3. Keep v1.37 LTR longest-match `tStatus` (no split/join regress).
4. Contract `tests/grok-qa-v1.38-solid-toast-zh.test.mjs` — no `Done:` on representative ops.
5. `APP_VERSION` → `1.38`; deploy stamp `v1.38-…`.
6. **Do not** touch Shell CLEAN wording, join budgets (v1.36), DXF batching (v1.35), or LTR matcher (v1.37).

## Acceptance
- [ ] EN `tStatus` on Extrude/Cut/Boolean/Fuse success → Chinese, no `Done:` / bare `extrude`/`body`/`boolean` hybrids
- [ ] Shell CLEAN + Fillet/Chamfer v1.37 contracts still PASS
- [ ] v1.36 shell OOM + v1.35 DXF contracts still PASS
- [ ] LIVE 1.38; light solid smoke + optional UI/BOT-D
