// UX4-B：草圖倒圓角/倒角 —— (1)「全部角一次過」約束跟 index + 相切 + 一步 undo；(2) 鄰邊長度/位置尺寸改掛虛擬尖角（唔再刪），
// 自由度淨變 0（相切 2 + 半徑尺寸 1，Fusion 同款）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire, register } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
const R = await import('../src/sketch/cornerRemap.ts')
const { useApp } = await import('../src/store.ts')
const g = () => useApp.getState()
const near = (a, b, e = 1e-5) => Math.abs(a - b) < e
const settle = () => new Promise((r) => setTimeout(r, 50))
const E = (idx) => ({ kind: 'edge', shape: 0, idx })
// 60×40 rect at the origin, fully constrained: H/V ×4, corner (0,0) ≡ origin, width d1=60 (edge 0), height d2=40 (edge 1)
const rect = (tool = 'cfillet') => useApp.setState({ ...useApp.getInitialState(), mode: 'sketch', sketchTool: tool, sketchProfiles: [], appConfirm: async () => true,
  sketchShape: { type: 'rect', a: [0, 0], b: [60, 40] }, skCons: [
    { id: 'h0', kind: 'con', type: 'h', a: E(0) }, { id: 'v1', kind: 'con', type: 'v', a: E(1) },
    { id: 'h2', kind: 'con', type: 'h', a: E(2) }, { id: 'v3', kind: 'con', type: 'v', a: E(3) },
    { id: 'o', kind: 'con', type: 'coincident', a: { kind: 'pt', shape: 0, idx: 0 }, b: { kind: 'origin' } },
    { id: 'w', name: 'd1', kind: 'dim', type: 'len', a: E(0), value: 60 }, { id: 'hh', name: 'd2', kind: 'dim', type: 'len', a: E(1), value: 40 }] }, true)
const ext = (v) => [Math.min(...v.map((p) => p[0])), Math.min(...v.map((p) => p[1])), Math.max(...v.map((p) => p[0])), Math.max(...v.map((p) => p[1]))]
const setDim = async (id, value) => { useApp.setState({ skCons: g().skCons.map((c) => c.id === id ? { ...c, value } : c) }); await g().resolveSk(); await settle() }

test('#2 single-corner fillet next to length dims keeps both dims (virtual sharp), DOF net 0, dims still drive', async () => {
  rect()
  await g().resolveSk(); assert.equal(g().skDof, 0, 'rect fully constrained')
  await g().skCornerAt([60, 40]); g().setSketchCornerR(10); await g().skCornerAt([55, 35]); await settle()
  const byId = Object.fromEntries(g().skCons.map((c) => [c.id, c]))
  assert.ok(byId.w && byId.hh, 'width/height dims survive: ' + g().status)
  assert.equal(byId.w.name, 'd1'); assert.equal(byId.w.value, 60); assert.equal(byId.hh.value, 40)
  assert.equal(byId.w.type, 'len', 'bottom edge not adjacent → untouched'); assert.equal(byId.hh.type, 'p2l', 'right edge adjacent → virtual-sharp length')
  assert.equal(g().skCons.filter((c) => c.type === 'tangent').length, 2)
  assert.equal(g().skCons.filter((c) => c.type === 'rad').length, 1)
  assert.equal(g().skDof, 0, 'DOF unchanged: tangent×2 + radius dim cancel the fillet DOF')
  assert.equal(g().skConflict, false)
  assert.match(g().status, /倒圓角 R10/); assert.match(g().status, /改掛虛擬尖角/)
  assert.doesNotMatch(g().status, /已移除/)
  assert.deepEqual(ext(g().sketchShape.verts).map((x) => Math.round(x * 1e6) / 1e6), [0, 0, 60, 40])
  await setDim('w', 80)     // re-targeted width still drives the (virtual-sharp) width
  assert.ok(near(ext(g().sketchShape.verts)[2], 80), JSON.stringify(g().sketchShape.verts))
  await setDim(g().skCons.find((c) => c.type === 'rad').id, 6)
  const v = g().sketchShape.verts
  assert.ok(near(v[2][1], 40 - 6) && near(v[3][0], 80 - 6), 'radius dim drives the arc: ' + JSON.stringify(v))
})

test('#2 fillet at the origin corner: coincident → origin on both adjacent lines (virtual sharp stays at origin)', async () => {
  rect()
  await g().skCornerAt([0, 0]); g().setSketchCornerR(5); await g().skCornerAt([3, 3]); await settle()
  assert.equal(g().skCons.filter((c) => c.type === 'coincident' && c.a.kind === 'origin').length, 2, g().status)
  assert.equal(g().skDof, 0); assert.equal(g().skConflict, false)
  await setDim('w', 70)
  assert.deepEqual(ext(g().sketchShape.verts).map((x) => Math.round(x * 1e6) / 1e6), [0, 0, 70, 40])
})

test('#1 全部角 fillet: 4 arcs, constraints renumbered, 8 tangents, 1 radius dim + 3 equal, dims kept, DOF 0, ONE undo', async () => {
  rect()
  await g().resolveSk()
  const before = JSON.stringify({ sh: g().sketchShape, cons: g().skCons }), undo0 = g().sketchUndo.length
  await g().filletSketchCorners(8); await settle()
  const sh = g().sketchShape
  assert.equal(sh.verts.length, 8, g().status)
  assert.equal(g().skCons.filter((c) => c.type === 'tangent').length, 8)
  assert.equal(g().skCons.filter((c) => c.type === 'rad').length, 1)
  assert.equal(g().skCons.filter((c) => c.type === 'equal').length, 3)
  const byId = Object.fromEntries(g().skCons.map((c) => [c.id, c]))
  for (const [id, b] of [['h0', 0], ['v1', 1], ['h2', 2], ['v3', 3]]) assert.ok(Math.abs(sh.bulges[byId[id].a.idx]) < 1e-9, `${id} still on a straight edge (idx ${byId[id].a.idx}, was ${b})`)
  assert.ok(byId.w && byId.hh, 'dims kept')
  assert.equal(g().skDof, 0, 'DOF ' + g().skDof); assert.equal(g().skConflict, false)
  const v = sh.verts
  for (let i = 1; i < 8; i += 2) assert.ok(near(v[i][0], v[(i + 1) % 8][0]) || near(v[i][1], v[(i + 1) % 8][1]), 'straight edges axis-aligned ' + JSON.stringify(v))
  assert.deepEqual(ext(v).map((x) => Math.round(x * 1e6) / 1e6), [0, 0, 60, 40])
  assert.match(g().status, /4 個角倒 R8/); assert.match(g().status, /8 個相切約束/)
  assert.equal(g().sketchUndo.length, undo0 + 1, 'exactly one undo step')
  await setDim(g().skCons.find((c) => c.type === 'rad').id, 4)   // equal radii follow
  const w = g().sketchShape.verts
  assert.ok(near(w[1][0], 4) && near(w[2][0], 56) && near(w[4][1], 36) && near(w[0][1], 4), 'all arcs R4: ' + JSON.stringify(w))
  await g().undo(); await settle()
  assert.equal(JSON.stringify({ sh: g().sketchShape, cons: g().skCons }), before, 'Ctrl+Z restores the rectangle + constraints')
})

test('#1 全部角 chamfer: constraints renumbered, geometry stays axis-aligned after solve, one undo', async () => {
  rect('cchamfer')
  const undo0 = g().sketchUndo.length
  await g().chamferSketchCorners(5); await settle()
  const v = g().sketchShape.verts ?? g().sketchShape.pts
  assert.equal(v.length, 8, g().status)
  assert.equal(g().skConflict, false)
  assert.deepEqual(ext(v).map((x) => Math.round(x * 1e6) / 1e6), [0, 0, 60, 40])
  assert.ok(near(v[1][1], v[2][1]) && near(v[3][0], v[4][0]) && near(v[5][1], v[6][1]) && near(v[7][0], v[0][0]), JSON.stringify(v))
  assert.equal(g().sketchUndo.length, undo0 + 1)
})

test('cornerRemap: non-right corner — len without formula converts to L·sinφ, with formula is dropped honestly', () => {
  const verts = [[0, 0], [60, 0], [30, 40]]   // corner 1 between edge 0 and edge 1
  const cons = [{ id: 'a', kind: 'dim', type: 'len', a: E(0), value: 60 }, { id: 'b', kind: 'dim', type: 'len', a: E(1), value: 50, expr: 'd1-10' }]
  const r = R.remapCornerConstraints({ type: 'poly', pts: verts }, verts, 1, 0, cons, { fillet: true, mkId: () => 't' })
  const a = r.cons.find((c) => c.id === 'a')
  assert.equal(a.type, 'p2l'); assert.equal(a.a.idx, 0); assert.equal(a.b.idx, 2)
  assert.ok(near(a.value, 60 * 0.8), String(a.value))
  assert.equal(r.cons.find((c) => c.id === 'b'), undefined); assert.equal(r.dropped, 1)
})
