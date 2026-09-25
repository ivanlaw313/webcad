// Aero Design Lab — propeller / fan / marine thruster by Blade Element Momentum Theory.
// Robust single-unknown residual in the inflow angle φ (works for static thrust, V∞ = 0):
//   W_t = Ωr/(1+k'),  W_a = W_t·tanφ,  residual R(φ) = W_a·(1−k) − V∞
//   k  = σ'·Cn / (4F·sin²φ),   k' = σ'·Ct / (4F·sinφ·cosφ),   σ' = B·c/(2πr)
//   Cn = Cl·cosφ − Cd·sinφ (thrust), Ct = Cl·sinφ + Cd·cosφ (torque); α = θ − φ.
// Prandtl tip + hub loss. Blade sections use the engineering NACA polar (Re per station).
// ENGINEERING ESTIMATE (BEMT), not CFD.
import { makeNacaPolar, polarAt, type NacaSpec } from './airfoil'
import { fluidOf, type AeroFluidKind } from './fluids'

export interface PropGeom {
  diameter: number              // m
  hubDiameter: number           // m
  blades: number
  /** stations r/R ∈ (hub, 1] with chord (m) and geometric pitch angle θ (deg, from rotor plane) */
  stations: { rR: number; chord: number; twistDeg: number }[]
  airfoil: NacaSpec
}
export interface PropOp { rpm: number; V: number; fluid?: AeroFluidKind; nElem?: number }
export interface PropStation { r: number; chord: number; theta: number; phi: number; alpha: number; cl: number; cd: number; re: number; dT: number; dQ: number; F: number; stalled: boolean; mach: number }
export interface PropResult {
  thrust: number; torque: number; power: number
  CT: number; CP: number; CQ: number; J: number; eta: number
  FM: number                    // figure of merit (static/hover quality, 0..1)
  tipSpeed: number; tipMach: number
  stalledFrac: number
  stations: PropStation[]
}

/** Linear interpolation of a station distribution at r/R. */
export function interpStations(st: PropGeom['stations'], rR: number): { chord: number; twistDeg: number } {
  if (rR <= st[0].rR) return { chord: st[0].chord, twistDeg: st[0].twistDeg }
  for (let i = 1; i < st.length; i++) {
    if (rR <= st[i].rR) {
      const t = (rR - st[i - 1].rR) / (st[i].rR - st[i - 1].rR)
      return { chord: st[i - 1].chord + t * (st[i].chord - st[i - 1].chord), twistDeg: st[i - 1].twistDeg + t * (st[i].twistDeg - st[i - 1].twistDeg) }
    }
  }
  const l = st[st.length - 1]
  return { chord: l.chord, twistDeg: l.twistDeg }
}

/** Geometric pitch angle (deg) at radius r for a helical pitch P (same length units). */
export const pitchAngleDeg = (P: number, r: number): number => Math.atan2(P, 2 * Math.PI * r) * 180 / Math.PI

export function analyzeProp(g: PropGeom, op: PropOp): PropResult {
  const fl = fluidOf(op.fluid)
  const R = g.diameter / 2, Rh = Math.max(g.hubDiameter / 2, 0.02 * R)
  const B = Math.max(1, Math.round(g.blades))
  const n = op.rpm / 60, Om = 2 * Math.PI * n
  const V = Math.max(0, op.V)
  const pol = makeNacaPolar(g.airfoil)
  const N = Math.max(8, op.nElem ?? 24)
  const stations: PropStation[] = []
  let T = 0, Q = 0, stalledW = 0
  for (let i = 0; i < N; i++) {
    // cosine clustering toward tip & hub
    const s0 = 0.5 * (1 - Math.cos(Math.PI * i / N)), s1 = 0.5 * (1 - Math.cos(Math.PI * (i + 1) / N))
    const r0 = Rh + (R - Rh) * s0, r1 = Rh + (R - Rh) * s1
    const r = 0.5 * (r0 + r1), dr = r1 - r0
    const { chord: c, twistDeg } = interpStations(g.stations, r / R)
    const theta = twistDeg * Math.PI / 180
    const sig = B * c / (2 * Math.PI * r)
    const Ur = Om * r
    const evalPhi = (phi: number) => {
      const sp = Math.sin(phi), cp = Math.cos(phi)
      const fT = (B / 2) * (R - r) / (r * Math.abs(sp) + 1e-9)
      const fH = (B / 2) * (r - Rh) / (Rh * Math.abs(sp) + 1e-9)
      const Ftip = (2 / Math.PI) * Math.acos(Math.min(1, Math.exp(-fT)))
      const Fhub = (2 / Math.PI) * Math.acos(Math.min(1, Math.exp(-fH)))
      const F = Math.max(1e-4, Ftip * Fhub)
      // Re/Mach from the relative velocity estimated with current φ (one fixed-point pass is enough)
      const Wg = Ur / Math.max(cp, 1e-3)
      const re = fl.rho * Wg * c / fl.mu
      const alpha = theta - phi
      const pp = polarAt(pol, alpha, re)
      const Cn = pp.cl * cp - pp.cd * sp
      const Ct = pp.cl * sp + pp.cd * cp
      const k = sig * Cn / (4 * F * sp * sp)
      const kp = sig * Ct / (4 * F * sp * cp)
      const Wt = Ur / Math.max(1e-6, 1 + kp)
      const Wa = Wt * Math.tan(phi)
      return { res: Wa * (1 - k) - V, F, alpha, pp, Wa, Wt, re }
    }
    // bracket: scan φ from tiny to ~90°
    const lo0 = 1e-4, hi0 = Math.PI / 2 - 1e-4
    let a = lo0, fa = evalPhi(a).res, found = false, b = a, fb = fa
    const steps = 60
    for (let s = 1; s <= steps; s++) {
      const x = lo0 + (hi0 - lo0) * s / steps
      const fx = evalPhi(x).res
      if (Number.isFinite(fx) && Number.isFinite(fa) && fa * fx <= 0) { b = x; fb = fx; found = true; break }
      a = x; fa = fx
    }
    let phi: number
    if (found) {
      for (let it = 0; it < 50; it++) {   // bisection w/ secant step (Illinois-safe)
        const m = 0.5 * (a + b)
        const fm = evalPhi(m).res
        if (fa * fm <= 0) { b = m; fb = fm } else { a = m; fa = fm }
        if (b - a < 1e-9) break
      }
      phi = 0.5 * (a + b)
      void fb
    } else {
      phi = Math.atan2(V, Ur)   // windmill / no solution: geometric inflow, no induction
    }
    const ev = evalPhi(phi)
    const sp = Math.sin(phi), cph = Math.cos(phi)
    const W2 = ev.Wa * ev.Wa + ev.Wt * ev.Wt
    const qd = 0.5 * fl.rho * W2 * c
    const dT = B * qd * (ev.pp.cl * cph - ev.pp.cd * sp) * dr
    const dQ = B * qd * (ev.pp.cl * sp + ev.pp.cd * cph) * r * dr
    T += dT; Q += dQ
    if (ev.pp.stalled) stalledW += dr
    stations.push({ r, chord: c, theta: twistDeg, phi: phi * 180 / Math.PI, alpha: ev.alpha * 180 / Math.PI, cl: ev.pp.cl, cd: ev.pp.cd, re: ev.re, dT: dT / dr, dQ: dQ / dr, F: ev.F, stalled: ev.pp.stalled, mach: Math.sqrt(W2) / fl.a })
  }
  const P = Q * Om
  const D = g.diameter
  const CT = T / (fl.rho * n * n * D ** 4)
  const CP = P / (fl.rho * n ** 3 * D ** 5)
  const CQ = Q / (fl.rho * n * n * D ** 5)
  const J = V / (n * D)
  const eta = P > 1e-12 && T > 0 ? Math.min(0.999, T * V / P) : 0
  const A = Math.PI * R * R
  const FM = P > 1e-12 && T > 0 ? Math.min(0.999, Math.pow(T, 1.5) / (P * Math.sqrt(2 * fl.rho * A))) : 0
  const tipSpeed = Math.hypot(Om * R, V)
  return { thrust: T, torque: Q, power: P, CT, CP, CQ, J, eta, FM, tipSpeed, tipMach: tipSpeed / fl.a, stalledFrac: stalledW / (R - Rh), stations }
}

/** Convenience: a classic constant-pitch prop (e.g. APC-like 10×4.7) with a tapered chord. */
export function constantPitchProp(diameterIn: number, pitchIn: number, blades = 2, airfoil: NacaSpec = { m: 0.04, p: 0.4, t: 0.1 }): PropGeom {
  const D = diameterIn * 0.0254, P = pitchIn * 0.0254, R = D / 2
  const rRs = [0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1.0]
  const chordFrac = [0.14, 0.18, 0.19, 0.18, 0.155, 0.12, 0.08]   // c/R, typical sport prop
  return {
    diameter: D, hubDiameter: 0.12 * D, blades, airfoil,
    stations: rRs.map((rR, i) => ({ rR, chord: chordFrac[i] * R, twistDeg: pitchAngleDeg(P, rR * R) })),
  }
}
