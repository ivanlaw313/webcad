import assert from 'node:assert/strict'
import test from 'node:test'

const { expandHoleFeature } = await import('../src/cad/holeFeature.ts')

test('Hole To Object expands into one persistent To Object cut from the entry plane', () => {
  const toFace = { near: [12, 8, 4], faceFp: ['v1'], faceFpV2: ['v2'], faceFpTopo: ['topo'] }
  const [cut] = expandHoleFeature({
    id: 'hole-a', kind: 'simple', center: [12, 8], top: 20, diameter: 6,
    extent: 'to-object', toFace,
  })
  assert.equal(cut.type, 'extrude')
  assert.equal(cut.operation, 'cut')
  assert.equal(cut.baseZ, 20, 'cut must start from the hole entry plane')
  assert.equal(cut.height, 16, 'initial fallback is target distance; worker recomputes it on rebuild')
  assert.deepEqual(cut.toFace, toFace)
})

test('Hole To Object does not add a blind drill point below a target face', () => {
  const cuts = expandHoleFeature({
    id: 'hole-b', kind: 'simple', center: [0, 0], top: 10, diameter: 4,
    extent: 'to-object', toFace: { near: [0, 0, 2] }, drillPoint: { angle: 118 },
  })
  assert.equal(cuts.length, 1)
})
