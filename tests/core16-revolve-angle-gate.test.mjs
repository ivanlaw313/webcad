/**
 * CORE16 residual: Revolve (旋轉) angle gate.
 * Legal angle edits (sidebar / timeline / editFeature) must NOT wrongly refuse
 * with「尺寸必須大於 0」. Angle 0 → grey/disabled 確定 + Formal 繁中拒.
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
const { featDlgBlockingReason } = await import('../src/cad/featDlgNumeric.ts')
const { ILLEGAL_LENGTH_DETAIL, illegalRejectStatus } = await import('../src/ui/illegalInput.ts')
const { importSTEP, measureVolume } = await import('replicad')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () => useApp.setState({ ...useApp.getInitialState(), appConfirm: async () => true }, true)
const vol = async () => measureVolume(await importSTEP(new Blob([await w.exportSTEP()])))

const ANGLE0_MSG = '旋轉角度必須大於 0° 且不超過 360°'

test('featDlgSemantic: legal revolve angles are not blocked (no 尺寸必須大於 0)', () => {
  for (const a of [1, 90, 180, 270, 360]) {
    const r = featDlgBlockingReason({ kind: 'revolve', params: { angle: a, wall: 0 } })
    assert.equal(r, null, `angle ${a} must pass, got ${r}`)
    assert.doesNotMatch(String(r), /尺寸必須大於 0/)
  }
})

test('featDlgSemantic: angle 0 / >360 → Formal 繁中拒 (not ILLEGAL_LENGTH)', () => {
  for (const a of [0, -1, 361, 720]) {
    const r = featDlgBlockingReason({ kind: 'revolve', params: { angle: a, wall: 0 } })
    assert.equal(r, ANGLE0_MSG, `angle ${a} → Formal TC, got ${r}`)
    assert.doesNotMatch(r, /尺寸必須大於 0，未更改模型/)
    assert.match(r, /旋轉角度必須大於 0/)
  }
})

test('UI: 確定 okDisabled via featDlgBlockingReason; angle 0 shows 尺寸已拒絕：{block}', () => {
  const vp = rd('src/components/Viewport.tsx')
  assert.match(vp, /!!featDlgBlockingReason\(featDlg\)/)
  assert.match(vp, /尺寸已拒絕：\{(?:block|featDlgBlockingReason\(featDlg\))\}/)
  // CommandDialog okDisabled shares featDlgBlockingReason (grey/disabled 確定 when angle 0)
  assert.match(vp, /okDisabled=\{[\s\S]{0,2000}?!!featDlgBlockingReason\(featDlg\)/)
})

test('Timeline: angle is NOT a POSITIVE_LENGTH_KEY (legal ° edits use no 尺寸必須大於 0 min)', () => {
  const tl = rd('src/components/Timeline.tsx')
  // revolve angle field exists
  assert.match(tl, /revolve:[\s\S]{0,200}?field: 'angle'/)
  // POSITIVE_LENGTH_KEYS must not list angle (would wrongly refuse 合法角度 via ILLEGAL_LENGTH_DETAIL)
  const m = tl.match(/const POSITIVE_LENGTH_KEYS = new Set\(\[([\s\S]*?)\]\)/)
  assert.ok(m, 'POSITIVE_LENGTH_KEYS set')
  assert.doesNotMatch(m[1], /['"]angle['"]/)
})

test('editFeature: legal angle change succeeds; wall 0 does not trip 尺寸必須大於 0', async () => {
  reset()
  const rev = {
    id: 'rev1',
    type: 'revolve',
    profile: { kind: 'rect', a: [10, 0], b: [30, 20] },
    angle: 360,
    axis: 'Y',
    op: 'new',
  }
  assert.equal(await g().applyFeatures([rev], 'seed revolve'), true, g().status)
  const v0 = await vol()
  assert.ok(v0 > 1000, `seed volume ${v0}`)

  await g().editFeature('rev1', { angle: 180 })
  assert.doesNotMatch(g().status, /尺寸必須大於 0/)
  assert.doesNotMatch(g().status, new RegExp(ILLEGAL_LENGTH_DETAIL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  const f = g().features.find((x) => x.id === 'rev1')
  assert.equal(f?.angle, 180, `angle must update to 180, status=${g().status}`)
  const v1 = await vol()
  assert.ok(Math.abs(v1 - v0 / 2) < v0 * 0.05, `180° ~ half of 360°: ${v1} vs ${v0 / 2}`)

  // CORE16 historical: wall 0 = solid; must not refuse with length gate
  const before = g().status
  await g().editFeature('rev1', { wall: 0 })
  assert.doesNotMatch(g().status, /尺寸必須大於 0/)
  // wall 0 may become undefined (solid) — either is fine; refuse is not
  assert.ok(!/尺寸已拒絕：尺寸必須大於 0/.test(g().status), `wall 0 refuse: ${g().status} (was ${before})`)
})

test('setFeatParam / commit gate: angle 0 blocks with Formal TC path (not length detail)', () => {
  // Semantic reason is what disables Confirm; illegalRejectStatus wraps length detail only
  const block = featDlgBlockingReason({ kind: 'revolve', params: { angle: 0 } })
  assert.equal(block, ANGLE0_MSG)
  const wrapped = illegalRejectStatus(block)
  assert.match(wrapped, /尺寸已拒絕：旋轉角度必須大於 0/)
  assert.doesNotMatch(wrapped, /尺寸已拒絕：尺寸必須大於 0，未更改模型/)
})
