# DEPLOY-RESULT v1.24

**Date:** 2026-09-14  
**PR:** https://github.com/ivanlaw313/webcad/pull/54 (MERGED → `feat/native-car-stage1-20260906` @ `9065077`)  
**Site:** https://cad.neuralworkshk.com/

## Ship contents
- **Shell soft status EN/ZH:** full phrases `抽壳完成（备用：直柱型腔|开口面偏移型腔）` + i18n → clean EN (`Shell done (fallback: …)`). No more mangled `抽殼done (备用rebuild…)`.
- **OCCT path:** coplanar same-Z planar openings via `tryBases` **before** cavity (G1 chain still after cavity for CX02). Copy-heal / alt lids preserved.
- **Component Boolean bake:** primary status-bar button `烘焙为零件实体` (`statusAction` / `runStatusAction`) — no blocking confirm.
- **Fillet/Shell dead-end:** one-click `MeshFit / 转 B-rep` statusAction when mesh components present.
- **APP_VERSION:** `1.24` (`var zt=\`1.24\`` in live bundle).

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-BRqTmqDT-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.24-20260914-064720` |
| Previous (kept) | `/var/www/webcad-releases/v1.23-20260914-055001` |
| nginx root | switched in `/etc/nginx/sites-enabled/cad.conf` (bak moved to `/etc/nginx/bak-cad/`) |
| current symlink | → `v1.24-20260914-064720` |

## Verification
- Public `index.html` references `index-BRqTmqDT-r2.js` ✓
- Live JS: `var zt=\`1.24\`` + Ribbon `WebCAD · version` ✓
- Bundle contains `status-action` / `bakeMeshToPart` / `抽壳完成（备用：` ✓
- Contract: `tests/grok-qa-v1.24-shell-bake-ux.test.mjs` PASS (+ v1.22/v1.23 suites)
- BX02-like runtime still soft cavity OK with clean bilingual wording
- `tsc -b` clean

## Notes
- BX02 hard OCCT still soft (cavity fallback) — ship accepted clearer bake + status polish per plan.
- Moved `cad.conf.bak-before-v1.23` / `bak-before-v1.24` out of `sites-enabled` (duplicate server_name conflict).
