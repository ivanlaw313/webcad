// Sweep 草圖輪廓：同草圖內閉合圓截面 + 開放路徑 → 開掃掠對話框保留截面、確定生成實體。
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

async function sameSketchCircleThenPath() {
  useApp.setState(useApp.getInitialState(), true)
  g().startSketch(); g().chooseSketchPlane('XY')
  useApp.setState({
    sketchProfiles: [{ type: 'circle', c: [0, 0], r: 5 }],
    sketchShape: null,
    polyPts: [[0, 0], [40, 0], [40, 20]],
    polyBulges: [0, 0],
    sketchTool: 'polyline',
  })
  await g().finishOpenPolyline()
  await g().commitStandaloneSketch()
  const skId = Object.keys(g().sketchSources)[0]
  assert.ok(skId)
  assert.equal(g().sketchSources[skId].shapes.filter(s => s.type === 'circle').length, 1)
  assert.ok(g().sketchSources[skId].shapes.some(s => s.type === 'poly' && s.open))
  return skId
}

test('sweep sketch-profile: saved circle+path keeps section and commits solid', async () => {
  const skId = await sameSketchCircleThenPath()
  g().setSelSketch(skId)
  g().setSweepSection('profile')
  g().openSweepDlg()
  assert.equal(g().sweepDlgOpen, true, g().status)
  assert.ok(g().sketchProfiles.some(s => s.type === 'circle'), 'openSweepDlg must keep the closed circle as section profile')
  assert.equal(g().sketchShape?.open, true)
  useApp.setState({ sketchOp: 'new' })
  await g().commitSweepPath()
  const f = g().features.find(x => x.type === 'sweep')
  assert.ok(f, g().status)
  assert.ok(f.profile, 'sweep feature must carry the sketch profile')
  assert.equal(f.profile.kind, 'circle')
  assert.ok(Math.abs(f.profile.r - 5) < 1e-6)
  assert.equal(g().sweepDlgOpen, false)
})

test('sweep sketch-profile: live mid-polyline with banked circle still commits', async () => {
  useApp.setState(useApp.getInitialState(), true)
  g().startSketch(); g().chooseSketchPlane('XY')
  useApp.setState({
    sketchProfiles: [{ type: 'circle', c: [0, 0], r: 5 }],
    sketchShape: null,
    polyPts: [[0, 0], [50, 0]],
    polyBulges: [0],
    sweepSection: 'profile',
    sketchOp: 'new',
  })
  g().openSweepDlg()
  assert.equal(g().sweepDlgOpen, true, g().status)
  await g().commitSweepPath()
  const f = g().features.find(x => x.type === 'sweep')
  assert.ok(f, g().status)
  assert.ok(f.profile)
  assert.equal(f.profile.kind, 'circle')
})

test('sweep default circle-pipe mode still works without sketch profile', async () => {
  useApp.setState(useApp.getInitialState(), true)
  g().startSketch(); g().chooseSketchPlane('XY')
  useApp.setState({
    sketchProfiles: [],
    sketchShape: null,
    polyPts: [[0, 0], [30, 0]],
    polyBulges: [0],
    sweepSection: 'circle',
    sweepDia: 12,
    sketchOp: 'new',
  })
  g().openSweepDlg()
  await g().commitSweepPath()
  const f = g().features.find(x => x.type === 'sweep')
  assert.ok(f, g().status)
  assert.equal(f.profile, undefined)
  assert.equal(f.r, 6)
  assert.match(g().status, /Ø12|管径 Ø12|圓管/)
})

test('sweep sketch-profile: click closed circle promotes it as section', async () => {
  useApp.setState(useApp.getInitialState(), true)
  g().startSketch(); g().chooseSketchPlane('XY')
  useApp.setState({
    sketchProfiles: [
      { type: 'rect', a: [-20, -10], b: [-5, 5] },
      { type: 'circle', c: [0, 0], r: 5 },
    ],
    sketchShape: { type: 'poly', pts: [[0, 0], [40, 0]], verts: [[0, 0], [40, 0]], bulges: [0], open: true },
    polyPts: [],
    sweepDlgOpen: true,
    sweepSection: 'profile',
    sketchTool: 'select',
    mode: 'sketch',
  })
  // Click near the circle rim
  g().skClickAt([5, 0])
  assert.ok(g().skSel.some(r => r.kind === 'circle'), g().status)
  assert.equal(g().sketchProfiles.at(-1)?.type, 'circle')
})
