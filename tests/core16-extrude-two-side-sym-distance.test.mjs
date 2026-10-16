/**
 * CORE16 residual more10: Extrude Two Sides / Symmetric distance gates.
 * Illegal 0 (and near-zero) → Formal 繁中拒; legal distances apply volume.
 * Complements core16-extrude-distance-gate (single-side + side2=0 snippet) with
 * full symmetric + twosides refuse/apply matrix.
 * Product: setExtrudeSide2(0) must NOT coerce to 10; Formal TC red alert + okDisabled.
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

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () => useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
const vol = async () => {
  const buf = await globalThis.__wheelWorker.exportSTEP()
  if (!buf) return 0
  const shape = await importSTEP(new Blob([buf]))
  try { return measureVolume(shape) } finally { shape.delete() }
}
const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/
const SC = /请输入非零|距离不可为|第二侧/

function seedSketchRect() {
  g().startSketch()
  g().chooseSketchPlane('XY')
  useApp.setState({
    sketchShape: { type: 'rect', a: [-10, -10], b: [10, 10] },
    sketchProfiles: [],
    skCons: [],
    sketchOp: 'new',
    extrudeDlgOpen: true,
  })
}

test('source: symmetric + twosides share Formal zero gate (commit + Viewport alert)', () => {
  const st = rd('src/store.ts')
  const vp = rd('src/components/Viewport.tsx')
  // Commit gate covers distance | symmetric | twosides for side1/height
  assert.match(st, /\['distance', 'symmetric', 'twosides'\]\.includes\(get\(\)\.extrudeExtent\)/)
  assert.match(st, /請輸入非零拉伸距離/)
  // Twosides side2 dedicated Formal refuse
  assert.match(st, /請輸入有限非零的第二側拉伸距離/)
  assert.doesNotMatch(st, /请输入有限非零的第二侧/)
  // setExtrudeSide2 must keep 0 (no silent coerce to 10)
  assert.match(st, /setExtrudeSide2:\s*\(n\)\s*=>\s*set\(\{ extrudeSide2:\s*Number\.isFinite\(n\)\s*\?\s*Math\.abs\(n\)\s*:\s*0 \}\)/)
  assert.doesNotMatch(st, /setExtrudeSide2:[^\n]*:\s*10 \}/)
  // Viewport alert + okDisabled include symmetric/twosides height + side2
  assert.match(vp, /data-testid="extrude-zero-alert"/)
  assert.match(vp, /data-testid="extrude-side2-zero-alert"/)
  assert.match(vp, /\['distance', 'symmetric', 'twosides'\]\.includes\(extrudeExtent\) && !\(Math\.abs\(extrudeHeight\) > 1e-6\)/)
  // FISHING35: side2 zero gate uses draft IIFE (extrudeSide2Txt), not bare extrudeSide2
  assert.match(vp, /extrudeSide2Txt/)
  assert.match(vp, /extrudeExtent === 'twosides' && \(\(\) => \{[\s\S]*?extrudeSide2Txt[\s\S]*?!\(Math\.abs\(v\) > 1e-6\)/)
  assert.match(vp, /距離不可為 0 — 請輸入非零距離（負數＝反方向）/)
  assert.match(vp, /第二側距離不可為 0 — 請輸入非零距離/)
  assert.doesNotMatch(vp, /距离不可为 0/)
})

test('runtime: symmetric height 0 → Formal 繁中拒; sketch kept, no feature', async () => {
  reset()
  seedSketchRect()
  useApp.setState({ extrudeExtent: 'symmetric', extrudeHeight: 0, symMeasure: 'whole' })
  const before = { features: structuredClone(g().features), undo: g().undoStack.length }
  await g().extrudeSketch()
  assert.match(g().status, /請輸入非零拉伸距離|距離不可為 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, SC)
  assert.equal(g().mode, 'sketch')
  assert.deepEqual(g().features, before.features)
  assert.equal(g().undoStack.length, before.undo)
  assert.equal(g().features.some((f) => f.type === 'extrude'), false)
})

test('runtime: twosides side1=0 → Formal refuse (same height gate)', async () => {
  reset()
  seedSketchRect()
  useApp.setState({ extrudeExtent: 'twosides', extrudeHeight: 0, extrudeSide2: 8 })
  const n0 = g().features.length
  await g().extrudeSketch()
  assert.match(g().status, /請輸入非零拉伸距離|距離不可為 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.equal(g().features.length, n0)
  assert.equal(g().mode, 'sketch')
})

test('runtime: twosides side2=0 → Formal 第二側 refuse; no feature', async () => {
  reset()
  seedSketchRect()
  useApp.setState({ extrudeExtent: 'twosides', extrudeHeight: 10, extrudeSide2: 10 })
  g().setExtrudeSide2(0)
  assert.equal(g().extrudeSide2, 0, 'setExtrudeSide2(0) must stay 0 — never coerce to 10')
  const n0 = g().features.length
  await g().extrudeSketch()
  assert.match(g().status, /第二側|非零/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /第二侧/)
  assert.equal(g().features.length, n0)
  assert.equal(g().mode, 'sketch')
  assert.equal(g().extrudeSide2, 0, 'refused commit must leave side2 at 0')
})

test('runtime: legal twosides (10 / 5) applies; volume ≈ side1+side2 span', async () => {
  reset()
  seedSketchRect()
  useApp.setState({ extrudeExtent: 'twosides', extrudeHeight: 10, extrudeSide2: 5 })
  await g().extrudeSketch()
  assert.equal(g().mode, 'model', g().status)
  assert.ok(g().features.some((f) => f.type === 'extrude' || f.type === 'extgroup'), g().status)
  assert.match(g().status, /兩側|側1|側2/)
  assert.doesNotMatch(g().status, /（對稱）/)
  const v = await vol()
  // 20×20 profile × (10+5) total height
  assert.ok(Math.abs(v - 20 * 20 * 15) < 5, `twosides vol ${v}`)
})

test('runtime: legal symmetric whole=20 applies; volume ≈ full span', async () => {
  reset()
  seedSketchRect()
  useApp.setState({ extrudeExtent: 'symmetric', extrudeHeight: 20, symMeasure: 'whole' })
  await g().extrudeSketch()
  assert.equal(g().mode, 'model', g().status)
  assert.ok(g().features.some((f) => f.type === 'extrude' || f.type === 'extgroup'), g().status)
  const v = await vol()
  assert.ok(Math.abs(v - 20 * 20 * 20) < 5, `symmetric whole vol ${v}`)
})

test('runtime: legal symmetric half=10 → total span 20; volume matches', async () => {
  reset()
  seedSketchRect()
  useApp.setState({ extrudeExtent: 'symmetric', extrudeHeight: 10, symMeasure: 'half' })
  await g().extrudeSketch()
  assert.equal(g().mode, 'model', g().status)
  const v = await vol()
  assert.ok(Math.abs(v - 20 * 20 * 20) < 5, `symmetric half→2× vol ${v}`)
})
