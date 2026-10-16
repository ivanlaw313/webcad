# FISHING43 — Formal TC SC leftovers (mirror/delface/draft/pattern + FEA refuses)

**Date:** 2026-10-16 (HK)  
**Branch:** `fix/fishing43-sc-leftovers-formal-tc`  
**Base:** tip `d7f0b03` (FISHING42 live)  
**Tip:** `87085f7` (`87085f7915f4e79c838aa9b79ba823cea4a7f286`)

## Scan

| Source | Result |
|---|---|
| Rescan UI-priority on tip after FISHING42 | still ~741 convertible hits (store 561 / worker 97 / Viewport 66 / ribbon 17) |
| Prefer: user-visible refuses/status | **Converted ~94** unique Formal TC strings this round (+6 Viewport label extras) |
| Focus | worker mirror / Rule Fillet / delete-offset-move face / draft / circular pattern / gear-spring-rib; store FEA/moldflow/AI refuses; Viewport/ribbon 棱→稜 |

## Fixes

### 1. Formal TC — SC-LEFTOVERS batch (product)
`src/worker/cad.worker.ts` — ~48 replacements, including:
- 鏡像（新實體）／橫跨鏡像面
- Rule Fillet：兩組面沒有共同邊／沒有可倒圓邊界
- 刪面失敗（…去特徵／治愈失敗）— typo fix `去特无法征`→`去特徵／治愈失敗`
- 整體偏移／移動面／拔模角度過小／環形陣列／特徵令實體變空
- 齒輪根切／彈簧節距／筋拔模角已鉗到／相交曲線 plus 內核

`src/store.ts` — ~22 FEA/moldflow/AI refuses:
- 偏險 / 不會屈曲 / 適用性偏厚 / 內螺紋幾何失敗 / AI 出錯 / 未知計算類型 / 需要…正數

`src/components/Viewport.tsx` — 二極管、稜柱/稜錐 labels、橋接「現有稜」、逐面外觀不適用  
`src/ribbon.ts` — 全稜圓角/倒角、稜錐/稜柱 tips、仿真→模擬 samples  
`src/i18n.ts` — TC aliases for 不會屈曲 / 未知計算類型 / 環形陣列失敗

### 2. Fusion UI micro-polish (CSS-only)
`src/index.css` — status refuse / zero-alert rhythm:
- `[data-testid="extrude-side2-zero-alert"]` + `.status-warn` + `.input-error` line-height
- **No** new `data-testid` / no testid churn

## Tests
- `tests/fishing43-sc-leftovers-formal-tc.test.mjs` — **8 PASS**
- fishing42 / fishing41 / fishing40 Formal — PASS (32 total)
- `tsc -b` (flock `/tmp/webcad-tsc.lock`) — clean
- Node `/home/box/.local/node/node-v22.19.0-linux-x64/bin` · nice -n 19 · **NO** dev server

## Deploy

| Field | Value |
|---|---|
| When (HKT) | 2026-10-16 ~18:14 |
| APP_VERSION | **2.20** |
| Stamp | `v2.20-20261016-181339` |
| Bundle | `index-jGEJgDz5-r2.js` |
| MD5 | `d4998cb3c6faa4a1dc6f39cc27020881` |
| Prev (bak) | `index-BJufpISz-r2.js` / `v2.20-20261016-180742` **kept** |
| Assets | 89 uploaded; index asset refs curl **200** (0 bad) |
| Live | https://cad.neuralworkshk.com/ |
| Remotes | `fix/fishing43-sc-leftovers-formal-tc` + FF `fix/sketch-face-copy` → tip (vps + origin) |
