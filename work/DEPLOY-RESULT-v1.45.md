# DEPLOY-RESULT v1.45

**Date:** 2026-09-19 05:46 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/91 (MERGED → `feat/native-car-stage1-20260906`)  
**Site:** https://cad.neuralworkshk.com/

## Ship contents
- **BUG-BD-4401 FIXED:** Create Form → Box plane pick soft-lock.
  - Dialog **XY / XZ / YZ** → `placeFormBoxOnOriginPlane` (plane + default center → ready).
  - OK enabled when plane set; `commitFormBoxDraft` fills default center if needed.
  - Origin construction planes pickable during Form Box plane stage; larger RGB datums (160); camera frames origin on plane stage.
  - `finishForm` auto-cancels in-flight create (no Cancel-required soft-lock).
- APP_VERSION **1.45** + contract `grok-qa-v1.45-form-box-plane`.
- Keeps MESH drag-drop / chooser parity (v1.41–1.44).

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-DQc8_P6G-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.45-20260919-054530` |
| Previous (kept) | `/var/www/webcad-releases/v1.44-20260919-052050` |
| nginx root | **sites-available + sites-enabled** → v1.45 release |
| current symlink | → `v1.45-20260919-054530` |
| entry md5 | `8009d02cde4c25c4cb926d951f91187c` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.45-20260919-054530;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.45-20260919-054530;
```
Both point at the **NEW** v1.45 release (not stuck on v1.44).

## Verification
- Public `index.html` references `index-DQc8_P6G-r2.js` ✓
- Live JS contains `1.45` ✓
- Live entry md5 matches local (`8009d02cde4c25c4cb926d951f91187c`) ✓
- Live entry contains `placeFormBoxOnOriginPlane`, `form-box-plane`, `Select XY/XZ/YZ`, `acceptMeshDropFile` ✓
- Contracts: `grok-qa-v1.45-form-box-plane` + v1.41–v1.44 MESH **PASS**

## BOT-D verify steps (FORM)
1. (Optional) MESH: drag STL — still PASS; leave `cube_20mm` in scene.
2. SOLID → **Create Form** → FORM ribbon → **Box**.
3. In Create Form dialog click **XY** (or XZ/YZ) — hint leaves plane stage; OK enables.
4. Click **OK** → Edit Form cage appears.
5. Click **Finish Form** → returns to SOLID with Form component (no Cancel needed).
6. Negative: start Box, click **Finish Form** without OK → exits FORM (create cancelled; no soft-lock).
