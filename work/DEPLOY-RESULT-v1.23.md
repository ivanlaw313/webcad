# DEPLOY-RESULT v1.23

**Date:** 2026-09-14  
**PR:** https://github.com/ivanlaw313/webcad/pull/53 (MERGED → `feat/native-car-stage1-20260906` @ `1623aad`)  
**Site:** https://cad.neuralworkshk.com/

## Ship contents
- **P0 Component Boolean UX:** Fillet / Chamfer / Shell / FaceFillet use `partSolidRequiredStatus` — guides MeshFit/转 B-rep, ✎编辑, 实体布尔 (not bare `先要有实体`).
- **P0 Bake offer:** After successful `componentBoolean`, confirm → `convertMeshComponent` + `editComponent` when needed.
- **P1 Shell:** alternate-planar-open `tryBases` keeps `validShellSolid` guard (v1.22 copy-heal/alt lids preserved).
- **APP_VERSION:** `1.23` (`var zt=\`1.23\`` in live bundle).

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-DzXjHfis-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.23-20260914-055001` |
| Previous (kept) | `/var/www/webcad-releases/v1.22-20260914-044600` |
| nginx root | switched in `/etc/nginx/sites-enabled/cad.conf` (bak: `.bak-before-v1.23`) |
| current symlink | → `v1.23-20260914-055001` |

## Verification
- Public `index.html` references `index-DzXjHfis-r2.js` ✓
- Live JS: `var zt=\`1.23\`` + Ribbon `data-testid=app-version` → `WebCAD · version ` + zt ✓
- Contract: `tests/grok-qa-v1.23-compbool-ux.test.mjs` PASS
- Shell CX02/BX02-ish (v1.22 suite w/ resolver) PASS
- `tsc -b` clean for changes

## Notes
- First upload to `/var/www/webcad` alone does **not** go live — site serves `webcad-releases/vX.Y-…` via nginx root.
- Sketch A01 suite not expanded this ship (timebox; non-blocking).
