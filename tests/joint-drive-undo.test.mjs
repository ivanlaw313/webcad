// Joint drag / joint-slider changes = ONE undo step per completed gesture (Fusion-like):
// Ctrl+Z restores the previous joint value, Ctrl+Y re-applies it; continuous ticks never flood the stack.
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
await import('../src/worker/cad.worker.ts'); await globalThis.__wheelWorker.ready()
const { useApp } = await import('../src/store.ts')
const g = () => useApp.getState()
const mesh = () => ({ vertices: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0]), indices: new Uint32Array([0, 1, 2]), normals: new Float32Array(9) })
const comp = (id) => ({ id, name: id, mesh: mesh(), pos: [0, 0, 0], rot: [0, 0, 0], color: '#888' })
const rev = { id: 'J1', name: '關節1', type: 'revolute', parent: 'P', child: 'S', anchor: [0, 0, 0], axis: [0, 1, 0], angle: 0, slide: 0 }
const sld = { id: 'J2', name: '關節2', type: 'slider', parent: 'S', child: 'T', anchor: [0, 0, 0], axis: [1, 0, 0], angle: 0, slide: 0 }
const reset = () => useApp.setState({ components: [comp('P'), comp('S'), comp('T')], joints: [{ ...rev }, { ...sld }], undoStack: [], redoStack: [], contactSets: false, contactPairs: [], mode: 'model', grounded: null })
const ang = () => g().joints.find((j) => j.id === 'J1').angle
const sl = () => g().joints.find((j) => j.id === 'J2').slide

test('one slider gesture (many ticks) = one undo step; Ctrl+Z restores, Ctrl+Y re-applies', async () => {
  reset()
  g().beginJointDrive()
  for (let a = 1; a <= 40; a++) g().setJointValue('J1', { angle: a })
  assert.equal(g().undoStack.length, 0, 'no snapshot per tick')
  assert.equal(g().endJointDrive(), true)
  assert.equal(g().undoStack.length, 1, 'exactly one step for the gesture')
  assert.equal(ang(), 40)
  await g().undo(); assert.equal(ang(), 0, 'undo → previous joint value')
  await g().redo(); assert.equal(ang(), 40, 'redo → re-applied')
  await g().undo(); assert.equal(ang(), 0)
})

test('two gestures = two steps, undone in order; slider joint too', async () => {
  reset()
  g().beginJointDrive(); g().setJointValue('J1', { angle: 15 }); g().setJointValue('J1', { angle: 30 }); g().endJointDrive()
  g().beginJointDrive(); g().setJointValue('J2', { slide: 4 }); g().setJointValue('J2', { slide: 12.5 }); g().endJointDrive()
  assert.equal(g().undoStack.length, 2)
  await g().undo(); assert.equal(sl(), 0); assert.equal(ang(), 30)
  await g().undo(); assert.equal(ang(), 0)
  await g().redo(); await g().redo(); assert.equal(ang(), 30); assert.equal(sl(), 12.5)
})

test('no-op gesture (click without moving, or back to start) adds no step; end without begin is a no-op; new gesture clears redo', async () => {
  reset()
  g().beginJointDrive(); g().endJointDrive()
  g().beginJointDrive(); g().setJointValue('J1', { angle: 20 }); g().setJointValue('J1', { angle: 0 }); assert.equal(g().endJointDrive(), false)
  assert.equal(g().endJointDrive(), false)
  assert.equal(g().undoStack.length, 0)
  g().beginJointDrive(); g().setJointValue('J1', { angle: 10 }); g().endJointDrive()
  await g().undo(); assert.equal(g().redoStack.length, 1)
  g().beginJointDrive(); g().beginJointDrive(); g().setJointValue('J1', { angle: 5 }); g().endJointDrive()
  assert.equal(g().redoStack.length, 0, 'a new edit drops the redo branch'); assert.equal(g().undoStack.length, 1)
  await g().undo(); assert.equal(ang(), 0, 'nested begin keeps the FIRST pre-gesture snapshot')
})

test('UI wiring: every joint-panel slider and the viewport joint drag bracket the gesture', () => {
  const panel = readFileSync(new URL('../src/components/JointsPanel.tsx', import.meta.url), 'utf8')
  const ranges = panel.match(/<input type="range"[^>]*/g) ?? []
  assert.ok(ranges.length >= 10)
  for (const r of ranges) assert.ok(r.includes('{...JOINT_DRIVE_GESTURE}'), r.slice(0, 80))
  assert.ok(/onPointerDown: beginDrive/.test(panel) && /onPointerUp: endDrive/.test(panel) && /onKeyUp: endDrive/.test(panel))
  assert.ok(/if \(isSliderDriveKey\(e\)\) beginDrive\(\)/.test(panel), 'only slider-moving keys open a gesture (Ctrl+Z on a focused slider must not)')
  assert.ok(panel.includes("!e.ctrlKey && !e.metaKey"))
  const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
  const fn = vp.slice(vp.indexOf('const jointDrag = childJoint'), vp.indexOf('<ComponentGumball', vp.indexOf('const jointDrag = childJoint')))
  assert.ok(fn.includes('st.beginJointDrive()') && fn.includes("if (phase === 'end') useApp.getState().endJointDrive()"))
})
