/**
 * CORE16 residual more15: Primitive cylinder / cone height 0 → Formal 繁中拒.
 * Dialog (featDlg / commitFeatDlg / featDlgBlockingReason) + cone timeline editFeature(c=0).
 * Complements core16-box-zero-size-refuse without re-testing box a/b/c path.
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
const { parseField } = await import('../src/cad/numericInput.ts')
const {
  ILLEGAL_LENGTH_DETAIL,
  illegalRejectStatus,
  isIllegalRejectStatus,
} = await import('../src/ui/illegalInput.ts')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () => useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)

const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/
const SC = /尺寸已拒绝|必须大于|高度必须|底部直径/

test('source: 圓柱／圓錐 Formal TC + height gated positive (dialog + cone semantic)', () => {
  const ribbon = rd('src/ribbon.ts')
  const st = rd('src/store.ts')
  const vp = rd('src/components/Viewport.tsx')
  const fn = rd('src/cad/featDlgNumeric.ts')

  assert.match(ribbon, /id: 'cylinder', label: '圓柱'/)
  assert.match(ribbon, /id: 'cone', label: '圓錐'/)
  assert.doesNotMatch(ribbon, /id: 'cylinder', label: '圆柱'/)
  assert.doesNotMatch(ribbon, /id: 'cone', label: '圆锥'/)

  // FEAT_PARAM_SPEC: cylinder h → boxHeight (strict >0)
  assert.match(fn, /cylinder: \{ d: 'bodyDiameter', h: 'boxHeight' \}/)
  // Cone semantic gate (not only paramRaw)
  assert.match(fn, /d\.kind === 'cone'/)
  assert.match(fn, /高度必須大於 0/)
  assert.match(fn, /底部直徑必須大於 0/)

  // commitFeatDlg rejects non-positive h/d for prims
  assert.match(st, /\['l', 'w', 'h', 'd', 'pitch', 'wire'\]\.some/)
  assert.match(st, /illegalRejectStatus\(ILLEGAL_LENGTH_DETAIL\)/)

  // Viewport: cylinder LenInput min + cone fields; Confirm disabled when h≤0
  assert.match(vp, /featDlg\.kind === 'cylinder'/)
  assert.match(vp, /featDlg\.kind === 'cone'/)
  assert.match(vp, /\(featDlg\.kind === 'cylinder' \|\| featDlg\.kind === 'sphere'\) && \[featDlg\.params\.d/)
})

test('parseField / featDlgBlockingReason: cylinder h=0 + cone h=0 → Formal refuse', () => {
  const h0 = parseField('boxHeight', '0')
  assert.equal(h0.ok, false)
  assert.match(h0.reason || '', /必須大於|大於 0|不可為/)
  assert.doesNotMatch(h0.reason || '', COLLOQ)
  assert.doesNotMatch(h0.reason || '', SC)

  const cylBlock = featDlgBlockingReason({
    kind: 'cylinder',
    params: { d: 20, h: 0 },
    paramRaw: { h: '0' },
  })
  assert.ok(cylBlock, 'cylinder h=0 must block')
  assert.doesNotMatch(cylBlock, COLLOQ)
  assert.match(illegalRejectStatus(cylBlock), /尺寸已拒絕/)

  const coneBlock = featDlgBlockingReason({
    kind: 'cone',
    params: { d: 20, dt: 0, h: 0 },
  })
  assert.ok(coneBlock, 'cone h=0 must block (semantic)')
  assert.match(coneBlock, /高度必須大於 0/)
  assert.doesNotMatch(coneBlock, COLLOQ)
  assert.doesNotMatch(coneBlock, SC)

  assert.equal(
    featDlgBlockingReason({
      kind: 'cylinder',
      params: { d: 20, h: 40 },
      paramRaw: { d: '20', h: '40' },
    }),
    null,
  )
  assert.equal(
    featDlgBlockingReason({ kind: 'cone', params: { d: 20, dt: 0, h: 40 } }),
    null,
  )
})

test('ILLEGAL_LENGTH_DETAIL Formal TC (shared cylinder commit path)', () => {
  assert.equal(ILLEGAL_LENGTH_DETAIL, '尺寸必須大於 0，未更改模型')
  assert.doesNotMatch(ILLEGAL_LENGTH_DETAIL, COLLOQ)
  assert.equal(illegalRejectStatus(ILLEGAL_LENGTH_DETAIL), '尺寸已拒絕：尺寸必須大於 0，未更改模型')
})

test('runtime: commitFeatDlg cylinder h=0 → Formal refuse; dlg stays; no feature', async () => {
  reset()
  useApp.setState({
    featDlg: { kind: 'cylinder', params: { d: 20, h: 0, op: 'new', px: 0, py: 0, pz: 0 } },
  })
  await g().commitFeatDlg()
  assert.ok(isIllegalRejectStatus(g().status) || /高度必須|尺寸已拒絕|必須大於/.test(g().status), g().status)
  assert.match(g().status, /尺寸已拒絕|高度必須|必須大於/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, SC)
  assert.ok(
    !g().features.some((f) => f.type === 'extrude' && f.profile?.kind === 'circle' && !f.sketchId),
    'no cylinder committed',
  )
  assert.ok(g().featDlg, 'featDlg should stay open after refuse')
  assert.equal(g().featDlg?.kind, 'cylinder')
})

test('runtime: commitFeatDlg cone h=0 → Formal refuse; dlg stays; no prim', async () => {
  reset()
  useApp.setState({
    featDlg: { kind: 'cone', params: { d: 20, dt: 0, h: 0, sides: 0, op: 'new', px: 0, py: 0, pz: 0 } },
  })
  await g().commitFeatDlg()
  assert.match(g().status, /尺寸已拒絕|高度必須大於 0|必須大於/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, SC)
  assert.ok(!g().features.some((f) => f.type === 'prim' && f.shape === 'cone'), 'no cone committed')
  assert.ok(g().featDlg, 'featDlg should stay open')
  assert.equal(g().featDlg?.kind, 'cone')
})

test('runtime: editFeature cone c=0 → Formal 繁中拒; tree unchanged; legal recovers', async () => {
  reset()
  const CONE = { id: 'cone1', type: 'prim', shape: 'cone', a: 10, b: 0, c: 40, op: 'new' }
  assert.equal(await g().applyFeatures([CONE], '已建立圓錐'), true, g().status)
  const before = structuredClone(g().features)

  await g().editFeature('cone1', { c: 0 })
  assert.ok(isIllegalRejectStatus(g().status), g().status)
  assert.match(g().status, /尺寸已拒絕：尺寸必須大於 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.deepEqual(g().features, before, 'c=0 must not mutate')

  await g().editFeature('cone1', { c: 50 })
  assert.equal(g().features.find((f) => f.id === 'cone1')?.c, 50, g().status)
  assert.doesNotMatch(g().status, /尺寸已拒絕：尺寸必須大於 0/)
})

test('runtime: after cylinder h=0 refuse, legal h still commits 圓柱', async () => {
  reset()
  useApp.setState({
    featDlg: { kind: 'cylinder', params: { d: 16, h: 0, op: 'new', px: 0, py: 0, pz: 0 } },
  })
  await g().commitFeatDlg()
  assert.match(g().status, /尺寸已拒絕|必須大於|高度/)
  useApp.setState({
    featDlg: { kind: 'cylinder', params: { d: 16, h: 30, op: 'new', px: 0, py: 0, pz: 0 } },
  })
  await g().commitFeatDlg()
  const f = g().features.find((x) => x.type === 'extrude' && x.profile?.kind === 'circle' && !x.sketchId)
  assert.ok(f, g().status)
  assert.equal(f.height, 30)
  assert.equal(f.profile.r, 8)
  assert.equal(g().featDlg, null)
  assert.doesNotMatch(g().status, COLLOQ)
})
