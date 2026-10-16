# FISHING94-FIX

## Summary
JA/EN **status prefix**: longer demold status sentences replace `脫模可達性`/`脱模可达性` with `msg('tool.accessanalysis')` (**離型到達性** / **Demold Accessibility**) before EN `_STATUS_EXACT`.
Cherry **more49** (`6b321e31` → `142df5ad`) before nginx.
more50 NOT cherry (F95).

## Live after cut
- Tip: `06f428d069a01af41d4d919c6e4980a5a4f473d1` (fix/fishing94-behavior-ux → FF fix/sketch-face-copy)
- Product: `ae5c6673a1e8fa45389ef2a317e9899993aabfff` demold status prefix JA/EN
- more49 cherry: `142df5add65cafc15199014e75360c699cd442f1` (from `6b321e31` on test/unit-core16-more49)
- Stamp: `v2.20-20261017-003330`
- Bundle: `index-DMkuSSzc-r2.js` (md5 `a553b6f445b391ae1400c4913126cd8b`)
- Bak: `index-CxYuATkg-r2.js` / `v2.20-20261017-002732` (F93 kept as PREV)
- Site: https://cad.neuralworkshk.com/
- APP_VERSION 2.20
- Live bundle **changed** vs F93 `index-CxYuATkg-r2.js`

## Product changes
| File | Change |
|------|--------|
| `src/i18n.ts` | tStatusOnce: demold status prefix → catalog tool name |
| `tests/fishing94-demold-status-prefix.test.mjs` | hard + runtime asserts |
| `tests/core16-more49-behavior-sample.test.mjs` | cherry more49 (16/16) |

## Kept
- MATERIALS / DENSITY_PREF SC untouched
- F93 LABEL_TO_KEY exact + F92 ja locale pins kept
- more50 NOT cherry (leave F95)
- Wind tunnel dialog EN body deferred (soft)

## Tests
- fishing94 **3/3**; fishing93–86 **3/3**; more48/49 **16/16**; tsc PASS

## Deploy
- DEPLOY_OK `v2.20-20261017-003330` / `index-DMkuSSzc-r2.js` / md5 `a553b6f445b391ae1400c4913126cd8b`
- Bak prior live CxYuATkg / 002732; live 200 + WindTunnelGpu 200
