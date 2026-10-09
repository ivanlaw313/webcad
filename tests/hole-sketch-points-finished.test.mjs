import test from 'node:test'
import assert from 'node:assert/strict'
import { finishedSketchPointCandidates, sketchPointsOf, holeSnapTargetsFromSources, snapHoleXY } from '../src/sketch/holePoints.ts'

const pt = (s, t) => ({ type: 'circle', c: [s, t], r: 0, point: true })
const state = {
  features: [{ type: 'extrude', id: 'e' }, { type: 'sketch', sketchId: 'sk1' }, { type: 'sketch', sketchId: 'sk2' }, { type: 'sketch', sketchId: 'sk3' }],
  sketchSources: {
    sk1: { shapes: [pt(17, 14), { type: 'rect', a: [0, 0], b: [10, 10] }], plane: 'XY', visible: true },
    sk2: { shapes: [{ type: 'circle', c: [5, 5], r: 3 }], plane: 'XY' },          // no sketch points
    sk3: { shapes: [pt(1, 2), pt(3, 4)], plane: 'XY', name: '螺栓點' },
  },
}

test('finished sketches with points are candidates (not only the active sketch)', () => {
  const c = finishedSketchPointCandidates(state)
  assert.deepEqual(c.map((x) => x.id), ['sk1', 'sk3'])
  assert.deepEqual(c[0].pts, [[17, -14]])          // sketch [s,t] → CAD [s,-t]
  assert.equal(c[1].name, '螺栓點')
  assert.equal(c[0].name, '草圖1')
})

test('non-XY / arb sketches and deleted sketches are skipped', () => {
  const c = finishedSketchPointCandidates({ features: [{ type: 'sketch', sketchId: 'a' }, { type: 'sketch', sketchId: 'b' }], sketchSources: { a: { shapes: [pt(1, 1)], plane: 'XZ' }, b: { shapes: [pt(1, 1)], plane: 'XY', arb: {} } } })
  assert.equal(c.length, 0)
  assert.equal(finishedSketchPointCandidates({ features: [], sketchSources: state.sketchSources }).length, 0)
})

test('construction-free points only: plain circles are not points', () => {
  assert.equal(sketchPointsOf([{ type: 'circle', c: [1, 1], r: 2 }]).length, 0)
})

test('hole click near a sketch point snaps to it; far click stays raw', () => {
  const tg = holeSnapTargetsFromSources(state)
  assert.deepEqual(snapHoleXY([17.8, -13.1], tg), [17, -14])
  assert.deepEqual(snapHoleXY([10.4, -9.7], tg), [10, -10])   // rect corner vertex
  assert.equal(snapHoleXY([40, 40], tg), null)
})

test('hidden sketches are not snap targets', () => {
  const tg = holeSnapTargetsFromSources({ sketchSources: { a: { shapes: [pt(17, 14)], plane: 'XY' } } })   // visible undefined = hidden (toggleSketchVisible convention)
  assert.equal(snapHoleXY([17, -14], tg), null)
})
