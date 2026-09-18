# DEPLOY-RESULT v1.39

**Date:** 2026-09-19 03:34 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/79 (MERGED → `feat/native-car-stage1-20260906`)  
**Site:** https://cad.neuralworkshk.com/

## Ship contents
- **Mate-after-edit** — `finishComponentEdit` rebuilds mates (`resolveMates` / `solveMates` when grounded) that touch the edited component; status appends 配合重算 note.
- **Component Boolean consume-tool** — drops dangling face-mates with joints; rebuilds remaining mates on source A; keeps bake `statusAction`; clarifies 组件布尔(网格) vs 实体布尔(B-rep).
- **`deleteComponent`** — clears mates referencing deleted occurrence.
- **UX** — Fillet/Shell on pure mesh (no src) offers 「烘焙为零件实体」 chip (not only MeshFit).
- Keeps v1.38 Chinese solid toasts, v1.37 Shell CLEAN / LTR `tStatus`, v1.36 join budgets, v1.35 DXF.
- **APP_VERSION:** `1.39` (live bundle `index-BQSUjKeF-r2.js`).

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-BQSUjKeF-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.39-20260919-033250` |
| Previous (kept) | `/var/www/webcad-releases/v1.38-20260919-022928` |
| nginx root | **sites-available + sites-enabled** → v1.39 release (bak → `/etc/nginx/bak-cad/cad.conf.bak-before-v1.39`) |
| current symlink | → `v1.39-20260919-033250` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.39-20260919-033250;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.39-20260919-033250;
```
Both point at the **NEW** v1.39 release (not stuck on v1.38).

## Verification
- Public `index.html` references `index-BQSUjKeF-r2.js` ✓
- Live JS contains `1.39` ✓
- Live entry md5 matches local (`026fbbdc98d3acc6791758555e1b8c09`) ✓
- Live entry contains `烘焙为零件实体`, `组件布尔＝网格结果`, `涉及此件的配合`, `bakeMeshToPart` ✓
- Contracts: `grok-qa-v1.39-compbool-mate-edge` + v1.25/v1.26/v1.37/v1.38/v1.35 **PASS**

## Notes
- Solid bot: component boolean cut → bake chip visible; Fillet on mesh-only → 「烘焙为零件实体」; optional mate-after-edit (finish edit with mates → status mentions 配合重算). Shell CLEAN / Extrude Chinese still intact.
- BOT-D: FORM/ASSY(Gear Pair)/MESH sample on LIVE 1.39.
