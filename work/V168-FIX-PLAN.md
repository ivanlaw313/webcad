# V168 FIX PLAN — Construct residual + primitive/import/view labels → HK Traditional

**Ship:** APP_VERSION **1.68** · Grok direct · gh PR · SSH deploy  
**Date:** 2026-09-19 (HKT)  
**Base:** LIVE v1.67 (stamp v1.67-20260919-124925) — Boolean help TC + SW CACHE `webcad-v1.67`

## Choice — Checkpoint SC leftovers (ribbon / dialog / tree chrome)

Highest-value user-visible SC after Boolean help (v1.67). Prefer **labels** (not Help encyclopedias / tip novels).

| id / surface | SC (now) | TC (ship) | Where |
|---|---|---|---|
| thread | 螺纹杆 | **螺紋桿** | SOLID CREATE + Timeline + BrowserTree + FD_TITLE |
| ucs | 用户坐标系 | **用戶坐標系** | SOLID CONSTRUCT |
| axiscyl | 圆柱／圆锥／环面轴 | **圓柱／圓錐／環面軸** | SOLID CONSTRUCT (pairs with 圓錐) |
| pointvertex | 顶点构造点 | **頂點構造點** | SOLID CONSTRUCT |
| importdxf | 导入DXF | **導入DXF** | INSERT |
| importsvg | 导入SVG | **導入SVG** | INSERT (paired) |
| cone | 圆锥 | **圓錐** | LAB 更多基元 + FD_TITLE `圆锥/圆台` → **圓錐/圓台** |
| explodeview | 爆炸视图 | **爆炸視圖** | LAB 装配辅助 + Viewport explode dlg title |
| scaleasm | 整体缩放 | **整體縮放** | LAB 装配辅助 |
| LAB panel | 3D打印 | **3D列印** | stays under 🧪實驗室 |

Also: `public/sw.js` CACHE → **`webcad-v1.68`** (must bump every release).

## Why this slice
- Matches checkpoint notes exactly; all still SC in `ribbon.ts`.
- User-visible every Construct / Create / Insert / Lab visit.
- Does **not** move LAB tools onto SOLID; panel rename only inside 實驗室.

## Fix
1. `ribbon.ts` labels (+ LAB panel name `3D列印`)
2. `Timeline.tsx` / `BrowserTree.tsx` thread label
3. `Viewport.tsx` FD_TITLE cone/thread + explode dialog title
4. `i18n.ts` EN_LABEL TC keys (retain SC) + STATUS_PHRASES_X identity for dialog chrome
5. `CommandPalette.tsx` keywords include TC aliases
6. `public/sw.js` CACHE=`webcad-v1.68` + RELEASE comment bump
7. APP_VERSION **1.68** + contract `grok-qa-v1.68-construct-import-view-traditional`

## Do not
- Regress 插入STL网格, 導出STL／導出全部零件, 裝配工程圖, 尺寸已拒絕, 選擇, Shell/bake TC, Boolean help TC (v1.67), LAB gear TC, ZH chrome, construct body TC (v1.64)
- Move LAB tools onto SOLID
- Mass-rewrite HelpPanel / tip novels / long status toasts
- Convert remaining construct plane/axis/point SC tips or full plane label set this PR (next candidate)
- CloudAgent — Grok direct only
