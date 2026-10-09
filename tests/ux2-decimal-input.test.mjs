// UX2 #2：倒角／圓角距離欄打「0.5」小數點唔可以俾「食咗」——中途狀態「0.」、香港中文輸入法句號「。」、歐陸「0,5」都要收。
import test from 'node:test'; import assert from 'node:assert/strict'
import { parseLen, normalizeWide } from '../src/io/units.ts'
test('every keystroke of 0.5 parses (no red flash / gate in the middle)', () => {
  assert.deepEqual(['0', '0.', '0.5'].map((s) => parseLen(s, 'mm')), [0, 0, 0.5])
  assert.equal(parseLen('5.', 'mm'), 5)
  assert.equal(parseLen('.', 'mm'), null)
})
test('IME full stop / fullwidth dot are decimal points', () => {
  assert.equal(parseLen('0。5', 'mm'), 0.5)
  assert.equal(parseLen('0｡5', 'mm'), 0.5)
  assert.equal(parseLen('０．５', 'mm'), 0.5)
  assert.equal(normalizeWide('1。25'), '1.25')
})
test('decimal comma accepted, thousands-looking comma still rejected', () => {
  assert.equal(parseLen('0,5', 'mm'), 0.5)
  assert.equal(parseLen('1，25', 'mm'), 1.25)
  assert.equal(parseLen('1,000', 'mm'), null)
  assert.equal(parseLen('1,2,3', 'mm'), null)
})
