import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSTL, meshesToBinarySTL } from '../src/io/stl.ts'
import { parseOBJ } from '../src/io/obj.ts'

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

function binaryStl(triangles) {
  const buf = new ArrayBuffer(84 + triangles * 50)
  const dv = new DataView(buf)
  dv.setUint32(80, triangles, true)
  let off = 84
  for (let i = 0; i < triangles; i++) {
    dv.setFloat32(off + 8, 1, true); off += 12
    const x = i % 250
    for (const p of [[x, 0, 0], [x + 1, 0, 0], [x, 1, 0]]) {
      dv.setFloat32(off, p[0], true); dv.setFloat32(off + 4, p[1], true); dv.setFloat32(off + 8, p[2], true); off += 12
    }
    off += 2
  }
  return buf
}

test('malformed mesh numbers cannot survive an import/export cycle', () => {
  const bad = binaryStl(2)
  new DataView(bad).setFloat32(96, Number.NaN, true) // first vertex x
  const mesh = parseSTL(bad)
  assert.equal(mesh.triangles.length, 3)
  assert.ok(mesh.vertices.every(Number.isFinite))
  assert.ok(mesh.normals.every(Number.isFinite))

  const obj = parseOBJ('v Infinity 0 0\nv NaN 1 0\nv 0 0 1\nf 1 2 3\n')
  assert.ok(obj.vertices.every(Number.isFinite))
  const out = meshesToBinarySTL([{ mesh: obj, matrix: identity }])
  assert.ok(parseSTL(out).vertices.every(Number.isFinite))
})

test('binary STL export drops corrupt faces and keeps its declared face count truthful', () => {
  const mesh = {
    vertices: [0, 0, 0, 10, 0, 0, 0, 10, 0, Number.NaN, 0, 0],
    normals: [],
    // first face is valid; the second references a NaN vertex and the third is out of range
    triangles: [0, 1, 2, 0, 2, 3, 0, 1, 99],
  }
  const out = meshesToBinarySTL([{ mesh, matrix: identity }])
  assert.equal(new DataView(out).getUint32(80, true), 1)
  const reread = parseSTL(out)
  assert.equal(reread.triangles.length, 3)
  assert.ok(reread.vertices.every(Number.isFinite))
})

test('large mesh parse/export soak does not retain prior cycles', () => {
  // 100k facets is a meaningful repeated allocation workload without making the
  // normal test suite depend on a multi-hundred-MB fixture. Each cycle parses
  // roughly 5 MB binary input into JS mesh arrays and exports it again.
  const source = binaryStl(100_000)
  let last = null
  for (let cycle = 0; cycle < 8; cycle++) {
    const mesh = parseSTL(source.slice(0))
    assert.equal(mesh.triangles.length, 300_000)
    assert.ok(mesh.vertices.every(Number.isFinite))
    last = meshesToBinarySTL([{ mesh, matrix: identity }])
    assert.equal(new DataView(last).getUint32(80, true), 100_000)
  }
  assert.equal(last.byteLength, 84 + 100_000 * 50)
})
