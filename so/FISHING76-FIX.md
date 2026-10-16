# FISHING76 — Formal 複用 + 預設組件中心

**Date:** 2026-10-16 (HK)  
**Branch:** `fix/fishing76-behavior-ux`  
**Product fix:** `dd82c54`  
**more41 soft-prep:** **none** (absent — defer F77)  
**Base:** tip `c57c574` (FISHING75 live)  
**Tip:** `19a12b62c9da475880f25af90dfcfac18df800cf`

## Scan

| Source | Result |
|---|---|
| F75 leftover | Viewport FEA prestress tip still 「**復用**模態振型動畫」 |
| joint-origin UX | 「預設**件心**」 vs tip.jointorigin 「組件中心」 |
| more41 | Absent |
| MATERIALS / DENSITY_PREF | SC kept |

## Fixes

### 1. FEA tip 復用 → 複用
- `Viewport.tsx` prestress modal title

### 2. 預設件心 → 預設組件中心
- store startJointOriginPick status; BrowserTree title; JointsPanel parent origin `<option>`

## Tests
- fishing76 hard — **4 PASS**
- fishing75 — **3 PASS**
- `tsc` — EXIT:0
- more41 — **N/A**

## Deploy

| Field | Value |
|---|---|
| When (HKT) | 2026-10-16 ~22:34 |
| APP_VERSION | **2.20** |
| Stamp | `v2.20-20261016-223149` |
| Bundle | `index-RL7gdQ_r-r2.js` |
| MD5 | `f50c92878f718e0d5a6bee43f5d61c89` |
| Prev bak (F75) | `index-BfnwRgWi-r2.js` / `v2.20-20261016-222652` **kept** |
| Live | https://cad.neuralworkshk.com/ |
| Remotes | `fix/fishing76-behavior-ux` + FF `fix/sketch-face-copy` → tip (vps + origin) |

## Counts
- fishing76 hard: **4 PASS**
- more41 cherry: **no**
- MATERIALS keys unchanged: **yes**
