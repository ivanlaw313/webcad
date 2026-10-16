/**
 * CORE16 residual more3: Move / Copy (移動／複製).
 * After displace → feature/volume(pose) updated; cancel restores prior state.
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
const w = globalThis.__wheelWorker
await w.ready()
const { useApp } = await import('../src/store.ts')
const { importSTEP, measureVolume } = await import('replicad')
const { computeMassProps } = await import('../src/cad/massProps.ts')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () => useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
const volSTEP = async () => {
  const buf = await w.exportSTEP()
  if (!buf) return 0
  const shape = await importSTEP(new Blob([buf]))
  try { return measureVolume(shape) } finally { shape.delete() }
}
const bboxCenter = (m) => {
  const v = m?.vertices
  if (!v?.length) return null
  let xn = 1e9, xp = -1e9, yn = 1e9, yp = -1e9, zn = 1e9, zp = -1e9
  for (let i = 0; i < v.length; i += 3) {
    xn = Math.min(xn, v[i]); xp = Math.max(xp, v[i])
    yn = Math.min(yn, v[i + 1]); yp = Math.max(yp, v[i + 1])
    zn = Math.min(zn, v[i + 2]); zp = Math.max(zp, v[i + 2])
  }
  return [(xn + xp) / 2, (yn + yp) / 2, (zn + zp) / 2]
}
const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/

const BOX = { id: 'B', type: 'prim', shape: 'box', a: 40, b: 30, c: 10, op: 'new', cornerOrigin: true }

test('source: Move/Copy dialog + cancelFeatDlg restore Formal TC', () => {
  const st = rd('src/store.ts')
  const vp = rd('src/components/Viewport.tsx')
  assert.match(st, /kind === 'move'/)
  assert.match(st, /type:\s*'transform'/)
  assert.match(st, /type:\s*'copybody'/)
  assert.match(st, /name: `複製實體\$\{/)
  assert.match(st, /cancelFeatDlg:/)
  assert.match(st, /status: '已取消'/)
  assert.match(vp, /tStatus\('移動\/複製', lang\)|move: '移動\/複製'/)
  // Runtime name is 複製實體N (comment may still mention old CopyPasteBodies1)
  assert.match(st, /name: `複製實體\$\{[^`]+\}`/)
  assert.doesNotMatch(st, /name: `CopyPasteBodies/)
})

test('move translate: transform feature added; volume unchanged; bbox center shifts', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'box'), true, g().status)
  const v0 = await volSTEP()
  assert.ok(Math.abs(v0 - 12000) < 1, `seed ${v0}`)
  const c0 = bboxCenter(g().bodyMesh)
  assert.ok(c0)

  g().openFeatDlg('move')
  assert.equal(g().featDlg?.kind, 'move')
  for (const [k, v] of [['moveType', 'translate'], ['dx', 25], ['dy', 10], ['dz', 0], ['createCopy', 0]]) {
    g().setFeatParam(k, v)
  }
  const beforeN = g().features.length
  await g().commitFeatDlg()
  assert.equal(g().featDlg, null)
  assert.match(g().status, /已移動實體/, g().status)
  assert.doesNotMatch(g().status, COLLOQ)
  const tf = g().features.find((f) => f.type === 'transform')
  assert.ok(tf, 'transform feature present')
  assert.equal(tf.dx, 25)
  assert.equal(tf.dy, 10)
  assert.equal(g().features.length, beforeN + 1)

  const v1 = await volSTEP()
  assert.ok(Math.abs(v1 - v0) < 1, `move preserves volume ${v0} → ${v1}`)
  const c1 = bboxCenter(g().bodyMesh)
  assert.ok(c1)
  assert.ok(Math.abs(c1[0] - (c0[0] + 25)) < 0.5, `cx ${c0[0]} → ${c1[0]}`)
  assert.ok(Math.abs(c1[1] - (c0[1] + 10)) < 0.5, `cy ${c0[1]} → ${c1[1]}`)
})

test('copy: copybody + transform; parked body appears; volume of active unchanged-ish', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'box'), true, g().status)
  const v0 = await volSTEP()
  const parked0 = g().bodyMesh?.parked?.length ?? 0

  g().openFeatDlg('move')
  for (const [k, v] of [['moveType', 'translate'], ['dx', 50], ['dy', 0], ['dz', 0], ['createCopy', 1]]) {
    g().setFeatParam(k, v)
  }
  await g().commitFeatDlg()
  assert.match(g().status, /^已複製並移動實體/, g().status)
  const cb = g().features.find((f) => f.type === 'copybody')
  const tf = g().features.find((f) => f.type === 'transform' && f.copy)
  assert.equal(cb?.name, '複製實體1')
  assert.ok(tf && tf.dx === 50)
  const parked1 = g().bodyMesh?.parked?.length ?? 0
  assert.ok(parked1 > parked0, `copy adds parked body ${parked0} → ${parked1}`)
  // Active body still original volume; total solid material ≈ 2×
  const vActive = computeMassProps(g().bodyMesh.vertices, g().bodyMesh.triangles).volume
  assert.ok(Math.abs(vActive - v0) < 1 || Math.abs(vActive - 12000) < 1, `active vol ${vActive}`)
})

test('cancel Move/Copy dialog restores prior state (no feature, no pose change)', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'box'), true, g().status)
  const before = {
    features: structuredClone(g().features),
    undo: g().undoStack.length,
    center: bboxCenter(g().bodyMesh),
    status: g().status,
  }
  g().openFeatDlg('move')
  assert.equal(g().featDlg?.kind, 'move')
  g().setFeatParam('moveType', 'translate')
  g().setFeatParam('dx', 99)
  g().setFeatParam('dy', 88)
  g().cancelFeatDlg()
  assert.equal(g().featDlg, null)
  assert.match(g().status, /已取消/)
  assert.deepEqual(g().features, before.features)
  assert.equal(g().undoStack.length, before.undo)
  const c = bboxCenter(g().bodyMesh)
  assert.ok(c && before.center)
  assert.ok(Math.abs(c[0] - before.center[0]) < 1e-6)
  assert.ok(Math.abs(c[1] - before.center[1]) < 1e-6)
  assert.ok(!g().features.some((f) => f.type === 'transform' || f.type === 'copybody'))
})

test('cancel after opening edit of existing transform clears selection (UX1)', async () => {
  reset()
  assert.equal(await g().applyFeatures([
    BOX,
    { id: 'm1', type: 'transform', dx: 5, dy: 0, dz: 0, rz: 0 },
  ], 'seed move'), true, g().status)
  g().openFeatDlgForEdit('m1')
  assert.equal(g().featDlg?.editId, 'm1')
  assert.equal(g().selectedFeature, 'm1')
  const dxBefore = g().features.find((f) => f.id === 'm1')?.dx
  g().setFeatParam('dx', 999)
  g().cancelFeatDlg()
  assert.equal(g().featDlg, null)
  assert.equal(g().selectedFeature, null)
  assert.match(g().status, /已取消編輯特徵/)
  assert.equal(g().features.find((f) => f.id === 'm1')?.dx, dxBefore, 'cancel must not write draft params')
})

test('zero displace refused: dialog stays; model unchanged', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'box'), true, g().status)
  const before = structuredClone(g().features)
  g().openFeatDlg('move')
  g().setFeatParam('moveType', 'translate')
  g().setFeatParam('dx', 0)
  g().setFeatParam('dy', 0)
  g().setFeatParam('dz', 0)
  await g().commitFeatDlg()
  assert.match(g().status, /移動：請輸入非零/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.equal(g().featDlg?.kind, 'move', 'stay open so user can fix')
  assert.deepEqual(g().features, before)
})
