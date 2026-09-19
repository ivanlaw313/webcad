# V149 FIX PLAN — BUG-BD-4801 Form ribbon Traditional Chinese

**Ship:** APP_VERSION **1.49** · Grok direct · gh PR · SSH deploy  
**Date:** 2026-09-19 (HKT)  
**Base:** LIVE v1.48 (PR #97) — FORM Simplified labels PASS functionally; orthography FAIL

## Bug
BOT-D @ v1.48: Ribbon FORM labels are Simplified「长方体／圆柱／管道」but HK/TW product expects Traditional「長方體／圓柱／管道」. Functional path PASS; locale orthography only. Evidence: `/workspace/webcad-qa-botd/out/v1.48-sample/SUMMARY.md`.

## Before → After (user-visible)
| Surface | Before (v1.48 SC) | After (v1.49 TC / HK) |
|---------|-------------------|------------------------|
| SOLID entry | 创建造型 | **建立造型** |
| FORM Box / Cylinder / Pipe | 长方体 / 圆柱 / 管道 | **長方體 / 圓柱 / 管道** |
| FORM Quadball / Edit / Subdiv | 四边形球体 / 编辑造型 / 细分 | **四邊形球體 / 編輯造型 / 細分** |
| FORM Symmetry tool / group | 造型对称 / 对称 | **造型對稱 / 對稱** |
| Finish Form pin/panel | 完成造型 | 完成造型 *(same glyphs)* |
| Create Form dialog dims | 路径点 / 直径 / 面数 / 轮廓 | **路徑點 / 直徑 / 面數 / 輪廓** |

Wording pick: **建立造型** (not 創建造型) — matches existing HK Traditional UI (PhysicsLab / JointOrigin / SketchToolPanel「建立…」).

## Fix
1. `FORM_PANELS` + SOLID `createform` → Traditional source labels; EN via `tLabel` / `EN_LABEL` Traditional keys.
2. Form dialog + Edit titles (v1.47 leftovers) → Traditional where Simplified orthography differed.
3. ZH_GROUP `SYMMETRY: '對稱'`; do **not** clobber sketch constraint `'对称': 'Symmetric'`.
4. APP_VERSION **1.49** + contract `grok-qa-v1.49-form-traditional-chinese`.
5. Do **not** regress MESH DnD, Form plane buttons, Finish soft-lock, Pipe path control.

## Do not
- Mass-convert entire SOLID ribbon (Box「长方体」etc. outside FORM stay as pre-existing SC until a dedicated i18n pass).
- Touch MESH drag / `placeFormBoxOnOriginPlane` / plane `data-testid`s.
- Map FORM Symmetry onto bare `对称` (keep `造型對稱`).
