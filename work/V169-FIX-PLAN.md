# V169 FIX PLAN — Construct plane/axis/point residual labels → HK Traditional

**Ship:** APP_VERSION **1.69** · Grok direct · gh PR · SSH deploy  
**Date:** 2026-09-19 (HKT)  
**Base:** LIVE v1.68 (stamp v1.68-20260919-125457) — construct residual + import/view TC + SW `webcad-v1.68`

## Choice — Highest-value remaining SC (ribbon / dialog / browser)

v1.68 explicitly deferred **remaining construct plane/axis/point SC**. Prefer **labels** (not tip novels / Help).

| id | SC (before) | TC (ship) | Where |
|---|---|---|---|
| planemid | 中间平面 | **中間平面** | SOLID CONSTRUCT |
| plane2edge | 过两边平面 | **過兩邊平面** | SOLID CONSTRUCT |
| plane3pt | 过三点平面 | **過三點平面** | SOLID CONSTRUCT |
| planepath | 沿路径平面 | **沿路徑平面** | SOLID CONSTRUCT |
| axisperpface | 垂直面轴 | **垂直面軸** | SOLID CONSTRUCT |
| axis2planes | 过两平面轴 | **過兩平面軸** | SOLID CONSTRUCT |
| axis2pt | 过两点轴 | **過兩點軸** | SOLID CONSTRUCT |
| axisedge | 沿边轴 | **沿邊軸** | SOLID CONSTRUCT |
| point2edges | 两边交点 | **兩邊交點** | SOLID CONSTRUCT |
| point3planes | 三平面交点 | **三平面交點** | SOLID CONSTRUCT |
| pointcenter | 圆／球／环面中心点 | **圓／球／環面中心點** | SOLID CONSTRUCT |
| pointedgeplane | 边与平面交点 | **邊與平面交點** | SOLID CONSTRUCT |
| pointpath | 沿路径点 | **沿路徑點** | SOLID CONSTRUCT |
| planeparpt | 过点平行面 | **過點平行面** | LAB 構造擴展 |
| caxis | 方向构造轴 | **方向構造軸** | LAB 構造擴展 |
| cpoint | 坐标构造点 | **坐標構造點** | LAB 構造擴展 |
| midcpoint | 两点中点 | **兩點中點** | LAB 構造擴展 |
| cptgrid | 构造点阵列 | **構造點陣列** | LAB 構造擴展 |
| panel | 构造扩展 | **構造擴展** | LAB (stays under 🧪實驗室) |
| FD / tree | 参考平面／构造点／构造轴／构造 | **參考平面／構造點／構造軸／構造** | Viewport + BrowserTree |
| datum dialog | 过点平行面／两边交点／… | **過點平行面／兩邊交點／…** | store DATUM_CMD_METHODS |

Also: `public/sw.js` CACHE → **`webcad-v1.69`**.

## Why this slice
- Direct next candidate named in V168 plan.
- Every Construct visit shows these labels; tree section + FD titles are always visible.
- Does **not** move LAB tools onto SOLID; 構造擴展 stays under 🧪實驗室.
- Does **not** touch protected 插入STL网格 pin.

## Fix
1. `src/ribbon.ts` construct + LAB 構造擴展 labels
2. `src/components/Viewport.tsx` FD_TITLE + dialog picker chrome (構造點／構造軸)
3. `src/components/BrowserTree.tsx` section + row labels
4. `src/store.ts` DATUM_CMD_METHODS dialog labels
5. `src/i18n.ts` EN_LABEL + STATUS_PHRASES_X TC keys (retain SC)
6. `public/sw.js` CACHE=`webcad-v1.69` + RELEASE comment bump
7. APP_VERSION **1.69** + contract `grok-qa-v1.69-construct-plane-axis-point-traditional`
8. Relax v1.68 SW CACHE assert to `1.68+`

## Do not
- Regress 插入STL网格, 導出STL／導出全部零件, 裝配工程圖, 尺寸已拒絕, 選擇, Shell/bake TC, Boolean help TC, LAB gear TC, v1.68 labels, ZH chrome, construct body TC
- Move LAB tools onto SOLID
- Mass-rewrite HelpPanel / tip novels / long status toasts
- Convert INSERT canvas/decal or LAB primitives this PR (next candidates)
- CloudAgent — Grok direct only
