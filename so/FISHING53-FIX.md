# FISHING53 — Product Formal UV (ai/tools + geom/analysis/IO) + more33 harden

**Date:** 2026-10-16 (HK)  
**Branch:** `fix/fishing53-product-formal-uv`  
**Product fix:** `b2ca8d137d006ae6e159662a78db0d7330be201e`  
**more33 soft-prep:** `8b7058d56eea3490d9c0db27bdf8f562ad39a89b` (cherry-pick `3382a56`)  
**Harden:** `14ca14f4eac8d234623c6c9ffea1c19fd5947c4a`  
**Base:** tip `a288e85` (FISHING52 live)  
**Tip:** `14ca14f4eac8d234623c6c9ffea1c19fd5947c4a`

## Scan

| Source | Result |
|---|---|
| `so/` fishing 35–52 | **No new open P1** product bugs (F51 PARTIAL unreached Formal; F52 PASS @CtRHOlPv) |
| Residual SC after FISHING52 | UI priority **121** — mostly MATERIALS keys (keep SC); other product **347** |
| Prefer: other-product Formal UV | BOT-D more33 soft-prep `3382a56` (61 soft pins: ai/tools18／moldflow8／primitiveFit7／voxelfea5／threeMfImport5／其餘) |
| Product branch | **`fix/sketch-face-copy`** (not feature/) — FF → this tip |

## Fixes

### 1. Formal TC — product UV (non-MATERIALS)
- `src/ai/tools.ts` — AI tool descriptions Formal (長方體／圓柱／倒圓角／抽殼／哪裏／憑空／憑記憶…) — deferred by F52
- `src/geom/primitiveFit.ts` — fit notes Formal (半徑／弧覆蓋／半頂角／等半徑…)
- `src/analysis/moldflow.ts` — 體素化／厚度場／流道平衡／薄壁建議 Formal
- `src/analysis/voxelfea.ts` — 截面自適應／軸承載荷／單元 vm Formal
- `src/io/threeMfImport.ts` — XML／頂點／網格 refuse Formal leftovers
- `src/geom/brepRebuild.ts` — 邊界環／參數化 refuse Formal
- `src/cad/gears.ts` — 目標比／純運動學參考 Formal leftovers
- `src/sketch/projectLinks.ts` / `textShapes.ts` — 開放／閉合／字號 Formal
- `src/cad/viewBookmark.ts` / `inferConstraints.ts` — 視圖／夾角 Formal
- `src/geom/slicePreview.ts` / `src/io/{meshProject,pdf,imageTrace,laserGcode}.ts` — layer/IO Formal
- `src/analysis/feacsv.ts` / `moldsolve.ts` — （無）／翹曲位移／殘餘應力 Formal
- **Kept** MATERIALS / DENSITY_PREF SC storage keys; names.ts dual sc/tc; kinematics JOINT_LABEL SC keep; aeroI18n/brief keywords; F51/F52 Formal strings TC (圓稜／弧長／轉動／剛性／面貼合／斑馬紋／脫模／鈑金／DXF…)

### 2. i18n TC aliases
`src/i18n.ts` — FISHING53 Formal TC product UV block (unique keys only)

### 3. CSS freebie
`src/index.css` — FISHING53 AI copilot / moldflow / fea / geom-fit rhythm

### 4. more33 harden
Cherry-pick BOT-D `3382a56` soft-prep → softs **61→0 skip** / **64 PASS** (3 always-hard + 61 Formal); residual soft-pin comment 「等半径 →」→「等半徑 →」

## Tests
- fishing53 Formal hard — **6 PASS**
- fishing53 more33 soft-prep (hardened) — **64 PASS / 0 skip**
- fishing52 Formal regressions — **8 PASS** (via combined suite)
- Combined Formal suite (F53+F52+more33) — **70+ PASS / 0 skip**
- `tsc -p tsconfig.app.json --noEmit` (flock) — clean
- Node `/home/box/.local/node/node-v22.19.0-linux-x64/bin` · nice -n 19 · **NO** dev server

## Deploy

| Field | Value |
|---|---|
| When (HKT) | 2026-10-16 ~20:01 |
| APP_VERSION | **2.20** |
| Stamp | `v2.20-20261016-200102` |
| Bundle | `index-aCbC2XoX-r2.js` |
| MD5 | `b0589fe1999cc556eaf554203f5678f2` |
| Prev bak | `index-CtRHOlPv-r2.js` / `v2.20-20261016-194504` **kept** |
| F51 bak | `index-DcxSrmLk-r2.js` / `v2.20-20261016-193000` **kept** |
| Mid bak | `index-CikSa4HM-r2.js` / `v2.20-20261016-192605` **kept** |
| FISHING50 bak | `index-C2stU6yj-r2.js` / `v2.20-20261016-191338` **kept** |
| Assets | 89 uploaded; index+lazy refs curl **200** (0 bad) |
| Live | https://cad.neuralworkshk.com/ |
| Remotes | `fix/fishing53-product-formal-uv` + FF `fix/sketch-face-copy` → tip (vps + origin); **not** feature/ |

## Counts
- Formal TC UV applied (batch): **~80+** unique phrase families / **~84** line ops across 18 product files (excl. i18n/css/tests) + tools mop-up
- more33 soft→hard: **61 soft → 0 skip** (64/64 PASS)
- MATERIALS keys unchanged: **yes**
- Pre UI priority: **121** (MATERIALS-heavy); other product was **347** post-F52
