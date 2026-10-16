/**
 * CORE16 residual more6: Extrude (拉伸) distance gate + cut-miss warning.
 * dist 0 → Formal 繁中拒; cut that does not touch solid → 繁中/警告 assertion (not silent).
 * Complements core16-extrude-cut-through / core16-arb-through-cut without re-testing through-cut volume.
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
const { importSTEP, measureVolume } = await import('replicad')
const { includesEither } = await import('./zh-either.mjs')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () => useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
const vol = async () => {
  const buf = await globalThis.__wheelWorker.exportSTEP()
  if (!buf) return 0
  const shape = await importSTEP(new Blob([buf]))
  try { return measureVolume(shape) } finally { shape.delete() }
}

const BOX = { id: 'B', type: 'prim', shape: 'box', a: 40, b: 30, c: 20, op: 'new', cornerOrigin: true }
const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/
const ZERO_ALERT = '距離不可為 0 — 請輸入非零距離（負數＝反方向）'
const ZERO_COMMIT = '請輸入非零拉伸距離'

test('source: extrude dist 0 refuse is Formal 繁中 (Viewport alert + extrudeSketch gate)', () => {
  const st = rd('src/store.ts')
  const vp = rd('src/components/Viewport.tsx')
  assert.match(st, /請輸入非零拉伸距離/)
  assert.match(st, /Math\.abs\(get\(\)\.extrudeHeight\) > 1e-6/)
  assert.match(vp, /data-testid="extrude-zero-alert"/)
  assert.match(vp, /距離不可為 0 — 請輸入非零距離（負數＝反方向）/)
  assert.match(vp, /okDisabled=\{!!numBad \|\| !!extrudeExpressionError \|\| \(busy \|\|/)
  assert.doesNotMatch(vp, /距离不可为 0/)
  assert.doesNotMatch(st, /请输入非零拉伸距离/)
  assert.doesNotMatch(ZERO_ALERT, COLLOQ)
  assert.doesNotMatch(ZERO_COMMIT, COLLOQ)
})

test('source: cut-miss path warns (not silent); pins cutMissed / ⚠ 切割', () => {
  const st = rd('src/store.ts')
  assert.match(st, /const cutMissed = \(op === 'cut' \|\| op === 'intersect'\)/)
  assert.match(st, /_cutFloor/)
  // Must surface a warning string — not silently accept a no-op cut.
  assert.match(st, /cutMissed[\s\S]{0,200}?切割/)
  assert.match(st, /⚠.*切割/)
})

test('runtime: extrudeHeight 0 → Formal 繁中拒; sketch kept, no feature', async () => {
  reset()
  g().startSketch()
  g().chooseSketchPlane('XY')
  useApp.setState({
    sketchShape: { type: 'rect', a: [-10, -10], b: [10, 10] },
    sketchProfiles: [],
    skCons: [],
    sketchOp: 'new',
    extrudeExtent: 'distance',
    extrudeHeight: 0,
    extrudeDlgOpen: true,
  })
  const before = { features: structuredClone(g().features), undo: g().undoStack.length }
  await g().extrudeSketch()
  assert.match(g().status, /請輸入非零拉伸距離|距離不可為 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /请输入非零|距离不可为/)
  assert.equal(g().mode, 'sketch', 'stay in sketch after refuse')
  assert.deepEqual(g().features, before.features)
  assert.equal(g().undoStack.length, before.undo)
  assert.equal(g().features.some((f) => f.type === 'extrude'), false)
})

test('runtime: legal extrude distance grows volume (gate not over-blocking)', async () => {
  reset()
  g().startSketch()
  g().chooseSketchPlane('XY')
  useApp.setState({
    sketchShape: { type: 'rect', a: [-10, -10], b: [10, 10] },
    sketchProfiles: [],
    skCons: [],
    sketchOp: 'new',
    extrudeExtent: 'distance',
    extrudeHeight: 15,
    extrudeDlgOpen: true,
  })
  await g().extrudeSketch()
  assert.equal(g().mode, 'model', g().status)
  assert.ok(g().features.some((f) => f.type === 'extrude'), g().status)
  const v = await vol()
  assert.ok(Math.abs(v - 20 * 20 * 15) < 2, `legal extrude vol ${v}`)
})

test('runtime: cut that does not touch solid → warning (not silent); volume/features unchanged', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const v0 = await vol()
  const n0 = g().features.length
  // Profile far outside the box — cut extrusion never intersects material.
  g().sketchOnDatumPlane('XY', 10)
  useApp.setState({
    sketchShape: null,
    sketchProfiles: [{ type: 'circle', c: [200, 200], r: 5 }],
    skCons: [],
    sketchOp: 'cut',
    extrudeExtent: 'distance',
    extrudeHeight: 10,
    extrudeFlip: false,
    extrudeDlgOpen: true,
  })
  await g().extrudeSketch()
  const st = g().status || ''
  assert.match(st, /⚠/)
  // Either-script: product source still has SC in this toast (reported separately as bug A).
  assert.ok(
    includesEither(st, '切割没有接触到实体') || includesEither(st, '体积没有变化') || /切割.*接觸|體積.*變化|切割沒有/.test(st),
    `expected cut-miss warning, got: ${st}`,
  )
  assert.doesNotMatch(st, /已切割（布爾減）/)
  assert.equal(g().features.length, n0, 'no cut feature added')
  assert.ok(Math.abs((await vol()) - v0) < 1e-3, 'volume unchanged after miss')
  // Sketch retained for retry (product contract).
  assert.ok(g().sketchProfiles?.length || g().sketchShape || g().mode === 'sketch' || /草圖已保留|草图已保留/.test(st), st)
})

test('runtime: twosides second distance 0 → Formal refuse', async () => {
  reset()
  g().startSketch()
  g().chooseSketchPlane('XY')
  useApp.setState({
    sketchShape: { type: 'circle', c: [0, 0], r: 8 },
    sketchProfiles: [],
    skCons: [],
    sketchOp: 'new',
    extrudeExtent: 'twosides',
    extrudeHeight: 10,
    extrudeSide2: 0,
    extrudeDlgOpen: true,
  })
  const n0 = g().features.length
  await g().extrudeSketch()
  assert.match(g().status, /第二側|非零/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.equal(g().features.length, n0)
  assert.equal(g().mode, 'sketch')
})
