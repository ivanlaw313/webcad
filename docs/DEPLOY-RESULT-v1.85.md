# DEPLOY-RESULT v1.85

**Stamp:** `v1.85-20260919-161608`  
**Entry:** `index-qPXSIPgb-r2.js`  
**MD5:** `837fa61b847636ccb8ec63ce9e39232a`  
**Commit:** `1e4b133` / PR [#180](https://github.com/ivanlaw313/webcad/pull/180)  
**Live:** https://cad.neuralworkshk.com/ · SW `webcad-v1.85` · nginx root `/var/www/webcad-releases/v1.85-20260919-161608`

## Summary
Clear residual Simplified under 繁 + BOT-D @1.84 leftovers. APP/SW → **1.85**. Do not re-ship 1.84.

| ID | Fix |
|----|-----|
| nav tips | `環繞：左鍵旋轉視角` / `縮放` / `適應視窗` (Viewport tStatus TC source) |
| splash | `開始建模` |
| ParamsPanel | `用戶參數` |
| CSketch | `約束草圖` |
| BD-8301 | Ribbon `儲存專案` / `復原`; Timeline `跳到開頭／結尾` |
| BD-8302 | MeshFit → `網格擬合 / 轉 B-rep` (insertmesh pin `插入STL网格` retained) |
| BD-8303 | autosave label `自動儲存` |

## Verify
- Live `sw.js` → `const CACHE = 'webcad-v1.85'`
- Bundle contains TC phrases above; badge APP_VERSION 1.85
