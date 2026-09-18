# DEPLOY-RESULT v1.43

**Date:** 2026-09-19 05:05 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/87 (MERGED → `feat/native-car-stage1-20260906`)  
**Site:** https://cad.neuralworkshk.com/

## Ship contents
- **BUG-BD-4101:** Document-level `meshDropHost` (capture) + viewport overlay above WebGL `<canvas>` while drag is armed.
- `filesFromDataTransfer` / `resolveMeshDropFromDataTransfer` — `items.getAsFile()` when FileList empty.
- Broader `shouldAllowMeshDragOver` (uri-list / plain-only / application/* / empty types).
- Chinese status while armed (`松开以导入网格…`) and on empty drop (`未能读取拖放文件…`) — never silent no-op.
- Keeps `acceptMeshDropFile` → `openMeshInsert` / `import3MF` + v1.40 STL cancel harden.
- **APP_VERSION:** `1.43` (live bundle `index-06m2Cj4H-r2.js`).

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-06m2Cj4H-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.43-20260919-050424` |
| Previous (kept) | `/var/www/webcad-releases/v1.42-20260919-044528` |
| nginx root | **sites-available + sites-enabled** → v1.43 release (bak → `/etc/nginx/bak-cad/cad.conf.bak-before-v1.43`) |
| current symlink | → `v1.43-20260919-050424` |
| entry md5 | `78c18a686e234df61da4024e777df710` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.43-20260919-050424;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.43-20260919-050424;
```
Both point at the **NEW** v1.43 release (not stuck on v1.42).

## Verification
- Public `index.html` references `index-06m2Cj4H-r2.js` ✓
- Live JS contains `1.43` ✓
- Live entry md5 matches local (`78c18a686e234df61da4024e777df710`) ✓
- Live entry contains `data-mesh-drop-overlay`, `未能读取拖放`, `松开以导入网格`, `acceptMeshDropFile` ✓
- Contracts: `grok-qa-v1.43-stl-drop-overlay` + v1.40–v1.42 **PASS**

## Notes
- BOT-D: **drag `cube_20mm.stl` into the LIVE 1.43 viewport** (canvas area) → blue dashed overlay “松开以导入网格…” while dragging → release → insert dialog / mesh.
- Empty / non-file drop should show Chinese `未能读取拖放文件…` (not silent).
- Wrong-type drop → `不支持的网格拖放…`.
- File menu / insertmesh / Alt+O chooser path unchanged.
