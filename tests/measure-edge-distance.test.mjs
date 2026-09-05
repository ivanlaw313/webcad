import assert from 'node:assert/strict'
import test from 'node:test'
import { combineMeasure } from '../src/cad/measureCombine.ts'

test('Measure uses sampled true edges for minimum distance', () => {
  const r = combineMeasure([
    { kind: 'edge', mid: [5, 0, 0], pts: [[0, 0, 0], [10, 0, 0]] },
    { kind: 'edge', mid: [3, 0, 4], pts: [[3, -5, 4], [3, 5, 4]] },
  ])
  assert.equal(r.type, 'distance')
  assert.equal(r.label, '最短距离')
  assert.ok(Math.abs(r.value - 4) < 1e-9)
  assert.ok(!/近似/.test(r.note || ''))
})
