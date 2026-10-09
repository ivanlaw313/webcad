// RETEST20 #2：L 形開放路徑（40 + 30mm，逐段畫成兩條線）掃掠要掃晒成條相連路徑（Fusion 鏈選），唔係淨係第一段 40mm。
// Kernel：Ø6 圓管沿 L 形 → 體積 ≈ π·3²·70 ≈ 1979 mm³（減轉角效應），唔係 π·9·40 ≈ 1131。
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
import test from 'node:test'
import assert from 'node:assert/strict'
await import('../src/worker/cad.worker.ts'); await globalThis.__wheelWorker.ready()
const { useApp } = await import('../src/store.ts')
const { computeMassProps } = await import('../src/cad/massProps.ts')
const g = () => useApp.getState()
const FULL = Math.PI * 9 * 70, FIRST = Math.PI * 9 * 40

const seg = (pts) => { useApp.setState({ polyPts: pts.map((p) => [...p]), polyBulges: new Array(pts.length - 1).fill(0), sketchTool: 'polyline' }); return g().finishOpenPolyline() }
async function savedPathSweep(drawPath) {
  useApp.setState(useApp.getInitialState(), true)
  g().startSketch(); g().chooseSketchPlane('XY')
  await drawPath()
  await g().commitStandaloneSketch()
  const pathId = Object.keys(g().sketchSources)[0]
  g().startSketch(); g().chooseSketchPlane('YZ')
  useApp.setState({ sketchShape: { type: 'circle', c: [0, 0], r: 3 }, sketchProfiles: [], skCons: [] })
  await g().commitStandaloneSketch()
  g().setSelSketch(pathId)
  await g().runCommand('sweep', 'Sweep')
  assert.equal(g().sweepDlgOpen, true, g().status)
  g().setSweepDia(6); useApp.setState({ sketchOp: 'new' })
  await g().commitSweepPath()
  const f = g().features.find((x) => x.type === 'sweep')
  assert.ok(f, g().status)
  return f
}
const vol = async (f) => { const m = await globalThis.__wheelWorker.rebuild([f]); return computeMassProps(m.vertices, m.triangles).volume }
const len = (path) => path.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - path[i][0], p[1] - path[i][1]), 0)

test('L path drawn as two separate lines (40 + 30) → sweep follows the whole chain; volume ≈ π·3²·70', async () => {
  const f = await savedPathSweep(async () => { await seg([[0, 0], [40, 0]]); await seg([[40, 0], [40, 30]]) })
  assert.equal(f.path.length, 3, JSON.stringify(f.path)); assert.ok(Math.abs(len(f.path) - 70) < 1e-6)
  const v = await vol(f)
  assert.ok(Math.abs(v - FULL) / FULL < 0.02, `volume ${v.toFixed(1)} vs π·9·70=${FULL.toFixed(1)} (first-segment-only would be ${FIRST.toFixed(1)})`)
})

test('chain joins a reversed segment and grows from both ends (seed in the middle)', async () => {
  // order in the sketch: middle, tail drawn backwards, head
  const f = await savedPathSweep(async () => { await seg([[40, 0], [40, 30]]); await seg([[70, 30], [40, 30]]); await seg([[0, 0], [40, 0]]) })
  assert.equal(f.path.length, 4, JSON.stringify(f.path)); assert.ok(Math.abs(len(f.path) - 100) < 1e-6)
  const ends = [f.path[0], f.path[3]].map((p) => p.map((x) => Math.round(Math.abs(x))).join(',')).sort()
  assert.deepEqual(ends, ['0,0', '70,30'])
})

test('a single 3-point open polyline is unchanged (same 70mm L, same volume)', async () => {
  const f = await savedPathSweep(() => seg([[0, 0], [40, 0], [40, 30]]))
  assert.equal(f.path.length, 3); assert.ok(Math.abs((await vol(f)) - FULL) / FULL < 0.02)
})

test('chain stops at a branch and never jumps to a disconnected segment', async () => {
  // T-junction at (40,0): two candidates → stop there (Fusion chain stops at branches)
  const f = await savedPathSweep(async () => { await seg([[0, 0], [40, 0]]); await seg([[40, 0], [40, 30]]); await seg([[40, 0], [80, 0]]) })
  assert.ok(Math.abs(len(f.path) - 40) < 1e-6, `stops at branch: ${JSON.stringify(f.path)}`)
  const f2 = await savedPathSweep(async () => { await seg([[0, 0], [40, 0]]); await seg([[50, 0], [50, 30]]) })
  assert.ok(Math.abs(len(f2.path) - 40) < 1e-6, 'gap of 10mm is not chained')
})

test('live sketch (segments still in sketchProfiles, not finished) also chains; consumed segments are not left as sections', async () => {
  useApp.setState(useApp.getInitialState(), true)
  g().startSketch(); g().chooseSketchPlane('XY')
  await seg([[0, 0], [40, 0]]); await seg([[40, 0], [40, 30]])
  await g().runCommand('sweep', 'Sweep')
  assert.equal(g().sweepDlgOpen, true, g().status)
  assert.ok(Math.abs(len(g().sketchShape.pts) - 70) < 1e-6, JSON.stringify(g().sketchShape))
  assert.equal(g().sketchProfiles.filter((p) => p.type === 'poly' && p.open).length, 0)
  g().setSweepDia(6); useApp.setState({ sketchOp: 'new' })
  await g().commitSweepPath()
  const f = g().features.find((x) => x.type === 'sweep')
  assert.ok(f, g().status); assert.equal(f.path.length, 3)
})
