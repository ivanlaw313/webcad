import assert from 'node:assert/strict'
import test from 'node:test'
import { offsetOpenPath } from '../src/sketch/sketchOps.ts'

test('open line/arc path offsets analytically and preserves its two segments', () => {
  const r = offsetOpenPath([[0, 0], [10, 0], [10, 10]], [0, 0.41421356237309503], 1)
  assert.equal(r.verts.length, 3)
  assert.equal(r.bulges.length, 2)
  assert.ok(Math.abs(r.verts[0][1] - 1) < 1e-9, 'first endpoint follows the line left normal')
  assert.equal(r.bulges[0], 0, 'line remains a line')
  assert.ok(r.bulges[1] > 0, 'arc remains an analytic arc')
})

test('open arc offset rejects a collapsed radius', () => {
  assert.throws(() => offsetOpenPath([[0, 0], [10, 0]], [0.41421356237309503], -20))
})
