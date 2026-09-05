// STEP B-rep exchange regression: verify repeated export/import retains a
// modifiable solid rather than silently degrading to a display mesh.
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
import fs from 'node:fs'

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
const validSolid = (shape) => Number.isFinite(volume(shape)) && volume(shape) > 1e-3 && !shape.wrapped.IsNull()
const closeVolume = (a, b) => Math.abs(a - b) <= Math.max(1e-3, Math.abs(a) * 1e-5)

// A non-trivial part: rounded outer edges + two through holes.  The second
// round-trip catches implementations that import the first STEP correctly but
// export an already-tessellated display representation afterwards.
const base = makeBaseBox(60, 40, 20).fillet(2, (edge) => edge.inDirection('Z'))
const holes = makeCylinder(4, 30).translate([15, 20, -5]).fuse(makeCylinder(3, 30).translate([45, 20, -5]))
const source = base.cut(holes)
ok(validSolid(source), 'source manufacturing part is a valid B-rep solid')

const firstStep = await source.blobSTEP()
ok(firstStep.size > 1000, 'first STEP payload is non-empty')
const first = await importSTEP(firstStep)
ok(validSolid(first), 'first STEP import is a valid B-rep solid')
ok(closeVolume(volume(source), volume(first)), 'first STEP round-trip preserves volume')

// Prove the imported entity is still editable B-rep topology before exporting
// it again.  A mesh-only import cannot perform this exact Boolean operation.
const edited = first.cut(makeCylinder(2, 30).translate([30, 20, -5]))
ok(validSolid(edited), 'imported STEP accepts a downstream B-rep Boolean')
ok(volume(edited) < volume(first), 'downstream Boolean changes imported STEP material volume')
const secondStep = await edited.blobSTEP()
ok(secondStep.size > 1000, 'edited imported solid exports a second STEP payload')
const second = await importSTEP(secondStep)
ok(validSolid(second), 'second STEP import remains a valid B-rep solid')
ok(closeVolume(volume(edited), volume(second)), 'second STEP round-trip preserves edited volume')

// Worker cache must fingerprint content, not merely payload length.  Otherwise
// replacing an imported snapshot with another same-length STEP replays stale
// geometry under the same timeline feature id.
const worker = fs.readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')
ok(worker.includes('function stepCacheKey') && worker.includes('stepCacheKey(f)'), 'STEP cache fingerprints payload content for every stepbody lookup')
ok(!worker.includes("f.id + ':' + f.step.length"), 'STEP cache no longer aliases same-length replacement snapshots')

if (failed) process.exitCode = 1
