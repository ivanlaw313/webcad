// SKETCH12 batch 3：#3 三角形尺寸啱放低 → resolveSk 將頂點由 39.99999 求解到 40 → 編輯 session 唔可以因此作廢（12.5 要生效）；
// 但真係有人改過約束／陣列就照舊作廢。#1 打咗偏移距離 → 方向跟游標（內／外），⇄ 反向再調轉。
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire, register } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
const { useApp } = await import('../src/store.ts')
const g = () => useApp.getState()
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e
const tri = () => useApp.setState({ ...useApp.getInitialState(), mode: 'sketch', sketchTool: 'dim', sketchProfiles: [], appConfirm: async () => true,
  sketchShape: { type: 'poly', pts: [[0, 0], [39.99999191587334, 0], [20, 30]] }, skCons: [{ id: 'k1', name: 'd1', kind: 'dim', type: 'hdist', a: { kind: 'pt', shape: 0, idx: 0 }, b: { kind: 'pt', shape: 0, idx: 1 }, value: 40 }] })

test('#3 solver settling the just-placed dimension (39.99999→40) does not void the open edit: 12.5 applies', async () => {
  tri()
  g().beginSkDimEdit('k1')
  // resolveSk lands while the editor is open (same cons object, geometry nudged by 8µm)
  useApp.setState({ sketchShape: { type: 'poly', pts: [[0, 0], [40, 0], [20, 30]] } })
  await g().previewSkDimEdit({ value: 12.5 })
  assert.equal(g().skDimPreview.id, 'k1'); assert.equal(g().skDimPreview.error, null)
  await g().confirmSkDimEdit()
  const p = g().sketchShape.pts
  assert.ok(near(Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]), 12.5, 1e-6), JSON.stringify(p))
  assert.equal(g().skCons[0].value, 12.5); assert.match(g().status, /已更新尺寸/)
})

test('#3 settle between preview and confirm: confirm re-solves on the settled sketch', async () => {
  tri()
  g().beginSkDimEdit('k1')
  await g().previewSkDimEdit({ value: 12.5 })
  useApp.setState({ sketchShape: { type: 'poly', pts: [[0, 0], [40, 0], [20, 30]] } })
  await g().confirmSkDimEdit()
  assert.equal(g().skCons[0].value, 12.5)
  const p = g().sketchShape.pts
  assert.ok(near(Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]), 12.5, 1e-6))
})

test('#3 a real change under the editor (constraints replaced / big geometry move) still voids the stale session', async () => {
  tri()
  g().beginSkDimEdit('k1')
  useApp.setState({ skCons: g().skCons.map((c) => ({ ...c })) })   // someone rewrote the constraints
  await g().previewSkDimEdit({ value: 12.5 })
  await g().confirmSkDimEdit()
  assert.equal(g().skCons[0].value, 40)
  tri()
  g().beginSkDimEdit('k1')
  useApp.setState({ sketchShape: { type: 'poly', pts: [[0, 0], [45, 0], [20, 30]] } })   // 5mm user move ≠ solver settle
  await g().previewSkDimEdit({ value: 12.5 })
  await g().confirmSkDimEdit()
  assert.equal(g().skCons[0].value, 40)
})

const rect = () => useApp.setState({ ...useApp.getInitialState(), mode: 'sketch', sketchTool: 'offset', sketchProfiles: [{ type: 'rect', a: [0, 0], b: [60, 40] }], sketchShape: null, skCons: [], sketchOffsetD: 5 })
const bb = (sh) => { const p = sh.type === 'rect' ? [sh.a, sh.b] : sh.pts; const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map((v) => Math.round(v * 1e6) / 1e6) }
for (const [where, cur, want] of [['inside', [30, 12], [5, 5, 55, 35]], ['outside', [30, -12], [-5, -5, 65, 45]]]) {
  test(`#1 typed offset 5 with the cursor ${where} → ${where === 'inside' ? 'inward' : 'outward'} (Fusion: side follows the cursor)`, async () => {
    rect()
    await g().skOffsetAt([30, 0])
    useApp.setState({ sketchPreview: cur })
    g().sizeTypeKey('5')
    await g().skOffsetAt(cur)
    const off = g().sketchProfiles.find((x) => x.offsetOf)
    assert.deepEqual(bb(off), want)
    assert.match(g().status, where === 'inside' ? /（內）/ : /（外）/)
  })
}
test('#1 ⇄ 反向 while sizing flips relative to the cursor', async () => {
  rect()
  await g().skOffsetAt([30, 0])
  useApp.setState({ sketchPreview: [30, 12] })
  g().sizeTypeKey('5')
  g().flipSketchOffset()
  await g().skOffsetAt([30, 12])
  assert.deepEqual(bb(g().sketchProfiles.find((x) => x.offsetOf)), [-5, -5, 65, 45])
})

test('(b) rejected just-placed dimension rolls the whole placement back (no duplicate), Traditional reason', async () => {
  tri()
  const before = { cons: g().skCons, shape: g().sketchShape }
  // placement = undo snapshot + new dim (what placeDim does)
  useApp.setState({ sketchUndo: [...g().sketchUndo, { skCons: before.cons, sketchShape: before.shape, sketchProfiles: [], polyPts: [], sketchStart: null, skPatternData: null, skDof: null, skConflict: false, skConflictIds: [], skFreeShapes: new Set() }],
    skCons: [...before.cons, { id: 'k2', name: 'd2', kind: 'dim', type: 'len', a: { kind: 'edge', shape: 0, idx: 0 }, value: 40 }] })
  g().beginSkDimEdit('k2')
  await g().previewSkDimEdit({ value: 15 })
  assert.match(g().skDimPreview.error ?? '', /過約束|已拒絕/)
  assert.doesNotMatch(g().skDimPreview.error, /[A-Za-z]{4,}/, 'no English solver text')
  await g().rollbackPlacedDim('k2', g().skDimPreview.error)
  assert.deepEqual(g().skCons.map((c) => c.id), ['k1'])
  assert.equal(g().sketchUndo.length, 0, 'placement snapshot popped')
  assert.match(g().status, /^⚠ 尺寸已拒絕：/)
})

test('(a) circle radius option: Dimension tool places R (rad) when 「R 半徑」 is chosen', async () => {
  useApp.setState({ ...useApp.getInitialState(), mode: 'sketch', sketchTool: 'dimension', sketchProfiles: [{ type: 'circle', c: [0, 0], r: 10 }], sketchShape: null, skCons: [], appConfirm: async () => true })
  g().setDimCircleRad(true)
  await g().skClickAt([10, 0])
  await new Promise((r) => setTimeout(r, 50))
  const d = g().skCons.find((c) => c.kind === 'dim')
  assert.ok(d, g().status); assert.equal(d.type, 'rad'); assert.equal(d.value, 10)
  g().setDimCircleRad(false)
  useApp.setState({ skCons: [] })
  await g().skClickAt([10, 0]); await new Promise((r) => setTimeout(r, 50))
  assert.equal(g().skCons.find((c) => c.kind === 'dim')?.type, 'dia')
})

test('(c) Perpendicular on two lines already held parallel (both horizontal) is rejected — nothing collapses', async () => {
  const L = (y) => ({ type: 'poly', open: true, pts: [[0, y], [40, y]] })
  useApp.setState({ ...useApp.getInitialState(), mode: 'sketch', sketchTool: 'select', sketchProfiles: [L(0), L(20)], sketchShape: null, appConfirm: async () => true,
    skCons: [{ id: 'h0', kind: 'con', type: 'h', a: { kind: 'edge', shape: 0, idx: 0 } }, { id: 'h1', kind: 'con', type: 'h', a: { kind: 'edge', shape: 1, idx: 0 } }],
    skSel: [{ kind: 'edge', shape: 0, idx: 0 }, { kind: 'edge', shape: 1, idx: 0 }] })
  const n = g().sketchUndo.length
  await g().addSkCon('perp')
  assert.ok(!g().skCons.some((c) => c.type === 'perp'))
  assert.match(g().status, /「垂直」同現有約束衝突/)
  assert.equal(g().sketchUndo.length, n)
  assert.ok(g().sketchProfiles.every((p) => Math.hypot(p.pts[1][0] - p.pts[0][0], p.pts[1][1] - p.pts[0][1]) > 39))
})

test('(c) Perpendicular on two free lines still works', async () => {
  useApp.setState({ ...useApp.getInitialState(), mode: 'sketch', sketchTool: 'select', sketchProfiles: [{ type: 'poly', open: true, pts: [[0, 0], [40, 0]] }, { type: 'poly', open: true, pts: [[0, 20], [40, 25]] }], sketchShape: null, appConfirm: async () => true,
    skCons: [], skSel: [{ kind: 'edge', shape: 0, idx: 0 }, { kind: 'edge', shape: 1, idx: 0 }] })
  await g().addSkCon('perp')
  await new Promise((r) => setTimeout(r, 50))
  assert.ok(g().skCons.some((c) => c.type === 'perp'), g().status)
})
