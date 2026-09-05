import test from 'node:test'
import assert from 'node:assert/strict'
import { shapesToDxfEntities } from '../src/io/dxfExport.ts'
import { parseDxfToProfiles } from '../src/io/dxfImport.ts'

test('DXF export/import preserves common closed sketch profiles', () => {
  const text = shapesToDxfEntities([
    { type: 'rect', a: [-20, -10], b: [20, 10] },
    { type: 'circle', c: [5, -3], r: 2.5 },
    { type: 'poly', verts: [[30, 0], [40, 0], [40, 10], [30, 10]], bulges: [0, 0, 0, 0] },
  ])
  assert.match(text, /\$INSUNITS\n70\n4/)
  assert.match(text, /LWPOLYLINE/)
  assert.match(text, /CIRCLE/)
  const imported = parseDxfToProfiles(text)
  assert.equal(imported.profiles.length, 3)
  const circle = imported.profiles.find((p) => p.kind === 'circle')
  assert.ok(circle && Math.abs(circle.r - 2.5) < 1e-6)
  assert.ok(imported.profiles.filter((p) => p.kind === 'poly').every((p) => p.pts.length >= 4))
})

test('DXF round-trip keeps bulge arcs as a tessellated closed profile', () => {
  const text = shapesToDxfEntities([
    { type: 'poly', verts: [[0, 0], [20, 0], [20, 20], [0, 20]], bulges: [1, 0, 0, 0] },
  ])
  const imported = parseDxfToProfiles(text)
  assert.equal(imported.profiles.length, 1)
  assert.equal(imported.profiles[0].kind, 'poly')
  assert.ok(imported.profiles[0].pts.length > 4)
})
