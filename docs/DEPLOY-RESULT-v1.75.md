# DEPLOY-RESULT v1.75

**Date:** 2026-09-19 14:08 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/159 (MERGED `d326ffa`) → `feat/native-car-stage1-20260906`  
**Site:** https://cad.neuralworkshk.com/

## Choice
Fill remaining Japanese `tool.*` labels (199→0 identical-to-EN) + migrate Extrude/Fillet/Shell/Boolean/Cut success toasts into 4-locale catalog; SW/APP → **1.75**.

## Before → After (JA tool.*)
| Metric | v1.74 | v1.75 |
|--------|-------|-------|
| `tool.*` count | 306 | 306 |
| JA identical to EN | **199** | **0** |
| Catalog keys / locale | 382 | **405** (+status.*) |

## Ship contents
- JA CAD terminology for all remaining `tool.*` (Fusion/SW-style)
- `status.extrudeDone|filletDone|shellDone|boolean*|cutDone|multi*` in zh-HK / zh-CN / en / ja
- `featureStatus.ts` builders → `msg()` + `detectLang()`
- Pins: **插入STL网格**, **實驗室**, **尺寸已拒絕**, Ribbon **日本語**
- `APP_VERSION=1.75`; `CACHE=webcad-v1.75`

## How to verify JA
Ribbon → **日本語** → CREATE group shows **押し出し** / **フィレット** / **シェル** (not English).

## Build / release
| Item | Value |
|------|--------|
| Merge SHA | `d326ffa2c41edfc69d1a51587b8c68e3dac86139` |
| Release dir | `/var/www/webcad-releases/v1.75-20260919-140655` |
| Entry | `index-Bxz6nk3b-r2.js` |
| MD5 | `b465ae26ed24cfbdd1c206ed4645efb0` |
| Previous | `/var/www/webcad-releases/v1.74-20260919-140200` |
| Live SW | `webcad-v1.75` |

## Contract
`tests/grok-qa-v1.75-ja-tools-status.test.mjs` — 6/6 pass.

## Gaps (honest)
- HelpPanel tip novels still phrase-fallback
- CommandPalette aliases not fully localized
- Some residual File-menu ternaries
