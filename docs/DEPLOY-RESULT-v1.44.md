# DEPLOY-RESULT v1.44

**Date:** 2026-09-19 05:22 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/89 (MERGED → `feat/native-car-stage1-20260906`)  
**Site:** https://cad.neuralworkshk.com/

## Ship contents
- **File→导入 status parity:** `openStlDialog` / `openObjDialog` / `open3MFDialog` show `正在读取 …「name」…` (busy) before insert/import — same as `acceptMeshDropFile`; read-fail → Chinese `… 读取失败`.
- **MESH tab drop hint:** `setActiveTab('MESH')` sets `MESH_TAB_DROP_HINT` when idle (`可将 .stl / .obj / .3mf 拖到视口导入…`).
- MESH INSERT tip mentions viewport drag-drop; i18n Chinese identities; contract `grok-qa-v1.44-mesh-chooser-parity`.
- Keeps v1.40 STL cancel + v1.41–1.43 drag-drop host/overlay.
- **APP_VERSION:** `1.44` (live bundle `index-DCdCiQDx-r2.js`).

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-DCdCiQDx-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.44-20260919-052050` |
| Previous (kept) | `/var/www/webcad-releases/v1.43-20260919-050424` |
| nginx root | **sites-available + sites-enabled** → v1.44 release (bak → `/etc/nginx/bak-cad/cad.conf.bak-before-v1.44`) |
| current symlink | → `v1.44-20260919-052050` |
| entry md5 | `2a9cd579fe1c36de405ab2ffe0c45f57` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.44-20260919-052050;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.44-20260919-052050;
```
Both point at the **NEW** v1.44 release (not stuck on v1.43).

## Verification
- Public `index.html` references `index-DCdCiQDx-r2.js` ✓
- Live JS contains `1.44` ✓
- Live entry md5 matches local (`2a9cd579fe1c36de405ab2ffe0c45f57`) ✓
- Live entry contains `可将 .stl`, `拖到视口导入`, `acceptMeshDropFile` ✓
- Contracts: `grok-qa-v1.44-mesh-chooser-parity` + v1.40–v1.43 **PASS**

## Notes / verify steps
- Switch ribbon to **MESH** → status bar: `可将 .stl / .obj / .3mf 拖到视口导入（或用「插入STL」/ File→导入）`.
- File→导入 STL / 插入STL / Alt+O → after pick: `正在读取 STL「…」…` then insert dialog; cancel still clears busy (`已取消选择 STL`).
- Drag-drop STL still primary BOT-D path (overlay + insert; no regress).
