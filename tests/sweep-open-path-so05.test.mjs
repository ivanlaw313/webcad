// SO05 / BUG-SO12-005：已存开放路径（含无 open 旗标嘅两点线段 / 误闭合 digon）须被扫掠接受；真闭合轮廓仍拒绝。
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

async function standaloneOpenPath(pts = [[0, 0], [30, 0]]) {
  useApp.setState(useApp.getInitialState(), true)
  g().startSketch(); g().chooseSketchPlane('XY')
  useApp.setState({ polyPts: pts.map(p => [...p]), polyBulges: new Array(pts.length - 1).fill(0), sketchTool: 'polyline' })
  await g().finishOpenPolyline()
  await g().commitStandaloneSketch()
  return Object.keys(g().sketchSources).find(k => g().sketchSources[k].shapes.some(s => s.type === 'poly' && s.open))
}

test('SO05: finishOpenPolyline saved path + circular profile → Sweep dialog and commit', async () => {
  const pathId = await standaloneOpenPath()
  assert.ok(pathId)
  g().startSketch(); g().chooseSketchPlane('YZ')
  useApp.setState({ sketchShape: { type: 'circle', c: [0, 0], r: 3 }, sketchProfiles: [], skCons: [] })
  await g().commitStandaloneSketch()
  g().setSelSketch(pathId)
  await g().runCommand('sweep', 'Sweep')
  assert.equal(g().sweepDlgOpen, true, g().status)
  assert.equal(g().sketchShape?.open, true)
  g().setSweepDia(6)
  useApp.setState({ sketchOp: 'new' })
  await g().commitSweepPath()
  const f = g().features.find(x => x.type === 'sweep')
  assert.ok(f, g().status)
  assert.equal(f.r, 3)
  assert.ok(Math.abs(f.path[1][0] - 30) < 1e-6)
})

test('SO05: two-point digon without open flag is still accepted as sweep path', async () => {
  useApp.setState(useApp.getInitialState(), true)
  // Accidental close-to-start on a 2-pt polyline historically saved a digon without open:true.
  useApp.setState({
    ...useApp.getInitialState(),
    mode: 'model',
    features: [{ id: 'F1', type: 'sketch', sketchId: 'sk1' }, { id: 'F2', type: 'sketch', sketchId: 'sk2' }],
    sketchSources: {
      sk1: {
        shapes: [{ type: 'poly', pts: [[0, 0], [30, 0]], verts: [[0, 0], [30, 0]], bulges: [0, 0] }],
        cons: [{ id: 'd1', kind: 'dim', type: 'len', a: { kind: 'edge', shape: 0, idx: 0 }, value: 30 }],
        plane: 'XY', baseZ: 0, op: 'new', height: 0, visible: true,
      },
      sk2: { shapes: [{ type: 'circle', c: [0, 0], r: 3 }], cons: [], plane: 'YZ', baseZ: 0, op: 'new', height: 0, visible: true },
    },
    selSketch: 'sk1',
  }, true)
  await g().runCommand('sweep', 'Sweep')
  assert.equal(g().sweepDlgOpen, true, g().status)
  assert.equal(g().sketchShape.open, true)
  g().setSweepDia(6)
  useApp.setState({ sketchOp: 'new' })
  await g().commitSweepPath()
  const f = g().features.find(x => x.type === 'sweep')
  assert.ok(f, g().status)
  assert.equal(f.r, 3)
  assert.ok(Math.abs(f.path[1][0] - 30) < 1e-6)
})

test('SO05: closed triangle profile sketch is still refused as sweep path', async () => {
  useApp.setState(useApp.getInitialState(), true)
  g().startSketch(); g().chooseSketchPlane('XY')
  useApp.setState({ sketchShape: { type: 'poly', pts: [[0, 0], [10, 0], [5, 8]] }, sketchProfiles: [], skCons: [] })
  await g().commitStandaloneSketch()
  g().setSelSketch(Object.keys(g().sketchSources)[0])
  await g().runCommand('sweep', 'Sweep')
  assert.equal(g().sweepDlgOpen, false)
  assert.match(g().status, /开放路径/)
})

test('SO05: cancel after hydrating saved path does not mutate sketchSources', async () => {
  const pathId = await standaloneOpenPath([[0, 0], [141.83621825732402, 0]])
  const before = structuredClone(g().sketchSources)
  g().setSelSketch(pathId)
  await g().runCommand('sweep', 'Sweep')
  assert.equal(g().sweepDlgOpen, true, g().status)
  g().cancelSweepDlg()
  assert.deepEqual(g().sketchSources, before)
})
