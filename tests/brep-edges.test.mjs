import test from 'node:test'
import assert from 'node:assert/strict'
import { brepEdgePositions } from '../src/cad/brepEdges.ts'

test('B-rep edge extraction hides triangulation diagonals within one face', () => {
  const p = brepEdgePositions({
    vertices: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
    triangles: [0, 1, 2, 0, 2, 3],
    faceGroups: [{ start: 0, count: 6, faceId: 10 }],
  })
  assert.equal(p?.length, 24) // four perimeter segments, no 0→2 diagonal
})

test('B-rep edge extraction retains the boundary between source faces', () => {
  const p = brepEdgePositions({
    vertices: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
    triangles: [0, 1, 2, 0, 2, 3],
    faceGroups: [{ start: 0, count: 3, faceId: 10 }, { start: 3, count: 3, faceId: 20 }],
  })
  assert.equal(p?.length, 30) // perimeter plus the shared 0→2 B-rep seam
})

test('B-rep edge extraction does not trust a colliding display face hash', () => {
  const p = brepEdgePositions({
    vertices: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
    triangles: [0, 1, 2, 0, 2, 3],
    faceGroups: [{ start: 0, count: 3, faceId: 7 }, { start: 3, count: 3, faceId: 7 }],
  })
  assert.equal(p?.length, 30)
})
