/**
 * CORE16 residual more18: Sweep 末端縮放 (end scale) 0 / negative → Formal 繁中拒.
 * Complements core16-sweep-illegal-refuse (Ø gate + twist) + sweep-twist-fields
 * with an end-scale-focused residual: draft 0/≤0/blank Formal TC, setSweepScale
 * never silent-coerces ≤0→1, Viewport alert wiring. No product fix.
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
const { parseSweepScaleDraft, parseSweepTwistDraft } = await import('../src/cad/sweepTwistFields.ts')
const { isIllegalRejectStatus } = await import('../src/ui/illegalInput.ts')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/
const SC = /尺寸已拒绝|末端缩放|必须大于/

test('source: 末端縮放 Formal TC gate; setSweepScale keeps prior on ≤0', () => {
  const st = rd('src/store.ts')
  const fields = rd('src/cad/sweepTwistFields.ts')
  const vp = rd('src/components/Viewport.tsx')

  assert.match(fields, /末端縮放必須大於 0/)
  assert.match(fields, /末端縮放不可留空/)
  assert.match(fields, /末端縮放必須是有效數值/)
  assert.doesNotMatch(fields, /末端缩放必须|不可留空（必须/)
  assert.match(st, /setSweepScale: \(n\) => set\(\(st\) => \(\{ sweepScale: \(Number\.isFinite\(n\) && n > 0\) \? n : st\.sweepScale \}/)
  assert.match(st, /唔靜默變 1|非法由對話框本地草稿 Formal TC/)
  assert.match(vp, /<SweepDraftField key="sweep-scale" testid="sweep-scale"/)
  assert.match(vp, /parseSweepScaleDraft/)
  assert.match(vp, /sweepTwistScaleBad/)
  assert.doesNotMatch(vp, /setSweepScale\(Number\(e\.target\.value\) \|\| 1\)/)
})

test('parseSweepScaleDraft: 0 / negative / blank → Formal 尺寸已拒絕; legal >0 OK', () => {
  for (const bad of ['0', '-1', '-0.5', '', 'abc', '0.']) {
    const r = parseSweepScaleDraft(bad)
    assert.equal(r.ok, false, `expected refuse for ${JSON.stringify(bad)}`)
    assert.ok(isIllegalRejectStatus(r.reason), r.reason)
    assert.match(r.reason || '', /尺寸已拒絕/)
    assert.match(r.reason || '', /末端縮放/)
    assert.doesNotMatch(r.reason || '', COLLOQ)
    assert.doesNotMatch(r.reason || '', SC)
  }
  // Contrast: twist 0 / blank is legal (no twist)
  assert.equal(parseSweepTwistDraft('0').ok, true)
  assert.equal(parseSweepTwistDraft('').ok, true)

  const ok = parseSweepScaleDraft('0.5')
  assert.equal(ok.ok, true)
  assert.equal(ok.value, 0.5)
  assert.equal(parseSweepScaleDraft('1').ok, true)
  assert.equal(parseSweepScaleDraft('2').value, 2)
})

test('runtime: setSweepScale(0/-3) keeps prior; legal write; no silent coerce to 1', () => {
  useApp.setState({ ...useApp.getInitialState(), sweepScale: 1, lang: 'zh-HK' }, true)
  g().setSweepScale(0)
  assert.equal(g().sweepScale, 1, '0 must not write (keep prior 1)')
  g().setSweepScale(-3)
  assert.equal(g().sweepScale, 1, 'negative must not write')
  g().setSweepScale(NaN)
  assert.equal(g().sweepScale, 1)
  g().setSweepScale(0.25)
  assert.equal(g().sweepScale, 0.25)
  g().setSweepScale(0)
  assert.equal(g().sweepScale, 0.25, 'after legal 0.25, 0 still keeps prior (not silent 1)')
  g().setSweepScale(1)
  assert.equal(g().sweepScale, 1)
})

test('runtime: Viewport wires Formal TC alert for scale draft (no Number||1)', () => {
  const vp = rd('src/components/Viewport.tsx')
  const i = vp.indexOf('{sweepDlgOpen &&')
  const j = vp.indexOf('{loftDlgOpen &&', i)
  assert.ok(i >= 0 && j > i, 'sweep dlg chunk')
  const chunk = vp.slice(i, j)
  assert.match(chunk, /label="末端縮放"/)
  assert.match(chunk, /parseSweepScaleDraft/)
  assert.match(chunk, /onBadChange=\{setSweepScaleBad\}/)
  assert.match(vp, /data-testid=\{`\$\{testid\}-alert`\}/)
  assert.doesNotMatch(chunk, /setSweepScale\(Number\(e\.target\.value\) \|\| 1\)/)
})
