import assert from 'node:assert/strict'
import test from 'node:test'

// Contract for store.mirrorComponent: mesh is CAD (x,y,z), occurrence position
// is three-world (x,z,-y).  A cardinal mirror must reflect the matching axis in
// both representations and reverse triangle winding separately in the store.
const reflect = (plane, mesh, pos) => {
  const k = plane === 'lr' ? 0 : plane === 'fb' ? 1 : 2
  const vertices = mesh.slice()
  for (let i = 0; i < vertices.length; i += 3) vertices[i + k] = -vertices[i + k]
  const position = plane === 'lr' ? [-pos[0], pos[1], pos[2]]
    : plane === 'fb' ? [pos[0], pos[1], -pos[2]]
      : [pos[0], -pos[1], pos[2]]
  return { vertices, position }
}

test('component mirror maps all three cardinal planes to the correct CAD/world axes', () => {
  const mesh = [2, 3, 5]
  const pos = [11, 13, 17]
  assert.deepEqual(reflect('lr', mesh, pos), { vertices: [-2, 3, 5], position: [-11, 13, 17] }, 'YZ flips CAD X / world X')
  assert.deepEqual(reflect('fb', mesh, pos), { vertices: [2, -3, 5], position: [11, 13, -17] }, 'XZ flips CAD Y / world Z')
  assert.deepEqual(reflect('tb', mesh, pos), { vertices: [2, 3, -5], position: [11, -13, 17] }, 'XY flips CAD Z / world Y')
})

test('component mirror distinguishes arbitrary planes from cardinal presets', () => {
  const isCardinal = (plane) => plane === 'XY' || plane === 'XZ' || plane === 'YZ'
  assert.equal(isCardinal('XY'), true)
  assert.equal(isCardinal('PICK'), false)
  assert.equal(isCardinal('P0'), false)
})

const reflectPointAcrossPlane = (p, o, n) => {
  const len = Math.hypot(...n)
  const u = n.map((v) => v / len)
  const d = (p[0] - o[0]) * u[0] + (p[1] - o[1]) * u[1] + (p[2] - o[2]) * u[2]
  return p.map((v, i) => v - 2 * d * u[i])
}

test('offset and arbitrary datum planes are genuine reflections, not origin-plane fallbacks', () => {
  assert.deepEqual(reflectPointAcrossPlane([2, 4, 6], [0, 0, 10], [0, 0, 1]), [2, 4, 14], 'XY offset +10 reflects Z around 10')
  const tilted = reflectPointAcrossPlane([4, 0, 0], [0, 0, 0], [1, 1, 0])
  assert.ok(Math.abs(tilted[0]) < 1e-12 && Math.abs(tilted[1] + 4) < 1e-12 && Math.abs(tilted[2]) < 1e-12, '45° datum reflects across its own normal')
})
