# WebCAD v1.30 最终汇总（2026-09-18 HKT）

## 问题
LIVE @1.29 抽壳在用户所选开口面上 MakeThickSolid 失败后，落入「其他平面开口」soft toast（非腔体备用路径）：
- Fuse + 外圆角 R2 + Shell t=2 → `原开口 OCCT 未收敛，已启用其他开口面` / `已改用其他平面开口`
- BX02 切除 + 顶孔缘 Fillet R1 + Shell t=1.5（切线链开）→ `已改用其他平面开口`

## 根因
开口面边界仍带圆角时，`MakeThickSolidByJoin` 对原开口直接 throw；旧 ladder 在 cavity 之前就改用对面平面开口并告警。v1.28/v1.29 合约测的是底缘圆角+开顶（易路径），未覆盖 LIVE 顶缘圆角+开顶。

## 修复
1. seeds 失败后：seeds + 邻接 TORUS 开口缘（fuse 柱顶圆角）
2. 再：按开口缘圆角深度 trim 锐化开口 → OCCT；可选外墙高度 restore
3. 将「其他平面开口」 defer 到原开口 cavity/prismatic 之后
4. APP_VERSION 1.30

## 交付
- PR #60 · stamp `20260918-164517` · nginx root 已核对
- LIVE `APP_VERSION=1.30`（`index-DqrsTpFi-r2.js`）
- `grok-qa-v1.30-shell-original-opening.test.mjs` HARD PASS（无 alternate-opening）
- `grok-qa-v1.28` / `v1.29` PASS（无回归）

## 实体机器人重测（必须）
1. Fuse + 柱顶/外圆角 R2 + Shell t=2 开顶 — 期望 **无** `未收敛` / `其他平面开口` soft toast
2. BX02：切除 + **顶孔缘** Fillet R1 + Shell t=1.5 开顶（切线链开）— 同上
