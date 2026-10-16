# FISHING102-FIX

## Summary
PhysicsLab panel title / header chrome i18n: **en / ja / zh-CN / zh-HK** explicit string tables (JA/EN no longer fall back to TC 環境模擬實驗室).
Cherry **more57** (`592342d7` → `ade7a28d`) before nginx.
more58 NOT cherry (F103 — READY `cdfb9d83`).
Deploy also copies PREV F101 lazy chunks (AeroLab/WindTunnelGpu/autoLoopStore/PhysicsLab + index-CmiPgzPU) into new assets to reduce tip-thrash 404s.

## Announce
- stamp: `v2.20-20261017-013313`
- bundle: `index-DC3XiK2C-r2.js`
- md5: `6ef23bb0cee9acd5893413031c1f16ff`
- tip: (branch HEAD after tip-docs)
- product: `aa01e72c0e61e78dfd3dd8840b3a1ccb46c405ef`
- more57 cherry: `ade7a28d` (from `592342d748219a1e37f8de176b758e0066b30bb3`)

## Live after cut
- Tip: (see tip-docs commit)
- Product: `aa01e72c0e61e78dfd3dd8840b3a1ccb46c405ef` PhysicsLab header i18n
- more57 cherry: `ade7a28d`
- Stamp: `v2.20-20261017-013313`
- Bundle: `index-DC3XiK2C-r2.js` (md5 `6ef23bb0cee9acd5893413031c1f16ff`)
- Bak: `index-CmiPgzPU-r2.js` / `v2.20-20261017-012414` (F101 kept as PREV) + PREV lazy chunks copied into new assets
- Site: https://cad.neuralworkshk.com/
- APP_VERSION 2.20
- Live bundle **changed** vs F101 `index-CmiPgzPU-r2.js`

## Product changes
| File | Change |
|------|--------|
| `src/components/PhysicsLab.tsx` | JA/ZH_CN/EN/ZH tables + normalizeLang pick (title + subtitle + play/pause/reset/report/close) |
| `tests/fishing102-physics-lab-i18n.test.mjs` | hard asserts |
| `tests/core16-more57-behavior-sample.test.mjs` | cherry more57 (16/16) |

## Kept
- MATERIALS / DENSITY_PREF SC untouched
- F93–F101 demold + WindLegend + SlicePanel + IntroCard + Tour + JointsPanel + JointOriginPalette pins kept
- more58 NOT cherry (F103)
- NO Formal chrome soft-pin churn

## Tests
- fishing102 **3/3**; fishing101–93 **3/3**; more57 **16/16**; more56 **16/16**; more55 **16/16**; tsc PASS

## Deploy
- DEPLOY_OK `v2.20-20261017-013313` / `index-DC3XiK2C-r2.js` / md5 `6ef23bb0cee9acd5893413031c1f16ff`
- Bak prior live CmiPgzPU / 012414; PREV lazy (F101 AeroLab/WindTunnelGpu/autoLoopStore/PhysicsLab + index-CmiPgzPU) also 200 on new root
