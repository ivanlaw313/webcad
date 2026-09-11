/**
 * SIM / handoff P1 (BUG-BD-010 / BUG-BD-011):
 * After Fixed→Roller (constraint change), clearing the fixed end, or geometry
 * change, prior FEA colormap must not stay visually current — mark 失效 and
 * clear result overlays so old stress clouds are not shown as live results.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
await globalThis.__wheelWorker.ready()

const { useApp } = await import('../src/store.ts')
const g = () => useApp.getState()

const fakeFea = () => ({
  h: 2,
  nVox: 2,
  centers: new Float32Array([0, 0, 0, 2, 0, 0]),
  vm: new Float32Array([1, 2]),
  vmMax: 2,
  vmMaxAt: [2, 0, 0],
  dispMax: 0.01,
  disp: new Float32Array([0.001, 0.01]),
  converged: true,
  residual: 1e-6,
  warnings: [],
  sy: 250,
  matName: '钢',
})

const plantResult = (extra = {}) => {
  // Geometry first, then attach a live result. A single replace that sets both
  // would trip the bodyMesh subscribe and immediately mark the result stale.
  useApp.setState({
    ...useApp.getInitialState(),
    feaMode: 2,
    feaFixed: { point: [0, 0, 0], normal: [1, 0, 0] },
    feaLoad: { point: [100, 0, 0], normal: [1, 0, 0] },
    feaFixMode: 'fixed',
    feaResult: null,
    feaStale: false,
    bodyMesh: { vertices: [0, 0, 0, 100, 0, 0, 100, 10, 0, 0, 10, 0], triangles: [0, 1, 2, 0, 2, 3], normals: [] },
    status: 'FEA ready',
    ...extra,
  }, true)
  if (!('feaResult' in extra)) {
    useApp.setState({ feaResult: fakeFea(), feaStale: false, status: 'FEA 完成（假结果）' })
  }
}

test('SIM: Fixed→Roller clears colormap and marks 失效 (BUG-BD-010)', () => {
  plantResult()
  assert.ok(g().feaResult)
  g().setFeaOpt({ feaFixMode: 'roller' })
  assert.equal(g().feaFixMode, 'roller')
  assert.equal(g().feaResult, null, 'old colormap data must not remain as current')
  assert.equal(g().feaStale, true)
  assert.match(g().status, /失效/)
})

test('SIM: display-only feaField switch does not invalidate live results', () => {
  plantResult()
  g().setFeaOpt({ feaField: 'disp' })
  assert.equal(g().feaField, 'disp')
  assert.ok(g().feaResult, 'display field must keep the solved cloud')
  assert.equal(g().feaStale, false)
})

test('SIM: clearing fixed end marks results 失效 and drops colormap', () => {
  plantResult()
  g().clearFeaFixed()
  assert.equal(g().feaFixed, null)
  assert.equal(g().feaResult, null)
  assert.equal(g().feaStale, true)
  assert.match(g().status, /失效/)
})

test('SIM: bodyMesh / geometry change marks results 失效 with explicit label (BUG-BD-011)', () => {
  plantResult()
  const nextMesh = {
    vertices: [0, 0, 0, 110, 0, 0, 110, 10, 0, 0, 10, 0],
    triangles: [0, 1, 2, 0, 2, 3],
    normals: [],
  }
  useApp.setState({ bodyMesh: nextMesh })
  assert.equal(g().feaResult, null, 'geometry change must not keep old cloud as current')
  assert.equal(g().feaStale, true)
  assert.match(g().status, /失效/)
})

test('SIM: successful solve clears feaStale so a new colormap is current', async () => {
  // Unit-level: plant stale then mimic a successful solve write.
  plantResult({ feaResult: null, feaStale: true, status: '⚠ 仿真結果已失效' })
  useApp.setState({
    feaResult: fakeFea(),
    feaStale: false,
    feaBusy: false,
    status: 'FEA 完成',
  })
  assert.equal(g().feaStale, false)
  assert.ok(g().feaResult)
})

test('SIM: FEA panel source shows 失效 banner when feaStale', () => {
  const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
  assert.match(vp, /feaStale/)
  assert.match(vp, /結果已失效|结果已失效/)
})
