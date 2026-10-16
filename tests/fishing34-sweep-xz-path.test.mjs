/**
 * FISHING34 P1: saved open path on XZ (or other cardinal origin plane) must open sweep dlg
 * so twist/scale fields appear — no longer refuse with XY@0-only Formal gate.
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

test('source: openSweepDlg no longer hard-requires XY@0 for saved paths', () => {
  const st = rd('src/store.ts')
  assert.doesNotMatch(st, /已選路徑不在 XY 原點平面；目前儲存路徑掃掠需先選 XY@0 路徑/)
  assert.match(st, /已選路徑在斜面草圖上；掃掠請改用卡片平面/)
})

test('runtime: XZ open path → sweep dlg opens (twist/scale reachable)', async () => {
  useApp.setState(useApp.getInitialState(), true)
  g().startSketch()
  g().chooseSketchPlane('XZ')
  useApp.setState({
    polyPts: [[0, 0], [40, 0], [40, 25]],
    polyBulges: [0, 0],
    sketchTool: 'polyline',
  })
  await g().finishOpenPolyline()
  await g().commitStandaloneSketch()
  const pathId = Object.keys(g().sketchSources).find((k) => {
    const src = g().sketchSources[k]
    return src.plane === 'XZ' && src.shapes.some((s) => s.type === 'poly' && s.open)
  })
  assert.ok(pathId, 'XZ open path sketch archived')
  assert.equal(g().sketchSources[pathId].plane, 'XZ')
  g().setSelSketch(pathId)
  await g().runCommand('sweep', 'Sweep')
  assert.equal(g().sweepDlgOpen, true, g().status)
  assert.doesNotMatch(g().status, /XY@0|不在 XY/)
  assert.equal(g().sketchPlane, 'XZ', 'hydrated path keeps XZ plane')
  assert.ok(g().sketchShape?.open || (g().sketchShape?.type === 'poly'), 'path hydrated into live sketchShape')
  // Twist / scale fields are gated on dlg open in Viewport — dlg open is the contract.
  g().setSweepTwist(30)
  g().setSweepScale(1.2)
  assert.equal(g().sweepTwist, 30)
  assert.equal(g().sweepScale, 1.2)
  g().cancelSweepDlg()
  assert.equal(g().sweepDlgOpen, false)
})

test('runtime: XY@0 open path still opens (regression)', async () => {
  useApp.setState(useApp.getInitialState(), true)
  g().startSketch()
  g().chooseSketchPlane('XY')
  useApp.setState({ polyPts: [[0, 0], [30, 0]], polyBulges: [0], sketchTool: 'polyline' })
  await g().finishOpenPolyline()
  await g().commitStandaloneSketch()
  const pathId = Object.keys(g().sketchSources)[0]
  g().setSelSketch(pathId)
  await g().runCommand('sweep', 'Sweep')
  assert.equal(g().sweepDlgOpen, true, g().status)
  g().cancelSweepDlg()
})
