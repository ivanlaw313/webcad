# DEPLOY-RESULT v1.90

**Stamp:** `v1.90-20260919-171414`  
**Entry:** `index-DPN3QbEB-r2.js`  
**MD5:** `92c1e92f6d0a6ae77aa3bba8a405bb15`  
**Commit:** `e8a773f` / PR [#192](https://github.com/ivanlaw313/webcad/pull/192) + [#193](https://github.com/ivanlaw313/webcad/pull/193) + [#195](https://github.com/ivanlaw313/webcad/pull/195)  
**Live:** https://cad.neuralworkshk.com/ · SW `webcad-v1.90` · nginx root `/var/www/webcad-releases/v1.90-20260919-171414`

## Summary
APP/SW → **1.90**.

| ID | Fix |
|----|-----|
| BD-8901 | Fillet radius-group status/labels SC→TC：`半徑組 N 已啟用：之後點選嘅邊會加入呢組`；dialog `棱`→`稜`、`半径`→`半徑` |
| BD-8902 | SketchToolPanel under 繁：`清選擇` / `自動約束推斷` / `一鍵自動約束` / `畫成構造幾何（下一筆）` + related titles/hints；EN via STATUS_PHRASES_X |

## Verify
- Live `sw.js` → `const CACHE = 'webcad-v1.90'`
- Bundle: `撳空白 = 清選擇` / `自動約束推斷` / `一鍵自動約束` / `畫成構造幾何（下一筆）` / `半徑組`
- Tests: `grok-qa-v1.90-bd8901.test.mjs` 10/10 (+ regress v1.84–v1.89 green)
