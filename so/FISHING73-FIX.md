# FISHING73 — more40 CORE16 behavior cherry (12/12)

**Date:** 2026-10-16 (HK)  
**Branch:** `fix/fishing73-more40-cherry`  
**Product fix:** tests-only (no src) — cherry `c1884ef` ← `7fee924`  
**more40 cherry:** `c1884ef` ← `7fee924` on `test/unit-core16-more40` (cherry-pick -x)  
**Base:** tip `c32e5e7` (FISHING72 live)  
**Tip:** (after FF docs — see remotes)

## Scan

| Source | Result |
|---|---|
| BOT-D more40 | **READY** `7fee924` — soft-prep `unit/more40-soft-prep.md` · CORE16 12/12 |
| F61 plane-clarify | Still deferred |
| tip Formal invent | **Not done** |
| MATERIALS / DENSITY_PREF | SC kept (more40 always-hard) |

## Fixes

### 1. more40 CORE16 behavior sample
- Cherry `7fee924` → `c1884ef` (`tests/core16-more40-behavior-sample.test.mjs`)
- Themes: draft/shell/pipe/circpattern/scale/combine/measure/undo-fillet-chamfer/surfextrude + F70 控製 + F69 運動連結 + MATERIALS
- **BEFORE nginx** ✓

## Tests
- more40 — **12 PASS / 0 fail**
- fishing72 / fishing71 — **3 PASS each**
- `tsc` (flock) — clean EXIT:0
- Node path · nice -n 19 · **NO** dev server / browser

## Deploy

| Field | Value |
|---|---|
| When (HKT) | 2026-10-16 ~22:19 |
| APP_VERSION | **2.20** |
| Stamp | `v2.20-20261016-221705` |
| Bundle | `index-DprUAEQI-r2.js` |
| MD5 | `ebd2a923c4e97e3455b73faa34271e7a` |
| Note | Bundle hash unchanged vs F72 (tests-only more40); new stamp carries tip with more40 |
| Prev bak (F72) | `index-DprUAEQI-r2.js` / `v2.20-20261016-221200` **kept** |
| F71–F50 baks | prior stamps **kept** |
| Assets | 89 uploaded; refs curl **200** |
| Live | https://cad.neuralworkshk.com/ |
| Remotes | `fix/fishing73-more40-cherry` + FF `fix/sketch-face-copy` → tip (vps + origin) |

## Counts
- more40 cherry: **yes** (`7fee924` → `c1884ef`)
- more40 hard: **12 PASS**
- MATERIALS keys unchanged: **yes**
