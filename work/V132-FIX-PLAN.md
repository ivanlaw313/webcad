# V132 FIX PLAN — eliminate spurious「内核已重启」toast on Shell preview (BX01/BX02)

**Ship:** APP_VERSION **1.32** · Grok direct · NO CloudAgent  
**Date:** 2026-09-18 (HKT)  
**Base:** LIVE v1.31 (PR #62) — BX01/BX02 Shell **PASS/CLEAN**, but solid bot noted mid-run recover toast

## Symptom (LIVE @1.31)
- BX01 Fuse+R2+Shell t=2 → final CLEAN commit
- BX02 Cut+R1+Shell t=1.5 → final CLEAN commit
- During **earlier preview** / before successful retry: `内核已重启 — 模型已恢复到上一个成功状态`

## Root cause (verified)
1. Shell (+ fillet) UI preview calls `cad.previewRound` → same `buildShape` / MakeThickSolid ladder as rebuild.
2. `previewRound` was **not** in `LONG_METHODS` → 60s watchdog (rebuild gets 120s).
3. **Critical:** watchdog started the timeout at **enqueue** time, not when the worker began exclusive execution. Stacked `previewRound` (fillet preview still in flight, shell debounce, thickness edits) burned the 60s budget while queued → false timeout → `terminate` + snapshot restore → recover toast — even though the op would have succeeded and final `rebuild` commit stayed CLEAN.
4. Secondary: `looksLikeKernelCrash` matched bare `abort`/`memory` substrings (too broad for business errors).

Not primary: MakeThickSolid wasm hard-abort still possible on exotic topologies, but BX01/BX02 CLEAN paths succeed early in the ladder; the observed toast matches the preview-stack timeout pattern.

## Fix (v1.32)
1. **Single-flight gate** in `createKernelProxy`: serialize kernel calls; timeout covers exclusive execution only.
2. Add **`previewRound`** to `LONG_METHODS` (120s, same class as rebuild).
3. Tighten **`looksLikeKernelCrash`** to Emscripten-style patterns (`aborted(`, unreachable, OOM, …); ignore self-heal toast text.
4. Expose `restartCount` on `getState` for contracts.
5. Contract: `tests/grok-qa-v1.32-kernel-restart-toast.test.mjs` — stacked slow previews must not restart; true hang still restarts.
6. Bump `APP_VERSION` → `1.32`. Keep v1.28–v1.31 shell CLEAN contracts green.

## Acceptance
- [x] Stacked previewRound under exclusive timeout → `restartCount === 0` (HARD test)
- [x] True hang still restarts + recover toast
- [x] v1.28 / v1.29 / v1.30 / v1.31 shell suites PASS
- [x] LIVE 1.32; solid retest BX01+BX02 — ideally **zero** restart toast on preview/commit; rare hard-abort restart still acceptable
