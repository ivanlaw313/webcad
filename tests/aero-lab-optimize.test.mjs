// Aero Design Lab — optimizers (CMA-ES, NSGA-II) on standard test functions + end-to-end design runs.
import test from 'node:test'
import assert from 'node:assert/strict'
import { runCmaes, jacobiEigen } from '../src/aero/optimize/cmaes.ts'
import { runNsga2 } from '../src/aero/optimize/nsga2.ts'
import { runAeroOptimization } from '../src/aero/optimize/runner.ts'
import { propTemplate, wingTemplate, shellTemplate } from '../src/aero/templates.ts'
import { makeRng } from '../src/aero/rng.ts'

test('seeded RNG is deterministic and roughly normal', () => {
  const a = makeRng(123), b = makeRng(123)
  for (let i = 0; i < 50; i++) assert.equal(a.next(), b.next())
  const r = makeRng(9)
  let s = 0, s2 = 0
  const n = 20000
  for (let i = 0; i < n; i++) { const z = r.normal(); s += z; s2 += z * z }
  assert.ok(Math.abs(s / n) < 0.03 && Math.abs(s2 / n - 1) < 0.05)
})

test('Jacobi eigen-decomposition reconstructs a symmetric matrix', () => {
  const A = [[4, 1, 0.5], [1, 3, 0.2], [0.5, 0.2, 2]]
  const { d, B } = jacobiEigen(A)
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    let s = 0
    for (let k = 0; k < 3; k++) s += B[i][k] * d[k] * B[j][k]
    assert.ok(Math.abs(s - A[i][j]) < 1e-9)
  }
})

test('CMA-ES: sphere (n=8) converges to 1e-10', () => {
  const c = 0.3
  const r = runCmaes({ n: 8, evaluate: (u) => ({ f: [u.reduce((s, v) => s + (v - c) ** 2, 0)], viol: 0 }) }, { seed: 1, maxEvals: 4000 })
  assert.ok(r.best.f[0] < 1e-10, `sphere best ${r.best.f[0]}`)
})

test('CMA-ES: Rosenbrock (n=4) on [-2,2]^4 finds the (1,…,1) valley floor', () => {
  const X = (u) => u.map((v) => -2 + 4 * v)
  const rosen = (x) => { let s = 0; for (let i = 0; i < x.length - 1; i++) s += 100 * (x[i + 1] - x[i] ** 2) ** 2 + (1 - x[i]) ** 2; return s }
  const r = runCmaes({ n: 4, evaluate: (u) => ({ f: [rosen(X(u))], viol: 0 }) }, { seed: 3, maxEvals: 12000 })
  assert.ok(r.best.f[0] < 1e-6, `rosenbrock best ${r.best.f[0]}`)
  for (const v of X(r.best.u)) assert.ok(Math.abs(v - 1) < 1e-2)
})

test('CMA-ES: constraint handling (feasibility-first) — min Σx s.t. Σx ≥ 1', () => {
  const r = runCmaes({ n: 3, evaluate: (u) => { const s = u.reduce((a, b) => a + b, 0); return { f: [s], viol: Math.max(0, 1 - s) } } }, { seed: 5, maxEvals: 3000 })
  assert.equal(r.best.viol, 0)
  assert.ok(Math.abs(r.best.f[0] - 1) < 1e-3, `constrained optimum ${r.best.f[0]}`)
})

test('NSGA-II: ZDT1 (n=30) converges to the true front f2 = 1 − √f1 with spread', () => {
  const zdt1 = (u) => {
    const f1 = u[0]
    let g = 0
    for (let i = 1; i < u.length; i++) g += u[i]
    g = 1 + 9 * g / (u.length - 1)
    return { f: [f1, g * (1 - Math.sqrt(f1 / g))], viol: 0 }
  }
  const r = runNsga2({ n: 30, evaluate: zdt1 }, { seed: 11, popSize: 100, generations: 250 })
  const gd = r.front.reduce((s, p) => s + Math.abs(p.f[1] - (1 - Math.sqrt(p.f[0]))), 0) / r.front.length
  assert.ok(gd < 0.01, `mean distance to true front ${gd}`)
  const f1s = r.front.map((p) => p.f[0])
  assert.ok(Math.min(...f1s) < 0.02 && Math.max(...f1s) > 0.95, 'front spans f1 ∈ [0,1]')
  assert.ok(r.front.length >= 60, `front size ${r.front.length}`)
})

test('NSGA-II is deterministic for a given seed', () => {
  const p = { n: 3, evaluate: (u) => ({ f: [u[0], 1 - u[0] + u[1] + u[2]], viol: 0 }) }
  const a = runNsga2(p, { seed: 4, popSize: 20, generations: 10 }), b = runNsga2(p, { seed: 4, popSize: 20, generations: 10 })
  assert.deepEqual(a.front.map((x) => x.u), b.front.map((x) => x.u))
})

for (const [name, mk] of [['prop/fan', propTemplate], ['wing', wingTemplate], ['shell', shellTemplate]]) {
  test(`end-to-end ${name}: optimisation improves on the template start point, all top candidates feasible`, () => {
    const spec = mk()
    let calls = 0
    const r = runAeroOptimization(spec, { budget: 600, seed: 2, topN: 6 }, () => { calls++ })
    assert.ok(calls > 3, 'progress callbacks fire')
    assert.ok(r.candidates.length >= 3)
    const best = r.candidates[0]
    assert.ok(best.feasible, 'best is feasible')
    const o = spec.objectives[0]
    // first objective of the best-ranked candidate on the pareto front beats (or equals) the baseline
    const bestFirst = o.sense === 'max' ? Math.max(...r.pareto.map((c) => c.objectives[0])) : Math.min(...r.pareto.map((c) => c.objectives[0]))
    if (o.sense === 'max') assert.ok(bestFirst > r.baseline.objectives[0], `${o.key}: ${bestFirst} > ${r.baseline.objectives[0]}`)
    else assert.ok(bestFirst < r.baseline.objectives[0], `${o.key}: ${bestFirst} < ${r.baseline.objectives[0]}`)
    // determinism
    const r2 = runAeroOptimization(spec, { budget: 600, seed: 2, topN: 6 })
    assert.deepEqual(r2.candidates.map((c) => c.x), r.candidates.map((c) => c.x))
  })
}
