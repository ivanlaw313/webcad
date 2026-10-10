// FISHING7 / P1：無關獨立基本體（op:newbody）拖到圓角之前 → 唔可以把圓角邊改綁到另一個體。
// 重現：box 80×60×40 + R3 + R5 → 新實體 box 20×20×20 @X=120 → 拖 prim2 到 R5 之前。
// 舊行為：重排成功但 R5 remapped 到小箱（相差 ~118 mm），活動體積 ~7.89。
// 期望：拒絕重排；時間軸／體積不變；唔出「已改用最近的邊」。
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
import test from 'node:test'
import assert from 'node:assert/strict'
await import('../src/worker/cad.worker.ts'); await globalThis.__wheelWorker.ready()
const { useApp, edgeTopoBodyRetarget, activeBodyKeyAfter } = await import('../src/store.ts')
const g = () => useApp.getState()
const ids = () => g().features.map((f) => f.id)

const box1 = { id: 'prim1', type: 'prim', shape: 'box', a: 80, b: 60, c: 40, op: 'new', cornerOrigin: true }
const filR3 = { id: 'fil1', type: 'fillet', radius: 3, nears: [[40, 0, 40]] }
const filR5 = { id: 'fil2', type: 'fillet', radius: 5, nears: [[40, 60, 40]] }
const box2 = { id: 'prim2', type: 'prim', shape: 'box', a: 20, b: 20, c: 20, op: 'newbody', cornerOrigin: true, at: [120, 0, 0] }

test('helper: inserting newbody before fillet changes active-body key', () => {
  const before = [box1, filR3, filR5, box2]
  const after = [box1, filR3, box2, filR5]
  const hit = edgeTopoBodyRetarget(before, after)
  assert.ok(hit)
  assert.equal(hit.feature.id, 'fil2')
  assert.equal(activeBodyKeyAfter(before, 2), 'root')
  assert.equal(activeBodyKeyAfter(after, 3), 'op:prim2')
  assert.notEqual(hit.oldKey, hit.newKey)
})

test('reorder unrelated newbody before R5 fillet → refused; no wrong-body remap; volume stays', async () => {
  assert.ok(await g().applyFeatures([box1], 'box1'))
  assert.ok(await g().applyFeatures([...g().features, filR3], 'r3'))
  assert.ok(await g().applyFeatures([...g().features, filR5], 'r5'))
  const volBig = g().mesh?.volumeExact
  assert.ok(typeof volBig !== 'number' || volBig > 180000, `unexpected pre-newbody volume ${volBig}`)
  assert.ok(await g().applyFeatures([...g().features, box2], 'prim2'))
  assert.deepEqual(ids(), ['prim1', 'fil1', 'fil2', 'prim2'])
  const u0 = g().undoStack.length
  const order0 = ids()

  const fil2Idx = g().features.findIndex((f) => f.id === 'fil2')
  assert.equal(await g().reorderFeature('prim2', fil2Idx), false)
  assert.deepEqual(ids(), order0, 'timeline order must not change')
  assert.equal(g().undoStack.length, u0, 'refused reorder must not push undo')
  assert.match(g().status, /不能(上移|移動)/)
  assert.match(g().status, /另一個實體/)
  assert.match(g().status, /圓角/)
  assert.match(g().status, /原語/, 'refuse must use tree display name 原語, not internal id')
  assert.doesNotMatch(g().status, /「prim\d*」/, 'refuse must not quote internal feature id')
  const warn = (g().lastBuildWarnings ?? []).join('\n') + '\n' + (g().status ?? '')
  assert.doesNotMatch(warn, /已改用最近的邊/)
  const vol = g().mesh?.volumeExact
  if (typeof vol === 'number') {
    assert.ok(vol > 7000 && vol < 9000, `active volume should stay ~8000 mm³ (small box), got ${vol}`)
  }
  assert.equal(g().failedFeatureIds.length, 0)
})

test('swapping two fillets on same body still allowed (regression)', async () => {
  assert.ok(await g().applyFeatures([box1, filR3, filR5], 'x'))
  assert.equal(await g().reorderFeature('fil2', 1), true)
  assert.deepEqual(ids(), ['prim1', 'fil2', 'fil1'])
  assert.match(g().status, /已上移/)
  assert.equal(g().failedFeatureIds.length, 0)
})
