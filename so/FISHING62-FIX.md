# FISHING62 — tip.align i18n → ASSEMBLE「選面配合」(F59 recheck P1)

**Date:** 2026-10-16 (HK)  
**Branch:** `fix/fishing62-align-formal-leftovers`  
**Product fix:** `fb65711`  
**more38 soft-prep:** untracked test only on `test/unit-core16-more38` — **not READY** (defer F63)  
**Base:** tip `58e473e` (FISHING61 live)  
**Tip:** `fb65711a2673728f052e75b4d3732939c996006e`

## Scan

| Source | Result |
|---|---|
| F59 recheck P1 | Modify「對齊」hover omitted 選面配合 — root cause: `resolveRibbonTip` prefers `tip.align` catalog over ribbon.ts fallback (F59 already fixed ribbon.ts) |
| Revolute leftovers | Comments only; tip.joint already 轉動 |
| Formal leftover | Comments 文件預設 only — no user-visible product SC |
| BOT-D more38 | File appears untracked — **no** cherry |
| MATERIALS / DENSITY_PREF | SC kept |
| Product branch | **`fix/sketch-face-copy`** (not feature/) |

## Fixes

### 1. tip.align catalog Formal + 選面配合
- `src/i18n/locales/zh-HK.ts` — tip.align one-shot + ASSEMBLE「選面配合」
- `zh-CN.ts` / `en.ts` — parity
- `src/ribbon.ts` — punctuation 全形逗號 (fallback sync)

## Tests
- fishing62 hard — **3 PASS / 0 fail**
- `tsc` (flock) — clean
- more38 — **N/A** (not READY)
- Node `/home/box/.local/node/node-v22.19.0-linux-x64/bin` · nice -n 19 · **NO** dev server

## Deploy

| Field | Value |
|---|---|
| When (HKT) | 2026-10-16 ~21:14 |
| APP_VERSION | **2.20** |
| Stamp | `v2.20-20261016-211202` |
| Bundle | `index-KqyjsbdE-r2.js` |
| MD5 | `df59df8f3f0a82d660f92d8eb89faa8f` |
| Prev bak (F61) | `index-DRidV7bo-r2.js` / `v2.20-20261016-210646` **kept** |
| F60–F50 baks | prior stamps **kept** |
| Assets | 89 uploaded; refs curl **200** |
| Live | https://cad.neuralworkshk.com/ |
| Remotes | `fix/fishing62-align-formal-leftovers` + FF `fix/sketch-face-copy` → tip (vps + origin) |

## Counts
- fishing62 hard: **3 PASS**
- more38 cherry: **no**
- MATERIALS keys unchanged: **yes**
