# DEPLOY-RESULT v1.81

**Date:** 2026-09-19 15:27 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/171 (MERGED `b10fb2f`) → `feat/native-car-stage1-20260906`  
**Site:** https://cad.neuralworkshk.com/

## Choice
Continue clearing four-locale i18n leftovers after v1.80 + **BD-8001** (繁體 UI still showed SC 主视图/松开/单击). SW/APP → **1.81**.

## Keys migrated
| Prefix | Count |
|--------|------:|
| `sample.*` | **34** |
| `tip.*` (was 10) | **30** |
| `mm.*` | **22** |
| `alias.*` (was 109) | **117** |
| BD-8001 / status.gear|worm|profile | **+** |
| Catalog keys / locale | **936** (was 838 in v1.80) |

## Fixes
| Item | Detail |
|------|--------|
| MarkingMenu | Renders `tLabel(it.label)`; `mm.unavailable` |
| Viewport MM / empty | SC→TC + `mm.*` catalog (寸法 (D), 主視圖 views, 放開 drop, …) |
| SAMPLE_LABELS | Palette/Ribbon use `sample.<kind>` (4 locales) |
| Ribbon tips | `tip.<id>` catalog (+20 common tools); Home uses `cmd.actFit` |
| Gear/worm/profile | CREATE toasts via `featureStatus` catalog (no JA shred) |
| **BD-8001** | 主視圖 / 放開 / 單擊 — meshDrop, Home tip, Ribbon, store status; zh-CN keeps SC |
| Pins | Browser/File TC · JA 寸法/円錐 · HelpPanel · aliases · **BD-7301** 匯入/歷史 |

## How to verify
1. Hard-refresh → badge **1.81**; DevTools SW = `webcad-v1.81`
2. 繁體 → Home tip **主視圖** (not 主视图); drag mesh overlay **放開以匯入網格**
3. 日本語 → MarkingMenu / templates use JA; CREATE gear toast has 歯車; cone still **円錐**; sketch **寸法**
4. File menu still **匯入 STL…** / **版本歷史…** (BD-7301)

## Build / release
| Item | Value |
|------|--------|
| Merge SHA | `b10fb2fc60517d3681a59b3b2998b83d923dfe82` |
| Release dir | `/var/www/webcad-releases/v1.81-20260919-152522` |
| Entry | `index-De76D24Z-r2.js` |
| MD5 | `84937bb419c7886af05fd5b30bc58f5b` |
| Previous | `/var/www/webcad-releases/v1.80-20260919-151524` |
| Live SW | `webcad-v1.81` |

## Contract
`tests/grok-qa-v1.81-i18n-leftovers.test.mjs` — **8/8** pass (`tsc -b` 0 err; build OK).

## Gaps (honest)
- Ribbon tips beyond the 30 catalogued `tip.*` still fall back to Chinese source (tStatus best-effort)
- Long MarkingMenu overflow items (mesh repair/simplify…) still mostly Chinese source
- Profile CREATE toast embeds Chinese section name (L/U/T) inside localized template
