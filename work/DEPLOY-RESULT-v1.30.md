# DEPLOY-RESULT v1.30

**Date:** 2026-09-18 (HKT)  
**PR:** https://github.com/ivanlaw313/webcad/pull/60 (MERGED → `feat/native-car-stage1-20260906` @ `db59763`)  
**Site:** https://cad.neuralworkshk.com/

## Ship contents
- **Shell prefers original openings:** after seeds MakeThickSolid miss, try seeds+adjacent TORUS rim (fuse cyl-top fillet), then trim opening-rim fillet + optional wall-height restore (BX02 top-rim+top-open). Defer alternate planar lids until after cavity/prismatic on original seeds.
- Root cause: MakeThickSolid throws when the user-selected planar opening still carries a filleted rim; v1.29 fell through to opposite planar lids with soft toast `已改用其他平面开口`.
- Cavity/prismatic retained; alt-lid path kept as later soft resort.
- **APP_VERSION:** `1.30` (live bundle `index-DqrsTpFi-r2.js`).

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-DqrsTpFi-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.30-20260918-164517` |
| Previous (kept) | `/var/www/webcad-releases/v1.29-20260918-153627` |
| nginx root | **sites-available + sites-enabled** → v1.30 release (bak → `/etc/nginx/bak-cad/cad.conf.bak-before-v1.30`) |
| current symlink | → `v1.30-20260918-164517` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.30-20260918-164517;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.30-20260918-164517;
```
Both point at the **NEW** v1.30 release (not stuck on v1.29).

## Verification
- Public `index.html` references `index-DqrsTpFi-r2.js` ✓
- Live JS contains `\`1.30\`` ✓
- Contract: `tests/grok-qa-v1.30-shell-original-opening.test.mjs` HARD no-alt-opening PASS
- Regression: v1.28 + v1.29 shell OCCT suites PASS (16/16 with v1.30)
- `vite build` / `npm run build` clean

## Notes
- Solid bot should retest **BX02**: cut + Fillet R1 on **top** hole rim + Shell t=1.5 top open (tangent chain on) — expect **no** `已改用其他平面开口` / `未收敛` soft toast.
- Also **fuse**: cyl-top / outer fillet R2 + Shell t=2 on that top — expect **no** alternate-opening soft toast.
- Residual: exotic dirty topologies may still cavity or alt-lid after the new ladder; those remain intentional soft resorts.
