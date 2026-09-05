import assert from 'node:assert/strict'
import test from 'node:test'
import { formBoxRectCadCorners, formBoxSizeFromPoints, makePlacedBoxCage, newFormBoxDraft } from '../src/cad/formBox.ts'

const bounds = (verts) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  for (const p of verts) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]) }
  return { lo, hi }
}

const draftAt = (plane, direction = 'one') => ({
  ...newFormBoxDraft(), stage: 'ready', plane, center: [10, 20],
  length: 40, width: 30, height: 20, direction,
})

test('center rectangle follows Fusion center-to-corner sizing', () => {
  assert.deepEqual(formBoxSizeFromPoints([10, 20], [30, 5]), { length: 40, width: 30 })
})

test('XY box is placed around the picked center and grows from the plane', () => {
  const b = bounds(makePlacedBoxCage(draftAt('XY')).verts)
  assert.deepEqual(b, { lo: [-10, 5, 0], hi: [30, 35, 20] })
})

test('XZ and YZ boxes use the selected plane normal for height', () => {
  assert.deepEqual(bounds(makePlacedBoxCage(draftAt('XZ')).verts), { lo: [-10, 0, 5], hi: [30, 20, 35] })
  assert.deepEqual(bounds(makePlacedBoxCage(draftAt('YZ')).verts), { lo: [0, -10, 5], hi: [20, 30, 35] })
})

test('symmetric direction straddles the selected plane', () => {
  assert.deepEqual(bounds(makePlacedBoxCage(draftAt('XY', 'symmetric')).verts), { lo: [-10, 5, -10], hi: [30, 35, 10] })
})

test('a planar body face keeps its offset instead of snapping back to the origin', () => {
  const d = { ...draftAt('XZ'), planeOffset: 12 }
  assert.deepEqual(bounds(makePlacedBoxCage(d).verts), { lo: [-10, 12, 5], hi: [30, 32, 35] })
})

test('rectangle preview closes its loop on the selected plane', () => {
  const pts = formBoxRectCadCorners(draftAt('XZ'))
  assert.equal(pts.length, 5)
  assert.deepEqual(pts[0], pts[4])
  assert.ok(pts.every((p) => p[1] === 0))
})
