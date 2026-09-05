import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { computeFK, simulateMotion } from '../src/assembly/kinematics.ts'

test('Motion Study creates synchronized trajectories for multi-DOF joints', () => {
  const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  const panel = readFileSync(new URL('../src/components/JointsPanel.tsx', import.meta.url), 'utf8')
  assert.match(store, /j\.type === 'ball'/)
  assert.match(store, /j\.type === 'planar'/)
  assert.match(store, /j\.type === 'pinslot'/)
  assert.match(store, /keys: dofs\.map/)
  assert.match(panel, /Object\.entries\(qs\)/)
})

test('multi-DOF study uses the same coordinate axes as FK and does not inject primary input into secondary axes', () => {
  const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  // Ball's FK Euler channels are world Z/Y/X, not the joint-axis basis.
  assert.match(store, /axis: \[0, 0, 1\], value: j\.angle/)
  assert.match(store, /axis: \[0, 1, 0\], value: j\.angle2/)
  assert.match(store, /axis: \[1, 0, 0\], value: j\.angle3/)
  // Planar and pin-slot must use the exact FK basis/explicit slot axis.
  assert.match(store, /axis: fkU\.toArray\(\)/)
  assert.match(store, /axis: fkV\.toArray\(\)/)
  assert.match(store, /axis: pinSlotU\.toArray\(\)/)
  // The one dialog input belongs to the primary DOF only; zero is a valid
  // secondary coordinate and must not be replaced by the primary initial value.
  assert.match(store, /const initial = index === 0 \? \(d\.value \|\| spec\.q0v\) : d\.value/)
})

test('cylindrical Motion Study drives rotation while retaining axial slide in FK', () => {
  const motion = simulateMotion({
    kind: 'revolute', mass: 0.5, axis: [0, 0, 1], anchor: [0, 0, 0], com: [20, 0, 0],
    k: 0, c: 0, q0: 0, q0v: 30, dt: 0.01, tEnd: 0.04, sample: 1,
  })
  assert.equal(motion.key, 'angle', 'cylindrical study uses the rotational generalized coordinate')
  assert.ok(motion.q.some((q) => Math.abs(q - motion.q[0]) > 1e-5), 'motion produces a non-static angular trajectory')
  const angle = motion.q.at(-1)
  const joint = { id: 'J', name: 'cyl', type: 'cylindrical', parent: 'root', child: 'part', anchor: [0, 0, 0], axis: [0, 0, 1], angle, slide: 12 }
  const posed = computeFK(['root', 'part'], [joint]).get('part')
  assert.ok(Math.abs(posed.elements[14] - 12) < 1e-8, 'axial slide stays fixed during angular replay')
  assert.ok(Math.abs(posed.elements[1]) > 1e-6 || Math.abs(posed.elements[4]) > 1e-6, 'the child receives the simulated angular rotation')
})
