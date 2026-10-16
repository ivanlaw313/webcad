# FISHING79 — FEA/generative Formal 設定力 (store/ribbon/ai/i18n)

**Date:** 2026-10-16 (HK)  
**Branch:** `fix/fishing79-behavior-ux`  
**Product fix:** `c88d1c5`  
**more41 soft-prep:** **READY `1dbcebc` but AFTER nginx cut** — **no cherry this wave** (defer F80; no second deploy)  
**Base:** tip `f6d6ca3` (FISHING78 live)  
**Tip:** `7cfa9288f5bfa8f70249f812340521f5cf580ddd`

## Scan

| Source | Result |
|---|---|
| F78 Viewport | 設定力 fixed in tips; store/ribbon/ai/i18n still `設力` |
| more41 | READY `1dbcebc` (12/12) arrived after nginx → F80 |
| MATERIALS / DENSITY_PREF | SC kept |

## Fixes

### 1. Formal 設定力 leftovers
- store: generative statuses + FEA load status + buckling gate (`并設力` → `並設定力`)
- ribbon tip.fea; ai/tools buckling description; i18n.ts keys synced

## Tests
- fishing79 hard — **3 PASS**
- fishing78 — **3 PASS**
- `tsc` — EXIT:0
- more41 — **not cherry-picked** (post-cut)

## Deploy

| Field | Value |
|---|---|
| When (HKT) | 2026-10-16 ~22:50 |
| APP_VERSION | **2.20** |
| Stamp | `v2.20-20261016-224809` |
| Bundle | `index-BWU5nLRf-r2.js` |
| MD5 | `e84aa250224e65a79aa2b68d52ddbfac` |
| Prev bak (F78) | `index-JLbPp9k6-r2.js` / `v2.20-20261016-224157` **kept** |
| Live | https://cad.neuralworkshk.com/ |
| Remotes | `fix/fishing79-behavior-ux` + FF `fix/sketch-face-copy` → tip (vps + origin) |
| Note | more41 READY mid/post deploy — **no 2nd stamp** |

## Counts
- fishing79 hard: **3 PASS**
- more41 cherry: **no** (READY → F80)
- MATERIALS keys unchanged: **yes**
