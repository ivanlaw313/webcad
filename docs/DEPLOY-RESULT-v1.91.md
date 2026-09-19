# DEPLOY-RESULT v1.91

**Stamp:** `v1.91-20260919-172446`  
**Entry:** `index-D0jjpV3y-r2.js`  
**MD5:** `1629e2a0eb5213ed393996504c0c1da3`  
**Commit:** `f8584f9` / PR [#197](https://github.com/ivanlaw313/webcad/pull/197) + [#198](https://github.com/ivanlaw313/webcad/pull/198)  
**Live:** https://cad.neuralworkshk.com/ · SW `webcad-v1.91` · nginx root `/var/www/webcad-releases/v1.91-20260919-172446`

## Summary
APP/SW → **1.91**.

| ID | Fix |
|----|-----|
| BD-9101 | SketchToolPanel leftover SC→TC：`TOOL_TITLE` / `TOOL_HINT` / `SK_CON_LABEL_ZH`；mirror / dimension / construction-line / offset chrome；`操作說明`；hints via `T()`；STATUS_PHRASES_X EN + short labels；tc2sc gaps（豎/側/拋/夠…） |

## Verify
- Live `sw.js` → `const CACHE = 'webcad-v1.91'`
- Bundle: `點圓心 → 點半徑` / `構造參考線` / `鏡像` / `豎直` / `共線` / `點一條直線邊做鏡像軸`
- Tests: `grok-qa-v1.91-sketch-panel-tc.test.mjs` (+ v1.88–v1.90 green)
