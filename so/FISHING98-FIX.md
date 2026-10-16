# FISHING98-FIX

## Summary
IntroCard panel title / chrome i18n: **en / ja / zh-CN / zh-HK** explicit string tables (JA/EN no longer fall back to TC 快速開始).
Cherry **more53** (`8241061b` → `926bae85`) before nginx.
more54 NOT cherry (F99).
Deploy also copies PREV F97 lazy chunks (AeroLab/WindTunnelGpu/autoLoopStore + index-GmqroPhs) into new assets to reduce tip-thrash 404s.

## Announce
- stamp: `v2.20-20261017-010046`
- bundle: `index-Da2AFr5h-r2.js`
- md5: `fe7713da7d6dcd19c660bf71774dfe0d`
- tip: `730f00e6272ef8cfb5ecfd82663e32c98dbd7ec9`
- product: `43203cd369ada4b09202090352f7f8d1b64068ae`
- more53 cherry: `926bae85cc1598a45c9677fe3e2a3f61c4c5b785`

## Live after cut
- Tip: `730f00e6272ef8cfb5ecfd82663e32c98dbd7ec9` (fix/fishing98-behavior-ux → FF fix/sketch-face-copy)
- Product: `43203cd369ada4b09202090352f7f8d1b64068ae` IntroCard i18n
- more53 cherry: `926bae85cc1598a45c9677fe3e2a3f61c4c5b785` (from `8241061b` on test/unit-core16-more53)
- Stamp: `v2.20-20261017-010046`
- Bundle: `index-Da2AFr5h-r2.js` (md5 `fe7713da7d6dcd19c660bf71774dfe0d`)
- Bak: `index-GmqroPhs-r2.js` / `v2.20-20261017-005309` (F97 kept as PREV) + PREV lazy chunks copied into new assets
- Site: https://cad.neuralworkshk.com/
- APP_VERSION 2.20
- Live bundle **changed** vs F97 `index-GmqroPhs-r2.js`

## Product changes
| File | Change |
|------|--------|
| `src/components/IntroCard.tsx` | JA/ZH_CN/EN/ZH tables + normalizeLang pick |
| `tests/fishing98-intro-card-i18n.test.mjs` | hard asserts |
| `tests/core16-more53-behavior-sample.test.mjs` | cherry more53 (16/16) |

## Kept
- MATERIALS / DENSITY_PREF SC untouched
- F93–F97 demold + WindLegend + SlicePanel pins kept
- more54 NOT cherry (F99; `a801a85c`)
- NO Formal chrome soft-pin churn

## Tests
- fishing98 **3/3**; fishing97–93 **3/3**; more52/53 **16/16**; tsc PASS

## Deploy
- DEPLOY_OK `v2.20-20261017-010046` / `index-Da2AFr5h-r2.js` / md5 `fe7713da7d6dcd19c660bf71774dfe0d`
- Bak prior live GmqroPhs / 005309; PREV lazy AeroLab-B7fTioVj / WindTunnelGpu-Cdx1YqQY / autoLoopStore-Kmf55EB_ (+ index-GmqroPhs) also 200 on new root
- live 200 + new WindTunnelGpu-DSNkI4kh 200
