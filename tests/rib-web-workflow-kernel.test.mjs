// SOLID workflow regression for the Rib / Web path.  A real Web is a set of
// thin B-rep walls fused into an existing body; it must stay valid for later
// machining and STEP exchange, not merely draw a UI preview.
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, draw, makeBaseBox, makeCylinder, importSTEP } = await import('replicad')
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

const plate = makeBaseBox(80, 60, 30)
const webAt = (a, b, thickness = 4) => {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const L = Math.hypot(dx, dy)
  const px = -dy / L, py = dx / L, half = thickness / 2
  // Same centreline -> thin rectangle construction used by the worker's Rib/Web
  // feature.  Starting at the top plane and extruding down ensures a true fuse.
  return draw([a[0] + px * half, a[1] + py * half])
    .lineTo([b[0] + px * half, b[1] + py * half])
    .lineTo([b[0] - px * half, b[1] - py * half])
    .lineTo([a[0] - px * half, a[1] - py * half])
    .close().sketchOnPlane('XY', 30).extrude(-30)
}

const firstWeb = webAt([10, 12], [70, 12])
const secondWeb = webAt([20, 45], [65, 22])
const webbed = plate.fuse(firstWeb).fuse(secondWeb)
ok(validSolid(webbed), 'two thin Web centreline walls fuse into a valid B-rep solid')
ok(volume(webbed) > volume(plate), 'Web feature adds material to the base body')

const drilled = webbed.cut(makeCylinder(3, 50).translate([40, 30, -10]))
ok(validSolid(drilled), 'Webbed solid accepts a downstream machining cut')
ok(volume(drilled) < volume(webbed), 'downstream hole cut removes material from Webbed solid')

const step = await drilled.blobSTEP()
ok(step.size > 1000, 'Webbed solid exports a non-empty STEP payload')
const reimported = await importSTEP(step)
ok(validSolid(reimported), 'Webbed STEP payload re-imports as a valid B-rep')
const delta = Math.abs(volume(reimported) - volume(drilled))
ok(delta <= Math.max(1e-3, volume(drilled) * 1e-5), `Webbed STEP round-trip preserves volume (delta ${delta.toFixed(6)} mm3)`)

if (failed) process.exitCode = 1
