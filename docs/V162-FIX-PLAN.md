# V162 FIX PLAN — SHEET/PLASTIC TC + BUG-BD-6101 select Traditional

**Ship:** APP_VERSION **1.62** · Grok direct · gh PR · SSH deploy  
**Date:** 2026-09-19 (HKT)  
**Base:** LIVE v1.61 (PR #125) — ZH_GROUP/ZH_TAB chrome TC

## Choice
1. **SHEET METAL + PLASTIC** workspace ribbon labels/tips → Traditional Chinese (HK)
2. **BUG-BD-6101** (BOT-D @v1.61 PARTIAL): remaining ribbon `label: '选择'` → **`選擇`** (+ tip) — folded into 1.62 because SHEET/PLASTIC was merged but **not yet live**

## Root cause
- Tabs already **鈑金**／**塑料** (v1.61) while SHEET/PLASTIC tool labels still SC.
- SOLID (default) / MESH / UTILITIES SELECT tools still used Simplified **选择** while group chrome + some workspaces showed **選擇**.

## Fix
1. SHEET/PLASTIC labels: 鈑金件／薄板/法蘭／導出展開DXF／加強筋／選擇 (+ tips)
2. Companion Timeline / BrowserTree / FD_TITLE + EN_LABEL TC keys
3. All remaining ribbon `id: 'select'` labels → **選擇** (SOLID ~L190, MESH ~L406, UTILITIES ~L468) + tip; sk_select tip sync
4. APP_VERSION **1.62** + contracts `grok-qa-v1.62-sheet-plastic-traditional` (+ BD-6101 assertions)
5. Do **not** touch MESH toast/DnD SC pins, DRAWING 裝配工程圖, SKETCH labels, illegal, mass tip-body rewrite

## Do not
- Convert MESH insert STL SC pins (`插入STL网格`).
- Mass-rewrite loft/web/canvas tip verbs that mention 选择.
- Regress DRAWING／SKETCH／illegal／ZH chrome／裝配工程圖.
