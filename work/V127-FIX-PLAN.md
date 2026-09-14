# V127 FIX PLAN — BX02 bodyboolean CUT rebuild failure

**Ship:** APP_VERSION **1.27** · Grok direct edits · NO CloudAgent  
**Date:** 2026-09-14  
**Fail from:** LIVE v1.26 solid bot — classic BX02 PARTIAL

## Symptom (verified)
- Toast: `重建失败 - 已保留一个有效模型，请修正参数后…`
- Setup described as: active solid + parked body via `新实体` → ribbon `合并/切割` → `－切除(目标−工具)`
- Fillet R1 still PASS afterward (cut feature never committed — full applyFeatures revert)
- Shell face pick cascade likely from multi-body leftover state

## Root cause (hypothesis → verified)

**Verified in worker repro (`work/bx02-repro3.mjs` Z1/Z2):**

1. Ribbon **长方体/圆柱** dialogs had **no `⬡新实体` operation** — only `cutMode` or plain `new`.
2. The only multi-body path for primitives was the standalone **`新实体` command**, which **parks the first (box) body** and makes the **second (cylinder) the active target**.
3. Combine always treats **active = target**, parked = tool → cut = `cylinder − box`.
4. When the cylinder is fully contained in the box, result volume ≈ 0 → worker marks bodyboolean failed → `applyFeatures` sees `mesh.failed.length` and **reverts** with the observed toast.

Classic control path (box active + cylinder `operation:'newbody'`) still worked in kernel tests — so this is **role / UX**, not a broken OCCT cut for the intended hole.

Historical BX02 cut-rim fillet fix (v1.19) is unrelated; this is solid **bodyboolean cut** empty-result / rebuild revert.

## Fix
1. **Kernel (`cad.worker.ts`)**: before bodyboolean, `_healSolid` both operands; `_cutRobust` (coplanar micro-nudge like `fuseRobust`); on cut, if target−tool volume≈0 but tool−target has volume → **auto-swap** with warning.
2. **UX**: box/cylinder dialogs expose **操作：＋加料 / －切割 / ⬡新实体**; store honors `p.op` including `newbody`.
3. Combine status/hint documents auto-swap and preferred hole workflow.
4. Contract + worker tests: `tests/grok-qa-v1.27-bx02-bodyboolean-cut.test.mjs`.
5. Deploy release stamp `v1.27-YYYYMMDD-HHMMSS`; verify nginx root.

## Residual risk
- Shell face pick after cut+fillet still needs LIVE retest (prior versions had OCCT/cavity fallbacks).
- Auto-swap warning may surprise users who intentionally cut a contained active from a larger tool expecting empty — rare; toast previously failed hard anyway.
