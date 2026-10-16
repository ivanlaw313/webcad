# FISHING77 — componentMove refuse Formal 以關節連結

**Date:** 2026-10-16 (HK)  
**Branch:** `fix/fishing77-behavior-ux`  
**Product fix:** `f8f6624`  
**more41 soft-prep:** **none** (absent — defer F78)  
**Base:** tip `5dd3b51` (FISHING76 live)  
**Tip:** (after FF docs — see remotes)

## Scan

| Source | Result |
|---|---|
| F75/F76 Formal | 復用/件心 cleared in UI; leftover **連接** in `componentMove` refuse msgs |
| more41 | Absent |
| MATERIALS / DENSITY_PREF | SC kept |

## Fixes

### 1. componentMove Formal 連結
- Rotate/move refuse: `以關節…連接` → `以關節…連結` / `連結到已固定的`
- Comment: 連結嘅組件集合
- Harden `tests/asm2-component-move.test.mjs` (stale 連接 asserts vs F75 store status)

## Tests
- fishing77 hard — **3 PASS**
- fishing76 — **4 PASS**
- asm2-component-move — **7 PASS**
- `tsc` — EXIT:0
- more41 — **N/A**

## Deploy

| Field | Value |
|---|---|
| When (HKT) | 2026-10-16 ~22:39 |
| APP_VERSION | **2.20** |
| Stamp | `v2.20-20261016-223644` |
| Bundle | `index-qqf_5Ak9-r2.js` |
| MD5 | `9f47dd02e5f2550f0b37e7b908aaa1c9` |
| Prev bak (F76) | `index-RL7gdQ_r-r2.js` / `v2.20-20261016-223149` **kept** |
| Live | https://cad.neuralworkshk.com/ |
| Remotes | `fix/fishing77-behavior-ux` + FF `fix/sketch-face-copy` → tip (vps + origin) |

## Counts
- fishing77 hard: **3 PASS**
- more41 cherry: **no**
- MATERIALS keys unchanged: **yes**
