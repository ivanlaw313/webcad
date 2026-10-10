// P1 C：扭轉 + 尖角折線 → 內核自動圓角後 frameTwistTaperSweep；失敗仍 Formal Traditional throw（唔靜默剝扭轉）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8')

test('commitSweepPath does not pre-refuse sharp polyline twist (kernel auto-fillets)', () => {
  const store = src('store.ts')
  const body = store.slice(store.indexOf('  commitSweepPath: async () => {'), store.indexOf('  addCoil: async () => {'))
  assert.doesNotMatch(body, /不能套用扭轉：路徑含尖角折線/)
  assert.match(body, /自動圓角尖角後 frameTwistTaperSweep/)
})

test('worker auto-fillets sharp path corners when twist≠0 then frameTwistTaperSweep', () => {
  const w = src('worker/cad.worker.ts')
  assert.match(w, /filletOpenPolylineCorners/)
  assert.match(w, /autoFilletRadiusForPath/)
  assert.match(w, /路徑 \$\{fr\.count\} 個尖角已自動圓角/)
  assert.match(w, /不能套用扭轉：此路徑在自動圓角後仍產生錯誤幾何/)
  assert.match(w, /扭轉／縮放掃掠失敗/)
  assert.doesNotMatch(w, /已退回無扭轉掃掠/)
  // circular profiles skip the volume gate (twist is a visual no-op)
  assert.match(w, /!plain2 && f\.profile/)
})

test('params CSV / design-table export headers are Traditional (no SC 参数/当前/设计)', () => {
  const store = src('store.ts')
  const panel = src('components/ParamsPanel.tsx')
  assert.match(store, /\['參數名', '值', '表達式'\]/)
  assert.match(store, /參數\.csv/)
  assert.match(store, /\['當前值'/)
  assert.match(store, /設計表\.csv/)
  assert.doesNotMatch(store, /\['当前值'/)
  assert.doesNotMatch(store, /-设计表\.csv/)
  assert.match(panel, /匯出參數 CSV/)
  assert.doesNotMatch(panel, /导出参数/)
})
