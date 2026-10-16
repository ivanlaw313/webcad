/**
 * CORE16 residual more5: Sweep (掃掠) illegal refuse.
 * Tube Ø≤0 / illegal twist&scale → Formal 繁中 refuse; must NOT silently reset.
 * Reuses sweep-twist refuse patterns (p1-sweep-twist-refuse + sweepTwistFields) without
 * pure-dup of sweep-dia-validation — adds Formal marker, scale≤0, worker no-silent-strip.
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
  parseSweepTwistDraft,
  parseSweepScaleDraft,
} = await import('../src/cad/sweepTwistFields.ts')
const { isIllegalRejectStatus } = await import('../src/ui/illegalInput.ts')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/
const SC = /尺寸已拒绝|管径|扭转必须|必须大于|已退回无扭转/

async function openSweepWithPath() {
  useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
  g().startSketch()
  g().chooseSketchPlane('XY')
  useApp.setState({ polyPts: [[0, 0], [50, 0]], polyBulges: [0], sketchTool: 'polyline' })
  await g().finishOpenPolyline()
  await g().commitStandaloneSketch()
  const pathId = Object.keys(g().sketchSources).find((k) =>
    g().sketchSources[k].shapes.some((s) => s.type === 'poly' && s.open),
  )
  assert.ok(pathId, 'open path sketch')
  g().setSelSketch(pathId)
  await g().runCommand('sweep', 'Sweep')
  assert.equal(g().sweepDlgOpen, true, g().status)
  useApp.setState({ sketchOp: 'new', sweepSection: 'circle' })
}

test('source: Ø gate + twist fail Formal TC; worker never silent-strips twist', () => {
  const st = rd('src/store.ts')
  const w = rd('src/worker/cad.worker.ts')
  assert.match(st, /尺寸已拒絕：管徑 Ø 必須大於 0/)
  assert.match(st, /setSweepDia: \(n\) => set\(\(st\) => \(\{ sweepDia: Number\.isFinite\(n\) \? n : st\.sweepDia/)
  assert.match(st, /CORE16：圓形截面管徑 0／空白唔可以靜靜雞變返 12/)
  // P1 C / p1-sweep-twist-refuse: kernel auto-fillets; fail still Formal throw (no silent strip)
  assert.match(w, /扭轉／縮放掃掠失敗/)
  assert.doesNotMatch(w, /已退回無扭轉掃掠/)
  assert.doesNotMatch(w, /已退回无扭转扫掠/)
  assert.match(st, /唔好靜默剝扭轉|自動圓角尖角後 frameTwistTaperSweep/)
})

test('parseSweepTwistDraft / parseSweepScaleDraft: illegal → Formal 尺寸已拒絕; 0 twist OK; scale 0 refuse', () => {
  const z = parseSweepTwistDraft('0')
  assert.equal(z.ok, true)
  assert.equal(z.value, 0)

  const blank = parseSweepTwistDraft('')
  assert.equal(blank.ok, true)
  assert.equal(blank.value, 0)

  for (const bad of ['abc', '12x', '--', 'NaN']) {
    const r = parseSweepTwistDraft(bad)
    assert.equal(r.ok, false, bad)
    assert.ok(isIllegalRejectStatus(r.reason), r.reason)
    assert.match(r.reason, /扭轉必須是有效數值/)
    assert.doesNotMatch(r.reason, COLLOQ)
    assert.doesNotMatch(r.reason, SC)
  }

  const s0 = parseSweepScaleDraft('0')
  assert.equal(s0.ok, false)
  assert.ok(isIllegalRejectStatus(s0.reason), s0.reason)
  assert.match(s0.reason, /末端縮放必須大於 0/)
  assert.doesNotMatch(s0.reason, COLLOQ)

  const sNeg = parseSweepScaleDraft('-1')
  assert.equal(sNeg.ok, false)
  assert.match(sNeg.reason, /必須大於 0/)
})

test('runtime: setSweepDia(0/-3) kept (no silent 12); commit → Formal Ø refuse; dlg stays', async () => {
  await openSweepWithPath()
  const before = structuredClone(g().features)
  for (const bad of [0, -3]) {
    g().setSweepDia(bad)
    assert.equal(g().sweepDia, bad, `must keep illegal Ø=${bad} (no silent reset to 12)`)
    await g().commitSweepPath()
    assert.equal(g().sweepDlgOpen, true)
    assert.ok(isIllegalRejectStatus(g().sweepError), g().sweepError)
    assert.match(g().sweepError || '', /管徑 Ø 必須大於 0/)
    assert.match(g().status, /掃掠未能建立|管徑/)
    assert.doesNotMatch(g().sweepError || '', COLLOQ)
    assert.doesNotMatch(g().sweepError || '', SC)
    assert.deepEqual(g().features.map((f) => f.id), before.map((f) => f.id))
    assert.ok(!g().features.some((f) => f.type === 'sweep'))
  }
})

test('runtime: setSweepScale does not silent-coerce ≤0 to 1; illegal scale stays', () => {
  useApp.setState({ ...useApp.getInitialState(), sweepScale: 1, lang: 'zh-HK' }, true)
  g().setSweepScale(0)
  assert.equal(g().sweepScale, 1, 'setSweepScale must refuse ≤0 without writing (keep prior)')
  g().setSweepScale(-2)
  assert.equal(g().sweepScale, 1)
  g().setSweepScale(0.5)
  assert.equal(g().sweepScale, 0.5)
  // source pin
  const st = rd('src/store.ts')
  assert.match(st, /setSweepScale: \(n\) => set\(\(st\) => \(\{ sweepScale: \(Number\.isFinite\(n\) && n > 0\) \? n : st\.sweepScale \}/)
})

test('runtime: after Ø refuse, legal Ø still commits (atomic recover)', async () => {
  await openSweepWithPath()
  g().setSweepDia(0)
  await g().commitSweepPath()
  assert.equal(g().sweepDlgOpen, true)
  assert.match(g().sweepError || '', /管徑 Ø 必須大於 0/)
  g().setSweepDia(8)
  g().setSweepTwist(0) // twist 0 is legal (no twist)
  await g().commitSweepPath()
  assert.ok(g().features.some((f) => f.type === 'sweep' && Math.abs(f.r - 4) < 1e-6), g().status)
  assert.equal(g().sweepDlgOpen, false)
  assert.equal(g().sweepError, null)
  assert.doesNotMatch(g().status, COLLOQ)
})

test('runtime: Viewport wires Formal TC alerts for twist/scale drafts', () => {
  const vp = rd('src/components/Viewport.tsx')
  assert.match(vp, /parseSweepTwistDraft/)
  assert.match(vp, /parseSweepScaleDraft/)
  assert.match(vp, /data-testid=\{`\$\{testid\}-alert`\}/)
  assert.match(vp, /sweepTwistScaleBad/)
  assert.doesNotMatch(vp, /setSweepScale\(Number\(e\.target\.value\) \|\| 1\)/)
})
