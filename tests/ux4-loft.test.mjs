// UX4 / CORE16 放樣回歸：3 截面薄壁唔再退回實心（亦唔會試 6 次抽殼卡住）、新放樣對話框重設薄壁、
// 由已完成草圖放樣唔再複製灰色草圖源、編輯現有放樣可以加／排／移除截面並更新 sketchIds。
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
  const buf = await W.exportSTEP(); if (!buf) return 0
  const shape = await importSTEP(new Blob([buf])); try { return measureVolume(shape) } finally { shape.delete() }
}
const reset = () => useApp.setState({ ...useApp.getInitialState(), appConfirm: async () => true }, true)
const bank = (plane, z, shape) => { g().sketchOnDatumPlane(plane, z); useApp.setState({ sketchShape: shape, sketchProfiles: [], skCons: [] }); g().addLoftSection() }
async function preview() {
  g().scheduleLoftPreview()
  for (let i = 0; i < 1000 && (g().loftPreviewBusy || !g().loftPreview); i++) await new Promise((r) => setTimeout(r, 30))
  return g().loftPreview
}
const three = () => { bank('XY', 0, { type: 'rect', a: [-40, -20], b: [40, 20] }); bank('XY', 30, { type: 'circle', c: [0, 0], r: 15 }); bank('XY', 60, { type: 'rect', a: [-10, -10], b: [10, 10] }) }

test('3 sections + 薄壁 2mm: preview AND 確定 are really hollow, no 「退回實心」, bounded time', async () => {
  reset(); three(); g().openLoftDlg()
  const solid = (await preview()).volume
  g().setLoftOpt({ loftWall: 2 })
  const t0 = Date.now(); const thin = await preview()
  assert.ok(thin.mesh && thin.volume < solid * 0.5 && thin.volume > 1000, `thin ${thin.volume} vs ${solid}`)
  assert.ok(!thin.warnings.some((w) => /失敗|退回/.test(w)), thin.warnings.join(';'))
  await g().commitLoft()
  const dt = Date.now() - t0
  assert.equal(g().features.filter((f) => f.type === 'loft').length, 1, g().status)
  const v = await bodyVolume()
  assert.ok(Math.abs(v - thin.volume) < 1e-3 * thin.volume, `commit volume ${v} = preview ${thin.volume}`)
  assert.ok(dt < 40000, `preview+commit took ${dt} ms`)
})

test('P3: a new loft dialog starts at 薄壁 0 (does not inherit the previous loft)', async () => {
  reset(); bank('XY', 0, { type: 'rect', a: [-20, -20], b: [20, 20] }); bank('XY', 60, { type: 'circle', c: [0, 0], r: 15 })
  g().openLoftDlg(); g().setLoftOpt({ loftWall: 3, loftRuled: true }); await g().commitLoft()
  bank('XY', 100, { type: 'rect', a: [-20, -20], b: [20, 20] }); bank('XY', 160, { type: 'circle', c: [0, 0], r: 15 })
  g().openLoftDlg()
  assert.equal(g().loftWall, 0); assert.equal(g().loftRuled, false)
  g().cancelLoftDlg()
})

test('#11 + edit: loft from finished sketches reuses their ids (no grey copies); editing adds / removes sections and updates sketchIds', async () => {
  reset()
  for (const [z, shape] of [[0, { type: 'rect', a: [-20, -20], b: [20, 20] }], [40, { type: 'circle', c: [0, 0], r: 15 }], [80, { type: 'rect', a: [-8, -8], b: [8, 8] }]]) {
    g().sketchOnDatumPlane('XY', z); useApp.setState({ sketchShape: shape, sketchProfiles: [], skCons: [] }); await g().commitStandaloneSketch()
  }
  const sks = g().features.filter((f) => f.type === 'sketch').map((f) => f.sketchId)
  const nSrc = Object.keys(g().sketchSources).length
  g().addLoftSectionFromSketch(sks[0]); g().addLoftSectionFromSketch(sks[1])
  g().openLoftDlg(); await g().commitLoft()
  const loft = g().features.find((f) => f.type === 'loft')
  assert.deepEqual(loft.sketchIds, [sks[0], sks[1]], 'references the existing sketches')
  assert.equal(Object.keys(g().sketchSources).length, nSrc, 'no duplicated sketch sources (草圖4/5)')
  const v2 = await bodyVolume()
  // 編輯：加第三個截面
  g().openFeatDlgForEdit(loft.id)
  await new Promise((r) => setTimeout(r, 300))
  assert.equal(g().loftEditId, loft.id)
  assert.equal(g().loftSecSrcs.length, 2, 'section sources rebuilt from sketchIds')
  g().addLoftSectionFromSketch(sks[2])
  assert.equal(g().loftSections.length, 3, g().status + JSON.stringify(Object.keys(g().sketchSources)) + sks)
  const pv = await preview(); assert.ok(pv.mesh && !pv.error, pv.error)
  await g().commitLoft()
  const after = g().features.find((f) => f.id === loft.id)
  assert.equal(after.sections.length, 3, g().status + " busy=" + g().busy); assert.deepEqual(after.sketchIds, sks)
  assert.equal(g().features.filter((f) => f.type === 'loft').length, 1, 'edited in place')
  assert.equal(g().timelinePos, g().features.length, 'timeline back at the end')
  const v3 = await bodyVolume(); assert.ok(v3 > v2 * 1.2, `taller loft ${v3} > ${v2}`)
  // 編輯：移除中間截面
  g().openFeatDlgForEdit(loft.id); await new Promise((r) => setTimeout(r, 300))
  g().removeLoftSection(1); assert.equal(g().loftSections.length, 2, g().status)
  await g().commitLoft()
  assert.deepEqual(g().features.find((f) => f.id === loft.id).sketchIds, [sks[0], sks[2]])
})
