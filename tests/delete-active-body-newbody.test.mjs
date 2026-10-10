// P1：ribbon「新實體」(op/operation:newbody) 建第二體後刪活動體 — 只刪活動體特徵，另一體保留；確認框只列那些特徵；一次 Ctrl+Z 還原。
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
import test from 'node:test'
import assert from 'node:assert/strict'
await import('../src/worker/cad.worker.ts'); await globalThis.__wheelWorker.ready()
const { useApp, featureIdsForActiveBody, activeBodyKeyAfter } = await import('../src/store.ts')
const g = () => useApp.getState()
const withConfirm = async (ans, fn) => {
  const msgs = []
  const orig = g().appConfirm
  useApp.setState({ appConfirm: async (m) => { msgs.push(m); return typeof ans === 'function' ? ans(m) : ans } })
  try { await fn() } finally { useApp.setState({ appConfirm: orig }) }
  return msgs
}
const box = (id, x = 0) => ({ id, type: 'extrude', profile: { kind: 'rect', a: [x - 15, -15], b: [x + 15, 15] }, height: 10, operation: 'new' })
const cylNewbody = (id) => ({ id, type: 'extrude', profile: { kind: 'circle', c: [40, 0], r: 8 }, height: 25, baseZ: 0, operation: 'newbody' })

test('featureIdsForActiveBody: op:newbody cylinder is the only active feature', () => {
  const feats = [box('b1'), cylNewbody('c1')]
  assert.deepEqual([...featureIdsForActiveBody(feats)], ['c1'])
})

test('deleteActiveBody with op:newbody removes only the active cylinder; box remains; one undo restores', async () => {
  await g().reset()
  assert.ok(await g().applyFeatures([box('b1'), cylNewbody('c1')], 'two'))
  assert.equal(g().bodyMesh?.parked?.length, 1)
  const beforeIds = g().features.map((f) => f.id)
  const msgs = await withConfirm(true, () => g().deleteActiveBody())
  assert.equal(msgs.length, 1)
  assert.match(msgs[0], /會移除建立它的 1 個特徵/)
  assert.doesNotMatch(msgs[0], /4 個特徵/)
  assert.match(msgs[0], /・/)   // lists the doomed feature(s)
  assert.deepEqual(g().features.map((f) => f.id), ['b1'])
  assert.ok(g().bodyMesh?.triangles?.length)
  assert.equal(g().bodyMesh?.parked?.length ?? 0, 0)
  await g().undo()
  assert.deepEqual(g().features.map((f) => f.id), beforeIds)
  assert.equal(g().bodyMesh?.parked?.length, 1)
})

test('deleteActiveBody confirm cancel leaves both bodies', async () => {
  await g().reset()
  assert.ok(await g().applyFeatures([box('b1'), cylNewbody('c1')], 'two'))
  await withConfirm(false, () => g().deleteActiveBody())
  assert.deepEqual(g().features.map((f) => f.id), ['b1', 'c1'])
  assert.equal(g().bodyMesh?.parked?.length, 1)
})

test('type:newbody path still deletes only features after the marker (regression)', async () => {
  await g().reset()
  assert.ok(await g().applyFeatures([box('b1'), { id: 'nb', type: 'newbody', name: '實體1' }, box('b2', 40)], 'x'))
  assert.equal(g().bodyMesh?.parked?.length, 1)
  await withConfirm(true, () => g().deleteActiveBody())
  assert.deepEqual(g().features.map((f) => f.id), ['b1', 'nb'])
  assert.equal(g().bodyMesh?.parked?.length, 1)
})

test('activeBodyKeyAfter: cut after newbody has different key than before it', () => {
  const feats = [
    { id: 'b1', type: 'extrude', operation: 'new' },
    { id: 'c1', type: 'extrude', operation: 'newbody' },
    { id: 'cut', type: 'extrude', operation: 'cut' },
  ]
  assert.equal(activeBodyKeyAfter(feats, 2), 'op:c1')
  assert.equal(activeBodyKeyAfter(feats, 0), 'root')
  assert.notEqual(activeBodyKeyAfter(feats, 2), activeBodyKeyAfter([{ id: 'b1', type: 'extrude', operation: 'new' }, { id: 'cut', type: 'extrude', operation: 'cut' }, { id: 'c1', type: 'extrude', operation: 'newbody' }], 1))
})

test('reorderFeature refuses moving a cut onto another body', async () => {
  await g().reset()
  const cut = { id: 'cut1', type: 'extrude', profile: { kind: 'circle', c: [40, 0], r: 3 }, height: 30, operation: 'cut' }
  assert.ok(await g().applyFeatures([box('b1'), cylNewbody('c1'), cut], 'cut-on-cyl'))
  const before = g().features.map((f) => f.id)
  // moving cut before the newbody cylinder would retarget the box — refuse
  assert.equal(await g().reorderFeature('cut1', 1), false)
  assert.match(g().status, /切割目標/)
  assert.deepEqual(g().features.map((f) => f.id), before)
})

test('requestRemoveFeature always confirms (no deps); Esc/cancel aborts; confirm then Ctrl+Z works', async () => {
  await g().reset()
  assert.ok(await g().applyFeatures([box('b1')], 'one'))
  const msgs = await withConfirm(false, () => g().requestRemoveFeature('b1'))
  assert.equal(msgs.length, 1)
  assert.match(msgs[0], /刪除「/)
  assert.deepEqual(g().features.map((f) => f.id), ['b1'])
  await withConfirm(true, () => g().requestRemoveFeature('b1'))
  assert.equal(g().features.length, 0)
  await g().undo()
  assert.equal(g().features.length, 1)
})

test('deleteActiveBody after 設為活動: only active features go; parked newbody body remains; activatebody stripped; one undo', async () => {
  // Reproduce Bbm / tip gap: A + ⬡新實體 B + set A active + delete active → B must stay (not rebuild-fail / wipe).
  await g().reset()
  assert.ok(await g().applyFeatures([box('b1'), cylNewbody('c1')], 'two'))
  assert.equal(g().bodyMesh?.parked?.length, 1)
  await g().activateParkedBody(0)
  assert.ok(g().features.some((f) => f.type === 'activatebody'))
  assert.deepEqual([...featureIdsForActiveBody(g().features)], ['b1'])
  const beforeIds = g().features.map((f) => f.id)
  const msgs = await withConfirm(true, () => g().deleteActiveBody())
  assert.equal(msgs.length, 1)
  assert.match(msgs[0], /會移除建立它的 1 個特徵/)
  assert.doesNotMatch(msgs[0], /設為活動/)  // confirm lists solid features only
  assert.deepEqual(g().features.map((f) => f.id), ['c1'])
  assert.equal(g().features.some((f) => f.type === 'activatebody'), false)
  assert.ok(g().bodyMesh?.triangles?.length)
  assert.equal(g().bodyMesh?.parked?.length ?? 0, 0)
  await g().undo()
  assert.deepEqual(g().features.map((f) => f.id), beforeIds)
  assert.equal(g().bodyMesh?.parked?.length, 1)
  assert.ok(g().features.some((f) => f.type === 'activatebody'))
})

test('deleteActiveBody after 設為活動 with prim op:newbody (ribbon auto-new path)', async () => {
  await g().reset()
  const p1 = { id: 'p1', type: 'prim', shape: 'box', a: 30, b: 30, c: 10, op: 'new', cornerOrigin: true }
  const p2 = { id: 'p2', type: 'prim', shape: 'box', a: 20, b: 20, c: 20, op: 'newbody', cornerOrigin: true }
  assert.ok(await g().applyFeatures([p1, p2], 'prims'))
  await g().activateParkedBody(0)
  const msgs = await withConfirm(true, () => g().deleteActiveBody())
  assert.match(msgs[0], /會移除建立它的 1 個特徵/)
  assert.deepEqual(g().features.map((f) => f.id), ['p2'])
  assert.ok(g().bodyMesh?.triangles?.length)
  assert.equal(g().bodyMesh?.parked?.length ?? 0, 0)
})
