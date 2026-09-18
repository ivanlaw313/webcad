# V136 FIX PLAN — Shell preview Chrome tab discard (LIVE @1.35)

**Ship:** APP_VERSION **1.36** · Grok direct · gh PR · SSH deploy · NO CloudAgent  
**Date:** 2026-09-19 (HKT)  
**Base:** LIVE v1.35 (PR #71) — AL1 DXF OOM fixed; BX01/BX02 Shell discard under memory pressure  
**Evidence:** `/workspace/webcad-qa/out/V135-SOLID-RETEST.md` · `/workspace/webcad-qa-solid/out/v135/`

## Symptom (LIVE @1.35)
| Case | Result |
|------|--------|
| BX01 Fuse+R2+Shell t=2 | FAIL — Chrome discard during Shell; no commit |
| BX02 Cut+Fillet R1+Shell t=1.5 | FAIL — Fillet OK; discard when setting t=1.5 after face pick |
| Kernel restart | 0 |
| Browser discard | ×2 (both on Shell) |

v1.35 fixed AL1 DXF **scene** OOM (LineSegments). This is a **different** path: OCCT MakeThickSolid / shell previewRound.

## Root cause (verified Node probe)

BX02 cut+R1+shell t=1.5 on worker:
- **2017** `MakeThickSolidByJoin` attempts, **9** `_shellExactFaces` calls
- **+253 MB** RSS for one shell; **47s**
- Winning step: **1.6 fillet-trim** (succeeds on join #2017 — first try after trim)
- Wasted: seeds on 4 bases (828 joins) + seeds+TORUS (1188 joins) run full primary+nudge(+fuse) ladders before trim

Stacked previews (t=1 → 1.5 → 2, no cancel): **4989** joins, **~1.17 GB** RSS — Chrome discard inevitable.

`scheduleShellPreview` bumps seq but **does not** `cancelPreviews()` → prior `previewRound` runs to completion under single-flight before the new thickness preview starts.

WASM heap grows monotonically with each failed MakeThickSolid; GCWithScope does not shrink Emscripten heap.

BX01 junction path succeeds in **1** join locally — LIVE discard is from preview stacking / heavier fillet picks / same uncapped ladder on harder variants.

## Fix (v1.36)

1. **Join budget** in `_shellExactFaces` — hard cap per call (commit 40 / preview 28); compact primary/nudge/fuse ladders; dispose failed `accept()` shapes when possible.
2. **Feature budget** — soft cap across one shell feature (~120 joins) so outer ladder cannot run thousands of joins.
3. **Reorder openAttempt** — after seeds miss, run **fillet-trim before** seeds+TORUS/boss deep ladders (BX02 win path early).
4. **Bases** — seeds/torus/boss try **primary base first**; sew/fusePre/copyHeal only after base miss / for trim retries.
5. **Preview** — `previewRound` sets preview budget + **coarser** `meshOf` (higher tol/angTol); `scheduleShellPreview` calls `cancelPreviews()` so thickness edits preempt in-flight OCCT.
6. Contracts: join-cap wiring + BX02 join count ≪ 200; keep v1.28–v1.35 / CX02 / CLEAN toast rules.
7. `APP_VERSION` → `1.36`; deploy stamp `v1.36-…`.

## Acceptance
- [ ] BX02 shell joins ≪ 200 (target &lt; 80) and CLEAN (no 备用/型腔/其他开口)
- [ ] BX01 still CLEAN in 1 join path
- [ ] scheduleShellPreview cancels in-flight preview
- [ ] previewRound uses coarser mesh + lower join budget
- [ ] v1.28–v1.33 shell + v1.34/v1.35 DXF + illegal-dim contracts PASS
- [ ] LIVE 1.36; solid retest BX01+BX02 Shell commit without discard; prefer CLEAN toast
