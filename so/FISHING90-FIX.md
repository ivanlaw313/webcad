# FISHING90-FIX

## Summary
Genuine Formal leftover: `zhCNLabels` `可达性分析`/`可達性分析` → **`脱模可达性`** (align with zh-CN locales/cmd; same demold feature as F82/F83/F89).
Cherry **more45** CORE16 sample (`c7d7ebd2` → `f5556d47`) before nginx.
No bare lazy left; more46 NOT cherry.

## Live after cut
- Tip: `83f8f8504e12fe78d2dd5fbdef3e9dc515f15446` (fix/fishing90-behavior-ux → FF fix/sketch-face-copy)
- Product: `709e871744e0f0e7a43bcd71d7f283d6a8a11eeb` zhCNLabels 脱模可达性 Formal leftover
- more45 cherry: `f5556d4766856537eb74b9873d3435e2f768bc03` (from `c7d7ebd2` on test/unit-core16-more45)
- Stamp: `v2.20-20261017-000425`
- Bundle: `index-pMK76hSD-r2.js` (md5 `62fdf98420d98c67c405248d0adb1b2a`)
- Bak: `index-Do4BZCUk-r2.js` / `v2.20-20261016-235705` (F89 kept as PREV)
- Site: https://cad.neuralworkshk.com/
- APP_VERSION 2.20
- Live bundle **changed** vs F89 `index-Do4BZCUk-r2.js`

## Product changes
| File | Change |
|------|--------|
| `src/i18n/zhCNLabels.ts` | `可达性分析`/`可達性分析` → `脱模可达性` |
| `tests/fishing90-demold-zhcn-labels.test.mjs` | hard asserts |
| `tests/core16-more45-behavior-sample.test.mjs` | cherry more45 (16/16) |

## Kept
- MATERIALS / DENSITY_PREF SC keys untouched
- No tip Formal invent / Formal chrome soft
- F86/F88/F89 lazySafe + Demold Accessibility EN kept
- more46 NOT cherry (leave F91/F92)

## Tests
- fishing90-demold-zhcn-labels **3/3** PASS
- fishing89-aerolab-lazy-guard **3/3** PASS
- fishing88-lazy-draft-formal **3/3** PASS
- fishing86-windtunnel-lazy-guard **3/3** PASS
- core16-more44-behavior-sample **16/16** PASS
- core16-more45-behavior-sample **16/16** PASS
- tsc --noEmit PASS (flock)

## Deploy
- DEPLOY_OK `v2.20-20261017-000425` / `index-pMK76hSD-r2.js` / md5 `62fdf98420d98c67c405248d0adb1b2a`
- Bak prior live Do4BZCUk / 235705
- gzip + brotli; nginx root swap; live index + entry + WindTunnelGpu 200
