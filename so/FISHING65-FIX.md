# FISHING65 — tip.gear sync + Assemble tip.* catalog

**Date:** 2026-10-16 (HK)  
**Branch:** `fix/fishing65-ux-leftovers`  
**Product fix:** `db0a34c`  
**more40 soft-prep:** **none** (not present — defer F66)  
**Base:** tip `78dc0a7` (FISHING64 live)  
**Tip:** `b604c954bfdf16c46be8c67ed79155e7617bb51f`

## Scan

| Source | Result |
|---|---|
| tip.* vs ribbon | tip.gear stale (缺斜齒／分度圓); tip.facemate/asbuiltjoint/groundcomp missing from catalog |
| ribbon short tips | coil/thicken first tips truncated vs Formal long |
| BOT-D more40 | Absent — skip cherry-pick |
| MATERIALS / DENSITY_PREF | SC kept |
| Product branch | **`fix/sketch-face-copy`** (not feature/) |

## Fixes

### 1. tip.gear catalog Formal
- zh-HK tip.gear → ribbon primary（β>0=斜齒、分度圓Ø、20° 壓力角）

### 2. Assemble tip.* into catalog
- tip.facemate / tip.asbuiltjoint / tip.groundcomp (= ribbon Formal 選面配合／轉動關節／固定)

### 3. ribbon short tip polish
- coil / thicken first tip → long Formal (match catalog)

## Tests
- fishing65 hard — **3 PASS / 0 fail**
- `tsc` (flock) — clean
- more40 — **N/A**
- Node `/home/box/.local/node/node-v22.19.0-linux-x64/bin` · nice -n 19 · **NO** dev server

## Deploy

| Field | Value |
|---|---|
| When (HKT) | 2026-10-16 ~21:36 |
| APP_VERSION | **2.20** |
| Stamp | `v2.20-20261016-213409` |
| Bundle | `index-CqptExWg-r2.js` |
| MD5 | `208b8f1ea7762a720df454dda8328adc` |
| Prev bak (F64) | `index-CVCXzaLH-r2.js` / `v2.20-20261016-212915` **kept** |
| F63–F50 baks | prior stamps **kept** |
| Assets | 89 uploaded; refs curl **200** |
| Live | https://cad.neuralworkshk.com/ |
| Remotes | `fix/fishing65-ux-leftovers` + FF `fix/sketch-face-copy` → tip (vps + origin) |

## Counts
- fishing65 hard: **3 PASS**
- more40 cherry: **no**
- MATERIALS keys unchanged: **yes**
