# FISHING52 — Product Formal UV (fasteners/CAM/CAD refuse/IO) + more32 harden

**Date:** 2026-10-16 (HK)  
**Branch:** `fix/fishing52-product-formal-uv`  
**Product fix:** `0d9a76a5a7ddd876f033e04896eaff30106b791d`  
**more32 soft-prep:** `4f75c3946106ca0428e0bfcb3f311abde5959b89` (cherry-pick `2fcb480`)  
**Base:** tip `e66fe1f` (FISHING51 live)  
**Tip:** `3c280987b2bb9a6e6ac133641ffd42c3e4717fcd`

## Scan

| Source | Result |
|---|---|
| `so/` fishing 35–51 | **No new open P1** product bugs |
| Residual SC after FISHING51 | UI priority **121** — mostly MATERIALS keys (keep SC) + scanner FPs |
| Prefer: other-product Formal UV | BOT-D more32 soft-prep `2fcb480` (54 soft pins: faceFeaSelect6／mateSolve4／analysesModel4／fasteners14／smUnfold4／subdiv10／lathe12) |
| Product branch | **`fix/sketch-face-copy`** (not feature/) — FF → this tip |

## Fixes

### 1. Formal TC — product UV (non-MATERIALS)
- `src/cad/fasteners.ts` — ISO kind labels + fastenerLabel templates
- `src/cad/analysesModel.ts` — 斑馬紋／曲率趨勢／最小曲率半徑／脫模可達性
- `src/assembly/mateSolve.ts` — residual/diverge/singular/pose refuse Formal
- `src/cad/smUnfold.ts` — 鈑金孔／折彎 refuse
- `src/cad/subdiv.ts` — cage/subdivide refuse Formal
- `src/analysis/faceFeaSelect.ts` — FEA face-select refuse Formal
- `src/cam/lathe.ts` — turn/face/groove refuse + comments Formal
- `src/cam/mill25d.ts` — contour/pocket/face/drill warn Formal leftovers
- `src/io/dxfImport.ts` / `svgImport.ts` / `threeMfImport.ts` / `meshDrop.ts` — import refuse Formal
- `src/io/centerlineTrace.ts` / `imageTrace.ts` / `laserGcode.ts` — trace/G-code Formal
- `src/analysis/moldsolve.ts` — Stage-2/3/4 notes Formal
- `src/cad/gears.ts` / `inferConstraints.ts` / `insertModel.ts` / `propsReport.ts` / `parameterUsage.ts` / `bspline2d.ts` / `curvatureAnalysis.ts` / `sweepTwist.ts` / `cadService.ts` / `lbmGpu.ts`
- **Kept** MATERIALS / DENSITY_PREF SC storage keys; store 面貼合／圓稜／弧長／轉動／剛性 **still TC** (FISHING48–51)

### 2. i18n TC aliases
`src/i18n.ts` — FISHING52 Formal TC product UV block

### 3. CSS freebie
`src/index.css` — FISHING52 fastener / feat-editor / mill / import-drop rhythm

### 4. more32 harden
Cherry-pick BOT-D `2fcb480` soft-prep → softs **54→0 skip** / **57 PASS** (3 always-hard + 54 Formal)

## Tests
- fishing52 Formal hard — **8 PASS**
- fishing52 more32 soft-prep (hardened) — **57 PASS / 0 skip**
- fishing51 Formal regressions — **8 PASS** (via prep + product suite)
- Combined Formal suite — **73 PASS / 0 skip**
- `tsc -p tsconfig.app.json --noEmit` (flock) — clean
- Node `/home/box/.local/node/node-v22.19.0-linux-x64/bin` · nice -n 19 · **NO** dev server

## Deploy

| Field | Value |
|---|---|
| When (HKT) | 2026-10-16 ~19:47 |
| APP_VERSION | **2.20** |
| Stamp | `v2.20-20261016-194504` |
| Bundle | `index-CtRHOlPv-r2.js` |
| MD5 | `ddb2cb29a749c46430a435adec979b23` |
| Prev bak | `index-DcxSrmLk-r2.js` / `v2.20-20261016-193000` **kept** |
| Mid bak | `index-CikSa4HM-r2.js` / `v2.20-20261016-192605` **kept** |
| FISHING50 bak | `index-C2stU6yj-r2.js` / `v2.20-20261016-191338` **kept** |
| Assets | 89 uploaded; index+lazy refs curl **200** (0 bad) |
| Live | https://cad.neuralworkshk.com/ |
| Remotes | `fix/fishing52-product-formal-uv` + FF `fix/sketch-face-copy` → tip (vps + origin); **not** feature/ |

## Counts
- Formal TC UV applied (batch): **~70+** unique phrase families / **~170** line ops across 26 product files (excl. i18n/css/tests)
- more32 soft→hard: **54 soft → 0 skip** (57/57 PASS)
- MATERIALS keys unchanged: **yes**
- Pre UI priority: **121** (store 119); residual mostly MATERIALS/template FPs
