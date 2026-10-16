# FISHING92-FIX

## Summary
Genuine Formal leftover: JA locale `cmd`/`tool.accessanalysis` → **`離型到達性`**; alias prefixed with `離型到達性` (keeps `アクセス解析` for search).
Cherry **more47** CORE16 sample (`3a32559f` → `81b77604`) before nginx.
No clearer P1/P2 crash/404 found — ja locale demold trail after F91 jaLabels.
more48 NOT cherry.

## Live after cut
- Tip: `TIP_PENDING` (fix/fishing92-behavior-ux → FF fix/sketch-face-copy)
- Product: `f1021246e40272d6660094ef5023684cec089d3f` ja locale accessanalysis → 離型到達性
- more47 cherry: `81b7760438cbc095102c51cd07dcbc2d4de81e8d` (from `3a32559f` on test/unit-core16-more47)
- Stamp: `v2.20-20261017-001554`
- Bundle: `index--sX2jDI3-r2.js` (md5 `55bb3ae5df80cb1933d11f95372b790e`)
- Bak: `index-Ds0i0Zmi-r2.js` / `v2.20-20261017-001016` (F91 kept as PREV)
- Site: https://cad.neuralworkshk.com/
- APP_VERSION 2.20
- Live bundle **changed** vs F91 `index-Ds0i0Zmi-r2.js`

## Product changes
| File | Change |
|------|--------|
| `src/i18n/locales/ja.ts` | cmd/tool.accessanalysis → 離型到達性; alias prepend |
| `tests/fishing92-demold-ja-locale.test.mjs` | hard asserts |
| `tests/core16-more47-behavior-sample.test.mjs` | cherry more47 (16/16) |

## Kept
- MATERIALS / DENSITY_PREF SC keys untouched
- No tip Formal invent / Formal chrome soft
- F85–F91 pins kept
- more48 NOT cherry (leave F93/F94)

## Tests
- fishing92-demold-ja-locale **3/3** PASS
- fishing91/90/89/88/86 each **3/3** PASS
- core16-more44/45/46/47 each **16/16** PASS
- tsc --noEmit PASS (flock)

## Deploy
- DEPLOY_OK `v2.20-20261017-001554` / `index--sX2jDI3-r2.js` / md5 `55bb3ae5df80cb1933d11f95372b790e`
- Bak prior live Ds0i0Zmi / 001016
- gzip + brotli; nginx root swap; live index + entry + WindTunnelGpu 200
