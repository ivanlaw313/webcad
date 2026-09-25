// Aero Design Lab — 2D airfoils.
//  · NACA 4-digit generator (symmetric + cambered), cosine spacing, closed trailing edge.
//  · Hess–Smith panel method (constant source per panel + uniform vortex, Kutta condition) → Cl, Cp.
//  · Thin-airfoil zero-lift angle.
//  · Engineering polar: linear lift curve + Re-dependent drag polar (Hoerner form factor × skin friction
//    + k·(Cl−Cl_md)²) + smooth stall to flat-plate post-stall. These are ENGINEERING ESTIMATES, not CFD.
import { skinFriction } from './fluids'

export interface NacaSpec { m: number; p: number; t: number }   // fractions of chord (2412 → m .02, p .4, t .12)

export function parseNaca4(code: string): NacaSpec | null {
  const s = String(code).replace(/^naca\s*/i, '').trim()
  if (!/^\d{4}$/.test(s)) return null
  const m = Number(s[0]) / 100, p = Number(s[1]) / 10, t = Number(s.slice(2)) / 100
  if (t <= 0) return null
  return { m, p: m > 0 ? (p || 0.4) : 0, t }
}
export const nacaName = (a: NacaSpec): string =>
  `NACA ${Math.round(a.m * 100)}${Math.round(a.p * 10)}${String(Math.round(a.t * 100)).padStart(2, '0')}`

export function nacaCamber(a: NacaSpec, x: number): { yc: number; dyc: number } {
  const { m, p } = a
  if (m <= 0 || p <= 0 || p >= 1) return { yc: 0, dyc: 0 }
  if (x < p) return { yc: m / (p * p) * (2 * p * x - x * x), dyc: 2 * m / (p * p) * (p - x) }
  const q = (1 - p) * (1 - p)
  return { yc: m / q * ((1 - 2 * p) + 2 * p * x - x * x), dyc: 2 * m / q * (p - x) }
}

export const nacaThickness = (t: number, x: number): number =>
  5 * t * (0.2969 * Math.sqrt(Math.max(x, 0)) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4)   // closed TE

/**
 * NACA 4-digit coordinates, unit chord. Ordered TE → lower surface → LE → upper surface → TE
 * (clockwise; first and last point coincide at the sharp TE). nSide = points per surface.
 */
export function nacaCoords(a: NacaSpec, nSide = 60): [number, number][] {
  const xs: number[] = []
  for (let i = 0; i <= nSide; i++) xs.push(0.5 * (1 - Math.cos(Math.PI * i / nSide)))   // 0 → 1
  const upper: [number, number][] = [], lower: [number, number][] = []
  for (const x of xs) {
    const { yc, dyc } = nacaCamber(a, x)
    const yt = nacaThickness(a.t, x)
    const th = Math.atan(dyc)
    upper.push([x - yt * Math.sin(th), yc + yt * Math.cos(th)])
    lower.push([x + yt * Math.sin(th), yc - yt * Math.cos(th)])
  }
  const pts: [number, number][] = []
  for (let i = lower.length - 1; i >= 0; i--) pts.push(lower[i])   // TE → LE along lower
  for (let i = 1; i < upper.length; i++) pts.push(upper[i])        // LE → TE along upper
  // close exactly
  pts[pts.length - 1] = [pts[0][0], pts[0][1]]
  return pts
}

/** Thin-airfoil zero-lift angle (rad): α0 = −(1/π)∫ dyc/dx (cosθ − 1) dθ. */
export function thinAirfoilAlpha0(a: NacaSpec): number {
  const n = 400
  let s = 0
  for (let i = 0; i < n; i++) {
    const th = Math.PI * (i + 0.5) / n
    const x = 0.5 * (1 - Math.cos(th))
    s += nacaCamber(a, x).dyc * (Math.cos(th) - 1)
  }
  return -s * (Math.PI / n) / Math.PI
}

// ── Hess–Smith panel method ──────────────────────────────────────────────────
export interface PanelResult { cl: number; cp: number[]; xc: number[]; yc: number[]; gamma: number }

function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length
  for (let c = 0; c < n; c++) {
    let piv = c
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r
    if (piv !== c) { const t = A[c]; A[c] = A[piv]; A[piv] = t; const tb = b[c]; b[c] = b[piv]; b[piv] = tb }
    const d = A[c][c]
    if (Math.abs(d) < 1e-14) throw new Error('panel method: singular matrix')
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / d
      if (f === 0) continue
      const Ar = A[r], Ac = A[c]
      for (let k = c; k < n; k++) Ar[k] -= f * Ac[k]
      b[r] -= f * b[c]
    }
  }
  const x = new Array<number>(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r]
    for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k]
    x[r] = s / A[r][r]
  }
  return x
}
export { solveLinear }

/** Inviscid Hess–Smith solution at angle of attack alpha (rad), unit chord, V∞ = 1. */
export function panelSolve(coords: [number, number][], alpha: number): PanelResult {
  const N = coords.length - 1
  const tx: number[] = [], ty: number[] = [], L: number[] = [], cx: number[] = [], cy: number[] = []
  for (let j = 0; j < N; j++) {
    const dx = coords[j + 1][0] - coords[j][0], dy = coords[j + 1][1] - coords[j][1]
    const l = Math.hypot(dx, dy)
    L.push(l); tx.push(dx / l); ty.push(dy / l)
    cx.push(0.5 * (coords[j][0] + coords[j + 1][0])); cy.push(0.5 * (coords[j][1] + coords[j + 1][1]))
  }
  // influence: source (us,vs) and vortex velocities in GLOBAL coords at control point i from panel j
  const Sx: number[][] = [], Sy: number[][] = [], Vx: number[][] = [], Vy: number[][] = []
  for (let i = 0; i < N; i++) {
    Sx.push(new Array(N)); Sy.push(new Array(N)); Vx.push(new Array(N)); Vy.push(new Array(N))
    for (let j = 0; j < N; j++) {
      let lnr: number, beta: number
      if (i === j) { lnr = 0; beta = Math.PI }
      else {
        const rx = cx[i] - coords[j][0], ry = cy[i] - coords[j][1]
        const xl = rx * tx[j] + ry * ty[j], yl = -rx * ty[j] + ry * tx[j]
        const r1 = Math.hypot(rx, ry), r2 = Math.hypot(cx[i] - coords[j + 1][0], cy[i] - coords[j + 1][1])
        lnr = Math.log(r1 / r2)
        beta = Math.atan2(yl, xl - L[j]) - Math.atan2(yl, xl)
        if (beta > Math.PI) beta -= 2 * Math.PI
        else if (beta < -Math.PI) beta += 2 * Math.PI
      }
      const us = lnr / (2 * Math.PI), vs = beta / (2 * Math.PI)       // unit source, local
      const uv = vs, vv = -us                                          // unit clockwise vortex, local
      // local → global: V = u·t + v·n,  n = (−ty, tx)
      Sx[i][j] = us * tx[j] - vs * ty[j]; Sy[i][j] = us * ty[j] + vs * tx[j]
      Vx[i][j] = uv * tx[j] - vv * ty[j]; Vy[i][j] = uv * ty[j] + vv * tx[j]
    }
  }
  const ux = Math.cos(alpha), uy = Math.sin(alpha)
  const A: number[][] = [], b: number[] = []
  for (let i = 0; i < N; i++) {
    const nx = -ty[i], ny = tx[i]
    const row = new Array<number>(N + 1).fill(0)
    let g = 0
    for (let j = 0; j < N; j++) { row[j] = Sx[i][j] * nx + Sy[i][j] * ny; g += Vx[i][j] * nx + Vy[i][j] * ny }
    row[N] = g
    A.push(row); b.push(-(ux * nx + uy * ny))
  }
  // Kutta: tangential velocity at first + last panel sum to zero (panels point opposite ways at TE)
  const krow = new Array<number>(N + 1).fill(0)
  let kg = 0
  for (const i of [0, N - 1]) {
    for (let j = 0; j < N; j++) { krow[j] += Sx[i][j] * tx[i] + Sy[i][j] * ty[i]; kg += Vx[i][j] * tx[i] + Vy[i][j] * ty[i] }
  }
  krow[N] = kg
  A.push(krow); b.push(-((ux * tx[0] + uy * ty[0]) + (ux * tx[N - 1] + uy * ty[N - 1])))
  const sol = solveLinear(A, b)
  const gamma = sol[N]
  const cp: number[] = []
  for (let i = 0; i < N; i++) {
    let vt = ux * tx[i] + uy * ty[i]
    for (let j = 0; j < N; j++) vt += sol[j] * (Sx[i][j] * tx[i] + Sy[i][j] * ty[i]) + gamma * (Vx[i][j] * tx[i] + Vy[i][j] * ty[i])
    cp.push(1 - vt * vt)
  }
  const perim = L.reduce((s, v) => s + v, 0)
  return { cl: 2 * gamma * perim, cp, xc: cx, yc: cy, gamma }
}

/** Lift slope (per rad) and zero-lift angle (rad) from two panel solutions. */
export function panelLiftCurve(a: NacaSpec, nSide = 60): { cla: number; alpha0: number } {
  const c = nacaCoords(a, nSide)
  const a1 = -2 * Math.PI / 180, a2 = 4 * Math.PI / 180
  const c1 = panelSolve(c, a1).cl, c2 = panelSolve(c, a2).cl
  const cla = (c2 - c1) / (a2 - a1)
  return { cla, alpha0: a1 - c1 / cla }
}

// ── Engineering polar ────────────────────────────────────────────────────────
export interface Polar {
  name: string
  t: number            // thickness / chord
  m: number            // camber / chord
  cla: number          // viscous lift slope per rad
  alpha0: number       // zero-lift angle rad
  clmaxRef: number     // Cl_max at Re = 1e6
}
export interface PolarPoint { cl: number; cd: number; stalled: boolean }

const polarCache = new Map<string, Polar>()
/** Build a polar for a NACA 4-digit section. usePanel → Hess–Smith slope/α0 (×0.92 viscous factor). */
export function makeNacaPolar(a0: NacaSpec, usePanel = true): Polar {
  // quantise first so the cache is exact (results independent of evaluation order → deterministic runs)
  const a: NacaSpec = { m: Math.round(a0.m * 1e4) / 1e4, p: Math.round(a0.p * 1e3) / 1e3, t: Math.round(a0.t * 1e4) / 1e4 }
  const key = `${a.m}|${a.p}|${a.t}|${usePanel}`
  const hit = polarCache.get(key)
  if (hit) return hit
  let cla: number, alpha0: number
  if (usePanel) {
    const lc = panelLiftCurve(a, 40)
    cla = lc.cla * 0.92; alpha0 = lc.alpha0
  } else {
    cla = 2 * Math.PI * (1 + 0.77 * a.t) * 0.92; alpha0 = thinAirfoilAlpha0(a)
  }
  const tf = 0.8 + 1.7 * Math.min(a.t, 0.12) - 1.5 * Math.max(0, a.t - 0.15)   // thin sections stall early
  const clmaxRef = (1.25 + 8 * a.m) * tf
  const pol: Polar = { name: nacaName(a), t: a.t, m: a.m, cla, alpha0, clmaxRef }
  if (polarCache.size > 400) polarCache.clear()
  polarCache.set(key, pol)
  return pol
}

/** Section Cl/Cd at angle alpha (rad) and chord Reynolds number re. */
export function polarAt(p: Polar, alpha: number, re: number): PolarPoint {
  const R = Math.max(re, 2e3)
  const reF = Math.min(1.05, Math.max(0.6, Math.pow(R / 1e6, 0.08)))
  const clmax = p.clmaxRef * reF
  const clmin = -(p.clmaxRef - 8 * p.m) * reF * 0.9
  const ff = 1 + 2 * p.t + 60 * p.t ** 4
  const bubble = R < 2e5 ? 0.008 * (Math.sqrt(2e5 / R) - 1) : 0
  const cd0 = 2 * skinFriction(R) * ff + Math.min(bubble, 0.05)
  const k = Math.min(0.03, 0.006 * Math.pow(1e6 / R, 0.3))
  const clmd = Math.min(0.5, 10 * p.m)
  const aHi = p.alpha0 + clmax / p.cla, aLo = p.alpha0 + clmin / p.cla
  const lin = (al: number) => p.cla * (al - p.alpha0)
  const cdLin = (cl: number) => cd0 + k * (cl - clmd) ** 2
  if (alpha <= aHi && alpha >= aLo) { const cl = lin(alpha); return { cl, cd: cdLin(cl), stalled: false } }
  // post-stall: exponential blend from stall point to flat plate
  const edge = alpha > aHi ? aHi : aLo
  const clEdge = alpha > aHi ? clmax : clmin
  const w = Math.exp(-Math.abs(alpha - edge) / (5 * Math.PI / 180))
  const clFp = 2 * Math.sin(alpha) * Math.cos(alpha)
  const cdFp = 1.9 * Math.sin(alpha) ** 2 + cd0
  const cdEdge = cdLin(clEdge) + 0.02
  return { cl: w * clEdge + (1 - w) * clFp, cd: w * cdEdge + (1 - w) * Math.max(cdFp, cdEdge), stalled: true }
}
