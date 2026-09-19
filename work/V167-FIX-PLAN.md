# V167 FIX PLAN — Boolean help/status TC + SW cache bump

**Ship:** APP_VERSION **1.67** · Grok direct · gh PR · SSH deploy  
**Date:** 2026-09-19 (HKT)  
**Base:** LIVE v1.66 (stamp v1.66-20260919-123736) — LAB gear TC; Solid GATE FAIL = stale SW cache `webcad-v1`

## Choice A — Boolean help / dialog blurbs / short status tips → HK Traditional
Solid @1.65 noted Boolean **help/description** still SC: 外扩／留间隙／来源／网格／结果／时间轴／按钮 (+ closely related in same surfaces). Main toast already TC.

| surface | SC tokens | TC |
|---------|-----------|-----|
| featureStatus booleanSuccessStatus | 时间轴可改/可删, 实体布尔, 工具体, 泊车… | **時間軸可改/可刪**, **實體布爾**, **工具體**, **泊車**… |
| featureStatus newBodySuccessStatus | 实体布尔 / 泊车 | **實體布爾** / **泊車** |
| Viewport combine dlg help | 结果 / 工具体 / 泊车 / 没有… | **結果** / **工具體** / **泊車** / **沒有**… |
| Viewport 🧩布尔 title | 组件布尔 / 网格 / 留间隙 | **組件布爾** / **網格** / **留間隙** |
| Viewport ✎编辑 title (comp bool context) | 时间轴 / 来源 | **時間軸** / **來源** |
| store startComponentBoolean prompts | 外扩 / 组件布尔 | **外擴** / **組件布爾** |
| store toolNote | 外扩 / 留间隙 | **外擴** / **留間隙** |
| store mesh/asm status (hasSrc path) | 网格 / 时间轴 / 实体布尔 | **網格** / **時間軸** / **實體布爾** |
| i18n | TC keys + EN; legacy SC retained | |

## Choice B (fold) — SW cache name must change every release
`public/sw.js` `CACHE = 'webcad-v1'` never bumped → bots after hard refresh still served badge 1.65 from Cache Storage while nginx already had 1.66.

| change | detail |
|--------|--------|
| CACHE | `webcad-v1` → **`webcad-v1.67`** |
| comment | one-line: CACHE must change every release so activate deletes old caches |
| navigate | keep network-first (unchanged) |

## Fix
1. `src/ui/featureStatus.ts` boolean/newBody builders → TC
2. `src/components/Viewport.tsx` combine dlg + 🧩布尔/✎编辑 titles → TC
3. `src/store.ts` comp-bool prompts / toolNote / hasSrc mesh status → TC
4. `src/i18n.ts` EN + STATUS_PHRASES_X TC identity (retain SC)
5. `public/sw.js` CACHE=`webcad-v1.67` + release-bump comment
6. Update `tests/grok-qa-v1.38-solid-toast-zh.test.mjs` boolean asserts for TC builders
7. APP_VERSION **1.67** + contract `grok-qa-v1.67-boolean-help-traditional-sw-cache`
8. Do **not** touch 插入STL网格 / MESH DnD SC pins / Help encyclopedias / move LAB onto SOLID

## Do not
- Regress 插入STL网格, 導出STL／導出全部零件, 裝配工程圖, 尺寸已拒絕, 選擇, Shell/bake TC, construct TC, LAB gear TC, ZH chrome
- Move LAB tools onto SOLID
- Mass-rewrite HelpPanel / tip novels
- CloudAgent — Grok direct only
