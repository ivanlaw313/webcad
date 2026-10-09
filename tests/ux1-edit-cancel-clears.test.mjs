// UX1 #3：雙擊時間線特徵（Edit Feature）→ 取消，唔可以留低底部「編輯「拉伸」」條（selectedFeature 要清）。
// 真瀏覽器證明：scripts/e2e-timeline-edit-cancel.mjs（修正前 4 FAIL：sel 仍係 b1/f1、條仍喺度）。
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
import test from 'node:test'
import assert from 'node:assert/strict'
await import('../src/worker/cad.worker.ts'); await globalThis.__wheelWorker.ready()
const { useApp } = await import('../src/store.ts')
const g = () => useApp.getState()
const base = [{ id: 'b1', type: 'extrude', profile: { kind: 'rect', a: [-20, -20], b: [20, 20] }, height: 30, operation: 'new' }, { id: 'f1', type: 'fillet', radius: 3, edges: 'vertical' }]
await g().applyFeatures(base, 'x')

test('featDlg edit (extrude / fillet) → cancelFeatDlg clears selection', () => {
  for (const id of ['b1', 'f1']) {
    g().openFeatDlgForEdit(id)
    assert.equal(g().featDlg?.editId, id); assert.equal(g().selectedFeature, id)
    g().cancelFeatDlg()
    assert.equal(g().featDlg, null); assert.equal(g().selectedFeature, null, id)
  }
})
test('creating (not editing) a feature then cancelling keeps the user selection as before', () => {
  useApp.setState({ selectedFeature: 'b1', featDlg: { kind: 'mirror', params: {} } })
  g().cancelFeatDlg()
  assert.equal(g().selectedFeature, 'b1')
})
test('hole / sweep / loft edit cancels clear the selection too; non-edit cancels unchanged', () => {
  useApp.setState({ holeMode: true, holeEditId: 'h1', selectedFeature: 'h1' }); g().cancelHole(); assert.equal(g().selectedFeature, null)
  useApp.setState({ holeMode: true, holeEditId: null, selectedFeature: 'b1' }); g().cancelHole(); assert.equal(g().selectedFeature, 'b1')
  useApp.setState({ sweepDlgOpen: true, sweepEditId: 's1', selectedFeature: 's1', polyPts: [[0, 0], [1, 1]] }); g().cancelSweepDlg(); assert.equal(g().selectedFeature, null); assert.deepEqual(g().polyPts, [])
  useApp.setState({ sweepDlgOpen: true, sweepEditId: null, selectedFeature: 'b1', polyPts: [[0, 0], [1, 1]] }); g().cancelSweepDlg(); assert.equal(g().polyPts.length, 2, 'new-sweep cancel keeps the drawn path')
  useApp.setState({ loftDlgOpen: true, loftEditId: 'l1', selectedFeature: 'l1' }); g().cancelLoftDlg(); assert.equal(g().selectedFeature, null)
})
