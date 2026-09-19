# DEPLOY-RESULT v1.77

**Date:** 2026-09-19 14:30 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/163 (MERGED `c91c415`) → `feat/native-car-stage1-20260906`  
**Site:** https://cad.neuralworkshk.com/

## Choice
Clear remaining i18n leftovers after v1.76 (Ribbon tip SC, UI chrome ternaries) + fix JP Box toast `Done:/Box` shred; SW/APP → **1.77**.

## Strings migrated
| Item | Count |
|------|------:|
| New catalog keys (`draw.*` / `insp.*` / `dlg.*` / `hint.*` / `insert.*` / `vp.*` / `ui.*` / `fastener.*` / `status.box*`) | **108** |
| Catalog keys / locale | **593** (was 485 in v1.76) |
| Ribbon tips SC→TC | **297** |
| EN `tool.*` CJK fixes | **11** |

## Ship contents
- Ribbon tip source Traditional (no residual 这/点击/实体/…); MESH pin **插入STL网格** kept
- Ribbon chrome / Fastener dialog / NarrowHint / Inspect / Insert / Prompt / CommandDialog / Drawing overflow+export / Viewport extrude+form → `msg()`
- **JP Box toast:** `status.boxCreated` → `ボックスを作成しました {0}×{1}×{2}` (no `Done:` / `Box`); `tStatus` rewrite + `boxSuccessStatus` in store
- Pins: **插入STL网格** · **實驗室** · **尺寸已拒絕** · Ribbon **日本語** · JA `tool.*` · HelpPanel catalog
- BOT-D 7302 false-positive: BrowserTree/Timeline already TC（複製實體／STEP實體／網格實體／合併面）
- `APP_VERSION=1.77`; `CACHE=webcad-v1.77`

## How to verify
1. Hard-refresh → badge **1.77**; DevTools SW = `webcad-v1.77`
2. 日本語 → CREATE → Box → toast **ボックスを作成しました …** (no English `Done:` / `Box`)
3. Ribbon hover tips Traditional Chinese; 繁/簡/EN/日本語 chrome on File/Inspect/Drawing follow locale

## Build / release
| Item | Value |
|------|--------|
| Merge SHA | `c91c4157d299d233556176d96c7c68e4c4b6f1a5` |
| Release dir | `/var/www/webcad-releases/v1.77-20260919-142913` |
| Entry | `index-DSfEHUNF-r2.js` |
| MD5 | `38a0407afc83d6b7ceda15cd6de98f3f` |
| Previous | `/var/www/webcad-releases/v1.76-20260919-141646` |
| Live SW | `webcad-v1.77` |

## Contract
`tests/grok-qa-v1.77-i18n-leftovers.test.mjs` (+ v1.74/v1.75/v1.76) — pass.

## Gaps (honest)
- SketchToolPanel still has many `lang==='en'` ternaries (not this release)
- Other prim toasts beyond box/cylinder still use Chinese→EN shred path on JA
- SYN synonym table / CommandPalette extras still multilingual hardcoded
