// P1 B：雙距離唔可以確定後靜默改等距 — UI／store 拒絕；內核唔再 fallback。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8')

test('setChamferMode(two) refused with Formal Traditional; commitEdgeRound blocks two', () => {
  const store = src('store.ts')
  assert.match(store, /雙距離倒角暫未支援/)
  const start = store.indexOf('  setChamferMode: (m) => {')
  assert.ok(start > 0)
  const scm = store.slice(start, store.indexOf('  setChamferSize2:', start))
  assert.match(scm, /if \(m === 'two'\)/)
  assert.match(scm, /chamferMode: 'equal'/)
  assert.match(store, /if \(kind === 'chamfer' && get\(\)\.chamferMode === 'two'\) \{ set\(\{ status: '雙距離倒角暫未支援/)
})

test('chamferAsym throws instead of equal-distance fallback', () => {
  const w = src('worker/cad.worker.ts')
  const block = w.slice(w.indexOf('function chamferAsym'), w.indexOf('function ptTriDist2'))
  assert.match(block, /throw new Error\(`\$\{kind\}倒角失敗/)
  assert.doesNotMatch(block, /已改为等距|已改為等距/)
})

test('Viewport disables 雙距離 option with Traditional reason', () => {
  const vp = src('components/Viewport.tsx')
  assert.match(vp, /option value="two" disabled/)
  assert.match(vp, /雙距離暫未支援/)
})
