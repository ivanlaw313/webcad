# DEPLOY-RESULT v1.72

**Date:** 2026-09-19 13:34 HKT  
**PRs:**  
- https://github.com/ivanlaw313/webcad/pull/151 — LAB panel names + stack TC (MERGED) → `feat/native-car-stage1-20260906`  
**Site:** https://cad.neuralworkshk.com/  
**Choice:** LAB panel chrome residual SC → HK Traditional + SW CACHE bump  
**Note:** Tool labels under these panels already TC in v1.70/v1.71 — this slice is panel chrome only.

## Ship contents
- LAB panels: **CREATE 擴充**／**製造 CAM**／**裝配輔助**／**直接編輯擴展**
- LAB 3D列印 tool: **堆疊**; Viewport assemble menu **⊟ 垂直堆疊**
- i18n EN_LABEL TC keys (legacy SC retained for tLabel)
- `public/sw.js` **CACHE=`webcad-v1.72`** + RELEASE comment; navigate network-first unchanged
- APP_VERSION **1.72** + contract `grok-qa-v1.72-lab-panel-names-traditional`
- Soft-update: v1.20 CAM pin, v1.26 LAB direct-edit panel name, v1.71 SW assert → 1.71+

## Before → After
| Surface | v1.71 | v1.72 |
|---------|-------|-------|
| LAB CREATE panel | CREATE 扩充 | **CREATE 擴充** |
| LAB CAM panel | 制造 CAM | **製造 CAM** |
| LAB stack tool | 堆叠 | **堆疊** |
| LAB asm-assist panel | 装配辅助 | **裝配輔助** |
| LAB direct-edit panel | 直接编辑扩展 | **直接編輯擴展** |
| Viewport menu | ⊟ 垂直堆叠 | **⊟ 垂直堆疊** |
| SW CACHE | `webcad-v1.71` | **`webcad-v1.72`** |

## Build / release
| Item | Value |
|------|--------|
| Merge SHA | `b09ab2bcf91af7a3b8bc4e39517795b8e8c271b7` |
| Commit | `bee1d3498a352e0dadfe18809036e4799006ce62` |
| Local entry | `index-4BiJaJ1W-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.72-20260919-133307` |
| Previous (kept) | `/var/www/webcad-releases/v1.71-20260919-132223` |
| nginx root | **sites-available + sites-enabled** → v1.72 release |
| current symlink | → `v1.72-20260919-133307` |
| entry md5 | `3757f1863fe3c4a9cc80b7c0a1730548` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.72-20260919-133307;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.72-20260919-133307;
```

## Verification
- Public entry `index-4BiJaJ1W-r2.js` ✓ md5 match ✓
- Live SW `CACHE = 'webcad-v1.72'` ✓
- Live contains CREATE 擴充／製造 CAM／裝配輔助／直接編輯擴展／堆疊／垂直堆疊／受力雲圖／切層預覽／棱錐／刪面治癒／`1.72` ✓
- Retained: 插入STL网格／導出STL／裝配工程圖／尺寸已拒絕／選擇／爆炸視圖／3D列印／Boolean leftovers／LAB under 實驗室 ✓
- Contract tests: 25 pass (v1.72 + soft-updated v1.20/v1.26/v1.71)

## BOT verify steps (hard refresh / Unregister SW once)
1. DevTools → Application → Service Workers → **Unregister** once (or Clear site data), then hard refresh
2. Version badge **1.72**
3. 🧪實驗室 → panel chrome: **CREATE 擴充**／**製造 CAM**／**裝配輔助**／**直接編輯擴展**
4. 🧪實驗室 → 3D列印：**堆疊**
5. Viewport multi-component menu：**⊟ 垂直堆疊**
6. Regress: 插入STL网格, 畫布／貼花, 受力雲圖／切層預覽／棱錐／刪面治癒, 構造擴展 under 實驗室, ZH chrome
