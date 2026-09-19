# DEPLOY-RESULT v1.49

**Date:** 2026-09-19 10:26 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/99 (MERGED → `feat/native-car-stage1-20260906`)  
**Site:** https://cad.neuralworkshk.com/  
**Bug:** BUG-BD-4801 (BOT-D v1.48 Simplified Form ribbon orthography)

## Ship contents
- **FORM ribbon Traditional (HK):** 長方體 / 圓柱 / 管道 / 四邊形球體 / 編輯造型 / 細分 / 造型對稱 / … (EN via `tLabel`).
- SOLID entry **建立造型** (was 创建造型 / Create Form); FORM tab chip zh **造型**.
- Form dialog dims Traditional: 路徑點 / 直徑 / 面數 / 輪廓 / 確定.
- Finish Form **完成造型** (glyphs unchanged); Edit **編輯造型**.
- APP_VERSION **1.49** + contract `grok-qa-v1.49-form-traditional-chinese`.
- Keeps plane buttons (v1.46), Box soft-lock (v1.45), MESH drag-drop / chooser parity (v1.41–1.44). Sketch `对称`→Symmetric intact.

## Before → After
| Label | v1.48 (SC) | v1.49 (TC/HK) |
|-------|------------|---------------|
| SOLID Create Form | 创建造型 | **建立造型** |
| FORM Box | 长方体 | **長方體** |
| FORM Cylinder | 圆柱 | **圓柱** |
| FORM Pipe | 管道 | 管道 |
| FORM Edit | 编辑造型 | **編輯造型** |

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-CZI1-e8t-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.49-20260919-102550` |
| Previous (kept) | `/var/www/webcad-releases/v1.48-20260919-101502` |
| nginx root | **sites-available + sites-enabled** → v1.49 release |
| current symlink | → `v1.49-20260919-102550` |
| entry md5 | `ebecc4eed3e70b38fa7172e97cf4746a` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.49-20260919-102550;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.49-20260919-102550;
```
Both point at the **NEW** v1.49 release (not stuck on v1.48).

## Verification
- Public `index.html` references `index-CZI1-e8t-r2.js` ✓
- Live JS contains `1.49` ✓
- Live entry md5 matches local (`ebecc4eed3e70b38fa7172e97cf4746a`) ✓
- Live entry contains `建立造型`, `長方體`, `圓柱`, `管道`, `四邊形球體`, `編輯造型`, `完成造型`, `form-workspace-tab`, `form-pipe-hint` ✓
- Live entry does **not** contain `创建造型` ✓
- Live entry retains `form-create-plane-hint`, `placeFormBoxOnOriginPlane`, `acceptMeshDropFile` ✓
- Contracts: v1.46–v1.49 Form QA **PASS** (33/33)

## BOT-D verify steps (BUG-BD-4801)
1. (Optional) MESH: drag STL — still PASS.
2. SOLID → **建立造型** → FORM tab shows **造型**.
3. FORM ribbon CREATE shows **長方體** / **圓柱** / 球 / **管道** (not 长方体／圆柱; not Box/Cylinder/Pipe).
4. Click **圓柱** → XY → **確定** → **完成造型**.
5. MODIFY: **編輯造型** / **細分**; Finish pin 完成造型.
