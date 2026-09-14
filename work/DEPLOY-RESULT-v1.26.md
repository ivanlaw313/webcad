# DEPLOY-RESULT v1.26

**Date:** 2026-09-14  
**PR:** https://github.com/ivanlaw313/webcad/pull/56 (MERGED → `feat/native-car-stage1-20260906` @ `efadb68`)  
**Site:** https://cad.neuralworkshk.com/

## Ship contents
- **Ribbon `compboolean` / 组件布尔** on SOLID → ASSEMBLE, MESH → MODIFY (near meshfit), 🧪實驗室 near 实体布尔.
- `runCommand('compboolean')` → selected / unique mesh component → `startComponentBoolean`; else status asks to select in Browser.
- BrowserTree ⋯ 「组件布尔」; CompBoolPickPanel + bake chip kept.
- **APP_VERSION:** `1.26` (live bundle `index-CwoPr22V-r2.js`).

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-CwoPr22V-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.26-20260914-094012` |
| Previous (kept) | `/var/www/webcad-releases/v1.25-20260914-082649` |
| nginx root | **sites-available + sites-enabled** → v1.26 release (bak → `/etc/nginx/bak-cad/cad.conf.bak-before-v1.26`) |
| current symlink | → `v1.26-20260914-094012` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.26-20260914-094012;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.26-20260914-094012;
```
Both point at the **NEW** v1.26 release (not stuck on v1.20 / v1.25).

## Verification
- Public `index.html` references `index-CwoPr22V-r2.js` ✓
- Live JS contains `1.26` + `compboolean` + `startComponentBoolean` + `comp-bool-pick` + `bakeMeshToPart` + `组件布尔` ✓
- Contract: `tests/grok-qa-v1.26-compbool-ribbon.test.mjs` 8/8 PASS
- `fusion-solid-menu-order` PASS (compboolean not mixed into Fusion MODIFY)
- `tsc -b` + `vite build` clean

## Notes
- Addresses solid-bot FAIL @1.25 (cannot find 🧩布尔 — was viewport-selection-bar only).
- Testers: SOLID → ASSEMBLE → 组件布尔, or MESH → MODIFY, or Ctrl+K「组件布尔」, or Browser ⋯.
