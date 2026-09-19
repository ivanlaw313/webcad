# DEPLOY-RESULT v1.48

**Date:** 2026-09-19 10:15 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/97 (MERGED → `feat/native-car-stage1-20260906`)  
**Site:** https://cad.neuralworkshk.com/

## Ship contents
- **FORM contextual ribbon:** Chinese source labels — 长方体 / 圆柱 / 球 / 圆环 / 四边形球体 / 管道 / 面 / 编辑造型 / 细分 / 插入边 / 折痕 / … (EN via `tLabel`).
- SOLID entry **创建造型** (was `Create Form`); FORM workspace tab chip zh **造型**.
- ZH_GROUP SYMMETRY/UTILITIES; ZH_TAB FORM; FormPalette aria 收起或展开造型面板.
- APP_VERSION **1.48** + contract `grok-qa-v1.48-form-ribbon-chinese`.
- Keeps Pipe/dims/Finish Chinese (v1.47), plane buttons (v1.46), Box soft-lock (v1.45), MESH drag-drop / chooser parity (v1.41–1.44).

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-DGOIlrBT-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.48-20260919-101502` |
| Previous (kept) | `/var/www/webcad-releases/v1.47-20260919-100441` |
| nginx root | **sites-available + sites-enabled** → v1.48 release |
| current symlink | → `v1.48-20260919-101502` |
| entry md5 | `60826f059b7808988814b06662165f22` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.48-20260919-101502;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.48-20260919-101502;
```
Both point at the **NEW** v1.48 release (not stuck on v1.47).

## Verification
- Public `index.html` references `index-DGOIlrBT-r2.js` ✓
- Live JS contains `1.48` ✓
- Live entry md5 matches local (`60826f059b7808988814b06662165f22`) ✓
- Live entry contains `创建造型`, `四边形球体`, `编辑造型`, `form-workspace-tab`, `完成造型`, `form-pipe-hint` ✓
- Live entry retains `form-create-plane-hint`, `placeFormBoxOnOriginPlane`, `acceptMeshDropFile` ✓
- Contracts: `grok-qa-v1.48-form-ribbon-chinese` + v1.47 + v1.46 + v1.45 **PASS** (26/26)

## BOT-D verify steps (FORM ribbon)
1. (Optional) MESH: drag STL — still PASS; leave `cube_20mm` in scene.
2. SOLID → **创建造型** (Chinese label) → FORM tab shows **造型**.
3. FORM ribbon CREATE shows 长方体 / 圆柱 / 球 / 管道 / 四边形球体 (not Box/Cylinder/Pipe).
4. Click **圆柱** → Create Form dialog → XY → **确定** → **完成造型** (v1.46/1.47 regress).
5. MODIFY group: 编辑造型 / 细分 still Chinese; Finish pin 完成造型.
