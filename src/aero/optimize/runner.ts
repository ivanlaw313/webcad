// Aero Design Lab — runs CMA-ES (1 objective) or NSGA-II (≥2 objectives) on a DesignSpec.
// Pure function: used by the Web Worker (src/worker/aero.worker.ts) and by unit tests.
import { decode, encode, evaluateSpec, objectiveVector, type DesignSpec, type Metrics } from '../designSpace'
import { runCmaes } from './cmaes'
import { runNsga2, nonDominatedSort } from './nsga2'
import { soKey, type Individual, type OptProblem } from './types'

export interface AeroRunOptions { seed?: number; budget?: number; topN?: number }
export interface Candidate { id: number; x: Record<string, number>; metrics: Metrics; objectives: number[]; feasible: boolean; violation: number; pareto: boolean }
export interface AeroProgress {
  pct: number; gen: number; evals: number; budget: number
  best: number[] | null                 // best objective vector (physical sense, not negated)
  cloud: number[][]                     // current population objective pairs/singles (physical sense)
  front: number[][]
}
export interface AeroRunResult {
  algorithm: 'CMA-ES' | 'NSGA-II'
  evals: number; ms: number; seed: number
  candidates: Candidate[]               // top-N, feasible first, distinct
  pareto: Candidate[]                   // non-dominated feasible set (multi-objective); = [best] for single
  history: { evals: number; best: number[] }[]
  baseline: Candidate | null            // spec default point, for "improvement vs start"
}

export function runAeroOptimization(spec: DesignSpec, opts: AeroRunOptions = {}, onProgress?: (p: AeroProgress) => void | boolean): AeroRunResult {
  const t0 = Date.now()
  const seed = opts.seed ?? 42
  const budget = Math.max(40, Math.round(opts.budget ?? 1200))
  const topN = opts.topN ?? 8
  const nObj = Math.max(1, spec.objectives.length)
  const cache = new Map<string, { metrics: Metrics; f: number[]; viol: number }>()
  const physical = (f: number[]) => f.map((v, i) => (spec.objectives[i]?.sense === 'max' ? -v : v))
  const prob: OptProblem = {
    n: spec.vars.length,
    evaluate(u) {
      const x = decode(spec, u)
      const key = spec.vars.map((v) => x[v.key].toPrecision(7)).join('|')
      let hit = cache.get(key)
      if (!hit) {
        const ev = evaluateSpec(spec, x)
        hit = { metrics: ev.metrics, f: objectiveVector(spec, ev.metrics), viol: ev.violation }
        if (cache.size < 50000) cache.set(key, hit)
      }
      return { f: hit.f, viol: hit.viol }
    },
  }
  const history: AeroRunResult['history'] = []
  const toCand = (ind: Individual, id: number, pareto = false): Candidate => {
    const x = decode(spec, ind.u)
    const ev = evaluateSpec(spec, x)
    return { id, x, metrics: ev.metrics, objectives: physical(objectiveVector(spec, ev.metrics)), feasible: ev.violation <= 0, violation: ev.violation, pareto }
  }
  const x0 = encode(spec, Object.fromEntries(spec.vars.map((v) => [v.key, v.value ?? (v.min + v.max) / 2])))
  const baseInd = { u: x0, ...prob.evaluate(x0) }
  let archive: Individual[] = []
  let paretoInds: Individual[] = []
  let algorithm: AeroRunResult['algorithm']
  let evals = 0
  if (nObj === 1) {
    algorithm = 'CMA-ES'
    const lambda = Math.max(8, 4 + Math.floor(3 * Math.log(spec.vars.length)) * 2)
    const r = runCmaes(prob, {
      seed, maxEvals: budget, x0, sigma0: 0.3, lambda,
      onGen: (g) => {
        const bestF = g.best ? physical(g.best.f) : null
        if (bestF) history.push({ evals: g.evals, best: bestF })
        return onProgress?.({
          pct: Math.min(100, 100 * g.evals / budget), gen: g.gen, evals: g.evals, budget,
          best: bestF, cloud: g.population.filter((p) => p.viol <= 0).map((p) => physical(p.f)), front: bestF ? [bestF] : [],
        })
      },
    })
    archive = r.archive; evals = r.evals
    paretoInds = r.best ? [r.best] : []
  } else {
    algorithm = 'NSGA-II'
    const pop = Math.min(80, Math.max(24, Math.round(Math.sqrt(budget) * 1.6 / 2) * 2))
    const gens = Math.max(2, Math.floor(budget / pop) - 1)
    const r = runNsga2(prob, {
      seed, popSize: pop, generations: gens, initial: [x0],
      onGen: (g) => {
        const feas = g.front.filter((p) => p.viol <= 0)
        const fr = feas.map((p) => physical(p.f))
        history.push({ evals: g.evals, best: fr.length ? spec.objectives.map((o, i) => (o.sense === 'max' ? Math.max(...fr.map((f) => f[i])) : Math.min(...fr.map((f) => f[i])))) : [] })
        return onProgress?.({
          pct: Math.min(100, 100 * g.evals / budget), gen: g.gen, evals: g.evals, budget,
          best: null, cloud: g.population.filter((p) => p.viol <= 0).map((p) => physical(p.f)), front: fr,
        })
      },
    })
    archive = r.archive; evals = r.evals
    const feasAll = archive.filter((p) => p.viol <= 0)
    paretoInds = feasAll.length ? nonDominatedSort(feasAll.map((p) => ({ ...p })))[0] : r.front
  }
  // top-N distinct candidates: pareto (spread) first, then best of archive by first objective
  const dist = (a: number[], b: number[]) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0))
  const picked: Individual[] = []
  const tryAdd = (ind: Individual) => { if (picked.length < topN && !picked.some((p) => dist(p.u, ind.u) < 0.02)) picked.push(ind) }
  if (nObj > 1) {
    const pf = paretoInds.slice().sort((a, b) => a.f[0] - b.f[0])
    const step = Math.max(1, (pf.length - 1) / Math.max(1, topN - 1))
    for (let i = 0; i < pf.length && picked.length < topN; i += step) tryAdd(pf[Math.round(i)])
  }
  const ranked = archive.slice().sort((a, b) => soKey(a) - soKey(b))
  for (const ind of ranked) { if (picked.length >= topN) break; tryAdd(ind) }
  const paretoSet = new Set(paretoInds)
  const candidates = picked.map((ind, i) => toCand(ind, i + 1, paretoSet.has(ind) || (nObj === 1 && i === 0)))
  const pareto = paretoInds.slice(0, 200).map((ind, i) => toCand(ind, 1000 + i, true))
  return { algorithm, evals, ms: Date.now() - t0, seed, candidates, pareto, history, baseline: toCand(baseInd as Individual, 0) }
}
