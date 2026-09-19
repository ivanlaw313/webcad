# DEPLOY-RESULT v1.96

**Stamp:** `v1.96-20260919-182731`
**Entry:** `index-DosMYxm6-r2.js`
**MD5:** `b9b47f6cfd63175cd1480bb8c953f5aa`
**Commit:** `469a355` / PR [#211](https://github.com/ivanlaw313/webcad/pull/211) (+ SW-align [#209](https://github.com/ivanlaw313/webcad/pull/209))
**Live:** https://cad.neuralworkshk.com/ · SW `webcad-v1.96` · nginx root `/var/www/webcad-releases/v1.96-20260919-182731`

## Summary
**v1.96 = align SW + BD-9601/locale dialog TC.**

| ID | Fix |
|----|-----|
| SW align | CACHE `webcad-v1.96` matches badge `1.96` |
| tip TC | includes v1.95 tip TC (move/copy, box, caxis, ratio, mate…) |
| BD-9601 | ribbon 選擇起始模板／標準件類型／公制規格／材質預設／紋理；TEXTURE 木紋／拉絲／磨砂；關節拾取／運動連接；參數化件／每個可見零件 |
| locale-v195 | Move 對象／實體／活動實體／已選／點對點／建立副本；datum mode `軸` + title `構造軸`；tip `構造幾何 · …` |
| exempt | MESH pin `插入STL网格` stays |

## Verify
- Live `sw.js` → `const CACHE = 'webcad-v1.96'`
- Badge / bundle `1.96`
- Bundle: `選擇起始模板` / `關節拾取` / `構造幾何 ·` / `建立副本` / `點對點` / `構造軸`
- Tests: `grok-qa-v1.96-bd9601-dialog-tc` + tip-dialog-tc = 13/13
- Browser: hard refresh `?v=196b`

## Files
- `public/sw.js` (prior #209)
- `src/components/Ribbon.tsx` `Viewport.tsx` `CommandDialog.tsx` `BrowserTree.tsx`
- `src/render/procTextures.ts` `src/store.ts` `src/i18n.ts`
- `tests/grok-qa-v1.96-bd9601-dialog-tc.test.mjs`
