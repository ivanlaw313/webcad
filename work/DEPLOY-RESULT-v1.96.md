# DEPLOY-RESULT v1.96

**Stamp:** `v1.96-20260919-182336`
**Entry:** `index-DEIzixLN-r2.js`
**MD5:** `46df6173b7f8ec657aea584abef708d8`
**Commit:** `861013d` / PR [#209](https://github.com/ivanlaw313/webcad/pull/209)
**Live:** https://cad.neuralworkshk.com/ · SW `webcad-v1.96` · nginx root `/var/www/webcad-releases/v1.96-20260919-182336`

## Summary
**v1.96 = align SW** to match badge `1.96` (v1.95 tip-TC ship left `APP_VERSION=1.96` via prepare-release while SW stayed `webcad-v1.95`).

Includes **v1.95 tip TC** content (unchanged): move/copy, box, caxis, ratio, mate…

| ID | Fix |
|----|-----|
| SW align | `public/sw.js` CACHE `webcad-v1.95` → `webcad-v1.96` |
| APP keep | `APP_VERSION = '1.96'` (no bump) |
| tip TC | same as v1.95: `移動/複製` / `長方體` / `構造軸` / `輸入目標速比` / `配合類型` |

## Verify
- Live `sw.js` → `const CACHE = 'webcad-v1.96'`
- Badge / bundle: `1.96`
- Bundle tip TC: `移動/複製：設` / `長方體：設長` / `構造軸：選方向` / `輸入目標速比` / `配合類型（包圍盒`
- Tests: tip-dialog-tc + version asserts 38/38 green
- Browser: hard refresh `?v=196`

## Files
- `public/sw.js`
- `tests/grok-qa-v1.84-*.test.mjs` … `tests/grok-qa-v1.95-tip-dialog-tc.test.mjs` (version asserts → 1.96)
