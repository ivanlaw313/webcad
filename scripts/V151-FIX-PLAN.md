# V151 FIX PLAN — Illegal UX reject Traditional Chinese

**Ship:** APP_VERSION **1.51** · Grok direct · gh PR · SSH deploy  
**Date:** 2026-09-19 (HKT)  
**Base:** LIVE v1.50 (PR #101) — SOLID/MESH CREATE TC shipped; Form plane / MESH DnD / Finish intact

## Scan (remaining UX debt)
| Item | Notes | Pick? |
|------|-------|------:|
| Illegal UX marker still SC「尺寸已拒绝」 | Central `ILLEGAL_REJECT_MARKER`; user-visible alerts / status | **YES** |
| Detail strings 必须／大于／孔径／草图 SC | Same reject path (thickness / length / hole / dim) | with fix |
| MODIFY/ASSEMBLE ribbon mass SC | Large blast; defer dedicated pass | later |
| SHEET/PLASTIC leftover tips | Non-alert; lower visibility | later |
| MESH drop toasts 网格／视口 | Contracts pin SC; defer | later |
| Form plane / MESH DnD / Finish | PASS; do not touch | no |

## Choice
**Illegal-input reject UX → Traditional Chinese (HK)** — convert unified marker and shared details:
- 尺寸已拒绝 → **尺寸已拒絕**
- 壁厚必须大于 0 → **壁厚必須大於 0**
- 尺寸必须大于 0… → **尺寸必須大於 0…**
- 孔径Ø必须大于 0 → **孔徑Ø必須大於 0**
- Related sketch/param/formula/diameter reject details on the same path

## Fix
1. `src/ui/illegalInput.ts` — marker + `ILLEGAL_*_DETAIL` + empty-detail fallback.
2. Hard-coded reject strings in `store.ts` / `Viewport.tsx` / `SketchLayer` details / `dimensionEditInput.ts`.
3. Update grok-qa contracts that pin SC marker (v1.14–v1.20 family).
4. APP_VERSION **1.51** + contract `grok-qa-v1.51-illegal-reject-traditional`.
5. Do **not** regress FORM TC, SOLID CREATE TC, MESH DnD, plane buttons, Finish soft-lock, sketch `对称`→Symmetric.

## Do not
- Mass-convert MODIFY/ASSEMBLE ribbons or unrelated hole-dialog summaries.
- Touch `placeFormBoxOnOriginPlane` / `acceptMeshDropFile`.
- Clobber sketch constraint `'对称': 'Symmetric'`.
