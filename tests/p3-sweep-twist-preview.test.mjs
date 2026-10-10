// P3：掃掠對話框扭轉／縮放即時預覽 = 確定後結果（dry-run commit + previewSweep → 同 buildShape 自動圓角 + frameTwistTaperSweep）
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

function reset() {
  useApp.setState({ ...useApp.getInitialState(), appConfirm: async () => true }, true)
}

async function waitPreview(ms = 4000) {
  g().scheduleSweepPreview()
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const s = g()
    if (!s.sweepPreviewBusy && s.sweepPreview) return s.sweepPreview
    await new Promise((r) => setTimeout(r, 40))
  }
  return g().sweepPreview
}

async function bodyVolume() {
  const { importSTEP, measureVolume } = await import('replicad')
  const buf = await W.exportSTEP()
  if (!buf) return 0
  const shape = await importSTEP(new Blob([buf]))
  try { return measureVolume(shape) } finally { shape.delete() }
}

test('P3: profile + L-path + twist90 — kernel preview volume matches commit', async () => {
  reset()
  g().startSketch(); g().chooseSketchPlane('XY')
  useApp.setState({
    sketchProfiles: [{ type: 'rect', a: [-5, -5], b: [5, 5] }],
    sketchShape: null,
    polyPts: [[0, 0], [60, 0], [60, 40]],
    polyBulges: [0, 0],
    sweepSection: 'profile',
    sketchOp: 'new',
    sweepTwist: 90,
    sweepScale: 1,
  })
  g().openSweepDlg()
  assert.equal(g().sweepDlgOpen, true, g().status)
  const pv = await waitPreview()
  assert.ok(pv, 'preview object')
  assert.ok(!pv.error, `preview error: ${pv.error}`)
  assert.ok(pv.mesh && pv.mesh.triangles.length > 0, 'preview mesh')
  assert.ok(pv.volume != null && pv.volume > 0, `preview volume ${pv.volume}`)
  // auto-fillet warning expected on sharp L
  assert.ok((pv.warnings || []).some((w) => /自動圓角|尖角/.test(w)), `warnings: ${JSON.stringify(pv.warnings)}`)

  await g().commitSweepPath()
  assert.equal(g().sweepDlgOpen, false, g().status)
  const f = g().features.find((x) => x.type === 'sweep')
  assert.ok(f, g().status)
  assert.equal(f.twist, 90)
  assert.ok(f.profile, 'profile kept')
  const v = await bodyVolume()
  assert.ok(v > 0, `committed volume ${v}`)
  assert.ok(Math.abs(v - pv.volume) / v < 0.02, `preview ${pv.volume} ≈ commit ${v}`)
})

test('P3: twist=0 clears kernel preview (no busy false-positive)', async () => {
  reset()
  g().startSketch(); g().chooseSketchPlane('XY')
  useApp.setState({
    sketchProfiles: [{ type: 'rect', a: [-4, -4], b: [4, 4] }],
    sketchShape: { type: 'poly', pts: [[0, 0], [40, 0]], verts: [[0, 0], [40, 0]], bulges: [0], open: true },
    polyPts: [],
    sweepSection: 'profile',
    sweepTwist: 45,
    sketchOp: 'new',
  })
  g().openSweepDlg()
  const pv = await waitPreview()
  assert.ok(pv?.mesh, `had twist preview: ${pv?.error}`)
  g().setSweepTwist(0)
  g().scheduleSweepPreview()
  await new Promise((r) => setTimeout(r, 250))
  assert.equal(g().sweepPreview, null)
  assert.equal(g().sweepPreviewBusy, false)
})

test('P3: worker previewSweep matches rebuild volume on filleted L + twist', async () => {
  const path = [[0, 0], [60, 0], [60, 40]]
  const f = {
    id: 'sw', type: 'sweep', r: 5, op: 'new', path,
    profile: { kind: 'rect', a: [-5, -5], b: [5, 5] },
    twist: 90,
  }
  const pv = await W.previewSweep(f)
  assert.ok(!pv.error, pv.error)
  assert.ok(pv.volume > 0)
  const mesh = await W.rebuild([f])
  assert.ok(mesh && !mesh.failed?.length)
  const { meshVolumeMm3 } = await import('../src/ui/splitVolume.ts')
  const mv = meshVolumeMm3(mesh.vertices, mesh.triangles)
  // preview volume is B-rep; mesh volume is tessellated — allow looser gate
  assert.ok(Math.abs(pv.volume - mv) / pv.volume < 0.15, `brep ${pv.volume} vs mesh ${mv}`)
})
