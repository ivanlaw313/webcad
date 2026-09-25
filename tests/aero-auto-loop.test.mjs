// Aero Lab auto-design loop: GP correction surrogate + closed-loop state machine (fake CFD client).
// Run: node --experimental-strip-types --import ./tests/register-resolver.mjs --test tests/aero-auto-loop.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { fitSurrogate, predictSurrogate, Y_CLAMP } from '../src/aero/surrogate.ts'
import { fitCorrection, applyFactors, factorsAt } from '../src/aero/correction.ts'
import { newLoopState, driveLoop, loopSummary, pickDiverse, measuredRatios, bestPick } from '../src/aero/autoLoop.ts'
import { runAeroOptimization } from '../src/aero/optimize/runner.ts'
import { templateOf } from '../src/aero/templates.ts'
import { makeRng } from '../src/aero/rng.ts'

// ── surrogate ────────────────────────────────────────────────────────────────────────────────
test('surrogate: 0 points → identity; 1 point → constant; 2 points → finite, bounded', () => {
  const m0 = fitSurrogate([], [])
  assert.equal(predictSurrogate(m0, [0.3, 0.3]).mean, 0)
  const m1 = fitSurrogate([[0.2, 0.7]], [0.4])
  for (const u of [[0, 0], [0.2, 0.7], [1, 1]]) assert.ok(Math.abs(predictSurrogate(m1, u).mean - 0.4) < 1e-12)
  const m2 = fitSurrogate([[0.1, 0.1], [0.9, 0.9]], [0.1, 0.5])
  for (const u of [[0, 0], [0.5, 0.5], [1, 1], [0.1, 0.1]]) {
    const p = predictSurrogate(m2, u)
    assert.ok(Number.isFinite(p.mean) && Number.isFinite(p.std), JSON.stringify(p))
    assert.ok(p.mean >= 0.1 - 0.05 && p.mean <= 0.5 + 0.05, `bounded between the samples: ${p.mean}`)
  }
  // duplicated inputs with conflicting outputs (noisy CFD repeat) must not blow up
  const md = fitSurrogate([[0.5, 0.5], [0.5, 0.5]], [0.1, 0.3])
  const pd = predictSurrogate(md, [0.5, 0.5])
  assert.ok(Number.isFinite(pd.mean) && Math.abs(pd.mean - 0.2) < 0.05, `duplicate → average: ${pd.mean}`)
  // outliers are clamped; NaN samples dropped
  const mc = fitSurrogate([[0.1], [0.4], [0.8]], [50, NaN, -50])
  assert.equal(mc.n, 2)
  for (const u of [[0], [0.5], [1]]) assert.ok(Math.abs(predictSurrogate(mc, u).mean) <= Y_CLAMP + 1e-12)
})

test('surrogate recovers a known smooth correction function (d=4, 40 samples)', () => {
  const truth = (u) => 0.3 + 0.4 * u[0] - 0.35 * u[1] * u[1] + 0.15 * Math.sin(3 * u[2])   // u[3] irrelevant
  const rng = makeRng(7)
  const X = [], y = []
  for (let i = 0; i < 40; i++) { const u = [rng.next(), rng.next(), rng.next(), rng.next()]; X.push(u); y.push(truth(u) + 0.005 * rng.normal()) }
  const m = fitSurrogate(X, y)
  let se = 0, se0 = 0
  const n = 200
  const mean = y.reduce((a, b) => a + b, 0) / y.length
  for (let i = 0; i < n; i++) {
    const u = [0.1 + 0.8 * rng.next(), 0.1 + 0.8 * rng.next(), 0.1 + 0.8 * rng.next(), rng.next()]
    se += (predictSurrogate(m, u).mean - truth(u)) ** 2
    se0 += (mean - truth(u)) ** 2
  }
  const rmse = Math.sqrt(se / n), rmse0 = Math.sqrt(se0 / n)
  assert.ok(rmse < 0.04, `GP RMSE ${rmse.toFixed(4)}`)
  assert.ok(rmse < rmse0 / 4, `GP beats the scalar mean (${rmse.toFixed(4)} vs ${rmse0.toFixed(4)})`)
  // predictive std small near data, larger far away
  assert.ok(predictSurrogate(m, X[0]).std < predictSurrogate(m, [3, 3, 3, 3]).std)
})

test('correction: per-quantity models → factors applied to the right metrics', () => {
  const c = fitCorrection('wing', [{ u: [0.5, 0.5], ratios: { Cd: 2, Cl: 0.8 } }])
  const f = factorsAt(c, [0.1, 0.9])
  assert.ok(Math.abs(f.Cd - 2) < 1e-9 && Math.abs(f.Cl - 0.8) < 1e-9)
  const m = applyFactors('wing', { CD: 0.02, CL: 0.5, LD: 25, drag: 1, mass: 100 }, f)
  assert.ok(Math.abs(m.CD - 0.04) < 1e-12 && Math.abs(m.CL - 0.4) < 1e-12 && Math.abs(m.LD - 10) < 1e-9 && m.mass === 100)
  const s = applyFactors('shell', { CD: 0.1, drag: 2, dragPerVol: 3, volumeL: 1.5 }, { Cd: 1.5 })
  assert.deepEqual(s, { CD: 0.1 * 1.5, drag: 3, dragPerVol: 4.5, volumeL: 1.5 })
  const p = applyFactors('prop', { thrust: 1, power: 10, eff: 0.5, FM: 0.5, noise: 60 }, { thrustN: 0.5, powerW: 2, eff: 0.25 })
  assert.deepEqual(p, { thrust: 0.5, power: 20, eff: 0.125, FM: 0.125, noise: 60 })
  // sign flip (negative rotor thrust) is not a scale factor
  assert.deepEqual(measuredRatios('prop', { thrustN: 1, powerW: 10, eff: 0.5 }, { kind: 'rotor', thrustN: -0.2, powerW: 12, eff: undefined, converged: true, warnings: [] }), { powerW: 1.2 })
})

test('runner: correction changes the ranked objective, raw estimator kept in metrics', () => {
  const spec = templateOf('shell')
  const corr = fitCorrection('shell', [{ u: spec.vars.map(() => 0.5), ratios: { Cd: 2 } }])
  const a = runAeroOptimization(spec, { budget: 200, seed: 3, topN: 4 })
  const b = runAeroOptimization(spec, { budget: 200, seed: 3, topN: 4, correction: corr })
  const c = b.candidates[0]
  assert.ok(c.corrected && c.u?.length === spec.vars.length)
  assert.ok(Math.abs(c.corrected.drag - 2 * c.metrics.drag) < 1e-9, 'corrected = raw × 2')
  assert.ok(Math.abs(c.objectives[0] - c.corrected.drag) < 1e-12, 'objective ranks on corrected drag')
  assert.equal(a.candidates[0].corrected, undefined)
})

test('pickDiverse: best first, spread, skips already-tested designs', () => {
  const spec = templateOf('shell')
  const r = runAeroOptimization(spec, { budget: 300, seed: 1, topN: 30 })
  const two = pickDiverse(spec, r.candidates, 2, [])
  assert.equal(two.length, 2)
  assert.equal(two[0].id, r.candidates.filter((c) => c.feasible).sort((x, y) => x.objectives[0] - y.objectives[0])[0].id)
  const again = pickDiverse(spec, r.candidates, 2, [two[0].u])
  assert.ok(!again.some((c) => c.id === two[0].id), 'tested design not re-picked')
})

// ── loop with a fake CFD service ─────────────────────────────────────────────────────────────
// Synthetic "truth": CFD Cd = estimator Cd × e^(0.3 + 0.6·(u_length − 0.5)) — longer bodies are worse
// than the estimator thinks, so the corrected optimum moves.
const TRUE_LOG = (u) => 0.3 + 0.6 * (u[0] - 0.5)
function fakeWorld({ health = { ok: true, running: [], queued: [] }, fail = false, stuck = false } = {}) {
  const jobs = new Map()
  let seq = 0
  const w = {
    submitted: [], cancelled: [], healthCalls: 0, clock: 1_000_000,
    client: {
      async health() { w.healthCalls++; return typeof health === 'function' ? health() : health },
      async submit(req) {
        const id = `job${++seq}`
        const stl = Buffer.from(req.stlBase64, 'base64')
        assert.ok(stl.length > 84, 'binary STL attached')
        jobs.set(id, { req, polls: 0 })
        w.submitted.push({ id, name: req.name, spec: req.spec })
        return id
      },
      async status(id) {
        const j = jobs.get(id)
        if (!j) return { state: 'lost', stage: 'lost', progress: 0, error: 'job not found on service' }
        if (j.cancelled) return { state: 'cancelled', stage: 'cancelled', progress: 0 }
        j.polls++
        if (stuck || j.polls < 2) return { state: 'running', stage: 'solve', progress: 0.5 }
        if (fail) return { state: 'failed', stage: 'failed', progress: 0.5, error: 'snappyHexMesh exploded' }
        return { state: 'done', stage: 'done', progress: 1 }
      },
      async result(id) {
        const j = jobs.get(id)
        const u = w.uOf(j.req)
        const Cd = j.est.Cd * Math.exp(TRUE_LOG(u))
        return { kind: 'external', Cd, dragN: j.est.dragN * Math.exp(TRUE_LOG(u)), converged: true, warnings: [] }
      },
      async cancel(id) { w.cancelled.push(id); const j = jobs.get(id); if (j) j.cancelled = true },
    },
    jobs,
  }
  return w
}

function depsFor(w, spec, extra = {}) {
  // real optimiser (small budget); job builder wraps the real case builder and remembers u per job
  return {
    optimize: async (s, o) => runAeroOptimization(s, { ...o, budget: 240 }),
    cfd: w.client,
    now: () => w.clock,
    sleep: async (ms) => { w.clock += ms },
    buildJobs: (s, cands, mesh, preset) => {
      return cands.map((c) => {
        const name = `webcad-shell-${c.id}-${++w.nameSeq}`
        w.byName.set(name, { x: c.x, est: { Cd: c.metrics.CD, dragN: c.metrics.drag } })
        return { name, spec: { kind: 'external', velocity: 2, fluid: 'water', flowDirection: [1, 0, 0], liftDirection: [0, 0, 1], units: 'mm', mesh, preset: preset === 'auto' ? 'fast-rans' : preset }, stlBase64: Buffer.alloc(200, 1).toString('base64'), estimate: { Cd: c.metrics.CD, dragN: c.metrics.drag } }
      })
    },
    ...extra,
  }
}
// map request → u (the fake needs to know which design it is "simulating")
function wire(w, spec) {
  w.byName = new Map(); w.nameSeq = 0
  const info = (req) => w.byName.get(req.name.replace(/-r\d+$/, ''))
  w.uOf = (req) => spec.vars.map((v) => (info(req).x[v.key] - v.min) / (v.max - v.min))
  const sub = w.client.submit
  w.client.submit = async (req) => { const id = await sub(req); w.jobs.get(id).est = info(req).est; return id }
}

test('loop: CFD online → 2 rounds × top-2, surrogate learns, best is CFD-verified', async () => {
  const spec = templateOf('shell')
  const w = fakeWorld(); wire(w, spec)
  const saves = []
  const st = newLoopState(spec, { rounds: 2, topN: 2, maxJobs: 10, epsilon: 0, mesh: 'coarse' }, w.clock)
  await driveLoop(st, depsFor(w, spec, { save: (s) => saves.push(JSON.stringify(s)) }))
  assert.equal(st.status, 'done'); assert.equal(st.stop, 'rounds'); assert.equal(st.mode, 'cfd')
  assert.equal(st.rounds.length, 2); assert.equal(st.jobsUsed, 4); assert.equal(w.submitted.length, 4)
  assert.ok(w.submitted.every((j) => j.spec.mesh === 'coarse' && /-r[12]$/.test(j.name)))
  const [r1, r2] = st.rounds
  assert.ok(r1.picks.every((p) => p.state === 'done' && p.pred.Cd === 1), 'round 1 = uncorrected estimator')
  assert.ok(r2.picks.every((p) => p.state === 'done' && p.pred.Cd !== 1), 'round 2 = corrected')
  assert.ok(r2.predErr.Cd < r1.predErr.Cd, `prediction error shrinks: ${r1.predErr.Cd.toFixed(3)} → ${r2.predErr.Cd.toFixed(3)}`)
  assert.equal(r2.calib.Cd.n, 4)
  assert.ok(st.best.verified)
  const b = bestPick(st)
  assert.ok(Math.abs(b.objCfd - b.raw.drag * Math.exp(TRUE_LOG(b.u))) < 1e-9, 'verified drag = estimator × true factor')
  assert.ok(r2.bestSoFar <= r1.bestSoFar + 1e-12)
  const sum = loopSummary(st)
  assert.equal(sum.best.verifiedByCfd, true); assert.equal(sum.perRound.length, 2)
  assert.ok(saves.length > 5 && saves.every((s) => JSON.parse(s).v === 1), 'persisted as JSON at each step')
})

test('loop: reload mid-wait resumes from saved JSON without re-submitting', async () => {
  const spec = templateOf('shell')
  const w = fakeWorld(); wire(w, spec)
  let snap = null
  const st = newLoopState(spec, { rounds: 2, topN: 2, maxJobs: 10, epsilon: 0 }, w.clock)
  await driveLoop(st, depsFor(w, spec, { save: (s) => { if (!snap && s.phase === 'wait' && s.rounds.length === 1) snap = JSON.stringify(s) } }))
  assert.ok(snap)
  const w2 = fakeWorld(); wire(w2, spec)
  w2.byName = w.byName; w2.nameSeq = w.nameSeq
  // the "service" still has the round-1 jobs
  for (const [id, j] of w.jobs) w2.jobs.set(id, { ...j, polls: 0 })
  const resumed = JSON.parse(snap)
  await driveLoop(resumed, depsFor(w2, spec))
  assert.equal(resumed.status, 'done'); assert.equal(resumed.rounds.length, 2)
  assert.equal(w2.submitted.length, 2, 'only round-2 jobs submitted after resume')
  assert.ok(resumed.rounds[0].picks.every((p) => p.state === 'done'))
})

test('loop: service offline → estimator-only rounds, clearly flagged, no submissions', async () => {
  const spec = templateOf('shell')
  const w = fakeWorld({ health: { ok: false, running: [], queued: [], error: 'fetch failed' } }); wire(w, spec)
  const st = newLoopState(spec, { rounds: 2, topN: 2, epsilon: -1 }, w.clock)
  await driveLoop(st, depsFor(w, spec))
  assert.equal(st.mode, 'estimator'); assert.equal(st.modeReason, 'offline')
  assert.equal(st.status, 'done'); assert.equal(st.rounds.length, 2); assert.equal(w.submitted.length, 0)
  assert.ok(st.best && st.best.verified === false)
  assert.ok(w.healthCalls >= 2, 'health re-checked before later rounds')
  assert.ok(st.log.some((l) => l.key === 'lgModeEst' && l.v.reason === 'offline'))
  // LNA-blocked is reported as such
  const wb = fakeWorld({ health: { ok: false, blocked: true, running: [], queued: [] } }); wire(wb, spec)
  const sb = newLoopState(spec, { rounds: 1 }, wb.clock)
  await driveLoop(sb, depsFor(wb, spec))
  assert.equal(sb.modeReason, 'blocked')
  // comes online for round 2 → switches to CFD
  let n = 0
  const wo = fakeWorld({ health: () => (++n > 1 ? { ok: true, running: [], queued: [] } : { ok: false, running: [], queued: [] }) }); wire(wo, spec)
  const so = newLoopState(spec, { rounds: 2, topN: 1, epsilon: -1 }, wo.clock)
  await driveLoop(so, depsFor(wo, spec))
  assert.equal(so.rounds[0].mode, 'estimator'); assert.equal(so.rounds[1].mode, 'cfd'); assert.equal(wo.submitted.length, 1)
})

test('loop: rotor templates default to estimator-only unless rotor CFD is ticked', async () => {
  const spec = templateOf('prop')
  const w = fakeWorld()
  const st = newLoopState(spec, { rounds: 1, topN: 1, budget: 120 }, w.clock)
  await driveLoop(st, { ...depsFor(w, spec), optimize: async (s, o) => runAeroOptimization(s, { ...o, budget: 120 }) })
  assert.equal(st.mode, 'estimator'); assert.equal(st.modeReason, 'rotorOff'); assert.equal(w.healthCalls, 0)
  const st2 = newLoopState(spec, { rounds: 1, useRotorCfd: true }, w.clock)
  st2.config.rounds = 0   // only decide the mode
  await driveLoop(st2, depsFor(w, spec))
  assert.equal(st2.mode, 'cfd'); assert.equal(loopSummary(st2).rotorCfdUnvalidated, true)
})

test('loop: every CFD job fails → stops with cfdFailed, keeps estimator best', async () => {
  const spec = templateOf('shell')
  const w = fakeWorld({ fail: true }); wire(w, spec)
  const st = newLoopState(spec, { rounds: 3, topN: 2 }, w.clock)
  await driveLoop(st, depsFor(w, spec))
  assert.equal(st.status, 'failed'); assert.equal(st.stop, 'cfdFailed')
  assert.equal(st.rounds.length, 1); assert.equal(w.submitted.length, 2)
  assert.ok(st.rounds[0].picks.every((p) => p.state === 'failed' && /snappy/.test(p.error)))
  assert.equal(st.best.verified, false)
})

test('loop: cancel while waiting cancels the pending service jobs', async () => {
  const spec = templateOf('shell')
  const w = fakeWorld({ stuck: true }); wire(w, spec)
  const st = newLoopState(spec, { rounds: 3, topN: 2 }, w.clock)
  const deps = depsFor(w, spec)
  deps.sleep = async (ms) => { w.clock += ms; st.cancelRequested = true }
  await driveLoop(st, deps)
  assert.equal(st.status, 'cancelled'); assert.equal(st.stop, 'cancelled')
  assert.deepEqual(w.cancelled.sort(), w.submitted.map((j) => j.id).sort())
})

test('loop: job budget, time budget and ε-convergence stop the loop', async () => {
  const spec = templateOf('shell')
  let w = fakeWorld(); wire(w, spec)
  let st = newLoopState(spec, { rounds: 5, topN: 2, maxJobs: 3, epsilon: -1 }, w.clock)
  await driveLoop(st, depsFor(w, spec))
  assert.equal(st.stop, 'budget'); assert.equal(st.jobsUsed, 3); assert.equal(st.rounds[1].picks.length, 1)

  w = fakeWorld({ stuck: true }); wire(w, spec)
  st = newLoopState(spec, { rounds: 5, topN: 2, maxMinutes: 5 }, w.clock)
  await driveLoop(st, depsFor(w, spec))
  assert.equal(st.stop, 'time'); assert.equal(w.cancelled.length, 2)

  w = fakeWorld({ health: { ok: false, running: [], queued: [] } }); wire(w, spec)
  st = newLoopState(spec, { rounds: 6, topN: 2, epsilon: 0.5 }, w.clock)
  await driveLoop(st, depsFor(w, spec))
  assert.equal(st.stop, 'converged'); assert.equal(st.rounds.length, 2)
})
