# FISHING86-FIX

## Summary
**P1 resilience:** WindTunnelGpu / WindObjectGizmo `React.lazy` now guards missing `.default` (FISHING35 pattern).
F81 recheck crash was stale-tab 404 `WindTunnelGpu-Cn07ATH9.js` → `reading 'default'`. Live chunk already 200 on tip; guard prevents Viewport ErrorBoundary on future cut/stale tabs.

## Live after cut
- Tip: `7fdb2869b6b727e4a276bd7a3cf1ab5aebbac104` (fix/fishing86-behavior-ux → FF fix/sketch-face-copy)
- Stamp: `v2.20-20261016-233223`
- Bundle: `index-BdZ38Vhs-r2.js` (md5 `abd86b12fe6e0417d2be9dfe31622e3e`)
- Bak: `index-lwNuJHc--r2.js` / `v2.20-20261016-232559` (kept)
- Site: https://cad.neuralworkshk.com/
- APP_VERSION 2.20
- more43 cherry: **no** (absent → F87)

## Product changes
| File | Change |
|------|--------|
| `src/components/Viewport.tsx` | WindTunnelGpuLazy + WindObjectGizmoLazy safe lazy |
| `tests/fishing86-windtunnel-lazy-guard.test.mjs` | hard asserts |

## Note on F81 404
- Live F85 stamp already served `WindTunnelGpu-Dwy3BQKa.js` **200**; `Cn07ATH9` 404 = old hash after cut (expected).
- This wave hardens so a miss no longer crashes Viewport.

## Kept
- MATERIALS / DENSITY_PREF SC keys untouched
- No tip Formal invent / Formal chrome soft
- more43 absent → defer F87

## Tests
- fishing86-windtunnel-lazy-guard 3/3 PASS
- fishing85-chongfu-formal 3/3 PASS
- tsc --noEmit PASS

## Deploy
- Bak prior live lwNuJHc- / 232559
- Soft-prep: more43 absent → no cherry before nginx
- Post-cut: verify WindTunnelGpu-*.js HTTP 200
