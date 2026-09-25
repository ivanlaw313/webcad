// Aero Design Lab — finite wing by vortex-lattice (Weissinger: one chordwise horseshoe per strip,
// bound vortex on the ¼-chord line, control point on the ¾-chord line). Handles taper, sweep,
// dihedral, linear twist, camber (via section zero-lift angle) and elliptic planforms.
// Induced drag by Trefftz-plane analysis; profile drag by strip integration of the section polar.
// ENGINEERING ESTIMATE (potential flow + empirical polar), not CFD.
import { makeNacaPolar, polarAt, solveLinear, type NacaSpec } from './airfoil'
import { fluidOf, type AeroFluidKind } from './fluids'

export interface WingGeom {
  span: number          // m, tip to tip
  rootChord: number     // m
  taper: number         // tip chord / root chord (trapezoid)
  sweepLE: number       // deg, leading-edge sweep
  dihedral: number      // deg
  twistTip: number      // deg, linear from root (0) to tip; negative = washout
  planform?: 'trapezoid' | 'elliptic'
  airfoil: NacaSpec
}
export interface WingOp {
  V: number                     // m/s
  fluid?: AeroFluidKind
  alphaDeg?: number             // root-chord angle of attack
  targetLiftN?: number          // if set, α is trimmed to produce this lift
  nSemi?: number                // strips per semi-span (default 14)
}
export interface WingResult {
  alphaDeg: number
  CL: number; CDi: number; CD0: number; CD: number
  LD: number; e: number
  lift: number; drag: number
  S: number; AR: number; mac: number
  re: number                    // Re on mean chord
  stalled: boolean; maxClRatio: number
  span: { y: number; cl: number; chord: number; load: number }[]
}

type V3 = [number, number, number]
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const norm = (a: V3) => Math.hypot(a[0], a[1], a[2])

/** Biot–Savart: unit-strength straight segment P1→P2, velocity at P. */
function segVel(P: V3, P1: V3, P2: V3): V3 {
  const r1 = sub(P, P1), r2 = sub(P, P2), r0 = sub(P2, P1)
  const c = cross(r1, r2)
  const c2 = dot(c, c)
  const n1 = norm(r1), n2 = norm(r2)
  // vortex core: perpendicular distance² = c2/|r0|² below (1e-7·|P1|-scale)² → treat as on the line
  if (c2 < 1e-14 * dot(r0, r0) || n1 < 1e-12 || n2 < 1e-12) return [0, 0, 0]
  const k = dot(r0, [r1[0] / n1 - r2[0] / n2, r1[1] / n1 - r2[1] / n2, r1[2] / n1 - r2[2] / n2]) / (4 * Math.PI * c2)
  return [c[0] * k, c[1] * k, c[2] * k]
}

export interface WingLattice {
  A: V3[]; B: V3[]; C: V3[]; N: V3[]; chord: number[]; ds: number[]; ymid: number[]; S: number; b: number
  alpha0: number[]
}

export function chordAt(g: WingGeom, s: number): number {
  const eta = Math.min(1, Math.abs(s) / (g.span / 2))
  if (g.planform === 'elliptic') return Math.max(g.rootChord * Math.sqrt(Math.max(0, 1 - eta * eta)), 1e-4 * g.rootChord)
  return g.rootChord * (1 - (1 - g.taper) * eta)
}
/** Leading-edge x at semi-span station s (m). Elliptic planform keeps a straight ¼-chord line. */
export function leAt(g: WingGeom, s: number): number {
  const a = Math.abs(s)
  const sw = Math.tan(g.sweepLE * Math.PI / 180) * a
  if (g.planform === 'elliptic') return g.rootChord / 4 - chordAt(g, s) / 4 + sw
  return sw
}

export function buildLattice(g: WingGeom, nSemi = 14): WingLattice {
  const half = g.span / 2
  const ys: number[] = []
  const n = Math.max(4, Math.round(nSemi))
  for (let k = -n; k <= n; k++) ys.push(half * Math.sin((Math.PI / 2) * k / n))   // cosine spacing, dense at tips
  const dih = Math.tan(g.dihedral * Math.PI / 180)
  const pt = (y: number, frac: number): V3 => { const c = chordAt(g, y); return [leAt(g, y) + frac * c, y, Math.abs(y) * dih] }
  const polarR = makeNacaPolar(g.airfoil)
  const A: V3[] = [], B: V3[] = [], C: V3[] = [], N: V3[] = [], chord: number[] = [], ds: number[] = [], ymid: number[] = [], alpha0: number[] = []
  let S = 0
  for (let j = 0; j < ys.length - 1; j++) {
    // control station at the mid-ANGLE of the cosine distribution (not the geometric midpoint) —
    // the standard pairing for sine-spaced vortex lattices; converges to lifting-line / Helmbold values.
    const y0 = ys[j], y1 = ys[j + 1], ym = half * Math.sin((Math.PI / 2) * (j - n + 0.5) / n)
    const a = pt(y0, 0.25), bb = pt(y1, 0.25), cp = pt(ym, 0.75)
    // chord at strip centre; for elliptic use the exact chord at mid
    const c = chordAt(g, ym)
    const twist = g.twistTip * Math.abs(ym) / half * Math.PI / 180
    const th = twist - polarR.alpha0          // effective incidence of the zero-lift line
    const e = sub([0, y1, Math.abs(y1) * dih], [0, y0, Math.abs(y0) * dih])
    const el = norm(e)
    const eu: V3 = [0, e[1] / el, e[2] / el]
    const ch: V3 = [Math.cos(th), 0, -Math.sin(th)]
    const nn = cross(ch, eu)
    const nl = norm(nn)
    A.push(a); B.push(bb); C.push(cp); N.push([nn[0] / nl, nn[1] / nl, nn[2] / nl])
    chord.push(c); ds.push(el); ymid.push(ym); alpha0.push(polarR.alpha0)
    S += c * (y1 - y0)
  }
  return { A, B, C, N, chord, ds, ymid, S, b: g.span, alpha0 }
}

/** Influence matrix: normal velocity at control point i from unit horseshoe j. */
function influence(L: WingLattice): number[][] {
  const far = 1000 * L.b
  const n = L.A.length
  const M: number[][] = []
  for (let i = 0; i < n; i++) {
    const row = new Array<number>(n)
    const P = L.C[i]
    for (let j = 0; j < n; j++) {
      const a = L.A[j], b = L.B[j]
      const aInf: V3 = [a[0] + far, a[1], a[2]], bInf: V3 = [b[0] + far, b[1], b[2]]
      const v1 = segVel(P, aInf, a), v2 = segVel(P, a, b), v3 = segVel(P, b, bInf)
      row[j] = dot([v1[0] + v2[0] + v3[0], v1[1] + v2[1] + v3[1], v1[2] + v2[2] + v3[2]], L.N[i])
    }
    M.push(row)
  }
  return M
}

interface Solved { gamma: number[]; CL: number; CDi: number }
function solveAt(L: WingLattice, M: number[][], alpha: number): Solved {
  const n = L.A.length
  const Vinf: V3 = [Math.cos(alpha), 0, Math.sin(alpha)]
  const gamma = solveLinear(M.map((r) => r.slice()), L.N.map((nn) => -dot(Vinf, nn)))
  // Kutta–Joukowski on bound segments (ρ = V = 1)
  const liftDir: V3 = [-Math.sin(alpha), 0, Math.cos(alpha)]
  let lift = 0
  for (let j = 0; j < n; j++) lift += gamma[j] * dot(cross(Vinf, sub(L.B[j], L.A[j])), liftDir)
  // Trefftz plane: 2D trailing vortices at strip edges (y,z)
  const ey: number[] = [], ez: number[] = [], G: number[] = []
  for (let k = 0; k <= n; k++) {
    const p = k < n ? L.A[k] : L.B[n - 1]
    ey.push(p[1]); ez.push(p[2])
    G.push((k > 0 ? gamma[k - 1] : 0) - (k < n ? gamma[k] : 0))
  }
  let Di = 0
  for (let j = 0; j < n; j++) {
    const my = L.C[j][1], mz = L.C[j][2]   // same (mid-angle) station as the control point
    let vy = 0, vz = 0
    for (let k = 0; k <= n; k++) {
      const dy = my - ey[k], dz = mz - ez[k]
      const r2 = dy * dy + dz * dz
      if (r2 < 1e-18) continue
      vy += G[k] / (2 * Math.PI * r2) * -dz
      vz += G[k] / (2 * Math.PI * r2) * dy
    }
    const nyz = L.N[j]
    const nl = Math.hypot(nyz[1], nyz[2]) || 1
    const w = -(vy * nyz[1] + vz * nyz[2]) / nl      // downwash (positive down)
    Di += 0.5 * gamma[j] * w * L.ds[j]
  }
  return { gamma, CL: lift / (0.5 * L.S), CDi: Di / (0.5 * L.S) }
}

export function analyzeWing(g: WingGeom, op: WingOp): WingResult {
  const fl = fluidOf(op.fluid)
  const L = buildLattice(g, op.nSemi ?? 14)
  const M = influence(L)
  const q = 0.5 * fl.rho * op.V * op.V
  let alpha = (op.alphaDeg ?? 4) * Math.PI / 180
  let sol = solveAt(L, M, alpha)
  if (op.targetLiftN !== undefined && op.targetLiftN > 0) {
    const CLt = op.targetLiftN / (q * L.S)
    // secant on α (lift is almost linear in α)
    let a0 = 0, s0 = solveAt(L, M, 0)
    let a1 = 5 * Math.PI / 180, s1 = solveAt(L, M, a1)
    for (let it = 0; it < 6; it++) {
      const d = s1.CL - s0.CL
      if (Math.abs(d) < 1e-12) break
      const a2 = Math.max(-0.35, Math.min(0.5, a1 + (CLt - s1.CL) * (a1 - a0) / d))
      a0 = a1; s0 = s1; a1 = a2; s1 = solveAt(L, M, a1)
      if (Math.abs(s1.CL - CLt) < 1e-5) break
    }
    alpha = a1; sol = s1
  }
  // profile drag: strip polar at local cl
  const pol = makeNacaPolar(g.airfoil)
  let cd0S = 0, maxRatio = 0, stalled = false
  const spanOut: WingResult['span'] = []
  for (let j = 0; j < L.A.length; j++) {
    const c = L.chord[j]
    const cl = 2 * sol.gamma[j] / c
    const re = fl.rho * op.V * c / fl.mu
    const aEff = pol.alpha0 + cl / pol.cla
    const pp = polarAt(pol, aEff, re)
    const clmax = pol.clmaxRef * Math.min(1.05, Math.max(0.6, Math.pow(Math.max(re, 2e3) / 1e6, 0.08)))
    maxRatio = Math.max(maxRatio, Math.abs(cl) / clmax)
    if (pp.stalled) stalled = true
    const dy = Math.abs(L.B[j][1] - L.A[j][1])
    cd0S += pp.cd * c * dy
    spanOut.push({ y: L.ymid[j], cl, chord: c, load: cl * c })
  }
  const CD0 = cd0S / L.S
  const CD = sol.CDi + CD0
  const AR = g.span * g.span / L.S
  const e = sol.CDi > 1e-12 ? sol.CL * sol.CL / (Math.PI * AR * sol.CDi) : 1
  const mac = L.S / g.span
  const cavg = mac
  for (const s of spanOut) s.load /= cavg
  return {
    alphaDeg: alpha * 180 / Math.PI,
    CL: sol.CL, CDi: sol.CDi, CD0, CD,
    LD: CD > 0 ? sol.CL / CD : 0, e,
    lift: sol.CL * q * L.S, drag: CD * q * L.S,
    S: L.S, AR, mac, re: fl.rho * op.V * mac / fl.mu,
    stalled, maxClRatio: maxRatio, span: spanOut,
  }
}

/** Helmbold lift-curve slope (per rad) for an unswept wing, section slope a0 (default 2π). */
export const helmbold = (AR: number, a0 = 2 * Math.PI): number =>
  a0 / (Math.sqrt(1 + (a0 / (Math.PI * AR)) ** 2) + a0 / (Math.PI * AR))
