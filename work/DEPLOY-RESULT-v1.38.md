# DEPLOY-RESULT v1.38

**Date:** 2026-09-19 02:31 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/77 (MERGED → `feat/native-car-stage1-20260906`)  
**Site:** https://cad.neuralworkshk.com/

## Ship contents
- **Solid success toast builders** — Extrude / Cut / Boolean / Fuse (+ new-body) Chinese helpers in `src/ui/featureStatus.ts`; store wired.
- **STATUS_PHRASES_X guards** — long Chinese identities for Extrude/Cut/Boolean/Fuse/Revolve/Loft/Sweep/Draft/Thicken/all-edge Fillet·Chamfer (overrides prior whole-string EN translations).
- Keeps v1.37 LTR longest-match `tStatus`, Shell CLEAN wording, v1.36 join budgets, v1.35 DXF path.
- **APP_VERSION:** `1.38` (live bundle `index-DMQ8m4My-r2.js`).

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-DMQ8m4My-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.38-20260919-022928` |
| Previous (kept) | `/var/www/webcad-releases/v1.37-20260919-011751` |
| nginx root | **sites-available + sites-enabled** → v1.38 release (bak → `/etc/nginx/bak-cad/cad.conf.bak-before-v1.38`) |
| current symlink | → `v1.38-20260919-022928` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.38-20260919-022928;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.38-20260919-022928;
```
Both point at the **NEW** v1.38 release (not stuck on v1.37).

## Verification
- Public `index.html` references `index-DMQ8m4My-r2.js` ✓
- Live JS contains `1.38` ✓
- Live entry md5 matches local (`bdb6eb871760f73ee469a44c7204e50d`) ✓
- Live entry contains `已拉伸出实体` (×3), `已切割（布尔减）` (×3); **0** `Done: extrude` / `shell Wall` ✓
- Contracts: `grok-qa-v1.38-solid-toast-zh` + `v1.37-shell-toast-zh` **16/16** PASS; v1.35 DXF PASS

## Notes
- Solid / UI bot: light **solid smoke** on LIVE 1.38 — Extrude / Cut / Boolean (Fuse) / Chamfer success toasts should be **Chinese** (no `Done:` / bare `extrude`/`body`/`boolean`/`Merged` hybrids). Shell still CLEAN Chinese. Optional UI/BOT-D.
