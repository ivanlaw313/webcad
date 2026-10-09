// RETEST19 #1：時間軸上移／下移／拖放唔可以將圓角（邊引用）搬到產生嗰條邊嘅拉伸之前 —— 以前會靜默「消失」。
// Fusion：拒絕並講明依賴；無關嘅移動照准。
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
import test from 'node:test'
import assert from 'node:assert/strict'
import { topoFeaturesToCheck, topoRefsResolvable, isTopoRefFeature } from '../src/cad/featureDeps.ts'
await import('../src/worker/cad.worker.ts'); await globalThis.__wheelWorker.ready()
const { useApp } = await import('../src/store.ts')
const g = () => useApp.getState()
const ids = () => g().features.map((f) => f.id)
const plate = { id: 'e1', type: 'extrude', profile: { kind: 'rect', a: [-30, -20], b: [30, 20] }, height: 12, operation: 'new' }
const hole = { id: 'e2', type: 'extrude', profile: { kind: 'circle', c: [0, 0], r: 5 }, height: 12, operation: 'cut' }
const filOuter = { id: 'f1', type: 'fillet', radius: 2, nears: [[0, 20, 12]] }
const filHole = { id: 'f2', type: 'fillet', radius: 1, nears: [[5, 0, 12]] }

test('pure helpers: which features need checking, edge support on a mesh', () => {
  assert.ok(isTopoRefFeature(filOuter) && !isTopoRefFeature(plate))
  const chk = topoFeaturesToCheck([plate, filOuter], [filOuter, plate])
  assert.deepEqual(chk.map((c) => [c.feature.id, c.lost.map((x) => x.id)]), [['f1', ['e1']]])
  assert.deepEqual(topoFeaturesToCheck([plate, hole, filOuter], [plate, filOuter, hole]).map((c) => c.feature.id), ['f1'])
  assert.equal(topoFeaturesToCheck([plate, hole, filOuter], [hole, plate, filOuter]).length, 0)   // 圓角前置集合冇變
  assert.equal(topoRefsResolvable(filOuter, null), false)                                        // 前面冇實體
})

test('move fillet up above its extrude (button, moveFeature, drag index) → refused, order + geometry unchanged', async () => {
  assert.ok(await g().applyFeatures([plate, filOuter], 'x'))
  const tris = g().mesh?.triangles.length
  assert.equal(await g().reorderFeature('f1', 0), false)
  assert.match(g().status, /不能移動：「.*」引用的邊線／幾何由「.*」產生，必須排在它之後/)
  assert.deepEqual(ids(), ['e1', 'f1'])
  await g().moveFeature('f1', -1)
  assert.deepEqual(ids(), ['e1', 'f1'])
  assert.match(g().status, /不能移動/)
  // 拖放：將拉伸拖到圓角之後（Timeline drop → reorderFeature(id, index)）
  assert.equal(await g().reorderFeature('e1', 1), false)
  assert.deepEqual(ids(), ['e1', 'f1'])
  assert.equal(g().mesh?.triangles.length, tris)
})

test('fillet on the hole edge cannot move before the hole; fillet on the outer edge can', async () => {
  assert.ok(await g().applyFeatures([plate, hole, filHole], 'x'))
  assert.equal(await g().reorderFeature('f2', 1), false)
  assert.deepEqual(ids(), ['e1', 'e2', 'f2'])
  assert.match(g().status, /不能移動/)
  assert.ok(await g().applyFeatures([plate, hole, filOuter], 'x'))
  assert.equal(await g().reorderFeature('f1', 1), true)
  assert.deepEqual(ids(), ['e1', 'f1', 'e2'])
  assert.match(g().status, /已上移/)
  assert.equal(g().failedFeatureIds.length, 0)
})
