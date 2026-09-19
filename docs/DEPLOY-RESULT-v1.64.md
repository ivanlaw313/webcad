# DEPLOY-RESULT v1.64

**Date:** 2026-09-19 12:19 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/133 — MERGED → `feat/native-car-stage1-20260906`  
**Site:** https://cad.neuralworkshk.com/  
**Choice:** SOLID construct / multi-body tool labels → HK Traditional

## Root cause
After ZH chrome (v1.61) groups showed **構造／參數**, individual tool labels still SC:
- 参数 / 新实体 / 实体布尔 / 整体偏移 / 构造几何 / 统一构造几何

## Ship contents
- Ribbon: **參數／新實體／實體布爾／整體偏移／構造幾何／統一構造幾何**
- Timeline + BrowserTree feature labels
- Viewport: 構造幾何 dialog + ⬡新實體 op chrome + sketch-view toggle
- i18n EN_LABEL TC keys + STATUS_PHRASES_X identity; legacy SC retained
- APP_VERSION **1.64** + contract `grok-qa-v1.64-construct-body-traditional`
- Keeps MESH SC pins / DRAWING 裝配工程圖 / SKETCH / illegal 尺寸已拒絕 / SELECT 選擇 / SHEET/PLASTIC / Shell-bake / ZH chrome

## Before → After
| Surface | v1.63 | v1.64 |
|---------|-------|-------|
| params | **参数** | **參數** |
| newbody | **新实体** | **新實體** |
| bodyboolean | **实体布尔** | **實體布爾** |
| offsetsolid | **整体偏移** | **整體偏移** |
| datumgeom | **构造几何** / **统一构造几何** | **構造幾何** / **統一構造幾何** |
| Viewport New Body op | **⬡新实体** | **⬡新實體** |

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-DDaOsWBz-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.64-20260919-121954` |
| Previous (kept) | `/var/www/webcad-releases/v1.63-20260919-121108` |
| nginx root | **sites-available + sites-enabled** → v1.64 release |
| current symlink | → `v1.64-20260919-121954` |
| entry md5 | `e94196e86f0862b3b77a3936b6289516` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.64-20260919-121954;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.64-20260919-121954;
```

## Verification
- Public entry `index-DDaOsWBz-r2.js` ✓ md5 match ✓
- Live contains `1.64`, 參數／新實體／實體布爾／整體偏移／構造幾何／統一構造幾何 ✓
- Live retains 裝配工程圖／尺寸已拒絕／插入STL网格／選擇／烘焙為零件實體／已抽殼 ✓
- SC ribbon labels absent for the five tools ✓
- Contracts v1.64 + v1.61–v1.63 static **PASS**

## BOT verify steps (hard refresh)
1. Version badge **1.64**
2. SOLID → CONFIGURE **參數**; CONSTRUCT **構造幾何**; LAB → **新實體／實體布爾／整體偏移／統一構造幾何**
3. Dialog title **構造幾何**; New Body op **⬡新實體**
4. Regress: MESH insert STL SC, DRAWING 裝配工程圖, illegal 尺寸已拒絕, SELECT 選擇, Shell 已抽殼 / bake 烘焙為零件實體
