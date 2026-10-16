# FISHING62 — tip.align → ASSEMBLE「選面配合」+ more38 cherry

**Date:** 2026-10-16 (HK)  
**Branch:** `fix/fishing62-align-formal-leftovers`  
**Product fix:** `fb65711` (tip.align i18n)  
**more38 cherry:** `008b56c` ← `75c18ef` on `test/unit-core16-more38` (cherry-pick -x)  
**Base:** tip `58e473e` (FISHING61 live)  
**Tip:** `aaefac5e097c14f37b2a4b0859a5158489505078`

## Scan

| Source | Result |
|---|---|
| F59/F60 recheck P1 | Modify「對齊」tip omitted 選面配合 — root cause `resolveRibbonTip` prefers stale `tip.align` over ribbon.ts |
| tip.joint / faceMate | PASS (F60) 轉動／面貼合 |
| BOT-D more38 | **READY** `75c18ef` — cherry into this wave |
| MATERIALS / DENSITY_PREF | SC kept |
| Product branch | **`fix/sketch-face-copy`** (not feature/) |

## Fixes

### 1. tip.align catalog Formal + 選面配合 (實體 F59 FAIL)
- `src/i18n/locales/zh-HK.ts` — tip.align one-shot + ASSEMBLE「選面配合」
- `zh-CN.ts` / `en.ts` — parity
- `src/ribbon.ts` — punctuation sync (fallback)

### 2. more38 CORE16 behavior sample
- Cherry `75c18ef` → `008b56c` (`tests/core16-more38-behavior-sample.test.mjs`)
- Themes: MATERIALS＋tip.joint 轉動／面貼合 · loft rail／<2 · emboss · extrude dist0／cut-through · sketch dual-icon · 2×2 pattern · shell/split

## Tests
- fishing62 hard — **3 PASS / 0 fail**
- more38 — **10 PASS / 0 fail**
- `tsc` (flock) — clean
- Node `/home/box/.local/node/node-v22.19.0-linux-x64/bin` · nice -n 19 · **NO** dev server

## Deploy

| Field | Value |
|---|---|
| When (HKT) | 2026-10-16 ~21:17 |
| APP_VERSION | **2.20** |
| Stamp | `v2.20-20261016-211548` |
| Bundle | `index-KqyjsbdE-r2.js` |
| MD5 | `df59df8f3f0a82d660f92d8eb89faa8f` |
| Prev bak (Align-only) | `index-KqyjsbdE-r2.js` / `v2.20-20261016-211202` **kept** |
| F61 bak | `index-DRidV7bo-r2.js` / `v2.20-20261016-210646` **kept** |
| F60–F50 baks | prior stamps **kept** |
| Assets | 89 uploaded; refs curl **200** |
| Live | https://cad.neuralworkshk.com/ |
| Remotes | `fix/fishing62-align-formal-leftovers` + FF `fix/sketch-face-copy` → tip (vps + origin) |
| Note | Bundle hash unchanged vs Align-only (tests-only more38); new stamp carries tip with more38 |

## Counts
- fishing62 hard: **3 PASS**
- more38 cherry: **yes** (`75c18ef` → `008b56c`)
- MATERIALS keys unchanged: **yes**
