# FISHING44 — Formal TC SC leftovers (store/worker UV + more27 soft harden)

**Date:** 2026-10-16 (HK)  
**Branch:** `fix/fishing44-sc-leftovers-formal-tc`  
**Base:** tip `b00d8fe` (FISHING43 live)  
**Tip:** `10f2572` (`10f257237aa282a3873021be518bdec9c1bac44d`)  
**more27:** merged `4682a17` (soft/hard prep) then hardened

## Scan

| Source | Result |
|---|---|
| more27 soft prep @ 4682a17 | 23 soft pins; FISHING43 already converted ~13; **10 residual softs** converted here |
| Prefer: store/worker user-visible | **~95–130** Formal TC string edits this round (store FEA/import/moldflow/measure + worker offset/moveface/trim/pole) |
| Prep B | more27 expected `／` for 內螺紋 → accept product ASCII `/` |

## Fixes

### 1. more27 residual softs → Formal TC (10)
- `CSketch.tsx` — `X坐标`/`Y坐标` → `X座標`/`Y座標`；鎖定點的 X 座標 title
- `store.ts` — 已恢復特徵；繼續導入？；體素趨勢級 ≈±5%；該載荷方向不會屈曲；WebCAD 模擬分析報告
- `SketchLayer.tsx` — 刪除此尺寸
- `CommandDialog.tsx` — 清空所選重新點選

### 2. Broader store/worker UV Formal TC batch
`src/store.ts` — FEA/屈曲/模流報告、大型網格導入、掃掠重生成、量邊/邊界補面 棱→稜、範本載入等  
`src/worker/cad.worker.ts` — 整體偏移／移動面／曲面旋轉／裁剪／極點編輯；導軌掃掠失敗；圓角（逐邊半徑）／倒角（逐邊距離）；活動實體  
`src/i18n.ts` — TC aliases：已恢復特徵／模擬分析報告／清空所選重新點選

### 3. Harden more27 prep
`tests/fishing43-sc-leftovers-formal-prep.test.mjs` — soft→hard on tip; prep B ASCII `/` for 內螺紋幾何失敗  
`tests/fishing44-sc-leftovers-formal-tc.test.mjs` — **6 PASS**

## Tests
- fishing44 Formal — **6 PASS**
- fishing43 Formal + more27 prep (hardened) — **PASS** (41 total w/ fishing43)
- `tsc -b` (flock `/tmp/webcad-tsc.lock`) — clean
- Node `/home/box/.local/node/node-v22.19.0-linux-x64/bin` · nice -n 19 · **NO** dev server

## Deploy

| Field | Value |
|---|---|
| When (HKT) | 2026-10-16 ~18:22 |
| APP_VERSION | **2.20** |
| Stamp | `v2.20-20261016-182138` |
| Bundle | `index-C-y_hoCq-r2.js` |
| MD5 | `be16d8212e607c602b5d935015a6dc5e` |
| Prev (bak) | `index-jGEJgDz5-r2.js` / `v2.20-20261016-181339` **kept** |
| Assets | 89 uploaded; index asset refs curl **200** (0 bad) |
| Live | https://cad.neuralworkshk.com/ |
| Remotes | `fix/fishing44-sc-leftovers-formal-tc` + FF `fix/sketch-face-copy` → tip (vps + origin) |
