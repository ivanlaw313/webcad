# FISHING74 — joint-pick Formal 轉動／滑動軸 + 其連結的組件

**Date:** 2026-10-16 (HK)  
**Branch:** `fix/fishing74-behavior-ux`  
**Product fix:** `264d7b2`  
**more41 soft-prep:** **none** (absent — defer F75)  
**Base:** tip `0375934` (FISHING73 live)  
**Tip:** (after FF docs — see remotes)

## Scan

| Source | Result |
|---|---|
| F61 recheck PARTIAL | Armed status missing 「轉動／滑動軸」; clarify dialog already had it |
| 連接 vs 連結 | joint pick 「其連接的組件」 leftover after F71 Formal 連結 |
| 控製 / tip Formal invent | none remaining / not done |
| BOT-D more41 | Absent — skip cherry |
| MATERIALS / DENSITY_PREF | SC kept |

## Fixes

### 1. Joint-pick status Formal (F61)
- Armed: `圓柱↔平面＝轉動／滑動軸取自圓柱並穿面心，預設轉動`
- First-pick follow-up: same 轉動／滑動軸 phrasing

### 2. `其連接的組件` → `其連結的組件`
- Align parent-pick wording with Formal 運動連結 / `+ 連結`

## Tests
- fishing74 hard — **3 PASS**
- fishing66 joint status — **3 PASS**
- more40 — **12 PASS**
- `tsc` — EXIT:0
- more41 — **N/A**

## Deploy

| Field | Value |
|---|---|
| When (HKT) | 2026-10-16 ~22:24 |
| APP_VERSION | **2.20** |
| Stamp | `v2.20-20261016-222205` |
| Bundle | `index-CmbG9Y9V-r2.js` |
| MD5 | `e54f49ab453800c0e14890387cb23259` |
| Prev bak (F73) | `index-DprUAEQI-r2.js` / `v2.20-20261016-221705` **kept** |
| F72–F50 baks | prior stamps **kept** |
| Live | https://cad.neuralworkshk.com/ |
| Remotes | `fix/fishing74-behavior-ux` + FF `fix/sketch-face-copy` → tip (vps + origin) |

## Counts
- fishing74 hard: **3 PASS**
- more41 cherry: **no**
- MATERIALS keys unchanged: **yes**
