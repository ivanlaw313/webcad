// Cross-workflow B-rep regression: the SOLID workflows must remain editable
// solids after Loft/Sweep and accept a downstream modify + Boolean + STEP path.
import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, draw, makeCylinder, importSTEP } = await import('replicad')
const { default: opencascade } = await import('../src/kernel/replicad_plus.js')
const { frameTwistTaperSweep } = await import('../src/cad/sweepTwist.ts')
const OC = await opencascade({ locateFile: () => fileURLToPath(new URL('../src/kernel/replicad_plus.wasm', import.meta.url)) })
setOC(OC)

const volume = (shape) => {
  const props = new OC.GProp_GProps_1()
  OC.BRepGProp.VolumeProperties_1(shape.wrapped, props, false, false, false)
  return Math.abs(props.Mass())
}
const solid = (shape) => Number.isFinite(volume(shape)) && volume(shape) > 1e-3 && !shape.wrapped.IsNull()
const rectangle = (z) => draw().movePointerTo([-20, -15]).lineTo([20, -15]).lineTo([20, 15]).lineTo([-20, 15]).close().sketchOnPlane('XY', z)

test('constant-section Loft supports Fillet, Boolean, mesh, and STEP round-trip', async () => {
  const lofted = rectangle(0).loftWith(rectangle(45), { ruled: true })
  assert.ok(solid(lofted), 'Loft is a valid B-rep solid')

  const filleted = lofted.fillet(2, (edge) => edge.inDirection('Z'))
  assert.ok(solid(filleted), 'Loft supports a vertical-edge Fillet')

  const drilled = filleted.cut(makeCylinder(4, 70).translate([0, 0, -10]))
  assert.ok(solid(drilled), 'modified Loft supports a downstream Boolean cut')
  assert.ok(volume(drilled) < volume(filleted), 'Boolean removes material from Loft')
  const mesh = drilled.mesh({ tolerance: 0.2, angularTolerance: 0.5 })
  assert.ok(mesh.vertices.length > 0 && mesh.triangles.length > 0, 'modified Loft tessellates for the viewport')

  const step = await drilled.blobSTEP()
  const roundTrip = await importSTEP(step)
  assert.ok(solid(roundTrip), 'modified Loft STEP re-imports as B-rep')
  assert.ok(Math.abs(volume(roundTrip) - volume(drilled)) <= Math.max(1e-3, volume(drilled) * 1e-5), 'Loft STEP round-trip preserves volume')
})

test('twisted Sweep supports Boolean, mesh, and STEP round-trip', async () => {
  const makeSpine = () => {
    const edge = new OC.BRepBuilderAPI_MakeEdge_3(new OC.gp_Pnt_3(0, 0, 0), new OC.gp_Pnt_3(0, 0, 60)).Edge()
    const wire = new OC.BRepBuilderAPI_MakeWire_1()
    wire.Add_1(edge)
    return wire.Wire()
  }
  const profile = (plane) => draw([12, 8]).lineTo([-12, 8]).lineTo([-12, -8]).lineTo([12, -8]).close().sketchOnPlane(plane).wire
  const swept = frameTwistTaperSweep(OC, makeSpine(), profile, { twistDeg: 45 })
  assert.ok(solid(swept), 'twisted Sweep is a valid B-rep solid')

  const cut = swept.cut(makeCylinder(3, 80).translate([0, 0, -10]))
  assert.ok(solid(cut), 'twisted Sweep supports a downstream Boolean cut')
  assert.ok(volume(cut) < volume(swept), 'Boolean removes material from Sweep')
  const mesh = cut.mesh({ tolerance: 0.2, angularTolerance: 0.5 })
  assert.ok(mesh.vertices.length > 0 && mesh.triangles.length > 0, 'modified Sweep tessellates for the viewport')

  const step = await cut.blobSTEP()
  const roundTrip = await importSTEP(step)
  assert.ok(solid(roundTrip), 'modified Sweep STEP re-imports as B-rep')
  assert.ok(Math.abs(volume(roundTrip) - volume(cut)) <= Math.max(1e-3, volume(cut) * 1e-5), 'Sweep STEP round-trip preserves volume')
})
