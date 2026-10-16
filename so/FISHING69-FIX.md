# FISHING69 — Formal 運動連結 + tip.jointorigin long ASSEMBLE

**Date:** 2026-10-16 (HK)  
**Branch:** `fix/fishing69-motionlink-jointorigin`  
**Product fix:** `28a8df2`  
**more40 soft-prep:** **none** (not present — defer F70)  
**Base:** tip `46d9cbb` (FISHING68 live)  
**Tip:** `PLACEHOLDER_TIP`

## Scan

| Source | Result |
|---|---|
| F66 recheck | Label 運動連接 vs expected 運動連結; tip.jointorigin short catalog vs long ribbon ASSEMBLE |
| tip Formal fill | Stopped (F68: 0 remaining catalog mismatches) |
| BOT-D more40 | Absent — skip cherry-pick |
| MATERIALS / DENSITY_PREF | SC kept |
| Product branch | **`fix/sketch-face-copy`** (not feature/) |

## Fixes

### 1. Formal zh-HK 「運動連結」
- Decided Formal **運動連結** (link) over 運動連接
- ribbon label/tips, tip.motionlink, cmd/tool.motionlink, JointsPanel, store status, i18n keys

### 2. tip.jointorigin long ASSEMBLE Formal
- tip.jointorigin + both ribbon.ts jointorigin tips → GM-3DV4 A1 long Formal (可複用命名幀／關節原點組)

## Tests
- fishing69 hard — **3 PASS / 0 fail**
- `tsc` (flock) — clean
- more40 — **N/A**
- Node `/home/box/.local/node/node-v22.19.0-linux-x64/bin` · nice -n 19 · **NO** dev server

## Deploy

| Field | Value |
|---|---|
| When (HKT) | 2026-10-16 ~21:56 |
| APP_VERSION | **2.20** |
| Stamp | `v2.20-20261016-215415` |
| Bundle | `index-BehrEApg-r2.js` |
| MD5 | `d0cd79fb38f95d94f4dc499cf59350e7` |
| Prev bak (F68) | `index-BDj0__zS-r2.js` / `v2.20-20261016-214928` **kept** |
| F67–F50 baks | prior stamps **kept** |
| Assets | 89 uploaded; refs curl **200** |
| Live | https://cad.neuralworkshk.com/ |
| Remotes | `fix/fishing69-motionlink-jointorigin` + FF `fix/sketch-face-copy` → tip (vps + origin) |

## Counts
- fishing69 hard: **3 PASS**
- more40 cherry: **no**
- MATERIALS keys unchanged: **yes**
