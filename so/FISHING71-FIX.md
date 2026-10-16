# FISHING71 — JointsPanel 運動連結 always visible + 連結

**Date:** 2026-10-16 (HK)  
**Branch:** `fix/fishing71-motionlink-panel`  
**Product fix:** `2d7a83e`  
**more40 soft-prep:** **none** (absent — defer F72)  
**Base:** tip `d6c23b5` (FISHING70 live)  
**Tip:** `c77f18bda0980ba8ffb5f58a5c50fb8bab8841ce`

## Scan

| Source | Result |
|---|---|
| F69 recheck PARTIAL | 關節面板 with 1 轉動 joint showed neither 運動連結 nor 運動連接 — section gated on `rotJoints.length >= 2` |
| Panel button | `+ 連接` next to Formal heading 運動連結 — align → `+ 連結` |
| F61 plane-clarify | Still deferred (not cheap) |
| tip Formal invent | **Not done** |
| BOT-D more40 | Absent — skip → F72 |
| MATERIALS / DENSITY_PREF | SC kept |

## Fixes

### 1. Always mount 運動連結（齒輪比）
- Remove outer `rotJoints.length >= 2` gate around `motionLinkRef` section
- Empty-state hint when <2 轉動／圓柱: 「需要最少 2 個…才可加運動連結」
- Ribbon `motionlink` always dispatches `webcad:assembly-focus` (even when <2) so panel scrolls to Formal heading

### 2. Formal `+ 連接` → `+ 連結`
- JointsPanel add button + dual-drive title
- store status 「再按「+ 連結」」

## Tests
- fishing71 hard — **3 PASS / 0 fail**
- fishing70 / fishing69 — **3 PASS each**
- `tsc` (flock, local) — clean EXIT:0
- more40 — **N/A**
- Node `/home/box/.local/node/node-v22.19.0-linux-x64/bin` · nice -n 19 · **NO** dev server / browser

## Deploy

| Field | Value |
|---|---|
| When (HKT) | 2026-10-16 ~22:09 |
| APP_VERSION | **2.20** |
| Stamp | `v2.20-20261016-220707` |
| Bundle | `index-xg4V5SNv-r2.js` |
| MD5 | `f9dabd249faef8c15e4df4a1c98de4a8` |
| Prev bak (F70) | `index-QQGNjijq-r2.js` / `v2.20-20261016-215940` **kept** |
| F69–F50 baks | prior stamps **kept** |
| Assets | 89 uploaded; refs curl **200** (34) |
| Live | https://cad.neuralworkshk.com/ |
| Remotes | `fix/fishing71-motionlink-panel` + FF `fix/sketch-face-copy` → tip (vps + origin) |

## Counts
- fishing71 hard: **3 PASS**
- more40 cherry: **no**
- MATERIALS keys unchanged: **yes**
