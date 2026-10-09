// P1 A：歸零還原角 + as-built 位姿；驅動旋轉唔改 pos；圓柱軸建關節帶 restChildPose
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
import test from 'node:test'
import assert from 'node:assert/strict'
import { Matrix4, Vector3 } from 'three'
import { computeFK, cadAxisToWorld } from '../src/assembly/kinematics.ts'
const { useApp } = await import('../src/store.ts')
const g = () => useApp.getState()
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e
const box = (id, pos = [0, 0, 0]) => ({
  id, name: id,
  mesh: { vertices: [-5, -5, -5, 5, -5, -5, 5, 5, 5, -5, 5, 5], triangles: [0, 1, 2, 0, 2, 3], normals: [] },
  pos, rot: [0, 0, 0], color: '#888',
})

test('revolute FK rotates about axis without translating the origin off the mate', () => {
  const axis = cadAxisToWorld('Z') // three +Y
  const j = { id: 'J1', name: 'j', type: 'revolute', parent: 'P', child: 'S', anchor: [0, 30, 0], axis, angle: 0, slide: 0 }
  const fk0 = computeFK(['P', 'S'], [j]).get('S')
  const p0 = new Vector3(0, 30, 10).applyMatrix4(fk0)
  const fk1 = computeFK(['P', 'S'], [{ ...j, angle: -102 }]).get('S')
  const p1 = new Vector3(0, 30, 10).applyMatrix4(fk1)
  assert.ok(near(p0.y, 30) && near(p1.y, 30), 'height on axis preserved')
  assert.ok(near(Math.hypot(p1.x, p1.z), Math.hypot(p0.x, p0.z), 1e-5), 'radial distance to axis preserved')
})

test('homeJoints restores restChildPose as well as angle', () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  useApp.setState({
    components: [box('P'), box('S', [0, 30, 0])],
    joints: [{
      id: 'J1', name: '關節1', type: 'revolute', parent: 'P', child: 'S',
      anchor: [0, 30, 0], axis: cadAxisToWorld('Z'), angle: -102, slide: 0,
      restChildPose: { pos: [0, 30, 0], rot: [0, 0, 0] },
    }],
    undoStack: [], redoStack: [],
  })
  // Simulate a bad bake that moved the child off the mate
  useApp.setState({ components: [box('P'), box('S', [0, 69, 12])] })
  g().homeJoints()
  const s = g().components.find((c) => c.id === 'S')
  const j = g().joints[0]
  assert.equal(j.angle, 0)
  assert.ok(near(s.pos[0], 0) && near(s.pos[1], 30) && near(s.pos[2], 0), `pose restored got ${s.pos}`)
})

test('addJoint captures restChildPose from current child pose', () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  useApp.setState({ components: [box('P'), box('S', [3, 4, 5])], joints: [], undoStack: [], redoStack: [] })
  g().addJoint({ type: 'revolute', parent: 'P', child: 'S', anchor: [3, 4, 5], axis: [0, 1, 0], angle: 0, slide: 0 })
  const j = g().joints[0]
  assert.ok(j.restChildPose)
  assert.deepEqual(j.restChildPose.pos, [3, 4, 5])
})
