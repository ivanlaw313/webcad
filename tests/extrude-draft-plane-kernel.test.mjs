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

const volume = (shape) => { const p = new OC.GProp_GProps_1(); OC.BRepGProp.VolumeProperties_1(shape.wrapped, p, false, false, false); return Math.abs(p.Mass()) }
const valid = (shape) => !shape.wrapped.IsNull() && volume(shape) > 1

test('draft loft is a valid B-rep on an XZ sketch plane with an offset', () => {
  const base = draw([-12, -8]).lineTo([12, -8]).lineTo([12, 8]).lineTo([-12, 8]).close().sketchOnPlane('XZ', 7)
  const top = draw([-9, -5]).lineTo([9, -5]).lineTo([9, 5]).lineTo([-9, 5]).close().sketchOnPlane('XZ', 32)
  const solid = base.loftWith(top, { ruled: true })
  assert.ok(valid(solid), 'XZ datum draft is a non-empty solid')
  assert.ok(solid.mesh({ tolerance: 0.2, angularTolerance: 0.5 }).triangles.length > 0)
})

test('draft loft is a valid B-rep on an arbitrary datum plane', () => {
  const u = Math.SQRT1_2
  const a = new RPlane([0, 0, 0], [u, u, 0], [0, 0, 1])
  const b = new RPlane([0, 0, 24], [u, u, 0], [0, 0, 1])
  const base = draw([-12, -8]).lineTo([12, -8]).lineTo([12, 8]).lineTo([-12, 8]).close().sketchOnPlane(a)
  const top = draw([-9, -5]).lineTo([9, -5]).lineTo([9, 5]).lineTo([-9, 5]).close().sketchOnPlane(b)
  assert.ok(valid(base.loftWith(top, { ruled: true })), 'arbitrary datum draft is a non-empty solid')
})

test('worker uses the sketch plane for draft top and bottom sections', () => {
  const worker = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')
  assert.match(worker, /if \(Math\.abs\(draftDeg\) > 0\.01 && !f\.twist\)/)
  assert.match(worker, /topDr\.sketchOnPlane\(new RPlane\(topO as any, ap\.xd as any, ap\.n as any\)\)/)
  assert.match(worker, /dr\.sketchOnPlane\(plane, planeOffset\)\.loftWith\(topDr\.sketchOnPlane\(plane, planeOffset \+ eh\)/)
})
