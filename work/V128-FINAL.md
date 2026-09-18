# WebCAD v1.28 最終彙總（2026-09-18 HKT）

## 本版目標
硬化 cut+fillet 後抽壳：BX02 類模型優先真 OCCT MakeThickSolid，減少／消除「备用：开口面偏移型腔」。

## Root cause
向内 `MakeThickSolidByJoin` 預設 `Intersection=false` 時，若壁厚 ≥ 局部圓角半徑（BX02 R1 + t≥1.0）會自交失敗，落入 cavity 軟後備。

## Fix
`_shellExactFaces` 在舊 flag 組合之後加試 `Intersection=true`（及 `RemoveIntEdges=true`）；cavity 仍保留作最後手段。

## 部署
- PR #58 · stamp `20260918-140131` · nginx root 已核對
- LIVE `APP_VERSION=1.28`（`index-DyNkIp9T-r2.js`）

## 測試
- `grok-qa-v1.28-shell-occt-after-fillet.test.mjs` 5/5 HARD PASS（無备用）

## 建議 solid bot
重測 BX02：切除 + Fillet R1 + Shell t=1.5 — **應無「备用」**；若仍見备用請記開口面／壁厚。
