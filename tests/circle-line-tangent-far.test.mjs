import {register} from 'node:module'
import test from 'node:test'
import assert from 'node:assert/strict'
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){if(s.includes('?url'))return {url:'data:text/javascript,export default %22%22',shortCircuit:true};return n(s,c)}`))
const {solveFree} = await import('../src/sketch/freesolve.ts')

function distPL(c, A, B) {
  const len = Math.hypot(B[0]-A[0], B[1]-A[1]) || 1
  return Math.abs((B[0]-A[0])*(c[1]-A[1]) - (B[1]-A[1])*(c[0]-A[0])) / len
}
function footT(c, A, B) {
  const dx=B[0]-A[0], dy=B[1]-A[1], len2=dx*dx+dy*dy||1
  return ((c[0]-A[0])*dx+(c[1]-A[1])*dy)/len2
}
function gap(a, b) { return Math.hypot(a[0]-b[0], a[1]-b[1]) }

test('far-apart circle+line tangent moves into visual tangency (contact on segment)', async () => {
  const shapes = [
    { type: 'circle', c: [-30, -25], r: 20 },
    { type: 'poly', open: true, verts: [[20, 40], [90, 40]], bulges: [0], pts: [[20,40],[90,40]] },
  ]
  const cons = [
    { id: 'd1', kind: 'dim', type: 'dia', a: { kind: 'circle', shape: 0 }, value: 40 },
    { id: 'k2', kind: 'con', type: 'tangent', a: { kind: 'circle', shape: 0 }, b: { kind: 'edge', shape: 1, idx: 0 } },
  ]
  const before = distPL(shapes[0].c, shapes[1].verts[0], shapes[1].verts[1])
  assert.ok(before - 20 > 10, 'fixture starts non-tangent')
  const res = await solveFree(structuredClone(shapes), cons)
  assert.equal(res.conflict, false, JSON.stringify(res.conflictIds))
  assert.equal(res.dof, 5)
  const circ = res.shapes[0], line = res.shapes[1]
  const A = line.verts[0], B = line.verts[1]
  const after = distPL(circ.c, A, B)
  assert.ok(Math.abs(after - circ.r) < 1e-4, `infinite-line |dist-r|=${Math.abs(after-circ.r)}`)
  const t = footT(circ.c, A, B)
  assert.ok(t >= -1e-3 && t <= 1+1e-3, `contact must lie on finite segment, t=${t}`)
})

test('near-tangent circle+line still solves (no regress)', async () => {
  const shapes = [
    { type: 'circle', c: [0, 0], r: 20 },
    { type: 'poly', open: true, verts: [[-40, 20], [40, 20]], bulges: [0], pts: [[-40,20],[40,20]] },
  ]
  const cons = [
    { id: 'd1', kind: 'dim', type: 'dia', a: { kind: 'circle', shape: 0 }, value: 40 },
    { id: 'k2', kind: 'con', type: 'tangent', a: { kind: 'circle', shape: 0 }, b: { kind: 'edge', shape: 1, idx: 0 } },
  ]
  const res = await solveFree(structuredClone(shapes), cons)
  assert.equal(res.conflict, false, JSON.stringify(res.conflictIds))
  const circ = res.shapes[0], A = res.shapes[1].verts[0], B = res.shapes[1].verts[1]
  assert.ok(Math.abs(distPL(circ.c, A, B) - circ.r) < 1e-4)
})

test('nearby open-line endpoints coincident collapses the gap', async () => {
  const shapes = [
    { type: 'poly', open: true, verts: [[0, 0], [45.5, 0]], bulges: [0], pts: [[0,0],[45.5,0]] },
    { type: 'poly', open: true, verts: [[50, -5], [90, -40]], bulges: [0], pts: [[50,-5],[90,-40]] },
  ]
  const cons = [
    { id: 'k1', kind: 'con', type: 'coincident', a: { kind: 'pt', shape: 0, idx: 1 }, b: { kind: 'pt', shape: 1, idx: 0 } },
  ]
  assert.ok(gap(shapes[0].verts[1], shapes[1].verts[0]) > 1, 'fixture starts gapped')
  const res = await solveFree(structuredClone(shapes), cons)
  assert.equal(res.conflict, false, JSON.stringify(res.conflictIds))
  assert.equal(res.dof, 6)
  assert.ok(gap(res.shapes[0].verts[1], res.shapes[1].verts[0]) < 1e-4)
  assert.equal(res.shapes[0].open, true)
  assert.equal(res.shapes[1].open, true)
})
