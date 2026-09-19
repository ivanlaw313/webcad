# DEPLOY-RESULT v1.87

**Stamp:** `v1.87-20260919-163649`  
**Entry:** `index-RpMZfvt1-r2.js`  
**MD5:** `af45346faee09b32d8f079b0dc1f38b2`  
**Commit:** `1338cca` / PR [#184](https://github.com/ivanlaw313/webcad/pull/184)  
**Live:** https://cad.neuralworkshk.com/ · SW `webcad-v1.87` · nginx root `/var/www/webcad-releases/v1.87-20260919-163649`

## Summary
BOT-D leftover from v1.86 retest. APP/SW → **1.87**.

| ID | Fix |
|----|-----|
| BD-8601 | Ribbon `tb-color-control` tooltip `外观颜色` → `外觀顏色` via `tStatus` (+ EN phrase) |

## Verify
- Live `sw.js` → `const CACHE = 'webcad-v1.87'`
- Bundle contains TC `外觀顏色：點擊色塊選擇顏色，立即套用到當前實體`; badge APP_VERSION 1.87
- SC marker `外观颜色` absent
