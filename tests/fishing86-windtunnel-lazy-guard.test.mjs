/**
 * FISHING86: WindTunnelGpu / WindObjectGizmo lazy imports must guard missing .default
 * (stale-tab / 404 chunk → no Viewport crash reading 'default').
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('FISHING86 WindTunnelGpuLazy guards missing default / catch', () => {
  const vp = read('src/components/Viewport.tsx')
  assert.match(vp, /const WindTunnelGpuLazy = lazy\(async \(\) =>/)
  assert.match(vp, /import\('\.\/WindTunnelGpu'\)/)
  assert.match(vp, /typeof C === 'function'/)
  assert.match(vp, /WindTunnelGpuChunkFallback/)
  assert.doesNotMatch(vp, /const WindTunnelGpuLazy = lazy\(\(\) => import\('\.\/WindTunnelGpu'\)\)/)
})

test('FISHING86 WindObjectGizmoLazy same guard', () => {
  const vp = read('src/components/Viewport.tsx')
  assert.match(vp, /const WindObjectGizmoLazy = lazy\(async \(\) =>/)
  assert.match(vp, /WindObjectGizmoChunkFallback/)
  assert.doesNotMatch(vp, /const WindObjectGizmoLazy = lazy\(\(\) => import\('\.\/WindObjectGizmo'\)\)/)
})

test('FISHING86 CurvatureAnalysisOverlays FISHING35 guard kept; MATERIALS SC', () => {
  const vp = read('src/components/Viewport.tsx')
  const st = read('src/store.ts')
  assert.match(vp, /FISHING35: React\.lazy does module\.default/)
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
})
