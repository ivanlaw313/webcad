# WebCAD v1.27 最終彙總（2026-09-14）

## 本版目標
修復 LIVE v1.26 經典 BX02 **实体布尔切除** 重建失败。

## Root cause
独立「新实体」后活动体=第二体、泊车=第一体；切除=活动−泊车。圆柱被盒子完全包含时结果零体积 → applyFeatures 整树回退 toast。

## Fix
- `_healSolid` 双方操作数 + `_cutRobust` + 空结果时自动对调工具−目标
- 长方体/圆柱对话框露出 ⬡新实体

## 部署
- PR #57 · stamp `20260914-104525` · nginx root 已核對
- LIVE `APP_VERSION=1.27`

## 建議 solid bot
重測 BX02：切除 + Fillet R1 + Shell t=1.5（shell 揀面仍可能有殘債）
