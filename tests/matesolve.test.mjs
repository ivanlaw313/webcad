// #13 mate solver — pure-module verification (Node via tsx). Uses a simple rigid worldMatrixOf (T·R) so the
// test exercises the SOLVER math, not compWorldMatrix. Asserts: mate residual → 0, grounded fixed, finite,
// over-constraint flagged, and NEVER NaN/explode.
import { Matrix4, Euler } from 'three'
import { mateSolve } from '../src/assembly/mateSolve.ts'

const DEG = Math.PI / 180
const worldMatrixOf = (_id, pos, rot) =>
  new Matrix4().makeRotationFromEuler(new Euler(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG, 'XYZ')).setPosition(pos[0], pos[1], pos[2])

let pass = 0, fail = 0
const ok = (cond, msg) => { if (cond) { pass++ } else { fail++; console.log('  ✗ ' + msg) } }
const finiteArr = (a) => a.every(Number.isFinite)

// ── Test 1: coincident planar mate — B (free) snaps onto A (grounded); A must NOT move ──
{
  const comps = [{ id: 'A', pos: [0, 0, 0], rot: [0, 0, 0] }, { id: 'B', pos: [50, 60, 70], rot: [25, -15, 40] }]
  const mates = [{ id: 'M1', aComp: 'A', bComp: 'B', aFace: { kind: 'planar', n: [0, 0, 1], p: [0, 0, 0] }, bFace: { kind: 'planar', n: [0, 0, 1], p: [0, 0, 0] }, flip: true, gap: 0 }]
  const r = mateSolve(comps, mates, new Set(['A']), worldMatrixOf, 100)
  const aPos = r.pos.get('A'), aRot = r.rot.get('A'), bPos = r.pos.get('B'), bRot = r.rot.get('B')
  ok(aPos.every((v) => Math.abs(v) < 1e-9) && aRot.every((v) => Math.abs(v) < 1e-9), `grounded A moved: pos=${aPos} rot=${aRot}`)
  ok(r.mateErrors['M1'].dist < 1e-2 && r.mateErrors['M1'].angle < 1e-1, `M1 residual not ~0: dist=${r.mateErrors['M1'].dist} angle=${r.mateErrors['M1'].angle}`)
  ok(finiteArr(aPos) && finiteArr(aRot) && finiteArr(bPos) && finiteArr(bRot), 'NaN/Inf pose')
  ok(r.ok, `not converged (ok=false), residual=${r.residual}, iters=${r.iters}`)
  console.log(`T1 coincident: ok=${r.ok} residual=${r.residual.toExponential(2)} iters=${r.iters} M1.dist=${r.mateErrors['M1'].dist.toExponential(2)}mm M1.ang=${r.mateErrors['M1'].angle.toExponential(2)}°`)
}

// ── Test 2: gap offset — B settles 20mm off A's plane ──
{
  const comps = [{ id: 'A', pos: [0, 0, 0], rot: [0, 0, 0] }, { id: 'B', pos: [10, 10, 10], rot: [5, 5, 5] }]
  const mates = [{ id: 'M1', aComp: 'A', bComp: 'B', aFace: { kind: 'planar', n: [0, 0, 1], p: [0, 0, 0] }, bFace: { kind: 'planar', n: [0, 0, 1], p: [0, 0, 0] }, flip: true, gap: 20 }]
  const r = mateSolve(comps, mates, new Set(['A']), worldMatrixOf, 100)
  ok(r.mateErrors['M1'].dist < 1e-2, `gap mate residual not ~0: ${r.mateErrors['M1'].dist}`)
  console.log(`T2 gap=20: residual=${r.residual.toExponential(2)} M1.dist=${r.mateErrors['M1'].dist.toExponential(2)}mm`)
}

// ── Test 3: over-constraint — two conflicting coincident mates on B (z=0 AND z=40) → flagged, never explode ──
{
  const comps = [{ id: 'A', pos: [0, 0, 0], rot: [0, 0, 0] }, { id: 'B', pos: [0, 0, 20], rot: [0, 0, 0] }]
  const mates = [
    { id: 'M1', aComp: 'A', bComp: 'B', aFace: { kind: 'planar', n: [0, 0, 1], p: [0, 0, 0] }, bFace: { kind: 'planar', n: [0, 0, 1], p: [0, 0, 0] }, flip: true, gap: 0 },
    { id: 'M2', aComp: 'A', bComp: 'B', aFace: { kind: 'planar', n: [0, 0, 1], p: [0, 0, 40] }, bFace: { kind: 'planar', n: [0, 0, 1], p: [0, 0, 0] }, flip: true, gap: 0 },
  ]
  const r = mateSolve(comps, mates, new Set(['A']), worldMatrixOf, 100)
  ok(r.conflictingIds.length > 0, 'over-constrained (z=0 vs z=40) must be FLAGGED')
  ok(finiteArr(r.pos.get('B')) && finiteArr(r.rot.get('B')), 'over-constrained solve produced NaN/Inf')
  console.log(`T3 over-constraint: conflicts=[${r.conflictingIds}] B settled dist(M1)=${r.mateErrors['M1'].dist.toFixed(1)}mm dist(M2)=${r.mateErrors['M2'].dist.toFixed(1)}mm (expect ~20 each)`)
}

// ── Test 4: coaxial (cyl) mate — B's axis aligns to A's axis, coaxial ──
{
  const comps = [{ id: 'A', pos: [0, 0, 0], rot: [0, 0, 0] }, { id: 'B', pos: [30, 40, 0], rot: [20, 0, 35] }]
  const mates = [{ id: 'M1', aComp: 'A', bComp: 'B', aFace: { kind: 'cyl', axis: [0, 0, 1], p: [0, 0, 0], r: 5 }, bFace: { kind: 'cyl', axis: [0, 0, 1], p: [0, 0, 0], r: 5 }, flip: false, gap: 0 }]
  const r = mateSolve(comps, mates, new Set(['A']), worldMatrixOf, 100)
  ok(r.mateErrors['M1'].dist < 1e-2 && r.mateErrors['M1'].angle < 1e-1, `coaxial residual not ~0: dist=${r.mateErrors['M1'].dist} angle=${r.mateErrors['M1'].angle}`)
  ok(finiteArr(r.pos.get('B')) && finiteArr(r.rot.get('B')), 'coaxial NaN')
  console.log(`T4 coaxial: ok=${r.ok} residual=${r.residual.toExponential(2)} M1.dist=${r.mateErrors['M1'].dist.toExponential(2)}mm M1.ang=${r.mateErrors['M1'].angle.toExponential(2)}°`)
}

console.log(`\n#13 mateSolve: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
