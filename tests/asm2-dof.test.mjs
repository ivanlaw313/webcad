// ASM2 P2：剛性 J3 之後標題「自由度 0」但 J1 照轉 —— 自由度要同實際驅動一致。
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
import test from 'node:test'
import assert from 'node:assert/strict'
const { mechanismDOF } = await import('../src/assembly/linkage.ts')
const { computeFK } = await import('../src/assembly/kinematics.ts')
const J = (id, type, parent, child, extra = {}) => ({ id, name: id, type, parent, child, anchor: [0, 0, 0], axis: [0, 1, 0], angle: 0, slide: 0, ...extra })
const ids = ['P', 'S', 'C']

test('J1 revolute + J2 slider + rigid J3 on the slider pair (old: 0) → 1, and J1 really still moves under FK', () => {
  const js = [J('J1', 'revolute', 'P', 'S'), J('J2', 'slider', 'S', 'C', { axis: [1, 0, 0] }), J('J3', 'rigid', 'S', 'C')]
  // old formula: 1+1+0 − 3×(2-part S–C "loop") = 0 → shown as 自由度 0
  const r = mechanismDOF(ids, js)
  assert.equal(r.dof, 1)   // J2 overwritten by J3 for child C (FK uses the last joint per child) → only J1 drives
  assert.ok(r.effective.has('J1') && r.effective.has('J3') && !r.effective.has('J2'))
  const m0 = computeFK(ids, js).get('S').elements.join(), m1 = computeFK(ids, [{ ...js[0], angle: 30 }, js[1], js[2]]).get('S').elements.join()
  assert.notEqual(m0, m1)   // J1 still rotates S
})

test('rigid J3 between the revolute pair in reverse (S→P) keeps DOF 1; same-pair revolute + slider = what FK drives', () => {
  assert.equal(mechanismDOF(ids, [J('J1', 'revolute', 'P', 'S'), J('J3', 'rigid', 'S', 'P')], (id) => id === 'P').dof, 1)
  assert.equal(mechanismDOF(ids, [J('J1', 'revolute', 'P', 'S'), J('J2', 'slider', 'P', 'S')]).dof, 1)
  assert.equal(mechanismDOF(ids, [J('J1', 'revolute', 'P', 'S'), J('J3', 'rigid', 'P', 'S')]).dof, 0)   // FK: rigid J3 wins → really fixed
})

test('grounded child contributes 0; true ≥3-part planar loop keeps Grübler (four-bar = 1)', () => {
  assert.equal(mechanismDOF(ids, [J('J1', 'revolute', 'P', 'S')], (id) => id === 'S').dof, 0)
  const four = ['G', 'A', 'B', 'C']
  const js = [J('a', 'revolute', 'G', 'A'), J('b', 'revolute', 'A', 'B'), J('c', 'revolute', 'B', 'C'), J('d', 'revolute', 'C', 'G')]
  assert.equal(mechanismDOF(four, js).dof, 1)
})
