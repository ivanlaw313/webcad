# FISHING99-FIX

## Summary
Tour panel title / chrome i18n: **en / ja / zh-CN / zh-HK** explicit string tables (JA/EN no longer fall back to TC 手把手教學 steps).
Cherry **more54** (`a801a85c` → `148dc32c`) before nginx.
more55 NOT cherry (F100; `e27f5561`).
Deploy also copies PREV F98 lazy chunks (AeroLab/WindTunnelGpu/autoLoopStore + index-Da2AFr5h) into new assets to reduce tip-thrash 404s.

## Announce
- stamp: `v2.20-20261017-010959`
- bundle: `index-DySEOYT5-r2.js`
- md5: `0c1851cbc076bdc114f7afb2657ff979`
- tip: `TIP_STAMP_PLACEHOLDER`
- product: `7455f3a73fa36e121390d2098695ced45500160b`
- more54 cherry: `148dc32ca76845d654e5f9e183b8bdcdc381fba0`

## Live after cut
- Tip: `TIP_STAMP_PLACEHOLDER` (fix/fishing99-behavior-ux → FF fix/sketch-face-copy)
- Product: `7455f3a73fa36e121390d2098695ced45500160b` Tour i18n
- more54 cherry: `148dc32ca76845d654e5f9e183b8bdcdc381fba0` (from `a801a85c` on test/unit-core16-more54)
- Stamp: `v2.20-20261017-010959`
- Bundle: `index-DySEOYT5-r2.js` (md5 `0c1851cbc076bdc114f7afb2657ff979`)
- Bak: `index-Da2AFr5h-r2.js` / `v2.20-20261017-010046` (F98 kept as PREV) + PREV lazy chunks copied into new assets
- Site: https://cad.neuralworkshk.com/
- APP_VERSION 2.20
- Live bundle **changed** vs F98 `index-Da2AFr5h-r2.js`

## Product changes
| File | Change |
|------|--------|
| `src/components/Tour.tsx` | JA/ZH_CN/EN/ZH tables + normalizeLang pick |
| `src/components/TeachPointer.tsx` | sticky label follows lang |
| `tests/fishing99-tour-i18n.test.mjs` | hard asserts |
| `tests/core16-more54-behavior-sample.test.mjs` | cherry more54 (16/16) |

## Kept
- MATERIALS / DENSITY_PREF SC untouched
- F93–F98 demold + WindLegend + SlicePanel + IntroCard pins kept
- more55 NOT cherry (F100; `e27f5561`)
- NO Formal chrome soft-pin churn

## Tests
- fishing99 **3/3**; fishing98–93 **3/3**; more54 **16/16**; tsc PASS

## Deploy
- DEPLOY_OK `v2.20-20261017-010959` / `index-DySEOYT5-r2.js` / md5 `0c1851cbc076bdc114f7afb2657ff979`
- Bak prior live Da2AFr5h / 010046; PREV lazy AeroLab-C-Pn3D9w / WindTunnelGpu-DSNkI4kh / autoLoopStore-rRDNGpao (+ index-Da2AFr5h) also 200 on new root
- live 200 + new WindTunnelGpu-B60H8y3a 200
