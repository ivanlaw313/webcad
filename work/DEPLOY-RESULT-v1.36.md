# DEPLOY-RESULT v1.36

**Date:** 2026-09-19 00:33 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/73 (MERGED → `feat/native-car-stage1-20260906` @ `079d606`)  
**Site:** https://cad.neuralworkshk.com/

## Ship contents
- **MakeThickSolid join budgets** — per-call cap (commit 40 / preview 28) + feature soft cap (120 / 72); dispose failed accept shapes.
- **Early fillet-trim** — after seeds miss, trim-before-TORUS/boss (BX02 win path was join #2017 after ~2000 wasted).
- **Lazy alternate bases** — sew/fusePre/copyHeal only after primary-base miss.
- **Preview cancel** — `scheduleShellPreview` calls `cancelPreviews()` so thickness edits do not stack ladders.
- **Coarser preview mesh** — higher tol/angTol in `meshOf({ preview: true })`.
- **APP_VERSION:** `1.36` (live bundle `index-DzjloFcq-r2.js`).

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-DzjloFcq-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.36-20260919-003144` |
| Previous (kept) | `/var/www/webcad-releases/v1.35-20260918-233245` |
| nginx root | **sites-available + sites-enabled** → v1.36 release (bak → `/etc/nginx/bak-cad/cad.conf.bak-before-v1.36`) |
| current symlink | → `v1.36-20260919-003144` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.36-20260919-003144;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.36-20260919-003144;
```
Both point at the **NEW** v1.36 release (not stuck on v1.35).

## Verification
- Public `index.html` references `index-DzjloFcq-r2.js` ✓
- Live JS contains `1.36` ✓
- Live entry md5 matches local (`3652d010ed15828ef260b744abb4fb7c`) ✓
- Live worker contains `shell join budget exceeded` (×9) ✓
- Contracts: `grok-qa-v1.36-shell-preview-oom` PASS (BX01/BX02 HARD + wiring); v1.28–v1.33 shell + CX02 + v1.35 DXF + lifecycle **57/57** PASS

## Probe (pre→post, Node)
| Case | Before (@1.35 ladder) | After (@1.36) |
|------|------------------------|---------------|
| BX02 cut+R1+shell t=1.5 | 2017 joins, +253MB, 47s | **42 joins**, +71MB, **1.6s**, CLEAN |
| 3 stacked previews | 4989 joins, ~1.2GB | cancel on reschedule + caps |
| BX01 fuse+R2+shell | 1 join CLEAN | unchanged CLEAN |

## Notes
- Solid bot: retest **BX01** (Fuse+R2+Shell t=2) and **BX02** (Cut+Fillet R1+Shell t=1.5) on LIVE 1.36 — expect **Shell commit without Chrome tab discard**; prefer **CLEAN** toast (no 备用/型腔/其他开口/未收敛).
- DXF AL1 path from v1.35 unchanged; no regression intended.
