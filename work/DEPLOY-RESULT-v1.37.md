# DEPLOY-RESULT v1.37

**Date:** 2026-09-19 01:19 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/75 (MERGED → `feat/native-car-stage1-20260906` @ `1822fc2`)  
**Site:** https://cad.neuralworkshk.com/

## Ship contents
- **`shellSuccessStatus`** — Chinese CLEAN Shell success toast builder (`已抽壳 壁厚 N（向内，开 K 个所选面，切线链开）`).
- **STATUS_PHRASES_X guards** — long Chinese identities for Shell / Fillet / Chamfer success units.
- **`tStatus` LTR longest-match** — stops short tokens (`已`/`抽壳`/`壁厚`/`所选`) from carving hybrid EN/CN toasts.
- **APP_VERSION:** `1.37` (live bundle `index-JIT6Q-vQ-r2.js`).
- v1.36 Shell join budgets + v1.35 DXF path untouched.

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-JIT6Q-vQ-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.37-20260919-011751` |
| Previous (kept) | `/var/www/webcad-releases/v1.36-20260919-003144` |
| nginx root | **sites-available + sites-enabled** → v1.37 release (bak → `/etc/nginx/bak-cad/cad.conf.bak-before-v1.37`) |
| current symlink | → `v1.37-20260919-011751` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.37-20260919-011751;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.37-20260919-011751;
```
Both point at the **NEW** v1.37 release (not stuck on v1.36).

## Verification
- Public `index.html` references `index-JIT6Q-vQ-r2.js` ✓
- Live JS contains `1.37` ✓
- Live entry md5 matches local (`51e5e3cb281bec0bbeb6351df6cae8de`) ✓
- Live entry contains `已抽壳 壁厚` (×3) and **0** `Done: shell Wall` ✓
- Live worker still contains `shell join budget exceeded` ✓
- Contracts: `grok-qa-v1.37-shell-toast-zh` **7/7** PASS; v1.36 HARD BX01/BX02 + v1.35 DXF PASS

## Notes
- Solid bot: retest **BX01** (Fuse+R2+Shell t=2) and **BX02** (Cut+Fillet R1+Shell t=1.5) on LIVE 1.37 — expect toast language **Chinese** like `已抽壳 壁厚 …（向内，开 1 个所选面，切线链开）` (no `Done:` / `shell Wall` / bare `selected`); still **CLEAN** (no 备用/型腔/其他开口/未收敛).
