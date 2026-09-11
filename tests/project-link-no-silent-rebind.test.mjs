import test from 'node:test'
import assert from 'node:assert/strict'
import { getProjectRelinkCandidates, prepareProjectRelink, refreshSafeProjectLinks } from '../src/sketch/projectLinks.ts'

const square = (x = 0, y = 0) => [[x, y], [x + 10, y], [x + 10, y + 10], [x, y + 10]]
const source = (loops) => ({ segs: loops.flatMap(pts => pts.map((p, i) => [p, pts[(i + 1) % pts.length]])) })

test('chosen projectLinkSource never silently jumps to a sole remaining different edge', () => {
  const old = { type: 'poly', pts: square(50), projected: true, projectLink: 'all' }
  const mapped = prepareProjectRelink(old, getProjectRelinkCandidates(old, source([square(50)]))[0]).shape
  const result = refreshSafeProjectLinks([mapped], source([square(20)]), [])
  assert.equal(result.held, 1)
  assert.equal(result.refreshed, 0)
  assert.equal(result.reason, 'ambiguous-source')
  assert.deepEqual(result.shapes[0].pts, mapped.pts)
  assert.equal(result.shapes[0].projectLinkIssue, 'ambiguous-source')
  assert.deepEqual(result.shapes[0].projectLinkSource, mapped.projectLinkSource)
})

test('legacy Project All open edge does not silently rebind to a distant same-topology edge', () => {
  const bottom = { type: 'poly', pts: [[0, 0], [10, 0]], open: true, projected: true, projectLink: 'all' }
  const result = refreshSafeProjectLinks([bottom], { segs: [[[0, 10], [10, 10]]] }, [])
  assert.equal(result.held, 1)
  assert.equal(result.refreshed, 0)
  assert.ok(result.reason === 'ambiguous-source' || result.reason === 'topology')
  assert.deepEqual(result.shapes[0].pts, bottom.pts)
  assert.equal(result.shapes[0].projectLinkIssue, result.reason)
})

test('legacy unconstrained same-edge dim move still refreshes continuously', () => {
  const loop = { type: 'poly', pts: square(0), projected: true, projectLink: 'all', construction: true }
  const result = refreshSafeProjectLinks([loop], source([square(2)]), [])
  assert.equal(result.held, 0)
  assert.equal(result.refreshed, 1)
  assert.equal(result.shapes[0].pts[0][0], 2)
  assert.equal(result.shapes[0].construction, true)
})

test('changed explicit source never auto-retargets; constrained holds for per-item reconnect', () => {
  const old = { type: 'poly', pts: square(50), projected: true, projectLink: 'all' }
  const mapped = prepareProjectRelink(old, getProjectRelinkCandidates(old, source([square(50)]))[0]).shape
  // Exact source gone and replaced by a far different edge → must hold (covered above).
  // Constrained near-move still requires per-item reconnect, never silent retarget.
  const held = refreshSafeProjectLinks([mapped], source([square(52)]), [{ a: { kind: 'edge', shape: 0, idx: 0 } }])
  assert.equal(held.held, 1)
  assert.equal(held.reason, 'constraints')
  assert.deepEqual(held.shapes[0].pts, mapped.pts)
})
