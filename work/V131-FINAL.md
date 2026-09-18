# WebCAD v1.31 最终汇总（2026-09-18 HKT）

## 问题
LIVE @1.30：BX02 抽壳原开口 CLEAN；BX01 Fuse+外/柱顶圆角 R2+顶开口 Shell t=2 仍报 soft toast（`未收敛` / `其他开口面`，代码串 `已改用其他平面开口`）。

## 根因
融合凸台 + 开口缘 TORUS（偶发短 CYL 环）时 MakeThickSolid 对用户所选顶面仍易失败；v1.30 seeds+TORUS/trim 不够覆盖全部 fuse 脏拓扑 → cavity 未救起 → 改用对面平面开口并告警。

## 修复
1. `_shellFusePreheal`：紧缝合(5e-5)+heal 作为 fuse 优先备 base  
2. `_shellAdjacentBossRim`：TORUS + 近开口 Z 的短 CYLINDER 环（拒高孔壁，保 CX02）  
3. Ladder 1.55：seeds+boss-rim；trim 亦试 sew/preheal bases  
4. TORUS 开口时额外 Intersection/selfInter/tol + 更宽 thickness nudge  
5. HARD 合约 BX01 junction + cyl-top；BX02 spot-check；v1.28–v1.30 绿  
6. APP_VERSION 1.31

## 交付
- PR #62 · stamp `v1.31-20260918-174015` · nginx root 已核对  
- LIVE `APP_VERSION=1.31`（`index-Bl8B62qo-r2.js`）  
- 合约 21/21 PASS  

## 实体机器人重测（必须）
1. BX01 Fuse+R2+Shell t=2 开顶 — **无** soft 禁字  
2. BX02 Cut+顶孔缘 R1+Shell t=1.5 — 仍 CLEAN  
