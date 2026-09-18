# V136 FINAL — Shell preview Chrome discard fixed

**LIVE:** https://cad.neuralworkshk.com/ · **APP_VERSION 1.36** · stamp `v1.36-20260919-003144`  
**PR:** https://github.com/ivanlaw313/webcad/pull/73 @ `079d606` · entry `index-DzjloFcq-r2.js` (md5 `3652d010ed15828ef260b744abb4fb7c`)

## Root cause
Uncapped OCCT `MakeThickSolidByJoin` retry ladder on Shell preview/commit. BX02 burned **~2017** joins (+253MB RSS) before fillet-trim succeeded; stacked thickness previews reached **~1.2GB** → Chrome tab discard. Distinct from v1.35 DXF scene OOM.

## Fix
Join budgets + early fillet-trim + lazy alt bases + `cancelPreviews` on reschedule + coarser preview mesh. CLEAN toast rules preserved.

## Ask solid bot
Retest **BX01** + **BX02** Shell **commit** on LIVE 1.36 without discard; prefer CLEAN toast (no fallback/cavity/alt-opening).
