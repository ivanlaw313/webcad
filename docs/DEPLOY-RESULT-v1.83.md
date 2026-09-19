# DEPLOY-RESULT v1.83

**Date:** 2026-09-19 15:49 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/176 (MERGED `8c06957`) → `feat/native-car-stage1-20260906`  
**Commit:** `f789f08` fix(qa): v1.83 Ribbon cmd.* four-locale + BD-8201/8202  
**Site:** https://cad.neuralworkshk.com/

## Choice
Main line: Ribbon button names via **`cmd.*`** four-locale catalog (was hardcoded TC) so EN/JA switch in one shot. Also close BOT-D @1.82 **BD-8201** (型材 L角鐵／U槽鋼) + **BD-8202** (exact 放開滑鼠). SW/APP → **1.83**. Do not re-ship 1.82.

## Keys migrated
| Prefix | Count |
|--------|------:|
| Catalog keys / locale | **1293** (was 982 in v1.82) |
| `cmd.<toolId>` (+ variants) | **~310** (new ribbon captions) |
| `tip.releaseMouse` | **1** (new) |
| `tip.*` / `mm.*` / `sample.*` / `ui.disabled.*` / `profile.name.*` | retained |

## Fixes
| Item | Detail |
|------|--------|
| Ribbon captions | `resolveRibbonCmd` / `ribbonCmdLabel` → `cmd.<id>` (fallback LABEL_TO_KEY / tool.*) |
| BD-8202 | meshDrop + `ui.disabled.skDrag` + `tip.releaseMouse` contain exact **放開滑鼠** |
| BD-8201 | Viewport profile options → `profileSectionName` → **L角鐵／U槽鋼／T型材**; EN/JA separate |
| Variant labels | 孔／矩形陣列／加厚／按拉／… → LABEL_TO_KEY → cmd.* |
| Residual SC | ribbon tip 辐條→輻條; CSketch select/mirror/array button TC |
| Pins | BD-7301/8001 closed retained · Browser/File · JA 寸法/円錐 · HelpPanel · CommandPalette |

## How to verify
1. Hard-refresh → badge **1.83**; DevTools SW = `webcad-v1.83`
2. 繁體 → 型材 dropdown **L角鐵／U槽鋼** (not 角铁/槽钢); mesh drop shows **放開滑鼠**…
3. EN → ribbon Create Sketch / Extrude / Fillet (not 建立草圖/拉伸/圓角)
4. 日本語 → スケッチ作成 / 押し出し / フィレット / 円錐 (no EN shred on high-vis)

## Build / release
| Item | Value |
|------|--------|
| Merge SHA | `8c06957` |
| Feature SHA | `f789f08` |
| Release dir | `/var/www/webcad-releases/v1.83-20260919-154757` |
| Entry | `index-Ce3K2j1p-r2.js` |
| MD5 | `b37b9d950409c20975f15b49fb4d5d92` |
| Previous | `/var/www/webcad-releases/v1.82-20260919-153528` |
| Live SW | `webcad-v1.83` |

## Contract
`tests/grok-qa-v1.83-ribbon-cmd-i18n.test.mjs` — **10/10** pass  
`tests/grok-qa-v1.82-i18n-leftovers.test.mjs` — **7/8** (only APP_VERSION pin fails as expected)  
`tsc -b` EXIT 0 · `vite build` OK

## Gaps (honest — next round)
- Dialog field microcopy still often `tStatus(SC source)` (宽/高 OK; many 截面 titles still mixed)
- ParamsPanel / CSketch titles still heavily SC
- Start-canvas 「开始建模」 splash still SC
- Proper message-catalog architecture still the long-term fix
