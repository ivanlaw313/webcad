// RETEST19 #6：刪除前嘅依賴試建唔可以將失敗訊息（「圓角半徑太大」/「操作失敗」）閃上狀態列 —— 確認框出嚟時狀態列要乾淨。
// P2：無依賴時亦會先問「刪除？」，之後先到試建失敗嘅第二道確認。
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
import test from 'node:test'
import assert from 'node:assert/strict'
await import('../src/worker/cad.worker.ts'); await globalThis.__wheelWorker.ready()
const { useApp } = await import('../src/store.ts')
const g = () => useApp.getState()
const ids = () => g().features.map((f) => f.id)
const seen = []; useApp.subscribe((s, p) => { if (s.status !== p.status) seen.push(s.status) })
const conf = []
// Always accept the first 「刪除？」 so the probe dialog is reached; `answer` controls the cascade/probe confirm.
let answer = false
useApp.setState({ appConfirm: async (m) => {
  conf.push({ m, status: g().status, failed: [...g().failedFeatureIds] })
  if (/會重建失敗|被以下特徵依賴/.test(m)) return answer
  return true
} })
const LEAK = /半径太大|半徑太大|操作失敗|重建失敗|重建失败/
const slab = { id: 'e1', type: 'extrude', profile: { kind: 'rect', a: [-30, -20], b: [30, 20] }, height: 3, operation: 'new' }
const tall = { id: 'e2', type: 'extrude', profile: { kind: 'rect', a: [-30, -20], b: [30, 20] }, height: 12, operation: 'join' }
const big = { id: 'f1', type: 'fillet', radius: 8, nears: [[0, 20, 12]] }
const plate = { id: 'p1', type: 'extrude', profile: { kind: 'rect', a: [-30, -20], b: [30, 20] }, height: 12, operation: 'new' }
const fil = { id: 'f2', type: 'fillet', radius: 2, nears: [[0, 20, 12]] }
const reset = () => { seen.length = 0; conf.length = 0 }

for (const ans of [false, true]) {
  test(`kernel failure (fillet radius too large after delete), confirm=${ans}: no status flash before the dialog`, async () => {
    assert.ok(await g().applyFeatures([slab, tall, big], 'base')); reset(); answer = ans
    await g().requestRemoveFeature('e2')
    assert.ok(conf.length >= 1)
    const probe = conf.find((c) => /圓角1|會重建失敗/.test(c.m))
    assert.ok(probe, JSON.stringify(conf.map((c) => c.m)))
    assert.match(probe.m, /圓角1/)
    assert.equal(probe.status, 'base')
    assert.deepEqual(probe.failed, [])
    assert.ok(!seen.some((x) => LEAK.test(x)), JSON.stringify(seen))
    assert.deepEqual(ids(), ans ? ['e1'] : ['e1', 'e2', 'f1'])
    if (ans) assert.match(g().status, /已刪除 2 個特徵/)
    else assert.match(g().status, /已取消刪除/)
    assert.equal(g().failedFeatureIds.length, 0)
  })
}

test('deleting the only body under a fillet: asks once (or twice), no failure flash', async () => {
  assert.ok(await g().applyFeatures([plate, fil], 'base')); reset(); answer = false
  await g().requestRemoveFeature('p1')
  assert.ok(conf.length >= 1)
  assert.equal(conf[0].status, 'base')
  assert.ok(!seen.some((x) => LEAK.test(x)), JSON.stringify(seen))
  assert.deepEqual(ids(), ['p1', 'f2'])
})
