# FISHING50 — Store Formal TC leftovers (mate / mold / beam / sketch)

**Date:** 2026-10-16 (HK)  
**Branch:** `fix/fishing50-store-formal-leftovers`  
**Product fix:** `0d803a5bae7a1fcc305f75f1567cf9287e34827d`  
**Base:** tip `981ca9b` (FISHING49 live product) → rebased onto `fix/sketch-face-copy` docs tip `1de3583`  
**Tip:** `0d803a5bae7a1fcc305f75f1567cf9287e34827d`

## Scan

| Source | Result |
|---|---|
| `so/` fishing 35–49 | **No new open P1** product bugs |
| Residual SC after FISHING49 @ 981ca9b | UI priority **172** (store ~170); BOT-D rescan |
| This wave | **~51** store Formal UV hits converted (170→119); UI priority **172→121** |
| Prefer: store Formal leftovers | mate/fit/measure, conic, gear, rib/pipe, mold+beam reports |
| Product branch | **`fix/sketch-face-copy`** (not feature/) — FF → this tip |

## Fixes

### 1. Formal TC — `src/store.ts` leftovers
- Sketch: `半軸 rx` (3-pt ellipse); diagnostics `個可選點`／`條可選邊`／`無（未貼住實體面／無實體）`／`狀態欄`；`等半徑`；`草圖` label；conic `橢圓`／`雙曲`／`拋物`
- Move-face: `傾斜 °`
- Mate / fit / measure: `面貼合`／`距離`／`錯位`／`過孔`／`寬松配`／`淨空`
- Gear / group / combine: `組`／`與「…」運算`／`輸入輪`／`雙聯輪`／`輸出輪`／`姿態`／`視圖`／`齒輪嚙合`（分度圓／傳動比／齒距）
- Rib / pipe / prim / lathe: `·單側`／`·對稱`／`·距離`／`·到實體`／`圓`管／`內`／`路徑`／`圓柱`／`球體`／`淨曲面`／`車削.gcode`／`軸`
- Params: `盤半徑R`／`孔半徑r`／`外半徑R`／`內半徑r`／`螺栓數`
- Mold report: `分鐘`／`澆口`／`自動·頂部中心`／`體素`／`趨勢 Dijkstra`／`壓力求解器`／`縮痕`／`縮痕風險低`
- Beam report: `主體`／`鋼(預設)`／`歐拉細長桿控制`／`短桿壓潰控制`／`圓截面`／`扭轉`／`懸臂`／`簡支`
- **Kept** MATERIALS / DENSITY_PREF SC storage keys (`钢`/`铝`/…)

### 2. i18n TC aliases
`src/i18n.ts` — FISHING50 Formal TC store leftovers block (半軸／面貼合／過孔／歐拉…／趨勢 Dijkstra／盤半徑R／主體／鋼(預設) …)

### 3. CSS
None this wave (Formal still remaining in UI priority files).

## Tests
- fishing50 Formal — **8 PASS**
- fishing49 Formal+CSS regressions — **8 PASS**
- `tsc -p tsconfig.app.json --noEmit` (flock) — clean
- Node `/home/box/.local/node/node-v22.19.0-linux-x64/bin` · nice -n 19 · **NO** dev server

## Deploy

| Field | Value |
|---|---|
| When (HKT) | 2026-10-16 ~19:17 |
| APP_VERSION | **2.20** |
| Stamp | `v2.20-20261016-191338` |
| Bundle | `index-C2stU6yj-r2.js` |
| MD5 | `70af5d2ad03a4bb5c72a670af37df890` |
| Prev (bak) | `index-CRoGjZJt-r2.js` / `v2.20-20261016-190556` **kept** |
| Assets | 89 uploaded; index+lazy refs curl **200** (0 bad) |
| Live | https://cad.neuralworkshk.com/ |
| Remotes | `fix/fishing50-store-formal-leftovers` + FF `fix/sketch-face-copy` → tip (vps + origin); **not** feature/ |

## Counts
- Formal TC UV applied (batch): **~51** store scanner hits (48 exact phrase families / ~67 token ops + 分钟)
- Pre (981ca9b BOT-D): UI priority **172** / store ~170
- Post: UI priority **121** / store **119** (residual estimate ~110–130 actionable after MATERIALS/template FPs)
- MATERIALS keys unchanged: **yes**
