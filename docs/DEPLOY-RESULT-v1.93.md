# DEPLOY-RESULT v1.93

**Stamp:** `v1.93-20260919-175453`  
**Entry:** `index-B0EGeisq-r2.js`  
**MD5:** `c5e9cbee0e3cebd75aa869d9e42d81d7`  
**Commit:** `696f816` / PR [#203](https://github.com/ivanlaw313/webcad/pull/203)  
**Live:** https://cad.neuralworkshk.com/ · SW `webcad-v1.93` · nginx root `/var/www/webcad-releases/v1.93-20260919-175453`

## Summary
APP/SW → **1.93**.

| ID | Fix |
|----|-----|
| BD-9301 | featDlg pattern/cpattern/circpattern/mirror/pathpattern SC→TC：對象／間距／數量／整個實體／所選特徵／抑制實例／鏡像出獨立實體／連泊車體一齊陣列／編輯 · 等 |
| BD-9101 leftovers | toolbar `草圖`；ribbon 豎直 tip；Timeline `歷史標記`／`拖動` |
| BD-9302 | Ribbon doc rename tip：`文件名（用於保存檔名／工程圖標題欄）— 點擊改名` |

## Verify
- Live `sw.js` → `const CACHE = 'webcad-v1.93'`
- Bundle: `對象` / `間距` / `X數量` / `草圖` / `鏡像出獨立實體` / `連泊車體一齊陣列`
- Tests: `grok-qa-v1.93-featdlg-pattern-mirror-tc.test.mjs` (6/6 green)
- Browser: hard refresh `?v=193`

## Files
`Viewport.tsx` · `Ribbon.tsx` · `Timeline.tsx` · `ribbon.ts` · `i18n.ts` · `version.ts` · `public/sw.js` · `tests/grok-qa-v1.93-featdlg-pattern-mirror-tc.test.mjs`
