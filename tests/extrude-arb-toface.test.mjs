import assert from 'node:assert/strict'
import test from 'node:test'

const depthAlongNormal = (origin, normal, target) => {
  const l = Math.hypot(...normal)
  return ((target[0] - origin[0]) * normal[0] + (target[1] - origin[1]) * normal[1] + (target[2] - origin[2]) * normal[2]) / l
}

test('arbitrary-plane To Object measures distance along the sketch normal', () => {
  assert.equal(depthAlongNormal([0, 0, 10], [0, 0, 1], [3, -4, 35]), 25)
  assert.ok(Math.abs(depthAlongNormal([0, 0, 0], [0, 1, 1], [8, 6, 6]) - 6 * Math.SQRT2) < 1e-12)
})

test('arbitrary-plane To Object preserves reverse direction for a cut', () => {
  const d = depthAlongNormal([0, 0, 10], [0, 0, 1], [0, 0, 2])
  assert.equal(d, -8)
  assert.equal((-1 * d) < 0, false, 'cut toward negative sketch normal must not be flipped away from target')
})
