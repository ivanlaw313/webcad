// Dual-distance (asymmetric) chamfer: UI/store enabled; kernel must NOT silent-equal fallback.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8')

test('setChamferMode(two) enables 雙距離 and clears selection (Fusion type transition)', () => {
  const store = src('store.ts')
  assert.doesNotMatch(store, /雙距離倒角暫未支援|雙距離暫未支援/)
  const start = store.indexOf('  setChamferMode: (m) =>')
  assert.ok(start > 0)
  const scm = store.slice(start, store.indexOf('  setChamferSize2:', start))
  assert.match(scm, /chamferMode: m/)
  assert.match(scm, /雙距離：請重新選取稜/)
  assert.match(scm, /edgeRoundPicks:\s*\[\]/)
  // commit requires dist2 > 0 — never a blanket refuse of mode two
  assert.match(store, /if \(kind === 'chamfer' && get\(\)\.chamferMode === 'two' && !\(get\(\)\.chamferSize2 > 0\)\) \{ set\(\{ status: '雙距離：距離 2 必須大於 0'/)
  assert.doesNotMatch(store, /if \(kind === 'chamfer' && get\(\)\.chamferMode === 'two'\) \{ set\(\{ status: '雙距離倒角暫未支援/)
})

test('chamfer-edit refuses dist2≤0 in 雙距離 with Formal Traditional', () => {
  const store = src('store.ts')
  assert.match(store, /cmEdit === 'two' && !\(\+p\.dist2 > 0\)\) \{ set\(\{ status: illegalRejectStatus\('雙距離：距離 2 必須大於 0'\)/)
})

test('chamferAsym throws instead of equal-distance fallback', () => {
  const w = src('worker/cad.worker.ts')
  const block = w.slice(w.indexOf('function chamferAsym'), w.indexOf('function ptTriDist2'))
  assert.match(block, /throw new Error\(`\$\{kind\}倒角失敗/)
  assert.doesNotMatch(block, /已改为等距|已改為等距/)
  assert.match(block, /distances: \[d1, second\]/)
})

test('Viewport enables 雙距離 option (command + timeline edit)', () => {
  const vp = src('components/Viewport.tsx')
  assert.match(vp, /<option value="equal">等距<\/option><option value="two">雙距離<\/option><option value="angle">距離與角度<\/option>/)
  assert.match(vp, /tStatus\('雙距離', lang\)/)
  assert.doesNotMatch(vp, /option value="two" disabled/)
  assert.doesNotMatch(vp, /雙距離暫未支援|雙距離（暫未支援）/)
})
