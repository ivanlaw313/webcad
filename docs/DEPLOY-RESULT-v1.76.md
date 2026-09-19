# DEPLOY-RESULT v1.76

**Date:** 2026-09-19 14:18 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/161 (MERGED `e4861d8`) → `feat/native-car-stage1-20260906`  
**Site:** https://cad.neuralworkshk.com/

## Choice
Finish HelpPanel / CommandPalette / File-menu i18n wiring left open after v1.75; SW/APP → **1.76**.

## Keys migrated
| Prefix | Count |
|--------|------:|
| `help.*` | 42 |
| `tip.*` | 10 |
| `cmd.*` | 7 |
| `alias.*` | 10 |
| `file.*` (catalog total) | 27 |
| **New keys this release** | **80** |
| Catalog keys / locale | **485** (was 405 in v1.75) |

## Ship contents
- HelpPanel novels → `msg(help.*)` (titles, paragraphs, shortcuts, ShowMe)
- CommandPalette chrome → `msg(cmd.*)`; labels via `tLabel`; tip/alias via catalog overlays
- File menu residual `en ? … : …` → `msg(file.*)`
- Pins: **插入STL网格**, **實驗室**, **尺寸已拒絕**, Ribbon **日本語**, JA `tool.*` stay non-EN
- `APP_VERSION=1.76`; `CACHE=webcad-v1.76`

## How to verify
1. Hard-refresh → badge **1.76**; DevTools SW = `webcad-v1.76`
2. Ribbon → **日本語** → F1 Help shows **ヘルプ / ショートカット**
3. Press `/` → placeholder/empty/hint follow locale; fillet tip JA has フィレット
4. File ▾ → Import/Export rows follow 繁/簡/EN/日本語 (no EN-only ternary leftovers)

## Build / release
| Item | Value |
|------|--------|
| Merge SHA | `e4861d8fa71b72fc022dce7de656b273a34b4b35` |
| Release dir | `/var/www/webcad-releases/v1.76-20260919-141646` |
| Entry | `index-DBjy564A-r2.js` |
| MD5 | `8390392df7d0db69b4abd91193727733` |
| Previous | `/var/www/webcad-releases/v1.75-20260919-140655` |
| Live SW | `webcad-v1.76` |

## Contract
`tests/grok-qa-v1.76-helppanel-i18n.test.mjs` (+ v1.74/v1.75) — **22/22** pass.

## Gaps (honest)
- HelpPanel About section lost inline license hyperlinks (plain catalog text)
- Shortcut list no longer wraps keys in `<kbd>` (catalog plain lines)
- CommandPalette extras (`act:save` etc.) labels still Chinese source (searchable; display via tLabel when mapped)
- Large SYN synonym table remains multilingual hardcoded (catalog aliases overlay the high-traffic ids)
