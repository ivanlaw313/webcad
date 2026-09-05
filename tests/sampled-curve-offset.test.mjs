import assert from 'node:assert/strict'
import { offsetSampledCurve } from '../src/sketch/sketchOps.ts'

const near = (a, b, e = 1e-6) => Math.abs(a - b) < e

const ellipse = Array.from({ length: 64 }, (_, i) => {
  const t = i * 2 * Math.PI / 64
  return [10 * Math.cos(t), 5 * Math.sin(t)]
})
const outer = offsetSampledCurve(ellipse, 2, true)
assert.ok(outer)
assert.ok(near(outer[0][0], 12, 0.02), 'ellipse right extreme grows outward')
assert.ok(near(outer[16][1], 7, 0.02), 'ellipse top extreme grows outward')
const inner = offsetSampledCurve(ellipse, -1, true)
assert.ok(inner)
assert.ok(near(inner[0][0], 9, 0.02), 'ellipse right extreme shrinks inward')

// Open fitted curves use the same left-of-travel convention as line/arc Offset.
const open = offsetSampledCurve([[0, 0], [5, 0], [10, 0]], 3, false)
assert.deepEqual(open, [[0, 3], [5, 3], [10, 3]])

// A CCW ellipse arc is an open curve: it offsets only along the arc normal,
// never along the chord that would close the profile for a solid operation.
const quarterArc = Array.from({ length: 33 }, (_, i) => {
  const t = i * Math.PI / 2 / 32
  return [10 * Math.cos(t), 5 * Math.sin(t)]
})
const arcOffset = offsetSampledCurve(quarterArc, 2, false)
assert.ok(arcOffset)
assert.ok(near(arcOffset[0][0], 8, 0.03), 'ellipse arc start offsets along its tangent normal')
assert.ok(near(arcOffset.at(-1)[1], 3, 0.03), 'ellipse arc end offsets along its tangent normal')
assert.equal(offsetSampledCurve([[0, 0]], 1, false), null)
