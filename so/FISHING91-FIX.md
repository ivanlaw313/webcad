# FISHING91-FIX

## Summary
Genuine Formal leftover: `jaLabels` `可达性分析`/`可達性分析` → **`離型到達性`** (JA demold accessibility; trail F82–F90 SC/EN/zhCN).
Cherry **more46** CORE16 sample (`22d41c0b` → `53b7668a`) before nginx.
No clearer P1/P2 crash/404 found during scan — jaLabels is the genuine leftover.
more47 NOT cherry.

## Live after cut
- Tip: `TIP_PENDING` (fix/fishing91-behavior-ux → FF fix/sketch-face-copy)
- Product: `87b9ebc7c0d5991d83101a181fd449e5ce469f5f` jaLabels 離型到達性 Formal leftover
- more46 cherry: `53b7668ae985efa68f6227af4b528f4c227e258d` (from `22d41c0b` on test/unit-core16-more46)
- Stamp: `v2.20-20261017-001016`
- Bundle: `index-Ds0i0Zmi-r2.js` (md5 `e34c0eb3b088a6e8d260631d81745928`)
- Bak: `index-pMK76hSD-r2.js` / `v2.20-20261017-000425` (F90 kept as PREV)
- Site: https://cad.neuralworkshk.com/
- APP_VERSION 2.20
- Live bundle **changed** vs F90 `index-pMK76hSD-r2.js`

## Product changes
| File | Change |
|------|--------|
| `src/i18n/jaLabels.ts` | `可达性分析`/`可達性分析` → `離型到達性` |
| `tests/fishing91-demold-ja-labels.test.mjs` | hard asserts |
| `tests/core16-more46-behavior-sample.test.mjs` | cherry more46 (16/16) |

## Kept
- MATERIALS / DENSITY_PREF SC keys untouched
- No tip Formal invent / Formal chrome soft
- F85–F90 pins (lazySafe, Demold EN, zhCN 脱模可达性) kept
- more47 NOT cherry (leave F92/F93)

## Tests
- fishing91-demold-ja-labels **3/3** PASS
- fishing90-demold-zhcn-labels **3/3** PASS
- fishing89-aerolab-lazy-guard **3/3** PASS
- fishing88-lazy-draft-formal **3/3** PASS
- fishing86-windtunnel-lazy-guard **3/3** PASS
- core16-more44/45/46-behavior-sample **16/16** each PASS
- tsc --noEmit PASS (flock)

## Deploy
- DEPLOY_OK `v2.20-20261017-001016` / `index-Ds0i0Zmi-r2.js` / md5 `e34c0eb3b088a6e8d260631d81745928`
- Bak prior live pMK76hSD / 000425
- gzip + brotli; nginx root swap; live index + entry + WindTunnelGpu 200
