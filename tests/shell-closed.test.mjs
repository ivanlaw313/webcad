// Fusion Shell "Closed body" path: MakeThickSolid with an empty removal-face list.
// Run: node tests/shell-closed.test.mjs
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, draw, cast } = await import('replicad')
const { default: opencascade } = await import('../src/kernel/replicad_plus.js')
const wasmPath = fileURLToPath(new URL('../src/kernel/replicad_plus.wasm', import.meta.url))
const OC = await opencascade({ locateFile: () => wasmPath })
setOC(OC)

const volume = (shape) => {
  const props = new OC.GProp_GProps_1()
  OC.BRepGProp.VolumeProperties_1(shape.wrapped, props, false, false, false)
  return props.Mass()
}
const extents = (shape) => {
  const b = shape.boundingBox.bounds
  return [b[1][0] - b[0][0], b[1][1] - b[0][1], b[1][2] - b[0][2]]
}
const orientOutward = (shape) => volume(shape) < 0 ? cast(shape.wrapped.Reversed()) : shape

const box = draw().movePointerTo([-20, -20]).lineTo([20, -20]).lineTo([20, 20]).lineTo([-20, 20]).close().sketchOnPlane('XY').extrude(40)
const baseVolume = volume(box)
const emptyFaces = (faces) => faces.either([])
const check = (name, closed, expectedExtent) => {
  const closedVolume = volume(closed)
  const closedExtents = extents(closed)
  if (!(closedVolume > 0 && closedVolume < baseVolume * 0.65)) throw new Error(`${name} volume is not hollow: ${closedVolume}`)
  if (!closedExtents.every((d) => Math.abs(d - expectedExtent) < 0.25)) throw new Error(`${name} envelope mismatch: ${closedExtents.join(',')}`)
  console.log(`PASS ${name}: ${(baseVolume / 1000).toFixed(1)} → ${(closedVolume / 1000).toFixed(1)} cm³; bbox ${closedExtents.map((d) => d.toFixed(1)).join('×')}`)
}

const t = 3
const inner = box.shell(t, emptyFaces)
check('closed inside', box.cut(inner), 40)

const outer = orientOutward(box.shell(-t, emptyFaces))
check('closed outside', outer.cut(box), 46)

const outerHalf = orientOutward(box.shell(-t / 2, emptyFaces))
const innerHalf = box.shell(t / 2, emptyFaces)
check('closed both', outerHalf.cut(innerHalf), 43)
