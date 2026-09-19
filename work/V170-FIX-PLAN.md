# V170 FIX PLAN — INSERT canvas/decal + Boolean help leftovers → HK Traditional

**Ship:** APP_VERSION **1.70** · Grok direct · gh PR · SSH deploy  
**Date:** 2026-09-19 (HKT)  
**Note:** Parallel PR #145 already landed CREATE/MODIFY/PRINT residual TC under same 1.70 (undeployed). This PR folds INSERT + Solid@1.68 Boolean must-fixes into that unreleased 1.70 before deploy.

## A. INSERT (labels)
| id | SC → TC |
|---|---|
| insertcomponent | 插入组件 → **插入組件** |
| insertfastener | 插入紧固件 → **插入緊固件** (+ FastenerDialog) |
| insert3mf / insertobj | 插入*网格 → **插入*網格** |
| insertcanvas / insertdecal | 画布／贴花 → **畫布／貼花** (+ 🏷貼花) |
| insertmesh | **KEEP** 插入STL网格 |

## B. Boolean must-fixes (Solid @1.68)
| leftover | TC |
|---|---|
| 来源「…」 | **來源「…」** |
| 工具 Body／来源 Body | **工具體／來源體** |
| 組件布爾＝網格結果 | **組件布爾＝網格布爾** |

SW CACHE **webcad-v1.70**. LAB stays under 實驗室.
