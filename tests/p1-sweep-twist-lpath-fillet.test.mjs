// P1 C proof: auto-fillet sharp L / multi-seg open path, then frameTwistTaperSweep — volume gate OK (preview=result).
import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))

const { setOC, draw } = await import('replicad')
const { default: opencascade } = await import('../src/kernel/replicad_plus.js')
const { frameTwistTaperSweep, filletOpenPolylineCorners, autoFilletRadiusForPath } = await import('../src/cad/sweepTwist.ts')

const OC = await opencascade({ locateFile: () => fileURLToPath(new URL('../src/kernel/replicad_plus.wasm', import.meta.url)) })
setOC(OC)

const A = 5, B = 5
const rectOnPlane = () => (pl) => draw([A, B]).lineTo([-A, B]).lineTo([-A, -B]).lineTo([A, -B]).close().sketchOnPlane(pl).wire
function vol(shape) {
  try { const g = new OC.GProp_GProps_1(); OC.BRepGProp.VolumeProperties_1(shape.wrapped, g, false, false, false); return g.Mass() } catch { return NaN }
}
function drawOpen(verts, bulges) {
  let pen = draw([verts[0][0], verts[0][1]])
  for (let i = 0; i < verts.length - 1; i++) {
    const a = verts[i], b = verts[i + 1], bu = bulges[i] || 0
    const dx = b[0] - a[0], dy = b[1] - a[1]
    if (Math.hypot(dx, dy) < 1e-9) continue
    if (Math.abs(bu) < 1e-6) pen = pen.lineTo([b[0], b[1]])
    else {
      const m = [(a[0] + b[0]) / 2 - dy * bu / 2, (a[1] + b[1]) / 2 + dx * bu / 2]
      pen = pen.threePointsArcTo([b[0], b[1]], m)
    }
  }
  return pen.done().sketchOnPlane('XY')
}

test('filletOpenPolylineCorners rounds L-path 90° corner', () => {
  const L = [[0, 0], [60, 0], [60, 40]]
  const r = autoFilletRadiusForPath(L, 5)
  assert.ok(r > 0 && r <= 2.5)
  const fr = filletOpenPolylineCorners(L, r)
  assert.equal(fr.count, 1)
  assert.equal(fr.verts.length, 4)
  assert.ok(Math.abs(fr.bulges[1]) > 0.1)
})

test('L-path twist90 after auto-fillet: volume matches twist0 (≤10% gate)', () => {
  const L = [[0, 0], [60, 0], [60, 40]]
  const r = autoFilletRadiusForPath(L, 5)
  const fr = filletOpenPolylineCorners(L, r)
  const spine = drawOpen(fr.verts, fr.bulges).wire
  const v0 = vol(frameTwistTaperSweep(OC, spine.wrapped, rectOnPlane(), { twistDeg: 0, stations: 16 }))
  const v90 = vol(frameTwistTaperSweep(OC, spine.wrapped, rectOnPlane(), { twistDeg: 90, stations: 16 }))
  assert.ok(Number.isFinite(v0) && v0 > 0, `v0=${v0}`)
  assert.ok(Math.abs(v90 - v0) / v0 <= 0.1, `Δ=${Math.abs(v90 - v0) / v0} v0=${v0} v90=${v90}`)
})

test('multi-segment open path twist90 after auto-fillet: volume gate OK', () => {
  const multi = [[0, 0], [40, 0], [40, 30], [70, 30], [70, 50]]
  const r = autoFilletRadiusForPath(multi, 5)
  const fr = filletOpenPolylineCorners(multi, r)
  assert.ok(fr.count >= 2, `expected ≥2 corners, got ${fr.count}`)
  const spine = drawOpen(fr.verts, fr.bulges).wire
  const v0 = vol(frameTwistTaperSweep(OC, spine.wrapped, rectOnPlane(), { twistDeg: 0, stations: 20 }))
  const v90 = vol(frameTwistTaperSweep(OC, spine.wrapped, rectOnPlane(), { twistDeg: 90, stations: 20 }))
  assert.ok(Number.isFinite(v0) && v0 > 0)
  assert.ok(Math.abs(v90 - v0) / v0 <= 0.1, `Δ=${Math.abs(v90 - v0) / v0}`)
})
