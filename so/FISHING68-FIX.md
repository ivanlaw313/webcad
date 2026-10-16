# FISHING68 — tip.insertmesh/thickenquilt/finish3d/sk_project + surface tips

**Date:** 2026-10-16 (HK)  
**Branch:** `fix/fishing68-tip-ux-leftovers`  
**Product fix:** `db30a83`  
**more40 soft-prep:** **none** (not present — defer F69)  
**Base:** tip `c1d754f` (FISHING67 live)  
**Tip:** `PLACEHOLDER_TIP`

## Scan

| Source | Result |
|---|---|
| tip.* vs ribbon | 0 remaining length/Formal mismatches for existing catalog keys |
| Missing Formal tips | insertmesh／thickenquilt／finish3d／sk_project／surfextrude／surfsweep／surfrevolve |
| BOT-D more40 | Absent — skip cherry-pick |
| MATERIALS / DENSITY_PREF | SC kept |
| Product branch | **`fix/sketch-face-copy`** (not feature/) |

## Fixes

### tip.* catalog Formal fill (= ribbon)
- tip.insertmesh / thickenquilt / finish3d / sk_project
- tip.surfextrude / surfsweep / surfrevolve

## Tests
- fishing68 hard — **3 PASS / 0 fail**
- `tsc` (flock) — clean
- more40 — **N/A**
- Node `/home/box/.local/node/node-v22.19.0-linux-x64/bin` · nice -n 19 · **NO** dev server

## Deploy

| Field | Value |
|---|---|
| When (HKT) | 2026-10-16 ~21:51 |
| APP_VERSION | **2.20** |
| Stamp | `v2.20-20261016-214928` |
| Bundle | `index-BDj0__zS-r2.js` |
| MD5 | `9fa5702ae0796d549296d3968415ded6` |
| Prev bak (F67) | `index-B-lQnG-T-r2.js` / `v2.20-20261016-214434` **kept** |
| F66–F50 baks | prior stamps **kept** |
| Assets | 89 uploaded; refs curl **200** |
| Live | https://cad.neuralworkshk.com/ |
| Remotes | `fix/fishing68-tip-ux-leftovers` + FF `fix/sketch-face-copy` → tip (vps + origin) |

## Counts
- fishing68 hard: **3 PASS**
- more40 cherry: **no**
- MATERIALS keys unchanged: **yes**
