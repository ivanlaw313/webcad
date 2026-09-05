// Kernel-level regression for the generic Feature Pattern strategy used by the worker:
// copy the B-rep delta between the predecessor and a selected feature, rather than
// rebuilding a display mesh or special-casing Extrude.
import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, draw, makeBaseBox } = await import('replicad')
const { default: opencascade } = await import('../src/kernel/replicad_plus.js')
const OC = await opencascade({ locateFile: () => fileURLToPath(new URL('../src/kernel/replicad_plus.wasm', import.meta.url)) })
setOC(OC)

const volume = (shape) => {
  const props = new OC.GProp_GProps_1()
  OC.BRepGProp.VolumeProperties_1(shape.wrapped, props, false, false, false)
  return Math.abs(props.Mass())
}
const validSolid = (shape) => Number.isFinite(volume(shape)) && volume(shape) > 1e-3 && !shape.wrapped.IsNull()

const base = () => makeBaseBox(100, 100, 20).translate([-50, -50, -20])
const patterned = (seed, feature, offset) => {
  const after = seed.clone().fuse(feature)
  const delta = after.clone().cut(seed.clone())
  const result = after.clone().fuse(delta.clone().translate(...offset))
  return { after, delta, result }
}

test('Feature Pattern copies an actual Revolve B-rep delta', () => {
  // Same analytic Revolve path used for a SOLID profile, positioned on the base top face.
  const revolved = draw([12, 0]).lineTo([22, 0]).lineTo([22, 18]).lineTo([12, 18]).close().sketchOnPlane('XY').revolve([0, 1, 0])
  const { after, delta, result } = patterned(base(), revolved, [36, 0, 0])
  assert.ok(validSolid(after) && validSolid(delta) && validSolid(result), 'revolve, extracted delta, and patterned result remain valid B-reps')
  assert.ok(volume(delta) > 1, 'selected Revolve contributes real material')
  assert.ok(volume(result) > volume(after) + volume(delta) * 0.45, 'translated Revolve delta adds a second B-rep instance')
})

test('Feature Pattern copies an actual Loft B-rep delta', () => {
  const rectangle = (z) => draw().movePointerTo([-20, -15]).lineTo([20, -15]).lineTo([20, 15]).lineTo([-20, 15]).close().sketchOnPlane('XY', z)
  const lofted = rectangle(0).loftWith(rectangle(38), { ruled: true })
  const { after, delta, result } = patterned(base(), lofted, [48, 0, 0])
  assert.ok(validSolid(after) && validSolid(delta) && validSolid(result), 'loft, extracted delta, and patterned result remain valid B-reps')
  assert.ok(volume(delta) > 1, 'selected Loft contributes real material')
  assert.ok(volume(result) > volume(after) + volume(delta) * 0.45, 'translated Loft delta adds a second B-rep instance')
})
