# DEPLOY-RESULT v1.92

**Stamp:** `v1.92-20260919-174009`  
**Entry:** `index-CH679vvG-r2.js`  
**MD5:** `118271c6282aa794c316b07bd1be00d1`  
**Commit:** `8c906f6` / PR [#200](https://github.com/ivanlaw313/webcad/pull/200)  
**Live:** https://cad.neuralworkshk.com/ · SW `webcad-v1.92` · nginx root `/var/www/webcad-releases/v1.92-20260919-174009`

## Summary
APP/SW → **1.92**.

| ID | Fix |
|----|-----|
| BD-9201 | Viewport sketch chrome SC→TC：底欄正對／逐條投影／斷開連結／約束衝突／完成線／閉合／基準Z／幾何捕捉／捕捉關／透視／刪除／診斷／頂面等；store 草圖平面 status；STATUS_PHRASES_X EN；tc2sc `準` |

## Verify
- Live `sw.js` → `const CACHE = 'webcad-v1.92'`
- Bundle: `正對` / `幾何捕捉` / `基準Z` / `捕捉關` / `完成線` / `閉合` / `斷開連結` / `透視`
- Tests: `grok-qa-v1.92-sketch-chrome-tc.test.mjs` (6/6 green)
- Browser: hard refresh `?v=192`（螢幕 Chrome 已開住）
