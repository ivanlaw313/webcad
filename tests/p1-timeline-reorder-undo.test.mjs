// P1 A：合法對調兩個圓角 → Ctrl+Z 必須還原兩個圓角（特徵數不變）；拒絕移動唔入 undo。
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
await import('../src/worker/cad.worker.ts'); await globalThis.__wheelWorker.ready()
const { useApp } = await import('../src/store.ts')
const g = () => useApp.getState()
const ids = () => g().features.map((f) => f.id)

test('contract: reorder clones pre-order features into one undo snap; refuse paths set status only', () => {
  const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  const reo = store.slice(store.indexOf('  reorderFeature: async (id, to) => {'), store.indexOf('  // GM-W6 F2：浏览树双击特征行改名'))
  assert.match(reo, /structuredClone\(s0\.features\)/)
  assert.match(reo, /applyFeatures\(next, [^\n]*, true, undefined, before\)/)
  assert.match(reo, /不能移動/)
  assert.doesNotMatch(reo.slice(0, reo.indexOf('const before')), /undoStack/)
})

test('two fillets swap → undo restores both (count unchanged); refuse leaves undo stack', async () => {
  const box = { id: 'prim1', type: 'prim', shape: 'box', a: 80, b: 60, c: 40, op: 'new', cornerOrigin: true }
  assert.ok(await g().applyFeatures([box], 'box'))
  const f1 = { id: 'fil1', type: 'fillet', radius: 3, nears: [[40, 0, 40]] }
  assert.ok(await g().applyFeatures([...g().features, f1], 'f1'))
  const f2 = { id: 'fil2', type: 'fillet', radius: 5, nears: [[40, 60, 40]] }
  assert.ok(await g().applyFeatures([...g().features, f2], 'f2'))
  assert.deepEqual(ids(), ['prim1', 'fil1', 'fil2'])
  const n0 = g().features.length
  const u0 = g().undoStack.length

  // refuse: fillet before prim
  assert.equal(await g().reorderFeature('fil1', 0), false)
  assert.match(g().status, /不能移動/)
  assert.equal(g().undoStack.length, u0, 'refused move must not push undo')
  assert.deepEqual(ids(), ['prim1', 'fil1', 'fil2'])

  // legal swap
  assert.equal(await g().reorderFeature('fil2', 1), true)
  assert.deepEqual(ids(), ['prim1', 'fil2', 'fil1'])
  assert.equal(g().undoStack.length, u0 + 1, 'legal reorder = exactly one undo step')
  assert.match(g().status, /已上移/)

  await g().undo()
  assert.deepEqual(ids(), ['prim1', 'fil1', 'fil2'])
  assert.equal(g().features.length, n0, 'feature count unchanged after undo')
  assert.equal(g().failedFeatureIds.length, 0)
  assert.match(g().status, /已撤[銷销]/)
})
