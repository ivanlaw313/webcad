# DEPLOY-RESULT v1.46

**Date:** 2026-09-19 05:57 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/93 (MERGED → `feat/native-car-stage1-20260906`)  
**Site:** https://cad.neuralworkshk.com/

## Ship contents
- **Form Cylinder/Sphere/Plane/Torus/Face/Quadball:** Create Form Plane control upgraded from `<select>` to **XY / XZ / YZ** buttons (parity with Box v1.45).
- Chinese UI: 平面 / 确定 / 取消 / 创建造型 when `lang !== 'en'`; hint「点 XY / XZ / YZ 选基准面，再点确定」.
- APP_VERSION **1.46** + contract `grok-qa-v1.46-form-plane-buttons`.
- Keeps Box plane / Finish soft-lock fix (v1.45) and MESH drag-drop / chooser parity (v1.41–1.44).

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-DZzbxrOZ-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.46-20260919-055735` |
| Previous (kept) | `/var/www/webcad-releases/v1.45-20260919-054530` |
| nginx root | **sites-available + sites-enabled** → v1.46 release |
| current symlink | → `v1.46-20260919-055735` |
| entry md5 | `98480bff6f27d112469f26d5842e8488` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.46-20260919-055735;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.46-20260919-055735;
```
Both point at the **NEW** v1.46 release (not stuck on v1.45).

## Verification
- Public `index.html` references `index-DZzbxrOZ-r2.js` ✓
- Live JS contains `1.46` ✓
- Live entry md5 matches local (`98480bff6f27d112469f26d5842e8488`) ✓
- Live entry contains `form-create-plane-hint`, `placeFormBoxOnOriginPlane`, `acceptMeshDropFile`, `创建造型` ✓
- Contracts: `grok-qa-v1.46-form-plane-buttons` + `grok-qa-v1.45-form-box-plane` **PASS** (11/11)

## BOT-D verify steps (FORM)
1. (Optional) MESH: drag STL — still PASS; leave `cube_20mm` in scene.
2. SOLID → **Create Form** → FORM ribbon → **Cylinder** (or Sphere).
3. In Create Form dialog click **XY** (or XZ/YZ) — button highlights; hint shows selected plane.
4. Click **确定** → Edit Form cage appears, oriented to chosen plane.
5. Click **Finish Form** → returns to SOLID with Form component.
6. Regression: Create Form → **Box** → XY → 确定 → Finish (v1.45 path still works).
