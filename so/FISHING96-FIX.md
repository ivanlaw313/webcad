# FISHING96-FIX

## Summary
WindLegend / WindPoseCompare UI chrome: **en / ja / zh-CN / zh-HK** explicit string tables (JA no longer falls back to TC 風洞圖例／風洞位姿比較).
Cherry **more51** (`c1b4b923` → `1de280ae`) before nginx.
more52 NOT cherry (F97).

## Announce
- stamp: `v2.20-20261017-004527`
- bundle: `index-CGLkCiJB-r2.js`
- md5: `e360d917285559753a4ee24ee8ea9aad`
- tip: `11177189fb37e7254d957986b8bd364b8aa93a00`
- product: `7c066f69e0acd3a2fa6dd24091dcd6c7243dc2e7`
- more51 cherry: `1de280ae6f7981ee87d280d7ad16156cf2f0e0ee`

## Live after cut
- Tip: `11177189fb37e7254d957986b8bd364b8aa93a00` (fix/fishing96-behavior-ux → FF fix/sketch-face-copy)
- Product: `7c066f69e0acd3a2fa6dd24091dcd6c7243dc2e7` WindLegend/WindPoseCompare i18n
- more51 cherry: `1de280ae6f7981ee87d280d7ad16156cf2f0e0ee` (from `c1b4b923`)
- Stamp: `v2.20-20261017-004527`
- Bundle: `index-CGLkCiJB-r2.js` (md5 `e360d917285559753a4ee24ee8ea9aad`)
- Bak: `index-DQ6jCzSu-r2.js` / `v2.20-20261017-003921` (F95 kept as PREV)
- Site: https://cad.neuralworkshk.com/
- APP_VERSION 2.20
- Live bundle **changed** vs F95 `index-DQ6jCzSu-r2.js`

## Product changes
| File | Change |
|------|--------|
| `src/components/WindLegend.tsx` | JA/ZH_CN tables + normalizeLang pick |
| `src/components/WindPoseCompare.tsx` | JA/ZH_CN tables + normalizeLang pick |
| `tests/fishing96-wind-legend-i18n.test.mjs` | hard asserts |
| `tests/core16-more51-behavior-sample.test.mjs` | cherry more51 (16/16) |

## Kept
- MATERIALS / DENSITY_PREF SC untouched
- F93–F95 demold catalog/prefix/close pins kept
- poseCompare.ts note/areaNote/reason stay source Chinese (solver honesty copy)
- more52 NOT cherry

## Tests
- fishing96 **3/3**; fishing95–86 **3/3**; more50/51 **16/16**; tsc PASS

## Deploy
- DEPLOY_OK `v2.20-20261017-004527` / `index-CGLkCiJB-r2.js` / md5 `e360d917285559753a4ee24ee8ea9aad`
- Bak prior live DQ6jCzSu / 003921; live 200 + WindTunnelGpu 200
