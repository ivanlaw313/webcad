// FISHING12 P2：統一測量 — ① 兩圓柱面（兩孔／兩軸，含獨立實體與組件網格）出「軸距」；
// ② 兩平行平面相距 30 → 精確 30.00（B-rep 平面距離，唔係網格取樣最短距離）；③ 圓柱側面面積 = B-rep 精確（≈9.4 cm²，唔係 0.4）。
import test from 'node:test'; import assert from 'node:assert/strict'; import { register, createRequire } from 'node:module'; import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts'); const w = globalThis.__wheelWorker; await w.ready()
const { useApp } = await import('../src/store.ts')
const { combineMeasure } = await import('../src/cad/measureCombine.ts')
const { measureMeshFace } = await import('../src/cad/meshFaceMeasure.ts')
const g = () => useApp.getState()
const near = (a, b, t = 1e-6) => assert.ok(Math.abs(a - b) <= t, `${a} != ${b} (±${t})`)
const SC = /[两个这为没对实测选边线点简离积长径补坐组拣揀唔嘅咗喺]/
const reset = () => useApp.setState({ ...useApp.getInitialState() }, true)
// CAD → three：(x, z, −y)
const T3 = (p) => [p[0], p[2], -p[1]]
const CYL_AREA = Math.PI * 10 * 30   // Ø10 × 30 側面 = 942.48 mm² ≈ 9.4 cm²
// 60×40×30 原語方塊＋兩個 Ø10 通孔（X=15 / X=45）
const PLATE = [
  { id: 'p', type: 'prim', shape: 'box', a: 60, b: 40, c: 30, cornerOrigin: true },
  { id: 'h1', type: 'hole', kind: 'simple', center: [15, 20], top: 30, diameter: 10, through: true, depth: 30, extent: 'through-all' },
  { id: 'h2', type: 'hole', kind: 'simple', center: [45, 20], top: 30, diameter: 10, through: true, depth: 30, extent: 'through-all' },
]
const uni = () => useApp.setState({ measureUniMode: true, measureSelFilter: { face: true, edge: false, body: false, sketch: false }, measureUniPicks: [], measureUniResult: null })

test('worker: hole wall area is the exact B-rep area; face-face uses the true faces', async () => {
  reset(); assert.ok(await g().applyFeatures(PLATE, 'plate'))
  const c = await w.measureFaceAt([10, 20, 15])
  assert.match(c.kind, /CYLIND/i); near(c.radius, 5); near(c.area, CYL_AREA, 1e-6)
  const top = await w.measureFaceAt([30, 5, 30]); near(top.area, 60 * 40 - 2 * Math.PI * 25, 1e-6)
})

test('store: two hole walls on a primitive → 軸距 30.00 (Formal TC)', async () => {
  reset(); assert.ok(await g().applyFeatures(PLATE, 'plate')); uni()
  await g().pickMeasureUniAt(T3([10, 20, 15]), [1, 0, 0], false)
  assert.equal(g().measureUniResult.label, '圓柱面直徑Ø'); near(g().measureUniResult.value, 10); near(g().measureUniResult.area, CYL_AREA, 1e-6)
  await g().pickMeasureUniAt(T3([40, 20, 15]), [1, 0, 0], false)
  const r = g().measureUniResult
  assert.equal(r.label, '軸距（平行軸）'); near(r.value, 30, 1e-9); near(r.minDist, 20, 1e-6)
  assert.match(g().status, /軸距（平行軸） 30/); assert.ok(!SC.test(g().status + r.label + r.note))
})

test('store: parallel planar faces 30 mm apart → exactly 30.00, repeatable (not 31.3 / 28.2)', async () => {
  reset(); assert.ok(await g().applyFeatures(PLATE, 'plate')); uni()
  for (let i = 0; i < 3; i++) {
    useApp.setState({ measureUniPicks: [], measureUniResult: null })
    // 頂面（z=30）同底面（z=0），拾取點橫向錯開
    await g().pickMeasureUniAt(T3([5 + i * 7, 3, 30]), [0, 1, 0], false)
    await g().pickMeasureUniAt(T3([55 - i * 5, 37, 0]), [0, -1, 0], false)
    const r = g().measureUniResult
    assert.equal(r.label, '厚度（面距）'); assert.equal(r.value, 30)
    assert.equal(r.minDist, undefined, 'overlapping parallel faces: no extra min-distance readout')
    assert.match(g().status, /厚度（面距） 30/)
  }
  // 兩側面 y=0 / y=40 → 40
  useApp.setState({ measureUniPicks: [], measureUniResult: null })
  await g().pickMeasureUniAt(T3([30, 0, 15]), [0, 0, 1], false)
  await g().pickMeasureUniAt(T3([30, 40, 15]), [0, 0, -1], false)
  assert.equal(g().measureUniResult.value, 40)
})

test('store: two independent shafts (parked bodies) → B-rep path: 軸距 + exact side area', async () => {
  reset()
  const F = [
    { id: 's1', type: 'extrude', profile: { kind: 'circle', c: [0, 0], r: 5 }, height: 30, operation: 'new' },
    { id: 's2', type: 'extrude', profile: { kind: 'circle', c: [25, 10], r: 5 }, height: 30, operation: 'newbody' },
  ]
  assert.ok(await g().applyFeatures(F, 'shafts'))
  const parked = g().bodyMesh.parked
  assert.equal(parked?.length, 1)
  // newbody 後：s2 係活動實體，s1 泊走做獨立實體 parked[0]
  const side = await w.measureFaceAt([5, 0, 15]); assert.equal(side.body, 0); near(side.area, CYL_AREA, 1e-6)
  uni()
  await g().pickMeasureUniAt(T3([30, 10, 15]), [1, 0, 0], false)
  // 第二支喺獨立實體：Viewport 傳泊車網格 faceIndex → 應改行 B-rep（唔再落 8° 平面泛洪近似）
  const pm = parked[0]
  let fi = -1
  for (let t = 0; t < pm.triangles.length / 3; t++) {
    const a = pm.triangles[t * 3] * 3, z = pm.vertices[a + 2], x = pm.vertices[a]
    const b = pm.triangles[t * 3 + 1] * 3, c = pm.triangles[t * 3 + 2] * 3
    if (Math.abs(pm.vertices[b + 2] - z) + Math.abs(pm.vertices[c + 2] - z) > 1 && x > 4) { fi = t; break }
  }
  assert.ok(fi >= 0)
  await g().pickMeasureUniFromMesh(pm, fi, T3([5, 0, 15]), [1, 0, 0], { parked: 0 })
  const r = g().measureUniResult
  assert.equal(r.label, '軸距（平行軸）'); near(r.value, Math.hypot(25, 10), 1e-9)
  assert.ok(r.parts.every((p) => p.label === '面積')); near(r.parts[1].value, CYL_AREA, 1e-6)
})

// 組件網格（冇內核 B-rep）：用 faceGroups 整個面 + matrixWorld 轉世界座標
function cylMesh(r, h, seg = 24) {
  const vertices = [], triangles = []
  for (let i = 0; i <= seg; i++) { const a = (i / seg) * 2 * Math.PI; vertices.push(r * Math.cos(a), r * Math.sin(a), 0, r * Math.cos(a), r * Math.sin(a), h) }
  for (let i = 0; i < seg; i++) { const k = i * 2; triangles.push(k, k + 2, k + 1, k + 1, k + 2, k + 3) }
  const n = triangles.length
  // 頂蓋（另一個面）
  const base = vertices.length / 3; vertices.push(0, 0, h)
  for (let i = 0; i < seg; i++) triangles.push(base, i * 2 + 1, i * 2 + 3)
  return { vertices, triangles, faceGroups: [{ start: 0, count: n, faceId: 0 }, { start: n, count: triangles.length - n, faceId: 1 }] }
}
// three matrixWorld（column-major）：CAD→three 旋轉 (x,y,z)→(x,z,−y) 再平移 three 世界 (tx,ty,tz)
const mw = (cadT) => { const t = T3(cadT); return [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, t[0], t[1], t[2], 1] }

test('mesh: component cylinder face → whole-face area (≈9.4 cm², not a narrow strip) + world axis', () => {
  const m = cylMesh(5, 30)
  const r = measureMeshFace(m, 3, mw([100, 0, 0]))
  assert.equal(r.surfType, 'CYLINDRE'); near(r.radius, 5, 1e-6)
  near(r.area, CYL_AREA, CYL_AREA * 0.003)
  assert.ok(r.area / 100 > 9.3 && r.area / 100 < 9.5)
  near(r.axisO[0], 100, 1e-6); near(r.axisO[1], 0, 1e-6); near(Math.abs(r.axisD[2]), 1, 1e-9)
  const cap = measureMeshFace(m, m.faceGroups[1].start / 3)
  assert.equal(cap.surfType, 'PLANE'); near(cap.planeO[2], 30, 1e-9)
})

test('mesh: half-cylinder faceGroups (seam-split extrude) are merged into one cylinder area', () => {
  const m = cylMesh(5, 30)
  const n = m.faceGroups[0].count, half = Math.floor(n / 6) * 3
  m.faceGroups = [{ start: 0, count: half, faceId: 0 }, { start: half, count: n - half, faceId: 2 }, m.faceGroups[1]]
  const r = measureMeshFace(m, 0)
  assert.equal(r.surfType, 'CYLINDRE'); near(r.area, CYL_AREA, CYL_AREA * 0.003)
})

test('store: two component shafts with different placements → 軸距 from world axes (not local 同軸)', async () => {
  reset()
  const m = cylMesh(5, 30)
  useApp.setState({ components: [{ id: 'cA', name: '軸A', pos: [0, 0, 0], mesh: m }, { id: 'cB', name: '軸B', pos: [0, 0, 0], mesh: m }] })
  uni()
  await g().pickMeasureUniFromMesh(m, 3, T3([5, 0, 15]), undefined, { compId: 'cA', matrix: mw([0, 0, 0]) })
  assert.equal(g().measureUniResult.label, '圓柱面直徑Ø'); near(g().measureUniResult.area, CYL_AREA, CYL_AREA * 0.003)
  await g().pickMeasureUniFromMesh(m, 3, T3([35, 40, 15]), undefined, { compId: 'cB', matrix: mw([30, 40, 0]) })
  const r = g().measureUniResult
  assert.equal(r.label, '軸距（平行軸）'); near(r.value, 50, 1e-6)
  assert.ok(!SC.test(g().status))
})

test('combine: parallel PLANE picks without analytic data still give exact face distance', () => {
  const r = combineMeasure([{ kind: 'face', surfType: 'PLANE', p: [3, 4, 30], normal: [0, 0, 1] }, { kind: 'face', surfType: 'PLANE', p: [50, 1, 0], normal: [0, 0, -1] }], { faceMinDist: 28.2 })
  assert.equal(r.label, '厚度（面距）'); assert.equal(r.value, 30); assert.equal(r.minDist, undefined)
  const off = combineMeasure([{ kind: 'face', planeO: [0, 0, 30], planeN: [0, 0, 1] }, { kind: 'face', planeO: [0, 0, 0], planeN: [0, 0, -1] }], { faceMinDist: 31.3 })
  assert.equal(off.value, 30); near(off.minDist, 31.3)
})
