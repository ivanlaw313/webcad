// Face-pick assembly mate — self-written, license-safe. Upgrades the bbox mate to TRUE face/axis alignment:
// pick a face on the stationary part A and a face on the moving part B, and B is rotated + translated so the
// two faces mate. Two kinds:
//   • planar coincident — two flat faces meet face-to-face (outward normals oppose), centroids aligned.
//   • concentric (axis) — two cylindrical faces become coaxial (axes colinear); axial slide left free.
// Math is exact rigid-body (quaternion + translation) in three.js WORLD space; a helper decodes the new world
// matrix back into the component's stored pos/rot (inverting compWorldMatrix's construction). Honest scope:
// this is single-mate placement (snap once), not a persistent multi-constraint solver.

import { Matrix4, Vector3, Quaternion, Euler } from 'three'

export type PlanarFace = { kind: 'planar'; n: [number, number, number]; p: [number, number, number] }
export type CylFace = { kind: 'cyl'; axis: [number, number, number]; p: [number, number, number]; r: number }
export type MateFace = PlanarFace | CylFace

const v3 = (a: [number, number, number]) => new Vector3(a[0], a[1], a[2])

// Quaternion that rotates unit vector `from` onto unit vector `to` (robust to anti-parallel via a stable axis).
function quatFromTo(from: Vector3, to: Vector3): Quaternion {
  const f = from.clone().normalize(), t = to.clone().normalize()
  const d = f.dot(t)
  if (d > 1 - 1e-9) return new Quaternion() // already aligned
  if (d < -1 + 1e-9) { // opposite → 180° about any axis ⊥ f
    let axis = new Vector3(1, 0, 0).cross(f)
    if (axis.lengthSq() < 1e-9) axis = new Vector3(0, 1, 0).cross(f)
    axis.normalize()
    return new Quaternion().setFromAxisAngle(axis, Math.PI)
  }
  return new Quaternion().setFromUnitVectors(f, t)
}

// World rigid transform Δ to apply to B so its picked face mates onto A's picked face.
//   planar: B.normal → −A.normal (faces touch), B.point → A.point. opts.flip → B.normal → +A.normal (same
//           facing, e.g. align coplanar). opts.gap → separate the faces by `gap` mm along A's normal.
//   cyl:    B.axis → A.axis (parallel), coaxial; axial pos preserved. opts.flip → B.axis → −A.axis (reverse).
export function solveFaceMateDelta(faceA: MateFace, faceB: MateFace, opts?: { flip?: boolean; gap?: number }): Matrix4 {
  const flip = !!opts?.flip, gap = opts?.gap ?? 0
  if (faceA.kind === 'planar' && faceB.kind === 'planar') {
    const nA = v3(faceA.n).normalize(), nB = v3(faceB.n).normalize()
    const pA = v3(faceA.p), pB = v3(faceB.p)
    const target = flip ? nA.clone() : nA.clone().negate()   // default: oppose (faces touch); flip: same facing
    const q = quatFromTo(nB, target)
    const R = new Matrix4().makeRotationFromQuaternion(q)
    // Δ = T(pA + gap·nA) · R(q) · T(−pB)  → rotate B about pB, move pB onto pA, then separate by gap along nA.
    const dst = pA.clone().add(nA.clone().multiplyScalar(gap))
    return new Matrix4().makeTranslation(dst.x, dst.y, dst.z)
      .multiply(R)
      .multiply(new Matrix4().makeTranslation(-pB.x, -pB.y, -pB.z))
  }
  if (faceA.kind === 'cyl' && faceB.kind === 'cyl') {
    const aA = v3(faceA.axis).normalize(), aB = v3(faceB.axis).normalize()
    const pA = v3(faceA.p), pB = v3(faceB.p)
    const target = flip ? aA.clone().negate() : aA.clone()   // flip: reverse the part end-for-end
    const q = quatFromTo(aB, target)
    const R = new Matrix4().makeRotationFromQuaternion(q)
    // rotate B about pB (axis dir → target, pB fixed), then translate pB onto A's axis line (+ optional axial gap).
    const proj = pA.clone().add(aA.clone().multiplyScalar(pB.clone().sub(pA).dot(aA)))
    const t = proj.add(aA.clone().multiplyScalar(gap)).sub(pB)
    return new Matrix4().makeTranslation(t.x, t.y, t.z)
      .multiply(new Matrix4().makeTranslation(pB.x, pB.y, pB.z))
      .multiply(R)
      .multiply(new Matrix4().makeTranslation(-pB.x, -pB.y, -pB.z))
  }
  return new Matrix4() // mismatched kinds → identity (caller should require same kind)
}

export type MatePoint = { p: [number, number, number] }

// Exact one-shot Align delta: translate the moving picked point B onto stationary point A.
// Unlike face mates it deliberately carries no persistent constraint, matching Align's direct-placement use.
export function solvePointMateDelta(pointA: MatePoint, pointB: MatePoint): Matrix4 {
  const a = v3(pointA.p), b = v3(pointB.p)
  return new Matrix4().makeTranslation(a.x - b.x, a.y - b.y, a.z - b.z)
}

// Mate residual: how far two WORLD faces are from being mated (dist mm + angle °; 0 = satisfied).
// For OVER-CONSTRAINED assemblies where a later mate overrides an earlier one (resolveMates applies mates
// sequentially in topo order), the earlier mate's residual in the FINAL pose reveals the violation — Fusion
// shows this as a mate-error badge; here it surfaces as a resolveMates warning + stored mateErrors. planar:
// |gap-along-A-normal| + normal angle; cyl: ⊥ axis-line distance + axis angle. Single-mate snaps read ~0 (exact).
export function mateResidual(faceA: MateFace, faceB: MateFace, opts?: { flip?: boolean; gap?: number }): { dist: number; angle: number } {
  const flip = !!opts?.flip, gap = opts?.gap ?? 0
  if (faceA.kind === 'planar' && faceB.kind === 'planar') {
    const nA = v3(faceA.n).normalize(), nB = v3(faceB.n).normalize()
    const target = flip ? nA.clone() : nA.clone().negate()
    const angle = (Math.acos(Math.max(-1, Math.min(1, nB.dot(target)))) * 180) / Math.PI
    const dist = Math.abs(v3(faceB.p).sub(v3(faceA.p)).dot(nA) - gap)
    return { dist, angle }
  }
  if (faceA.kind === 'cyl' && faceB.kind === 'cyl') {
    const aA = v3(faceA.axis).normalize(), aB = v3(faceB.axis).normalize()
    const target = flip ? aA.clone().negate() : aA.clone()
    const angle = (Math.acos(Math.max(-1, Math.min(1, aB.dot(target)))) * 180) / Math.PI
    const d = v3(faceB.p).sub(v3(faceA.p)); const along = d.dot(aA)
    const dist = d.sub(aA.clone().multiplyScalar(along)).length()   // ⊥ distance B-point → A-axis line
    return { dist, angle }
  }
  return { dist: 0, angle: 0 }
}

// Transform a MateFace by a 4x4 matrix: directions (normal/axis) by the linear part, the point by the full
// matrix. Used to store a picked WORLD face in a component's LOCAL frame (M = inverse world matrix) and to
// re-derive the WORLD face after the part moves (M = current world matrix) — so mates persist across moves.
export function transformFace(face: MateFace, M: Matrix4): MateFace {
  if (face.kind === 'planar') {
    const n = v3(face.n).transformDirection(M)
    const p = v3(face.p).applyMatrix4(M)
    return { kind: 'planar', n: [n.x, n.y, n.z], p: [p.x, p.y, p.z] }
  }
  const ax = v3(face.axis).transformDirection(M)
  const p = v3(face.p).applyMatrix4(M)
  return { kind: 'cyl', axis: [ax.x, ax.y, ax.z], p: [p.x, p.y, p.z], r: face.r }
}

// Decode a desired WORLD matrix back into a component's stored {pos, rot°}, inverting compWorldMatrix's
// construction  M = T(pos) · T(gc)·Rrot·T(−gc) · Rbase   (Rbase = CAD Z-up→three Y-up, rotX(−90)).
// `gc` is meshCenter3(mesh) (CAD-space part centre). Assumes a root component (no parent joint fk).
export function worldToPose(Mworld: Matrix4, gc: [number, number, number]): { pos: [number, number, number]; rot: [number, number, number] } {
  const Rbase = new Matrix4().makeRotationX(-Math.PI / 2)
  // Linear part: Lm = Rrot · Rbase_lin  ⇒  Rrot = Lm · Rbase_linᵀ. Pull rotation via Quaternion (ignores translation).
  const qWorld = new Quaternion().setFromRotationMatrix(Mworld)
  const qBase = new Quaternion().setFromRotationMatrix(Rbase)
  const qRot = qWorld.clone().multiply(qBase.clone().invert())
  const e = new Euler().setFromQuaternion(qRot, 'XYZ')
  const deg = 180 / Math.PI
  const rot: [number, number, number] = [e.x * deg, e.y * deg, e.z * deg]
  // K = T(gc)·Rrot·T(−gc)·Rbase ; pos = translation of (Mworld · K⁻¹).
  const Rrot = new Matrix4().makeRotationFromQuaternion(qRot)
  const K = new Matrix4().makeTranslation(gc[0], gc[1], gc[2])
    .multiply(Rrot)
    .multiply(new Matrix4().makeTranslation(-gc[0], -gc[1], -gc[2]))
    .multiply(Rbase)
  const T = Mworld.clone().multiply(K.clone().invert())
  const pos = new Vector3().setFromMatrixPosition(T)
  return { pos: [pos.x, pos.y, pos.z], rot }
}
