# FISHING101-FIX

## Summary
JointOriginPalette panel title / mode / hint chrome i18n: **en / ja / zh-CN / zh-HK** explicit string tables (JA/EN no longer fall back to TC 關節原點).
Cherry **more56** (`1dab2d37` → `c15290cd`) before nginx.
more57 NOT cherry (F102).
Deploy also copies PREV F100 lazy chunks (AeroLab/WindTunnelGpu/autoLoopStore + index-hT3qICVW) into new assets to reduce tip-thrash 404s.

## Announce
- stamp: `v2.20-20261017-012414`
- bundle: `index-CmiPgzPU-r2.js`
- md5: `b0c649d305fd46383005cbb3c01c2362`
- tip: (pending tip-docs commit)
- product: `674f096c719aa8317eb858547558ddaf741f07fe`
- more56 cherry: `c15290cd88ce88d658fd795c1225c3c53fc4e919`

## Live after cut
- Tip: (pending tip-docs; fix/fishing101-behavior-ux → FF fix/sketch-face-copy)
- Product: `674f096c719aa8317eb858547558ddaf741f07fe` JointOriginPalette i18n
- more56 cherry: `c15290cd88ce88d658fd795c1225c3c53fc4e919` (from `1dab2d37` on test/unit-core16-more56)
- Stamp: `v2.20-20261017-012414`
- Bundle: `index-CmiPgzPU-r2.js` (md5 `b0c649d305fd46383005cbb3c01c2362`)
- Bak: `index-hT3qICVW-r2.js` / `v2.20-20261017-011803` (F100 kept as PREV) + PREV lazy chunks copied into new assets
- Site: https://cad.neuralworkshk.com/
- APP_VERSION 2.20
- Live bundle **changed** vs F100 `index-hT3qICVW-r2.js`

## Product changes
| File | Change |
|------|--------|
| `src/components/JointOriginPalette.tsx` | JA/ZH_CN/EN/ZH tables + normalizeLang pick (title + mode + hints) |
| `tests/fishing101-joint-origin-palette-i18n.test.mjs` | hard asserts |
| `tests/core16-more56-behavior-sample.test.mjs` | cherry more56 (16/16) |

## Kept
- MATERIALS / DENSITY_PREF SC untouched
- F93–F100 demold + WindLegend + SlicePanel + IntroCard + Tour + JointsPanel pins kept
- more57 NOT cherry (F102)
- NO Formal chrome soft-pin churn

## Tests
- fishing101 **3/3**; fishing100–93 **3/3**; more56 **16/16**; more55 **16/16**; tsc PASS

## Deploy
- DEPLOY_OK `v2.20-20261017-012414` / `index-CmiPgzPU-r2.js` / md5 `b0c649d305fd46383005cbb3c01c2362`
- Bak prior live hT3qICVW / 011803; PREV lazy (F100 AeroLab/WindTunnelGpu/autoLoopStore + index-hT3qICVW) also 200 on new root
