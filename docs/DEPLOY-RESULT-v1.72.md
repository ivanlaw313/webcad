# DEPLOY-RESULT v1.72

**Date:** 2026-09-19 13:33 HKT  
**PRs:**  
- https://github.com/ivanlaw313/webcad/pull/151 — LAB panel names + stack TC (MERGED) → `feat/native-car-stage1-20260906`  
**Site:** https://cad.neuralworkshk.com/  
**Choice:** LAB panel chrome still SC after v1.71 tool-label TC → HK Traditional + SW CACHE bump  
**Note:** Tool labels under these panels (FEA/slice/pyramid/delface etc.) already live in v1.70/#145–v1.71/#149 — not redone.

## Ship contents
- LAB panel: **CREATE 擴充**／**製造 CAM**／**裝配輔助**／**直接編輯擴展**
- LAB 3D列印 tool: **堆疊**
- Viewport assemble menu companion: **⊟ 垂直堆疊**
- i18n EN_LABEL TC keys (legacy SC retained)
- `public/sw.js` **CACHE=`webcad-v1.72`** + RELEASE comment; navigate network-first unchanged
- APP_VERSION **1.72** + contract `grok-qa-v1.72-lab-panel-names-traditional`

## Before → After
| Surface | v1.71 | v1.72 |
|---------|-------|-------|
| LAB panel CREATE ext | CREATE 扩充 | **CREATE 擴充** |
| LAB panel CAM | 制造 CAM | **製造 CAM** |
| LAB panel asm assist | 装配辅助 | **裝配輔助** |
| LAB panel direct edit | 直接编辑扩展 | **直接編輯擴展** |
| LAB 3D列印 stack | 堆叠 | **堆疊** |
| Viewport assemble menu | ⊟ 垂直堆叠 | **⊟ 垂直堆疊** |
| SW CACHE | `webcad-v1.71` | **`webcad-v1.72`** |

## Build / release
| Item | Value |
|------|--------|
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
- Live contains CREATE 擴充／製造 CAM／裝配輔助／直接編輯擴展／堆疊／受力雲圖／切層預覽／棱錐／刪面治癒／插入STL网格／`1.72` ✓
- Retained: 插入STL网格／導出STL／裝配工程圖／尺寸已拒絕／選擇／爆炸視圖／3D列印／螺紋桿／中間平面／Boolean leftovers／v1.71 FEA/slice/pyramid/delface ✓

## BOT verify steps (hard refresh / Unregister SW once)
1. DevTools → Application → Service Workers → **Unregister** once (or Clear site data), then hard refresh
2. Version badge **1.72**
3. 🧪實驗室 → panel titles：**CREATE 擴充**／**製造 CAM**／**裝配輔助**／**直接編輯擴展**
4. 🧪實驗室 → 3D列印：**堆疊**
5. Assemble context menu：**⊟ 垂直堆疊**
6. Regress: 插入STL网格, FEA/slice/pyramid/delface TC, 畫布／貼花, Boolean leftovers, 構造擴展 under 實驗室, ZH chrome
