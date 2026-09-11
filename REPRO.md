# SIM stale invalidation (BUG-BD-010 / BUG-BD-011)

## Case
Handoff P1「SIM 約束失效標示」— Fixed→Roller or geometry change must mark old FEA results 失效; must not show old colormap as current.

## Root cause
1. `setFeaOpt` was a passthrough (`set(p)`), so Fixed→Roller left `feaResult` live and `FeaOverlay` kept painting the old cloud.
2. Clearing the fixed-face chip only nulled `feaFixed` and left `feaResult`.
3. `bodyMesh` updates (feature rebuild / length edit) never invalidated FEA/mold/wind overlays or set an explicit 失效 status (BUG-BD-011).

## Fix
- `src/simulation/resultValidity.ts` — pure helper: physics-opt detection + invalidate patch (`feaStale` + clear overlays + 失效 status).
- Store: `setFeaOpt` invalidates on physics BC changes; `clearFeaFixed` / `clearFeaLoad`; `bodyMesh` subscribe; successful solve clears `feaStale`.
- Viewport: chips call clear helpers; FEA panel shows ⚠ 結果已失效 banner.

## Tests
```bash
node --experimental-strip-types --import ./tests/register-resolver.mjs --test \
  tests/sim-result-validity.test.mjs tests/sim-stale-invalidation.test.mjs
npm run test:commercial-core
npm run build
```
