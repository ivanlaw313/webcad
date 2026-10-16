/**
 * CORE16 residual more6: Two-distance chamfer (雙距離倒角) — distance2=0 refuse.
 * Follows p1-chamfer-two-dist-refuse spirit with runtime commit/dialog/edit gates
 * (extend without silent product changes; avoids pure source-only duplicate).
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
const { useApp, chamferInputReason } = await import('../src/store.ts')
const {
  illegalRejectStatus,
  isIllegalRejectStatus,
} = await import('../src/ui/illegalInput.ts')
const { importSTEP, measureVolume } = await import('replicad')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () => useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
const vol = async () => measureVolume(await importSTEP(new Blob([await w.exportSTEP()])))

const BOX = { id: 'B', type: 'prim', shape: 'box', a: 40, b: 40, c: 40, op: 'new', cornerOrigin: true }
// Top front edge mid (cornerOrigin): CAD (20,0,40) → three (20,40,0)
const TOP_FRONT_THREE = [[20, 40, 0]]
const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/
const SC = /距离 2 必须|双距离|尺寸已拒绝/

test('chamferInputReason: dist2=0 in mode two → Formal 繁中; legal two clears', () => {
  assert.equal(
    chamferInputReason({ edgeRoundSize: 3, chamferMode: 'two', chamferSize2: 0 }),
    '距離 2 必須大於 0（輸入 0 無效）',
  )
  assert.equal(
    chamferInputReason({ edgeRoundSize: 0, chamferMode: 'two', chamferSize2: 5 }),
    '距離 1 必須大於 0（輸入 0 無效）',
  )
  assert.equal(
    chamferInputReason({ edgeRoundSize: 3, chamferMode: 'two', chamferSize2: 5 }),
    null,
  )
  const msg = illegalRejectStatus('雙距離：距離 2 必須大於 0')
  assert.match(msg, /^尺寸已拒絕：雙距離：距離 2 必須大於 0/)
  assert.equal(isIllegalRejectStatus(msg), true)
  assert.doesNotMatch(msg, COLLOQ)
  assert.doesNotMatch(msg, SC)
})

test('source: commit + edit + Viewport pin dist2=0 refuse (extends p1 pins)', () => {
  const st = rd('src/store.ts')
  const vp = rd('src/components/Viewport.tsx')
  assert.match(st, /if \(kind === 'chamfer' && get\(\)\.chamferMode === 'two' && !\(get\(\)\.chamferSize2 > 0\)\) \{ set\(\{ status: '雙距離：距離 2 必須大於 0'/)
  assert.match(st, /cmEdit === 'two' && !\(\+p\.dist2 > 0\)\) \{ set\(\{ status: illegalRejectStatus\('雙距離：距離 2 必須大於 0'\)/)
  assert.match(st, /if \(mode === 'two' && !\(Number\(s\.chamferSize2\) > 0\)\) return '距離 2 必須大於 0（輸入 0 無效）'/)
  assert.match(vp, /chamferMode === 'two' && !\(chamferSize2 > 0\)/)
  assert.match(vp, /距離 2/)
  assert.doesNotMatch(st, /雙距離倒角暫未支援/)
  assert.doesNotMatch(vp, /option value="two" disabled/)
})

test('runtime: commitEdgeRound mode=two dist2=0 → Formal refuse; no chamfer feature', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const n0 = g().features.length
  const v0 = await vol()
  useApp.setState({
    edgeRoundPick: 'chamfer',
    edgeRoundPicks: TOP_FRONT_THREE,
    edgeRoundPickLines: [],
    edgeRoundRadii: [],
    edgeRoundGroupIds: [],
    edgeRoundSize: 3,
    chamferMode: 'two',
    chamferSize2: 0,
    chamferAngle: 45,
    chamferFlip: false,
    chamferRefFace: null,
  })
  await g().commitEdgeRound()
  assert.match(g().status, /雙距離：距離 2 必須大於 0|距離 2 必須大於 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, SC)
  assert.equal(g().features.length, n0)
  assert.equal(g().features.some((f) => f.type === 'chamfer'), false)
  assert.equal(g().edgeRoundPick, 'chamfer', 'mode stays so user can fix dist2')
  assert.ok(Math.abs((await vol()) - v0) < 1e-3)
})

test('runtime: chamfer-edit dialog dist2=0 → Formal 繁中拒; feature unchanged', async () => {
  reset()
  assert.equal(
    await g().applyFeatures([
      BOX,
      { id: 'C', type: 'chamfer', distance: 3, dist2: 5, nears: [[20, 0, 40]], cmode: 'two', chain: false },
    ], 'seed'),
    true,
    g().status,
  )
  assert.equal(g().features.find((x) => x.id === 'C')?.dist2, 5)
  const v0 = await vol()
  useApp.setState({
    featDlg: {
      kind: 'chamfer-edit',
      params: { distance: 3, dist2: 0, cmode: 'two', angle: 45, flip: 0, chain: 0 },
      editId: 'C',
    },
  })
  await g().commitFeatDlg()
  assert.ok(isIllegalRejectStatus(g().status) || /雙距離：距離 2 必須大於 0|距離 2 必須大於 0/.test(g().status), g().status)
  assert.match(g().status, /距離 2 必須大於 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, SC)
  assert.equal(g().features.find((x) => x.id === 'C')?.dist2, 5)
  assert.ok(Math.abs((await vol()) - v0) < 1e-3)
})

test('runtime: after dist2=0 refuse, legal dist2 still commits (atomic recover)', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const v0 = await vol()
  useApp.setState({
    edgeRoundPick: 'chamfer',
    edgeRoundPicks: TOP_FRONT_THREE,
    edgeRoundPickLines: [],
    edgeRoundRadii: [],
    edgeRoundGroupIds: [],
    edgeRoundSize: 3,
    chamferMode: 'two',
    chamferSize2: 0,
  })
  await g().commitEdgeRound()
  assert.match(g().status, /距離 2 必須大於 0/)
  assert.equal(g().features.some((f) => f.type === 'chamfer'), false)

  g().setChamferSize2(8)
  assert.equal(g().chamferSize2, 8)
  await g().commitEdgeRound()
  assert.ok(g().features.some((f) => f.type === 'chamfer' && f.cmode === 'two'), g().status)
  const f = g().features.find((x) => x.type === 'chamfer')
  assert.equal(f.dist2, 8)
  assert.equal(f.distance, 3)
  const v1 = await vol()
  // ½·3·8·40 = 480
  assert.ok(Math.abs(v1 - (v0 - 480)) < 12, `asymmetric C3×8 vol ${v1} from ${v0}`)
})

test('runtime: equal-mode dist2 ignored; two-mode with dist2>0 not refused by dist2 gate', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  useApp.setState({
    edgeRoundPick: 'chamfer',
    edgeRoundPicks: TOP_FRONT_THREE,
    edgeRoundPickLines: [],
    edgeRoundRadii: [],
    edgeRoundGroupIds: [],
    edgeRoundSize: 2,
    chamferMode: 'equal',
    chamferSize2: 0, // ignored in equal mode
  })
  await g().commitEdgeRound()
  assert.ok(g().features.some((f) => f.type === 'chamfer' && (f.cmode === 'equal' || !f.cmode || f.cmode !== 'two')), g().status)
  assert.doesNotMatch(g().status, /距離 2 必須大於 0/)
})
