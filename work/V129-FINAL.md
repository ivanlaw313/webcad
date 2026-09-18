# WebCAD v1.29 最终汇总（2026-09-18 HKT）

## 本版目标
硬化 fuse+外圆角 后抽壳：优先真 OCCT MakeThickSolid，减少／消除「备用：开口面偏移型腔」。

## Root cause
向内 `MakeThickSolidByJoin` 在壁厚 **恰好等于** 外圆角半径（`t===R`）时几何奇点自交失败（t=1.99/2.01 成功，t=2.0 落入 cavity）。v1.28 的 Intersection 标志修复 cut+fillet 的 `t≥R`，但不覆盖此精确相等奇点；SelfInter 无效。

## Fix
`_shellExactFaces` 在精确厚度 flag/join/tol 梯子失败后，以微扰厚度 `±1e-4..1e-2` 重试 MakeThickSolid；cavity 仍保留作最后手段。

## 部署
- PR #59 · stamp `20260918-153627` · nginx root 已核对
- LIVE `APP_VERSION=1.29`（`index-BBwNdBpN-r2.js`）

## 测试
- `grok-qa-v1.29-shell-occt-after-fuse-fillet.test.mjs` HARD PASS（无备用）
- `grok-qa-v1.28-shell-occt-after-fillet.test.mjs` PASS（无回归）

## 建议 solid bot
1. **是** — 重测 fuse+外圆角 R2 + Shell t=2（顶／底开口）— **应无「备用」**
2. 抽检 BX02：切除 + Fillet R1 + Shell t=1.5 — 应仍无备用
