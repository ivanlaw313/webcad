// RETEST4：完成草图后的开放折线中心线须被加強筋接受（含面上草图 arb / 无 open 旗标两点线段）。
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

async function standaloneOpenPath(pts = [[-20, 0], [20, 0]], opts = {}) {
  useApp.setState(useApp.getInitialState(), true)
  g().startSketch(); g().chooseSketchPlane('XY')
  if (opts.arb) useApp.setState({ sketchArb: opts.arb, sketchPlane: 'XY', sketchBaseZ: 0 })
  useApp.setState({ polyPts: pts.map(p => [...p]), polyBulges: new Array(pts.length - 1).fill(0), sketchTool: 'polyline' })
  await g().finishOpenPolyline()
  await g().commitStandaloneSketch()
  return Object.keys(g().sketchSources).find(k => g().sketchSources[k].shapes.some(s => s.type === 'poly'))
}

test('RETEST4: finished open polyline centerline opens Rib dialog', async () => {
  const pathId = await standaloneOpenPath()
  assert.ok(pathId)
  g().setSelSketch(pathId)
  await g().runCommand('rib', '加強筋')
  assert.equal(g().featDlg?.kind, 'rib', g().status)
  const pay = g().featDlg.payload
  assert.ok(pay?.paths?.length >= 1)
  assert.ok(pay.paths[0].length >= 2)
  assert.ok(Math.abs(pay.paths[0][1][0] - 20) < 1e-6 || Math.abs(pay.paths[0][1][0] + 20) < 1e-6)
})

test('RETEST4: face-sketch arb open polyline opens Rib with arb payload', async () => {
  const arb = { o: [0, 0, 10], xd: [1, 0, 0], n: [0, 0, 1] }
  const pathId = await standaloneOpenPath([[-15, 5], [15, 5]], { arb })
  assert.ok(pathId)
  assert.ok(g().sketchSources[pathId].arb)
  g().setSelSketch(pathId)
  await g().runCommand('rib', '加強筋')
  assert.equal(g().featDlg?.kind, 'rib', g().status)
  assert.ok(g().featDlg.payload?.arb, 'face-sketch rib should carry arbPlane')
  assert.equal(g().featDlg.params.extent, 'distance')
  assert.match(g().status, /任意參考|平面加強筋/)
})

test('RETEST4: two-point digon without open flag still accepted as rib centerline', async () => {
  useApp.setState(useApp.getInitialState(), true)
  useApp.setState({
    ...useApp.getInitialState(),
    mode: 'model',
    features: [{ id: 'F1', type: 'sketch', sketchId: 'sk1' }],
    sketchSources: {
      sk1: {
        shapes: [{ type: 'poly', pts: [[0, 0], [39.5, 0]], verts: [[0, 0], [39.5, 0]], bulges: [0, 0] }],
        cons: [],
        plane: 'XY', baseZ: 0, op: 'new', height: 0, visible: true,
      },
    },
    selSketch: 'sk1',
  }, true)
  await g().runCommand('rib', '加強筋')
  assert.equal(g().featDlg?.kind, 'rib', g().status)
  assert.ok(Math.abs(g().featDlg.payload.paths[0][1][0] - 39.5) < 1e-6)
})

test('RETEST4: live finishOpenPolyline (before finish sketch) still opens Rib', async () => {
  useApp.setState(useApp.getInitialState(), true)
  g().startSketch(); g().chooseSketchPlane('XY')
  useApp.setState({ polyPts: [[0, 0], [25, 0]], polyBulges: [0], sketchTool: 'polyline' })
  await g().finishOpenPolyline()
  assert.equal(g().mode, 'sketch')
  await g().runCommand('rib', '加強筋')
  assert.equal(g().featDlg?.kind, 'rib', g().status)
  assert.ok(g().featDlg.payload?.bundle?.shapes?.length >= 1, 'live sketch should bundle for cancel restore')
})

test('RETEST4: commit Rib from finished centerline joins a plate', async () => {
  useApp.setState(useApp.getInitialState(), true)
  g().startSketch(); g().chooseSketchPlane('XY')
  useApp.setState({ sketchShape: { type: 'rect', a: [-50, -50], b: [50, 50] }, sketchProfiles: [], skCons: [] })
  await g().extrudeSketch(2)
  assert.ok(g().features.some(f => f.type === 'extrude' || f.type === 'extgroup'), g().status)
  const pathId = await (async () => {
    g().startSketch(); g().chooseSketchPlane('XY')
    useApp.setState({ sketchBaseZ: 2, polyPts: [[-30, 0], [30, 0]], polyBulges: [0], sketchTool: 'polyline' })
    await g().finishOpenPolyline()
    await g().commitStandaloneSketch()
    return Object.keys(g().sketchSources).find(k => g().sketchSources[k].shapes.some(s => s.type === 'poly' && (s.open || (s.pts?.length === 2))))
  })()
  assert.ok(pathId)
  g().setSelSketch(pathId)
  await g().runCommand('rib', '加強筋')
  assert.equal(g().featDlg?.kind, 'rib', g().status)
  await g().commitFeatDlg()
  const rib = g().features.find(f => f.type === 'rib')
  assert.ok(rib, g().status)
  assert.equal(rib.thickness, 6)
  assert.ok(g().bodyMesh?.vertices?.length > 0, 'rib should rebuild a solid mesh')
})
