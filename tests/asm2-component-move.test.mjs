// ASM2 P2：功能區「移動／複製」可移動組件（實體已全部轉成組件時以前報「請先創建一個實體」），且尊重關節。
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
import test from 'node:test'
import assert from 'node:assert/strict'
const { useApp } = await import('../src/store.ts')
const { planComponentMove, cadMoveToWorld, jointGroupOf } = await import('../src/assembly/componentMove.ts')
const g = () => useApp.getState()
const box = () => ({ vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], triangles: [0, 1, 2], normals: [] })
const comp = (id, name, extra = {}) => ({ id, name, mesh: box(), pos: [0, 0, 0], rot: [0, 0, 0], color: '#888', ...extra })
const J = (id, type, parent, child, axis = [0, 1, 0]) => ({ id, name: id, type, parent, child, anchor: [0, 10, 0], axis, angle: 0, slide: 0 })
const reset = (components, joints = [], grounded = null) => useApp.setState({ components, joints, grounded, features: [], undoStack: [], redoStack: [], selectedComponent: null, checkedComps: [], featDlg: null, mates: [] })

test('plan: free component moves; grounded refused with the formal hint', () => {
  const C = [comp('A', '組件1'), comp('B', '組件2', { grounded: true })]
  assert.deepEqual(planComponentMove(['A'], [5, 0, 0], [0, 0, 0], C, []), { kind: 'free', ids: ['A'] })
  assert.equal(planComponentMove(['B'], [5, 0, 0], [0, 0, 0], C, []).msg, '「組件2」（已固定）— 請先取消固定才可移動')
})

test('plan: jointed to a grounded part → refused (would leave the axis); slider child along its axis → drives the joint', () => {
  const C = [comp('P', '組件1', { grounded: true }), comp('S', '組件2')]
  const rev = [J('J1', 'revolute', 'P', 'S')]
  const r = planComponentMove(['S'], [5, 0, 0], [0, 0, 0], C, rev)
  assert.equal(r.kind, 'refuse'); assert.match(r.msg, /以關節「J1」連接到已固定的「組件1」— 直接移動會令其脫離關節軸線/)
  assert.doesNotMatch(r.msg, /唔|嘅|喺|冇|咗|啲|Fusion/)
  const sl = [J('J1', 'slider', 'P', 'S', [1, 0, 0])]
  assert.deepEqual(planComponentMove(['S'], [7, 0, 0], [0, 0, 0], C, sl), { kind: 'drive', jointId: 'J1', slide: 7, compId: 'S' })
  const off = planComponentMove(['S'], [7, 3, 0], [0, 0, 0], C, sl)
  assert.equal(off.kind, 'refuse'); assert.match(off.msg, /只可沿關節「J1」的滑動軸移動/)
  assert.match(planComponentMove(['S'], [0, 0, 0], [0, 30, 0], C, rev).msg, /直接旋轉會令其脫離關節軸線/)
})

test('plan: an ungrounded jointed group translates together (joint anchors follow)', () => {
  const C = [comp('A', '組件1'), comp('B', '組件2'), comp('C', '組件3')]
  const JJ = [J('J1', 'revolute', 'A', 'B'), J('J2', 'rigid', 'B', 'C')]
  assert.deepEqual([...jointGroupOf('C', JJ)].sort(), ['A', 'B', 'C'])
  const p = planComponentMove(['B'], [0, 0, 4], [0, 0, 0], C, JJ)
  assert.equal(p.kind, 'group'); assert.deepEqual(p.ids.sort(), ['A', 'B', 'C']); assert.deepEqual(p.jointIds.sort(), ['J1', 'J2'])
})

test('CAD move (Z up) maps to three world (Y up)', () => {
  assert.deepEqual(cadMoveToWorld(1, 2, 3, 10, 20, 30), { d: [1, 3, -2], r: [10, 30, -20] })
})

test('ribbon 移動/複製 with only components (no body left): opens, defaults to 組件, moves the selected component, one undo', async () => {
  reset([comp('A', '組件1'), comp('B', '組件2')])
  g().selectComponent('A')
  g().openFeatDlg('move')
  assert.ok(g().featDlg, g().status); assert.notEqual(g().status, '請先創建一個實體')
  assert.equal(g().featDlg.params.objectType, 'components')
  g().setFeatParam('dz', 10)
  await g().commitFeatDlg()
  assert.deepEqual(g().components.find((c) => c.id === 'A').pos, [0, 10, 0])   // CAD +Z = world +Y
  assert.equal(g().featDlg, null)
  assert.equal(g().undoStack.length, 1)
})

test('store: jointed child of a grounded part is not pulled off its axis; slider child moved along the axis drives the slider', async () => {
  reset([comp('P', '組件1', { grounded: true }), comp('S', '組件2')], [J('J1', 'revolute', 'P', 'S')])
  assert.equal(g().moveComponentsByUser(['S'], [5, 0, 0]), false)
  assert.deepEqual(g().components[1].pos, [0, 0, 0]); assert.match(g().status, /脫離關節軸線/)
  reset([comp('P', '組件1', { grounded: true }), comp('S', '組件2')], [J('J1', 'slider', 'P', 'S', [1, 0, 0])])
  assert.equal(g().moveComponentsByUser(['S'], [6, 0, 0]), true)
  assert.equal(g().joints[0].slide, 6); assert.deepEqual(g().components[1].pos, [0, 0, 0]); assert.equal(g().undoStack.length, 1)
  // dialog: refused → dialog stays open with the reason
  reset([comp('P', '組件1', { grounded: true }), comp('S', '組件2')], [J('J1', 'revolute', 'P', 'S')])
  g().selectComponent('S'); g().openFeatDlg('move')
  g().setFeatParam('dx', 5)
  await g().commitFeatDlg()
  assert.ok(g().featDlg); assert.match(g().status, /脫離關節軸線/)
})

test('store: ungrounded jointed group moves together and the joint anchor follows (one undo step)', async () => {
  reset([comp('A', '組件1'), comp('B', '組件2')], [J('J1', 'revolute', 'A', 'B')])
  assert.equal(g().moveComponentsByUser(['B'], [0, 0, 4]), true)
  assert.deepEqual(g().components.map((c) => c.pos), [[0, 0, 4], [0, 0, 4]])
  assert.deepEqual(g().joints[0].anchor, [0, 10, 4])
  assert.match(g().status, /連同以關節連接的 1 個組件一併平移（關節保持）/)
  await g().undo(); assert.deepEqual(g().joints[0].anchor, [0, 10, 0]); assert.deepEqual(g().components[1].pos, [0, 0, 0])
})
