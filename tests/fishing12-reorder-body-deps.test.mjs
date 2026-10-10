// FISHING12 P1：孔（及切割／面上凸字刻字／面上螺紋／面上草圖）拖到產生其面嘅原語之前 → 拒絕（Formal TC），
// 順序不變、撤銷堆疊不變；原本有效嘅移動照常允許。
import test from 'node:test'; import assert from 'node:assert/strict'; import { register, createRequire } from 'node:module'; import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts'); const w = globalThis.__wheelWorker; await w.ready()
const { useApp } = await import('../src/store.ts')
const { isBodyDependentFeature, bodyFeaturesToCheck, featureHasEffect, effectLostByMove } = await import('../src/cad/featureDeps.ts')
const g = () => useApp.getState()
const SC = /[这为没对实测选边线点简离积长径补坐组拣揀唔嘅咗喺]/
const ids = () => g().features.map((f) => f.id)
const BOX = { id: 'p', type: 'prim', shape: 'box', a: 20, b: 20, c: 20, cornerOrigin: true }
const HOLE = { id: 'h1', type: 'hole', kind: 'simple', center: [10, 10], top: 20, diameter: 5, through: false, depth: 10, extent: 'distance' }
const reset = () => useApp.setState({ ...useApp.getInitialState() }, true)

test('pure: body-dependent classification (hole / cut / face emboss / face thread / face-bound sketch)', () => {
  assert.equal(isBodyDependentFeature(HOLE), true)
  assert.equal(isBodyDependentFeature({ id: 'c', type: 'extrude', operation: 'cut' }), true)
  assert.equal(isBodyDependentFeature({ id: 'e', type: 'text', text: 'A', op: 'join', arbPlane: { o: [0, 0, 0], xd: [1, 0, 0], n: [0, 0, 1] } }), true)
  assert.equal(isBodyDependentFeature({ id: 't', type: 'othread', d: 10, pitch: 1.5, height: 10 }), true)
  assert.equal(isBodyDependentFeature({ id: 'i', type: 'ithread', d: 10, pitch: 1.5, height: 10 }), true)
  assert.equal(isBodyDependentFeature({ id: 'b', type: 'extrude', operation: 'join', sketchFaceBinding: { sourceId: 'p' } }), true)
  assert.equal(isBodyDependentFeature({ id: 'g', type: 'extgroup', subs: [{ operation: 'cut' }] }), true)
  assert.equal(isBodyDependentFeature(BOX), false)
  assert.equal(isBodyDependentFeature({ id: 'x', type: 'extrude', operation: 'new' }), false)
  assert.equal(isBodyDependentFeature({ id: 'f', type: 'fillet', radius: 1 }), false, 'topo features use the topo probe')
  const chk = bodyFeaturesToCheck([BOX, HOLE], [HOLE, BOX])
  assert.equal(chk.length, 1); assert.equal(chk[0].feature.id, 'h1'); assert.deepEqual(chk[0].lost.map((f) => f.id), ['p'])
  assert.equal(bodyFeaturesToCheck([BOX, HOLE], [BOX, HOLE]).length, 0)
})

test('pure: effect lost detection', () => {
  assert.equal(featureHasEffect({ without: 8000, with: 7804 }), true)
  assert.equal(featureHasEffect({ without: 0, with: 0 }), false)
  assert.equal(effectLostByMove({ without: 8000, with: 7804 }, { without: 0, with: 0 }), true, 'hole on nothing')
  assert.equal(effectLostByMove({ without: 8000, with: 8050 }, { without: 0, with: 50 }), true, 'emboss with no face to sit on')
  assert.equal(effectLostByMove({ without: 8000, with: 7804 }, { without: 9000, with: 9000 }), true, 'cut now misses the body')
  assert.equal(effectLostByMove({ without: 8000, with: 7804 }, { without: 9000, with: 8804 }), false)
  assert.equal(effectLostByMove({ without: 8000, with: 8000 }, { without: 0, with: 0 }), false, 'legacy no-op is not a new violation')
})

test('store: drag hole chip before its own box primitive → refused (Formal TC), order + undo untouched, volume kept', async () => {
  reset()
  assert.ok(await g().applyFeatures([BOX, HOLE], 'box+hole'))
  const v0 = g().bodyMesh.volumeExact
  assert.ok(v0 < 8000 - 1, `hole cut volume ${v0}`)
  const u0 = g().undoStack.length, r0 = g().redoStack.length
  const ok = await g().reorderFeature('h1', 0)
  assert.equal(ok, false)
  assert.equal(g().status, '不能上移：「孔1」引用的面由「原語1」產生，必須排在它之後')
  assert.ok(!SC.test(g().status))
  assert.deepEqual(ids(), ['p', 'h1'])
  assert.equal(g().undoStack.length, u0); assert.equal(g().redoStack.length, r0)
  assert.ok(Math.abs(g().bodyMesh.volumeExact - v0) < 1e-6)
  // 下移原語到孔之後（同一違規，另一方向）
  assert.equal(await g().moveFeature('p', 1), undefined)
  assert.deepEqual(ids(), ['p', 'h1'])
  assert.match(g().status, /^不能下移：「孔1」引用的面由「原語1」產生，必須排在它之後$/)
  assert.equal(g().undoStack.length, u0)
})

test('store: cut extrude before the body it cuts → refused; independent reorder still allowed', async () => {
  reset()
  const F = [
    BOX,
    { id: 'c1', type: 'extrude', profile: { kind: 'circle', c: [5, 5], r: 2 }, height: 30, baseZ: -5, operation: 'cut' },
    { id: 'c2', type: 'extrude', profile: { kind: 'circle', c: [15, 15], r: 2 }, height: 30, baseZ: -5, operation: 'cut' },
  ]
  assert.ok(await g().applyFeatures(F, 'box+2cuts'))
  const v0 = g().bodyMesh.volumeExact
  assert.equal(await g().reorderFeature('c1', 0), false)
  assert.match(g().status, /^不能上移：「.+」引用的面由「原語1」產生，必須排在它之後$/)
  assert.deepEqual(ids(), ['p', 'c1', 'c2'])
  // 兩個獨立切割互換：仍然有效 → 允許
  assert.equal(await g().reorderFeature('c2', 1), true)
  assert.deepEqual(ids(), ['p', 'c2', 'c1'])
  assert.ok(Math.abs(g().bodyMesh.volumeExact - v0) < 1e-3)
})

test('store: hole after two primitives can move between them when it still lands on the first body', async () => {
  reset()
  const F = [BOX, { id: 'p2', type: 'prim', shape: 'box', a: 10, b: 10, c: 10, at: [40, 0, 0], op: 'join', cornerOrigin: true }, HOLE]
  assert.ok(await g().applyFeatures(F, 'two boxes + hole'))
  assert.equal(await g().reorderFeature('h1', 1), true, g().status)
  assert.deepEqual(ids(), ['p', 'h1', 'p2'])
})
