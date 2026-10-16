/**
 * CORE16 residual more17: XZ open-path sweep must NOT throw
 * (viewport/store regression: reading 'default' crash; maybe non-XY sweep).
 * Product emergency fix is theirs — this pins assert.doesNotThrow so A
 * surfaces until tip is fixed. Complements core16-sweep-open-path-nonxy /
 * fishing34 (dlg-open contract) with an explicit no-throw regression.
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

function errMsg(e) {
  return e instanceof Error ? `${e.name}: ${e.message}` : String(e)
}

async function xzOpenPath(pts = [[0, 0], [40, 0]]) {
  reset()
  g().startSketch()
  g().chooseSketchPlane('XZ')
  useApp.setState({
    polyPts: pts.map((p) => [...p]),
    polyBulges: new Array(pts.length - 1).fill(0),
    sketchTool: 'polyline',
  })
  await g().finishOpenPolyline()
  await g().commitStandaloneSketch()
  const pathId = Object.keys(g().sketchSources).find((k) => {
    const src = g().sketchSources[k]
    return src.plane === 'XZ' && src.shapes.some((s) => s.type === 'poly' && s.open)
  })
  assert.ok(pathId, 'XZ open path archived')
  return pathId
}

test('source: openSweepDlg / commitSweepPath still accept cardinal non-XY (FISHING34 pin)', () => {
  const st = rd('src/store.ts')
  assert.doesNotMatch(st, /已選路徑不在 XY 原點平面；目前儲存路徑掃掠需先選 XY@0 路徑/)
  assert.match(st, /卡片平面 XZ／YZ|path3 CAD 脊線|cardinalSketchFrame/)
})

test('runtime: XZ open path → openSweepDlg must not throw (reading default)', async () => {
  const pathId = await xzOpenPath()
  g().setSelSketch(pathId)
  let threw = null
  try {
    g().openSweepDlg()
  } catch (e) {
    threw = e
  }
  assert.equal(
    threw,
    null,
    `A: openSweepDlg threw on XZ open path — ${threw ? errMsg(threw) : ''}`,
  )
  if (threw) assert.doesNotMatch(errMsg(threw), /reading ['"]default['"]/)
  assert.equal(g().sweepDlgOpen, true, `expected dlg open; status=${g().status}`)
  assert.equal(g().sketchPlane, 'XZ')
  assert.doesNotMatch(g().status, /XY@0|不在 XY/)
  g().cancelSweepDlg()
})

test('runtime: XZ open path → runCommand sweep + commitSweepPath must not throw', async () => {
  const pathId = await xzOpenPath([[0, 0], [50, 0], [50, 20]])
  g().setSelSketch(pathId)

  let openErr = null
  try {
    await g().runCommand('sweep', 'Sweep')
  } catch (e) {
    openErr = e
  }
  assert.equal(
    openErr,
    null,
    `A: runCommand(sweep) threw on XZ path — ${openErr ? errMsg(openErr) : ''}`,
  )
  if (openErr) assert.doesNotMatch(errMsg(openErr), /reading ['"]default['"]/)
  assert.equal(g().sweepDlgOpen, true, `A?: dlg closed; status=${g().status}`)

  g().setSweepDia(8)
  useApp.setState({ sketchOp: 'new', sweepSection: 'circle' })

  let commitErr = null
  try {
    await g().commitSweepPath()
  } catch (e) {
    commitErr = e
  }
  assert.equal(
    commitErr,
    null,
    `A: commitSweepPath threw on XZ open path — ${commitErr ? errMsg(commitErr) : ''}`,
  )
  if (commitErr) assert.doesNotMatch(errMsg(commitErr), /reading ['"]default['"]/)
  assert.ok(
    g().features.some((f) => f.type === 'sweep'),
    `expected sweep feature; status=${g().status}`,
  )
  assert.equal(g().sweepDlgOpen, false)
  // Feature should carry 3D path3 for non-XY (cardinal frame), not crash mid-hydrate.
  const sw = g().features.find((f) => f.type === 'sweep')
  assert.ok(sw.path3?.length >= 2 || sw.path?.length >= 2, 'sweep path/path3 present')
})

test('runtime: openSweepDlg then cancel on XZ path leaves no throw / dlg closed', async () => {
  const pathId = await xzOpenPath()
  g().setSelSketch(pathId)
  assert.doesNotThrow(() => g().openSweepDlg())
  assert.equal(g().sweepDlgOpen, true)
  assert.doesNotThrow(() => g().cancelSweepDlg())
  assert.equal(g().sweepDlgOpen, false)
})
