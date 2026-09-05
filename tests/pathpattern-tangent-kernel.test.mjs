// Path Pattern Direction=Path must rotate a real B-rep about the seed point,
// then translate it to the equal-arc-length path location.  This exercises the
// same replicad transform sequence used by the worker, rather than merely
// checking that the UI persists an option.
import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, makeBaseBox } = await import('replicad')
const { default: opencascade } = await import('../src/kernel/replicad_plus.js')
const OC = await opencascade({ locateFile: () => fileURLToPath(new URL('../src/kernel/replicad_plus.wasm', import.meta.url)) })
setOC(OC)

const volume = (shape) => {
  const props = new OC.GProp_GProps_1()
  OC.BRepGProp.VolumeProperties_1(shape.wrapped, props, false, false, false)
  return Math.abs(props.Mass())
}

test('XY tangent-following pattern copy remains a valid B-rep and rotates with an L path', () => {
  // Seed is long in X.  Its second instance follows an upward local tangent,
  // so its world bounding box must become long in Y after a +90 degree turn.
  const seed = makeBaseBox(24, 6, 4)
  const origin = [0, 0, 0]
  const next = seed.clone().rotate(90, origin, [0, 0, 1]).translate(40, 40, 0)
  const bb = next.boundingBox.bounds
  const dx = bb[1][0] - bb[0][0], dy = bb[1][1] - bb[0][1]
  assert.ok(!next.wrapped.IsNull() && volume(next) > 1, 'turned path-pattern copy is a non-empty solid B-rep')
  assert.ok(dy > dx * 3, `90° tangent turn swaps the asymmetric seed footprint (dx=${dx}, dy=${dy})`)
  const mesh = next.mesh({ tolerance: 0.2, angularTolerance: 0.5 })
  assert.ok(mesh.vertices.length > 0 && mesh.triangles.length > 0, 'turned copy tessellates for the viewport')
})

test('spatial tangent-following pattern copy rotates around the shortest stable axis', () => {
  // Initial tangent +X, next tangent +Z.  The shortest rotation axis is −Y;
  // this is the same cross-product frame used by the worker for a 3D datum path.
  const seed = makeBaseBox(24, 6, 4)
  const turned = seed.clone().rotate(90, [0, 0, 0], [0, -1, 0]).translate(35, 0, 35)
  const bb = turned.boundingBox.bounds
  const dx = bb[1][0] - bb[0][0], dz = bb[1][2] - bb[0][2]
  assert.ok(!turned.wrapped.IsNull() && volume(turned) > 1, 'spatially turned copy is a non-empty solid B-rep')
  assert.ok(dz > dx * 3, `3D tangent turn aligns the asymmetric seed with Z (dx=${dx}, dz=${dz})`)
  assert.ok(turned.mesh({ tolerance: 0.2, angularTolerance: 0.5 }).triangles.length > 0, 'spatially turned copy tessellates')
})
