# FISHING64 — tip.pattern/presspull/shell catalog sync + more39 cherry

**Date:** 2026-10-16 (HK)  
**Branch:** `fix/fishing64-tip-formal-leftovers`  
**Product fix:** `6bcf5e5`  
**more39 cherry:** `e1e1879` ← `1e396ad` on `test/unit-core16-more39` (cherry-pick -x)  
**Base:** tip `bcf97a5` (FISHING63 live)  
**Tip:** `PLACEHOLDER_TIP`

## Scan

| Source | Result |
|---|---|
| tip.* vs ribbon | Last 3 mismatches: pattern / presspull / shell |
| Formal leftover | tip.* Formal SC-free after sync |
| BOT-D more39 | **READY** `1e396ad` — cherry before nginx switch |
| MATERIALS / DENSITY_PREF | SC kept |
| Product branch | **`fix/sketch-face-copy`** (not feature/) |

## Fixes

### 1. tip.* catalog sync (zh-HK)
- tip.pattern / tip.presspull / tip.shell → ribbon primary tips

### 2. more39 CORE16 behavior sample
- Cherry `1e396ad` → `e1e1879` (`tests/core16-more39-behavior-sample.test.mjs`)

## Tests
- fishing64 hard — **3 PASS / 0 fail**
- more39 — **10 PASS / 0 fail**
- `tsc` (flock) — clean
- Node `/home/box/.local/node/node-v22.19.0-linux-x64/bin` · nice -n 19 · **NO** dev server

## Deploy

| Field | Value |
|---|---|
| When (HKT) | 2026-10-16 ~21:31 |
| APP_VERSION | **2.20** |
| Stamp | `v2.20-20261016-212915` |
| Bundle | `index-CVCXzaLH-r2.js` |
| MD5 | `2da81de93a45c7fd788fa9543e8c3258` |
| Prev bak (F63) | `index-J7GUjhrT-r2.js` / `v2.20-20261016-212138` **kept** |
| F62–F50 baks | prior stamps **kept** |
| Assets | 89 uploaded; refs curl **200** |
| Live | https://cad.neuralworkshk.com/ |
| Remotes | `fix/fishing64-tip-formal-leftovers` + FF `fix/sketch-face-copy` → tip (vps + origin) |
| Note | Bundle hash same as tip-only build (more39 tests-only); tip includes more39 |

## Counts
- fishing64 hard: **3 PASS**
- more39 cherry: **yes** (`1e396ad` → `e1e1879`)
- MATERIALS keys unchanged: **yes**
