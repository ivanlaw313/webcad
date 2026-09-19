# DEPLOY-RESULT v1.52

**Date:** 2026-09-19 10:54 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/105 (MERGED → `feat/native-car-stage1-20260906`)  
**Site:** https://cad.neuralworkshk.com/  
**Choice:** SOLID MODIFY ribbon Traditional Chinese — 圓角／抽殼／縮放／合併/切割／移動/複製… (was Simplified)

## Ship contents
- SOLID MODIFY ribbon labels → zh-Hant (圓角／抽殼／縮放／編輯面／合併/切割／替換面／分割實體／輪廓分割／移動/複製／對齊／刪除／簡化／體積晶格／外觀／轉換／更改參數…).
- Matching FD_TITLE + radial/context menus + BrowserTree / Timeline feature labels.
- EN_LABEL Traditional keys for those labels (legacy SC keys retained for store/toast until a later pass).
- APP_VERSION **1.52** + contract `grok-qa-v1.52-modify-traditional`.
- Keeps FORM TC (v1.49), SOLID CREATE TC (v1.50), illegal reject TC (v1.51), plane buttons (v1.46), Box soft-lock (v1.45), MESH DnD (v1.41–1.44). Sketch `对称`→Symmetric intact.

## Before → After
| Surface | v1.51 (SC leftover) | v1.52 (TC/HK) |
|---------|---------------------|---------------|
| Fillet / Shell / Scale | 圆角／抽壳／缩放 | **圓角／抽殼／縮放** |
| Combine / Move | 合并/切割／移动/复制 | **合併/切割／移動/複製** |
| Edit / Replace / Split | 编辑面／替换面／分割实体 | **編輯面／替換面／分割實體** |
| Appearance / Convert / Params | 外观／转换／更改参数 | **外觀／轉換／更改參數** |
| Illegal reject / CREATE / FORM | 尺寸已拒絕／建立草圖／建立造型 | unchanged |

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-DaHIocvz-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.52-20260919-105328` |
| Previous (kept) | `/var/www/webcad-releases/v1.51-20260919-104520` |
| nginx root | **sites-available + sites-enabled** → v1.52 release |
| current symlink | → `v1.52-20260919-105328` |
| entry md5 | `4c3861098df6b3273bf5c6de37a318bf` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.52-20260919-105328;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.52-20260919-105328;
```
Both point at the **NEW** v1.52 release (not stuck on v1.51).

## Verification
- Public `index.html` references `index-DaHIocvz-r2.js` ✓
- Live JS contains `1.52` ✓
- Live entry md5 matches local (`4c3861098df6b3273bf5c6de37a318bf`) ✓
- Live entry contains `圓角`, `抽殼`, `縮放`, `合併/切割`, `移動/複製`, `尺寸已拒絕`, `建立草圖`, `建立造型`, `長方體`, `完成造型` ✓
- Live entry does **not** contain `尺寸已拒绝` or `创建造型` ✓
- Live entry retains `form-create-plane-hint`, `placeFormBoxOnOriginPlane`, `acceptMeshDropFile` ✓
- Contracts: static Form/CREATE/illegal/MODIFY QA **PASS** (17/17 core; 43/43 with Form suite)

## BOT-D verify steps
1. SOLID → MODIFY strip shows **圓角／抽殼／縮放／移動/複製** (not Simplified).
2. Right-click solid → menu **圓角／⬚ 抽殼／移動/複製／刪除**.
3. (Optional) MESH: drag STL — still PASS.
4. SOLID → length ≤0 → **尺寸已拒絕** (v1.51 intact).
5. SOLID → **建立造型** → plane XY → **完成造型**; CREATE still **建立草圖／長方體**.
