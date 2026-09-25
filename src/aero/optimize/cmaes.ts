// Aero Design Lab — CMA-ES (µ/µ_w, λ) with full covariance (Hansen's tutorial settings),
// bounded to [0,1]^n by clipping + quadratic boundary penalty, feasibility-first ranking,
// deterministic seeded sampling.
import { makeRng } from '../rng'
import { soKey, type GenCallback, type Individual, type OptProblem } from './types'

export interface CmaesOptions {
  seed?: number
  maxEvals?: number
  sigma0?: number          // in normalised units (default 0.3)
  x0?: number[]            // normalised start (default centre)
  lambda?: number
  tolFun?: number
  onGen?: GenCallback
}
export interface CmaesResult { best: Individual; evals: number; gens: number; archive: Individual[]; history: { evals: number; f: number }[] }

/** Jacobi eigen-decomposition of a symmetric matrix. Returns eigenvalues d and eigenvectors (columns of B). */
export function jacobiEigen(A: number[][]): { d: number[]; B: number[][] } {
  const n = A.length
  const a = A.map((r) => r.slice())
  const V: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)))
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] * a[p][q]
    if (off < 1e-22) break
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q])
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
        const c = 1 / Math.sqrt(t * t + 1), s = t * c
        for (let k = 0; k < n; k++) {
          const akp = a[k][p], akq = a[k][q]
          a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k], aqk = a[q][k]
          a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k][p], vkq = V[k][q]
          V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq
        }
      }
    }
  }
  return { d: a.map((r, i) => r[i]), B: V }
}

export function runCmaes(prob: OptProblem, opt: CmaesOptions = {}): CmaesResult {
  const n = prob.n
  const rng = makeRng(opt.seed ?? 1)
  const maxEvals = opt.maxEvals ?? 1000 * n
  const lambda = opt.lambda ?? 4 + Math.floor(3 * Math.log(n))
  const mu = Math.floor(lambda / 2)
  const wRaw = Array.from({ length: mu }, (_, i) => Math.log(mu + 0.5) - Math.log(i + 1))
  const wSum = wRaw.reduce((s, v) => s + v, 0)
  const w = wRaw.map((v) => v / wSum)
  const mueff = 1 / w.reduce((s, v) => s + v * v, 0)
  const cc = (4 + mueff / n) / (n + 4 + 2 * mueff / n)
  const cs = (mueff + 2) / (n + mueff + 5)
  const c1 = 2 / ((n + 1.3) ** 2 + mueff)
  const cmu = Math.min(1 - c1, 2 * (mueff - 2 + 1 / mueff) / ((n + 2) ** 2 + mueff))
  const damps = 1 + 2 * Math.max(0, Math.sqrt((mueff - 1) / (n + 1)) - 1) + cs
  const chiN = Math.sqrt(n) * (1 - 1 / (4 * n) + 1 / (21 * n * n))

  let mean = (opt.x0 ?? new Array(n).fill(0.5)).slice()
  let sigma = opt.sigma0 ?? 0.3
  const pc = new Array(n).fill(0), ps = new Array(n).fill(0)
  let C: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)))
  let B = C.map((r) => r.slice()), D = new Array(n).fill(1)
  let eigenEval = 0
  let evals = 0, gens = 0
  let best: Individual | null = null
  const archive: Individual[] = []
  const history: { evals: number; f: number }[] = []

  const evalClip = (x: number[]): Individual => {
    const u = x.map((v) => Math.min(1, Math.max(0, v)))
    let pen = 0
    for (let i = 0; i < n; i++) pen += (x[i] - u[i]) ** 2
    const r = prob.evaluate(u)
    evals++
    const ind: Individual = { u, f: r.f.slice(), viol: r.viol }
    // boundary penalty added to the ranking key only (reported f stays physical)
    ;(ind as Individual & { pen?: number }).pen = pen
    return ind
  }

  while (evals < maxEvals) {
    // sample
    const zs: number[][] = [], ys: number[][] = [], pop: (Individual & { pen?: number })[] = []
    for (let k = 0; k < lambda && evals < maxEvals; k++) {
      const z = Array.from({ length: n }, () => rng.normal())
      const y = new Array(n).fill(0)
      for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += B[i][j] * D[j] * z[j]; y[i] = s }
      const x = mean.map((m, i) => m + sigma * y[i])
      zs.push(z); ys.push(y); pop.push(evalClip(x))
    }
    if (pop.length < mu) break
    const scale = Math.max(1, Math.abs(best?.f[0] ?? 1))
    const key = (a: Individual & { pen?: number }) => soKey(a) + (a.pen ?? 0) * 1e3 * scale
    const order = pop.map((_, i) => i).sort((a, b) => key(pop[a]) - key(pop[b]))
    for (const ind of pop) { archive.push(ind); if (!best || soKey(ind) < soKey(best)) best = ind }
    gens++
    history.push({ evals, f: best ? best.f[0] : Infinity })
    // recombination
    const oldMean = mean
    const yw = new Array(n).fill(0)
    for (let i = 0; i < mu; i++) { const y = ys[order[i]]; for (let j = 0; j < n; j++) yw[j] += w[i] * y[j] }
    mean = oldMean.map((m, j) => m + sigma * yw[j])
    // C^{-1/2} yw = B D^-1 B^T yw
    const bty = new Array(n).fill(0)
    for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += B[j][i] * yw[j]; bty[i] = s / D[i] }
    const cinv = new Array(n).fill(0)
    for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += B[i][j] * bty[j]; cinv[i] = s }
    for (let i = 0; i < n; i++) ps[i] = (1 - cs) * ps[i] + Math.sqrt(cs * (2 - cs) * mueff) * cinv[i]
    const psn = Math.hypot(...ps)
    const hsig = psn / Math.sqrt(1 - (1 - cs) ** (2 * evals / lambda)) / chiN < 1.4 + 2 / (n + 1) ? 1 : 0
    for (let i = 0; i < n; i++) pc[i] = (1 - cc) * pc[i] + hsig * Math.sqrt(cc * (2 - cc) * mueff) * yw[i]
    const Cn: number[][] = []
    for (let i = 0; i < n; i++) {
      Cn.push(new Array(n))
      for (let j = 0; j < n; j++) {
        let rankMu = 0
        for (let k = 0; k < mu; k++) { const y = ys[order[k]]; rankMu += w[k] * y[i] * y[j] }
        Cn[i][j] = (1 - c1 - cmu) * C[i][j] + c1 * (pc[i] * pc[j] + (1 - hsig) * cc * (2 - cc) * C[i][j]) + cmu * rankMu
      }
    }
    C = Cn
    sigma *= Math.exp((cs / damps) * (psn / chiN - 1))
    sigma = Math.min(sigma, 1)
    if (evals - eigenEval > lambda / (c1 + cmu) / n / 10) {
      eigenEval = evals
      for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) C[i][j] = C[j][i] = 0.5 * (C[i][j] + C[j][i])
      const eg = jacobiEigen(C)
      B = eg.B; D = eg.d.map((v) => Math.sqrt(Math.max(v, 1e-20)))
    }
    const sorted = order.map((i) => pop[i])
    if (opt.onGen) {
      const r = opt.onGen({ gen: gens, evals, best, front: sorted.slice(0, Math.min(5, sorted.length)), population: sorted })
      if (r === false) break
    }
    if (sigma * Math.max(...D) < 1e-12) break
    if (opt.tolFun !== undefined && gens > 10) {
      const h = history.slice(-10)
      if (Math.abs(h[0].f - h[h.length - 1].f) < opt.tolFun && sigma * Math.max(...D) < 1e-3) break
    }
  }
  return { best: best!, evals, gens, archive, history }
}
