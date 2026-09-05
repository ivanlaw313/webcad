// HANDOFF #13: 3D closed-loop assembly MATE solver. Simultaneous least-squares (Gauss-Newton + Levenberg)
// over FREE component 6-DOF poses (pos[3] world-mm + euler-XYZ deg[3]) to drive all mate residuals → 0.
// Generalizes the 2D solveLinkage skeleton (kinematics.ts) to 3D pose space. PURE math — the caller injects
// `worldMatrixOf` (closure over compWorldMatrix + FK), so this module never imports the store (no cycle).
// IRON RULE: NEVER explode / NaN the assembly — on divergence/singular/non-finite → REVERT to the pre-solve
// snapshot + return an honest warning (mirrors linkage.ts «宁愿唔郁» discipline). Grounded + dragged-pin
// components are FIXED (excluded from the unknowns), exactly like `fixed` points in solveLinkage.
import { Matrix4, Vector3 } from 'three'
import { gaussSolve } from './kinematics'
import { transformFace, mateResidual, type MateFace } from './faceMate'

export type SolveComp = { id: string; pos: [number, number, number]; rot: [number, number, number] }
export type SolveMate = { id: string; aComp: string; bComp: string; aFace: MateFace; bFace: MateFace; flip: boolean; gap: number }
export type MateSolveResult = {
  pos: Map<string, [number, number, number]>; rot: Map<string, [number, number, number]>
  mateErrors: Record<string, { dist: number; angle: number }>; conflictingIds: string[]
  mobility: number; ok: boolean; iters: number; residual: number; warning?: string
}

const v3 = (a: [number, number, number]) => new Vector3(a[0], a[1], a[2])
const isFin = (a: number[]) => a.every(Number.isFinite)

// Vectorized SMOOTH residual rows for one mate given its two WORLD faces (differentiable → good finite-diff
// Jacobian; the scalar mateResidual uses abs()/acos() which kink at 0 and break Gauss-Newton near the solution).
//   planar: [ signed point-on-plane dist − gap ,  L0·(nB − target)·xyz ]   (4 rows; rank 3, Levenberg-damped)
//   cyl:    [ (pB−pA)⊥A-axis ·xyz ,  L0·(aB − target)·xyz ]                (6 rows; rank 4)
// L0 (model bbox diag) scales the dimensionless alignment vector onto the mm scale → well-conditioned JᵀJ.
function residualRows(wa: MateFace, wb: MateFace, flip: boolean, gap: number, L0: number): number[] {
  if (wa.kind === 'planar' && wb.kind === 'planar') {
    const nA = v3(wa.n).normalize(), nB = v3(wb.n).normalize()
    const target = flip ? nA.clone() : nA.clone().negate()
    const dist = v3(wb.p).sub(v3(wa.p)).dot(nA) - gap
    const al = nB.clone().sub(target).multiplyScalar(L0)
    return [dist, al.x, al.y, al.z]
  }
  if (wa.kind === 'cyl' && wb.kind === 'cyl') {
    const aA = v3(wa.axis).normalize(), aB = v3(wb.axis).normalize()
    const target = flip ? aA.clone().negate() : aA.clone()
    const d = v3(wb.p).sub(v3(wa.p)); const along = d.dot(aA)
    const perp = d.clone().sub(aA.clone().multiplyScalar(along))
    const al = aB.clone().sub(target).multiplyScalar(L0)
    return [perp.x, perp.y, perp.z, al.x, al.y, al.z]
  }
  return []   // mismatched kinds → contributes no rows (skipped)
}

// DOF a satisfied mate removes from a free component's 6 (for the Grübler mobility redundancy screen).
function mateDOF(m: SolveMate): number {
  if (m.aFace.kind === 'planar' && m.bFace.kind === 'planar') return 3   // 1 trans⊥ + 2 rot-tilt (leaves 2 slide + 1 spin)
  if (m.aFace.kind === 'cyl' && m.bFace.kind === 'cyl') return 4         // 2 trans⊥ + 2 rot⊥ (leaves axial slide + spin)
  return 0
}

export function mateSolve(
  comps: SolveComp[],
  mates: SolveMate[],
  fixedIds: Set<string>,                                   // grounded + dragged-pin → not in the unknowns
  worldMatrixOf: (id: string, pos: [number, number, number], rot: [number, number, number]) => Matrix4,
  L0: number,
  opts?: { iters?: number },
): MateSolveResult {
  const iters = opts?.iters ?? 60
  const tol = Math.max(1e-4 * L0, 1e-6)
  const pose = new Map<string, { pos: [number, number, number]; rot: [number, number, number] }>()
  const snap = new Map<string, { pos: [number, number, number]; rot: [number, number, number] }>()
  for (const c of comps) { pose.set(c.id, { pos: [...c.pos], rot: [...c.rot] }); snap.set(c.id, { pos: [...c.pos], rot: [...c.rot] }) }
  const free = comps.filter((c) => !fixedIds.has(c.id)).map((c) => c.id)
  const colOf = new Map<string, number>(); free.forEach((id, i) => colOf.set(id, i * 6))
  const n = free.length * 6
  const mobility = 6 * free.length - mates.reduce((s, m) => s + mateDOF(m), 0)

  const gp = (id: string, k: number) => { const p = pose.get(id)!; return k < 3 ? p.pos[k] : p.rot[k - 3] }
  const sp = (id: string, k: number, val: number) => { const p = pose.get(id)!; if (k < 3) p.pos[k] = val; else p.rot[k - 3] = val }
  const computeR = (): number[] => {
    const R: number[] = []
    for (const m of mates) {
      const MA = worldMatrixOf(m.aComp, pose.get(m.aComp)!.pos, pose.get(m.aComp)!.rot)
      const MB = worldMatrixOf(m.bComp, pose.get(m.bComp)!.pos, pose.get(m.bComp)!.rot)
      R.push(...residualRows(transformFace(m.aFace, MA), transformFace(m.bFace, MB), m.flip, m.gap, L0))
    }
    return R
  }
  const revert = () => { for (const [k, s] of snap) pose.set(k, { pos: [...s.pos], rot: [...s.rot] }) }
  const finish = (ok: boolean, warning?: string): MateSolveResult => {
    const mateErrors: Record<string, { dist: number; angle: number }> = {}; const conflictingIds: string[] = []
    const TOL_D = Math.max(0.1, 1e-4 * L0), TOL_A = 0.5
    for (const m of mates) {
      const MA = worldMatrixOf(m.aComp, pose.get(m.aComp)!.pos, pose.get(m.aComp)!.rot)
      const MB = worldMatrixOf(m.bComp, pose.get(m.bComp)!.pos, pose.get(m.bComp)!.rot)
      const r = mateResidual(transformFace(m.aFace, MA), transformFace(m.bFace, MB), { flip: m.flip, gap: m.gap })
      mateErrors[m.id] = r
      if (r.dist > TOL_D || r.angle > TOL_A) conflictingIds.push(m.id)
    }
    const posOut = new Map<string, [number, number, number]>(), rotOut = new Map<string, [number, number, number]>()
    for (const c of comps) { const p = pose.get(c.id)!; posOut.set(c.id, [...p.pos]); rotOut.set(c.id, [...p.rot]) }
    return { pos: posOut, rot: rotOut, mateErrors, conflictingIds, mobility, ok, iters: it, residual: res, warning }
  }

  let res = Infinity, it = 0, worse = 0, prevRes = Infinity
  if (n === 0) { const R = computeR(); res = R.reduce((mx, v) => Math.max(mx, Math.abs(v)), 0); return finish(res < tol * 10) }
  for (; it < iters; it++) {
    const R = computeR()
    if (!isFin(R)) { revert(); return finish(false, '残差非有限（几何退化）— 已还原求解前姿态') }
    const maxr = R.reduce((mx, v) => Math.max(mx, Math.abs(v)), 0)
    res = maxr
    if (maxr < tol) break
    if (maxr > prevRes + 1e-12) { if (++worse >= 3) { revert(); return finish(false, '发散（残差连升 3 次）— 已还原求解前姿态（约束可能矛盾）') } } else worse = 0
    prevRes = maxr
    const mR = R.length
    const J: number[][] = Array.from({ length: mR }, () => new Array(n).fill(0))
    for (const id of free) {
      const c0 = colOf.get(id)!
      for (let k = 0; k < 6; k++) {
        const h = k < 3 ? Math.max(1e-4 * L0, 1e-5) : 1e-3
        const o = gp(id, k); sp(id, k, o + h)
        const Rp = computeR(); sp(id, k, o)
        for (let e = 0; e < mR; e++) J[e][c0 + k] = (Rp[e] - R[e]) / h
      }
    }
    const JTJ: number[][] = Array.from({ length: n }, () => new Array(n).fill(0))
    const JTr = new Array(n).fill(0)
    for (let e = 0; e < mR; e++) for (let a = 0; a < n; a++) { const ja = J[e][a]; if (ja === 0) continue; JTr[a] += ja * R[e]; for (let b = 0; b < n; b++) JTJ[a][b] += ja * J[e][b] }
    let maxDiag = 0; for (let d = 0; d < n; d++) maxDiag = Math.max(maxDiag, JTJ[d][d])
    const lam = Math.max(1e-9, 1e-6 * maxDiag)
    for (let d = 0; d < n; d++) JTJ[d][d] += lam
    const delta = gaussSolve(JTJ, JTr.map((v) => -v))
    if (!delta || !isFin(delta)) { revert(); return finish(false, '奇异 / 非有限步长 — 已还原求解前姿态') }
    let maxT = 0, maxRo = 0
    for (const id of free) { const c0 = colOf.get(id)!; for (let k = 0; k < 3; k++) maxT = Math.max(maxT, Math.abs(delta[c0 + k])); for (let k = 3; k < 6; k++) maxRo = Math.max(maxRo, Math.abs(delta[c0 + k])) }
    const scale = Math.min(maxT > L0 ? L0 / maxT : 1, maxRo > 15 ? 15 / maxRo : 1)   // step cap: ≤L0 mm / ≤15° per iter
    for (const id of free) { const c0 = colOf.get(id)!; for (let k = 0; k < 6; k++) sp(id, k, gp(id, k) + scale * delta[c0 + k]) }
  }
  for (const [, v] of pose) if (!isFin(v.pos) || !isFin(v.rot)) { revert(); return finish(false, '姿态非有限 — 已还原求解前姿态') }
  return finish(res < tol * 10)
}
