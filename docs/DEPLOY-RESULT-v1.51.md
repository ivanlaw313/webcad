# DEPLOY-RESULT v1.51

**Date:** 2026-09-19 10:46 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/103 (MERGED → `feat/native-car-stage1-20260906`)  
**Site:** https://cad.neuralworkshk.com/  
**Choice:** Illegal UX reject Traditional Chinese — 「尺寸已拒絕」 (was Simplified「尺寸已拒绝」)

## Ship contents
- Unified marker `ILLEGAL_REJECT_MARKER`: **尺寸已拒絕**.
- Shared details: **壁厚必須大於 0** / **尺寸必須大於 0，未更改模型** / **孔徑Ø必須大於 0**.
- Hole alert + sketch/param/formula reject strings on the same path → TC.
- APP_VERSION **1.51** + contract `grok-qa-v1.51-illegal-reject-traditional`.
- Keeps FORM TC (v1.49), SOLID CREATE TC (v1.50), plane buttons (v1.46), Box soft-lock (v1.45), MESH DnD (v1.41–1.44). Sketch `对称`→Symmetric intact.

## Before → After
| Surface | v1.50 (SC leftover) | v1.51 (TC/HK) |
|---------|---------------------|---------------|
| Illegal reject marker | 尺寸已拒绝 | **尺寸已拒絕** |
| Shell thickness detail | 壁厚必须大于 0 | **壁厚必須大於 0** |
| Length detail | 尺寸必须大于 0… | **尺寸必須大於 0…** |
| Hole Ø detail / alert | 孔径Ø必须大于 0 | **孔徑Ø必須大於 0** |
| SOLID CREATE | 建立草圖／長方體 | unchanged |

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-DSqMGnwm-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.51-20260919-104520` |
| Previous (kept) | `/var/www/webcad-releases/v1.50-20260919-103626` |
| nginx root | **sites-available + sites-enabled** → v1.51 release |
| current symlink | → `v1.51-20260919-104520` |
| entry md5 | `be23e9a7020abe15e43a847eac9d0402` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.51-20260919-104520;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.51-20260919-104520;
```
Both point at the **NEW** v1.51 release (not stuck on v1.50).

## Verification
- Public `index.html` references `index-DSqMGnwm-r2.js` ✓
- Live JS contains `1.51` ✓
- Live entry md5 matches local (`be23e9a7020abe15e43a847eac9d0402`) ✓
- Live entry contains `尺寸已拒絕`, `建立草圖`, `建立造型`, `長方體`, `完成造型` ✓
- Live entry does **not** contain `尺寸已拒绝` or `创建造型` ✓
- Live entry retains `form-create-plane-hint`, `placeFormBoxOnOriginPlane`, `acceptMeshDropFile` ✓
- Contracts: static Form/CREATE/illegal QA **PASS** (47/47)

## BOT-D verify steps
1. (Optional) MESH: drag STL — still PASS.
2. SOLID → **長方體** → set a length ≤0 (or Shell thickness ≤0) → alert/status shows **尺寸已拒絕** (not 拒绝).
3. Hole Ø ≤0 → hole-illegal-alert **尺寸已拒絕：孔徑Ø必須大於 0…**.
4. SOLID → **建立造型** → plane XY → **完成造型** (FORM TC intact).
5. SOLID CREATE still **建立草圖** / **長方體** / **圓柱**.
