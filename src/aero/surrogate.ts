// Aero Design Lab — small Gaussian-process surrogate for the CFD correction residual
// y = log(CFD / estimate) over normalised design variables u ∈ [0,1]^d.
//  · constant mean (= mean of y) + isotropic RBF kernel + noise; pure TS, JSON-serialisable.
//  · 0 points → identity (y ≡ 0); 1 point → that constant everywhere; 2+ points → GP on residuals.
//  · hyper-parameters: fixed sensible defaults for n < 5, small grid search on the log marginal
//    likelihood for n ≥ 5. Predictions are clamped to |y| ≤ Y_CLAMP so a bad CFD run can never
//    turn the optimiser's objective into nonsense.

export interface Surrogate {
  n: number
  d: number
  X: number[][]
  mean: number
  ls: number          // RBF length scale (in normalised units)
  sf2: number         // signal variance
  sn2: number         // noise variance
  alpha: number[]     // K⁻¹ (y − mean)
  L: number[][]       // Cholesky factor of K (lower), for the predictive variance
}

export const Y_CLAMP = 2.5   // factor range e^±2.5 ≈ ×0.08 … ×12

const sq = (a: number[], b: number[]): number => { let s = 0; for (let i = 0; i < a.length; i++) { const d = (a[i] ?? 0) - (b[i] ?? 0); s += d * d } return s }

/** Cholesky with growing jitter; returns null only if the matrix is hopeless. */
function cholesky(K: number[][]): number[][] | null {
  const n = K.length
  for (let jit = 0, tries = 0; tries < 6; tries++, jit = jit ? jit * 10 : 1e-10) {
    const L = K.map(() => new Array(n).fill(0))
    let ok = true
    for (let i = 0; i < n && ok; i++) {
      for (let j = 0; j <= i; j++) {
        let s = K[i][j] + (i === j ? jit : 0)
        for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k]
        if (i === j) { if (!(s > 0)) { ok = false; break } L[i][i] = Math.sqrt(s) }
        else L[i][j] = s / L[j][j]
      }
    }
    if (ok) return L
  }
  return null
}
const fwd = (L: number[][], b: number[]): number[] => { const n = b.length, x = new Array(n).fill(0); for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i][k] * x[k]; x[i] = s / L[i][i] } return x }
const bwd = (L: number[][], b: number[]): number[] => { const n = b.length, x = new Array(n).fill(0); for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k]; x[i] = s / L[i][i] } return x }

function build(X: number[][], r: number[], ls: number, sf2: number, sn2: number): { L: number[][]; alpha: number[]; nll: number } | null {
  const n = X.length
  const K = X.map((a, i) => X.map((b, j) => sf2 * Math.exp(-sq(a, b) / (2 * ls * ls)) + (i === j ? sn2 : 0)))
  const L = cholesky(K)
  if (!L) return null
  const alpha = bwd(L, fwd(L, r))
  let logdet = 0
  for (let i = 0; i < n; i++) logdet += Math.log(L[i][i])
  const nll = 0.5 * r.reduce((s, v, i) => s + v * alpha[i], 0) + logdet + 0.5 * n * Math.log(2 * Math.PI)
  return { L, alpha, nll }
}

export interface FitOptions { ls?: number; noiseRatio?: number }

/** Fit y(u). Non-finite samples are dropped; y is clamped to ±Y_CLAMP. */
export function fitSurrogate(Xin: number[][], yin: number[], opts: FitOptions = {}): Surrogate {
  const X: number[][] = [], y: number[] = []
  for (let i = 0; i < Math.min(Xin.length, yin.length); i++) {
    if (Number.isFinite(yin[i]) && Xin[i]?.every(Number.isFinite)) { X.push(Xin[i].slice()); y.push(Math.max(-Y_CLAMP, Math.min(Y_CLAMP, yin[i]))) }
  }
  const n = y.length
  const d = X[0]?.length ?? Xin[0]?.length ?? 0
  if (n === 0) return { n: 0, d, X: [], mean: 0, ls: 1, sf2: 0, sn2: 1, alpha: [], L: [] }
  const mean = y.reduce((s, v) => s + v, 0) / n
  const r = y.map((v) => v - mean)
  if (n === 1) return { n, d, X, mean, ls: 1, sf2: 0, sn2: 1, alpha: [0], L: [[1]] }
  const v = r.reduce((s, x) => s + x * x, 0) / n
  // signal variance: data spread, floored so a GP with near-identical samples still has some prior width
  const sf2 = Math.max(v, 0.02 * 0.02)
  const lsDefault = opts.ls ?? 0.35 * Math.sqrt(Math.max(1, d))
  const nrDefault = opts.noiseRatio ?? 0.05
  let best: { ls: number; sn2: number; fit: NonNullable<ReturnType<typeof build>> } | null = null
  const grid = n >= 5 && opts.ls === undefined
    ? [0.12, 0.2, 0.3, 0.45, 0.7, 1.0, 1.6].map((f) => f * Math.sqrt(Math.max(1, d)))
    : [lsDefault]
  const noiseGrid = n >= 5 && opts.noiseRatio === undefined ? [1e-3, 1e-2, 0.05, 0.2] : [nrDefault]
  for (const ls of grid) for (const nr of noiseGrid) {
    const sn2 = sf2 * nr + 1e-8
    const f = build(X, r, ls, sf2, sn2)
    if (f && Number.isFinite(f.nll) && (!best || f.nll < best.fit.nll)) best = { ls, sn2, fit: f }
  }
  if (!best) return { n, d, X, mean, ls: lsDefault, sf2: 0, sn2: 1, alpha: new Array(n).fill(0), L: X.map((_, i) => X.map((__, j) => (i === j ? 1 : 0))) }
  return { n, d, X, mean, ls: best.ls, sf2, sn2: best.sn2, alpha: best.fit.alpha, L: best.fit.L }
}

/** Predictive mean (clamped) and standard deviation of y at u. */
export function predictSurrogate(m: Surrogate, u: number[]): { mean: number; std: number } {
  if (!m || m.n === 0) return { mean: 0, std: 1 }
  if (m.sf2 <= 0) return { mean: Math.max(-Y_CLAMP, Math.min(Y_CLAMP, m.mean)), std: m.n === 1 ? 0.3 : 0.2 }
  const k = m.X.map((x) => m.sf2 * Math.exp(-sq(x, u) / (2 * m.ls * m.ls)))
  let mu = m.mean
  for (let i = 0; i < k.length; i++) mu += k[i] * m.alpha[i]
  const w = fwd(m.L, k)
  const varr = Math.max(0, m.sf2 - w.reduce((s, x) => s + x * x, 0))
  if (!Number.isFinite(mu)) mu = m.mean
  return { mean: Math.max(-Y_CLAMP, Math.min(Y_CLAMP, mu)), std: Math.sqrt(varr) }
}
