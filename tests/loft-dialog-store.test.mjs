// 放樣對話框 + 真 worker（native-car-loader 載入 cad.worker.ts）：
//  - 方(XY@0) → 圓(XY@60) 預覽 = 確定後結果（同一段 makeLoftSolid；體積一致）
//  - >2 截面、非平行截面（XZ 直立圓）、↑↓ 排序、✕ 移除、由下拉揀已完成草圖加截面
//  - 加料／切割／相交／新實體 四種操作體積合理
//  - 失敗（重疊截面）有清楚繁體原因
import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
await globalThis.__wheelWorker.ready()
const { useApp } = await import('../src/store.ts')
const g = () => useApp.getState()
const W = globalThis.__wheelWorker

async function bodyVolume() {
  const { importSTEP, measureVolume } = await import('replicad')
  const buf = await W.exportSTEP()
  if (!buf) return 0
  const shape = await importSTEP(new Blob([buf]))
  try { return measureVolume(shape) } finally { shape.delete() }
}
const square = { type: 'rect', a: [-20, -20], b: [20, 20] }
const circle = (r = 15) => ({ type: 'circle', c: [0, 0], r })
function bank(plane, z, shape) {
  g().sketchOnDatumPlane(plane, z)
  assert.equal(g().mode, 'sketch')
  useApp.setState({ sketchShape: shape, sketchProfiles: [], skCons: [] })
  g().addLoftSection()
}
function reset() { useApp.setState({ ...useApp.getInitialState(), appConfirm: async () => true }, true) }
async function preview() {
  g().scheduleLoftPreview()
  for (let i = 0; i < 100 && (g().loftPreviewBusy || !g().loftPreview); i++) await new Promise((r) => setTimeout(r, 30))
  return g().loftPreview
}

test('square → circle: kernel preview matches the committed loft (volume) and is untwisted-range', async () => {
  reset()
  bank('XY', 0, square); bank('XY', 60, circle())
  g().openLoftDlg(); assert.equal(g().loftDlgOpen, true)
  const pv = await preview()
  assert.ok(pv && pv.mesh && pv.mesh.triangles.length > 0, `preview mesh: ${pv?.error}`)
  assert.ok(!pv.error)
  assert.ok(pv.edges.length >= 6, 'preview carries the real B-rep section/side edges')
  const expected = 60 / 6 * (1600 + Math.PI * 225 + 2 * (1600 + Math.PI * 225))
  assert.ok(Math.abs(pv.volume - expected) / expected < 0.05, `preview volume ${pv.volume} ≈ ${expected}`)
  await g().commitLoft()
  assert.equal(g().mode, 'model', g().status)
  const v = await bodyVolume()
  assert.ok(Math.abs(v - pv.volume) < 1e-3 * v, `committed volume ${v} == preview ${pv.volume}`)
})

test('3 sections incl. a vertical (XZ) one; reorder + remove + commit honour the dialog order', async () => {
  reset()
  bank('XY', 0, square); bank('XY', 60, circle()); bank('XZ', 40, circle(10))
  assert.equal(g().loftSections.length, 3)
  g().openLoftDlg()
  const pv3 = await preview()
  assert.ok(pv3?.mesh, `3-section mixed-plane preview builds: ${pv3?.error}`)
  // 將直立圓（第 3）移去第 2 位
  g().moveLoftSection(2, -1)
  assert.equal(g().loftOrderManual, true)
  assert.deepEqual(g().loftSections.map((s) => s.plane), ['XY', 'XZ', 'XY'])
  g().removeLoftSection(1)
  assert.deepEqual(g().loftSections.map((s) => [s.plane, s.z]), [['XY', 0], ['XY', 60]])
  g().moveLoftSection(0, 1)   // 手動倒轉：60 → 0
  await g().commitLoft()
  const loft = g().features.find((f) => f.type === 'loft')
  assert.ok(loft, g().status)
  assert.deepEqual(loft.sections.map((s) => s.z), [60, 0], 'manual order kept (not re-sorted by z)')
  assert.ok((await bodyVolume()) > 40000)
})

test('add a finished sketch from the dialog dropdown (third circle on another plane is usable)', async () => {
  reset()
  for (const [plane, z, shape] of [['XY', 0, square], ['XY', 60, circle()], ['YZ', 30, circle(8)]]) {
    g().sketchOnDatumPlane(plane, z)
    useApp.setState({ sketchShape: shape, sketchProfiles: [], skCons: [] })
    await g().commitStandaloneSketch()
  }
  const sks = g().features.filter((f) => f.type === 'sketch' && f.sketchId)
  assert.equal(sks.length, 3, 'three standalone sketches')
  g().addLoftSectionFromSketch(sks[0].sketchId); g().addLoftSectionFromSketch(sks[1].sketchId)
  assert.equal(g().loftSections.length, 2)
  g().addLoftSectionFromSketch(sks[2].sketchId)
  assert.equal(g().loftSections.length, 3, g().status)
  assert.ok(g().loftSecSrcs.every((x) => x.label && x.skId), 'rows carry a sketch label for the dialog list')
})

for (const op of ['cut', 'intersect', 'newbody']) test(`operation ${op} applies the lofted tool to an existing body`, async () => {
  reset()
  // 直接落一個 100×100×30 拉伸盒（中心喺原點）
  await g().applyFeatures([{ id: 'bx', type: 'extrude', profile: { kind: 'rect', a: [-50, -50], b: [50, 50] }, height: 30, operation: 'new' }], 'box')
  const v0 = await bodyVolume()
  assert.ok(v0 > 0, 'seed box built')
  bank('XY', -10, square); bank('XY', 50, circle())
  useApp.setState({ sketchOp: op })
  g().openLoftDlg()
  await g().commitLoft()
  const loft = g().features.find((f) => f.type === 'loft')
  assert.equal(loft?.op, op, g().status)
  const v = await bodyVolume()
  if (op === 'cut') assert.ok(v < v0 && v > v0 * 0.5, `cut ${v} < ${v0}`)
  if (op === 'intersect') assert.ok(v > 0 && v < 30 * 1600 + 1, `intersect ${v}`)
  if (op === 'newbody') assert.ok(Math.abs(v - v0) < 1e-3 * v0 || v > v0, `newbody keeps the active body ${v} vs ${v0}`)
})

test('coincident sections fail with a clear Traditional reason in the preview', async () => {
  const f = { id: 'x', type: 'loft', op: 'new', sections: [
    { profile: { kind: 'rect', a: [-20, -20], b: [20, 20] }, z: 0, plane: 'XY' },
    { profile: { kind: 'circle', c: [0, 0], r: 10 }, z: 0, plane: 'XY', arbPlane: { o: [0, 0, 0], xd: [1, 0, 0], n: [0, 0, 1] } },
  ] }
  const r = await W.previewLoft(f)
  assert.equal(r.mesh, null)
  assert.match(r.error, /放樣失敗：第 1 同第 2 個截面喺同一位置/)
})

test('a planar face of the body can be picked as a loft section (top face → circle above)', async () => {
  reset()
  await g().applyFeatures([{ id: 'bx', type: 'extrude', profile: { kind: 'rect', a: [-20, -20], b: [20, 20] }, height: 30, operation: 'new' }], 'box')
  const v0 = await bodyVolume()
  await g().addLoftSectionFromFace([5, 5, 30], [0, 0, 1])
  assert.equal(g().loftSections.length, 1, g().status)
  assert.ok(g().loftSections[0].arbPlane, 'face section stored on its own plane frame')
  assert.match(g().loftSecSrcs[0].label, /平面 1/)
  const curved = await W.planarFaceLoopAt([20, 0, 15])
  assert.ok(!('error' in curved), 'side wall is planar too')
  bank('XY', 70, circle())
  g().openLoftDlg()
  const pv = await preview()
  assert.ok(pv?.mesh, pv?.error)
  await g().commitLoft()
  const v = await bodyVolume()
  assert.ok(v > v0 + 40 * 1000, `joined loft grows the body ${v} > ${v0}`)
  assert.ok(!g().features.find((f) => f.type === 'loft').sketchIds, 'face section → no fake sketch sources archived')
})
