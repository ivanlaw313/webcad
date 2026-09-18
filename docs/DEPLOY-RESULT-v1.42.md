# DEPLOY-RESULT v1.42

**Date:** 2026-09-19 04:47 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/85 (MERGED → `feat/native-car-stage1-20260906`)  
**Site:** https://cad.neuralworkshk.com/

## Ship contents
- **BUG-BD-4101:** Capture-phase STL/OBJ/3MF drag-drop on viewport + app so WebGL `<canvas>` cannot swallow drops.
- `shouldAllowMeshDragOver` preventDefaults when automation omits `Files` in types until drop.
- `resolveMeshDropFile` → mesh or first file (visible Chinese `不支持的网格拖放…` reject).
- Keeps v1.40 STL cancel harden + v1.41 `acceptMeshDropFile` → `openMeshInsert` / `import3MF`.
- **APP_VERSION:** `1.42` (live bundle `index-U7vZR6Vh-r2.js`).

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-U7vZR6Vh-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.42-20260919-044528` |
| Previous (kept) | `/var/www/webcad-releases/v1.41-20260919-042503` |
| nginx root | **sites-available + sites-enabled** → v1.42 release (bak → `/etc/nginx/bak-cad/cad.conf.bak-before-v1.42`) |
| current symlink | → `v1.42-20260919-044528` |
| entry md5 | `77d7fe298331c007605b1c27922f7973` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.42-20260919-044528;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.42-20260919-044528;
```
Both point at the **NEW** v1.42 release (not stuck on v1.41).

## Verification
- Public `index.html` references `index-U7vZR6Vh-r2.js` ✓
- Live JS contains `1.42` ✓
- Live entry md5 matches local (`77d7fe298331c007605b1c27922f7973`) ✓
- Live entry contains `acceptMeshDropFile`, `data-mesh-drop-capture`, `正在读取 STL`, `不支持的网格拖放`, `烘焙为零件实体`, `已切除「`, `已抽壳 壁厚` ✓
- Contracts: `grok-qa-v1.42-stl-drop-canvas` + v1.37–v1.41 **PASS**

## Notes
- BOT-D: **drag `cube_20mm.stl` into the LIVE 1.42 viewport** (canvas area) → insert dialog / mesh (do **not** rely on File→导入 STL chooser).
- Wrong-type drop should show Chinese `不支持的网格拖放…`.
- File menu / insertmesh / Alt+O chooser path unchanged (v1.40 cancel harden intact).
- Solid smoke: Shell CLEAN / Extrude / component boolean Chinese still intact (no `Done:`).
