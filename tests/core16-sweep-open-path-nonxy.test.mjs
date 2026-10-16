/**
 * CORE16 residual more12: Sweep open-path non-XY@0 + illegal Formal refuse.
 * Desired Formal: saved open path on XZ/YZ (or XY baseZ≠0) must be able to enter
 * sweep dialog — product fix removes the XY@0-only gate. Closed / illegal path
 * still Formal 繁中 refuse. Tests only; do not edit product.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
await globalThis.__wheelWorker.ready()
const { useApp } = await import('../src/store.ts')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/
const SC = /已选路径不在|需先选 XY/

async function standaloneOpenPath(plane, pts = [[0, 0], [40, 0]], baseZ = 0) {
  useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
  g().startSketch()
  g().chooseSketchPlane(plane)
  if (Math.abs(baseZ) > 1e-9) useApp.setState({ sketchBaseZ: baseZ })
  useApp.setState({
    polyPts: pts.map((p) => [...p]),
    polyBulges: new Array(pts.length - 1).fill(0),
    sketchTool: 'polyline',
  })
  await g().finishOpenPolyline()
  await g().commitStandaloneSketch()
  const pathId = Object.keys(g().sketchSources).find((k) =>
    g().sketchSources[k].shapes.some((s) => s.type === 'poly' && s.open),
  )
  assert.ok(pathId, `open path on ${plane}@${baseZ}`)
  const src = g().sketchSources[pathId]
  assert.equal(src.plane, plane)
  if (Math.abs(baseZ) > 1e-9) assert.ok(Math.abs(src.baseZ - baseZ) < 1e-6, `baseZ ${src.baseZ}`)
  return pathId
}

test('source: openSweepDlg must not hard-block non-XY@0 saved open paths (Formal desired)', () => {
  const st = rd('src/store.ts')
  // Desired Formal: no XY@0-only refuse for saved open path hydration.
  // Tip may still have the gate — this source pin documents the product fix target.
  const blocked = /已選路徑不在 XY 原點平面；目前儲存路徑掃掠需先選 XY@0 路徑/.test(st)
  if (blocked) {
    // Report A via soft note in assert message when tip still has old gate.
    assert.equal(
      blocked,
      false,
      'A: tip still gates non-XY@0 open path (已選路徑不在 XY 原點平面…) — product fix not on tip; runtime tests assert desired Formal',
    )
  } else {
    assert.doesNotMatch(st, /已選路徑不在 XY 原點平面；目前儲存路徑掃掠需先選 XY@0 路徑/)
  }
})

test('runtime: XZ@0 open path → Sweep dialog opens (desired Formal; allow enter)', async () => {
  const pathId = await standaloneOpenPath('XZ')
  g().setSelSketch(pathId)
  await g().runCommand('sweep', 'Sweep')
  assert.equal(g().sweepDlgOpen, true, `A?: expected dlg open for XZ path; status=${g().status}`)
  assert.doesNotMatch(g().status, /XY@0|不在 XY/)
  assert.doesNotMatch(g().status, COLLOQ)
  g().cancelSweepDlg()
})

test('runtime: YZ@0 open path → Sweep dialog opens (desired Formal)', async () => {
  const pathId = await standaloneOpenPath('YZ', [[0, 0], [0, 50]])
  g().setSelSketch(pathId)
  await g().runCommand('sweep', 'Sweep')
  assert.equal(g().sweepDlgOpen, true, `A?: expected dlg open for YZ path; status=${g().status}`)
  assert.doesNotMatch(g().status, /XY@0|不在 XY/)
})

test('runtime: XY baseZ≠0 open path → Sweep dialog opens (desired Formal)', async () => {
  const pathId = await standaloneOpenPath('XY', [[0, 0], [30, 0]], 12)
  g().setSelSketch(pathId)
  await g().runCommand('sweep', 'Sweep')
  assert.equal(g().sweepDlgOpen, true, `A?: expected dlg open for XY@12 path; status=${g().status}`)
  assert.doesNotMatch(g().status, /XY@0|不在 XY/)
})

test('runtime: closed triangle (illegal path) → Formal refuse; dlg stays closed', async () => {
  useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
  g().startSketch()
  g().chooseSketchPlane('XY')
  useApp.setState({
    sketchShape: { type: 'poly', pts: [[0, 0], [10, 0], [5, 8]] },
    sketchProfiles: [],
    skCons: [],
  })
  await g().commitStandaloneSketch()
  g().setSelSketch(Object.keys(g().sketchSources)[0])
  await g().runCommand('sweep', 'Sweep')
  assert.equal(g().sweepDlgOpen, false)
  assert.match(g().status, /開放路徑|开放路径/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, SC)
})

test('runtime: after non-XY path enters, legal Ø still commits (atomic)', async () => {
  const pathId = await standaloneOpenPath('XZ', [[0, 0], [40, 0]])
  g().setSelSketch(pathId)
  await g().runCommand('sweep', 'Sweep')
  if (!g().sweepDlgOpen) {
    assert.fail(`A: tip blocked non-XY open path — cannot commit; status=${g().status}`)
  }
  g().setSweepDia(8)
  useApp.setState({ sketchOp: 'new', sweepSection: 'circle' })
  await g().commitSweepPath()
  assert.ok(g().features.some((f) => f.type === 'sweep'), g().status)
  assert.equal(g().sweepDlgOpen, false)
  assert.doesNotMatch(g().status, COLLOQ)
})
