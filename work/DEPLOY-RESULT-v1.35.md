# DEPLOY-RESULT v1.35

**Date:** 2026-09-18 23:32 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/71 (MERGED → `feat/native-car-stage1-20260906` @ `237dc57`)  
**Site:** https://cad.neuralworkshk.com/

## Ship contents
- **Batched sketch display** — large committed/live sketches (≥48 shapes) render as ≤2 `THREE.LineSegments` (solid + construction) instead of N drei `<Line>` meshes.
- **Schematic TEXT markers** — soft/force sketchOnly → construction underline/point budget **16** (was 128). All labels retained in `sketchSources.labels`.
- **HUD label display cap** — ≤64 DXF TEXT overlays; model keeps full list.
- **Import yields** — `requestAnimationFrame` yields around shape build / applyFeatures / setState.
- **Skip region fills** when non-construction shapes ≥48.
- **APP_VERSION:** `1.35` (live bundle `index-CXWuKVLV-r2.js`).
- PR #68 left open — not in this stamp.

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-CXWuKVLV-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.35-20260918-233245` |
| Previous (kept) | `/var/www/webcad-releases/v1.34-20260918-230425` |
| nginx root | **sites-available + sites-enabled** → v1.35 release (bak → `/etc/nginx/bak-cad/cad.conf.bak-before-v1.35`) |
| current symlink | → `v1.35-20260918-233245` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.35-20260918-233245;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.35-20260918-233245;
```
Both point at the **NEW** v1.35 release (not stuck on v1.34).

## Verification
- Public `index.html` references `index-CXWuKVLV-r2.js` ✓
- Live JS contains `1.35` ✓
- Live entry md5 matches local (`c39d7bb22cebd99be33c52ad05c4ded8`) ✓
- Live JS contains `SKETCH_BATCH` / `dxfTextMarker` / `LineSegments` ✓
- Contracts: `grok-qa-v1.35-dxf-scene-oom` PASS (incl. AL1); v1.34/v1.22/v1.21 DXF PASS
- Shell v1.28–v1.33 wiring PASS (OCCT HARD async env noise unchanged); illegal-dim marker PASS

## Notes
- Sketch bot: retest **AL1** (`/workspace/AL1-800A-schematic.dxf`) import on LIVE 1.35 — expect sketchOnly forced, **no tab discard/OOM**, purple outlines visible, labels usable (HUD may show first 64 + “+N”).
- BOT-D/UI not required for this train.
