# FISHING58 — import/refuse Formal 導入→匯入 + 3MF chooser + more36

**Date:** 2026-10-16 (HK)  
**Branch:** `fix/fishing58-import-refuse-3mf-chooser`  
**Product fix:** `3673102ca87e9e6d4e698a3d9a9118e7fdc73bca`  
**more36 soft-prep:** `f3bedcd14cc41e02b05b4a1e109615c4e2764210` (cherry-pick `35f0418`; Formal soft pins **0** — CORE16 behavior sample 11/11 already-hard)  
**Base:** tip `3224f85` (FISHING57 live)  
**Tip:** `4b21ea4e32e709b91ea367375b62d6c0c3d31112`

## Scan

| Source | Result |
|---|---|
| F52/F53 recheck | 3MF/DXF import-refuse Formal; measure 圓稜 deeper than tip |
| FEA／模流 progress | Already Formal TC (體素化／算應力／溫度場) — no change |
| BOT-D more36 | Ready `35f0418` / `unit/more36-soft-prep.md` — cherry-pick tests only |
| Product branch | **`fix/sketch-face-copy`** (not feature/) |

## Fixes

### 1. Import / refuse Formal 導入→匯入
- `src/cad/insertModel.ts` — `rejectDxfImport` toast 簡化後**匯入**
- `src/store.ts` — large STL/OBJ/3MF confirms; STEP B-rep fail/ok; DXF/SVG status; default component names 「匯入N」

### 2. 3MF chooser mount (real UX)
- `src/store.ts` `open3MFDialog` — mount hidden `<input>` on `document.body` (F55 DXF parity); cleanup on change/cancel

### 3. Measure 圓稜／弧長 deepen
- `toggleMeasureEdge` status + Viewport card empty hint: 圓稜／弧稜 Ø、R、弧長／周長

### 4. more36 CORE16 sample (tests only)
Cherry-pick BOT-D `35f0418` → `tests/core16-more36-behavior-sample.test.mjs` (hide/rebuild, arb through, chamfer 雙距, loft 薄壁, thicken 99999, timeline reorder, pushpull ±, 圓柱／圓錐 vol, importStep refuse + MATERIALS/F56 趨勢著色 always-hard). **No Formal UV wave.**

## Tests
- fishing58 hard — **5 PASS / 0 fail**
- more36 CORE16 behavior sample — **11 PASS / 0 skip**
- `tsc -p tsconfig.app.json --noEmit` (flock) — clean
- Node `/home/box/.local/node/node-v22.19.0-linux-x64/bin` · nice -n 19 · **NO** dev server

## Deploy

| Field | Value |
|---|---|
| When (HKT) | 2026-10-16 ~20:47 |
| APP_VERSION | **2.20** |
| Stamp | `v2.20-20261016-204611` |
| Bundle | `index-DXBtrT46-r2.js` |
| MD5 | `6ce08aa56d902c71f2a88f60fdc28fef` |
| Prev bak (F57) | `index-D4sfc_aM-r2.js` / `v2.20-20261016-203810` **kept** |
| F56 bak | `index-Q71nlGol-r2.js` / `v2.20-20261016-202918` **kept** |
| F55 bak | `index-DpcW-155-r2.js` / `v2.20-20261016-202056` **kept** |
| F54 bak | `index-D3IZbGn0-r2.js` / `v2.20-20261016-201034` **kept** |
| F53 bak | `index-aCbC2XoX-r2.js` / `v2.20-20261016-200102` **kept** |
| F52 bak | `index-CtRHOlPv-r2.js` / `v2.20-20261016-194504` **kept** |
| F51 bak | `index-DcxSrmLk-r2.js` / `v2.20-20261016-193000` **kept** |
| Mid bak | `index-CikSa4HM-r2.js` / `v2.20-20261016-192605` **kept** |
| FISHING50 bak | `index-C2stU6yj-r2.js` / `v2.20-20261016-191338` **kept** |
| Assets | 89 uploaded; index+lazy refs curl **200** (0 bad / 34 refs) |
| Live | https://cad.neuralworkshk.com/ |
| Remotes | `fix/fishing58-import-refuse-3mf-chooser` + FF `fix/sketch-face-copy` → tip (vps + origin); **not** feature/ |

## Counts
- Product: insertModel + store import Formal + 3MF mount + measure deepen
- fishing58 hard: **5 PASS**
- more36 CORE16: **11 PASS** (cherry `35f0418` → `f3bedcd14cc41e02b05b4a1e109615c4e2764210`)
- MATERIALS keys unchanged: **yes**
- Formal soft→hard: **N/A**
