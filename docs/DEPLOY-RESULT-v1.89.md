# DEPLOY-RESULT v1.89

**Stamp:** `v1.89-20260919-165753`  
**Entry:** `index-8_2qYtSf-r2.js`  
**MD5:** `11b9d82aaa666f6343488d6290a2ce68`  
**Commit:** `885c244` / PR [#190](https://github.com/ivanlaw313/webcad/pull/190)  
**Live:** https://cad.neuralworkshk.com/ · SW `webcad-v1.89` · nginx root `/var/www/webcad-releases/v1.89-20260919-165753`

## Summary
APP/SW → **1.89**.

| ID | Fix |
|----|-----|
| BD-8801 | Fillet dialog: `类型`→`類型`, `边/面/特征`→`邊／面／特徵`; type option **面圓角** (→ faceFillet); keep **全圓角** |
| BD-8701 leftover | Status `圓角：逐條點選邊／面／特徵` |

## Verify
- Live `sw.js` → `const CACHE = 'webcad-v1.89'`
- Bundle: `類型` / `邊／面／特徵` / `面圓角` / `圓角：逐條點選邊／面／特徵`
- SC `边/面/特征` absent in live entry
