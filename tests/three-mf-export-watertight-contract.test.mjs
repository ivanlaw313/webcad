import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { repairMesh } from '../src/geom/meshRepair.ts'
import { meshManifold } from '../src/geom/meshCheck.ts'

test('3MF export compacts face-split B-rep vertices into slicer topology', () => {
  // A box represented as six independently tessellated faces mirrors an OCCT
  // display mesh: geometrically closed, but no index is shared across faces.
  const faces = [
    [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], [[0, 0, 1], [0, 1, 1], [1, 1, 1], [1, 0, 1]],
    [[0, 0, 0], [0, 0, 1], [1, 0, 1], [1, 0, 0]], [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]],
    [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]], [[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]],
  ]
  const vertices = [], triangles = []
  for (const face of faces) {
    const base = vertices.length / 3
    for (const p of face) vertices.push(...p)
    triangles.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  // Unlike WebCAD's geometric checker, a 3MF slicer first sees the literal
  // index topology.  Each duplicated face edge is therefore open.
  const rawEdges = new Map()
  for (let i = 0; i < triangles.length; i += 3) for (const [a, b] of [[triangles[i], triangles[i + 1]], [triangles[i + 1], triangles[i + 2]], [triangles[i + 2], triangles[i]]]) {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`
    rawEdges.set(key, (rawEdges.get(key) || 0) + 1)
  }
  assert.equal([...rawEdges.values()].filter((n) => n === 1).length, 24, 'unwelded face copies have 24 literal open edges')
  const printable = repairMesh(vertices, triangles)
  assert.equal(printable.vertices.length / 3, 8)
  assert.equal(printable.triangles.length / 3, 12)
  assert.equal(meshManifold(printable.vertices, printable.triangles).closed, true)
})

test('OBJ and 3MF exporters weld only their emitted objects', () => {
  const source = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  assert.match(source, /const printable = repairMesh\(m\.vertices, m\.triangles\)/)
  assert.match(source, /const printable = repairMesh\(transformed, t\)/)
  assert.match(source, /exportObj:[\s\S]*?const printable = repairMesh\(m\.vertices, m\.triangles\)/)
  assert.match(source, /exportAssemblyObj:[\s\S]*?const printable = repairMesh\(transformed, t\)/)
  assert.match(source, /const printableParts: MeshData\[\] = \[\]/)
})
