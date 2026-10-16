# FISHING81-FIX

## Summary
Genuine product Formal fix after FISHING80 more41 cherry (tests-only, bundle unchanged).
User-visible FEA/analysis chrome: **分辨率 → 解析度** (HK Formal; LBM comments already used 解析度).
Also: heat status **再設定溫度** (align 設定力), ribbon tip.fea **出應力雲圖。紅色** punctuation.

## Live after cut
- Tip: `3a22107f57c9300891372936f8bd2491369d7e92` (fix/fishing81-behavior-ux → FF fix/sketch-face-copy)
- Stamp: `v2.20-20261016-225846`
- Bundle: `index-DOZZPmOV-r2.js` (md5 `72ac1c240cd5b610dfebd59cb0492ab2`)
- Bak: `index-BWU5nLRf-r2.js` / `v2.20-20261016-225256` (kept)
- Site: https://cad.neuralworkshk.com/
- APP_VERSION 2.20
- more42 cherry: **no** (absent → F82)

## Product changes
| File | Change |
|------|--------|
| `src/components/Viewport.tsx` | FEA panel label 解析度; probe/convergence titles; mold/wind 體素解析度; screenshot tip 視口解析度 |
| `src/store.ts` | load-face status 材料/解析度; 收斂研究 解析度; heat 再設定溫度; mold/wind status 解析度 |
| `src/i18n.ts` | TC+SC keys for load-face + 收斂研究 |
| `src/ribbon.ts` | tip.fea `出應力雲圖。紅色` |
| `tests/fishing81-jiexidu-formal.test.mjs` | hard asserts |
| `tests/fishing79-sheli-formal.test.mjs` | assert updated to 解析度 |

## Kept
- MATERIALS / DENSITY_PREF SC keys untouched
- No Formal tip invent / Formal chrome soft beyond leftover 分辨率 class
- more42 absent → defer F82

## Tests
- fishing81-jiexidu-formal 3/3 PASS
- fishing79-sheli-formal 3/3 PASS (updated)
- fishing78 / fishing76 / fishing74 Formal PASS
- tsc --noEmit PASS

## Deploy
- Bak prior live BWU5nLRf / 225256
- Soft-prep: more42 absent → no cherry before nginx
- Nginx cut: root → `/var/www/webcad-releases/v2.20-20261016-225846`
