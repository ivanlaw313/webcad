# FISHING97-FIX

## Summary
SlicePanel panel title / chrome i18n: **en / ja / zh-CN / zh-HK** explicit string tables (JA/EN no longer fall back to TC 切層預覽).
Cherry **more52** (`40f18312` → `3f7ecdc1`) before nginx.
more53 NOT cherry (F98). more54 NOT cherry (F99).
Deploy also copies PREV F96 lazy chunks (AeroLab/WindTunnelGpu/autoLoopStore + index-CGLkCiJB) into new assets to reduce tip-thrash 404s.

## Announce
- stamp: `v2.20-20261017-005309`
- bundle: `index-GmqroPhs-r2.js`
- md5: `7afccbd2ccc2d7a297fc90aec2e9c9be`
- tip: `fdbb7fa4baefed85e24191c2096a7fdd4a3901e2`
- product: `4c09a0c5a8a00286609ab3b3bcdbc5c90180fd70`
- more52 cherry: `3f7ecdc1adc0cc7975e189c5dd1f7fec3951ca84`

## Live after cut
- Tip: `fdbb7fa4baefed85e24191c2096a7fdd4a3901e2` (fix/fishing97-behavior-ux → FF fix/sketch-face-copy)
- Product: `4c09a0c5a8a00286609ab3b3bcdbc5c90180fd70` SlicePanel i18n
- more52 cherry: `3f7ecdc1adc0cc7975e189c5dd1f7fec3951ca84` (from `40f18312` on test/unit-core16-more52)
- Stamp: `v2.20-20261017-005309`
- Bundle: `index-GmqroPhs-r2.js` (md5 `7afccbd2ccc2d7a297fc90aec2e9c9be`)
- Bak: `index-CGLkCiJB-r2.js` / `v2.20-20261017-004527` (F96 kept as PREV) + PREV lazy chunks copied into new assets
- Site: https://cad.neuralworkshk.com/
- APP_VERSION 2.20
- Live bundle **changed** vs F96 `index-CGLkCiJB-r2.js`

## Product changes
| File | Change |
|------|--------|
| `src/components/SlicePanel.tsx` | JA/ZH_CN/EN/ZH tables + normalizeLang pick |
| `tests/fishing97-slice-panel-i18n.test.mjs` | hard asserts |
| `tests/core16-more52-behavior-sample.test.mjs` | cherry more52 (16/16) |

## Kept
- MATERIALS / DENSITY_PREF SC untouched
- F93–F96 demold + WindLegend pins kept
- more53 NOT cherry (F98; `8241061b`)
- more54 NOT cherry (F99; `a801a85c`)
- NO Formal chrome soft-pin churn
- NO second deploy after live cut

## Tests
- fishing97 **3/3**; fishing96–93 **3/3**; more51/52 **16/16**; tsc PASS

## Deploy
- DEPLOY_OK `v2.20-20261017-005309` / `index-GmqroPhs-r2.js` / md5 `7afccbd2ccc2d7a297fc90aec2e9c9be`
- Bak prior live CGLkCiJB / 004527; PREV lazy AeroLab-BLm7JsPE / WindTunnelGpu-wzD3jylc / autoLoopStore-8GqicSoO (+ index-CGLkCiJB) also 200 on new root
- live 200 + new WindTunnelGpu-Cdx1YqQY 200
