# DEPLOY-RESULT v1.92

**Stamp:** `v1.92-20260919-174009`  
**Entry:** `index-CH679vvG-r2.js`  
**MD5:** `118271c6282aa794c316b07bd1be00d1`  
**Commit:** `85ee282` / PR [#200](https://github.com/ivanlaw313/webcad/pull/200)  
**Live:** https://cad.neuralworkshk.com/ · SW `webcad-v1.92` · nginx root `/var/www/webcad-releases/v1.92-20260919-174009`

## Summary
APP/SW → **1.92**.

| ID | Fix |
|----|-----|
| BD-9101 / BD-9201 | Viewport sketch chrome SC→TC：mini-toolbar status `點圓心再點半徑／打數字定精確Ø`；display-toggle `約束`/`點`/`構造`/`網格`；plane helper `豎直`；`正對`/`逐條投影`/`拖動檢驗約束`；store sketch-plane status；STATUS_PHRASES_X EN；tc2sc gaps（準/餘/衝…） |

## Verify
- Live `sw.js` → `const CACHE = 'webcad-v1.92'`
- Bundle: `點圓心再點半徑／打數字定精確Ø` / `正對` / `選擇點／邊／尺寸；拖動檢驗約束` / `前=豎直面`
- Tests: `grok-qa-v1.92-sketch-chrome-tc.test.mjs` (+ v1.88–v1.91 green)
