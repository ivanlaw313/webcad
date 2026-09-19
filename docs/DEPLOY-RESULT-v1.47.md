# DEPLOY-RESULT v1.47

**Date:** 2026-09-19 10:05 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/95 (MERGED → `feat/native-car-stage1-20260906`)  
**Site:** https://cad.neuralworkshk.com/

## Ship contents
- **Create Form Pipe:** Chinese labels 路径点 / 轮廓 / 圆 / 直径 / 轮廓面数 + hint「输入路径点后点确定…」(Pipe has **no** origin-plane control — path-based).
- Create Form dimension rows Chinese (直径/高度/长度/宽度/面数/大径Ø/管径Ø); Box draft rows Chinese.
- Edit Form: title 编辑造型; ✓ 完成造型 / 取消造型; Ribbon finish pin parity with 完成草图.
- APP_VERSION **1.47** + contract `grok-qa-v1.47-form-chinese-labels`.
- Keeps plane buttons (v1.46), Box soft-lock (v1.45), MESH drag-drop / chooser parity (v1.41–1.44).

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-DkCMF0nw-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.47-20260919-100441` |
| Previous (kept) | `/var/www/webcad-releases/v1.46-20260919-055735` |
| nginx root | **sites-available + sites-enabled** → v1.47 release |
| current symlink | → `v1.47-20260919-100441` |
| entry md5 | `a4175f7ce38d2ded811d14493d1d0d19` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.47-20260919-100441;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.47-20260919-100441;
```
Both point at the **NEW** v1.47 release (not stuck on v1.46).

## Verification
- Public `index.html` references `index-DkCMF0nw-r2.js` ✓
- Live JS contains `1.47` ✓
- Live entry md5 matches local (`a4175f7ce38d2ded811d14493d1d0d19`) ✓
- Live entry contains `完成造型`, `编辑造型`, `路径点`, `form-pipe-hint` ✓
- Live entry retains `form-create-plane-hint`, `placeFormBoxOnOriginPlane`, `acceptMeshDropFile` ✓
- Contracts: `grok-qa-v1.47-form-chinese-labels` + v1.46 + v1.45 **PASS** (17/17)

## BOT-D verify steps (FORM)
1. (Optional) MESH: drag STL — still PASS; leave `cube_20mm` in scene.
2. SOLID → **Create Form** → FORM ribbon → **Pipe**.
3. Dialog shows 路径点 / 轮廓 / 直径 / 轮廓面数 (Chinese UI); hint visible; **no** XY/XZ/YZ plane row.
4. Click **确定** → Edit Form cage (title 编辑造型).
5. Click **完成造型** (panel or ribbon pin) → returns to SOLID.
6. Regression: Create Form → **Cylinder** → XY → 确定 → 完成造型 (v1.46 plane buttons still work).
7. Regression: Create Form → **Box** → XY → 确定 → 完成造型 (v1.45 path).
