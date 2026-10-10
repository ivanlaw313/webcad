// P2：統一測量面點 → 面積／直徑 Formal Traditional（同狀態列量面）；隱藏組件自動顯示／「請先顯示組件」；組件網格面可讀數。
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
const { combineMeasure } = await import('../src/cad/measureCombine.ts')
const g = () => useApp.getState()
const SC = /面积|圆柱面|圆锥面|环面|[积锥环]/

const BOX = [{ id: 'b', type: 'extrude', profile: { kind: 'rect', a: [0, 0], b: [40, 30] }, height: 20, operation: 'new' }]

test('combine + status-measure style: planar face → 面積; cylinder → 圓柱面直徑Ø (Formal Traditional)', () => {
  const p = combineMeasure([{ kind: 'face', area: 1200, surfType: 'PLANE' }])
  assert.equal(p.type, 'area'); assert.equal(p.label, '面積'); assert.ok(!SC.test(p.label))
  const c = combineMeasure([{ kind: 'face', area: 1884, radius: 15, surfType: 'CYLINDRE' }])
  assert.equal(c.type, 'length'); assert.match(c.label, /圓柱面直徑Ø/); assert.equal(c.value, 30)
  assert.ok(!SC.test(c.label))
})

test('store: measure tool face click on active solid shows area readout (Formal Traditional)', async () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  assert.ok(await g().applyFeatures(BOX, 'box'))
  useApp.setState({ measureUniMode: true, measureSelFilter: { face: true, edge: true, body: true, sketch: true }, measureUniPicks: [], measureUniResult: null })
  // top face center CAD (20,15,20) → three (20,20,-15)
  await g().pickMeasureUniAt([20, 20, -15], [0, 1, 0], false)
  const r = g().measureUniResult
  assert.ok(r, 'expected face readout')
  assert.equal(r.type, 'area')
  assert.equal(r.label, '面積')
  assert.ok(r.value != null && r.value > 1000, `area ${r.value}`)
  assert.match(g().status, /面積/)
  assert.ok(!SC.test(g().status + r.label))
})

test('store: pickMeasureUniFromMesh on box side → 面積 Formal Traditional', async () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  assert.ok(await g().applyFeatures(BOX, 'box'))
  const mesh = g().bodyMesh
  assert.ok(mesh?.triangles?.length)
  // find a triangle roughly on +X face (x≈40)
  let fi = 0
  for (let t = 0; t < mesh.triangles.length / 3; t++) {
    const ia = mesh.triangles[t * 3] * 3, ib = mesh.triangles[t * 3 + 1] * 3, ic = mesh.triangles[t * 3 + 2] * 3
    const ax = (mesh.vertices[ia] + mesh.vertices[ib] + mesh.vertices[ic]) / 3
    if (ax > 39) { fi = t; break }
  }
  useApp.setState({ measureUniMode: true, measureUniPicks: [], measureUniResult: null })
  g().pickMeasureUniFromMesh(mesh, fi, [40, 10, -15], [1, 0, 0])
  const r = g().measureUniResult
  assert.ok(r && r.type === 'area', JSON.stringify(r))
  assert.equal(r.label, '面積')
  assert.ok(Math.abs(r.value - 600) < 5, `side area ~600 got ${r.value}`)
  assert.ok(!SC.test(r.label + (g().status || '')))
})

test('store: hidden component → auto-show with 「請先顯示組件」 status (no silent empty readout)', () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  const id = 'c-hidden'
  useApp.setState({
    measureUniMode: true,
    components: [{ id, name: '隱藏件', hidden: true, pos: [0, 0, 0], mesh: { vertices: [0, 0, 0, 10, 0, 0, 0, 10, 0], triangles: [0, 1, 2], normals: [0, 0, 1, 0, 0, 1, 0, 0, 1] } }],
    selectedComponent: id,
    measureUniPicks: [],
    measureUniResult: null,
  })
  const mesh = g().components[0].mesh
  g().pickMeasureUniFromMesh(mesh, 0, [3, 3, 0], [0, 0, 1], { compId: id })
  assert.equal(g().measureUniResult, null, 'first click only reveals')
  assert.match(g().status, /請先顯示組件/)
  assert.equal(g().components.find((c) => c.id === id).hidden, false)
  // second click → readout
  g().pickMeasureUniFromMesh(mesh, 0, [3, 3, 0], [0, 0, 1], { compId: id })
  assert.ok(g().measureUniResult?.type === 'area')
})

test('Viewport wires measureUni on frozen components (compCmdArmed + pickMeasureUniFromMesh)', () => {
  const src = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
  assert.match(src, /measureAngleMode \|\| measureUniMode/)
  assert.match(src, /pickMeasureUniFromMesh\(mesh, e\.faceIndex/)
  assert.match(src, /measureUniMode && frozen && compId/)
})

test('measureFaceAt status strings are Formal Traditional (平面／圓柱面／面積)', async () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  assert.ok(await g().applyFeatures(BOX, 'box'))
  g().toggleMeasureFace()
  await g().measureFaceAt([20, 20, -15])
  assert.match(g().measureFaceInfo || '', /平面：面積|面積/)
  assert.ok(!/面积|圆柱面|圆锥面|环面/.test(g().measureFaceInfo || ''))
  assert.equal(g().lastMeasure?.label, '面積')
})
