// Goal A：扭轉／末端縮放本地草稿政策 — 0／空白扭轉 OK；非法 Formal TC；縮放唔靜默變 1
// FISHING33：打字唔即 write；blur／debounce 先 write
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  parseSweepTwistDraft, parseSweepScaleDraft,
  sweepDraftType, sweepDraftBlur, sweepDraftShown, sweepDraftDebounceFlush,
  SWEEP_DRAFT_DEBOUNCE_MS,
} from '../src/cad/sweepTwistFields.ts'

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

test('type never writes store; pending for debounce; blur/debounce flush writes', () => {
  assert.ok(SWEEP_DRAFT_DEBOUNCE_MS >= 150 && SWEEP_DRAFT_DEBOUNCE_MS <= 250)
  let st = { draft: null }, store = 0
  for (const k of ['9', '90']) {
    const r = sweepDraftType(k, store, parseSweepTwistDraft)
    st = r.next
    assert.equal(r.write, null, 'type must not write store')
    assert.equal(r.pending, Number(k))
    assert.equal(sweepDraftShown(st, store), k)
  }
  // debounce flush writes without clearing draft
  const fl = sweepDraftDebounceFlush(90, store)
  assert.equal(fl.write, 90)
  store = fl.write
  assert.equal(sweepDraftShown(st, store), '90', 'draft kept after debounce write')
  // blur clears draft after write (already equal → write null)
  const b = sweepDraftBlur(st, store, parseSweepTwistDraft)
  assert.equal(b.write, null)
  assert.equal(b.next.draft, null)

  // scale mid-typing: illegal pending null, no write
  const mid = sweepDraftType('0.', 1, parseSweepScaleDraft)
  assert.equal(mid.write, null)
  assert.equal(mid.pending, null)
  assert.equal(sweepDraftShown(mid.next, 1), '0.')
  const done = sweepDraftType('0.5', 1, parseSweepScaleDraft)
  assert.equal(done.write, null)
  assert.equal(done.pending, 0.5)
  const blur = sweepDraftBlur(done.next, 1, parseSweepScaleDraft)
  assert.equal(blur.write, 0.5)
  assert.equal(blur.next.draft, null)
})

test('Viewport uses local draft inputs (no Number||1 eaten digits); Formal TC alerts; SC-free hints; debounce', () => {
  const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
  const i = vp.indexOf('{sweepDlgOpen &&')
  const j = vp.indexOf('{loftDlgOpen &&', i)
  const chunk = vp.slice(i, j)
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
  const comp = vp.slice(vp.indexOf('function SweepDraftField('), vp.indexOf('function LenInput('))
  assert.match(comp, /SWEEP_DRAFT_DEBOUNCE_MS/)
  assert.match(comp, /sweepDraftDebounceFlush/)
  assert.match(comp, /onChange=\{\(e\) => \{[\s\S]*?sweepDraftType[\s\S]*?st\.pending/)
  assert.match(comp, /setTimeout\([\s\S]*?SWEEP_DRAFT_DEBOUNCE_MS\)/)
  assert.doesNotMatch(comp, /onChange=\{\(e\) => \{[^}]*if \(st\.write != null\) onValue/, 'onChange must not write on every key via st.write')
})

test('cancelSweepDlg discards preview; setSweepScale does not silent-coerce ≤0 to 1', () => {
  const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  assert.match(store, /cancelSweepDlg: \(\) => set\(\(s\) => \(\{[^}]*sweepPreview: null/)
  assert.match(store, /setSweepScale: \(n\) => set\(\(st\) => \(\{ sweepScale: \(Number\.isFinite\(n\) && n > 0\) \? n : st\.sweepScale \}/)
})
