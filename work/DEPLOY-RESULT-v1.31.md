# DEPLOY-RESULT v1.31

**Date:** 2026-09-18 (HKT)  
**PR:** https://github.com/ivanlaw313/webcad/pull/62 (MERGED → `feat/native-car-stage1-20260906` @ `8c18e8c`)  
**Site:** https://cad.neuralworkshk.com/

## Ship contents
- **Shell fuse BX01 CLEAN:** fuse pre-heal (tight sew 5e-5 + heal), seeds+TORUS+short CYLINDER boss rim (1.55), outer fillet-trim on sew bases, fuse-specific Intersection/selfInter/tol + wider nudges when TORUS in opening set.
- Root cause: fused boss + outer/cyl-top fillet R2 left MakeThickSolid fragile on the user top opening; v1.30 could still soft-fall to alternate planar lids (`未收敛` / `已改用其他平面开口` / bot paraphrase `已启用其他开口面`).
- BX02 path unchanged (spot-checked CLEAN). Cavity/alt-lid retained as later soft resorts.
- **APP_VERSION:** `1.31` (live bundle `index-Bl8B62qo-r2.js`).

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-Bl8B62qo-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.31-20260918-174015` |
| Previous (kept) | `/var/www/webcad-releases/v1.30-20260918-164517` |
| nginx root | **sites-available + sites-enabled** → v1.31 release (bak → `/etc/nginx/bak-cad/cad.conf.bak-before-v1.31`) |
| current symlink | → `v1.31-20260918-174015` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.31-20260918-174015;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.31-20260918-174015;
```
Both point at the **NEW** v1.31 release (not stuck on v1.30).

## Verification
- Public `index.html` references `index-Bl8B62qo-r2.js` ✓
- Live JS contains `\`1.31\`` ✓
- Live worker md5 matches local build (`94fe5917969428d9bb9ca30a680180c6`); contains `5e-5` fuse-preheal sew tol ✓
- Contract: `tests/grok-qa-v1.31-shell-fuse-bx01-clean.test.mjs` HARD no-soft PASS
- Regression: v1.28 + v1.29 + v1.30 shell suites PASS (21/21 with v1.31)
- `vite build` / `npm run build` clean

## Notes
- Solid bot should retest **BX01**: fuse + outer/junction or cyl-top Fillet R2 + Shell t=2 top open (tangent chain on) — expect **no** `未收敛` / `其他开口面` / `其他平面开口` / `备用` / `型腔` soft toast.
- Spot-check **BX02**: cut + Fillet R1 top hole rim + Shell t=1.5 — still CLEAN.
