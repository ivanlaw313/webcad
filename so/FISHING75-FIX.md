# FISHING75 — Formal 可複用 + 以關節連結

**Date:** 2026-10-16 (HK)  
**Branch:** `fix/fishing75-behavior-ux`  
**Product fix:** `ada5b77`  
**more41 soft-prep:** **none** (absent — defer F76)  
**Base:** tip `61d84b4` (FISHING74 live)  
**Tip:** (after FF docs — see remotes)

## Scan

| Source | Result |
|---|---|
| tip.jointorigin / ribbon | Formal **可複用**; store/BrowserTree/JointsPanel still **可復用** |
| Move-with-joints status | 「以關節**連接**的」 leftover after F71/F74 連結 Formal |
| more41 | Absent |
| MATERIALS / DENSITY_PREF | SC kept |

## Fixes

### 1. 可復用 → 可複用
- `store.ts` startJointOriginPick / addJointOrigin status
- BrowserTree joint-origin row title; JointsPanel originRef title

### 2. 以關節連接 → 以關節連結
- store move status + `componentMove.ts` comment

## Tests
- fishing75 hard — **3 PASS**
- fishing69 — **3 PASS**
- `tsc` — EXIT:0
- more41 — **N/A**

## Deploy

| Field | Value |
|---|---|
| When (HKT) | 2026-10-16 ~22:29 |
| APP_VERSION | **2.20** |
| Stamp | `v2.20-20261016-222652` |
| Bundle | `index-BfnwRgWi-r2.js` |
| MD5 | `c073e82c80553f26f6aaa81e3882151f` |
| Prev bak (F74) | `index-CmbG9Y9V-r2.js` / `v2.20-20261016-222205` **kept** |
| Live | https://cad.neuralworkshk.com/ |
| Remotes | `fix/fishing75-behavior-ux` + FF `fix/sketch-face-copy` → tip (vps + origin) |

## Counts
- fishing75 hard: **3 PASS**
- more41 cherry: **no**
- MATERIALS keys unchanged: **yes**
