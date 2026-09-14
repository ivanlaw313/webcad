# DEPLOY-RESULT v1.27

**Date:** 2026-09-14  
**PR:** https://github.com/ivanlaw313/webcad/pull/57 (MERGED → `feat/native-car-stage1-20260906` @ `92dd73a`)  
**Site:** https://cad.neuralworkshk.com/

## Ship contents
- **BX02 bodyboolean CUT:** heal operands + `_cutRobust` + auto-swap when target−tool empties but tool−target has volume (fixes `新实体` then contained tool cut rebuild toast).
- Box/cylinder dialogs expose **⬡新实体** so tool can park while target stays active.
- Combine status/hint documents auto-swap + preferred hole workflow.
- **APP_VERSION:** `1.27` (live bundle `index-CDwc3kwn-r2.js`).

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-CDwc3kwn-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.27-20260914-104525` |
| Previous (kept) | `/var/www/webcad-releases/v1.26-20260914-094012` |
| nginx root | **sites-available + sites-enabled** → v1.27 release (bak → `/etc/nginx/bak-cad/cad.conf.bak-before-v1.27`) |
| current symlink | → `v1.27-20260914-104525` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.27-20260914-104525;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.27-20260914-104525;
```
Both point at the **NEW** v1.27 release (not stuck on v1.26).

## Verification
- Public `index.html` references `index-CDwc3kwn-r2.js` ✓
- Live JS contains `1.27` + auto-swap / combine hint strings ✓
- Contract: `tests/grok-qa-v1.27-bx02-bodyboolean-cut.test.mjs` 7/7 PASS
- Regression: `tests/grok-qa-v1.19-bx02-cut-rim-fillet.test.mjs` 7/7 PASS
- `tsc -b` + `vite build` clean

## Notes
- Solid bot should retest classic BX02: cut + Fillet R1 + Shell t=1.5 (shell pick residual possible).
