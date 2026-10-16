# FISHING42 — Formal TC SC leftovers (worker facefillet/offset/surf) + more26 harden

**Date:** 2026-10-16 (HK)  
**Branch:** `fix/fishing42-sc-leftovers-formal-tc`  
**Base:** tip `896b40d` (FISHING41 live) + merge more26 `16a23fc` + harden `4bc22f1`  
**Tip:** `c683854` (`c6838544120f556bceaa50aa18c04fad05ad7c60`)

## more26 harden (prerequisite)

| Step | Result |
|---|---|
| Fetch + merge `fix/unit-core16-more26` @ `16a23fc` into sketch-face-copy | merge `4cb4afc` (tests-only soft→hard prep) |
| Harden store soft skips → hard PASS | `4bc22f1` — 14 store refuse Formal pins hard (FISHING41 product already converted) |
| Harden 6 worker soft skips → hard PASS | this tip — after Formal TC convert below |

## Scan

| Source | Result |
|---|---|
| `unit/SC-LEFTOVERS.md` + rescan on tip after FISHING41 | UI-priority still ~792 hits (store 457 / worker 171 / Viewport 70 / …) |
| Prefer: more26 soft pins + facefillet / offset / delete-extend-replace / surf sweep-trim | **Converted ~75** unique Formal TC strings this round |

## Fixes

### 1. Formal TC — SC-LEFTOVERS batch (product)
`src/worker/cad.worker.ts` — ~75 replacements, including more26 soft pins:
- 面圓角：拾面無法解析 — 已保留原實體
- 圓角／倒角結果無法顯示，請縮小尺寸或減少選擇的邊
- 沒有可用的水平頂邊／底邊，請直接選擇邊
- 偏移曲面失敗（該面不適合偏移 / 距離過大自交）— 保持原樣
- 刪面失敗：
- 曲面掃掠失敗（截面／路徑無效或掃出無界形）
- plus face-fillet family, offset/extend/replace/move-face, surf extrude/sweep/trim/untrim/pole-edit, sketch-source, draft/scale refuses

`src/ribbon.ts` — 橋接 FORM tip 棱→稜  
`src/i18n.ts` — TC aliases for offset / deleteface EN lookup

### 2. more26 soft→hard
`tests/fishing41-sc-refuse-formal-prep.test.mjs` — all 20 Formal pins hard PASS (0 soft skip)

## Tests
- `tests/fishing41-sc-refuse-formal-prep.test.mjs` — **22 PASS** (0 skip)
- `tests/fishing42-sc-leftovers-formal-tc.test.mjs` — **9 PASS**
- fishing41 emboss/presspull/combine/split — PASS
- fishing40 loft/thicken Formal — PASS
- `tsc -b` (flock `/tmp/webcad-tsc.lock`) — clean

## Deploy

| Field | Value |
|---|---|
| When (HKT) | 2026-10-16 ~18:07 |
| APP_VERSION | **2.20** |
| Stamp | `v2.20-20261016-180742` |
| Bundle | `index-BJufpISz-r2.js` |
| MD5 | `97dc773267ebc8988862250714655c0b` |
| Prev (bak) | `index-BjSgXiJj-r2.js` / `v2.20-20261016-175031` **kept** |
| Assets | 89 uploaded; index asset refs curl **200** (0 bad) |
| Live | https://cad.neuralworkshk.com/ |
| Remotes | `fix/fishing42-sc-leftovers-formal-tc` + FF `fix/sketch-face-copy` → tip (vps + origin) |
