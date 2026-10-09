// RETEST21 #2：UI 流程 — 路徑草圖（XY，L 形 40 + 30，兩條 Line）完成 → 另一張【垂直平面 YZ】草圖畫截面圓完成 →
// 掃掠對話框（路徑 已選 1）→ 截面 = 草圖輪廓 → 瀏覽樹點截面草圖 → 確定。以前：「先畫一個閉合輪廓…」卡住、對話框唔閂、冇特徵。
// 真瀏覽器版：scripts/e2e-sweep-lpath.mjs。
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
import test from 'node:test'
import assert from 'node:assert/strict'
await import('../src/worker/cad.worker.ts'); await globalThis.__wheelWorker.ready()
const { useApp } = await import('../src/store.ts')
const { computeMassProps } = await import('../src/cad/massProps.ts')
const g = () => useApp.getState()
const seg = (pts) => { useApp.setState({ polyPts: pts.map((p) => [...p]), polyBulges: new Array(pts.length - 1).fill(0), sketchTool: 'polyline' }); return g().finishOpenPolyline() }
const len = (path) => path.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - path[i][0], p[1] - path[i][1]), 0)

async function setup({ profile = { type: 'circle', c: [0, 0], r: 3 }, pathPts = [[[0, 0], [40, 0]], [[40, 0], [40, 30]]] } = {}) {
  useApp.setState(useApp.getInitialState(), true)
  g().startSketch(); g().chooseSketchPlane('XY')
  for (const p of pathPts) await seg(p)
  await g().commitStandaloneSketch()
  const pathId = Object.keys(g().sketchSources)[0]
  let profId = null
  if (profile) {
    g().startSketch(); g().chooseSketchPlane('YZ')
    useApp.setState({ sketchShape: profile, sketchProfiles: [], skCons: [] })
    await g().commitStandaloneSketch()
    profId = Object.keys(g().sketchSources).find((k) => k !== pathId)
  }
  g().setSelSketch(pathId)
  await g().runCommand('sweep', 'Sweep')
  assert.equal(g().sweepDlgOpen, true, g().status)
  g().setSweepSection('profile')
  return { pathId, profId }
}

test('profile circle in a separate perpendicular sketch → sweep built along the whole L with that circle', async () => {
  const { profId } = await setup()
  g().setSelSketch(profId)   // 瀏覽樹點截面草圖
  await g().commitSweepPath()
  const f = g().features.find((x) => x.type === 'sweep')
  assert.ok(f, g().status)
  assert.equal(g().sweepDlgOpen, false)
  assert.equal(g().sweepError, null)
  assert.equal(f.profile.kind, 'circle'); assert.equal(f.profile.r, 3); assert.ok(Math.hypot(...f.profile.c) < 1e-9)
  assert.ok(Math.abs(len(f.path) - 70) < 1e-6, JSON.stringify(f.path))
  const m = await globalThis.__wheelWorker.rebuild([f])
  const v = computeMassProps(m.vertices, m.triangles).volume, FULL = Math.PI * 9 * 70
  assert.ok(Math.abs(v - FULL) / FULL < 0.03, `volume ${v.toFixed(1)} vs ${FULL.toFixed(1)}`)
})

test('without clicking the profile sketch (selection still on the path) the latest closed profile sketch is used', async () => {
  await setup()
  await g().commitSweepPath()
  const f = g().features.find((x) => x.type === 'sweep')
  assert.ok(f, g().status); assert.equal(f.profile.kind, 'circle'); assert.equal(f.profile.r, 3)
})

test('section is centred on the path start (circle drawn at the start of a path that does not begin at the origin)', async () => {
  // path start CAD (10, 5, 0) → YZ sketch coords (s,t) = (−y, z) = (−5, 0)
  const { profId } = await setup({ profile: { type: 'circle', c: [-5, 0], r: 2 }, pathPts: [[[10, -5], [50, -5]], [[50, -5], [50, 25]]] })
  g().setSelSketch(profId)
  await g().commitSweepPath()
  const f = g().features.find((x) => x.type === 'sweep')
  assert.ok(f, g().status)
  assert.ok(Math.hypot(...f.profile.c) < 1e-9, JSON.stringify(f.profile))
})

test('no closed profile anywhere → dialog stays open with an explicit error (never silent)', async () => {
  await setup({ profile: null })
  await g().commitSweepPath()
  assert.equal(g().features.some((x) => x.type === 'sweep'), false)
  assert.equal(g().sweepDlgOpen, true)
  assert.ok(g().sweepError && /閉合輪廓/.test(g().sweepError), g().sweepError)
  assert.match(g().status, /^⚠ 掃掠未能建立/)
  g().cancelSweepDlg(); assert.equal(g().sweepError, null)
})

test('same-sketch profile (T742 path) still wins over another sketch', async () => {
  useApp.setState(useApp.getInitialState(), true)
  g().startSketch(); g().chooseSketchPlane('YZ')
  useApp.setState({ sketchShape: { type: 'circle', c: [0, 0], r: 7 }, sketchProfiles: [], skCons: [] })
  await g().commitStandaloneSketch()
  g().startSketch(); g().chooseSketchPlane('XY')
  await seg([[0, 0], [40, 0]])
  useApp.setState({ sketchShape: { type: 'circle', c: [0, 0], r: 2 } })
  await g().runCommand('sweep', 'Sweep')
  g().setSweepSection('profile')
  await g().commitSweepPath()
  const f = g().features.find((x) => x.type === 'sweep')
  assert.ok(f, g().status); assert.equal(f.profile.r, 2)
})
