# V162 FIX PLAN — SHEET METAL / PLASTIC ribbon Traditional Chinese

**Ship:** APP_VERSION **1.62** · Grok direct · gh PR · SSH deploy  
**Date:** 2026-09-19 (HKT)  
**Base:** LIVE v1.61 (PR #125) — ZH_GROUP/ZH_TAB chrome TC

## Choice
**SHEET METAL + PLASTIC workspace ribbon labels (+ panel tips) → Traditional Chinese (HK)** — next high-value leftover after tab chrome TC:
- SHEET: 钣金件→**鈑金件**, 薄板/法兰→**薄板/法蘭**, 导出展开DXF→**導出展開DXF**, 选择→**選擇** (+ tip)
- PLASTIC: 加强筋→**加強筋**, 选择→**選擇** (+ tip)
- Companion: Timeline / BrowserTree / FD_TITLE `钣金件`／`加强筋` → TC
- EN_LABEL: add TC keys; keep legacy SC keys for EN fallback

## Root cause
Workspace tabs already show **鈑金**／**塑料** (v1.61), but SHEET/PLASTIC ribbon tool labels still used Simplified glyphs — visible mismatch when switching those workspaces.

## Fix
1. `src/ribbon.ts` SHEET + PLASTIC panel labels/tips; SOLID CREATE `加强筋` label (shared tool).
2. Timeline / BrowserTree / Viewport FD_TITLE companion labels.
3. `src/i18n.ts` EN_LABEL TC keys.
4. APP_VERSION **1.62** + contract `grok-qa-v1.62-sheet-plastic-traditional`.
5. Do **not** touch MESH toast/DnD SC pins, DRAWING 裝配工程圖, SKETCH, illegal, ZH_GROUP/ZH_TAB, mass tip-body rewrite outside SHEET/PLASTIC panels.

## Do not
- Convert MESH insert STL SC pins (`插入STL网格`).
- Mass-rewrite status phrases / dialog field dictionaries.
- Regress DRAWING 工程圖／裝配工程圖, SKETCH 直線／完成草圖, 翻轉曲面, 尺寸已拒絕, 旋轉／掃掠, ZH chrome.
