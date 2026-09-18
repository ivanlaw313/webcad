# DEPLOY-RESULT v1.29

**Date:** 2026-09-18 (HKT)  
**PR:** https://github.com/ivanlaw313/webcad/pull/59 (MERGED → `feat/native-car-stage1-20260906` @ `95ebd4c`)  
**Site:** https://cad.neuralworkshk.com/

## Ship contents
- **Shell after fuse+outer-fillet:** `_shellExactFaces` retries MakeThickSolid with tiny thickness nudges (`±1e-4..1e-2`) after the exact-thickness flag/join/tol ladder fails, so fuse+outer R(=t) stays true OCCT without cavity soft status「抽壳完成（备用：开口面偏移型腔）」.
- Root cause: geometric singularity when wall thickness **exactly equals** local outer fillet radius (`t===R`); v1.28 Intersection flags fix cut+fillet `t≥R` but not this case; SelfInter does not help.
- Cavity/prismatic retained as last resort.
- **APP_VERSION:** `1.29` (live bundle `index-BBwNdBpN-r2.js`).

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-BBwNdBpN-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.29-20260918-153627` |
| Previous (kept) | `/var/www/webcad-releases/v1.28-20260918-140131` |
| nginx root | **sites-available + sites-enabled** → v1.29 release (bak → `/etc/nginx/bak-cad/cad.conf.bak-before-v1.29`) |
| current symlink | → `v1.29-20260918-153627` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.29-20260918-153627;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.29-20260918-153627;
```
Both point at the **NEW** v1.29 release (not stuck on v1.28).

## Verification
- Public `index.html` references `index-BBwNdBpN-r2.js` ✓
- Live JS contains `` `1.29` `` ✓
- Contract: `tests/grok-qa-v1.29-shell-occt-after-fuse-fillet.test.mjs` HARD no-cavity PASS
- Regression: `tests/grok-qa-v1.28-shell-occt-after-fillet.test.mjs` PASS (BX02 cut path)
- `vite build` clean

## Notes
- Solid bot should retest fuse+outer fillet R with shell t=R (e.g. R2+t=2) — expect **no** 「备用」 status.
- Also spot-check classic BX02 cut+Fillet R1+Shell t=1.5 — should remain OCCT-clean (v1.28).
- Residual: exotic dirty topologies may still cavity after nudge ladder; cavity remains intentional last resort.
