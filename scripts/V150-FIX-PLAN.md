# V150 FIX PLAN — SOLID/MESH CREATE Traditional Chinese

**Ship:** APP_VERSION **1.50** · Grok direct · gh PR · SSH deploy  
**Date:** 2026-09-19 (HKT)  
**Base:** LIVE v1.49 (PR #99) — FORM Traditional PASS (BUG-BD-4801 closed); BOT-D PASS

## Scan (remaining UX debt)
| Item | Notes | Pick? |
|------|-------|------:|
| SOLID CREATE 长方体／圆柱／创建草图 still SC | Same orthography debt as FORM; sits next to **建立造型** | **YES** |
| MESH CREATE 长方体／圆柱 still SC | Same glyphs on MESH tab | with fix |
| Feature dialog FD_TITLE box/cylinder/torus SC | Dialog chrome mismatches ribbon after TC | with fix |
| SOLID mass ribbon (圆角/抽壳/旋转…) | Large blast; defer dedicated i18n pass | later |
| MESH drop toasts 网格／视口 | Contracts pin SC; defer | later |
| ASSY / sketch constraints | No fresh FAIL | no |
| MESH DnD / Form plane / Finish | PASS; do not touch | no |

## Choice
**SOLID (+ MESH/SHEET/PLASTIC) CREATE Traditional Chinese** — continue BUG-BD-4801 orthography onto the main modeling ribbon:
- 创建草图 → **建立草圖** (matches 建立造型 wording)
- 长方体 → **長方體**, 圆柱 → **圓柱**, 圆环 → **圓環**
- FD_TITLE + viewport quick menu aligned

EN via existing `EN_LABEL` Traditional keys (`建立草圖`/`長方體`/`圓柱`/`圓環`).

## Fix
1. `ribbon.ts` CREATE labels (SOLID/MESH/SURFACE/SHEET/PLASTIC sketch·box·cylinder·torus).
2. `Viewport.tsx` FD_TITLE + context/quick menu + newSketch MM label.
3. Tips for those tools: leading SC → TC.
4. APP_VERSION **1.50** + contract `grok-qa-v1.50-solid-create-traditional`.
5. Do **not** regress FORM TC, MESH DnD, plane buttons, Finish soft-lock, sketch `对称`→Symmetric.

## Do not
- Mass-convert entire SOLID MODIFY/ASSY ribbons or MESH drop toast contracts.
- Clobber sketch constraint `'对称': 'Symmetric'`.
- Touch `placeFormBoxOnOriginPlane` / `acceptMeshDropFile`.
