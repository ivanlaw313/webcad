# WebCAD v1.33 FINAL

**Date:** 2026-09-18 (HKT)  
**PR:** #66 · stamp `v1.33-20260918-143056` · LIVE `1.33`

## Root cause
Shell Confirm was gated on `shellPreviewBusy`. v1.32 single-flight held `previewRound` for the full exclusive slot; Esc invalidated UI seq but did **not** cancel the worker call, so retries queued behind a still-running/hung preview. Users cancelled well under the 120s watchdog → `restartCount` 0 and Confirm stayed unavailable (BX01 @1.32 PARTIAL).

## Fix
1. Ungate Confirm — picks + t>0 only (parity with fillet / fail-path copy)
2. `cancelPreviews()` + silent preempt — `rebuild`/Esc free hung `previewRound` without「内核已重启」toast / without `restartCount++`
3. Store: cancel/commit/toggleShell bump seq + clear busy + cancel kernel preview
4. Keep v1.32 exclusive-timeout watchdog semantics

## Success
- LIVE 1.33 deployed; nginx root verified (avail + enabled)
- Shell CLEAN contracts v1.28–v1.32 + v1.33 preempt/Confirm/BX01-preview green (35/35)
- Solid retest ask: BX01 Confirm + CLEAN shell; restart ideally 0; BX02 spot-check CLEAN
