import test from 'node:test'
import assert from 'node:assert/strict'
import { meshToAsciiSTL, parseSTL } from '../src/io/stl.ts'
import { parseOBJ } from '../src/io/obj.ts'

const enc = (s) => new TextEncoder().encode(s).buffer

test('ASCII STL skips malformed facets and remains stable under repeated imports', () => {
  const source = `solid damaged\nfacet normal NaN 0 1\n outer loop\n  vertex 0 0 0\n  vertex Infinity 0 0\n  vertex 0 1 0\n endloop\nendfacet\nfacet normal 0 0 1\n outer loop\n  vertex 0 0 0\n  vertex 1 0 0\n  vertex 0 1 0\n endloop\nendfacet\nendsolid damaged\n`
  for (let i = 0; i < 100; i++) {
    const mesh = parseSTL(enc(source))
    assert.deepEqual(mesh.triangles, [0, 1, 2])
    assert.ok(mesh.vertices.every(Number.isFinite))
    assert.ok(mesh.normals.every(Number.isFinite))
  }
})

test('STL export/import preserves a finite mesh during repeated round trips', () => {
  let mesh = { vertices: [0, 0, 0, 10, 0, 0, 0, 10, 0], normals: [0, 0, 1, 0, 0, 1, 0, 0, 1], triangles: [0, 1, 2] }
  for (let i = 0; i < 100; i++) {
    mesh = parseSTL(enc(meshToAsciiSTL(mesh, 'roundtrip')))
    assert.equal(mesh.triangles.length, 3)
    assert.ok(mesh.vertices.every(Number.isFinite))
  }
})

test('OBJ parser remains finite for ordinary valid input and negative indices', () => {
  const mesh = parseOBJ('v 0 0 0\nv 10 0 0\nv 0 10 0\nf -3 -2 -1\n')
  assert.deepEqual(mesh.triangles, [0, 1, 2])
  assert.ok(mesh.vertices.every(Number.isFinite))
  assert.ok(mesh.normals.every(Number.isFinite))
})

test('OBJ drops faces referencing malformed vertices without renumbering later vertices', () => {
  const mesh = parseOBJ('v 0 0 0\nv nope 0\nv 10 0 0\nv 0 10 0\nf 1 2 3\nf 1 3 4\n')
  assert.equal(mesh.vertices.length, 12)
  assert.deepEqual(mesh.triangles, [0, 2, 3])
  assert.ok(mesh.vertices.every(Number.isFinite))
})
