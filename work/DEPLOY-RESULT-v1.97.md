# DEPLOY-RESULT v1.97

**Stamp:** `v1.97-20260919-184516`
**Entry:** `index-CVTIKPTQ-r2.js`
**MD5:** `44c05ed792895210e7689fcd3953f8e2`
**Commit:** `bad59ec` / PR [#213](https://github.com/ivanlaw313/webcad/pull/213) (+ duplicate-key fix `b84d8a0`)
**Live:** https://cad.neuralworkshk.com/ · SW `webcad-v1.97` · nginx root `/var/www/webcad-releases/v1.97-20260919-184516`

## Summary
**v1.97 = BD-9701 residual SC→港繁 TC**（含並行 locale leftovers）。

| ID | Fix |
|----|-----|
| MESH pin | `插入STL网格` → `插入STL網格`（兩處 ribbon.ts；EN_LABEL 加 TC key） |
| Ribbon | 插入標準件到裝配…；清空全部？當前模型…；載入選中的起始模板…／確定載入？；材質下拉顯示港繁 |
| Viewport prefs | 關閉／自動／淺色／深色／新文件預設單位／進入草圖自動正視／恢復預設… |
| press-pull / shell | 選擇／修改現有特徵／實體／抽殼類型／預覽狀態… |
| sketch text | `T 草圖文字`／`✓ 確定`／對齊／字體說明 |
| store / BrowserTree | 構造軸 tip／順序拾／構造點刪除 tip；caxis label `構造軸` |
| i18n | STATUS_PHRASES_X v1.97 TC→EN；去重 EN_LABEL 避免 tsc 爆 |
| version | APP `1.97` · SW `webcad-v1.97` |

## Verify
- Live `sw.js` → `const CACHE = 'webcad-v1.97'`
- Badge / bundle `1.97` · entry `index-CVTIKPTQ-r2.js`
- Bundle: `插入STL網格` / `插入標準件到裝配` / `恢復預設` / `修改現有特徵` / `T 草圖文字`
- Tests: `grok-qa-v1.97-bd9701-residual-tc` + `locale-leftovers` + v1.95/v1.96 = **24/24**
- Browser: hard refresh `?v=197`（Chrome 保持開住）

## Files
- `public/sw.js` `src/version.ts` `src/ribbon.ts`
- `src/components/Ribbon.tsx` `Viewport.tsx` `BrowserTree.tsx`
- `src/store.ts` `src/i18n.ts` `src/i18n/labelToKey.ts` `src/i18n/locales/zh-HK.ts`
- `tests/grok-qa-v1.97-bd9701-residual-tc.test.mjs`
- `tests/grok-qa-v1.97-locale-leftovers-tc.test.mjs`
