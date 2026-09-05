// SOLID cross-workflow kernel regression: a normal manufacturing sequence must
// remain a valid B-rep throughout and survive a STEP round-trip.
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, makeBaseBox, makeCylinder, importSTEP } = await import('replicad')
const { default: opencascade } = await import('../src/kernel/replicad_plus.js')
const OC = await opencascade({ locateFile: () => fileURLToPath(new URL('../src/kernel/replicad_plus.wasm', import.meta.url)) })
setOC(OC)

let failed = 0
const ok = (condition, message) => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${message}`)
  if (!condition) failed++
}
const volume = (shape) => {
  const props = new OC.GProp_GProps_1()
  OC.BRepGProp.VolumeProperties_1(shape.wrapped, props, false, false, false)
  return Math.abs(props.Mass())
}
const validSolid = (shape) => {
  const v = volume(shape)
  return Number.isFinite(v) && v > 1e-3 && !shape.wrapped.IsNull()
}

// Fusion-style sequence: prism/extrude -> edge fillet -> shell (top opening)
// -> cylindrical cut -> STEP export/import.  Each operation uses B-rep topology;
// this is deliberately not a mesh-only smoke test.
const base = makeBaseBox(50, 40, 30)
const filleted = base.fillet(3, (edge) => edge.inDirection('Z'))
ok(validSolid(filleted), 'extrude followed by vertical-edge fillet is a valid solid')

const topZ = filleted.boundingBox.bounds[1][2]
const shelled = filleted.shell(2, (face) => face.inPlane('XY', topZ))
ok(validSolid(shelled), 'filleted body can be shelled through its top face')
ok(volume(shelled) < volume(filleted), 'shell reduces material volume')

const cutter = makeCylinder(4, 50).translate([25, 20, -10])
const drilled = shelled.cut(cutter)
ok(validSolid(drilled), 'shelled body accepts a downstream cylindrical Boolean cut')
ok(volume(drilled) < volume(shelled), 'Boolean cut reduces material volume')
const mesh = drilled.mesh({ tolerance: 0.2, angularTolerance: 0.5 })
ok(mesh?.vertices?.length > 0 && mesh?.triangles?.length > 0, 'downstream B-rep tessellates into a visible viewport mesh')

const step = await drilled.blobSTEP()
ok(step.size > 1000, 'downstream B-rep exports a non-empty STEP payload')
const roundTripped = await importSTEP(step)
ok(validSolid(roundTripped), 'exported STEP re-imports as a valid B-rep solid')
const delta = Math.abs(volume(roundTripped) - volume(drilled))
ok(delta <= Math.max(1e-3, volume(drilled) * 1e-5), `STEP round-trip preserves volume (delta ${delta.toFixed(6)} mm3)`)

if (failed) process.exitCode = 1
