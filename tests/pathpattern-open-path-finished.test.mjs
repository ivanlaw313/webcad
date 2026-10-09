// 路徑陣列須接受「已完成草圖」嘅開放折線/樣條做路徑（同 加強筋 287260d 同類 bug）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
await globalThis.__wheelWorker.ready()
const { useApp } = await import('../src/store.ts')
const g = () => useApp.getState()

const meshVolume = (m) => {
  const v = m?.vertices, t = m?.triangles ?? m?.indices
  if (!v || !t) return NaN
  let vol = 0
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3
    vol += (v[a] * (v[b + 1] * v[c + 2] - v[b + 2] * v[c + 1]) - v[a + 1] * (v[b] * v[c + 2] - v[b + 2] * v[c]) + v[a + 2] * (v[b] * v[c + 1] - v[b + 1] * v[c])) / 6
  }
  return Math.abs(vol)
}

async function boxPlusFinishedPath(pts = [[0, 0], [150, 0]]) {
  useApp.setState(useApp.getInitialState(), true)
  g().startSketch(); g().chooseSketchPlane('XY')
  useApp.setState({ sketchShape: { type: 'rect', a: [-10, -10], b: [10, 10] }, sketchProfiles: [], skCons: [] })
  await g().extrudeSketch(10)
  assert.ok(g().features.some(f => f.type === 'extrude' || f.type === 'extgroup'), g().status)
  g().startSketch(); g().chooseSketchPlane('XY')
  useApp.setState({ polyPts: pts.map(p => [...p]), polyBulges: new Array(pts.length - 1).fill(0), sketchTool: 'polyline' })
  await g().finishOpenPolyline()
  await g().commitStandaloneSketch()
  assert.equal(g().mode, 'model')
  return Object.keys(g().sketchSources).find(k => g().sketchSources[k].shapes.some(s => s.type === 'poly' && (s.open || s.pts?.length === 2)))
}

test('finished open polyline (selected in browser) opens Path Pattern dialog and commits instances', async () => {
  const pathId = await boxPlusFinishedPath()
  assert.ok(pathId)
  const v0 = meshVolume(g().bodyMesh)
  assert.ok(v0 > 1, `seed volume ${v0}`)
  g().setSelSketch(pathId)
  await g().runCommand('pathpattern', '路徑陣列')
  assert.equal(g().featDlg?.kind, 'pathpattern', g().status)
  const pay = g().featDlg.payload
  assert.equal(pay.path.length, 2)
  assert.ok(Math.abs(Math.hypot(pay.path[1][0] - pay.path[0][0], pay.path[1][1] - pay.path[0][1]) - 150) < 1e-6)
  assert.equal(pay.bundle, undefined, 'finished sketch must not be bundled for live restore')
  useApp.setState({ featDlg: { ...g().featDlg, params: { ...g().featDlg.params, count: 3, target: 'body' } } })
  await g().commitFeatDlg()
  const pp = g().features.find(f => f.type === 'pathpattern')
  assert.ok(pp, g().status)
  assert.equal(pp.count, 3)
  const v1 = meshVolume(g().bodyMesh)
  assert.ok(v1 > v0 * 2.5, `volume should grow with instances (${v0} -> ${v1})`)
})

test('finished open path is found without explicit browser selection (latest sketch)', async () => {
  await boxPlusFinishedPath([[0, 0], [60, 0], [60, 60]])
  useApp.setState({ selSketch: null })
  await g().runCommand('pathpattern', '路徑陣列')
  assert.equal(g().featDlg?.kind, 'pathpattern', g().status)
  assert.equal(g().featDlg.payload.path.length, 3)
})

test('live sketch path still bundles for cancel restore', async () => {
  await boxPlusFinishedPath()
  g().startSketch(); g().chooseSketchPlane('XY')
  useApp.setState({ polyPts: [[0, 0], [40, 0]], polyBulges: [0], sketchTool: 'polyline' })
  await g().finishOpenPolyline()
  assert.equal(g().mode, 'sketch')
  await g().runCommand('pathpattern', '路徑陣列')
  assert.equal(g().featDlg?.kind, 'pathpattern', g().status)
  assert.ok(g().featDlg.payload?.bundle?.shapes?.length >= 1)
  assert.ok(Math.abs(g().featDlg.payload.path[1][0] - 40) < 1e-6)
})

test('no path anywhere keeps the honest status', async () => {
  useApp.setState(useApp.getInitialState(), true)
  g().startSketch(); g().chooseSketchPlane('XY')
  useApp.setState({ sketchShape: { type: 'rect', a: [-10, -10], b: [10, 10] }, sketchProfiles: [], skCons: [] })
  await g().extrudeSketch(10)
  await g().runCommand('pathpattern', '路徑陣列')
  assert.equal(g().featDlg, null)
  assert.match(g().status, /路徑陣列需要一條路徑/)
})
