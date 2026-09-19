# V170 FIX PLAN — INSERT canvas/decal + Boolean help leftovers → HK Traditional

**Ship:** APP_VERSION **1.70** · Grok direct · gh PR · SSH deploy  
**Date:** 2026-09-19 (HKT)  
**Base:** LIVE v1.69 (stamp v1.69-20260919-130527)

## Choice — INSERT residual (named next) + Solid@1.68 Boolean must-fixes

### A. INSERT ribbon / dialog / toolbar (labels)
| id / surface | SC (before) | TC (ship) | Where |
|---|---|---|---|
| insertcomponent | 插入组件 | **插入組件** | SOLID INSERT |
| insertfastener | 插入紧固件 | **插入緊固件** | SOLID INSERT + FastenerDialog |
| insert3mf | 插入3MF网格 | **插入3MF網格** | SOLID INSERT + MESH |
| insertobj | 插入OBJ网格 | **插入OBJ網格** | SOLID INSERT + MESH |
| insertcanvas | 画布 | **畫布** | SOLID INSERT |
| insertdecal | 贴花 | **貼花** | SOLID INSERT + Viewport 🏷 |
| insertmesh | 插入STL网格 | **KEEP** (pin) | SOLID INSERT + MESH |
| cylpatch / tree | 圆柱曲面贴花／曲面贴花 | **圓柱曲面貼花／曲面貼花** | LAB + BrowserTree + Timeline + FD |

Also folded LAB CREATE/MODIFY/基元 residual labels already in-tree (面上草圖／圓管／圓頂／半圓柱…), stay under 🧪實驗室.

### B. Boolean help leftovers (Solid @1.68 must-fix)
| string | SC leftover | TC (ship) |
|---|---|---|
| CompBool pick panel | 来源「…」 | **來源「…」** |
| componentBoolean prompts/status | 工具 Body／来源 Body | **工具體／來源體** |
| bake guidance toast | 組件布爾＝**網格結果** | 組件布爾＝**網格布爾** |

Also: `public/sw.js` CACHE → **`webcad-v1.70`**.

## Do not
- Regress 插入STL网格, 導出*, 裝配工程圖, 尺寸已拒絕, 選擇, Shell/bake, Boolean help core, LAB gear, construct plane/axis/point, v1.68, ZH
- Move LAB tools onto SOLID
- Mass-rewrite HelpPanel / tip novels
- CloudAgent — Grok direct only
