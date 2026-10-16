/**
 * CORE16 residual more14: Timeline drag reorder (Fusion-style chip drop).
 * APIs: store.reorderFeature / moveFeature; Timeline onDrop → reorderFeature(id, i).
 * Complements p1-timeline-reorder-undo / timeline-delete-reorder without re-testing deps pure fns.
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
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () => useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
const ids = () => g().features.map((f) => f.id)

test('source: Timeline drag-drop wires reorderFeature; store exposes API', () => {
  assert.equal(typeof g().reorderFeature, 'function', 'reorderFeature API')
  assert.equal(typeof g().moveFeature, 'function', 'moveFeature API')
  const tl = rd('src/components/Timeline.tsx')
  assert.match(tl, /draggable=\{!commandEditing\}/)
  assert.match(tl, /onDrop=\{[^\n]*reorderFeature\(id, i\)/)
  assert.match(tl, /拖放重排|T2：拖放重排/)
  const st = rd('src/store.ts')
  assert.match(st, /reorderFeature:\s*\(id:\s*string,\s*to:\s*number\)\s*=>\s*Promise<boolean>/)
  assert.match(st, /moveFeature:\s*async\s*\(id,\s*dir\)\s*=>\s*\{[\s\S]{0,200}reorderFeature\(id,\s*i\s*\+\s*dir\)/)
})

test('runtime: legal drag-reorder swap of two fillets → order + one undo; refuse before box', async () => {
  reset()
  const box = { id: 'prim1', type: 'prim', shape: 'box', a: 80, b: 60, c: 40, op: 'new', cornerOrigin: true }
  assert.ok(await g().applyFeatures([box], 'box'), g().status)
  const f1 = { id: 'fil1', type: 'fillet', radius: 3, nears: [[40, 0, 40]] }
  assert.ok(await g().applyFeatures([...g().features, f1], 'f1'), g().status)
  const f2 = { id: 'fil2', type: 'fillet', radius: 5, nears: [[40, 60, 40]] }
  assert.ok(await g().applyFeatures([...g().features, f2], 'f2'), g().status)
  assert.deepEqual(ids(), ['prim1', 'fil1', 'fil2'])
  const u0 = g().undoStack.length

  // refuse: drag fillet before its body (same as drop at index 0)
  assert.equal(await g().reorderFeature('fil1', 0), false)
  assert.match(g().status, /不能移動/)
  assert.equal(g().undoStack.length, u0, 'refused drag must not push undo')
  assert.deepEqual(ids(), ['prim1', 'fil1', 'fil2'])

  // legal drop: fil2 onto fil1's slot (index 1)
  assert.equal(await g().reorderFeature('fil2', 1), true)
  assert.deepEqual(ids(), ['prim1', 'fil2', 'fil1'])
  assert.equal(g().undoStack.length, u0 + 1)
  assert.match(g().status, /已上移|已下移|已還原/)
  assert.equal(g().failedFeatureIds.length, 0)

  await g().undo()
  assert.deepEqual(ids(), ['prim1', 'fil1', 'fil2'])
})

test('runtime: moveFeature(+1/−1) delegates to reorderFeature (chip ◀▶)', async () => {
  reset()
  const box = { id: 'prim1', type: 'prim', shape: 'box', a: 50, b: 40, c: 30, op: 'new', cornerOrigin: true }
  assert.ok(await g().applyFeatures([box], 'box'))
  const f1 = { id: 'fil1', type: 'fillet', radius: 2, nears: [[25, 0, 30]] }
  const f2 = { id: 'fil2', type: 'fillet', radius: 2, nears: [[25, 40, 30]] }
  assert.ok(await g().applyFeatures([box, f1, f2], 'two fillets'))
  assert.deepEqual(ids(), ['prim1', 'fil1', 'fil2'])
  await g().moveFeature('fil1', 1)
  assert.deepEqual(ids(), ['prim1', 'fil2', 'fil1'])
  await g().moveFeature('fil1', -1)
  assert.deepEqual(ids(), ['prim1', 'fil1', 'fil2'])
})
