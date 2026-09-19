# V163 FIX PLAN — Shell / bake toast Traditional Chinese (HK)

**Ship:** APP_VERSION **1.63** · Grok direct · gh PR · SSH deploy  
**Date:** 2026-09-19 (HKT)  
**Base:** LIVE v1.62 (stamp v1.62-20260919-120007) — SHEET/PLASTIC TC + BUG-BD-6101

## Choice
**Shell success/status toast phrases + component-boolean bake chip → Traditional Chinese (HK).**

Solid bot @v1.61 observed SC:
- chip: 「烘焙为零件实体」
- Shell success: 「已抽壳 壁厚 … (向内, 开 1 个所选面, 切线链开)」

## Root cause
- `shellSuccessStatus` (`src/ui/featureStatus.ts`) still emits Simplified glyphs (向内／开／个／所选／切线／抽壳).
- Bake chip label in `store.ts` + STATUS_PHRASES(_X) identity guards still SC「烘焙为零件实体」.
- EN `tStatus` short tokens (抽壳→shell, 所选→selected) were guarded by SC long identities; after TC builders we need matching TC identity guards.

## Fix
1. `featureStatus.ts` shellSuccessStatus → TC (已抽殼／向內／兩側／封閉實體／開 N 個所選面／切線鏈開)
2. `store.ts` bake chip + closely-related status strings referencing that chip / 圆角/抽壳 guidance
3. Viewport shell dialog `tStatus('向内'|'切线链'|…)` keys → TC (same fragments Solid QA hits)
4. `i18n.ts` STATUS_PHRASES_X: TC identity guards; retain legacy SC identities; STATUS_PHRASES EN map adds TC bake key
5. APP_VERSION **1.63** + contract `grok-qa-v1.63-shell-bake-traditional`
6. Update older contracts that pin exact SC shell/bake strings (v1.37/38/40/… pattern from v1.51)

## Do not
- Touch MESH toast/DnD SC pins (`插入STL网格` etc.)
- Regress DRAWING 工程圖／裝配工程圖, SKETCH 直線／完成草圖, illegal 「尺寸已拒絕」, ZH_GROUP/ZH_TAB, SELECT 選擇, SHEET/PLASTIC TC
- Mass-rewrite HelpPanel encyclopedias or every tip body
- CloudAgent / Cursor cloud — Grok direct only
