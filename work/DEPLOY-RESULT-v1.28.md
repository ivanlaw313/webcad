# DEPLOY-RESULT v1.28

**Date:** 2026-09-18 (HKT)  
**PR:** https://github.com/ivanlaw313/webcad/pull/58 (MERGED → `feat/native-car-stage1-20260906` @ `dfa2ccf`)  
**Site:** https://cad.neuralworkshk.com/

## Ship contents
- **Shell after cut+fillet:** `_shellExactFaces` also tries MakeThickSolid `Intersection=true` (+ `RemoveIntEdges`) so BX02 R1 + t≥1.0 stays true OCCT without cavity soft status「抽壳完成（备用：开口面偏移型腔）」.
- Cavity/prismatic retained as last resort.
- **APP_VERSION:** `1.28` (live bundle `index-DyNkIp9T-r2.js`).

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-DyNkIp9T-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.28-20260918-140131` |
| Previous (kept) | `/var/www/webcad-releases/v1.27-20260914-104525` |
| nginx root | **sites-available + sites-enabled** → v1.28 release (bak → `/etc/nginx/bak-cad/cad.conf.bak-before-v1.28`) |
| current symlink | → `v1.28-20260918-140131` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.28-20260918-140131;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.28-20260918-140131;
```
Both point at the **NEW** v1.28 release (not stuck on v1.27).

## Verification
- Public `index.html` references `index-DyNkIp9T-r2.js` ✓
- Live JS contains `var zt=\`1.28\`` ✓
- Contract: `tests/grok-qa-v1.28-shell-occt-after-fillet.test.mjs` 5/5 PASS (HARD no-cavity)
- Regression: CX02 / v1.20–v1.24 shell kernel paths prefer OCCT clean
- `tsc -b` + `vite build` clean

## Notes
- Solid bot should retest classic BX02: cut + Fillet R1 + Shell t=1.5 — expect **no** 「备用」 status when opening is planar lid.
- Residual: fuse+outer-fillet shell may still soft-fall to cavity in some geometries (not BX02 cut path).
