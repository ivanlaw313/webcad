# FISHING46 — Formal TC SC leftovers + Fusion CSS + more28 harden

**Date:** 2026-10-16 (HK)  
**Branch:** `fix/fishing46-sc-leftovers-fusion-css`  
**Base:** tip `b6bf913` (FISHING45 live)  
**Tip:** `b757103` (`b7571032b8d5d9ae372ab917c46e2fce188b9160`)  
**more28:** merged `4815aae` (tests-only soft/hard prep) then hardened (0 skip)

## Scan

| Source | Result |
|---|---|
| `so/` fishing 35–45 | **No new open P1** product bugs (side2 Formal refuse already on tip; Assemble icons closed FISHING39; revolve miss-cut = QA path vs section-check) |
| more28 soft pins @ 4815aae | **72 soft** on tip 66cb8c3 baseline; after FISHING45 + this round → **0 skip / all hard** |
| Prefer: BOT-D 38 remaining soft SC + diversify | **Converted** all 38 + broader ~110 UV Formal TC; **CSS-only** Fusion tree/timeline/chip rhythm |
| Rescan UV post-apply | convertible ~203 → UV ~81 (WindTunnel debug left) |

## Fixes

### 1. Formal TC — more28 / SC-LEFTOVERS (product)
Priority 38 (BOT-D logs-b6bf913) + batch:
- `src/store.ts` — 頂面/底面/豎直稜、網格稜長、邊界稜清空、兩面中面、無干涉、清空文檔、載入範本、拔模側面…
- `src/worker/cad.worker.ts` — 矩形/路徑陣列、掃掠曲面、移動面、Build 失敗、讀 fillet Shape…
- `src/components/Viewport.tsx` — 逐稜半徑、圓孔稜、邊界稜、內壓、折痕銳邊、邊界面鏡像、極坐標/透視/自適應/全長…
- `src/components/CSketch.tsx` — 鎖定點 Y 座標、兩線共線、兩圓中心距
- `src/components/SketchLayer.tsx` — 刪除尺寸、軟尺寸／參考讀數、顯示為半徑/直徑、aria-label 軟尺寸
- `src/components/FormTransformFields.tsx` — 控制籠局部**座標** (HK)、應用變換
- `src/components/AiCopilot.tsx` / `HdriEnvironment.tsx` / `BrowserTree.tsx` — 清空對話、齒輪範本、觸發 fallback、隱藏其餘

### 2. Fusion UI micro-polish (CSS-only)
`src/index.css` — FISHING46 after FISHING43:
- `.tree-row` min-height 24px / gap 5px / padding
- `.tl-chip` margin-right 4px / border-radius 5px; `.tl-track` / `.tl-controls` breathing
- `.feat-editor` gap/padding + label gap 8px (align cmd-palette)
- `.sel-chip` letter-spacing; `.panel-menu-item` min-height 28px
- **No** `data-cmd` / `data-testid` changes

### 3. i18n TC aliases
`src/i18n.ts` — 極坐標 / 透視 X-ray / 應用變換 / 控制籠局部座標 / 孤立顯示…

### 4. more28 harden
`tests/fishing45-sc-leftovers-formal-prep.test.mjs` — soft→**full hard** (0 skip on tip)

## Tests
- fishing46 Formal+CSS — **7 PASS**
- more28 prep (fishing45 Formal soft/hard) — **PASS 0 skip**
- fishing45 / fishing44 Formal — **PASS** (98 total this suite)
- `tsc -p tsconfig.app.json --noEmit` (flock) — clean
- Node `/home/box/.local/node/node-v22.19.0-linux-x64/bin` · nice -n 19 · **NO** dev server

## Deploy

| Field | Value |
|---|---|
| When (HKT) | 2026-10-16 ~18:37 |
| APP_VERSION | **2.20** |
| Stamp | `v2.20-20261016-183634` |
| Bundle | `index-BwqqsU43-r2.js` |
| MD5 | `c936d002ce9e2b709449e1076a3985ae` |
| Prev (bak) | `index-BarRfqgI-r2.js` / `v2.20-20261016-182856` **kept** |
| Assets | 89 uploaded; index asset refs curl **200** (0 bad) |
| Live | https://cad.neuralworkshk.com/ |
| Remotes | `fix/fishing46-sc-leftovers-fusion-css` + FF `feature/sketch-face-copy` → tip (vps + origin) |

## Counts
- Formal TC applied (batch): **~110** UV + residual 38 BOT-D softs
- more28 soft→hard: **72 → 0 skip**
- CSS polish rules: **10**
