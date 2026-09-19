# V171 FIX PLAN — LAB FEA / slice / pyramid / delface labels → HK Traditional

**Ship:** APP_VERSION **1.71** · Grok direct · gh PR · SSH deploy  
**Date:** 2026-09-19 (HKT)  
**Base:** LIVE v1.70 (stamp v1.70-20260919-131624) — CREATE/MODIFY/PRINT + INSERT canvas/decal + Boolean 來源／工具體／網格布爾 + SW `webcad-v1.70`  
**Note:** Boolean leftovers already shipped in #146 — **do not redo**.

## Choice — Next SC ribbon slice (LAB)

| id | SC (before) | TC (ship) | Where |
|---|---|---|---|
| fea | 受力云图 | **受力雲圖** | LAB 仿真 |
| windtunnel | 风洞水洞 | **風洞水洞** | LAB 仿真 (same panel) |
| overhang | 悬垂分析 | **懸垂分析** | LAB 3D列印 (same as slice) |
| slicepreview | 切层预览 | **切層預覽** | LAB 3D列印 |
| pyramid | 棱锥 | **棱錐** | LAB 更多基元 |
| delface | 删面治愈 | **刪面治癒** | LAB 直接编辑扩展 |

Companions: SlicePanel head **切層預覽**; BrowserTree / Timeline / mark menu **刪面**; App ErrorBoundary name; i18n EN_LABEL TC keys (legacy SC retained). FD pyramid already **棱錐**.

Also: `public/sw.js` CACHE → **`webcad-v1.71`**. Relax v1.70 SW assert to `1.70+`.

## Do not
- Regress 插入STL网格, 導出STL／導出全部零件, 裝配工程圖, 尺寸已拒絕, 選擇, Shell/bake TC, Boolean help (來源／工具體／網格布爾), LAB gear TC, construct plane/axis/point, INSERT 畫布／貼花, ZH chrome
- Move LAB tools onto SOLID
- Mass-rewrite HelpPanel / tip novels / long FEA status toasts
- CloudAgent — Grok direct only
