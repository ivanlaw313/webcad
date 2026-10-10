// FISHING14 P1: Joint tool snap is a PREVIEW — 取消／Esc in 「關節類型」 or 取消 in 「混合面澄清」 restores the child pose
// exactly with a clean undo stack; only 確定 commits snap + joint as ONE undo step; mixed cyl↔planar pick lands the
// cylinder upright on the face centre. P2/P3: start-stage Tab always switches X→Y (never browser focus navigation),
// ribbon sketch tools release focus after a mouse pick.
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
const { useApp, jointPreviewRestorePose, JOINT_MIXED_PICK_NOTE, compWorldMatrix } = await import('../src/store.ts')
const ux = await import('../src/sketch/sketchPointerUx.ts')
const g = () => useApp.getState()
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms))

// CAD-space box mesh (8 corners + 12 triangles) — enough for meshCenter3 / no-penetration sampling
function boxMesh([x0, y0, z0], [x1, y1, z1]) {
  const v = []; for (let k = 0; k < 8; k++) v.push(k & 1 ? x1 : x0, k & 2 ? y1 : y0, k & 4 ? z1 : z0)
  const t = [0, 1, 3, 0, 3, 2, 4, 6, 7, 4, 7, 5, 0, 4, 5, 0, 5, 1, 2, 3, 7, 2, 7, 6, 0, 2, 6, 0, 6, 4, 1, 5, 7, 1, 7, 3]
  return { vertices: v, triangles: t, normals: v.map(() => 0) }
}
const BOX_TOP = { kind: 'planar', n: [0, 1, 0], p: [-110, 20, -40] }               // three-world (CAD z → three y, CAD y → −z)
const CYL_SIDE = (pos = [130, 0, 0]) => ({ kind: 'cyl', axis: [0, 1, 0], p: [pos[0], 30, pos[2]], r: 5 })
function seed() {
  useApp.setState({
    ...useApp.getInitialState(), mode: 'model', lang: 'zh-HK',
    components: [
      { id: 'C1', name: '組件1', mesh: boxMesh([-160, 0, 0], [-60, 80, 20]), pos: [0, 0, 0], rot: [0, 0, 0], grounded: true },
      { id: 'C2', name: '組件2', mesh: boxMesh([-5, -5, 0], [5, 5, 60]), pos: [130, 0, 0], rot: [0, 0, 0] },
    ],
    joints: [], undoStack: [{ marker: 'pre' }], redoStack: [],
  }, true)
}
const child = () => g().components.find((c) => c.id === 'C2')
async function pick({ type = null, confirm = true } = {}) {
  const seen = []
  useApp.setState({
    appPick: async (msg, opts, def, title) => { seen.push({ kind: 'pick', msg, title, def, during: { pos: [...child().pos], undo: g().undoStack.length } }); return type },
    appConfirm: async (msg, title) => { seen.push({ kind: 'confirm', msg, title }); return confirm },
  })
  g().startJointPick()
  g().pickFaceForJoint('C2', CYL_SIDE())
  g().pickFaceForJoint('C1', BOX_TOP)
  await tick()
  return seen
}

test('取消 in 關節類型: preview snap shown, then pose restored exactly, undo stack untouched, no joint', async () => {
  seed()
  const before = { pos: [...child().pos], rot: [...child().rot], undo: g().undoStack.length }
  const seen = await pick({ type: null })
  assert.equal(seen[0].kind, 'pick')
  assert.notDeepEqual(seen[0].during.pos, before.pos, 'preview moved the child while the picker was open')
  assert.equal(seen[0].during.undo, before.undo, 'preview pushes nothing')
  assert.deepEqual(child().pos, before.pos)
  assert.deepEqual(child().rot, before.rot)
  assert.equal(g().undoStack.length, before.undo)
  assert.equal(g().joints.length, 0)
  assert.match(g().status, /已取消建關節.*已還原原來位置/)
  assert.doesNotMatch(g().status, /可撤銷貼合/)
})

test('mixed cylinder ↔ planar pick is explained in the type picker (Formal Traditional)', async () => {
  seed()
  const seen = await pick({ type: null })
  assert.ok(seen[0].msg.includes(JOINT_MIXED_PICK_NOTE))
  assert.match(JOINT_MIXED_PICK_NOTE, /混合拾取（圓柱面 ↔ 平面）/)
  assert.doesNotMatch(JOINT_MIXED_PICK_NOTE, /[嘅咗唔喺]/, 'formal written Chinese, no Cantonese particles')
})

test('取消 in 混合面澄清 restores the pose with a clean undo stack', async () => {
  seed()
  const before = { pos: [...child().pos], undo: g().undoStack.length }
  const seen = await pick({ type: 'revolute', confirm: false })
  assert.deepEqual(seen.map((x) => x.kind), ['pick', 'confirm'])
  assert.equal(seen[1].title, '混合面澄清')
  assert.deepEqual(child().pos, before.pos)
  assert.equal(g().undoStack.length, before.undo)
  assert.equal(g().joints.length, 0)
  assert.match(g().status, /已還原原來位置/)
})

test('確定 commits snap + joint as ONE undo step; snap = upright, through the face centre, resting on top', async () => {
  seed()
  const before = { pos: [...child().pos], undo: g().undoStack.length }
  await pick({ type: 'revolute', confirm: true })
  assert.equal(g().joints.length, 1)
  assert.equal(g().joints[0].type, 'revolute')
  assert.equal(g().undoStack.length, before.undo + 1)
  const snap = g().undoStack.at(-1)
  assert.deepEqual(snap.components.find((c) => c.id === 'C2').pos, before.pos, 'the single undo snapshot holds the pre-snap pose')
  // world bbox of the child after the snap
  const M = compWorldMatrix(child()), V = child().mesh.vertices, mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]
  const e = M.elements
  for (let i = 0; i < V.length; i += 3) {
    const x = V[i], y = V[i + 1], z = V[i + 2]
    const w = [e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]]
    for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], w[k]); mx[k] = Math.max(mx[k], w[k]) }
  }
  assert.ok(Math.abs((mx[1] - mn[1]) - 60) < 1e-6, 'axis stays vertical (∥ top normal)')
  assert.ok(Math.abs((mn[0] + mx[0]) / 2 - -110) < 1e-6 && Math.abs((mn[2] + mx[2]) / 2 - -40) < 1e-6, 'axis through the top-face centre')
  assert.ok(Math.abs(mn[1] - 20) < 1e-6, 'bottom end rests on the top face (no penetration, no gap)')
  const j = g().joints[0]
  assert.ok(Math.abs(j.anchor[1] - 20) < 1e-6 && Math.abs(j.axis[1]) > 0.999)
})

test('two planar faces + a cylinder-axis type → refusal also restores the preview', async () => {
  seed()
  const before = [...child().pos]
  useApp.setState({ jointTypePref: 'revolute', appPick: async () => 'revolute', appConfirm: async () => true })
  g().startJointPick()
  g().pickFaceForJoint('C2', { kind: 'planar', n: [0, -1, 0], p: [130, 0, 0] })
  g().pickFaceForJoint('C1', BOX_TOP)
  await tick()
  // revolute is not offered for planar+planar → falls back to the geometric default (rigid) and commits; if a
  // cylinder-axis type ever slips through, the pose must be restored, never left moved without an undo step.
  if (g().joints.length === 0) assert.deepEqual(child().pos, before)
  else assert.notEqual(g().joints[0].type, 'revolute')
})

test('jointPreviewRestorePose deep-copies pos/rot (no shared references)', () => {
  const c = { id: 'X', pos: [1, 2, 3], rot: [4, 5, 6] }
  const p = jointPreviewRestorePose(c)
  c.pos[0] = 99; c.rot[0] = 99
  assert.deepEqual(p, { id: 'X', pos: [1, 2, 3], rot: [4, 5, 6] })
  assert.equal(jointPreviewRestorePose({ id: 'Y', pos: [0, 0, 0] }).rot, undefined)
})

test('P3 contract: start-stage Tab is always the X→Y field switch (preventDefault), even with an empty buffer', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /\/\^\[0-9\.\\-\]\$\/\.test\(e\.key\) \|\| e\.key === 'Tab' \|\| \(\(e\.key === 'Enter' \|\| e\.key === 'Backspace'\) && hasBuf\)/)
  useApp.setState({ ...useApp.getInitialState(), mode: 'sketch', sketchTool: 'rectangle', sketchStart: null, polyPts: [], dimBuf: ['', ''], dimField: 0 }, true)
  for (const k of ['4', '0', 'Tab', '2', '5']) g().sketchTypeKey(k)
  assert.deepEqual(g().dimBuf, ['40', '25'])
  g().sketchTypeKey('Enter')
  assert.deepEqual(g().sketchStart, [40, 25])
  useApp.setState({ sketchStart: null, dimBuf: ['', ''], dimField: 0 })
  for (const k of ['Tab', '2', '5', 'Enter']) g().sketchTypeKey(k)   // Tab first (X empty) still moves to Y
  assert.deepEqual(g().sketchStart, [0, 25])
})

test('P2: a mouse pick of a ribbon sketch tool releases button focus; keyboard activation keeps it', () => {
  let blurred = 0
  ux.releaseSketchToolFocus({ detail: 1, currentTarget: { blur: () => { blurred++ } } })
  assert.equal(blurred, 1)
  ux.releaseSketchToolFocus({ detail: 0, currentTarget: { blur: () => { blurred++ } } })
  assert.equal(blurred, 1)
  const rib = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')
  assert.match(rib, /run\(cmd\.id, cmd\.label\); releaseSketchToolFocus\(e\)/)
})
