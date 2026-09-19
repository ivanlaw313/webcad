# DEPLOY-RESULT v1.74

**Date:** 2026-09-19 14:03 HKT  
**PRs:**  
- https://github.com/ivanlaw313/webcad/pull/156 — four-locale i18n + 日本語 switcher (MERGED) → `feat/native-car-stage1-20260906`

**Site:** https://cad.neuralworkshk.com/  
**Choice:** Ship 4-locale catalogs (zh-HK / zh-CN / en / ja); Ribbon **繁｜簡｜EN｜日本語**; SW CACHE bump; nginx root switch to release dir.

## Ship contents
- Lang = `zh-HK | zh-CN | en | ja` (legacy `zh` → `zh-HK`)
- Catalogs under `src/i18n/locales/*` (~382 keys, parity)
- `t`/`msg`, `tLabel`/`tGroup`/`tTab`/`tStatus` resolve via catalog
- Ribbon switcher **4th control = 日本語** (`data-testid="lang-switcher"`)
- MESH pin: zh-HK/zh-CN keep **插入STL网格**
- Timeline field-param TC fold-in
- `APP_VERSION=1.74`; `CACHE=webcad-v1.74`

## How to switch
Ribbon top-right: **繁｜簡｜EN｜日本語** → persists `localStorage['webcad-lang']`.

## Build / release
| Item | Value |
|------|--------|
| Merge SHA | `8da5bd1eb2d5608ed003916efef8e7923cfdf749` |
| Release dir | `/var/www/webcad-releases/v1.74-20260919-140200` |
| Local entry | `index-BXjqnIJt-r2.js` |
| Previous | `/var/www/webcad-releases/v1.73-20260919-134016` |
| Live SW | `webcad-v1.74` |
| 日本語 in bundle | yes |

## Contract
`tests/grok-qa-v1.74-i18n-four-locale-catalog.test.mjs` — 10/10 pass (switcher includes 日本語).

## Gaps (honest)
- JA low-vis status may fall through EN phrase table
- Some File-menu residual ternaries not fully migrated
