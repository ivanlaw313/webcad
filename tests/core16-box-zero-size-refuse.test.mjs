/**
 * CORE16 residual more7: Primitive box (長方體) dimension 0 → Formal 繁中拒.
 * Dialog (featDlg / LenInput / commitFeatDlg) + timeline chip editFeature(a/b/c=0)
 * must refuse with「尺寸已拒絕：尺寸必須大於 0…」— no silent clamp / no colloquial.
 * Complements grok-qa-v1.9 prim a=-1/0 without re-testing hole Ø path.
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
const SC = /尺寸已拒绝|必须大于/
const BOX = { id: 'box1', type: 'prim', shape: 'box', a: 80, b: 60, c: 40, op: 'new', cornerOrigin: true }

test('source: 長方體 Formal TC label + box dims gated positive (dialog + timeline + editFeature)', () => {
  const ribbon = rd('src/ribbon.ts')
  const tl = rd('src/components/Timeline.tsx')
  const st = rd('src/store.ts')
  const vp = rd('src/components/Viewport.tsx')

  assert.match(ribbon, /id: 'box', label: '長方體'/)
  assert.doesNotMatch(ribbon, /id: 'box', label: '长方体'/)

  // Timeline chip: a/b/c are POSITIVE_LENGTH_KEYS → ILLEGAL_LENGTH_DETAIL on ≤0
  const m = tl.match(/const POSITIVE_LENGTH_KEYS = new Set\(\[([\s\S]*?)\]\)/)
  assert.ok(m)
  assert.match(m[1], /['"]a['"]/)
  assert.match(m[1], /['"]b['"]/)
  assert.match(m[1], /['"]c['"]/)
  assert.match(tl, /prim:[\s\S]{0,120}?fields: \[\{ key: 'a'/)

  // commitFeatDlg rejects non-positive l/w/h with ILLEGAL_LENGTH_DETAIL
  assert.match(st, /\['l', 'w', 'h', 'd', 'pitch', 'wire'\]\.some/)
  assert.match(st, /illegalRejectStatus\(ILLEGAL_LENGTH_DETAIL\)/)
  // editFeature positiveKeys include a/b/c
  assert.match(st, /positiveKeys = \[[\s\S]*?'a'[\s\S]*?'b'[\s\S]*?'c'/)

  // Dialog FEAT_PARAM_SPEC maps box l/w/h → boxLength/Width/Height
  assert.match(rd('src/cad/featDlgNumeric.ts'), /box: \{ l: 'boxLength', w: 'boxWidth', h: 'boxHeight' \}/)
  // Viewport box fields use LenInput min={0.1}
  assert.match(vp, /featDlg\.kind === 'box' && \(<>/)
  assert.match(vp, /data-testid="prim-illegal-alert"/)
  assert.match(vp, /LenInput mm=\{Number\(featDlg\.params\.l\)\}[\s\S]{0,220}?min=\{0\.1\}/)
})

test('parseField / featDlgBlockingReason: box l/w/h = 0 → Formal refuse (not ILLEGAL wrapper alone)', () => {
  for (const [key, raw] of [['boxLength', '0'], ['boxWidth', '0'], ['boxHeight', '0'], ['boxLength', '-1']]) {
    const r = parseField(key, raw)
    assert.equal(r.ok, false, `${key}=${raw}`)
    assert.match(r.reason || '', /必須大於|大於 0|不可為/)
    assert.doesNotMatch(r.reason || '', COLLOQ)
    assert.doesNotMatch(r.reason || '', SC)
  }
  // With paramRaw, blocking reason surfaces Formal detail (Confirm disabled)
  const block = featDlgBlockingReason({
    kind: 'box',
    params: { l: 0, w: 60, h: 40 },
    paramRaw: { l: '0' },
  })
  assert.ok(block, 'box l=0 must block')
  assert.doesNotMatch(block, COLLOQ)
  assert.match(illegalRejectStatus(block), /尺寸已拒絕/)
  assert.doesNotMatch(illegalRejectStatus(block), SC)

  // Legal dims clear
  assert.equal(
    featDlgBlockingReason({ kind: 'box', params: { l: 80, w: 60, h: 40 }, paramRaw: { l: '80', w: '60', h: '40' } }),
    null,
  )
})

test('ILLEGAL_LENGTH_DETAIL itself is Formal TC (timeline / editFeature shared string)', () => {
  assert.equal(ILLEGAL_LENGTH_DETAIL, '尺寸必須大於 0，未更改模型')
  assert.doesNotMatch(ILLEGAL_LENGTH_DETAIL, COLLOQ)
  assert.doesNotMatch(ILLEGAL_LENGTH_DETAIL, SC)
  const wrapped = illegalRejectStatus(ILLEGAL_LENGTH_DETAIL)
  assert.equal(wrapped, '尺寸已拒絕：尺寸必須大於 0，未更改模型')
  assert.ok(isIllegalRejectStatus(wrapped))
})

test('runtime: editFeature box a/b/c = 0 → Formal 繁中拒; tree unchanged; legal recovers', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], '已建立長方體'), true, g().status)
  const before = structuredClone(g().features)

  for (const key of ['a', 'b', 'c']) {
    await g().editFeature('box1', { [key]: 0 })
    assert.ok(isIllegalRejectStatus(g().status), `${key}=0 status=${g().status}`)
    assert.match(g().status, /尺寸已拒絕：尺寸必須大於 0/)
    assert.doesNotMatch(g().status, COLLOQ)
    assert.doesNotMatch(g().status, SC)
    assert.deepEqual(g().features, before, `${key}=0 must not mutate`)
  }

  await g().editFeature('box1', { a: -5 })
  assert.ok(isIllegalRejectStatus(g().status), g().status)
  assert.deepEqual(g().features, before)

  await g().editFeature('box1', { a: 90 })
  assert.equal(g().features.find((f) => f.id === 'box1')?.a, 90, g().status)
  assert.doesNotMatch(g().status, /尺寸已拒絕：尺寸必須大於 0/)
})

test('runtime: commitFeatDlg box l=0 → Formal refuse; dlg stays; no prim feature', async () => {
  reset()
  useApp.setState({
    featDlg: { kind: 'box', params: { l: 0, w: 60, h: 40, op: 'new', px: 0, py: 0, pz: 0 } },
  })
  await g().commitFeatDlg()
  assert.ok(isIllegalRejectStatus(g().status), g().status)
  assert.match(g().status, /尺寸已拒絕：尺寸必須大於 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.ok(!g().features.some((f) => f.type === 'prim' && f.shape === 'box'), 'no box committed')
  // Dialog left open so user can fix (featDlg not cleared on reject)
  assert.ok(g().featDlg, 'featDlg should stay open after refuse')
  assert.equal(g().featDlg?.kind, 'box')
})

test('runtime: after l=0 refuse, legal l still commits 長方體', async () => {
  reset()
  useApp.setState({
    featDlg: { kind: 'box', params: { l: 0, w: 50, h: 30, op: 'new', px: 0, py: 0, pz: 0 } },
  })
  await g().commitFeatDlg()
  assert.match(g().status, /尺寸已拒絕/)
  useApp.setState({
    featDlg: { kind: 'box', params: { l: 40, w: 50, h: 30, op: 'new', px: 0, py: 0, pz: 0 } },
  })
  await g().commitFeatDlg()
  const f = g().features.find((x) => x.type === 'prim' && x.shape === 'box')
  assert.ok(f, g().status)
  assert.equal(f.a, 40)
  assert.equal(f.b, 50)
  assert.equal(f.c, 30)
  assert.equal(g().featDlg, null)
  assert.doesNotMatch(g().status, COLLOQ)
})
