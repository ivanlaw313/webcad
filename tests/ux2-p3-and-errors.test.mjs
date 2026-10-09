// UX2 #12 + P3：倒角／圓角內核失敗原因（英文原文）→ 繁體；Hole 預設 Ø5；撤銷刪除實體保留自訂名；「試閉」字眼。
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
await import('../src/worker/cad.worker.ts'); await globalThis.__wheelWorker.ready()
const { useApp } = await import('../src/store.ts')
const { plainFeatureError, roundFailLines } = await import('../src/ui/featureStatus.ts')
const g = () => useApp.getState()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const box = (id, x = 0) => ({ id, type: 'extrude', profile: { kind: 'rect', a: [x - 10, -10], b: [x + 10, 10] }, height: 10, operation: 'new' })
const withConfirm = async (ans, fn) => { const orig = g().appConfirm; useApp.setState({ appConfirm: async () => ans }); try { await fn() } finally { useApp.setState({ appConfirm: orig }) } }
const noLatin = (t) => !/[A-Za-z]{3,}/.test(t)

test('#12 kernel round failures read in Traditional (no English worker text)', () => {
  for (const [ty, m] of [['chamfer', 'chamfer near points failed'], ['fillet', 'fillet near points failed'], ['fillet', 'G2 fillet did not converge'], ['chamfer', 'no edge near point'], ['chamfer', 'BRep_API: command not done']]) {
    const t = plainFeatureError(ty, m)
    assert.ok(noLatin(t.replace(/G[12]/g, '')), t)
  }
  assert.match(plainFeatureError('chamfer', 'chamfer near points failed'), /倒角做唔到.*距離/)
  assert.match(plainFeatureError('chamfer', 'no edge near point'), /搵唔返/)
  assert.equal(plainFeatureError('revolve', '旋轉截面跨過軸'), '旋轉截面跨過軸')
  const tl = readFileSync(new URL('../src/components/Timeline.tsx', import.meta.url), 'utf8')
  assert.match(tl, /plainFeatureError\(sel\.type, featureErrors\[sel\.id\]\)/)
  const st = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(st, /status: '(Two Distance|Distance and Angle|Equal Distance)：/)
})

test('#12 committing a too-big chamfer: status + timeline error are Traditional', async () => {
  await g().reset()
  assert.ok(await g().applyFeatures([box('b1')], 'x'))
  const bad = { id: 'C1', type: 'chamfer', distance: 30, nears: [[10, 0, 10]], cmode: 'equal', chain: false }
  assert.equal(await g().applyFeatures([box('b1'), bad], 'x'), false)
  assert.ok(noLatin(g().status), g().status)
  assert.match(g().status, /倒角/)
  assert.ok(noLatin(plainFeatureError('chamfer', g().featureErrors.C1 ?? '')), JSON.stringify(g().featureErrors))
})

test('P3 typo: no 「試閉」 and the chamfer hint reads naturally', () => {
  const hk = roundFailLines('zh-HK').join('')
  assert.doesNotMatch(hk, /試閉/); assert.match(hk, /切線鏈/)
})

test('P3 hole default diameter is Ø5 (Fusion-ish), not Ø16', () => {
  assert.equal(useApp.getInitialState().holeD, 5)
  g().setHoleD(NaN); assert.equal(g().holeD, 5)
})

test('P3 Ctrl+Z after deleting a renamed body brings the custom name back (and redo/undo keep it in step)', async () => {
  await g().reset()
  await g().applyFeatures([box('b1')], 'x')
  g().renameActiveBody('杯身')
  await withConfirm(true, () => g().deleteActiveBody())
  assert.equal(g().features.length, 0); assert.equal(g().activeBodyName, '')
  await g().undo()
  assert.equal(g().features.length, 1); assert.equal(g().activeBodyName, '杯身')
  await g().redo()
  assert.equal(g().features.length, 0); assert.equal(g().activeBodyName, '')
  await g().undo()
  assert.equal(g().activeBodyName, '杯身')
  // an unrelated undo does NOT touch the name
  await g().applyFeatures([box('b1'), box('b2', 40)], 'y')
  g().renameActiveBody('新名'); await g().undo()
  assert.equal(g().activeBodyName, '新名')
})
