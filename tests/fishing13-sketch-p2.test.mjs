// FISHING13 sketch P2/P3: open-polyline corner fillet/chamfer (single shape + two separate lines sharing a vertex),
// rectangle Tab = next field (commit only on Enter) + no digit leak after a typed commit, fast-click drag-draw rule,
// Esc with a typed buffer steps back at once, construction panels close on New, edge badges clear the midpoint.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
await globalThis.__wheelWorker.ready()
const { useApp, closedConstructionPanelsPatch } = await import('../src/store.ts')
const { filletAt } = await import('../src/sketch/sketchOps.ts')
const oc = await import('../src/sketch/openCorner.ts')
const ux = await import('../src/sketch/sketchPointerUx.ts')
const g = () => useApp.getState()
const all = () => [...g().sketchProfiles, ...(g().sketchShape ? [g().sketchShape] : [])]
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e

function seed(profiles, cons = [], tool = 'cfillet') {
  useApp.setState({ ...useApp.getInitialState(), mode: 'sketch', sketchTool: tool, sketchProfiles: profiles, sketchShape: null, skCons: cons, appConfirm: async () => true }, true)
}
const Lpath = () => ({ type: 'poly', pts: [[0, 0], [30, 0], [30, 20]], verts: [[0, 0], [30, 0], [30, 20]], bulges: [0, 0], open: true })

test('openCorner: only interior vertices of an open path are corners; result keeps n−1 bulges', () => {
  const cp = oc.openPolyCornerPath(Lpath())
  assert.ok(cp?.open)
  assert.deepEqual([0, 1, 2].map((k) => oc.cornerIndexAllowed(cp, k)), [false, true, false])
  const n = oc.nearestCorner([cp], [0.2, 0.1])
  assert.equal(n.bi, 0); assert.equal(n.vi, 1); assert.ok(n.nearEnd, 'clicked an end point → nearEnd flag for the hint')
  const res = oc.normalizeCornerResult(filletAt(cp.verts, cp.bulges, 1, 5), true)
  assert.equal(res.verts.length, 4); assert.equal(res.bulges.length, 3)
  assert.ok(near(res.verts[1][0], 25) && near(res.verts[2][1], 5))
  assert.ok(Math.abs(res.bulges[1]) > 0.1 && res.bulges[0] === 0 && res.bulges[2] === 0)
  assert.equal(oc.openPolyCornerPath({ type: 'poly', pts: [[0, 0], [10, 0]], open: true }), null, 'single segment has no corner')
  assert.equal(oc.openPolyCornerPath({ type: 'poly', pts: [[0, 0], [5, 5], [10, 0]], open: true, smooth: true }), null, 'spline has no corner')
})

test('mergeOpenAtJoint: two separate lines sharing a vertex merge into one open path with remapped constraints', () => {
  const A = { type: 'poly', pts: [[30, 0], [0, 0]], verts: [[30, 0], [0, 0]], bulges: [0], open: true }   // joint at its START → reversed
  const B = { type: 'poly', pts: [[30, 0], [30, 20]], verts: [[30, 0], [30, 20]], bulges: [0], open: true }
  const C = { type: 'circle', c: [50, 50], r: 3 }
  const cons = [
    { id: 'c1', kind: 'con', type: 'coincident', a: { kind: 'pt', shape: 0, idx: 0 }, b: { kind: 'pt', shape: 1, idx: 0 } },
    { id: 'c2', kind: 'con', type: 'h', a: { kind: 'edge', shape: 0, idx: 0 } },
    { id: 'c3', kind: 'con', type: 'v', a: { kind: 'edge', shape: 1, idx: 0 } },
    { id: 'c4', kind: 'dim', type: 'dia', a: { kind: 'circle', shape: 3 }, value: 6 },
  ]
  const r = oc.mergeOpenAtJoint([A, B, { type: 'circle', c: [0, 40], r: 2 }, C], cons, [30.3, 0.2], 1)
  assert.ok(r)
  assert.equal(r.shapes.length, 3); assert.equal(r.shapeIdx, 0); assert.equal(r.vi, 1)
  assert.deepEqual(r.merged.verts, [[0, 0], [30, 0], [30, 20]])
  assert.equal(r.droppedCons, 1, 'joint coincident collapses onto one vertex')
  assert.deepEqual(r.cons.find((c) => c.id === 'c2').a, { kind: 'edge', shape: 0, idx: 0 })
  assert.deepEqual(r.cons.find((c) => c.id === 'c3').a, { kind: 'edge', shape: 0, idx: 1 })
  assert.equal(r.cons.find((c) => c.id === 'c4').a.shape, 2, 'later shapes shift down by one')
  assert.equal(oc.mergeOpenAtJoint([A, B], [], [10, 10], 1), null, 'click far from the joint → no merge')
  const D = { type: 'poly', pts: [[30, 0], [40, -5]], open: true }
  assert.equal(oc.mergeOpenAtJoint([A, B, D], [], [30, 0], 1), null, 'three lines at one point (branch) → no guess')
})

test('store: sketch fillet on the corner of an open 2-segment polyline (was 「圓沒有角」)', async () => {
  seed([Lpath()], [{ id: 'h0', kind: 'con', type: 'h', a: { kind: 'edge', shape: 0, idx: 0 } }, { id: 'v0', kind: 'con', type: 'v', a: { kind: 'edge', shape: 0, idx: 1 } }])
  g().setSketchCornerR(5)
  await g().skCornerAt([30.2, 0.1])
  assert.ok(g().sizing, `corner locked: ${g().status}`)
  assert.doesNotMatch(g().status, /沒有角/)
  await g().skCornerAt([30.2, 0.1])
  const sh = all()[0]
  assert.equal(sh.open, true, 'path stays open')
  assert.equal(sh.verts.length, 4); assert.equal(sh.bulges.length, 3)
  assert.ok(near(sh.verts[1][0], 25, 1e-3) && near(sh.verts[2][1], 5, 1e-3), JSON.stringify(sh.verts))
  assert.ok(near(sh.verts[0][0], 0, 1e-3) && near(sh.verts[3][1], 20, 1e-3))
  assert.ok(g().skCons.some((c) => c.type === 'tangent'), 'tangent constraints added')
  assert.ok(g().skCons.some((c) => c.kind === 'dim' && c.type === 'rad' && c.value === 5), 'radius dimension added')
  assert.doesNotMatch(g().status, /[简纪绘这们]/)
  await g().undo?.()
})

test('store: end point of an open path is refused with a Formal TC hint; chamfer works on the interior corner', async () => {
  seed([Lpath()])
  g().setSketchCornerR(4)
  await g().skCornerAt([0.1, 0.1])
  assert.equal(g().sizing, null)
  assert.match(g().status, /開放路徑的端點不是角/)
  useApp.setState({ sketchTool: 'cchamfer' })
  await g().skCornerAt([30, 0]); await g().skCornerAt([30, 0])
  const sh = all()[0]
  assert.equal(sh.open, true); assert.equal(sh.verts.length, 4)
  assert.ok(near(sh.verts[1][0], 26, 1e-3) && near(sh.verts[2][1], 4, 1e-3), JSON.stringify(sh.verts))
})

test('store: two separate lines sharing a vertex → fillet at the shared vertex (merged, one undo step each)', async () => {
  seed([
    { type: 'poly', pts: [[0, 0], [30, 0]], verts: [[0, 0], [30, 0]], bulges: [0], open: true },
    { type: 'poly', pts: [[30, 0], [30, 20]], verts: [[30, 0], [30, 20]], bulges: [0], open: true },
  ], [{ id: 'k', kind: 'con', type: 'coincident', a: { kind: 'pt', shape: 0, idx: 1 }, b: { kind: 'pt', shape: 1, idx: 0 } }])
  g().setSketchCornerR(5)
  const undo0 = g().sketchUndo.length
  await g().skCornerAt([30, 0.2])
  assert.ok(g().sizing, g().status)
  await g().skCornerAt([30, 0.2])
  const shapes = all()
  assert.equal(shapes.length, 1)
  assert.equal(shapes[0].open, true); assert.equal(shapes[0].verts.length, 4)
  assert.ok(!g().skCons.some((c) => c.type === 'coincident' && c.a.shape === c.b?.shape && c.a.idx === c.b?.idx))
  assert.equal(g().sketchUndo.length, undo0 + 2)
})

test('store: closed rectangle fillet unchanged (regression)', async () => {
  seed([{ type: 'rect', a: [0, 0], b: [40, 25] }])
  g().setSketchCornerR(5)
  await g().skCornerAt([40, 25]); await g().skCornerAt([40, 25])
  const sh = all()[0]
  assert.ok(!sh.open && sh.verts.length === 5 && sh.bulges.length === 5)
})

test('store: rectangle Tab switches width→height without commit; Enter commits; digits after commit do not start a new X', () => {
  seed([], [], 'rectangle')
  useApp.setState({ sketchStart: [0, 0], sketchPreview: [33, 17] })
  for (const k of '40') g().sketchTypeKey(k)
  g().sketchTypeKey('Tab')
  assert.equal(g().sketchShape, null); assert.deepEqual(g().sketchStart, [0, 0]); assert.equal(g().dimField, 1)
  for (const k of '25') g().sketchTypeKey(k)
  g().sketchTypeKey('Enter')
  const r = all().find((x) => x.type === 'rect')
  assert.ok(r && near(Math.abs(r.b[0] - r.a[0]), 40) && near(Math.abs(r.b[1] - r.a[1]), 25))
  g().sketchTypeKey('1'); g().sketchTypeKey('2')
  assert.deepEqual(g().dimBuf, ['', '']); assert.equal(g().sketchStart, null)
  assert.match(g().status, /矩形已建立/)
  g().onSketchClick([60, 60])   // clicking the canvas re-arms normal drawing
  assert.deepEqual(g().sketchStart?.map(Math.round), [60, 60])
})

test('sketch bar precise input: Tab = next field (no blur commit), Enter = commit', () => {
  const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(vp, /onBlur=\{commitSkDimInput\}/, 'blur must not commit the rectangle')
  assert.match(vp, /e\.key === 'Tab'\) \{ e\.preventDefault\(\); tabSkDimInput\(\) \}/)
  assert.match(vp, /sketchTypeKey\('Tab'\)/)
})

test('drag-draw: fast sloppy click is not a drag; held drag or a long move is', () => {
  assert.equal(ux.isDragDrawRelease(10, 60, false), false, '10px in 60ms = sloppy click, not a second point')
  assert.equal(ux.isDragDrawRelease(5, 400, false), false, 'under threshold')
  assert.equal(ux.isDragDrawRelease(10, 200, false), true, 'held press-drag-release')
  assert.equal(ux.isDragDrawRelease(60, 40, false), true, 'long flick')
  assert.equal(ux.isDragDrawRelease(14, 60, true), false)
  const sl = readFileSync(new URL('../src/components/SketchLayer.tsx', import.meta.url), 'utf8')
  assert.match(sl, /isDragDrawRelease\(dist, performance\.now\(\) - dd\.t, dd\.touch\)/)
  assert.match(sl, /if \(dragDraw\.current && dragDraw\.current\.tool === gestureTool\) return/, 'late effect must not clear the new tool first-point gesture')
})

test('P3: Esc with typed buffer also steps back; New/Open close construction panels; edge badge off the midpoint', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /\(s\.dimBuf\[0\] \|\| s\.dimBuf\[1\]\)\) \{ s\.sketchTypeKey\('Escape'\); s\.escSketch\(\) \}/)
  const p = closedConstructionPanelsPatch()
  assert.equal(p.datumCmd, null); assert.equal(p.featDlg, null); assert.equal(p.datumPick, null)
  const st = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  assert.equal((st.match(/set\(closedConstructionPanelsPatch\(\)\)/g) || []).length, 2, 'reset + applyProjectData')
  const [dx, dy] = ux.edgeBadgeOffset(0)
  assert.ok(Math.hypot(dx, dy) >= 18, 'badge centre ≥ 18px from the edge midpoint (badge ~17px wide)')
})

test('P3: Esc while drawing a typed rectangle = at most 2 Esc to leave the tool', () => {
  seed([], [], 'rectangle')
  useApp.setState({ sketchStart: [0, 0], sketchPreview: [10, 10] })
  g().sketchTypeKey('4')
  // App Escape path with a buffer: clear + escSketch
  g().sketchTypeKey('Escape'); g().escSketch()
  assert.equal(g().sketchStart, null); assert.equal(g().sketchTool, 'rectangle')
  g().escSketch()
  assert.equal(g().sketchTool, 'select')
})

test('reset closes an open construction-axis dialog', async () => {
  seed([])
  useApp.setState({ mode: 'model', datumCmd: { type: 'axis', method: 'dirPoint', params: {}, picks: [] } })
  await g().reset()
  assert.equal(g().datumCmd, null)
})
