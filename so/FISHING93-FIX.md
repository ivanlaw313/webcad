# FISHING93-FIX

## Summary
Product: EN `alias.accessanalysis` prepend **`Demold Accessibility`** (mirror F92 JA alias; cmd/tool already Demold Accessibility).
No clearer P1/P2 crash/404 found (no bare lazy).
Cherry **more48** (`43f8be3d` → `284b0475`); resolve always-hard pin for F92 ja locale (`64f48ada`).
more49 NOT cherry.

## Live after cut
- Tip: `TIP_PENDING` (fix/fishing93-behavior-ux → FF fix/sketch-face-copy)
- Product: `1298b0de3091e79b66cb3f68baffe53dc1e24370` en alias.accessanalysis prepend Demold Accessibility
- more48 cherry: `284b047519de0456a3b1cac7befb4b37e5b2f3fb` (from `43f8be3d`); pin resolve `64f48adafe76f829d2068501b5f00dc9616d5bd7`
- Stamp: `v2.20-20261017-002232`
- Bundle: `index-A8tbt9Eq-r2.js` (md5 `91c4c19984703123d4585f30b5cdf1f9`)
- Bak: `index--sX2jDI3-r2.js` / `v2.20-20261017-001554` (F92 kept as PREV)
- Site: https://cad.neuralworkshk.com/
- APP_VERSION 2.20
- Live bundle **changed** vs F92 `index--sX2jDI3-r2.js`

## Product changes
| File | Change |
|------|--------|
| `src/i18n/locales/en.ts` | alias.accessanalysis prepend Demold Accessibility |
| `tests/fishing93-demold-en-alias.test.mjs` | hard asserts |
| `tests/core16-more48-behavior-sample.test.mjs` | cherry + F92 locale always-hard pin |

## Kept
- MATERIALS / DENSITY_PREF SC untouched
- No tip Formal invent / Formal chrome soft
- F85–F92 pins kept; cmd/tool.accessanalysis EN unchanged
- more49 NOT cherry (leave F94/F95)

## Tests
- fishing93–86 each **3/3** PASS
- more44–47 each **16/16**; more48 **16/16** after F92 pin resolve
- tsc --noEmit PASS (flock)

## Deploy
- DEPLOY_OK `v2.20-20261017-002232` / `index-A8tbt9Eq-r2.js` / md5 `91c4c19984703123d4585f30b5cdf1f9`
- Bak prior live --sX2jDI3 / 001554
- gzip + brotli; nginx root swap; live index + entry + WindTunnelGpu 200
