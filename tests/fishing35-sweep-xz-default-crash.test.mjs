/**
 * FISHING35 P0/P1: XZ open-path sweep must not throw (reading 'default' Viewport crash).
 * Pins: cardinal sketch-bar sweep button + skOf / ToolIcon .default guards +
 * openSweepDlg / commitSweepPath no-throw (complements core16-sweep-xz-open-no-throw).
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

test('source: Viewport sketch-bar sweep allows cardinal XZ/YZ (not XY-only)', () => {
  const vp = rd('src/components/Viewport.tsx')
  assert.match(vp, /sketchPlane === 'XZ'[\s\S]*?openSweepDlg|sketch-bar-sweep/)
  assert.match(vp, /!sketchArb/)
  // Must not keep the old XY-only gate as the sole condition on the live-path button.
  assert.doesNotMatch(
    vp,
    /\{sketchPlane === 'XY' && \(\(sketchShape && sketchShape\.type === 'poly'\) \|\| polyPts\.length >= 2\) && <button className="sb-tool" title=\{tStatus\('把當前折線/,
  )
})

test('source: SketchLayer skOf + ToolIcon .default guard + DoubleSide fallback', () => {
  const sl = rd('src/components/SketchLayer.tsx')
  const ic = rd('src/icons.tsx')
  assert.match(sl, /function skOf\(/)
  assert.match(sl, /skOf\(plane\)/)
  assert.match(sl, /DoubleSide \?\? 2/)
  assert.match(ic, /paths && \(paths\[name\] \?\? paths\.default\)/)
})

test('runtime: XZ open path → openSweepDlg + commitSweepPath no throw (reading default)', async () => {
  useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
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
  assert.ok(pathId, 'XZ open path archived')
  g().setSelSketch(pathId)

  let openErr = null
  try {
    g().openSweepDlg()
  } catch (e) {
    openErr = e
  }
  assert.equal(openErr, null, openErr ? String(openErr) : '')
  if (openErr) assert.doesNotMatch(String(openErr), /reading ['"]default['"]/)
  assert.equal(g().sweepDlgOpen, true, g().status)
  assert.equal(g().sketchPlane, 'XZ')

  g().setSweepDia(10)
  useApp.setState({ sketchOp: 'new', sweepSection: 'circle' })

  let commitErr = null
  try {
    await g().commitSweepPath()
  } catch (e) {
    commitErr = e
  }
  assert.equal(commitErr, null, commitErr ? String(commitErr) : '')
  if (commitErr) assert.doesNotMatch(String(commitErr), /reading ['"]default['"]/)
  const sw = g().features.find((f) => f.type === 'sweep')
  assert.ok(sw, g().status)
  assert.ok(sw.path3?.length >= 2, 'XZ sweep uses path3 via cardinalSketchFrame')
})

test('runtime: live XZ polyline (pre-commit) openSweepDlg no throw', async () => {
  useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
  g().startSketch()
  g().chooseSketchPlane('XZ')
  useApp.setState({
    polyPts: [[0, 0], [30, 0]],
    polyBulges: [0],
    sketchTool: 'polyline',
  })
  await g().finishOpenPolyline()
  assert.equal(g().sketchPlane, 'XZ')
  assert.doesNotThrow(() => g().openSweepDlg())
  assert.equal(g().sweepDlgOpen, true, g().status)
  g().cancelSweepDlg()
})
