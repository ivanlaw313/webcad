# DEPLOY-RESULT v1.82

**Date:** 2026-09-19 15:38 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/173 (MERGED `9186e36`) → `feat/native-car-stage1-20260906`  
**Site:** https://cad.neuralworkshk.com/

## Choice
Continue clearing four-locale i18n leftovers after v1.81. SW/APP → **1.82**.

## Keys migrated
| Prefix | Count |
|--------|------:|
| `ui.disabled.*` | **9** |
| `profile.name.*` | **3** |
| `mm.*` (was 22) | **44** |
| `tip.*` (was 30) | **42** |
| Catalog keys / locale | **982** (was 936 in v1.81) |

## Fixes
| Item | Detail |
|------|--------|
| commandAvailability | `ui.disabled.*` 4-locale (zh-HK 放開滑鼠, not SC 放开鼠标) |
| Profile CREATE | `profileSectionName` L角鐵 / U槽鋼 / T型材 — no SC 槽钢/角铁 in toast |
| MarkingMenu | Leftover labels → `mm.*`; SC runCommand args → TC |
| tip.* | +12 high-traffic (createform/rib/emboss/circpattern/pathpattern/splitbody/align/delete/appearance/joint/newbody/thicken) |
| ribbon tips | Source SC→TC (绕→繞, 特征→特徵, 弹簧→彈簧, …) for zh-HK tip fallback |
| Pins | BD-7301/8001 · Browser/File TC · JA 寸法/円錐 · sample.* · HelpPanel · CommandPalette |

## How to verify
1. Hard-refresh → badge **1.82**; DevTools SW = `webcad-v1.82`
2. 繁體 → disabled-tool tip **放開滑鼠**; CREATE profile toast **角鐵/槽鋼** (not 角铁/槽钢)
3. 日本語 → MarkingMenu / tip.createform; sketch **寸法**; cone **円錐**
4. File menu still **匯入 STL…** / **版本歷史…** (BD-7301); Home tip **主視圖** (BD-8001)

## Build / release
| Item | Value |
|------|--------|
| Merge SHA | `9186e36de905a6c769e50e1ddab3893d61670fa1` |
| Release dir | `/var/www/webcad-releases/v1.82-20260919-153528` |
| Entry | `index-CIEUokav-r2.js` |
| MD5 | `95bf0e315fe1346a71793405039d0dac` |
| Previous | `/var/www/webcad-releases/v1.81-20260919-152522` |
| Live SW | `webcad-v1.82` |

## Contract
`tests/grok-qa-v1.82-i18n-leftovers.test.mjs` — **8/8** pass (`tsc -b` 0 err; build OK).

## Gaps (honest)
- Ribbon tips beyond the 42 catalogued `tip.*` still fall back to Chinese source (tStatus best-effort)
- Long MarkingMenu overflow / mesh-repair items still partly Chinese source
- Many store status strings remain SC/mixed (out of this pass)
