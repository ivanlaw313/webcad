// A Revolve must retain the sketch plane that authored its profile.  This is the
// kernel analogue of a user sketching on XZ/YZ origin (or parallel datum) then
// selecting an in-plane construction axis in SOLID > Create > Revolve.
import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
import { readFileSync } from 'node:fs'

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, draw, Plane: RPlane } = await import('replicad')
const { default: opencascade } = await import('../src/kernel/replicad_plus.js')
const OC = await opencascade({ locateFile: () => fileURLToPath(new URL('../src/kernel/replicad_plus.wasm', import.meta.url)) })
setOC(OC)

const volume = (shape) => {
  const props = new OC.GProp_GProps_1()
  OC.BRepGProp.VolumeProperties_1(shape.wrapped, props, false, false, false)
  return Math.abs(props.Mass())
}

test('an XZ sketch profile revolves about an in-plane Z construction axis as a valid B-rep', () => {
  const profile = draw([10, -12]).lineTo([20, -12]).lineTo([20, 12]).lineTo([10, 12]).close().sketchOnPlane('XZ', 8)
  const result = profile.revolve([0, 0, 1])
  assert.ok(!result.wrapped.IsNull() && volume(result) > 1, 'XZ-plane revolve produces a non-empty solid B-rep')
  const mesh = result.mesh({ tolerance: 0.2, angularTolerance: 0.5 })
  assert.ok(mesh.vertices.length > 0 && mesh.triangles.length > 0, 'cardinal-plane Revolve tessellates for the viewport')
})

test('an arbitrary datum-plane profile revolves in its own frame as a valid B-rep', () => {
  // Tilt the sketch plane 45° about Z.  The profile and its selected construction axis
  // both live in that frame, exactly as they do after Create Sketch on an angled datum.
  const u = Math.SQRT1_2
  const plane = new RPlane([0, 0, 0], [u, u, 0], [0, 0, 1])
  // Keep the closed region entirely on one side of the axis; a profile crossing
  // its axis is self-intersecting after a full revolution and correctly rejected
  // by OCCT/Fusion alike.
  const profile = draw([10, 4]).lineTo([20, 4]).lineTo([20, 16]).lineTo([10, 16]).close().sketchOnPlane(plane)
  const result = profile.revolve([u, u, 0])
  assert.ok(!result.wrapped.IsNull() && volume(result) > 1, 'arbitrary-plane revolve produces a non-empty solid B-rep')
  const mesh = result.mesh({ tolerance: 0.2, angularTolerance: 0.5 })
  assert.ok(mesh.vertices.length > 0 && mesh.triangles.length > 0, 'arbitrary-plane Revolve tessellates for the viewport')
})

test('timeline Revolve persists its cardinal plane instead of flattening to XY', () => {
  const worker = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')
  const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  assert.match(worker, /type: 'revolve';[\s\S]*?plane\?: Plane; baseZ\?: number/)
  // Persist authored plane; BUG-SO16-001 may remap XZ·Y / YZ·X / XY·Z onto a lathe plane
  // that carries axial extent (preview + confirm). Still not a silent flatten-to-XY of all revolves.
  assert.match(worker, /const authoredPlane = \(f\.plane \?\? 'XY'\)/)
  assert.match(worker, /revolveLathePlane\(authoredPlane, rax\)/)
  assert.match(worker, /profileToSketch\(pv, remapped \? 0 : \(f\.baseZ \?\? 0\), lathePlane\)/)
  assert.match(worker, /arbPlane\?: \{ o: \[number, number, number\]; xd: \[number, number, number\]; n: \[number, number, number\] \}/)
  assert.match(worker, /profileOnPlane\(pv, new RPlane\(f\.arbPlane\.o as any, f\.arbPlane\.xd as any, f\.arbPlane\.n as any\)\)/)
  assert.match(store, /skBundle \? \{ plane: skBundle\.plane, baseZ: skBundle\.baseZ \} : \{\}/)
  assert.match(store, /skBundle\?\.arb \? \{ arbPlane: skBundle\.arb \} : \{\}/)
  assert.match(store, /st0\.sketchArb \? \{ arb: JSON\.parse\(JSON\.stringify\(st0\.sketchArb\)\) as ArbBasis \} : \{\}/)
  // Datum ownership across command entry/cancel is verified by active-parameter-datum-revolve.test.mjs.
  assert.match(store, /f\.type === 'revolve' && sid && arbNew\[sid\] && \(f as \{ arbPlane\?: ArbBasis \}\)\.arbPlane/)
  assert.doesNotMatch(store, /st0\.sketchPlane && st0\.sketchPlane !== 'XY'\)\) \{ set\(/)
})
