/**
 * CORE16 residual: in-sketch「沿路徑掃掠…」button must show for cardinal
 * planes XY/XZ/YZ (not XY-only). Arb face sketches stay hidden.
 * Complements fishing34 / more17 (saved-path openSweepDlg) with live-sketch
 * XZ open path + Viewport source pin.
 *
 * Viewport gate = !sketchArb && (sketchShape.type==='poly' || polyPts>=2).
 * Mid-draw polyPts (before finishOpenPolyline) is the button-visible state.
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
const reset = () =>
  useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)

/** Mid-draw open path matching Viewport button visibility condition. */
function seedLivePath(plane, pts = [[0, 0], [40, 0], [40, 20]]) {
  reset()
  g().startSketch()
  g().chooseSketchPlane(plane)
  assert.equal(g().sketchPlane, plane)
  assert.equal(g().sketchArb, null)
  useApp.setState({
    polyPts: pts.map((p) => [...p]),
    polyBulges: new Array(pts.length - 1).fill(0),
    sketchTool: 'polyline',
  })
  assert.ok(g().polyPts.length >= 2, 'polyPts ready for Viewport button condition')
}

test('source: Viewport 沿路徑掃掠 button gates on !sketchArb (cardinal XY/XZ/YZ), not XY-only', () => {
  const vp = rd('src/components/Viewport.tsx')
  assert.doesNotMatch(
    vp,
    /sketchPlane === 'XY' && \(\(sketchShape && sketchShape\.type === 'poly'\) \|\| polyPts\.length >= 2\) && <button[^>]*openSweepDlg\(\)/,
  )
  assert.match(
    vp,
    /!sketchArb && \(\(sketchShape && sketchShape\.type === 'poly'\) \|\| polyPts\.length >= 2\) && <button[^>]*onClick=\{\(\) => openSweepDlg\(\)\}/,
  )
  assert.match(vp, /沿路徑掃掠…/)
})

test('runtime: live XZ sketch mid-draw path → openSweepDlg opens (in-sketch cardinal)', () => {
  seedLivePath('XZ')
  assert.doesNotThrow(() => g().openSweepDlg())
  assert.equal(g().sweepDlgOpen, true, `expected dlg open on XZ live path; status=${g().status}`)
  assert.equal(g().sketchPlane, 'XZ')
  assert.doesNotMatch(g().status, /XY@0|不在 XY|斜面/)
  g().cancelSweepDlg()
  assert.equal(g().sweepDlgOpen, false)
})

test('runtime: live YZ sketch mid-draw path → openSweepDlg opens', () => {
  seedLivePath('YZ', [[0, 0], [0, 50]])
  assert.doesNotThrow(() => g().openSweepDlg())
  assert.equal(g().sweepDlgOpen, true, `expected dlg open on YZ live path; status=${g().status}`)
  g().cancelSweepDlg()
})

test('runtime: live XY mid-draw path still opens (regression) + source !sketchArb pin', () => {
  const vp = rd('src/components/Viewport.tsx')
  assert.match(vp, /!sketchArb && \(\(sketchShape && sketchShape\.type === 'poly'\) \|\| polyPts\.length >= 2\)/)
  seedLivePath('XY', [[0, 0], [30, 0]])
  assert.doesNotThrow(() => g().openSweepDlg())
  assert.equal(g().sweepDlgOpen, true, g().status)
  g().cancelSweepDlg()
})
