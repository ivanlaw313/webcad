import assert from 'node:assert/strict'
import test from 'node:test'
import { closestPolylinePair } from '../src/cad/edgeDistance.ts'

test('closest polyline pair uses interior points, not midpoints', () => {
  const r = closestPolylinePair([[0, 0, 0], [10, 0, 0]], [[3, -5, 4], [3, 5, 4]])
  assert.ok(r)
  assert.ok(Math.abs(r.distance - 4) < 1e-9)
  assert.deepEqual(r.a, [3, 0, 0])
  assert.deepEqual(r.b, [3, 0, 4])
})
