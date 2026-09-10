import test from 'node:test'
import assert from 'node:assert/strict'
import { refreshSafeProjectLinks } from '../src/sketch/projectLinks.ts'
const loop = (x = 0) => ({ type: 'poly', pts: [[x, 0], [x + 10, 0], [x + 10, 10], [x, 10]], projected: true, projectLink: 'all' })
const segs = sh => sh.pts.map((p, i) => [p, sh.pts[(i + 1) % sh.pts.length]])
test('missing projection source is reported while retaining cached geometry', () => {
  const shapes = [loop()]
  for (const ref of [null, { segs: [] }]) {
    const result = refreshSafeProjectLinks(shapes, ref, [])
    assert.equal(result.held, 1)
    assert.equal(result.reason, 'missing-source')
    assert.deepEqual(result.shapes.map(({ projectLinkIssue, ...shape }) => shape), shapes)
    assert.ok(result.shapes.every(shape => shape.projectLinkIssue === result.reason))
  }
})
test('a moved projection retains construction and centerline semantics', () => {
  const source = { ...loop(), construction: true, centerline: true }
  const result = refreshSafeProjectLinks([source], { segs: segs(loop(2)) }, [])
  assert.equal(result.refreshed, 1)
  assert.equal(result.shapes[0].construction, true)
  assert.equal(result.shapes[0].centerline, true)
  assert.equal(result.shapes[0].pts[0][0], 2)
})
test('reordering source chains does not swap sketch identity or construction flags', () => {
  const first = { ...loop(), construction: true }, second = loop(30)
  const result = refreshSafeProjectLinks([first, second], { segs: [...segs(second), ...segs(first)] }, [])
  assert.equal(result.held, 0)
  assert.deepEqual(result.shapes[0], first)
  assert.deepEqual(result.shapes[1], second)
})
test('ambiguous changed multi-chain projection is held instead of guessed', () => {
  const shapes = [loop(), loop(30)]
  const result = refreshSafeProjectLinks(shapes, { segs: [...segs(loop(32)), ...segs(loop(2))] }, [])
  assert.equal(result.held, 2)
  assert.equal(result.reason, 'ambiguous-source')
  assert.deepEqual(result.shapes.map(({ projectLinkIssue, ...shape }) => shape), shapes)
    assert.ok(result.shapes.every(shape => shape.projectLinkIssue === result.reason))
})
test('user-edited arc data on a linked curve is not silently replaced', () => {
  const edited = { ...loop(), verts: [[0, 0], [10, 0]], bulges: [1, 1] }
  const result = refreshSafeProjectLinks([edited], { segs: segs(loop(2)) }, [])
  assert.equal(result.held, 1)
  assert.equal(result.reason, 'modified-geometry')
  assert.deepEqual(result.shapes.map(({ projectLinkIssue, ...shape }) => shape), [edited])
})

test('unchanged constrained source clears a stale issue without changing geometry or constraints', () => {
  const shape = {...loop(), projectLinkIssue:'missing-source'}
  const cons = [{a:{kind:'edge',shape:0,idx:0}}]
  const result = refreshSafeProjectLinks([shape], {segs:segs(loop()).reverse()}, cons)
  assert.equal(result.held, 0)
  assert.deepEqual(result.shapes, [loop()])
  assert.deepEqual(cons, [{a:{kind:'edge',shape:0,idx:0}}])
})
