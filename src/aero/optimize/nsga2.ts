// Aero Design Lab — NSGA-II (Deb 2002): fast non-dominated sort, crowding distance,
// constrained domination, binary tournament, SBX crossover + polynomial mutation, on [0,1]^n.
import { makeRng, type Rng } from '../rng'
import type { GenCallback, Individual, OptProblem } from './types'

export interface Nsga2Options {
  seed?: number
  popSize?: number        // even, default 60
  generations?: number    // default 60
  etaC?: number; etaM?: number; pc?: number; pm?: number
  initial?: number[][]    // optional seeds (normalised)
  onGen?: GenCallback
}
export interface Nsga2Result { front: Individual[]; population: Individual[]; evals: number; gens: number; archive: Individual[] }

/** Constrained domination: feasible beats infeasible; both infeasible → smaller violation. */
export function dominates(a: Individual, b: Individual): boolean {
  if (a.viol <= 0 && b.viol > 0) return true
  if (a.viol > 0 && b.viol <= 0) return false
  if (a.viol > 0 && b.viol > 0) return a.viol < b.viol
  let better = false
  for (let i = 0; i < a.f.length; i++) {
    if (a.f[i] > b.f[i]) return false
    if (a.f[i] < b.f[i]) better = true
  }
  return better
}

export function nonDominatedSort(pop: Individual[]): Individual[][] {
  const n = pop.length
  const S: number[][] = Array.from({ length: n }, () => [])
  const cnt = new Array<number>(n).fill(0)
  const fronts: number[][] = [[]]
  for (let p = 0; p < n; p++) {
    for (let q = 0; q < n; q++) {
      if (p === q) continue
      if (dominates(pop[p], pop[q])) S[p].push(q)
      else if (dominates(pop[q], pop[p])) cnt[p]++
    }
    if (cnt[p] === 0) { pop[p].rank = 0; fronts[0].push(p) }
  }
  let i = 0
  while (fronts[i].length) {
    const next: number[] = []
    for (const p of fronts[i]) for (const q of S[p]) { cnt[q]--; if (cnt[q] === 0) { pop[q].rank = i + 1; next.push(q) } }
    i++
    fronts.push(next)
  }
  return fronts.filter((f) => f.length).map((f) => f.map((k) => pop[k]))
}

export function crowding(front: Individual[]): void {
  const n = front.length
  for (const p of front) p.crowd = 0
  if (!n) return
  const m = front[0].f.length
  for (let k = 0; k < m; k++) {
    const s = front.slice().sort((a, b) => a.f[k] - b.f[k])
    s[0].crowd = s[n - 1].crowd = Infinity
    const span = s[n - 1].f[k] - s[0].f[k]
    if (!(span > 0) || !Number.isFinite(span)) continue
    for (let i = 1; i < n - 1; i++) s[i].crowd! += (s[i + 1].f[k] - s[i - 1].f[k]) / span
  }
}

function sbx(rng: Rng, a: number[], b: number[], eta: number, pc: number): [number[], number[]] {
  const c1 = a.slice(), c2 = b.slice()
  if (rng.next() > pc) return [c1, c2]
  for (let i = 0; i < a.length; i++) {
    if (rng.next() > 0.5 || Math.abs(a[i] - b[i]) < 1e-14) continue
    const y1 = Math.min(a[i], b[i]), y2 = Math.max(a[i], b[i])
    const u = rng.next()
    const calc = (beta: number) => { const alpha = 2 - Math.pow(beta, -(eta + 1)); return u <= 1 / alpha ? Math.pow(u * alpha, 1 / (eta + 1)) : Math.pow(1 / (2 - u * alpha), 1 / (eta + 1)) }
    const bq1 = calc(1 + 2 * y1 / (y2 - y1)), bq2 = calc(1 + 2 * (1 - y2) / (y2 - y1))
    let v1 = 0.5 * ((y1 + y2) - bq1 * (y2 - y1)), v2 = 0.5 * ((y1 + y2) + bq2 * (y2 - y1))
    v1 = Math.min(1, Math.max(0, v1)); v2 = Math.min(1, Math.max(0, v2))
    if (rng.next() < 0.5) { c1[i] = v2; c2[i] = v1 } else { c1[i] = v1; c2[i] = v2 }
  }
  return [c1, c2]
}
function polyMut(rng: Rng, x: number[], eta: number, pm: number): number[] {
  const y = x.slice()
  for (let i = 0; i < y.length; i++) {
    if (rng.next() > pm) continue
    const u = rng.next(), v = y[i]
    const d1 = v, d2 = 1 - v, mp = 1 / (eta + 1)
    let dq: number
    if (u < 0.5) dq = Math.pow(2 * u + (1 - 2 * u) * Math.pow(1 - d1, eta + 1), mp) - 1
    else dq = 1 - Math.pow(2 * (1 - u) + 2 * (u - 0.5) * Math.pow(1 - d2, eta + 1), mp)
    y[i] = Math.min(1, Math.max(0, v + dq))
  }
  return y
}

export function runNsga2(prob: OptProblem, opt: Nsga2Options = {}): Nsga2Result {
  const rng = makeRng(opt.seed ?? 1)
  const n = prob.n
  const N = Math.max(8, Math.round((opt.popSize ?? 60) / 2) * 2)
  const G = opt.generations ?? 60
  const etaC = opt.etaC ?? 15, etaM = opt.etaM ?? 20, pc = opt.pc ?? 0.9, pm = opt.pm ?? 1 / n
  let evals = 0
  const archive: Individual[] = []
  const ev = (u: number[]): Individual => { const r = prob.evaluate(u); evals++; const ind = { u, f: r.f.slice(), viol: r.viol }; archive.push(ind); return ind }
  let pop: Individual[] = []
  for (const s of opt.initial ?? []) if (pop.length < N) pop.push(ev(s.map((v) => Math.min(1, Math.max(0, v)))))
  while (pop.length < N) pop.push(ev(Array.from({ length: n }, () => rng.next())))
  for (const f of nonDominatedSort(pop)) crowding(f)
  const tour = (): Individual => {
    const a = pop[rng.int(0, pop.length - 1)], b = pop[rng.int(0, pop.length - 1)]
    if ((a.rank ?? 0) !== (b.rank ?? 0)) return (a.rank ?? 0) < (b.rank ?? 0) ? a : b
    return (a.crowd ?? 0) >= (b.crowd ?? 0) ? a : b
  }
  let gens = 0
  for (let g = 0; g < G; g++) {
    const kids: Individual[] = []
    while (kids.length < N) {
      const [c1, c2] = sbx(rng, tour().u, tour().u, etaC, pc)
      kids.push(ev(polyMut(rng, c1, etaM, pm)))
      if (kids.length < N) kids.push(ev(polyMut(rng, c2, etaM, pm)))
    }
    const all = pop.concat(kids)
    const fronts = nonDominatedSort(all)
    const next: Individual[] = []
    for (const f of fronts) {
      crowding(f)
      if (next.length + f.length <= N) { next.push(...f); continue }
      f.sort((a, b) => (b.crowd ?? 0) - (a.crowd ?? 0))
      next.push(...f.slice(0, N - next.length))
      break
    }
    pop = next
    gens++
    if (opt.onGen) {
      const front = pop.filter((p) => p.rank === 0)
      const r = opt.onGen({ gen: gens, evals, best: null, front, population: pop })
      if (r === false) break
    }
  }
  const front = nonDominatedSort(pop)[0] ?? []
  return { front, population: pop, evals, gens, archive }
}
