# V153 FIX PLAN — ASSEMBLE ribbon Traditional Chinese

**Ship:** APP_VERSION **1.53** · Grok direct · gh PR · SSH deploy  
**Date:** 2026-09-19 (HKT)  
**Base:** LIVE v1.52 (PR #105) — SOLID MODIFY TC shipped; Form / CREATE / illegal / Finish intact

## Scan (remaining UX debt)
| Item | Notes | Pick? |
|------|-------|------:|
| SOLID ASSEMBLE ribbon mass SC（新建组件／关节／组件布尔…） | Highest-visibility leftover after CREATE/MODIFY TC | **YES** |
| BrowserTree ASSEMBLE chrome（組件布爾／剛性組／關節原點） | Must match ribbon after TC | with fix |
| MESH MODIFY + LAB + CREATE jointorigin shared labels | Same glyphs / sibling tabs | with fix |
| Store joint default names / status toast SC | Many grok-qa contracts pin SC; defer | later |
| INSERT mesh labels（插入STL网格） | Adjacent strip; optional with ASSEMBLE pass | light |
| Form / MESH DnD / illegal / Finish / MODIFY TC | PASS; do not touch | no |

## Choice
**ASSEMBLE ribbon → Traditional Chinese (HK)** — continue BUG-BD-4801 orthography onto the assembly strip next to CREATE/MODIFY TC:
- 新建组件 → **新建組件**, 组件布尔 → **組件布爾**
- 关节 → **關節**, 按现状关节 → **按現狀關節**, 关节原点 → **關節原點**
- 刚性组 → **剛性組**, 运动连接 → **運動連接**
- 启用接触集 → **啟用接觸集**, 新建接触集 → **新建接觸集**
- 运动研究 → **運動研究**, 驱动关节 → **驅動關節**

EN via `EN_LABEL` Traditional keys (keep legacy SC keys for store/toast/search until a dedicated pass).

## Fix
1. `src/ribbon.ts` SOLID ASSEMBLE labels + tip orthography; CREATE `jointorigin`; MESH MODIFY/LAB `compboolean` shared labels.
2. `src/i18n.ts` `EN_LABEL` Traditional keys for those labels.
3. `BrowserTree.tsx` ASSEMBLE chrome (組件布爾／剛性組／按現狀關節／關節原點 sections).
4. `CommandPalette.tsx` synonyms include TC (retain SC for search).
5. Soft-update `grok-qa-v1.26` label pin to accept TC.
6. APP_VERSION **1.53** + contract `grok-qa-v1.53-assemble-traditional`.
7. Do **not** regress FORM/CREATE/MODIFY/illegal TC, MESH DnD, plane buttons, Finish soft-lock, sketch `对称`→Symmetric.

## Do not
- Mass-convert store status/toast / default joint names that pin SC in older contracts.
- Touch `placeFormBoxOnOriginPlane` / `acceptMeshDropFile`.
- Clobber sketch constraint `'对称': 'Symmetric'`.
