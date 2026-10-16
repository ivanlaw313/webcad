# FISHING80 — more41 CORE16 behavior cherry (12/12)

**Date:** 2026-10-16 (HK)  
**Branch:** `fix/fishing80-more41-cherry`  
**Product fix:** tests-only — cherry `5dedec8` ← `1dbcebc`  
**more41 cherry:** `5dedec8` ← `1dbcebc` on `test/unit-core16-more41` (cherry-pick -x) **BEFORE nginx**  
**Base:** tip `6a7ff1a` (FISHING79 live)  
**Tip:** (after FF docs — see remotes)

## Scan

| Source | Result |
|---|---|
| BOT-D more41 | **READY** `1dbcebc` — deferred from F79 post-cut; cherry this wave |
| F55–F79 Formal leftovers | No new user-visible 設力/復用/連接/件心 product gaps |
| MATERIALS / DENSITY_PREF | SC kept (more41 always-hard) |

## Fixes

### 1. more41 CORE16 behavior sample
- Cherry `1dbcebc` → `5dedec8` (`tests/core16-more41-behavior-sample.test.mjs`)
- 12/12 hard PASS · tsc0 · **BEFORE nginx** ✓

## Tests
- more41 — **12 PASS / 0 fail**
- fishing79 — **3 PASS**
- `tsc` — EXIT:0

## Deploy

| Field | Value |
|---|---|
| When (HKT) | 2026-10-16 ~22:55 |
| APP_VERSION | **2.20** |
| Stamp | `v2.20-20261016-225256` |
| Bundle | `index-BWU5nLRf-r2.js` |
| MD5 | `e84aa250224e65a79aa2b68d52ddbfac` |
| Note | Bundle hash unchanged vs F79 (tests-only more41); new stamp carries tip with more41 |
| Prev bak (F79) | `index-BWU5nLRf-r2.js` / `v2.20-20261016-224809` **kept** |
| Live | https://cad.neuralworkshk.com/ |
| Remotes | `fix/fishing80-more41-cherry` + FF `fix/sketch-face-copy` → tip (vps + origin) |

## Counts
- more41 cherry: **yes** (`1dbcebc` → `5dedec8`)
- more41 hard: **12 PASS**
- MATERIALS keys unchanged: **yes**
