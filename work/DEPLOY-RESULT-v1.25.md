# DEPLOY-RESULT v1.25

**Date:** 2026-09-14  
**PR:** https://github.com/ivanlaw313/webcad/pull/55 (MERGED → `feat/native-car-stage1-20260906` @ `70e205d`)  
**Site:** https://cad.neuralworkshk.com/

## Ship contents
- **Component Boolean tool-pick:** canonical `pickComponentBooleanTool` / `cancelComponentBoolean`.
- Completes via: Browser tree name click, viewport click, checkbox, or `CompBoolPickPanel` list buttons.
- **Bugs fixed:** `selectComponentBody` no longer wipes `compBoolPending` without running Boolean; re-click source / empty click keep pending with reminder (no silent cancel); Esc cancels.
- Status text documents all pick paths.
- After successful Boolean: primary status-bar **「烘焙为零件实体」** (`statusAction` / `bakeMeshToPart`) always set.
- **APP_VERSION:** `1.25` (live bundle `index-BmenxKlL-r2.js`).

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-BmenxKlL-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.25-20260914-082649` |
| Previous (kept) | `/var/www/webcad-releases/v1.24-20260914-064720` |
| nginx root | switched in `/etc/nginx/sites-enabled/cad.conf` (bak → `/etc/nginx/bak-cad/cad.conf.bak-before-v1.25`) |
| current symlink | → `v1.25-20260914-082649` |

## Verification
- Public `index.html` references `index-BmenxKlL-r2.js` ✓
- Live JS contains `1.25` + `pickComponentBooleanTool` + `comp-bool-pick` + `bakeMeshToPart` ✓
- Contract: `tests/grok-qa-v1.25-compbool-pick.test.mjs` 10/10 PASS
- `tsc -b` + `vite build` clean

## Notes
- Addresses solid-bot FAIL @1.24 (stalled on pick tool → never showed bake chip).
- Classic BX02 / MeshFit chip paths unchanged.
