# DEPLOY-RESULT v1.34

**Date:** 2026-09-18 23:05 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/69 (MERGED → `feat/native-car-stage1-20260906` @ `cd05945`)  
**Site:** https://cad.neuralworkshk.com/

## Ship contents
- **Spatial-hash DXF segment chaining** — O(n) endpoint grid; 20k disconnected LINEs ~10s → ~125ms (main-thread freeze fix).
- **Harder sketchOnly** — soft prefer >32 profiles / >12 texts / >0.5MB; **force lock** >200 / >80 / >2MB; reject >8MB or >100k entities with clear toast.
- **TEXT marker batching** — construction underline/point capped at 128; all labels retained in `sketchSources.labels` / HUD.
- **Parse-once cache** on insert dialog; progress status + `dxfImportEpoch` cancel.
- **APP_VERSION:** `1.34` (live bundle `index-6PXsw2Pl-r2.js`).
- PR #68 (optional ASSY File harden) left open — not in this stamp.

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-6PXsw2Pl-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.34-20260918-230425` |
| Previous (kept) | `/var/www/webcad-releases/v1.33-20260918-143056` |
| nginx root | **sites-available + sites-enabled** → v1.34 release (bak → `/etc/nginx/bak-cad/cad.conf.bak-before-v1.34`) |
| current symlink | → `v1.34-20260918-230425` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.34-20260918-230425;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.34-20260918-230425;
```
Both point at the **NEW** v1.34 release (not stuck on v1.33).

## Verification
- Public `index.html` references `index-6PXsw2Pl-r2.js` ✓
- Live JS contains `1.34` ✓
- Live entry md5 matches local (`a94e6d6cd60aa1692c7ba6ae5b7d6156`) ✓
- Contracts: `grok-qa-v1.34-dxf-large-import` PASS (incl. AL1); v1.21/v1.22 DXF PASS
- Regression: Shell v1.28–v1.33 suites PASS; illegal-dim marker version pin relaxed for 1.3x

## Notes
- Sketch bot: retest **AL1 / large schematic DXF** import on LIVE 1.34 — expect sketchOnly default/force, no UI freeze, labels retained, markers ≤128.
- BOT-D/UI not required for this train.
