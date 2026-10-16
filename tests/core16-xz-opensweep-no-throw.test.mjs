/**
 * CORE16 residual more20: XZ openSweepDlg must not throw.
 * Differs from more17 (core16-sweep-xz-open-no-throw): pins an already-archived
 * sketchSources XZ open poly (hydrate / setSelSketch context) rather than the
 * live finishOpenPolyline→commit→open path, plus a YZ sibling smoke.
 * May already pass on tip; still pins no-throw so A surfaces if tip regresses.
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

/** Archive an open polyline on plane via finish+commit (sketchSources hydrate). */
async function archiveOpenOn(plane, pts) {
  reset()
  g().startSketch()
  g().chooseSketchPlane(plane)
  useApp.setState({
    polyPts: pts.map((p) => [...p]),
    polyBulges: new Array(pts.length - 1).fill(0),
    sketchTool: 'polyline',
  })
  await g().finishOpenPolyline()
  await g().commitStandaloneSketch()
  const pathId = Object.keys(g().sketchSources).find((k) => {
    const src = g().sketchSources[k]
    return src.plane === plane && src.shapes.some((s) => s.type === 'poly' && s.open)
  })
  assert.ok(pathId, `${plane} open path archived`)
  // Leave model mode then re-select archived sketch — hydrate/openSweepDlg context
  // (more17 opens immediately after commit while still "fresh"; we clear selection first).
  useApp.setState({ selSketch: null, selectedFeature: null })
  g().setSelSketch(pathId)
  assert.equal(g().selSketch, pathId)
  return pathId
}

test('source: openSweepDlg still accepts cardinal non-XY (FISHING34 / more17 pin)', () => {
  const st = rd('src/store.ts')
  assert.doesNotMatch(st, /已選路徑不在 XY 原點平面；目前儲存路徑掃掠需先選 XY@0 路徑/)
  assert.match(st, /卡片平面 XZ／YZ|path3 CAD 脊線|cardinalSketchFrame/)
})

test('runtime: archived XZ sketchSources → setSelSketch → openSweepDlg must not throw', async () => {
  // Zigzag differs from more17 [[0,0],[40,0]]
  const pathId = await archiveOpenOn('XZ', [[0, 0], [30, 10], [60, 0], [60, 25]])
  let threw = null
  try {
    g().openSweepDlg()
  } catch (e) {
    threw = e
  }
  assert.equal(
    threw,
    null,
    `A: openSweepDlg threw on archived XZ path — ${threw ? errMsg(threw) : ''}`,
  )
  if (threw) assert.doesNotMatch(errMsg(threw), /reading ['"]default['"]/)
  assert.equal(g().sweepDlgOpen, true, `expected dlg open; status=${g().status}`)
  assert.equal(g().sketchPlane, 'XZ')
  assert.doesNotMatch(g().status, /XY@0|不在 XY/)
  assert.equal(g().selSketch, pathId)
  assert.doesNotThrow(() => g().cancelSweepDlg())
  assert.equal(g().sweepDlgOpen, false)
})

test('runtime: archived YZ sketchSources → openSweepDlg must not throw (sibling plane)', async () => {
  await archiveOpenOn('YZ', [[0, 0], [45, 0], [45, 15]])
  let threw = null
  try {
    g().openSweepDlg()
  } catch (e) {
    threw = e
  }
  assert.equal(
    threw,
    null,
    `A: openSweepDlg threw on archived YZ path — ${threw ? errMsg(threw) : ''}`,
  )
  if (threw) assert.doesNotMatch(errMsg(threw), /reading ['"]default['"]/)
  assert.equal(g().sweepDlgOpen, true, `expected dlg open; status=${g().status}`)
  assert.equal(g().sketchPlane, 'YZ')
  g().cancelSweepDlg()
})

test('runtime: archived XZ → runCommand(sweep) then cancel — no throw', async () => {
  await archiveOpenOn('XZ', [[5, 5], [55, 5]])
  let openErr = null
  try {
    await g().runCommand('sweep', 'Sweep')
  } catch (e) {
    openErr = e
  }
  assert.equal(
    openErr,
    null,
    `A: runCommand(sweep) threw on archived XZ — ${openErr ? errMsg(openErr) : ''}`,
  )
  assert.equal(g().sweepDlgOpen, true, `A?: dlg closed; status=${g().status}`)
  assert.doesNotThrow(() => g().cancelSweepDlg())
})
