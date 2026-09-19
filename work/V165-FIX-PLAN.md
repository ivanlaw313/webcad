# V165 FIX PLAN — MESH / UTILITIES export labels Traditional Chinese (HK)

**Ship:** APP_VERSION **1.65** · Grok direct · gh PR · SSH deploy  
**Date:** 2026-09-19 (HKT)  
**Base:** LIVE v1.64 (stamp v1.64-20260919-121954) — SOLID construct/body TC

## Choice
**MESH EXPORT + UTILITIES MAKE ribbon labels + File menu Export items → Traditional Chinese (HK).**

Highest-value leftover after v1.64: SHEET EXPORT already uses **導出STL／導出STEP**, and ZH_GROUP already maps EXPORT→**導出**, but MESH tab EXPORT and UTILITIES MAKE still show Simplified **导出***; File ▾ Export items likewise.

| id / surface | SC (now) | TC (ship) |
|--------------|----------|-----------|
| exportstl (MESH/UTILITIES) | 导出STL | **導出STL** |
| exportstep (UTILITIES) | 导出STEP | **導出STEP** |
| exportglb | 导出glTF(/GLB) | **導出glTF(/GLB)** |
| exportobj / export3mf | 导出OBJ / 导出3MF | **導出OBJ / 導出3MF** |
| exportasm* | 导出装配* | **導出裝配*** |
| File ▾ Export * | 导出 STL / 导出装配 STL… | **導出 STL / 導出裝配 STL…** |
| File ▾ Export View PNG | 导出视图 PNG | **導出視圖 PNG** |

## Why not gear/mechanism this round
- Gear/mechanism (齒輪／齒條／四連桿…) lives under 🧪實驗室 — lower daily hit rate than MESH print export.
- MESH export is the orthography inconsistency users hit every print path (ribbon + File menu).

## Fix
1. `ribbon.ts` MESH EXPORT + UTILITIES MAKE labels → TC (retain SHEET 導出* as-is)
2. `Ribbon.tsx` File menu Export row labels → TC
3. `i18n.ts` EN_LABEL TC keys for new 導出*／導出裝配*; retain legacy SC
4. `CommandPalette.tsx` keywords include 導出／裝配 aliases
5. e2e playwright regex accept 導出 STL / 導出 OBJ
6. APP_VERSION **1.65** + contract `grok-qa-v1.65-mesh-export-traditional`

## Do not
- Touch MESH toast/DnD SC pins (`插入STL网格` etc.)
- Regress DRAWING 工程圖／裝配工程圖, SKETCH 直線／完成草圖, illegal 「尺寸已拒絕」, SELECT 選擇, SHEET/PLASTIC TC, Shell/bake TC, ZH chrome, v1.64 construct labels
- Mass-rewrite store toast bodies / HelpPanel / long tip encyclopedias that embed 「导出」 mid-sentence
- Convert gear/mechanism labels this PR (next candidate)
- CloudAgent — Grok direct only
