# DEPLOY-RESULT v1.78

**Date:** 2026-09-19 14:43 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/165 (MERGED `9ddc23e`) → `feat/native-car-stage1-20260906`  
**Site:** https://cad.neuralworkshk.com/

## Choice
Close leftover i18n gaps after v1.77: SketchToolPanel lang ternaries → catalog; sphere/cone/torus JA toasts via `status.*Created` (no `Done:` shred); zh-HK File menu Traditional; drop unused Ribbon `en` (TS6133). SW/APP → **1.78**.

## Strings migrated
| Item | Count |
|------|------:|
| New catalog keys (`sk.*` / `status.sphere*` / `status.cone*` / `status.torus*`) | **~47** |
| Catalog keys / locale | **≥640** (was 593 in v1.77) |
| SketchToolPanel `lang==='en'` ternaries removed | **all** |

## Ship contents
- SketchToolPanel: `msg()` / `m('sk.*')` for earc/ellipse/array/scale/drag/tan/move — no `lang==='en'` ternaries
- **JP sphere/cone/torus toasts:** `status.*Created` + `sphereSuccessStatus` / `coneSuccessStatus` / `torusSuccessStatus` (no `Done:` / English shred)
- zh-HK File menu: **匯入 STL…** / **版本歷史…** / 匯入 3MF·OBJ·STEP (BD-7301)
- Ribbon: remove unused `const en` (TS6133 build blocker)
- Pins retained: 插入STL网格 · 實驗室 · 尺寸已拒絕 · 日本語 · JA `tool.*` · HelpPanel · box JP toast
- `APP_VERSION=1.78`; `CACHE=webcad-v1.78`

## How to verify
1. Hard-refresh → badge **1.78**; DevTools SW = `webcad-v1.78`
2. 日本語 → CREATE → Sphere/Cone/Torus → toast **球を作成しました…** / **円錐を…** / **トーラスを…** (no English `Done:`)
3. 繁體 → File menu **匯入 STL…** / **版本歷史…**
4. Sketch tools panel labels follow locale via catalog

## Build / release
| Item | Value |
|------|--------|
| Merge SHA | `9ddc23e76251a817aa32671458e117f88034fcf7` |
| Release dir | `/var/www/webcad-releases/v1.78-20260919-144302` |
| Entry | `index-BQACZ3Fe-r2.js` |
| MD5 | `927674638c5c99432035ad593b6ed4cc` |
| Previous | `/var/www/webcad-releases/v1.77-20260919-142913` |
| Live SW | `webcad-v1.78` |

## Contract
`tests/grok-qa-v1.78-i18n-leftovers.test.mjs` — 6/6 pass (`tsc -b` 0 err; build OK).

## Gaps (honest)
- Other prim / status shred paths beyond box/sphere/cone/torus may still Chinese→EN on JA
- SYN synonym table / CommandPalette extras still multilingual hardcoded
