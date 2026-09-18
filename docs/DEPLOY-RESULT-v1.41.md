# DEPLOY-RESULT v1.41

**Date:** 2026-09-19 04:25 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/83 (MERGED → `feat/native-car-stage1-20260906`)  
**Site:** https://cad.neuralworkshk.com/

## Ship contents
- **STL / OBJ / 3MF drag-and-drop** onto viewport (`data-mesh-drop=viewport`) and app shell (`data-mesh-drop=app`).
- `acceptMeshDropFile` routes to existing `openMeshInsert` (stl/obj) / `import3MF` — same insert dialog + progress as `openStlDialog` success path (no duplicated parsers).
- Pure filter helpers in `src/io/meshDrop.ts`; Chinese drop status identities in STATUS_PHRASES_X.
- Keeps v1.40 STL cancel harden, component boolean Chinese, Shell CLEAN / DXF.
- **APP_VERSION:** `1.41` (live bundle `index-AXS9xY5s-r2.js`).

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-AXS9xY5s-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.41-20260919-042503` |
| Previous (kept) | `/var/www/webcad-releases/v1.40-20260919-040407` |
| nginx root | **sites-available + sites-enabled** → v1.41 release (bak → `/etc/nginx/bak-cad/cad.conf.bak-before-v1.41`) |
| current symlink | → `v1.41-20260919-042503` |
| entry md5 | `b69a9a852ef45481d59f48128b4117a7` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.41-20260919-042503;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.41-20260919-042503;
```
Both point at the **NEW** v1.41 release (not stuck on v1.40).

## Verification
- Public `index.html` references `index-AXS9xY5s-r2.js` ✓
- Live JS contains `1.41` ✓
- Live entry md5 matches local (`b69a9a852ef45481d59f48128b4117a7`) ✓
- Live entry contains `acceptMeshDropFile`, `正在读取 STL`, `不支持的网格拖放`, `烘焙为零件实体`, `已切除「`, `已抽壳 壁厚` ✓
- Contracts: `grok-qa-v1.41-stl-drag-drop` + v1.37–v1.40 **PASS**

## Notes
- BOT-D: **drag an `.stl` into the viewport** (preferred) — should open STL insert dialog / import mesh without relying on native File→导入 STL chooser.
- File menu / insertmesh / Alt+O chooser path unchanged (v1.40 cancel harden intact).
- Solid smoke: Shell CLEAN / Extrude / component boolean Chinese still intact (no `Done:`).
