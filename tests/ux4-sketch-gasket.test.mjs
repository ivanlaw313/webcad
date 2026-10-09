// UX4（墊片草圖實戰）回歸：刪弧/Backspace/右鍵選中、倒圓角約束重映射 + 相切 + 一步 undo、半徑太大訊息、打字半徑優先、
// 細圓「相等」揀曲線唔揀圓心、開放折線自動 H/V、刪折線一段只拆嗰段（含 verts/弧）、三點弧經過點擊點。
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire, register } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
const D = await import('../src/sketch/deleteSketchEdges.ts')
const F = await import('../src/sketch/freesolve.ts')
const R = await import('../src/sketch/cornerRemap.ts')
const { useApp, noteSkClickMod } = await import('../src/store.ts')
const g = () => useApp.getState()
const seed = (extra = {}) => useApp.setState({ ...useApp.getInitialState(), mode: 'sketch', sketchTool: 'select', sketchProfiles: [], sketchShape: null, skCons: [], appConfirm: async () => true, ...extra }, true)
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e
const settle = () => new Promise((r) => setTimeout(r, 50))

test('#3 hitTest: clicking the rim of a tiny circle picks the circle, centre still pickable; preferCurves never returns a point', () => {
  const shapes = [{ type: 'circle', c: [0, 0], r: 1 }, { type: 'rect', a: [10, 10], b: [30, 20] }]
  const tol = 6   // zoomed-out: whole circle inside the 0.35·tol point zone
  assert.deepEqual(F.hitTest(shapes, [1, 0], tol), { kind: 'circle', shape: 0 }, 'rim click → circle (was centre)')
  assert.deepEqual(F.hitTest(shapes, [0, 0], tol), { kind: 'pt', shape: 0, idx: 0 }, 'exact centre click → centre point')
  assert.deepEqual(F.hitTest(shapes, [0.2, 0.1], tol, undefined, { preferCurves: true }), { kind: 'circle', shape: 0 })
  assert.deepEqual(F.hitTest(shapes, [10.3, 10.2], tol), { kind: 'pt', shape: 1, idx: 0 }, 'rect corner still wins near its vertex')
})

test('#3 armed 相等: two clicks on two small circles apply equal (no centre points picked)', async () => {
  seed({ sketchProfiles: [{ type: 'circle', c: [0, 0], r: 1.2 }, { type: 'circle', c: [20, 0], r: 0.8 }] })
  await g().addSkCon('equal')
  assert.equal(g().skArmedCon, 'equal')
  noteSkClickMod('replace'); g().skClickAt([1.1, 0.3])
  noteSkClickMod('replace'); g().skClickAt([20.5, 0.3])
  await settle()
  const eq = g().skCons.find((c) => c.type === 'equal')
  assert.ok(eq, g().status)
  assert.equal(eq.a.kind, 'circle'); assert.equal(eq.b.kind, 'circle')
})

test('#9 removeContourEdges splits a Line-tool verts path (incl. arc segment) instead of deleting it all', () => {
  const sh = { type: 'poly', pts: [], verts: [[0, 0], [40, 0], [40, 30], [0, 30]], bulges: [0, 0.4, 0], open: true }
  const r = D.removeContourEdges(sh, [1], (v, b) => ({ type: 'poly', pts: v, verts: v, bulges: b, open: true }))
  assert.equal(r.shapes.length, 2)
  assert.deepEqual(r.shapes[0].verts, [[0, 0], [40, 0]]); assert.deepEqual(r.shapes[1].verts, [[40, 30], [0, 30]])
  const r2 = D.removeContourEdges(sh, [0])
  assert.deepEqual(r2.shapes[0].bulges, [0.4, 0], 'arc bulge travels with its segment')
  assert.deepEqual(r2.mapRef({ kind: 'center', shape: 0, idx: 1 }), { kind: 'center', shape: 0, idx: 0 })
})

test('#9 store: Delete one segment of an open polyline keeps the other segments; deleting a joint point keeps it open', async () => {
  seed({ sketchProfiles: [{ type: 'poly', pts: [[0, 0], [40, 0], [40, 30], [0, 30]], verts: [[0, 0], [40, 0], [40, 30], [0, 30]], bulges: [0, 0, 0], open: true }] })
  g().skClickAt([40, 15])
  assert.deepEqual(g().skSel, [{ kind: 'edge', shape: 0, idx: 1 }])
  await g().skDeleteSel()
  assert.equal(g().sketchProfiles.length, 2, g().status)
  assert.ok(g().sketchProfiles.every((p) => p.open && p.verts.length === 2))
  seed({ sketchProfiles: [{ type: 'poly', pts: [[0, 0], [40, 0], [40, 30], [0, 30]], verts: [[0, 0], [40, 0], [40, 30], [0, 30]], bulges: [0, 0, 0], open: true }], skSel: [{ kind: 'pt', shape: 0, idx: 3 }] })
  await g().skDeleteSel()
  const p = g().sketchProfiles[0]
  assert.equal(p.open, true, 'still an open path'); assert.deepEqual(p.verts, [[0, 0], [40, 0], [40, 30]])
})

test('#1 Delete with nothing selected deletes the hovered arc; context pick selects it', async () => {
  seed({ sketchProfiles: [{ type: 'poly', pts: [[0, 0], [20, 10], [40, 0]], arc: { a: [0, 0], b: [40, 0], m: [20, 10] }, open: true }, { type: 'circle', c: [-30, 0], r: 5 }] })
  g().onSketchMove([20, 10])
  assert.deepEqual(g().skHover, { kind: 'circle', shape: 0 })
  g().skContextPick()
  assert.deepEqual(g().skSel, [{ kind: 'circle', shape: 0 }], 'right-click selects the hovered arc → menu has 刪除')
  useApp.setState({ skSel: [] })
  await g().skDeleteSel()
  assert.equal(g().sketchProfiles.length + (g().sketchShape ? 1 : 0), 1, g().status)
  assert.equal((g().sketchShape ?? g().sketchProfiles[0]).type, 'circle')
  assert.equal(g().skHover, null)
  await g().skDeleteSel()   // stale-hover guard: nothing hovered any more → hint, circle survives
  assert.match(g().status, /Backspace/)
})

const rectSketch = () => seed({ sketchShape: { type: 'rect', a: [0, 0], b: [60, 40] }, skCons: [
  { id: 'h0', kind: 'con', type: 'h', a: { kind: 'edge', shape: 0, idx: 0 } }, { id: 'v1', kind: 'con', type: 'v', a: { kind: 'edge', shape: 0, idx: 1 } },
  { id: 'h2', kind: 'con', type: 'h', a: { kind: 'edge', shape: 0, idx: 2 } }, { id: 'v3', kind: 'con', type: 'v', a: { kind: 'edge', shape: 0, idx: 3 } },
  { id: 'o', kind: 'con', type: 'coincident', a: { kind: 'pt', shape: 0, idx: 0 }, b: { kind: 'origin' } }], sketchTool: 'cfillet' })

test('#2/#4 fillet: constraints follow the new indices, 2 tangents added, geometry stays square after solve, ONE undo restores exactly', async () => {
  rectSketch()
  await g().resolveSk(); const dof0 = g().skDof
  const before = JSON.stringify({ sh: g().sketchShape, cons: g().skCons })
  const undo0 = g().sketchUndo.length
  await g().skCornerAt([60, 40])
  g().setSketchCornerR(10)
  await g().skCornerAt([55, 35])
  await settle()
  const sh = g().sketchShape
  assert.equal(sh.verts.length, 5, g().status)
  const tans = g().skCons.filter((c) => c.type === 'tangent')
  assert.equal(tans.length, 2, 'two tangent constraints')
  const byId = Object.fromEntries(g().skCons.map((c) => [c.id, c]))
  assert.equal(byId.h2.a.idx, 3, 'top edge h moved past the new arc'); assert.equal(byId.v3.a.idx, 4)
  assert.equal(byId.v1.a.idx, 1)
  // solved geometry: edges still axis-aligned (no slanted edges)
  const v = sh.verts
  assert.ok(near(v[3][1], v[4][1], 1e-6) && near(v[4][0], v[0][0], 1e-6) && near(v[1][0], v[2][0], 1e-6), JSON.stringify(v))
  assert.equal(g().skConflict, false)
  assert.equal(g().skDof, dof0 + 1, `DOF = rect DOF + radius (Fusion) — got ${g().skDof} vs ${dof0}`)
  assert.equal(g().sketchUndo.length, undo0 + 1, 'exactly one undo step')
  await g().undo(); await settle()
  assert.equal(JSON.stringify({ sh: g().sketchShape, cons: g().skCons }), before, 'Ctrl+Z restores the exact rectangle + constraints')
})

test('#5 fillet radius too large: clear message with the max radius, corner stays locked to retype', async () => {
  rectSketch()
  await g().skCornerAt([60, 40])
  g().setSketchCornerR(50)
  await g().skCornerAt([55, 35])
  assert.match(g().status, /太大.*最大約 R39\.9/, g().status)
  assert.ok(g().sizing, 'still locked')
  g().sizeTypeKey('2'); g().sizeTypeKey('0'); g().sizeTypeKey('Enter')
  await settle()
  assert.equal(g().sketchShape.verts?.length, 5, g().status)
})

test('#6 typed radius wins over the drag value (typed before picking the corner)', async () => {
  rectSketch()
  g().sizeTypeKey('2'); g().sizeTypeKey('5')        // digits with the fillet tool, before picking
  assert.equal(g().sketchCornerR, 25)
  await g().skCornerAt([60, 40])
  g().onSketchMove([52, 32])                          // a drag would give R≈11
  assert.equal(g().sketchCornerR, 25, 'drag does not override typed 25')
  await g().skCornerAt([52, 32])
  const v = g().sketchShape.verts
  assert.ok(near(v[2][1], 40 - 25, 1e-6), JSON.stringify(v))
})

test('cornerRemap: rect drawn from top-right keeps refs straight; maxFilletRadius', () => {
  const r = R.remapCornerConstraints({ type: 'rect', a: [60, 40], b: [0, 0] }, [[0, 0], [60, 0], [60, 40], [0, 40]], 2, 0,
    [{ id: 'a', kind: 'con', type: 'h', a: { kind: 'edge', shape: 0, idx: 0 } }, { id: 'p', kind: 'con', type: 'coincident', a: { kind: 'pt', shape: 0, idx: 0 }, b: { kind: 'origin' } }], { fillet: true, mkId: () => 'x' })
  // old edge 0 = (60,40)→(0,40) = corner-path edge 2 (adjacent) → becomes 3; old pt 0 = (60,40) = the filleted corner → dropped
  assert.equal(r.cons.find((c) => c.id === 'a').a.idx, 3)
  assert.equal(r.dropped, 1)
  assert.ok(near(R.maxFilletRadius([[0, 0], [60, 0], [60, 40], [0, 40]], 2), 40))
})

test('#7 open polyline (Line tool, 3 joined segments) auto-adds H/V on snapped segments', async () => {
  seed({ sketchTool: 'polyline', autoConstrain: true, polyPts: [[0, 0], [40, 0], [40, 30], [10, 30]], polyBulges: [0, 0, 0] })
  await g().finishOpenPolyline()
  const t = g().skCons.map((c) => c.type).sort()
  assert.deepEqual(t, ['coincident', 'h', 'h', 'v'], g().status)
  assert.match(g().status, /水平\/豎直/)
})

test('#10 3-point arc passes through the clicked third point (no grid snap on the curvature point)', async () => {
  seed({ sketchTool: 'arc' })
  await g().onSketchClick([0, 0]); await g().onSketchClick([40, 0]); await g().onSketchClick([20, 13])
  const sh = g().sketchShape
  assert.deepEqual(sh.arc.m, [20, 13])
  const c = F.circum3(sh.arc.a, sh.arc.m, sh.arc.b)
  assert.ok(near(Math.hypot(20 - c.c[0], 13 - c.c[1]), c.r))
})

test('#1 Backspace is wired as sketch delete', async () => {
  const { readFileSync } = await import('node:fs')
  assert.match(readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8'), /case 'backspace':[\s\S]{0,300}skDeleteSel/)
})
