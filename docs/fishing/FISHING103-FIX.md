# FISHING103-FIX

## Summary
GcodeBackplot panel header chrome i18n: **en / ja / zh-CN / zh-HK** explicit string tables (JA/EN no longer fall back to TC 關閉預覽 / 切削 legend).
Cherry **more58** (`cdfb9d83` → `bdb9d591`) before nginx.
more59 NOT cherry (F104 — READY `c1c65748`).
Deploy also copies PREV F102 lazy chunks (AeroLab/WindTunnelGpu/autoLoopStore/PhysicsLab + index-DC3XiK2C) into new assets to reduce tip-thrash 404s.

## Announce
- stamp: `v2.20-20261017-014118`
- bundle: `index-OQKjCB7p-r2.js`
- md5: `8d6bf0c2145a9fe963c3c231c9a63c72`
- tip: `TIP_SELF`
- product: `273be406483b88aa16f135ee8ce5a17d81809b6d`
- more58 cherry: `bdb9d591` (from `cdfb9d8368684cf86567a79106e44b217a6bb392`)

## Live after cut
- Tip: `TIP_SELF` (fix/fishing103-behavior-ux → FF fix/sketch-face-copy)
- Product: `273be406483b88aa16f135ee8ce5a17d81809b6d` GcodeBackplot header i18n
- more58 cherry: `bdb9d591`
- Stamp: `v2.20-20261017-014118`
- Bundle: `index-OQKjCB7p-r2.js` (md5 `8d6bf0c2145a9fe963c3c231c9a63c72`)
- Bak: `index-DC3XiK2C-r2.js` / `v2.20-20261017-013313` (F102 kept as PREV) + PREV lazy chunks copied into new assets
- Site: https://cad.neuralworkshk.com/
- APP_VERSION 2.20
- Live bundle **changed** vs F102 `index-DC3XiK2C-r2.js`

## Product changes
| File | Change |
|------|--------|
| `src/components/GcodeBackplot.tsx` | JA/ZH_CN/EN/ZH tables + normalizeLang pick (cutPrefix + deepest + legend + close) |
| `tests/fishing103-gcode-backplot-i18n.test.mjs` | hard asserts |
| `tests/core16-more58-behavior-sample.test.mjs` | cherry more58 (16/16) |

## Kept
- MATERIALS / DENSITY_PREF SC untouched
- F93–F102 demold + WindLegend + SlicePanel + IntroCard + Tour + JointsPanel + JointOriginPalette + PhysicsLab pins kept
- more59 NOT cherry (F104)
- NO Formal chrome soft-pin churn

## Tests
- fishing103 **3/3**; fishing102–93 **3/3**; more58 **16/16**; tsc PASS

## Deploy
- DEPLOY_OK `v2.20-20261017-014118` / `index-OQKjCB7p-r2.js` / md5 `8d6bf0c2145a9fe963c3c231c9a63c72`
- Bak prior live DC3XiK2C / 013313; PREV lazy (F102 AeroLab/WindTunnelGpu/autoLoopStore/PhysicsLab + index-DC3XiK2C) also 200 on new root
