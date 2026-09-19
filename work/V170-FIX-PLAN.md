# V170 FIX PLAN — CREATE / MODIFY / PRINT residual ribbon labels → HK Traditional

**Ship:** APP_VERSION **1.70** · Grok direct · gh PR · SSH deploy  
**Date:** 2026-09-19 (HKT)  
**Base:** LIVE v1.69 (stamp v1.69-20260919-130527) — construct plane/axis/point residual TC + SW `webcad-v1.69`  
**PR:** https://github.com/ivanlaw313/webcad/pull/145 MERGED

## Choice — Highest-value remaining SC ribbon labels

| id | SC (before) | TC (ship) | Where |
|---|---|---|---|
| facesketch | 面上草图 | **面上草圖** | CREATE |
| othread | 面加螺纹 | **面加螺紋** | CREATE |
| ithread | 内螺纹孔 | **內螺紋孔** | CREATE |
| moveface | 移动面 | **移動面** | MODIFY / LAB |
| filletall | 全棱圆角 | **全棱圓角** | MODIFY / LAB |
| cylpatch | 圆柱曲面贴花 | **圓柱曲面貼花** | MODIFY / LAB |
| splitsketch | 草图轮廓分割 | **草圖輪廓分割** | MODIFY / LAB |
| tube | 圆管 | **圓管** | LAB 更多基元 |
| rbox | 圆角盒 | **圓角盒** | LAB 更多基元 |
| dome | 圆顶 | **圓頂** | LAB 更多基元 |
| halfcyl | 半圆柱 | **半圓柱** | LAB 更多基元 |
| xray | 透视 | **透視** | LAB 装配辅助 |
| autoorient | 自动摆正 | **自動擺正** | LAB 3D列印 |
| wallcheck | 壁厚检查 | **壁厚檢查** | LAB 3D列印 |
| projsurf | 投影到圆柱面 | **投影到圓柱面** | LAB / SURFACE |

Companions: Timeline / BrowserTree 內螺紋孔／面外螺紋／移動面／曲面貼花; i18n EN_LABEL TC keys (legacy SC retained).

Also: `public/sw.js` CACHE → **`webcad-v1.70`**.

## Do not
- Regress 插入STL网格, 導出STL／導出全部零件, 裝配工程圖, 尺寸已拒絕, 選擇, Shell/bake TC, Boolean help TC, LAB gear TC, 構造擴展／螺紋桿／用戶坐標系／過三點平面／導入DXF／3D列印, ZH chrome
- Move LAB tools onto SOLID
- Mass-rewrite HelpPanel / tip novels
