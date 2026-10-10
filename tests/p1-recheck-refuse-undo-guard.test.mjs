// P1-RECHECK A：拒絕時間軸重排後 Ctrl+Z 唔可以食圓角；合法對調後 Z 還原兩個；CSV 表頭繁體。
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

test('contract: refuse notes undo guard; undo honors it; CSV Traditional headers', () => {
  const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  assert.match(store, /noteTimelineReorderRefused/)
  assert.match(store, /_timelineRefuseUndoGuard/)
  assert.match(store, /拒絕移動未改變模型 — 沒有可撤銷的時間軸重排/)
  assert.match(store, /\['參數名', '值', '表達式'\]/)
  assert.doesNotMatch(store, /\['参数名', '值', '表达式'\]/)
  const tl = readFileSync(new URL('../src/components/Timeline.tsx', import.meta.url), 'utf8')
  assert.match(tl, /chipDragActive/)
})

test('refuse then Ctrl+Z keeps feature count; legal swap then Z restores both', async () => {
  const box = { id: 'prim1', type: 'prim', shape: 'box', a: 80, b: 60, c: 40, op: 'new', cornerOrigin: true }
  assert.ok(await g().applyFeatures([box], 'box'))
  assert.ok(await g().applyFeatures([...g().features, { id: 'fil1', type: 'fillet', radius: 3, nears: [[40, 0, 40]] }], 'f1'))
  assert.ok(await g().applyFeatures([...g().features, { id: 'fil2', type: 'fillet', radius: 5, nears: [[40, 60, 40]] }], 'f2'))
  assert.deepEqual(ids(), ['prim1', 'fil1', 'fil2'])
  const n0 = g().features.length
  const u0 = g().undoStack.length

  // Illegal: fillet before prim
  assert.equal(await g().reorderFeature('fil2', 0), false)
  assert.match(g().status, /不能移動/)
  assert.equal(g().undoStack.length, u0, 'refuse must not pushHistory')

  await g().undo()
  assert.equal(g().features.length, n0, 'Ctrl+Z after refuse must not drop fillet')
  assert.deepEqual(ids(), ['prim1', 'fil1', 'fil2'])
  assert.match(g().status, /拒絕移動未改變模型|沒有可撤銷的時間軸重排/)

  // Legal swap of two independent fillets
  assert.equal(await g().reorderFeature('fil2', 1), true)
  assert.deepEqual(ids(), ['prim1', 'fil2', 'fil1'])
  await g().undo()
  assert.deepEqual(ids(), ['prim1', 'fil1', 'fil2'])
  assert.equal(g().features.length, n0)
})
