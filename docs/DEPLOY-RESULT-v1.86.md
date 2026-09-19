# DEPLOY-RESULT v1.86

**Stamp:** `v1.86-20260919-162846`  
**Entry:** `index-94DMfsNK-r2.js`  
**MD5:** `d688c03da1a23678dc5422e69df8f45b`  
**Commit:** `0ac26f3` / PR [#182](https://github.com/ivanlaw313/webcad/pull/182)  
**Live:** https://cad.neuralworkshk.com/ · SW `webcad-v1.86` · nginx root `/var/www/webcad-releases/v1.86-20260919-162846`

## Summary
BOT-D leftovers from v1.85 retest. APP/SW → **1.86**.

| ID | Fix |
|----|-----|
| BD-8501 | Viewport `外觀／出圖`; assembly summary `裝配／總體積／總面積／總尺寸／總質量／質心／實心打印／料費`; DrawingPanel `總尺寸`; MaterialSwatchPicker 外觀 chrome |
| BD-8502 | `hist.footer` → `清除瀏覽器數據` (zh-HK) / `清除浏览器数据` (zh-CN) |

## Verify
- Live `sw.js` → `const CACHE = 'webcad-v1.86'`
- Bundle contains TC phrases above; badge APP_VERSION 1.86
- SC markers `外观／出图` / `总体积` / `清瀏覽器數據會` absent
