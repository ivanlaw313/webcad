# FISHING95-FIX

## Summary
Close-demold i18n: `status.closeDemold` / `status.demoldClosed` in zh-HK/zh-CN/en/ja + `LABEL_TO_KEY` so JA ✕ tooltip is **離型到達性を閉じる** (not EN-only `_STATUS_EXACT`).
Cherry **more50** (`e7094186` → `fec3e06e`) before nginx.
more51 NOT cherry (F96).

## Live after cut
- Tip: `1859fe0e22962ea955898c5253bfe2bc20d6521d` (fix/fishing95-behavior-ux → FF fix/sketch-face-copy)
- Product: `bb16482ec3df58d45ef4ff561f3cb08229438fd0` closeDemold/demoldClosed catalog; test pin `ec9a9b7b`
- more50 cherry: `fec3e06e06ba8685f0c04e64036a8701fa905442` (from `e7094186`)
- Stamp: `v2.20-20261017-003921`
- Bundle: `index-DQ6jCzSu-r2.js` (md5 `11813e226927946ccf4a02891940fba6`)
- Bak: `index-DMkuSSzc-r2.js` / `v2.20-20261017-003330` (F94 kept as PREV)
- Site: https://cad.neuralworkshk.com/
- APP_VERSION 2.20
- Live bundle **changed** vs F94 `index-DMkuSSzc-r2.js`

## Product changes
| File | Change |
|------|--------|
| `src/i18n/locales/{en,ja,zh-CN,zh-HK}.ts` | status.closeDemold / demoldClosed |
| `src/i18n/labelToKey.ts` | 關閉/已關脫模可達性 (+ SC) → status.* |
| `tests/fishing95-demold-close-i18n.test.mjs` | hard + runtime |
| `tests/core16-more50-behavior-sample.test.mjs` | cherry more50 (16/16) |

## Deferred
- WindLegend/WindPoseCompare hardcoded TC titles → F96 if needed

## Kept
- MATERIALS / DENSITY_PREF SC untouched
- F93–F94 demold catalog/prefix pins kept
- more51 NOT cherry

## Tests
- fishing95 **3/3**; fishing94–86 **3/3**; more49/50 **16/16**; tsc PASS

## Deploy
- DEPLOY_OK `v2.20-20261017-003921` / `index-DQ6jCzSu-r2.js` / md5 `11813e226927946ccf4a02891940fba6`
- Bak prior live DMkuSSzc / 003330; live 200 + WindTunnelGpu 200
