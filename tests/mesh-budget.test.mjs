import test from 'node:test'
import assert from 'node:assert/strict'
import { binaryStlTriangleCount, meshImportRisk, textMeshImportRisk, LARGE_MESH_TRIANGLES } from '../src/io/meshBudget.ts'

function binaryStl(n) { const b = new ArrayBuffer(84 + n * 50); new DataView(b).setUint32(80, n, true); return b }

test('binary STL triangle estimate only trusts a count that fits the buffer', () => {
  assert.equal(binaryStlTriangleCount(binaryStl(2)), 2)
  const bad = new ArrayBuffer(84); new DataView(bad).setUint32(80, 9, true)
  assert.equal(binaryStlTriangleCount(bad), null)
})

test('large mesh imports require an explicit confirmation before synchronous parsing', () => {
  const risk = meshImportRisk(binaryStl(LARGE_MESH_TRIANGLES))
  assert.equal(risk.requiresConfirm, true)
  assert.equal(risk.triangles, LARGE_MESH_TRIANGLES)
})

test('large OBJ text has a conservative UTF-16 memory budget before tokenization', () => {
  const risk = textMeshImportRisk('v 0 0 0\n'.repeat(8), 64)
  assert.equal(risk.requiresConfirm, true)
})
