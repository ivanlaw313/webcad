# V155 FIX PLAN — INSPECT / ANALYZE ribbon Traditional Chinese

**Ship:** APP_VERSION **1.55** · Grok direct · gh PR · SSH deploy  
**Date:** 2026-09-19 (HKT)  
**Base:** LIVE v1.54 (PR #109) — SURFACE TC shipped; Form / CREATE / illegal / MODIFY / ASSEMBLE / Finish intact

## Scan (remaining UX debt)
| Item | Notes | Pick? |
|------|-------|------:|
| INSPECT ribbon mass SC（测量／干涉检查／斑马纹／质心／物理属性…） | SOLID INSPECT still SC while FORM INSPECT already **測量** — visible inconsistency | **YES** |
| UTILITIES「检查扩展」ANALYZE SC（两点距离／面积／完整物理属性…） | Same inspect family; include in this pass | **YES** |
| DRAWING `工程图` (MANAGE) | One-label leftover; defer | later |
| SKETCH leftover SC（直线／圆／镜像／阵列／选择…） | Large; risk touch `对称`→Symmetric | later |
| SOLID CREATE residual 旋转／扫掠／放样／阵列／镜像 | Adjacent; keep scope = INSPECT | later |
| MESH toast / DnD SC | Contracts v1.41–1.44 pin SC; **do not** | no |
| Form / SURFACE / CREATE / MODIFY / ASSEMBLE / illegal TC | PASS; do not touch | no |

## Choice
**INSPECT + ANALYZE（检查扩展）ribbon → Traditional Chinese (HK)** — continue BUG-BD-4801 orthography onto the shared SOLID INSPECT group (also referenced by SURFACE/MESH/… via `g('INSPECT')`) and UTILITIES analyze extensions:
- 测量 → **測量**, 干涉检查 → **干涉檢查**
- 斑马纹分析 → **斑馬紋分析**, 曲率图分析 → **曲率圖分析**
- 可达性分析 → **可達性分析**, 最小半径分析 → **最小半徑分析**
- 质心 → **質心**, 物理属性 → **物理屬性**
- 显示网格面组 → **顯示網格面組**
- 检查扩展 → **檢查擴展**; 两点距离 → **兩點距離**; 边长／孔径 → **邊長／孔徑**; 面积 → **面積**; 面夹角 → **面夾角**; 完整物理属性 → **完整物理屬性**
- ZH_GROUP `INSPECT: 检查` → **檢查**

EN via `EN_LABEL` Traditional keys (keep legacy SC keys for store/toast/tStatus/search until a dedicated pass).

## Fix
1. `src/ribbon.ts` SOLID INSPECT labels + UTILITIES「检查扩展」name/labels (+ light tip orthography).
2. `src/i18n.ts` `EN_LABEL` Traditional keys + `ZH_GROUP.INSPECT`.
3. `CommandPalette.tsx` synonyms include TC (retain SC for search).
4. Viewport quick/context **测量** display → **測量** (visible; command id unchanged).
5. APP_VERSION **1.55** + contract `grok-qa-v1.55-inspect-traditional`.
6. Do **not** regress FORM/CREATE/MODIFY/ASSEMBLE/SURFACE/illegal TC, MESH DnD, plane buttons, Finish soft-lock, sketch `对称`→Symmetric.

## Do not
- Convert MESH toast / DnD strings pinned by v1.41–1.44.
- Mass-convert SKETCH, DRAWING, or SOLID CREATE residual SC in this pass.
- Rewrite store/tStatus toast strings that still use SC keys.
- Touch `placeFormBoxOnOriginPlane` / `acceptMeshDropFile`.
- Clobber sketch constraint `'对称': 'Symmetric'`.
