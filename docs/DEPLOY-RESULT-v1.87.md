# DEPLOY-RESULT v1.87

**Stamp:** `v1.87-20260919-163928`  
**Entry:** `index-BpOpjFYn-r2.js`  
**MD5:** `6cb0c963f00e7329047ea5e0fc8d8222`  
**Commit:** `1338cca` / PR [#184](https://github.com/ivanlaw313/webcad/pull/184)  
**Docs:** PR [#185](https://github.com/ivanlaw313/webcad/pull/185)  
**Live:** https://cad.neuralworkshk.com/ · SW `webcad-v1.87` · nginx root `/var/www/webcad-releases/v1.87-20260919-163928`

## Summary
BOT-D leftover from v1.86 retest. APP/SW → **1.87**.

| ID | Fix |
|----|-----|
| BD-8601 | Ribbon `tb-color-control` tooltip `外观颜色` → `外觀顏色` via `tStatus` (+ EN phrase) |

## Verify
- Live `sw.js` → `const CACHE = 'webcad-v1.87'`
- Badge `Ut=`1.87`` / APP_VERSION 1.87
- Bundle contains TC `外觀顏色：點擊色塊選擇顏色，立即套用到當前實體`
- SC marker `外观颜色` absent
