# WebCAD v1.32 FINAL

**Date:** 2026-09-18 (HKT)  
**PR:** #64 · stamp `v1.32-20260918-181937` · LIVE `1.32`

## Root cause
`cadService` started the per-call watchdog timeout at **enqueue** time. Shell/fillet UI both use `previewRound`; stacked previews burned the 60s budget while queued → false timeout → worker terminate +「内核已重启 — 模型已恢复到上一个成功状态」, even though final `rebuild` commits for BX01/BX02 stayed CLEAN on v1.31.

## Fix
1. Single-flight gate — timeout covers exclusive execution only  
2. `previewRound` ∈ `LONG_METHODS` (120s)  
3. Tighter `looksLikeKernelCrash`  
4. HARD contract for stacked previews  

## Success
- LIVE 1.32 deployed; nginx root verified  
- Shell CLEAN contracts v1.28–v1.31 green  
- Solid retest ask: BX01 + BX02; note whether restart toast still appears (expect rare/zero)
