# FISHING67 — tip.sweep/aerolab sync + Import tip.* catalog

**Date:** 2026-10-16 (HK)  
**Branch:** `fix/fishing67-tip-ux-leftovers`  
**Product fix:** `96afb57`  
**more40 soft-prep:** **none** (not present — defer F68)  
**Base:** tip `6640392` (FISHING66 live)  
**Tip:** `c871c953ce326e9f965225452a20cbfe40f7f6a3`

## Scan

| Source | Result |
|---|---|
| tip.sweep / tip.aerolab | Catalog shorter than ribbon |
| Import tips | tip.importdxf/importsvg/insertcomponent/meshfit missing from catalog (ribbon Formal 匯入／檔案) |
| BOT-D more40 | Absent — skip cherry-pick |
| MATERIALS / DENSITY_PREF | SC kept |
| Product branch | **`fix/sketch-face-copy`** (not feature/) |

## Fixes

### 1. tip.sweep / tip.aerolab sync from ribbon
### 2. Import tip.* into zh-HK catalog (= ribbon)
- tip.importdxf / importsvg / insertcomponent / meshfit

## Tests
- fishing67 hard — **3 PASS / 0 fail**
- `tsc` (flock) — clean
- more40 — **N/A**
- Node `/home/box/.local/node/node-v22.19.0-linux-x64/bin` · nice -n 19 · **NO** dev server

## Deploy

| Field | Value |
|---|---|
| When (HKT) | 2026-10-16 ~21:46 |
| APP_VERSION | **2.20** |
| Stamp | `v2.20-20261016-214434` |
| Bundle | `index-B-lQnG-T-r2.js` |
| MD5 | `472aaa67a59a414914934136db5a3b16` |
| Prev bak (F66) | `index-CfHqViwc-r2.js` / `v2.20-20261016-213910` **kept** |
| F65–F50 baks | prior stamps **kept** |
| Assets | 89 uploaded; refs curl **200** |
| Live | https://cad.neuralworkshk.com/ |
| Remotes | `fix/fishing67-tip-ux-leftovers` + FF `fix/sketch-face-copy` → tip (vps + origin) |

## Counts
- fishing67 hard: **3 PASS**
- more40 cherry: **no**
- MATERIALS keys unchanged: **yes**
