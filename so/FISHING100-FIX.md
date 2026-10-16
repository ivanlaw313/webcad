# FISHING100-FIX

## Summary
JointsPanel panel title / section chrome i18n: **en / ja / zh-CN / zh-HK** explicit string tables (JA/EN no longer fall back to TC 裝配關節／關節原點／剛性組／捕捉位置／關鍵幀／運動連結).
Cherry **more55** (`e27f5561` → `274d057b`) before nginx.
more56 NOT cherry (F101; `1dab2d37`).
Deploy also copies PREV F99 lazy chunks (AeroLab/WindTunnelGpu/autoLoopStore + index-DySEOYT5) into new assets to reduce tip-thrash 404s.

## Announce
- stamp: `v2.20-20261017-011803`
- bundle: `index-hT3qICVW-r2.js`
- md5: `1bd2d85cda37ded6642f544a9eb8e74b`
- tip: `TIP_STAMP_PLACEHOLDER`
- product: `94332e3cb0b0cccb7ede07d026a71323db974ebf`
- more55 cherry: `274d057bfa549df893e8f21d94237417ac00aae9`

## Live after cut
- Tip: `TIP_STAMP_PLACEHOLDER` (fix/fishing100-behavior-ux → FF fix/sketch-face-copy)
- Product: `94332e3cb0b0cccb7ede07d026a71323db974ebf` JointsPanel i18n
- more55 cherry: `274d057bfa549df893e8f21d94237417ac00aae9` (from `e27f5561` on test/unit-core16-more55)
- Stamp: `v2.20-20261017-011803`
- Bundle: `index-hT3qICVW-r2.js` (md5 `1bd2d85cda37ded6642f544a9eb8e74b`)
- Bak: `index-DySEOYT5-r2.js` / `v2.20-20261017-010959` (F99 kept as PREV) + PREV lazy chunks copied into new assets
- Site: https://cad.neuralworkshk.com/
- APP_VERSION 2.20
- Live bundle **changed** vs F99 `index-DySEOYT5-r2.js`

## Product changes
| File | Change |
|------|--------|
| `src/components/JointsPanel.tsx` | JA/ZH_CN/EN/ZH tables + normalizeLang pick (panelTitle + section chrome) |
| `tests/fishing100-joints-panel-i18n.test.mjs` | hard asserts |
| `tests/core16-more55-behavior-sample.test.mjs` | cherry more55 (16/16) |

## Kept
- MATERIALS / DENSITY_PREF SC untouched
- F93–F99 demold + WindLegend + SlicePanel + IntroCard + Tour pins kept
- more56 NOT cherry (F101; `1dab2d37`)
- NO Formal chrome soft-pin churn

## Tests
- fishing100 **3/3**; fishing99–93 **3/3**; more55 **16/16**; more54 **16/16**; tsc PASS

## Deploy
- DEPLOY_OK `v2.20-20261017-011803` / `index-hT3qICVW-r2.js` / md5 `1bd2d85cda37ded6642f544a9eb8e74b`
- Bak prior live DySEOYT5 / 010959; PREV lazy AeroLab-BWos83vl / WindTunnelGpu-B60H8y3a / autoLoopStore-BdvPCtrV (+ index-DySEOYT5) also 200 on new root
- live 200 + new WindTunnelGpu-TVEQ_h7z 200
