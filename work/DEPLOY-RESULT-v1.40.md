# DEPLOY-RESULT v1.40

**Date:** 2026-09-19 04:04 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/81 (MERGED → `feat/native-car-stage1-20260906`)  
**Site:** https://cad.neuralworkshk.com/

## Ship contents
- **Component Boolean Chinese UX** — STATUS_PHRASES_X identities for `已切除「` / `已合并「` / `已相交「` and bake chip `烘焙为零件实体` so EN `tStatus` no longer yields `Done:` / `Bake into part solid`.
- **MESH STL chooser (BUG-BD-3901)** — `openStlDialog` cancel clears `busy`/`status` (FSA AbortError + `<input cancel>` + focus fallback); File→导入 STL and insertmesh still share the same robust picker.
- Keeps v1.39 mate-after-edit / consume-tool mates, v1.38 solid Chinese toasts, v1.37 Shell CLEAN / LTR `tStatus`, v1.36 join budgets, v1.35 DXF.
- **APP_VERSION:** `1.40` (live bundle `index-B3Qktpkj-r2.js`).

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-B3Qktpkj-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.40-20260919-040407` |
| Previous (kept) | `/var/www/webcad-releases/v1.39-20260919-033250` |
| nginx root | **sites-available + sites-enabled** → v1.40 release (bak → `/etc/nginx/bak-cad/cad.conf.bak-before-v1.40`) |
| current symlink | → `v1.40-20260919-040407` |
| entry md5 | `d13b42ba244673b7ecf0a27ebf0787a1` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.40-20260919-040407;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.40-20260919-040407;
```
Both point at the **NEW** v1.40 release (not stuck on v1.39).

## Verification
- Public `index.html` references `index-B3Qktpkj-r2.js` ✓
- Live JS contains `1.40` ✓
- Live entry md5 matches local (`d13b42ba244673b7ecf0a27ebf0787a1`) ✓
- Live entry contains `烘焙为零件实体`, `已取消选择 STL`, `已切除「` identities ✓
- Contracts: `grok-qa-v1.40-compbool-bake-zh-stl` + v1.37/v1.38/v1.39 **PASS**

## Notes
- Solid bot: component boolean cut → toast Chinese (`已切除…`, no `Done:`); bake chip `烘焙为零件实体` (not Bake into part solid). Shell CLEAN / Extrude Chinese still intact.
- BOT-D: MESH Import STL cancel clears status; File menu path (no command palette required). FORM/ASSY smoke on LIVE 1.40.
