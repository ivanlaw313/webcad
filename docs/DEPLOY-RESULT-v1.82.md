# DEPLOY-RESULT v1.82

**Date:** 2026-09-19 15:37 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/173 (MERGED `9186e36`) → `feat/native-car-stage1-20260906`  
**Commit:** `5b3f360` fix(qa): v1.82 i18n leftovers — disabled reasons / profile.name / MM / tips  
**Site:** https://cad.neuralworkshk.com/

## Choice
Continue clearing four-locale i18n leftovers after v1.81. Wire `ui.disabled.*`, `profile.name` L/U/T, remaining MarkingMenu `mm.*`, expand `tip.*`, and convert ribbon tip source SC→TC. SW/APP → **1.82**.

## Keys migrated
| Prefix | Count |
|--------|------:|
| Catalog keys / locale | **982** (was 936 in v1.81) |
| `tip.*` | **42** (was 30) |
| `mm.*` | **44** (was 22) |
| `ui.disabled.*` | **9** (new) |
| `profile.name.L/U/T` | **3** (new) |
| `sample.*` | **34** (unchanged) |

## Fixes
| Item | Detail |
|------|--------|
| commandAvailability | Disabled reasons via `msg('ui.disabled.*')` — no SC 请先放开鼠标 / 请先完成草图 |
| profile.name | L/U/T via `profileSectionName` in featureStatus — zh-HK 角鐵/槽鋼, JA Uチャンネル; no SC 槽钢/角铁 in toast |
| Viewport MM | Remaining MM items use `mm.*` catalog; no SC runCommand args |
| Ribbon tips | Expand `tip.*` (createform/circpattern/splitbody/…); tip source SC→TC (绕/特征/弹簧…) |
| Pins | BD-8001 TC · JA 寸法/円錐 · Browser/File · sample/tip · BD-7301 |

## How to verify
1. Hard-refresh → badge **1.82**; DevTools SW = `webcad-v1.82`
2. 繁體 → drag-in-sketch disabled tip uses 放開/滑鼠 (not 放开/鼠标); profile L toast **L 角鐵**
3. 日本語 → profile U = Uチャンネル; tip.createform / circpattern not EN shred
4. Ribbon tips for createform/circpattern show localized tip.* (4 locales)

## Build / release
| Item | Value |
|------|--------|
| Merge SHA | `9186e36de905a6c769e50e1ddab3893d61670fa1` |
| Feature SHA | `5b3f3600862ecf9ab04f79888ed2bf60026326a6` |
| Release dir | `/var/www/webcad-releases/v1.82-20260919-153528` |
| Entry | `index-CIEUokav-r2.js` |
| MD5 | `95bf0e315fe1346a71793405039d0dac` |
| Previous | `/var/www/webcad-releases/v1.81-20260919-152522` |
| Live SW | `webcad-v1.82` |

## Contract
`tests/grok-qa-v1.82-i18n-leftovers.test.mjs` — **8/8** pass  
`tests/grok-qa-v1.81-i18n-leftovers.test.mjs` — **7/8** (only APP_VERSION pin fails as expected on 1.82; i18n pins OK)  
`tsc -b` EXIT 0 · `vite build` OK

## Gaps (honest — next round)
- Ribbon **labels** (建立草圖/拉伸/…) still Traditional Chinese source strings — need full `cmd.*` / label catalog for EN/JA one-shot switch
- MarkingMenu overflow / comments still mixed; long mesh repair items may still fall back to Chinese source
- Many dialog/status strings outside tip/mm/sample/ui.disabled still hardcoded
- Proper message-catalog i18n architecture (user priority) still the long-term fix vs piecemeal key migration
