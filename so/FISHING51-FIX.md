# FISHING51 — Analysis/CAD refuse Formal TC + HDRI/selection

**Date:** 2026-10-16 (HK)  
**Branch:** `fix/fishing51-analysis-cad-refuse-formal`  
**Product fix:** `a28a23f092084304975e6d67db96447e4f267f2e`  
**Harden:** `3f281c554aba12d8d142b7e628b93560fc04c782` (more31 soft→hard + 潛伏式)  
**Base:** tip `9a49f4a` / product `0d803a5` (FISHING50 live)  
**Tip:** `4a29bdcd38957555db6d378a5ac3a77ad716f49f`

## Scan

| Source | Result |
|---|---|
| `so/` fishing 35–50 | **No new open P1** product bugs (rechecks PASS @C2stU6yj) |
| Residual SC after FISHING50 | UI priority **121** / store **119** — mostly MATERIALS keys (keep SC) |
| Prefer: analysis/CAD refuse Formal | BOT-D more31 soft-prep `b51d1f4` (63 soft pins) |
| Product branch | **`fix/sketch-face-copy`** (not feature/) — FF → this tip |

## Fixes

### 1. Formal TC — analysis / CAD refuse + chrome
- `src/cad/asymmetricFillet.ts` / `weightedFillet.ts` / `fullRound.ts` / `moveFacePlan.ts` — refuse Error Formal
- `src/cad/selectionModel.ts` — SEL_TYPES 組件／實體／邊／頂點／草圖
- `src/cad/dimensionExpression.ts` — expression Error Formal
- `src/cad/cadService.ts` / `parameterUsage.ts` — kernel / param crumbs
- `src/io/meshBool.ts` / `meshRepair.ts` — shell/bool refuse Formal
- `src/analysis/voxelfea.ts` / `moldflow.ts` / `gateTypes.ts` / `feacsv.ts` — FEA/mold refuse + CSV headers + gate names（含 潛伏式）
- `src/cam/mill25d.ts` / `finish3d.ts` — offset / 刀徑 Formal
- `src/geom/brepRebuild.ts` — rebuild refuse samples
- `src/render/hdriPresets.ts` — label/hint Formal
- `src/simulation/resultValidity.ts` — 模擬結果已失效／結果已失效
- **Kept** MATERIALS / DENSITY_PREF SC storage keys; store 面貼合／圓稜／弧長／轉動／剛性 **still TC** (FISHING48–50)

### 2. i18n TC aliases
`src/i18n.ts` — FISHING51 Formal TC analysis/CAD refuse block

### 3. CSS freebie
`src/index.css` — FISHING51 inspector / feat-dlg / mill-ops / hdri-preset-hint rhythm

### 4. more31 harden
Cherry-pick BOT-D `b51d1f4` soft-prep → softs **63→0 skip** / **82 PASS** (sim pin → 模擬結果已失效; 直接/主流道 SC≡TC hard presence)

## Tests
- fishing51 Formal hard — **8 PASS**
- fishing51 more31 soft-prep (hardened) — **82 PASS / 0 skip**
- fishing50 Formal regressions — **8 PASS**
- feacsv Formal headers — **15 PASS**
- `tsc -p tsconfig.app.json --noEmit` (flock) — clean
- Node `/home/box/.local/node/node-v22.19.0-linux-x64/bin` · nice -n 19 · **NO** dev server

## Deploy

| Field | Value |
|---|---|
| When (HKT) | 2026-10-16 ~19:31 |
| APP_VERSION | **2.20** |
| Stamp | `v2.20-20261016-193000` |
| Bundle | `index-DcxSrmLk-r2.js` |
| MD5 | `fec1f1edb062296f4afa7701396393d5` |
| Prev bak | `index-CikSa4HM-r2.js` / `v2.20-20261016-192605` **kept** |
| FISHING50 bak | `index-C2stU6yj-r2.js` / `v2.20-20261016-191338` **kept** |
| Assets | 89 uploaded; index+lazy refs curl **200** (0 bad) |
| Live | https://cad.neuralworkshk.com/ |
| Remotes | `fix/fishing51-analysis-cad-refuse-formal` + FF `fix/sketch-face-copy` → tip (vps + origin); **not** feature/ |

## Counts
- Formal TC UV applied (batch): **~70+** unique phrases / **~334** CJK line ops (product `a28a23f`) + 潛伏式 harden
- more31 soft→hard: **63 soft → 0 skip** (82/82 PASS)
- MATERIALS keys unchanged: **yes**
- Pre UI priority: **121** (store 119); residual mostly MATERIALS/template FPs
