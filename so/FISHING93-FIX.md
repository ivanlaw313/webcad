# FISHING93-FIX

## Summary
1. **JA Browser tree demold** (preferred P1): `tStatusOnce` consults `LABEL_TO_KEY` → `msg(tool.accessanalysis)` **before** EN-only `_STATUS_EXACT`, so `tStatus('脫模可達性','ja')` → **`離型到達性`** (was English Demold Accessibility).
2. EN `alias.accessanalysis` prepend **Demold Accessibility** (mirror F92 JA alias).
3. Cherry **more48** (`43f8be3d` → `284b0475`) + F92 locale always-hard pin resolve (`64f48ada`).
more49 NOT cherry (F94).

## Live after cut
- Tip: `3b859cccbe90a5681e6c52218909473e4a146073` (fix/fishing93-behavior-ux → FF fix/sketch-face-copy)
- Product: `a7ab329291bbcf7b495b9bfb26ee689d2c9dd9b0` tStatus LABEL_TO_KEY (JA tree); `1298b0de3091e79b66cb3f68baffe53dc1e24370` en alias prepend
- more48 cherry: `284b047519de0456a3b1cac7befb4b37e5b2f3fb` (from `43f8be3d`); pin resolve `64f48adafe76f829d2068501b5f00dc9616d5bd7`
- Stamp: `v2.20-20261017-002732`
- Bundle: `index-CxYuATkg-r2.js` (md5 `0a71e97a51ebe500dc3c732e89d3c524`)
- Bak: `index-A8tbt9Eq-r2.js` / `v2.20-20261017-002232` (first F93 cut; F92 `--sX2jDI3`/`001554` also kept on disk)
- Site: https://cad.neuralworkshk.com/
- APP_VERSION 2.20
- Live bundle **changed** vs F92 `index--sX2jDI3-r2.js` (and vs first F93 `A8tbt9Eq`)

## Product changes
| File | Change |
|------|--------|
| `src/i18n.ts` | tStatusOnce: LABEL_TO_KEY/msg before _STATUS_EXACT |
| `src/i18n/locales/en.ts` | alias.accessanalysis prepend Demold Accessibility |
| `tests/fishing93-demold-en-alias.test.mjs` | alias + tStatus JA/EN/zh asserts |
| `tests/core16-more48-behavior-sample.test.mjs` | cherry + F92 locale pin |

## Deferred (soft)
- JA status result sentence still TC 脫模可達性; wind tunnel dialog body EN — F94 if needed

## Kept
- MATERIALS / DENSITY_PREF SC untouched
- No tip Formal invent / Formal chrome soft
- TC 脫模可達性 / SC 脱模可达性 / EN Demold Accessibility correct
- more49 NOT cherry

## Tests
- fishing93 **3/3**; fishing92–86 **3/3**; more44–48 **16/16**; tsc PASS

## Deploy
- DEPLOY_OK `v2.20-20261017-002732` / `index-CxYuATkg-r2.js` / md5 `0a71e97a51ebe500dc3c732e89d3c524`
- Bak prior live A8tbt9Eq / 002232; live 200 + WindTunnelGpu 200
