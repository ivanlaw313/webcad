// RETEST18 #2：關節拾取容許 Fusion 式混合 snap — 圓柱軸 ↔ 平面（面心/法向），預設旋轉；唔再報「面類型不匹配」。
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
import test from 'node:test'
import assert from 'node:assert/strict'
import { Matrix4, Vector3 } from 'three'
import { solveFaceMateDelta, transformFace } from '../src/assembly/faceMate.ts'
await import('../src/worker/cad.worker.ts'); await globalThis.__wheelWorker.ready()
const { useApp } = await import('../src/store.ts')
const g = () => useApp.getState()
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e
const V = (a) => new Vector3(...a)
const distToLine = (p, o, d) => { const v = V(p).sub(V(o)); return v.sub(V(d).normalize().multiplyScalar(v.dot(V(d).normalize()))).length() }

test('parent plane + child cylinder: shaft axis → plane normal (least rotation), axis through face centre, height kept', () => {
  const plate = { kind: 'planar', n: [0, 1, 0], p: [10, 0, -5] }
  const shaft = { kind: 'cyl', axis: [1, 0, 0], p: [50, 20, 7], r: 4 }      // lying shaft, 20 above the plate
  const D = solveFaceMateDelta(plate, shaft)
  const post = transformFace(shaft, D)
  assert.ok(near(Math.abs(V(post.axis).normalize().dot(V(plate.n))), 1), 'axis ∥ plate normal')
  assert.ok(distToLine(plate.p, post.p, post.axis) < 1e-6, 'axis passes through the plate face centre')
  assert.ok(near(V(post.p).sub(V(plate.p)).dot(V(plate.n)), 20), 'height above the plate preserved (no sinking in)')
  // already upright shaft → pure translation (no flip)
  const up = transformFace({ kind: 'cyl', axis: [0, -1, 0], p: [3, 8, 3], r: 4 }, solveFaceMateDelta(plate, { kind: 'cyl', axis: [0, -1, 0], p: [3, 8, 3], r: 4 }))
  assert.ok(near(up.axis[1], -1), 'least-rotation sign: −Y stays −Y')
})

test('parent cylinder + child plane: plane normal → ±axis, plane centre onto the axis line, axial position kept', () => {
  const shaft = { kind: 'cyl', axis: [0, 0, 1], p: [0, 0, 0], r: 5 }
  const hubFace = { kind: 'planar', n: [0.2, 0.1, -1], p: [7, -3, 12] }
  const post = transformFace(hubFace, solveFaceMateDelta(shaft, hubFace))
  assert.ok(near(Math.abs(V(post.n).normalize().z), 1))
  assert.ok(near(post.p[0], 0) && near(post.p[1], 0) && near(post.p[2], 12))
})

const box = (id, w = 10) => ({ id, name: id, mesh: { vertices: [-w, -w, -w, w, -w, -w, w, w, w, -w, w, w], triangles: [0, 1, 2, 0, 2, 3], normals: [] }, pos: [0, 0, 0], rot: [0, 0, 0], color: '#888' })
async function pickPair(A, B, answer) {
  let asked = null
  useApp.setState({ components: [box('P'), box('S')], joints: [], undoStack: [], redoStack: [], grounded: null, jointPickMode: true, jointPick: null,
    appPick: async (_m, opts, def) => { asked = { opts: opts.map((o) => o.value ?? o.id ?? o), def }; return answer === undefined ? def : answer } })
  g().pickFaceForJoint('P', A)
  g().pickFaceForJoint('S', B)
  await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0))
  return asked
}

test('store: plate face (parent) + shaft cylinder (child) creates a revolute joint on the shaft axis — no type-mismatch rejection', async () => {
  const plate = { kind: 'planar', n: [0, 1, 0], p: [10, 0, -5] }
  const shaft = { kind: 'cyl', axis: [1, 0, 0], p: [50, 20, 7], r: 4 }
  const asked = await pickPair(plate, shaft)
  assert.doesNotMatch(g().status, /唔夾|不匹配|唔支持/, g().status)
  assert.equal(asked.def, 'revolute', 'default type = revolute')
  const j = g().joints[0]
  assert.ok(j, 'joint created'); assert.equal(j.type, 'revolute'); assert.equal(j.parent, 'P'); assert.equal(j.child, 'S')
  assert.ok(near(Math.abs(j.axis[1]), 1, 1e-6), `axis = plate normal ${j.axis}`)
  assert.ok(near(j.anchor[0], 10, 1e-6) && near(j.anchor[1], 0, 1e-6) && near(j.anchor[2], -5, 1e-6), `anchor = plate face centre ${j.anchor}`)
  assert.equal(g().undoStack.length, 1, 'snap + joint = one undo step')
})

test('store: shaft cylinder (parent) + hub plane (child) also accepted', async () => {
  await pickPair({ kind: 'cyl', axis: [0, 0, 1], p: [0, 0, 0], r: 5 }, { kind: 'planar', n: [0, 0, -1], p: [7, -3, 12] })
  const j = g().joints[0]
  assert.equal(j?.type, 'revolute')
  assert.ok(near(Math.abs(j.axis[2]), 1) && near(j.anchor[0], 0) && near(j.anchor[1], 0) && near(j.anchor[2], 12), `${j.axis} @ ${j.anchor}`)
})

test('same-kind picks unchanged (plane+plane → rigid default, cyl+cyl → revolute)', async () => {
  let a = await pickPair({ kind: 'planar', n: [0, 1, 0], p: [0, 0, 0] }, { kind: 'planar', n: [0, 1, 0], p: [0, 30, 0] })
  assert.equal(a.def, 'rigid'); assert.equal(g().joints[0].type, 'rigid')
  a = await pickPair({ kind: 'cyl', axis: [0, 1, 0], p: [0, 0, 0], r: 3 }, { kind: 'cyl', axis: [0, 1, 0], p: [5, 0, 0], r: 3 })
  assert.equal(a.def, 'revolute'); assert.equal(g().joints[0].type, 'revolute')
})
