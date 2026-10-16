// Goal A：扭轉／末端縮放本地草稿政策 — 0／空白扭轉 OK；非法 Formal TC；縮放唔靜默變 1
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseSweepTwistDraft, parseSweepScaleDraft } from '../src/cad/sweepTwistFields.ts'

test('twist: blank and 0 are OK; intermediate "90" / "-15" OK; abc Formal TC', () => {
  assert.deepEqual(parseSweepTwistDraft(''), { ok: true, value: 0, reason: null })
  assert.deepEqual(parseSweepTwistDraft('0'), { ok: true, value: 0, reason: null })
  assert.deepEqual(parseSweepTwistDraft('90'), { ok: true, value: 90, reason: null })
  assert.deepEqual(parseSweepTwistDraft('-15'), { ok: true, value: -15, reason: null })
  assert.deepEqual(parseSweepTwistDraft('12.5'), { ok: true, value: 12.5, reason: null })
  const bad = parseSweepTwistDraft('abc')
  assert.equal(bad.ok, false)
  assert.match(bad.reason, /扭轉必須是有效數值/)
  assert.match(bad.reason, /abc/)
})

test('scale: must be >0; blank/0/abc Formal TC — never silent 1', () => {
  assert.deepEqual(parseSweepScaleDraft('1'), { ok: true, value: 1, reason: null })
  assert.deepEqual(parseSweepScaleDraft('0.5'), { ok: true, value: 0.5, reason: null })
  // typing "0." mid-way must NOT coerce to 1 — invalid until complete >0 number ends with digit
  const mid = parseSweepScaleDraft('0.')
  assert.equal(mid.ok, false, '0. alone is not a finished >0 scale')
  const blank = parseSweepScaleDraft('')
  assert.equal(blank.ok, false)
  assert.match(blank.reason, /不可留空/)
  const zero = parseSweepScaleDraft('0')
  assert.equal(zero.ok, false)
  assert.match(zero.reason, /必須大於 0/)
  const abc = parseSweepScaleDraft('xyz')
  assert.equal(abc.ok, false)
  assert.match(abc.reason, /xyz/)
})

test('Viewport uses local draft inputs (no Number||1 eaten digits); Formal TC alerts; SC-free hints', () => {
  const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
  const i = vp.indexOf('{sweepDlgOpen &&')
  const j = vp.indexOf('{loftDlgOpen &&', i)
  const chunk = vp.slice(i, j)
  // FISHING31：欄位搬入模組級 <SweepDraftField>（testid = `${testid}-input` / `-alert`）
  assert.match(chunk, /<SweepDraftField key="sweep-twist" testid="sweep-twist"/)
  assert.match(chunk, /<SweepDraftField key="sweep-scale" testid="sweep-scale"/)
  assert.match(vp, /data-testid=\{`\$\{testid\}-input`\}/)
  assert.match(vp, /data-testid=\{`\$\{testid\}-alert`\}/)
  assert.match(chunk, /parseSweepTwistDraft/)
  assert.match(chunk, /parseSweepScaleDraft/)
  assert.doesNotMatch(chunk, /setSweepScale\(Number\(e\.target\.value\) \|\| 1\)/)
  assert.doesNotMatch(chunk, /setSweepTwist\(Number\(e\.target\.value\)\)/)
  assert.match(chunk, /適合沿已有實體邊/)
  assert.doesNotMatch(chunk, /适合沿已有/)
  assert.match(chunk, /按確定重建/)
  assert.doesNotMatch(chunk, /按确定重建/)
  assert.match(chunk, /sweepTwistScaleBad/)
})

test('cancelSweepDlg discards preview; setSweepScale does not silent-coerce ≤0 to 1', () => {
  const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  assert.match(store, /cancelSweepDlg: \(\) => set\(\(s\) => \(\{[^}]*sweepPreview: null/)
  assert.match(store, /setSweepScale: \(n\) => set\(\(st\) => \(\{ sweepScale: \(Number\.isFinite\(n\) && n > 0\) \? n : st\.sweepScale \}/)
})
