# V164 FIX PLAN — SOLID construct / body tools Traditional Chinese (HK)

**Ship:** APP_VERSION **1.64** · Grok direct · gh PR · SSH deploy  
**Date:** 2026-09-19 (HKT)  
**Base:** LIVE v1.63 (stamp v1.63-20260919-121108) — Shell/bake toast TC

## Choice
**SOLID construct + multi-body tool ribbon / timeline / dialog labels → Traditional Chinese (HK).**

Highest-value user-visible SC leftovers after ZH chrome (v1.61) + SHEET/PLASTIC/SELECT (v1.62) + Shell/bake (v1.63):

| id | SC (now) | TC (ship) | Surfaces |
|----|----------|-----------|----------|
| params | 参数 | **參數** | SOLID CONFIGURE + UTILITIES PARAMETERS |
| newbody | 新实体 | **新實體** | LAB CREATE + Viewport op buttons / selects |
| bodyboolean | 实体布尔 | **實體布爾** | LAB 直接编辑扩展 + Timeline + BrowserTree |
| offsetsolid | 整体偏移 | **整體偏移** | LAB + Timeline + BrowserTree |
| datumgeom | 构造几何 / 统一构造几何 | **構造幾何** / **統一構造幾何** | SOLID CONSTRUCT + LAB 构造扩展 + dialog title |

Also convert closely-coupled Viewport chrome: `⬡ 新实体` / `⬡新实体` / `新实体 / New Body` / dialog `title="构造几何"` / sketch-view toggle `构造几何`.

## Why not MESH export / gear / mechanism this round
- MESH export (`导出STL`…) is valuable but secondary to SOLID construct (every Solid workflow).
- Gear/mechanism lives under 🧪實驗室 — lower daily hit rate.
- Toast bodies that *mention* 「新实体／实体布尔」 mid-sentence stay SC this round (v1.38 pins identity guards; mass toast rewrite = do-not).

## Fix
1. `ribbon.ts` labels for the five ids (+ 统一构造几何)
2. `Timeline.tsx` / `BrowserTree.tsx` feature labels
3. `Viewport.tsx` dialog title + New Body op chrome
4. `i18n.ts` EN_LABEL + STATUS_PHRASES short keys for TC; retain legacy SC
5. `CommandPalette.tsx` keywords include TC (search still finds SC aliases)
6. APP_VERSION **1.64** + contract `grok-qa-v1.64-construct-body-traditional`
7. Update v1.27 contract that pins `⬡新实体` → accept TC `⬡新實體`

## Do not
- Touch MESH toast/DnD SC pins (`插入STL网格` etc.)
- Regress DRAWING 工程圖／裝配工程圖, SKETCH 直線／完成草圖, illegal 「尺寸已拒絕」, SELECT 選擇, SHEET/PLASTIC TC, Shell/bake TC (v1.63), ZH_GROUP/TAB
- Mass-rewrite HelpPanel / tip bodies / long status toasts that embed 实体 as noun
- Convert gear/mechanism / MESH export labels this PR (next candidates)
- CloudAgent — Grok direct only
