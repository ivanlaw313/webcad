// SKETCH12 b4（tester WORKFLOW on Cbf7Xskc）：一鍵自動約束推斷 H/V/重合（帶容差）、點到點尺寸方向跟放置方向且放置時不移動幾何、
// 圓 Ø／圓心距尺寸建立即開輸入框、建立＋輸入數值為同一撤銷步驟、新拉伸預設 10 mm。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire, register } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
const { useApp, autoHVCons, p2pDimKind, NEW_EXTRUDE_DEFAULT_MM } = await import('../src/store.ts')
const g = () => useApp.getState()
const settle = (ms = 150) => new Promise((r) => setTimeout(r, ms))
const fresh = (extra = {}) => useApp.setState({ ...useApp.getInitialState(), mode: 'sketch', sketchPlane: 'XY', sketchProfiles: [], sketchShape: null, skCons: [], appConfirm: async () => true, ...extra }, true)
const hand = [[0.4, -0.3], [30, 1.2], [31.1, 20.5], [5, 21.6]]
const handPoly = () => ({ type: 'poly', pts: hand.map((p) => [...p]), verts: hand.map((p) => [...p]), bulges: [0, 0, 0], open: true })

test('autoHVCons: segments within 4° of horizontal/vertical get H/V; steep diagonals do not', () => {
  const cs = autoHVCons(handPoly(), 0, [])
  assert.deepEqual(cs.map((c) => [c.type, c.a.idx]), [['h', 0], ['v', 1], ['h', 2]])
  const diag = { type: 'poly', pts: [[0, 0], [30, 10]], verts: [[0, 0], [30, 10]], bulges: [0], open: true }
  assert.equal(autoHVCons(diag, 0, []).length, 0)
  assert.equal(autoHVCons(handPoly(), 0, cs).length, 0, 'existing H/V are not duplicated')
})

test('一鍵自動約束 on a hand-drawn polyline: H/V on every near-axis segment + coincident to origin; geometry squares up; one undo step', async () => {
  fresh({ sketchProfiles: [handPoly()] })
  const u0 = g().sketchUndo.length
  await g().autoConstrainSel(); await settle(300)
  const cons = g().skCons
  const n = (t) => cons.filter((c) => c.type === t).length
  assert.equal(n('h'), 2, g().status); assert.equal(n('v'), 1, g().status)
  assert.ok(cons.some((c) => c.type === 'coincident' && (c.a.kind === 'origin' || c.b?.kind === 'origin')), 'start snaps to origin')
  assert.equal(g().skConflict, false)
  const v = g().sketchProfiles[0].verts
  assert.ok(Math.hypot(v[0][0], v[0][1]) < 1e-3, `start at origin: ${v[0]}`)
  assert.ok(Math.abs(v[0][1] - v[1][1]) < 1e-3 && Math.abs(v[2][1] - v[3][1]) < 1e-3, 'H segments level')
  assert.ok(Math.abs(v[1][0] - v[2][0]) < 1e-3, 'V segment plumb')
  assert.match(g().status, /自動約束：已加入 \d+ 個約束（重合 1、水平 2、豎直 1/)
  assert.equal(g().sketchUndo.length, u0 + 1)
})

test('一鍵自動約束: endpoint within 1 mm of another shape\'s endpoint gets coincident', async () => {
  const l2 = { type: 'poly', pts: [[5.6, 22], [5.6, 40]], verts: [[5.6, 22], [5.6, 40]], bulges: [0], open: true }
  fresh({ sketchProfiles: [handPoly(), l2] })
  await g().autoConstrainSel(); await settle(300)
  const co = g().skCons.filter((c) => c.type === 'coincident')
  assert.ok(co.some((c) => [c.a, c.b].some((r) => r?.shape === 1) && [c.a, c.b].some((r) => r?.shape === 0)), JSON.stringify(co))
  assert.equal(g().skConflict, false)
})

test('p2pDimKind: orientation follows the placement direction, not the bounding box', () => {
  const A = [0, 0], B = [30, 10]
  assert.equal(p2pDimKind(A, B, [15, 7]), 'hdist', 'just above, inside the box → horizontal (was aligned)')
  assert.equal(p2pDimKind(A, B, [15, 25]), 'hdist')
  assert.equal(p2pDimKind(A, B, [32, 5]), 'vdist', 'just beside → vertical')
  assert.equal(p2pDimKind(A, B, [50, 5]), 'vdist')
  assert.equal(p2pDimKind(A, B, [18, -4]), 'dist', 'perpendicular to the pair → aligned')
  assert.equal(p2pDimKind(A, B, [12, 14]), 'dist')
  assert.equal(p2pDimKind([0, 0], [30, 2], [15, 6]), 'hdist', 'near-horizontal pair, placed above → horizontal')
})

const pairPts = () => ({ type: 'poly', pts: [[0, 0], [30, 10]], verts: [[0, 0], [30, 10]], bulges: [0], open: true })
test('point-to-point dim: placing does not move geometry (exact measured value, not 1-decimal rounding)', async () => {
  for (const [place, type] of [[[18, -4], 'dist'], [[15, 7], 'hdist']]) {
    fresh({ sketchProfiles: [pairPts()] }); g().setSketchTool('dimension')
    g().skClickAt([0, 0]); g().skClickAt([30, 10]); assert.ok(g().skPendingPair, g().status)
    g().skClickAt(place); await settle(300)
    const d = g().skCons.find((c) => c.kind === 'dim')
    assert.equal(d?.type, type)
    assert.deepEqual(g().sketchProfiles[0].verts, [[0, 0], [30, 10]], 'geometry unmoved')
    if (type === 'dist') assert.ok(Math.abs(d.value - Math.hypot(30, 10)) < 1e-9, `exact value ${d.value}`)
    assert.equal(g().skDimEditReq, d.id, 'value input requested on creation')
  }
})

test('Ø and centre-to-centre dims request the value input on creation like line dims', async () => {
  fresh({ sketchProfiles: [{ type: 'circle', c: [0, 0], r: 10 }, { type: 'circle', c: [40, 0], r: 5 }] }); g().setSketchTool('dimension')
  g().skClickAt([0, 10]); await settle(200)
  const dia = g().skCons.find((c) => c.type === 'dia'); assert.ok(dia, g().status); assert.equal(g().skDimEditReq, dia.id)
  g().setSkDimEditReq(null)
  g().skClickAt([0, 0]); g().skClickAt([40, 0]); await settle(200)
  const cd = g().skCons.find((c) => c.kind === 'dim' && c.type === 'dist'); assert.ok(cd, g().status); assert.equal(g().skDimEditReq, cd.id)
})

test('dimension creation + typed value collapse into one undo step (SketchLayer commit)', () => {
  const src = readFileSync(new URL('../src/components/SketchLayer.tsx', import.meta.url), 'utf8')
  assert.match(src, /if\(justPlaced\.current===e\.conId\)\{[\s\S]{0,400}useApp\.setState\(\{sketchUndo:undo0\}\)/)
})

test('new extrude defaults to 10 mm (was 0 with a red hint)', () => {
  assert.equal(NEW_EXTRUDE_DEFAULT_MM, 10)
  fresh({ sketchShape: { type: 'rect', a: [0, 0], b: [20, 10] } })
  g().openExtrudeDlg()
  assert.equal(g().extrudeDlgOpen, true); assert.equal(g().extrudeHeight, 10)
})
