# DEPLOY-RESULT v1.79

**Date:** 2026-09-19 15:06 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/167 (MERGED `4d99c02`) → `feat/native-car-stage1-20260906`  
**Site:** https://cad.neuralworkshk.com/

## Choice
Continue clearing four-locale i18n leftovers after v1.78 + locale-v178 FAIL list + JA CREATE cone gap. SW/APP → **1.79**.

## Fixes
| Item | Detail |
|------|--------|
| BOT-D Browser TC | 浏览器/组件/实体/特征 → **瀏覽器／組件／實體／特徵**; tree **文件設定／原點／命名視圖** via `tree.*` catalog |
| File | **新建檔案** (`file.new`); confirm catalog; **匯入 STL…／版本歷史…** retained PASS |
| SketchToolPanel | `sk.toolTitle.*` catalog; **Dimension／doneSketch** no EN shred (`tStatus` guards + `ui.finishSketch`) |
| CREATE cone JA | SOLID CREATE adds **圓錐** after torus → JA **円錐** (`tool.cone`) |
| Prim toasts | wedge/dome/halfcyl/pie/prism/tube/rtube/coil → `status.*` helpers (no `Done:` shred) |
| High-traffic ternaries | SketchLayer / Ribbon expand / Viewport opHelp → catalog |

## Pins retained
插入STL网格 · 實驗室 · 尺寸已拒絕 · 日本語 · JA `tool.*` · HelpPanel · box/sphere/cone/torus JP toasts · file.importStl/history TC

## How to verify
1. Hard-refresh → badge **1.79**; DevTools SW = `webcad-v1.79`
2. 繁體 → Browser **瀏覽器** / **組件** / **實體** / **特徵** / **文件設定** / **原點**
3. 繁體 → File **新建檔案** / **匯入 STL…** / **版本歷史…**
4. 日本語 → CREATE → **円錐** (with 球／トーラス)
5. 日本語 → CREATE wedge/tube/coil → toast without English `Done:`

## Build / release
| Item | Value |
|------|--------|
| Merge SHA | `4d99c025b3f788ebbf7d2d1b2739a21689630341` |
| Release dir | `/var/www/webcad-releases/v1.79-20260919-150342` |
| Entry | `index-BEcdZNcN-r2.js` |
| MD5 | `8caafed224bbe5cba8b46bfe64ca101c` |
| Previous | `/var/www/webcad-releases/v1.78-20260919-144302` |
| Live SW | `webcad-v1.79` |

## Contract
`tests/grok-qa-v1.79-i18n-leftovers.test.mjs` — 8/8 pass (`tsc -b` 0 err; build OK).

## Gaps (honest)
- BrowserTree microcopy beyond section labels still has mixed SC in some tips
- SYN synonym table / CommandPalette extras still multilingual hardcoded
- Gear/worm/profile CREATE toasts may still shred on JA
