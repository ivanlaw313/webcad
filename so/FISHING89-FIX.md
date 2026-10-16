# FISHING89-FIX

## Summary
Genuine product: **AeroLabPreview** uses `aeroLabPreviewLazySafe` (F86/F88 pattern — no `reading 'default'` on 404).
i18n SC/TC leftover EN: `可达性分析` / `可達性分析` → **Demold Accessibility** (ribbon already 脫模可達性).
Cherry **more44** CORE16 sample (`bac7f41a` → `4073d18e`) before nginx.

## Live after cut
- Tip: `f23e2fb367052a60ec986dbd0f87474f7c1152d2` (fix/fishing89-behavior-ux → FF fix/sketch-face-copy)
- Product: `f23e2fb367052a60ec986dbd0f87474f7c1152d2` AeroLabPreview lazySafe + Demold Accessibility EN
- more44 cherry: `f23e2fb367052a60ec986dbd0f87474f7c1152d2` (from `bac7f41a` on test/unit-core16-more44)
- Stamp: `v2.20-20261016-235705`
- Bundle: `index-Do4BZCUk-r2.js` (md5 `705b7c928b05112df124b4cbc55b4f8f`)
- Bak: `index-BPlnpMNW-r2.js` / `v2.20-20261016-234555` (F88 kept as PREV)
- Site: https://cad.neuralworkshk.com/
- APP_VERSION 2.20
- Live bundle **changed** vs F88 `index-BPlnpMNW-r2.js`

## Product changes
| File | Change |
|------|--------|
| `src/components/AeroLab.tsx` | aeroLabPreviewLazySafe (try/catch + typeof default === function → ChunkFallback null) |
| `src/i18n.ts` | `可达性分析`/`可達性分析` EN → Demold Accessibility |
| `tests/fishing89-aerolab-lazy-guard.test.mjs` | hard asserts |
| `tests/core16-more44-behavior-sample.test.mjs` | cherry more44 (16/16) |

## Kept
- MATERIALS / DENSITY_PREF SC keys untouched
- No tip Formal invent / Formal chrome soft
- F85 Formal pins / F86 WindTunnel guards / F88 App lazySafe kept

## Tests
- fishing89-aerolab-lazy-guard **3/3** PASS
- fishing88-lazy-draft-formal **3/3** PASS
- fishing86-windtunnel-lazy-guard **3/3** PASS
- core16-more44-behavior-sample **16/16** PASS
- tsc --noEmit PASS (flock)

## Deploy
- DEPLOY_OK `v2.20-20261016-235705` / `index-Do4BZCUk-r2.js` / md5 `705b7c928b05112df124b4cbc55b4f8f`
- Bak prior live BPlnpMNW / 234555
- gzip + brotli; nginx root swap; live index + entry + WindTunnelGpu 200
