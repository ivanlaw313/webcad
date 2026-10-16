/**
 * CORE16 residual more10: Revolve angle 0 refuse Formal; angle 360 OK (Formal).
 * Complements core16-revolve-angle-gate (featDlgSemantic / editFeature) with
 * commitFeatDlg runtime paths and explicit 0 vs 360 contract — tests only.
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
const { featDlgBlockingReason } = await import('../src/cad/featDlgNumeric.ts')
const { importSTEP, measureVolume } = await import('replicad')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () => useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
const vol = async () => {
  const buf = await globalThis.__wheelWorker.exportSTEP()
  if (!buf) return 0
  const shape = await importSTEP(new Blob([buf]))
  try { return measureVolume(shape) } finally { shape.delete() }
}
const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/
const ANGLE0_MSG = '旋轉角度必須大於 0° 且不超過 360°'

const REV_PROF = { kind: 'rect', a: [10, 0], b: [30, 20] }

function openRevolveDlg(angle) {
  useApp.setState({
    featDlg: {
      kind: 'revolve',
      params: { axis: 'Y', angle, op: 'new', wall: 0, sym: 0, ox: 0, oy: 0, oz: 0, dx: 0, dy: 1, dz: 0 },
      payload: { prof: REV_PROF },
    },
  })
}

test('source: featDlgSemantic + commitFeatDlg share Formal angle 0..360 gate', () => {
  const num = rd('src/cad/featDlgNumeric.ts')
  const st = rd('src/store.ts')
  assert.match(num, /旋轉角度必須大於 0° 且不超過 360°/)
  assert.match(num, /!\(a > 0 && a <= 360\)/)
  // commitFeatDlg uses featDlgBlockingReason before building (dlg stays open)
  assert.match(st, /const blocked = featDlgBlockingReason\(d\)/)
  assert.match(st, /if \(blocked\) \{ set\(\{ status: `未提交：\$\{blocked\}` \}\); return \}/)
  // Legacy belt-and-braces aligned to same Formal TC as featDlgBlockingReason
  assert.match(st, /旋轉角度必須大於 0° 且不超過 360°/)
  assert.doesNotMatch(st, /旋轉角度要 >0（請填 1–360）/)
  assert.doesNotMatch(ANGLE0_MSG, COLLOQ)
})

test('featDlgBlockingReason: 0 refuse Formal; 360 OK; 361 refuse', () => {
  assert.equal(featDlgBlockingReason({ kind: 'revolve', params: { angle: 0 } }), ANGLE0_MSG)
  assert.equal(featDlgBlockingReason({ kind: 'revolve', params: { angle: 360 } }), null)
  assert.equal(featDlgBlockingReason({ kind: 'revolve', params: { angle: 361 } }), ANGLE0_MSG)
  assert.equal(featDlgBlockingReason({ kind: 'revolve', params: { angle: -5 } }), ANGLE0_MSG)
})

test('runtime: commitFeatDlg angle 0 → Formal 未提交拒; dlg stays open; no feature', async () => {
  reset()
  openRevolveDlg(0)
  const n0 = g().features.length
  await g().commitFeatDlg()
  assert.match(g().status, /未提交：旋轉角度必須大於 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /尺寸必須大於 0/)
  assert.ok(g().featDlg && g().featDlg.kind === 'revolve', 'dlg stays open after refuse')
  assert.equal(g().features.length, n0)
})

test('runtime: commitFeatDlg angle 360 OK → solid feature + positive volume', async () => {
  reset()
  openRevolveDlg(360)
  await g().commitFeatDlg()
  assert.equal(g().featDlg, null, g().status)
  const f = g().features.find((x) => x.type === 'revolve')
  assert.ok(f, g().status)
  assert.equal(f.angle, 360)
  const v = await vol()
  assert.ok(v > 1000, `360° revolve vol ${v}; status=${g().status}`)
  assert.doesNotMatch(g().status, /未提交/)
})

test('runtime: commitFeatDlg angle 361 → Formal refuse; dlg stays', async () => {
  reset()
  openRevolveDlg(361)
  const n0 = g().features.length
  await g().commitFeatDlg()
  assert.match(g().status, /未提交：旋轉角度必須大於 0/)
  assert.ok(g().featDlg?.kind === 'revolve')
  assert.equal(g().features.length, n0)
})

test('runtime: applyFeatures angle 360 seed + editFeature to 180 halves volume (360 contract)', async () => {
  reset()
  const rev = { id: 'rev360', type: 'revolve', profile: REV_PROF, angle: 360, axis: 'Y', op: 'new' }
  assert.equal(await g().applyFeatures([rev], 'seed'), true, g().status)
  const v0 = await vol()
  assert.ok(v0 > 1000, `seed ${v0}`)
  await g().editFeature('rev360', { angle: 180 })
  assert.equal(g().features.find((x) => x.id === 'rev360')?.angle, 180, g().status)
  const v1 = await vol()
  assert.ok(Math.abs(v1 - v0 / 2) < v0 * 0.08, `180 ~ half of 360: ${v1} vs ${v0 / 2}`)
})
