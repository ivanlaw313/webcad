// FISHING14 B：拖橙環到 −230° 後 ⌂／↺歸零 → 驅動角回 Rest(0) + restChildPose；滑動同理；一步撤銷
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
import test from 'node:test'
import assert from 'node:assert/strict'
import { cadAxisToWorld } from '../src/assembly/kinematics.ts'
const { useApp } = await import('../src/store.ts')
const g = () => useApp.getState()
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e
const box = (id, pos = [0, 0, 0]) => ({
  id, name: id,
  mesh: { vertices: [-5, -5, -5, 5, -5, -5, 5, 5, 5, -5, 5, 5], triangles: [0, 1, 2, 0, 2, 3], normals: [] },
  pos, rot: [0, 0, 0], color: '#888',
})

test('homeJoints after ring-drag −230.226° restores angle 0 and restChildPose', async () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  useApp.setState({
    components: [box('P'), box('S', [-0.6, 10, 1.25])],
    joints: [{
      id: 'J1', name: '關節1', type: 'revolute', parent: 'P', child: 'S',
      anchor: [-0.6, 10, 1.25], axis: cadAxisToWorld('Z'), angle: -230.226, slide: 0,
      restChildPose: { pos: [-0.6, 10, 1.25], rot: [0, 0, 0] },
    }],
    undoStack: [], redoStack: [],
  })
  // Simulate a baked drift (should be restored)
  useApp.setState({ components: [box('P'), box('S', [9, 9, 9])] })
  const beforeUndo = g().undoStack.length
  g().homeJoints()
  const j = g().joints[0]
  const s = g().components.find((c) => c.id === 'S')
  assert.equal(j.angle, 0)
  assert.ok(near(s.pos[0], -0.6) && near(s.pos[1], 10) && near(s.pos[2], 1.25), `pose ${s.pos}`)
  assert.equal(g().undoStack.length, beforeUndo + 1)
  await g().undo()
  assert.ok(Math.abs(g().joints[0].angle + 230.226) < 1e-6)
})

test('homeJoint (HUD path) restores single revolute drive without touching sibling', () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  useApp.setState({
    components: [box('P'), box('A', [0, 0, 0]), box('B', [40, 0, 0])],
    joints: [
      { id: 'J1', name: '關節1', type: 'revolute', parent: 'P', child: 'A', anchor: [0, 0, 0], axis: [0, 1, 0], angle: -230.226, slide: 0, restChildPose: { pos: [0, 0, 0], rot: [0, 0, 0] } },
      { id: 'J2', name: '關節2', type: 'revolute', parent: 'P', child: 'B', anchor: [40, 0, 0], axis: [0, 1, 0], angle: 45, slide: 0, restChildPose: { pos: [40, 0, 0], rot: [0, 0, 0] } },
    ],
    undoStack: [], redoStack: [],
  })
  g().homeJoint('J1')
  assert.equal(g().joints.find((j) => j.id === 'J1').angle, 0)
  assert.equal(g().joints.find((j) => j.id === 'J2').angle, 45)
})

test('homeJoint slider → slide rest 0', () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  useApp.setState({
    components: [box('P'), box('S', [0, 10, 0])],
    joints: [{
      id: 'J1', name: '關節1', type: 'slider', parent: 'P', child: 'S',
      anchor: [0, 10, 0], axis: [0, 1, 0], angle: 0, slide: -66.37,
      restChildPose: { pos: [0, 10, 0], rot: [0, 0, 0] },
    }],
    undoStack: [], redoStack: [],
  })
  g().homeJoint('J1')
  assert.equal(g().joints[0].slide, 0)
})

test('homeJoints honours non-zero rest', () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  useApp.setState({
    components: [box('P'), box('S')],
    joints: [{
      id: 'J1', name: '關節1', type: 'revolute', parent: 'P', child: 'S',
      anchor: [0, 0, 0], axis: [0, 1, 0], angle: 90, slide: 0, rest: 12,
    }],
    undoStack: [], redoStack: [],
  })
  g().homeJoints()
  assert.equal(g().joints[0].angle, 12)
})
