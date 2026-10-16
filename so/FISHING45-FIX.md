# FISHING45 — Formal TC SC leftovers (large UV batch + QA 确定→確定)

**Date:** 2026-10-16 (HK)  
**Branch:** `fix/fishing45-sc-leftovers-formal-tc`  
**Base:** tip `66cb8c3` (FISHING44 live)  
**Tip:** `ff32cee` (`ff32cee20c077b46a792d698fb90370b5c3a52c1`)  
**more28:** not present on origin/vps — skipped merge

## Scan

| Source | Result |
|---|---|
| Rescan UI-priority on tip after FISHING44 | ~417 convertible / ~296 UV (store 337 / Viewport 48 / worker 19 / SketchLayer 10 / …) |
| Prefer: user-visible status / tips / calc / reports | **Converted 155** Formal TC string edits this round |
| QA SC leak | `确定` → `確定` (draft / pick / extrude / typed Enter) |
| Prep / more28 | no more28; no additional CORE16 product bug cherry-pick this cycle |

## Fixes

### 1. Formal TC — SC-LEFTOVERS batch (product) — 155
`src/store.ts` — ~124: FEA/moldflow/eng-report filenames & headers, calc prompts (軸承/螺絲/齒輪/彈簧/皮帶/螺栓夾緊…), draft status `確定拔模`, typed `(Enter 確定)`, extrude `→ 確定`  
`src/components/Viewport.tsx` — ~23: subdiv/FOV/sweep-path/draft/mold tips; `確定拔模` / `按確定建立` / `填字段 → 確定`; 棱→稜 / 极→極 / 确→確  
`src/worker/cad.worker.ts` — ~3 residual UV  
`src/components/AiCopilot.tsx` — ~4 placeholder / title / tips  
`src/components/SketchLayer.tsx` — 相切弧手勢 tip  

### 2. i18n TC aliases
`src/i18n.ts` — 拔模②…確定拔模 / 問我…發送 / 模流分析報告 / 工程分析報告（梁理論…）

### 3. Tests
`tests/fishing45-sc-leftovers-formal-tc.test.mjs` — **7 PASS**  
fishing44 + fishing43 Formal + more27 prep — **PASS** (48 total)

## Tests
- fishing45 Formal — **7 PASS**
- fishing44 / fishing43 Formal + prep — **PASS** (48 total w/ fishing45)
- `tsc -b` (flock `/tmp/webcad-tsc.lock`) — clean
- Node `/home/box/.local/node/node-v22.19.0-linux-x64/bin` · nice -n 19 · **NO** dev server

## Deploy

| Field | Value |
|---|---|
| When (HKT) | 2026-10-16 ~18:29 |
| APP_VERSION | **2.20** |
| Stamp | `v2.20-20261016-182856` |
| Bundle | `index-BarRfqgI-r2.js` |
| MD5 | `d6fbb7d3e422a35e69f1be32b31b1e68` |
| Prev (bak) | `index-C-y_hoCq-r2.js` / `v2.20-20261016-182138` **kept** |
| Assets | 89 uploaded; index asset refs curl **200** (0 bad) |
| Live | https://cad.neuralworkshk.com/ |
| Remotes | `fix/fishing45-sc-leftovers-formal-tc` + FF `fix/sketch-face-copy` → tip (vps + origin) |

## Counts
- Formal TC applied: **155** (pass1 130 + pass2 25)
- Forced QA 确定→確定 pins: **6**
- byFile: store 124 / Viewport 23 / AiCopilot 4 / worker 3 / SketchLayer 1
