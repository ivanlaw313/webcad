// P1 C：扭轉唔可以靜默剝走 — 尖角折線提交前拒絕；內核失敗要 throw。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8')

test('commitSweepPath refuses twist on sharp polyline before applyFeatures', () => {
  const store = src('store.ts')
  const body = store.slice(store.indexOf('  commitSweepPath: async () => {'), store.indexOf('  addCoil: async () => {'))
  assert.match(body, /不能套用扭轉：路徑含尖角折線/)
  assert.match(body, /swTwist && !isSpline/)
  assert.ok(body.indexOf('不能套用扭轉') < body.indexOf('applyFeatures([...get().features, f]'), 'refuse before applyFeatures')
})

test('worker twist failure throws Formal Traditional (no silent plain fallback)', () => {
  const w = src('worker/cad.worker.ts')
  assert.match(w, /扭轉掃掠在此路徑（尖角折線）產生錯誤幾何/)
  assert.match(w, /扭轉／縮放掃掠失敗/)
  assert.doesNotMatch(w, /已退回無扭轉掃掠/)
  // circular profiles skip the volume gate (twist is a visual no-op)
  assert.match(w, /!plain2 && f\.profile/)
})
