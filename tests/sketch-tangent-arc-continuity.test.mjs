// BUG(F)：相切弧必须由上段终点起、起点切线 = 上段方向（G1），并补 相切 约束。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { tangentArcBulge, endTangent, polyTangentArcCons } from '../src/sketch/tangentArc.ts'
import { bulgeCenter, tessellateSeg } from '../src/sketch/sketchOps.ts'

let _k = 0; const mk = () => 'k' + ++_k
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e
function arcFromLine(lineA, lineB, click) {
  const t = endTangent([lineA, lineB], [0])
  const v = [click[0] - lineB[0], click[1] - lineB[1]]
  const phi = Math.atan2(t[0] * v[1] - t[1] * v[0], t[0] * v[0] + t[1] * v[1])
  return { t, bulge: tangentArcBulge(phi) }
}

for (const click of [[10, 10], [10, -10], [30, 7], [-5, 20]]) {
  test(`arc after line (→ ${click}) starts at the line end and is tangent to it`, () => {
    const A = [-40, 0], B = [0, 0]
    const { t, bulge } = arcFromLine(A, B, click)
    const c = bulgeCenter(B, click, bulge)
    // tangent at start ⟂ radius → centre lies on the normal through B
    assert.ok(near((B[0] - c[0]) * t[0] + (B[1] - c[1]) * t[1], 0), 'radius ⟂ line direction at start')
    // first tessellated step continues forward along the line direction
    const pts = tessellateSeg(B, click, bulge, 0.01)
    const d = [pts[0][0] - B[0], pts[0][1] - B[1]], L = Math.hypot(d[0], d[1])
    assert.ok((d[0] * t[0] + d[1] * t[1]) / L > 0.999, 'arc leaves B in the line direction (no kink / reversal)')
    // the arc's own start tangent (endTangent over a 1-seg reversed path) equals t
    const startT = endTangent([click, B], [-bulge]).map((x) => -x)
    assert.ok(near(startT[0], t[0], 1e-9) && near(startT[1], t[1], 1e-9))
  })
}

test('arc→arc chaining: endTangent of a tangent arc is the true arc end tangent', () => {
  const B = [0, 0], P = [10, 10]
  const { bulge } = arcFromLine([-40, 0], B, P)   // quarter circle centre (0,10) → end tangent (0,1)
  const te = endTangent([B, P], [bulge])
  assert.ok(near(te[0], 0) && near(te[1], 1))
})

test('polyTangentArcCons adds line↔arc tangent for a G1 joint only', () => {
  const B = [0, 0], P = [10, 10]
  const { bulge } = arcFromLine([-40, 0], B, P)
  const sh = { type: 'poly', verts: [[-40, 0], B, P], bulges: [0, bulge], open: true }
  const cons = polyTangentArcCons(sh, 3, [], mk)
  assert.equal(cons.length, 1)
  assert.deepEqual([cons[0].type, cons[0].a, cons[0].b], ['tangent', { kind: 'edge', shape: 3, idx: 0 }, { kind: 'edge', shape: 3, idx: 1 }])
  assert.equal(polyTangentArcCons(sh, 3, cons, mk).length, 0, 'no duplicates')
  const kinked = { ...sh, bulges: [0, -bulge] }   // reversed arc = not tangent → no constraint forced
  assert.equal(polyTangentArcCons(kinked, 3, [], mk).length, 0)
})

test('store/SketchLayer use the shared tangent-arc bulge and add tangent constraints', () => {
  const st = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(st, /const bulge = Math\.tan\(phi \/ 2\)/)
  assert.match(st, /const bulge = tangentArcBulge\(phi\)/)
  assert.match(st, /polyTangentArcCons\(sh,originals\.length,s\.skCons,skConId\)/)
  assert.match(st, /polyTangentArcCons\(shapes\[shapes\.length - 1\]/)
  const sl = readFileSync(new URL('../src/components/SketchLayer.tsx', import.meta.url), 'utf8')
  assert.match(sl, /tessellateSeg\(P, preview, tangentArcBulge\(phi\)\)/)
})
