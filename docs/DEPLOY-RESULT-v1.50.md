# DEPLOY-RESULT v1.50

**Date:** 2026-09-19 10:37 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/101 (MERGED → `feat/native-car-stage1-20260906`)  
**Site:** https://cad.neuralworkshk.com/  
**Choice:** SOLID (+ MESH) CREATE Traditional Chinese — continue BUG-BD-4801 orthography

## Ship contents
- SOLID CREATE: **建立草圖** / **長方體** / **圓柱** / **圓環** (was 创建草图／长方体／圆柱／圆环).
- MESH CREATE Box/Cylinder Traditional; SHEET/PLASTIC sketch·box aligned.
- Feature dialog FD_TITLE + viewport quick menu / MM sketch label Traditional.
- EN via existing `tLabel` keys (`建立草圖`/`長方體`/`圓柱`/`圓環`).
- APP_VERSION **1.50** + contract `grok-qa-v1.50-solid-create-traditional`.
- Keeps FORM TC (v1.49), plane buttons (v1.46), Box soft-lock (v1.45), MESH DnD (v1.41–1.44). Sketch `对称`→Symmetric intact. Status tips may still mention 创建草图 (non-ribbon).

## Before → After
| Surface | v1.49 (SC leftover) | v1.50 (TC/HK) |
|---------|---------------------|---------------|
| SOLID Create Sketch | 创建草图 | **建立草圖** |
| SOLID/MESH Box | 长方体 | **長方體** |
| SOLID/MESH Cylinder | 圆柱 | **圓柱** |
| SOLID Torus | 圆环 | **圓環** |
| FORM Create Form | 建立造型 | 建立造型 *(unchanged)* |

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-Bt2Gwqj8-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.50-20260919-103626` |
| Previous (kept) | `/var/www/webcad-releases/v1.49-20260919-102550` |
| nginx root | **sites-available + sites-enabled** → v1.50 release |
| current symlink | → `v1.50-20260919-103626` |
| entry md5 | `0440b5dc2110b3625d24b1063b644e6b` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.50-20260919-103626;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.50-20260919-103626;
```
Both point at the **NEW** v1.50 release (not stuck on v1.49).

## Verification
- Public `index.html` references `index-Bt2Gwqj8-r2.js` ✓
- Live JS contains `1.50` ✓
- Live entry md5 matches local (`0440b5dc2110b3625d24b1063b644e6b`) ✓
- Live entry contains `建立草圖`, `長方體`, `圓柱`, `圓環`, `建立造型`, `完成造型` ✓
- Live entry does **not** contain `创建造型` ✓
- Live entry retains `form-create-plane-hint`, `placeFormBoxOnOriginPlane`, `acceptMeshDropFile` ✓
- Contracts: v1.46–v1.50 Form/CREATE QA **PASS** (33/33)

## BOT-D verify steps
1. (Optional) MESH: drag STL — still PASS.
2. SOLID ribbon CREATE: **建立草圖** / **長方體** / **圓柱** (not 创建草图／长方体／圆柱).
3. Click **長方體** → dialog title 長方體 → OK.
4. SOLID → **建立造型** → FORM still Traditional; plane XY → **完成造型**.
5. MESH tab CREATE: **長方體** / **圓柱**.
