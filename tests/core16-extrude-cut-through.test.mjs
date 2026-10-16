/**
 * CORE16 residual: extrude cut + through-all must actually cut the solid
 * (store/feature path), not warn without touching geometry.
 * Invalid contour → Formal Traditional Chinese refuse (繁中拒).
 * Complements core16-arb-through-cut (arbPlane worker) with standard-plane
 * + store extrudeSketch coverage (*extrude*cut* / *extrude*through* filenames).
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
const worker = globalThis.__wheelWorker
await worker.ready()
const { useApp } = await import('../src/store.ts')
const { importSTEP, measureVolume } = await import('replicad')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () => useApp.setState({ ...useApp.getInitialState(), appConfirm: async () => true }, true)

const volSTEP = async () => {
  const buf = await worker.exportSTEP()
  if (!buf) return 0
  const shape = await importSTEP(new Blob([buf]))
  try { return measureVolume(shape) } finally { shape.delete() }
}

const plate = {
  id: 'plate',
  type: 'extrude',
  profile: { kind: 'rect', a: [-25, -20], b: [25, 20] },
  height: 10,
  operation: 'new',
} // 50×40×10 = 20000
const hole = { kind: 'circle', c: [0, 0], r: 8 }
const holeArea = Math.PI * 64

test('worker: XY through-cut drills the whole plate (volume drops by πr²·h)', async () => {
  const mesh = await worker.rebuild([
    plate,
    { id: 'cut', type: 'extrude', profile: hole, height: 0, operation: 'cut', through: true, baseZ: 10 },
  ])
  assert.ok(mesh && !(mesh.failed?.length), JSON.stringify(mesh?.failed))
  const v = await volSTEP()
  assert.ok(Math.abs(v - (20000 - holeArea * 10)) < 2, `through-cut volume ${v}`)
})

test('store/feature: applyFeatures through-cut changes body volume', async () => {
  reset()
  assert.equal(await g().applyFeatures([plate], 'plate'), true, g().status)
  const v0 = await volSTEP()
  assert.ok(Math.abs(v0 - 20000) < 1, `seed ${v0}`)
  const ok = await g().applyFeatures([
    ...g().features,
    { id: 'cut1', type: 'extrude', profile: hole, height: 0, operation: 'cut', through: true, baseZ: 10 },
  ], '已切割（布爾減）（貫通）')
  assert.equal(ok, true, g().status)
  assert.doesNotMatch(g().status, /切割沒有|切割没有|体积没有变化|體積沒有變化|結果為空|结果为空/)
  const cut = g().features.find((f) => f.id === 'cut1')
  assert.ok(cut && cut.through === true)
  const v1 = await volSTEP()
  assert.ok(Math.abs(v1 - (20000 - holeArea * 10)) < 2, `through-cut ${v1}`)
})

test('store: datum-plane sketch cut + extent=through changes body (not warn-only)', async () => {
  reset()
  assert.equal(await g().applyFeatures([plate], 'plate'), true, g().status)
  const v0 = await volSTEP()
  g().sketchOnDatumPlane('XY', 10)
  assert.equal(g().mode, 'sketch', g().status)
  useApp.setState({
    sketchShape: null,
    sketchProfiles: [{ type: 'circle', c: [0, 0], r: 8 }],
    skCons: [],
    sketchOp: 'cut',
    extrudeExtent: 'through',
    faceCutThrough: true,
    extrudeHeight: 8,
  })
  await g().extrudeSketch()
  assert.equal(g().mode, 'model', g().status)
  assert.doesNotMatch(g().status, /切割沒有|切割没有|体积没有变化|體積沒有變化/)
  assert.match(g().status, /已切割|貫通|布尔减|布爾減/)
  const cut = g().features.find((f) => f.type === 'extrude' && f.operation === 'cut')
  assert.ok(cut, 'cut feature on timeline')
  assert.equal(cut.through, true, 'through flag persisted')
  const v1 = await volSTEP()
  assert.ok(v1 < v0 - holeArea * 8, `cut must remove material: ${v1} vs ${v0}`)
  assert.ok(Math.abs(v1 - (20000 - holeArea * 10)) < 5, `through hole ≈ ${v1}`)
})

test('invalid contour: open poly Formal TC refuse; features unchanged', async () => {
  reset()
  assert.equal(
    await g().applyFeatures([{ id: 'B', type: 'prim', shape: 'box', a: 40, b: 30, c: 10, op: 'new', cornerOrigin: true }], 'box'),
    true,
    g().status,
  )
  const before = {
    features: structuredClone(g().features),
    undo: g().undoStack.length,
  }
  g().startSketch()
  g().chooseSketchPlane('XY')
  useApp.setState({
    sketchShape: null,
    sketchProfiles: [{ type: 'poly', open: true, pts: [[0, 0], [20, 0], [20, 10]] }],
    skCons: [],
    sketchOp: 'cut',
    extrudeExtent: 'through',
    faceCutThrough: true,
    extrudeHeight: 10,
  })
  await g().extrudeSketch()
  assert.match(g().status, /開放曲線|開放路徑|閉合/)
  assert.doesNotMatch(g().status, /开放曲线|开放路径|闭合/) // no Simplified
  assert.doesNotMatch(g().status, /[A-Za-z]{4,}/) // no English kernel dump
  assert.equal(g().mode, 'sketch', 'stay in sketch after refuse')
  assert.deepEqual(g().features, before.features)
  assert.equal(g().undoStack.length, before.undo)
})

test('empty profile Formal TC refuse before cut', async () => {
  reset()
  g().startSketch()
  g().chooseSketchPlane('XY')
  useApp.setState({
    sketchShape: null,
    sketchProfiles: [],
    skCons: [],
    sketchOp: 'cut',
    extrudeExtent: 'through',
    faceCutThrough: true,
    extrudeHeight: 10,
  })
  await g().extrudeSketch()
  assert.match(g().status, /請先.*輪廓|畫一個輪廓/)
  assert.doesNotMatch(g().status, /请先|轮廓/) // Formal TC, not SC
  assert.equal(g().features.length, 0)
})

test('store/worker source: through-cut path sets through and worker honours it', () => {
  const st = rd('src/store.ts')
  assert.match(st, /through: throughAll \|\| undefined/)
  assert.match(st, /op === 'cut' && throughAll/)
  const w = rd('src/worker/cad.worker.ts')
  assert.match(w, /if \(f\.operation === 'cut' && f\.through\)/)
  assert.match(w, /Through-all|貫通|through/)
})
