# DEPLOY-RESULT v1.80

**Date:** 2026-09-19 15:16 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/169 (MERGED `1ec9e5d`) → `feat/native-car-stage1-20260906`  
**Site:** https://cad.neuralworkshk.com/

## Choice
Clear CommandPalette / SYN synonym-table i18n leftovers after v1.79 + locale-v179 FAIL (JA SketchToolPanel still showed EN `Dimension`). SW/APP → **1.80**.

## Keys migrated
| Prefix | Count |
|--------|------:|
| `alias.*` (was 10) | **109** |
| `cmd.act*` / `cmd.from*` / `cmd.template*` | **15** |
| `sk.dimension` | **1** |
| Catalog keys / locale | **838** (was 700+ in v1.79) |

## Fixes
| Item | Detail |
|------|--------|
| SYN → catalog | Hardcoded `SYN` table removed; search uses `alias.<id>` only (zh-HK/zh-CN/en/ja) |
| Palette extras | `act:save/open/undo/redo/fit/params/help` → `cmd.act*` + `cmd.from*`; rebuild on lang |
| JA Dimension shred | `sk.dimension` / `sk.toolTitle.dimension` = **寸法**; `tStatus('尺寸')` no longer → `Dimension` |
| Viewport | Dimension toolbar button uses `msg('sk.dimension')` |
| Pins | 插入STL网格 · 實驗室 · 尺寸已拒絕 · JA 円錐 · file.importStl/history · HelpPanel |

## How to verify
1. Hard-refresh → badge **1.80**; DevTools SW = `webcad-v1.80`
2. 日本語 → sketch → Dimension tool panel / toolbar = **寸法** (not `Dimension`)
3. 繁體 → `/` → extras **儲存專案** / **檔案**; aliases TC-primary
4. 日本語 → `/` → fillet tip/alias has フィレット; cone CREATE still **円錐**

## Build / release
| Item | Value |
|------|--------|
| Merge SHA | `1ec9e5dc08f83ce9ac2044a44c7e5f88c2d584eb` |
| Release dir | `/var/www/webcad-releases/v1.80-20260919-151524` |
| Entry | `index-pNC-SmHU-r2.js` |
| MD5 | `47f90effd4ccfbaf29b0c2ba09d7ea24` |
| Previous | `/var/www/webcad-releases/v1.79-20260919-150342` |
| Live SW | `webcad-v1.80` |

## Contract
`tests/grok-qa-v1.80-cmdpalette-syn-i18n.test.mjs` — **8/8** pass (`tsc -b` 0 err; build OK).

## Gaps (honest)
- MarkingMenu sketch labels still Chinese source (raw `it.label`; not `tStatus`)
- SAMPLE_LABELS template names still SC-primary in palette
- Gear/worm/profile CREATE toasts may still shred on JA
- BrowserTree microcopy tips beyond section labels may still mix SC
