# FISHING72 — help.p4 Formal 面板建關節 + 運動連結

**Date:** 2026-10-16 (HK)  
**Branch:** `fix/fishing72-behavior-ux`  
**Product fix:** `8e0a309`  
**more40 soft-prep:** **none READY** (WT `/workspace/webcad-v220-more40` @ d6c23b5 empty — no test commit / soft-prep.md / vps ref → defer F73)  
**Base:** tip `ffd6d75` (FISHING71 live)  
**Tip:** (after FF docs — see remotes)

## Scan

| Source | Result |
|---|---|
| F71 leftover | help.p4 「關節」**面板連接** +「運動連結」— Formal mismatch after panel `+ 連結` |
| F61 plane-clarify | PARTIAL deferred (clarify only after mixed cyl↔planar + type needs axis; box face alone → select — not wrong) |
| F69 panel | Cleared by F71 always-mount |
| tip Formal invent | **Not done** |
| BOT-D more40 | WT present mid-wave but **not READY** — no cherry |
| MATERIALS / DENSITY_PREF | SC kept |

## Fixes

### 1. help.p4 Formal
- `右下「關節」面板連接 +「運動連結」` → `右下「關節」面板建關節 +「運動連結」設齒比`

## Tests
- fishing72 hard — **3 PASS / 0 fail**
- fishing71 hard — **3 PASS**
- `tsc` (flock) — clean EXIT:0
- more40 — **N/A** (not READY)
- Node path · nice -n 19 · **NO** dev server / browser

## Deploy

| Field | Value |
|---|---|
| When (HKT) | 2026-10-16 ~22:14 |
| APP_VERSION | **2.20** |
| Stamp | `v2.20-20261016-221200` |
| Bundle | `index-DprUAEQI-r2.js` |
| MD5 | `ebd2a923c4e97e3455b73faa34271e7a` |
| Prev bak (F71) | `index-xg4V5SNv-r2.js` / `v2.20-20261016-220707` **kept** |
| F70–F50 baks | prior stamps **kept** |
| Assets | 89 uploaded; refs curl **200** |
| Live | https://cad.neuralworkshk.com/ |
| Remotes | `fix/fishing72-behavior-ux` + FF `fix/sketch-face-copy` → tip (vps + origin) |

## Counts
- fishing72 hard: **3 PASS**
- more40 cherry: **no**
- MATERIALS keys unchanged: **yes**
