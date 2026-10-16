# FISHING61 — revolute status/tips 轉動 + Formal 檔案／匯出 leftovers

**Date:** 2026-10-16 (HK)  
**Branch:** `fix/fishing61-revolute-formal-leftovers`  
**Product fix:** `e91598d`  
**more38 soft-prep:** **none** (not present — defer F62)  
**Base:** tip `5a8c0fa` (FISHING60 live)  
**Tip:** `d93e79e93f1fa5127900fb86b320c36a77d84bab`

## Scan

| Source | Result |
|---|---|
| F57/F60 revolute | tip.joint／kindLbl already 轉動; leftover JointsPanel flip tip + plane-clarify prompt still 旋轉／滑動 |
| Formal leftover | cad.worker 導出 STEP; ribbon/PhysicsLab/ParamsPanel/Viewport 文件 |
| BOT-D more38 | Absent — skip cherry-pick |
| Revolve feature | **kept** 旋轉 (FEATURE_TYPE_LABEL) |
| MATERIALS / DENSITY_PREF | SC kept |
| Product branch | **`fix/sketch-face-copy`** (not feature/) |

## Fixes

### 1. Revolute status/tips 旋轉→轉動
- `JointsPanel.tsx` — 反轉 tip **轉動／滑動方向相反**
- `store.ts` — joint pick plane clarify **轉動／滑動軸將取自…**
- `i18n.ts` — loop-cut key sync **可剪開的轉動關節** (matches store F60)

### 2. Formal leftover 文件→檔案 / 導出→匯出
- `cad.worker.ts` — **匯出 STEP**; **檢查檔案**是即有效 STEP
- `ribbon.ts` — 插入組件 tip **當前檔案**
- `PhysicsLab.tsx` — **WebCAD 檔案**風洞結果
- `ParamsPanel.tsx` — CSV tip **方便檔案/分享**
- `Viewport.tsx` — 材質庫 **跨檔案全局儲存**

## Tests
- fishing61 hard — **5 PASS / 0 fail**
- `tsc` (flock) — clean
- more38 — **N/A**
- Node `/home/box/.local/node/node-v22.19.0-linux-x64/bin` · nice -n 19 · **NO** dev server

## Deploy

| Field | Value |
|---|---|
| When (HKT) | 2026-10-16 ~21:08 |
| APP_VERSION | **2.20** |
| Stamp | `v2.20-20261016-210646` |
| Bundle | `index-DRidV7bo-r2.js` |
| MD5 | `790e3ba1df6934b6b0dd69f365eeb5f8` |
| Prev bak (F60) | `index-Dy3uJ3hw-r2.js` / `v2.20-20261016-210047` **kept** |
| F60mid bak | `index-C02fj7wI-r2.js` / `v2.20-20261016-205656` **kept** |
| F59 bak | `index-BGof85ue-r2.js` / `v2.20-20261016-205130` **kept** |
| F58–F50 baks | prior stamps **kept** |
| Assets | 89 uploaded; refs curl **200** |
| Live | https://cad.neuralworkshk.com/ |
| Remotes | `fix/fishing61-revolute-formal-leftovers` + FF `fix/sketch-face-copy` → tip (vps + origin) |

## Counts
- fishing61 hard: **5 PASS**
- more38 cherry: **no**
- MATERIALS keys unchanged: **yes**
