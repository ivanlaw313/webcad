# V154 FIX PLAN — SURFACE ribbon Traditional Chinese

**Ship:** APP_VERSION **1.54** · Grok direct · gh PR · SSH deploy  
**Date:** 2026-09-19 (HKT)  
**Base:** LIVE v1.53 (PR #107) — ASSEMBLE TC shipped; Form / CREATE / illegal / MODIFY / Finish intact

## Scan (remaining UX debt)
| Item | Notes | Pick? |
|------|-------|------:|
| SURFACE CREATE/MODIFY ribbon mass SC（曲面放样／规则曲面／补面／缝合…） | Highest-visibility leftover tab after ASSEMBLE TC | **YES** |
| DRAWING `工程图` (MANAGE) | One-label leftover; defer to next pass | later |
| SKETCH leftover SC（直线／圆／镜像／阵列／选择…） | Large; risk touch `对称`→Symmetric | later |
| MESH toast / DnD SC（松开以导入网格／不支持的网格拖放） | Contracts v1.41–1.44 pin SC; **do not** | no |
| SOLID CREATE residual 旋转／扫掠／放样／阵列／镜像 | Adjacent; keep scope = SURFACE only | later |
| Form / MESH DnD / illegal / Finish / MODIFY / ASSEMBLE TC | PASS; do not touch | no |

## Choice
**SURFACE ribbon → Traditional Chinese (HK)** — continue BUG-BD-4801 orthography onto the SURFACE workspace next to CREATE/MODIFY/ASSEMBLE TC:
- 曲面放样 → **曲面放樣**, 规则曲面 → **規則曲面**
- 曲面扫掠 → **曲面掃掠**, 曲面旋转 → **曲面旋轉**
- 补面 Patch → **補面 Patch**, 桥接面 → **橋接面**, 边界补面 → **邊界補面**
- 加厚整张曲面 → **加厚整張曲面**, 翻转曲面 → **翻轉曲面**
- 旋转面 → **旋轉面**, 缝合 Stitch → **縫合 Stitch**, 取消缝合 → **取消縫合**
- 去裁/还原 → **去裁/還原**, 相交曲线 → **相交曲線**, 清相交曲线 → **清相交曲線**
- Form 圆柱 → **Form 圓柱**, Form 环面 → **Form 環面**
- 编辑曲面控制点 → **編輯曲面控制點**
- SURFACE-shared 旋转／扫掠／放样 → **旋轉／掃掠／放樣**; SELECT **選擇**

EN via `EN_LABEL` Traditional keys (keep legacy SC keys for store/toast/search until a dedicated pass).

## Fix
1. `src/ribbon.ts` SURFACE CREATE/MODIFY/SELECT labels (+ tip orthography for renamed tools).
2. `src/i18n.ts` `EN_LABEL` Traditional keys for those labels.
3. `CommandPalette.tsx` synonyms include TC (retain SC for search) if present.
4. Soft-update any grok-qa pin that hard-requires SC SURFACE labels (unlikely).
5. APP_VERSION **1.54** + contract `grok-qa-v1.54-surface-traditional`.
6. Do **not** regress FORM/CREATE/MODIFY/ASSEMBLE/illegal TC, MESH DnD, plane buttons, Finish soft-lock, sketch `对称`→Symmetric.

## Do not
- Convert MESH toast / DnD strings pinned by v1.41–1.44.
- Mass-convert SKETCH or SOLID CREATE residual SC in this pass.
- Touch `placeFormBoxOnOriginPlane` / `acceptMeshDropFile`.
- Clobber sketch constraint `'对称': 'Symmetric'`.
