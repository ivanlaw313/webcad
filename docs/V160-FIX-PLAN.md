# V160 FIX PLAN — 裝配工程圖 discoverable (BUG-BD-5601)

**Ship:** APP_VERSION **1.60** · Grok direct · gh PR · SSH deploy  
**Date:** 2026-09-19 (HKT)  
**Base:** LIVE v1.59 (PR #121) — SOLID CREATE residual TC shipped

## Root cause (BOT-D @ v1.58 PARTIAL)
「裝配工程圖」only appeared when:
1. File → **裝配工程圖 + BOM** (BOT-D icons-only; often skips File menu), or
2. Modal head when `drawingKind === 'assembly'` (needs visible components first).

DRAWING ribbon had only **工程圖** → part modal head **工程圖 — 三視圖 + 立體圖**. BOT-D never saw **裝配工程圖**, so BUG-BD-5601 stayed open.

## Choice
Prefer closing BUG-BD-5601 over ZH_GROUP chrome (defer ZH_GROUP → **v1.61**).

## Fix
1. `src/ribbon.ts` DRAWING panel: add `asmdrawing` label **裝配工程圖** (quick icon).
2. `src/store.ts` `runCommand` case `asmdrawing` → `generateAsmDrawing`; TC status toasts for assembly path.
3. `src/components/DrawingPanel.tsx`: kind tabs always show **工程圖** / **裝配工程圖** inside the modal.
4. File menu already TC **裝配工程圖 + BOM**; CommandPalette alias for `asmdrawing`.
5. APP_VERSION **1.60** + contract `grok-qa-v1.60-assembly-drawing-discoverable`.

## Do not
- Convert MESH toast / DnD SC pins (v1.41–1.44).
- Mass-convert ZH_GROUP CREATE/MODIFY/SELECT (→ v1.61).
- Regress part DRAWING modal TC / SKETCH / 翻轉曲面 / illegal / SOLID CREATE residual TC.
