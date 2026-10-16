# FISHING41 — Formal TC SC leftovers (CORE16/sketch) + emboss/presspull/combine/split

**Date:** 2026-10-16 (HK)  
**Branch:** `fix/fishing41-sc-leftovers-formal-tc`  
**Base:** tip `9edd246` (FISHING40 live)  
**Tip:** `440f105` (`440f10597380523b384543a0d2634d78a0762b3f`)

## Scan

| Source | Result |
|---|---|
| `unit/SC-LEFTOVERS.md` (tip 59837e4 scan) | UI-priority store/worker/Viewport/ribbon still had large SC residue; this round converted **~70–80** highest-traffic CORE16 + sketch user-visible strings (not all 5839) |
| Prefer: emboss / presspull / combine / split messages | **Open SC** on worker/store for bodyboolean, Boundary Fill, split face/body/silhouette, merge faces, presspull cyl, emboss prompts — fixed |
| `so/FISHING35-recheck.md` | Live tip still has Formal `第二側距離不可為 0` + `extrude-side2-zero-alert` (curl-verified on BjSgXiJj) |
| Fusion icon micro-gaps | No new P1 after FISHING39 Assemble; CSS-only combine checklist rhythm added |

## Fixes

### 1. Formal TC — SC-LEFTOVERS batch (product)
`src/store.ts` — CORE16 / sketch / hole / datum / FEA / import status & prompts, e.g.:
- fillet/chamfer: `共線角無法倒角`, `圓角失敗` / `倒角失敗`, `所有稜邊`, `全稜倒圓角/倒角`, edge-pick `…的稜`
- rebuild: `⚠ 重建失敗 — 已保留上一個有效模型…`
- sketch/datum: 圓柱捲曲、參考/角度/偏移/相切/平分面、掃掠棱→稜、`請輸入 1/2/3 選擇操作`
- hole: 刪除特徵、基本體替換、建模螺紋、沉頭/埋頭/鑽孔 Formal
- emboss: `輸入要刻的文字…字號…`, `凹刻需要先有實體承接`, `文字幾何生成失敗`
- combine-adjacent: Boundary Fill 目標/工具獨有、其餘 cell…

`src/worker/cad.worker.ts` — emboss/presspull/combine/split family:
- 實體布爾 / Boundary Fill / 分割面 / 輪廓分割 / 合併面 / 圓柱按拉 / 分割體 / 齒輪等生成失敗 Formal TC

`src/components/Viewport.tsx` — 二極管激光、其餘 cell、棱→稜 samples  
`src/components/PathTraceLayer.tsx` / `HdriEnvironment.tsx` / `CSketch.tsx` / `ribbon.ts` — leftover Formal samples  
`src/i18n.ts` — TC aliases for emboss / split-face EN lookup

### 2. Fusion UI micro-polish (CSS-only)
`src/index.css` — after FISHING40 dialog rhythm:
- `.cmd-palette-body label:has(input[type=checkbox])` gap/margin for combine tool checklist
- combine-need-newbody / combine-edit-note line-height
- **No** `data-cmd` / `data-testid` changes

### 3. FISHING35 recheck (live)
On tip/live: red Formal 「第二側距離不可為 0」 + alert testid still in bundle.

## Tests
- `tests/fishing41-emboss-presspull-combine-split-formal-tc.test.mjs` — PASS (SC-LEFTOVERS sample + emboss/presspull/combine/split + CSS + FISHING35)
- fishing40 loft/thicken Formal TC — PASS
- `tsc -b` (flock `/tmp/webcad-tsc.lock`) — clean

## Deploy

| Field | Value |
|---|---|
| When (HKT) | 2026-10-16 ~17:50 |
| APP_VERSION | **2.20** |
| Stamp | `v2.20-20261016-175031` |
| Bundle | `index-BjSgXiJj-r2.js` |
| MD5 | `540f6df6ca9a5f391da0c83e40bf5fce` |
| Prev (bak) | `index-BXtybmyd-r2.js` / `v2.20-20261016-174041` **kept** |
| Assets | 89 uploaded; index asset refs curl **200** (0 bad) |
| Live | https://cad.neuralworkshk.com/ |
| Remotes | `fix/fishing41-sc-leftovers-formal-tc` + FF `fix/sketch-face-copy` → tip (vps + origin) |
