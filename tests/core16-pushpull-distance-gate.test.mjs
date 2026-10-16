/**
 * CORE16 residual more4: PushPull (按拉) distance gate.
 * Legal distance changes volume; dist 0 → Formal 繁中拒.
 * Complements core16-b3-solid-cmds #2 without re-testing through-cut thickness.
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
const {
  illegalRejectStatus,
  isIllegalRejectStatus,
} = await import('../src/ui/illegalInput.ts')
const { importSTEP, measureVolume } = await import('replicad')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () => useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
const vol = async () => measureVolume(await importSTEP(new Blob([await globalThis.__wheelWorker.exportSTEP()])))

const BOX = { id: 'B', type: 'prim', shape: 'box', a: 40, b: 30, c: 20, op: 'new', cornerOrigin: true }
const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/
const SC = /尺寸已拒绝|按拉距离不可|正数＝拉出/
const ZERO_DETAIL_CHIP = '按拉距離不可為 0（正數＝拉出，負數＝推入）'
const ZERO_DETAIL_DLG = '按拉距離不可為 0（正數＝拉出、負數＝壓入）'

test('illegalInput: pushpull dist 0 details are Formal 繁中拒', () => {
  for (const d of [ZERO_DETAIL_CHIP, ZERO_DETAIL_DLG]) {
    const s = illegalRejectStatus(d)
    assert.match(s, /^尺寸已拒絕：按拉距離不可為 0/)
    assert.equal(isIllegalRejectStatus(s), true)
    assert.doesNotMatch(s, COLLOQ)
    assert.doesNotMatch(s, SC)
  }
})

test('source: Timeline chip + editFeature + pushpull-edit pin Formal refuse for dist 0', () => {
  const st = rd('src/store.ts')
  const tl = rd('src/components/Timeline.tsx')
  const vp = rd('src/components/Viewport.tsx')
  assert.match(st, /illegalRejectStatus\('按拉距離不可為 0（正數＝拉出，負數＝推入）'\)/)
  assert.match(st, /illegalRejectStatus\('按拉距離不可為 0（正數＝拉出、負數＝壓入）'\)/)
  assert.match(st, /Math\.abs\(dist\) < 1e-9\) \{ set\(\{ status: '請輸入非零偏移距離' \}/)
  assert.match(tl, /sel\.type === 'pushpull' && fd\.key === 'dist' && n === 0/)
  assert.match(tl, /illegalRejectStatus\('按拉距離不可為 0（正數＝拉出，負數＝推入）'\)/)
  assert.match(vp, /okDisabled=\{!!numBad \|\| \(!pushPullPicks\.length \|\| Math\.abs\(pushPullDist\) < 1e-9\)\}/)
  assert.doesNotMatch(st, /尺寸已拒绝：按拉距离/)
})

test('runtime: editFeature(dist 0) → Formal 繁中拒; dist unchanged', async () => {
  reset()
  assert.equal(
    await g().applyFeatures([BOX, { id: 'P', type: 'pushpull', near: [20, 15, 20], dist: 5 }], 'seed'),
    true,
    g().status,
  )
  assert.equal(g().features.find((x) => x.id === 'P')?.dist, 5)
  const vBefore = await vol()
  await g().editFeature('P', { dist: 0 })
  assert.ok(isIllegalRejectStatus(g().status), g().status)
  assert.match(g().status, /尺寸已拒絕：按拉距離不可為 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, SC)
  assert.equal(g().features.find((x) => x.id === 'P')?.dist, 5)
  assert.ok(Math.abs((await vol()) - vBefore) < 1e-3)
})

test('runtime: commitPushPull(dist 0) refuses; mode stays; no feature', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const n0 = g().features.length
  g().togglePushPull()
  assert.equal(g().pushPullMode, true)
  // CAD top face center (20,15,20); three = [20, 20, -15]; normal +Z CAD = [0,0,1]
  g().pushPullAt([20, 20, -15], [0, 0, 1])
  assert.ok(g().pushPullPicks.length >= 1, g().status)
  g().setPushPullDist(0)
  assert.equal(g().pushPullDist, 0)
  await g().commitPushPull()
  assert.match(g().status, /請輸入非零偏移距離/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.equal(g().pushPullMode, true, 'mode stays open so user can fix dist')
  assert.equal(g().features.length, n0)
  assert.equal(g().features.some((f) => f.type === 'pushpull'), false)
})

test('runtime: legal +dist increases volume; −dist decreases', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const v0 = await vol()
  assert.ok(Math.abs(v0 - 40 * 30 * 20) < 1, `seed ${v0}`)

  assert.equal(
    await g().applyFeatures([BOX, { id: 'P+', type: 'pushpull', near: [20, 15, 20], dist: 5 }], 'pull'),
    true,
    g().status,
  )
  const vPull = await vol()
  assert.ok(vPull > v0 + 100, `pull must grow: ${v0} → ${vPull}`)
  assert.ok(Math.abs(vPull - 40 * 30 * 25) < 2, `expect ~30000 got ${vPull}`)

  assert.equal(
    await g().applyFeatures([BOX, { id: 'P-', type: 'pushpull', near: [20, 15, 20], dist: -4 }], 'push'),
    true,
    g().status,
  )
  const vPush = await vol()
  assert.ok(vPush < v0 - 100, `push must shrink: ${v0} → ${vPush}`)
  assert.ok(Math.abs(vPush - 40 * 30 * 16) < 2, `expect ~19200 got ${vPush}`)
  assert.doesNotMatch(g().status, COLLOQ)
})

test('runtime: pushpull-edit dialog dist 0 → Formal 繁中拒; feature unchanged', async () => {
  reset()
  assert.equal(
    await g().applyFeatures([BOX, { id: 'P', type: 'pushpull', near: [20, 15, 20], dist: 3 }], 'seed'),
    true,
    g().status,
  )
  useApp.setState({
    featDlg: { kind: 'pushpull-edit', params: { dist: 0 }, editId: 'P' },
  })
  await g().commitFeatDlg()
  // featDlgNumeric submit gate fires first: 「未提交：按拉距離不可為 0…」(Formal TC);
  // illegalRejectStatus path is still pinned in source for the deeper editFeature branch.
  assert.match(g().status, /(?:未提交|尺寸已拒絕).*按拉距離不可為 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, SC)
  assert.equal(g().features.find((x) => x.id === 'P')?.dist, 3)
  assert.equal(g().featDlg?.kind, 'pushpull-edit', 'dialog stays open on refuse')
})
