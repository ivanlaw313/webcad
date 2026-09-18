# V133 FIX PLAN — BX01 Shell preview stall / Confirm unavailable (LIVE @1.32)

**Ship:** APP_VERSION **1.33** · Grok direct · NO CloudAgent  
**Date:** 2026-09-18 (HKT)  
**Base:** LIVE v1.32 (PR #64) — zero false「内核已重启」, BX02 CLEAN; BX01 Shell preview stalled twice, Confirm unavailable

## Symptom (LIVE @1.32)
- BX01 Fuse+R2+Shell t=2: fuse/fillet OK; Shell preview **stalled twice**; Confirm unavailable; cancel `已取消抽壳`
- Kernel restart count **0** (user cancelled well under 120s watchdog)
- BX02 still PASS/CLEAN

## Root cause (verified in code)
1. **Confirm gated on `shellPreviewBusy`** (`Viewport` okDisabled). Fillet Confirm is **not** gated on `roundPreviewBusy`. Fail-path copy already says「仍按确定尝试提交」but busy path locks Confirm forever.
2. **v1.32 single-flight** holds the exclusive slot for the full `previewRound`. Esc/retry bumps UI seq and clears dialog state via subscribe, but **does not cancel** the in-flight/queued worker preview → retry waits behind the still-running call → second stall. Watchdog only at 120s → restartCount stays 0.
3. **`rebuild` (commit) cannot preempt `previewRound`** → even with Confirm enabled, commit would queue behind a hung/slow preview until timeout/restart.
4. Secondary: `cancelShell` / stale `runShellPreview` early-return do not reliably clear busy; `commitEdgeRound` does not bump preview seq (orphan round preview can hold slot into shell).

Not primary: OCCT MakeThickSolid hard-abort (restart would be >0); enqueue-time false timeout (fixed in v1.32, keep).

## Fix (v1.33)
1. **Confirm:** remove `shellPreviewBusy` from okDisabled (picks + t>0 only) — parity with fillet + v1.11 fail intent.
2. **`cadService`:** preview epoch + silent preempt — priority methods (`rebuild`, …) and explicit `cancelPreviews()` reject/cancel `previewRound` (queued + exclusive), terminate+recover snapshot **without**「内核已重启」toast; do **not** increment `restartCount`.
3. **Store:** `cancelShell` / `commitShell` bump seq, clear preview flags, call `cancelPreviews()` before rebuild; stale preview early-return clears busy when seq still current; treat cancel error as soft fail.
4. Keep v1.32 watchdog semantics (timeout from exclusive start; `previewRound` ∈ LONG_METHODS 120s hard hang path still restarts+toasts).
5. Contracts: Confirm path; rebuild preempts hung preview without restart toast; v1.28–v1.32 shell suites green.
6. `APP_VERSION` → `1.33`.

## Acceptance
- [ ] Confirm enabled while preview busy (picks+t>0)
- [ ] Hung previewRound + rebuild → rebuild wins; restartCount unchanged; no 内核已重启 toast
- [ ] Stacked previews still restartCount===0 (v1.32 HARD)
- [ ] True exclusive hang on rebuild still restarts + toast
- [ ] v1.28–v1.32 shell suites PASS
- [ ] LIVE 1.33; solid BX01 Shell CLEAN with Confirm; restart ideally 0; BX02 spot-check CLEAN
