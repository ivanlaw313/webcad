// Aero Design Lab — streamlined axisymmetric body / product shell drag estimator.
// Hoerner fineness-ratio method (turbulent skin friction × form factor on wetted area) + base drag
// for blunt tails + an empirical aft-body separation penalty for steep boat-tails.
// Fast (µs) screening for the optimizer; "accurate mode" can hand the revolved mesh to the in-browser
// LBM wind tunnel. ENGINEERING ESTIMATE, not CFD.
import { fluidOf, skinFrictionTurbulent, type AeroFluidKind } from './fluids'

export interface ShellGeom {
  length: number        // m
  diameter: number      // m (max)
  xMax: number          // position of max diameter, fraction of length (0.2..0.6)
  noseExp: number       // 1 = cone … 2 = ellipse … 3+ = blunt/full nose
  tailExp: number       // 1 = cone … 2 = parabolic … 3 = full tail
  baseFrac: number      // base (tail) diameter / max diameter, 0 = pointed
}
export interface ShellOp { V: number; fluid?: AeroFluidKind; wall?: number; wallDensity?: number }
export interface ShellResult {
  drag: number; CD: number; CDwet: number; CDbase: number; CDsep: number
  re: number; fineness: number
  volume: number; wetted: number; frontal: number
  maxTailAngle: number   // deg
  mass: number           // kg (thin shell proxy)
}

/** Radius at axial station x ∈ [0, L]. */
export function shellRadius(g: ShellGeom, x: number): number {
  const L = g.length, R = g.diameter / 2, xm = Math.min(0.9, Math.max(0.05, g.xMax)) * L
  if (x <= 0) return 0
  if (x >= L) return R * Math.max(0, g.baseFrac)
  if (x <= xm) {
    const xi = x / xm
    const p = Math.max(0.5, g.noseExp)
    return R * Math.pow(Math.max(0, 1 - Math.pow(1 - xi, p)), 1 / p)
  }
  const eta = (x - xm) / (L - xm)
  const rb = R * Math.max(0, Math.min(1, g.baseFrac))
  const q = Math.max(0.5, g.tailExp)
  return rb + (R - rb) * (1 - Math.pow(eta, q))
}

/** Sampled profile (x, r) with n+1 points, cosine-clustered at both ends. */
export function shellProfile(g: ShellGeom, n = 64): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i <= n; i++) {
    const x = g.length * 0.5 * (1 - Math.cos(Math.PI * i / n))
    out.push([x, shellRadius(g, x)])
  }
  return out
}

export function analyzeShell(g: ShellGeom, op: ShellOp): ShellResult {
  const fl = fluidOf(op.fluid)
  const pr = shellProfile(g, 160)
  let vol = 0, wet = 0, maxAng = 0
  const xm = g.xMax * g.length
  for (let i = 0; i < pr.length - 1; i++) {
    const [x0, r0] = pr[i], [x1, r1] = pr[i + 1]
    const dx = x1 - x0
    vol += Math.PI / 3 * dx * (r0 * r0 + r0 * r1 + r1 * r1)
    wet += Math.PI * (r0 + r1) * Math.hypot(dx, r1 - r0)
    if (x0 >= xm && dx > 1e-12) maxAng = Math.max(maxAng, Math.atan2(r0 - r1, dx) * 180 / Math.PI)
  }
  const R = g.diameter / 2
  const Af = Math.PI * R * R
  const re = fl.rho * op.V * g.length / fl.mu
  const cf = skinFrictionTurbulent(re)
  const dl = g.diameter / g.length
  const CDwet = cf * (1 + 1.5 * Math.pow(dl, 1.5) + 7 * Math.pow(dl, 3))
  const CDfFront = CDwet * wet / Af
  const bf = Math.max(0, Math.min(1, g.baseFrac))
  const CDbase = bf > 0.02 ? 0.029 * Math.pow(bf, 3) / Math.sqrt(Math.max(CDfFront, 1e-4)) : 0   // on frontal area
  // steep boat-tail separation (empirical; smooth onset beyond ~14° local slope)
  const CDsep = maxAng > 14 ? Math.min(0.6, 0.35 * Math.pow((maxAng - 14) / 30, 2)) : 0
  // blunt/flat nose penalty for very blunt (noseExp>3) forms – extra stagnation-region losses
  const CDnose = g.noseExp > 3 ? 0.01 * (g.noseExp - 3) : 0
  const CD = CDfFront + CDbase + CDsep + CDnose
  const drag = 0.5 * fl.rho * op.V * op.V * CD * Af
  const wall = op.wall ?? 0.002, wd = op.wallDensity ?? 1240
  return {
    drag, CD, CDwet, CDbase, CDsep,
    re, fineness: g.length / g.diameter,
    volume: vol, wetted: wet, frontal: Af,
    maxTailAngle: maxAng, mass: wet * wall * wd,
  }
}
