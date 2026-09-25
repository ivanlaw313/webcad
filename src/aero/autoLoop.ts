// Aero Design Lab — closed-loop "auto design" (自動設計模式).
// Each round: optimise with the (corrected) estimator → pick top-N diverse candidates → CFD →
// wait → fold CFD/estimate residuals into a GP correction surrogate → next round optimises the
// corrected objective. Stops after K rounds / CFD-job budget / wall-clock budget / improvement < ε.
// Offline / LNA-blocked service (or rotor CFD not opted in) → estimator-only rounds, flagged.
// Pure state machine: all I/O is injected (LoopDeps) so node tests drive it with a fake CFD client;
// the state is plain JSON so the UI persists it in localStorage and a reload resumes from `phase`.
import { encode, violationOf, type DesignSpec, type Metrics } from './designSpace'
import type { AeroRunOptions, AeroRunResult, Candidate } from './optimize/runner'
import { buildCfdCase } from './cfdExport'
import { jobFromCase, type CfdEstimate, type CfdHealth, type CfdMesh, type CfdPresetChoice, type CfdSummary, type JobStatus, type ServiceSpec } from './cfdService'
import { applyFactors, CORR_KEYS, factorsAt, fitCorrection, type Correction, type CorrKey, type CorrSample, type Factors } from './correction'

export interface LoopConfig {
  rounds: number          // K
  topN: number            // CFD candidates per round
  maxJobs: number         // total CFD job budget
  maxMinutes: number      // wall-clock budget
  epsilon: number         // stop when relative improvement of the best verified objective < ε
  mesh: CfdMesh
  preset: CfdPresetChoice
  budget: number          // optimiser evaluations per round
  seed: number
  useRotorCfd: boolean    // prop/fan: rotor CFD is unvalidated → off by default
  pollMs?: number
  url?: string            // CFD service URL (browser wiring)
}
export const DEFAULT_LOOP_CONFIG: LoopConfig = { rounds: 3, topN: 2, maxJobs: 6, maxMinutes: 120, epsilon: 0.01, mesh: 'coarse', preset: 'auto', budget: 1200, seed: 42, useRotorCfd: false }

export type LoopStatus = 'running' | 'done' | 'cancelled' | 'failed'
export type LoopPhase = 'start' | 'optimize' | 'submit' | 'wait' | 'roundEnd' | 'end'
export type LoopMode = 'cfd' | 'estimator'
export type ModeReason = 'offline' | 'blocked' | 'rotorOff'
export type StopReason = 'rounds' | 'budget' | 'time' | 'converged' | 'cancelled' | 'cfdFailed' | 'noFeasible' | 'error'

export interface LoopPick {
  cid: number
  x: Record<string, number>
  u: number[]
  raw: Metrics                 // estimator
  corrected: Metrics           // estimator × surrogate factors (what the optimiser ranked on)
  pred: Factors                // predicted CFD/estimate factor per quantity (1 = no data yet)
  objRaw: number               // primary objective, physical sense
  objEst: number               // primary objective after correction
  feasibleEst: boolean
  state: 'planned' | 'submitted' | 'done' | 'failed'
  jobId?: string
  estimate?: CfdEstimate       // quantities as sent to the service (ratio denominators)
  stage?: string
  progress?: number
  queuePosition?: number
  error?: string
  cfd?: CfdSummary
  ratios?: Factors             // measured CFD / estimate
  verified?: Metrics           // estimator metrics × measured ratios
  objCfd?: number
  feasibleCfd?: boolean
}
export interface LoopRound {
  n: number
  mode: LoopMode
  startedAt: number
  finishedAt?: number
  picks: LoopPick[]
  bestEst?: number             // best corrected-estimator objective among this round's picks
  bestCfd?: number             // best CFD-verified objective among this round's picks
  bestSoFar?: number           // overall best after this round (verified if any CFD data)
  improvement?: number         // relative improvement of bestSoFar vs previous round
  predErr?: Factors            // mean |ln(pred) − ln(measured)| per quantity (round 1 = raw estimator error)
  calib?: Partial<Record<CorrKey, { n: number; factor: number }>>   // surrogate state after this round
}
export interface LoopLog { t: number; key: string; v?: Record<string, string | number> }
export interface LoopState {
  v: 1
  id: string
  status: LoopStatus
  phase: LoopPhase
  mode: LoopMode
  modeReason?: ModeReason
  stop?: StopReason
  pendingStop?: StopReason
  error?: string
  rotor: boolean
  spec: DesignSpec
  config: LoopConfig
  startedAt: number
  updatedAt: number
  rounds: LoopRound[]
  jobsUsed: number
  best?: { round: number; cid: number; verified: boolean }
  log: LoopLog[]
  cancelRequested?: boolean
}

export interface CfdClient {
  health(): Promise<CfdHealth>
  submit(req: { name: string; spec: ServiceSpec; stlBase64: string }): Promise<string>
  status(id: string): Promise<JobStatus>
  result(id: string): Promise<CfdSummary>
  cancel(id: string): Promise<void>
}
export interface JobReq { name: string; spec: ServiceSpec; stlBase64: string; estimate: CfdEstimate }
export interface LoopDeps {
  optimize(spec: DesignSpec, opts: AeroRunOptions): Promise<AeroRunResult>
  cfd: CfdClient
  now(): number
  sleep(ms: number): Promise<void>
  save?(st: LoopState): void
  onUpdate?(st: LoopState): void
  buildJobs?(spec: DesignSpec, cands: Candidate[], mesh: CfdMesh, preset: CfdPresetChoice): JobReq[]
}

export const ACTIVE_STATUS = (st: LoopState | null | undefined): boolean => !!st && st.status === 'running'

export function newLoopState(spec: DesignSpec, config: Partial<LoopConfig>, now: number, id = `L${now.toString(36)}`): LoopState {
  const c: LoopConfig = { ...DEFAULT_LOOP_CONFIG, ...config }
  c.rounds = Math.max(1, Math.min(20, Math.round(c.rounds)))
  c.topN = Math.max(1, Math.min(8, Math.round(c.topN)))
  c.maxJobs = Math.max(0, Math.min(100, Math.round(c.maxJobs)))
  c.maxMinutes = Math.max(1, c.maxMinutes)
  c.epsilon = Math.max(0, c.epsilon)
  c.budget = Math.max(40, Math.round(c.budget))
  return {
    v: 1, id, status: 'running', phase: 'start', mode: 'estimator', rotor: spec.kind === 'prop',
    spec: JSON.parse(JSON.stringify(spec)), config: c, startedAt: now, updatedAt: now, rounds: [], jobsUsed: 0, log: [],
  }
}

// ── helpers (exported for tests / UI) ─────────────────────────────────────────────────────────
const dist = (a: number[], b: number[]) => Math.sqrt(a.reduce((s, v, i) => s + (v - (b[i] ?? 0)) ** 2, 0))
export const primary = (spec: DesignSpec) => spec.objectives[0] ?? { key: spec.kind === 'wing' ? 'LD' : spec.kind === 'prop' ? 'eff' : 'drag', sense: spec.kind === 'shell' ? 'min' as const : 'max' as const }
/** Score to MINIMISE for the primary objective (NaN → +∞). */
export const scoreOf = (spec: DesignSpec, v: number | undefined): number => (v === undefined || !Number.isFinite(v) ? Infinity : primary(spec).sense === 'max' ? -v : v)

/** Measured CFD / estimate per correction quantity (positive finite only; sign flips are not a scale). */
export function measuredRatios(kind: DesignSpec['kind'], est: CfdEstimate, r: CfdSummary): Factors {
  const out: Factors = {}
  const val: Record<CorrKey, [number | undefined, number | undefined]> = {
    Cd: [r.Cd, est.Cd], Cl: [r.Cl, est.Cl], thrustN: [r.thrustN, est.thrustN], powerW: [r.powerW, est.powerW], eff: [r.eff, est.eff],
  }
  for (const k of CORR_KEYS[kind]) {
    const [c, e] = val[k]
    if (c === undefined || e === undefined || !Number.isFinite(c) || !Number.isFinite(e) || Math.abs(e) < 1e-12) continue
    const q = c / e
    if (q > 0 && Number.isFinite(q)) out[k] = q
  }
  return out
}

export function collectSamples(st: LoopState): CorrSample[] {
  const s: CorrSample[] = []
  for (const r of st.rounds) for (const p of r.picks) if (p.state === 'done' && p.ratios && Object.keys(p.ratios).length) s.push({ u: p.u, ratios: p.ratios })
  return s
}

/** Greedy diverse top-N: best (corrected) feasible first, then the next best at least dmin away
 *  (dmin halves until N are found); skips designs already verified by CFD. */
export function pickDiverse(spec: DesignSpec, cands: Candidate[], n: number, tested: number[][]): Candidate[] {
  const pool = cands.filter((c) => c.feasible).map((c) => ({ c, u: c.u ?? encode(spec, c.x), s: scoreOf(spec, c.objectives[0]) }))
    .filter((o) => Number.isFinite(o.s)).sort((a, b) => a.s - b.s)
  if (!pool.length || n <= 0) return []
  const fresh = pool.filter((o) => !tested.some((t) => dist(t, o.u) < 0.02))
  const src = fresh.length ? fresh : pool.slice(0, 1)
  let dmin = 0.12 * Math.sqrt(Math.max(1, spec.vars.length))
  let chosen: typeof src = []
  while (true) {
    chosen = []
    for (const o of src) {
      if (chosen.every((q) => dist(q.u, o.u) >= dmin)) chosen.push(o)
      if (chosen.length >= n) break
    }
    if (chosen.length >= Math.min(n, src.length) || dmin < 1e-3) break
    dmin /= 2
  }
  return chosen.map((o) => ({ ...o.c, u: o.u }))
}

export function allPicks(st: LoopState): { round: number; p: LoopPick }[] {
  return st.rounds.flatMap((r) => r.picks.map((p) => ({ round: r.n, p })))
}

/** Best design so far: CFD-verified + feasible if any exist, else best corrected estimate. */
export function selectBest(st: LoopState): LoopState['best'] {
  const all = allPicks(st)
  let best: { round: number; p: LoopPick; s: number } | null = null
  for (const a of all) {
    if (a.p.state !== 'done' || !a.p.feasibleCfd) continue
    const s = scoreOf(st.spec, a.p.objCfd)
    if (Number.isFinite(s) && (!best || s < best.s)) best = { ...a, s }
  }
  if (best) return { round: best.round, cid: best.p.cid, verified: true }
  for (const a of all) {
    if (!a.p.feasibleEst) continue
    const s = scoreOf(st.spec, a.p.objEst)
    if (Number.isFinite(s) && (!best || s < best.s)) best = { ...a, s }
  }
  return best ? { round: best.round, cid: best.p.cid, verified: false } : undefined
}
export function bestPick(st: LoopState): LoopPick | undefined {
  const b = st.best
  return b ? st.rounds.find((r) => r.n === b.round)?.picks.find((p) => p.cid === b.cid) : undefined
}
export const bestValue = (st: LoopState): number | undefined => {
  const p = bestPick(st)
  return p ? (st.best?.verified ? p.objCfd : p.objEst) : undefined
}

function defaultBuildJobs(spec: DesignSpec, cands: Candidate[], mesh: CfdMesh, preset: CfdPresetChoice): JobReq[] {
  // the service estimate (ratio denominator) must be the RAW estimator → candidates carry raw metrics
  const { caseJson } = buildCfdCase(spec, cands, true)
  return cands.map((_, i) => { const r = jobFromCase(caseJson, i, { mesh, preset }); return { name: r.name, spec: r.spec, stlBase64: r.stlBase64, estimate: r.estimate } })
}

const errMsg = (e: unknown) => String((e as Error)?.message || e).slice(0, 300)
const TERMINAL_FAIL = new Set(['failed', 'cancelled', 'interrupted', 'lost'])

/** Run (or resume) the loop until it stops. Mutates and returns `st`; every step is saved. */
export async function driveLoop(st: LoopState, deps: LoopDeps): Promise<LoopState> {
  const cfg = st.config
  const spec = st.spec
  const obj = primary(spec)
  const upd = () => { st.updatedAt = deps.now(); deps.save?.(st); deps.onUpdate?.(st) }
  const log = (key: string, v?: LoopLog['v']) => { st.log.push({ t: deps.now(), key, ...(v ? { v } : {}) }); if (st.log.length > 300) st.log.splice(0, st.log.length - 300) }
  const finish = (reason: StopReason, status: LoopStatus = 'done'): LoopState => {
    st.best = selectBest(st)
    st.status = status; st.phase = 'end'; st.stop = reason; st.pendingStop = undefined
    log('lgStop', { reason })
    upd()
    return st
  }
  const elapsedOver = () => deps.now() - st.startedAt > cfg.maxMinutes * 60000
  const cancelPending = async () => {
    for (const r of st.rounds) for (const p of r.picks) {
      if (p.state === 'submitted' && p.jobId) { try { await deps.cfd.cancel(p.jobId) } catch { /* offline */ } p.state = 'failed'; p.error = 'cancelled' }
      if (p.state === 'planned') { p.state = 'failed'; p.error = 'not submitted' }
    }
  }
  const checkHealth = async (): Promise<CfdHealth> => { try { return await deps.cfd.health() } catch (e) { return { ok: false, running: [], queued: [], error: errMsg(e) } } }
  let delay = cfg.pollMs ?? 3000

  try {
    while (st.status === 'running') {
      if (st.cancelRequested) { await cancelPending(); return finish('cancelled', 'cancelled') }
      const round = st.rounds[st.rounds.length - 1]
      switch (st.phase) {
        case 'start': {
          if (st.rotor && !cfg.useRotorCfd) { st.mode = 'estimator'; st.modeReason = 'rotorOff' }
          else {
            const h = await checkHealth()
            if (h.ok) { st.mode = 'cfd'; st.modeReason = undefined }
            else { st.mode = 'estimator'; st.modeReason = h.blocked ? 'blocked' : 'offline' }
          }
          log(st.mode === 'cfd' ? 'lgModeCfd' : 'lgModeEst', st.modeReason ? { reason: st.modeReason } : undefined)
          st.phase = 'optimize'; upd()
          break
        }
        case 'optimize': {
          const r = st.rounds.length
          if (r >= cfg.rounds) return finish('rounds')
          if (elapsedOver()) return finish('time')
          if (st.mode === 'estimator' && (st.modeReason === 'offline' || st.modeReason === 'blocked') && r > 0) {
            const h = await checkHealth()
            if (h.ok) { st.mode = 'cfd'; st.modeReason = undefined; log('lgOnline') }
          }
          if (st.mode === 'cfd' && st.jobsUsed >= cfg.maxJobs) return finish('budget')
          const samples = collectSamples(st)
          const corr: Correction | null = samples.length ? fitCorrection(spec.kind, samples) : null
          log('lgOptimize', { round: r + 1, samples: samples.length })
          upd()
          const res = await deps.optimize(spec, { budget: cfg.budget, seed: cfg.seed + 1009 * r, topN: 40, correction: corr })
          if (st.cancelRequested) break
          const tested = allPicks(st).filter((a) => a.p.state === 'done').map((a) => a.p.u)
          const n = st.mode === 'cfd' ? Math.min(cfg.topN, cfg.maxJobs - st.jobsUsed) : cfg.topN
          const chosen = pickDiverse(spec, res.candidates, n, tested)
          if (!chosen.length) return finish('noFeasible')
          const picks: LoopPick[] = chosen.map((c) => {
            const u = c.u ?? encode(spec, c.x)
            const f = factorsAt(corr, u)
            const pred: Factors = {}
            for (const k of CORR_KEYS[spec.kind]) pred[k] = f[k] ?? 1
            const corrected = c.corrected ?? c.metrics
            return { cid: c.id, x: c.x, u, raw: c.metrics, corrected, pred, objRaw: c.metrics[obj.key], objEst: corrected[obj.key], feasibleEst: c.feasible, state: 'planned' }
          })
          st.rounds.push({ n: r + 1, mode: st.mode, startedAt: deps.now(), picks })
          log('lgPicked', { round: r + 1, n: picks.length, best: picks[0].objEst })
          st.phase = st.mode === 'cfd' ? 'submit' : 'roundEnd'
          upd()
          break
        }
        case 'submit': {
          const todo = round.picks.filter((p) => p.state === 'planned')
          let reqs: JobReq[] = []
          try {
            const cands: Candidate[] = todo.map((p) => ({ id: p.cid, x: p.x, metrics: p.raw, objectives: [], feasible: true, violation: 0, pareto: false }))
            reqs = (deps.buildJobs ?? defaultBuildJobs)(spec, cands, cfg.mesh, cfg.preset)
          } catch (e) {
            for (const p of todo) { p.state = 'failed'; p.error = `build: ${errMsg(e)}` }
            log('lgSubmitFail', { round: round.n, error: errMsg(e) })
          }
          for (let i = 0; i < reqs.length; i++) {
            if (st.cancelRequested) break
            const p = todo[i]
            try {
              const id = await deps.cfd.submit({ name: `${reqs[i].name}-r${round.n}`, spec: reqs[i].spec, stlBase64: reqs[i].stlBase64 })
              p.jobId = id; p.state = 'submitted'; p.estimate = reqs[i].estimate; p.stage = 'queued'; p.progress = 0
              st.jobsUsed++
              log('lgSubmit', { round: round.n, cid: p.cid, job: id })
            } catch (e) {
              p.state = 'failed'; p.error = `submit: ${errMsg(e)}`
              log('lgSubmitFail', { round: round.n, cid: p.cid, error: errMsg(e) })
            }
            upd()
          }
          if (st.cancelRequested) break
          st.phase = 'wait'; upd()
          break
        }
        case 'wait': {
          const pend = round.picks.filter((p) => p.state === 'submitted')
          if (!pend.length) { st.phase = 'roundEnd'; upd(); break }
          if (elapsedOver()) {
            for (const p of pend) { try { await deps.cfd.cancel(p.jobId!) } catch { /* offline */ } p.state = 'failed'; p.error = 'time budget' }
            st.pendingStop = 'time'; st.phase = 'roundEnd'; upd()
            break
          }
          let changed = false
          for (const p of pend) {
            try {
              const s = await deps.cfd.status(p.jobId!)
              if (s.stage !== p.stage || Math.abs((p.progress ?? 0) - s.progress) > 1e-3) changed = true
              p.stage = s.stage; p.progress = s.progress; p.queuePosition = s.queuePosition
              if (s.state === 'done') {
                try {
                  const res = await deps.cfd.result(p.jobId!)
                  p.cfd = res; p.state = 'done'; p.progress = 1
                  p.ratios = measuredRatios(spec.kind, p.estimate ?? {}, res)
                  p.verified = applyFactors(spec.kind, p.raw, p.ratios)
                  p.objCfd = p.verified[obj.key]
                  p.feasibleCfd = violationOf(spec, p.verified) <= 1e-9
                  changed = true
                  log('lgJobDone', { round: round.n, cid: p.cid, job: p.jobId!, obj: p.objCfd ?? NaN, est: p.objEst })
                } catch (e) { p.error = `result: ${errMsg(e)}` }   // retry next poll
              } else if (TERMINAL_FAIL.has(s.state)) {
                p.state = 'failed'; p.error = s.error ?? s.state; changed = true
                log('lgJobFail', { round: round.n, cid: p.cid, job: p.jobId!, error: String(p.error).slice(0, 160) })
              }
            } catch (e) { p.error = `poll: ${errMsg(e)}` }          // offline blip: keep waiting (time budget still applies)
          }
          upd()
          if (round.picks.some((p) => p.state === 'submitted')) {
            delay = changed ? (cfg.pollMs ?? 3000) : Math.min(15000, Math.round(delay * 1.5))
            await deps.sleep(delay)
          } else { st.phase = 'roundEnd'; upd() }
          break
        }
        case 'roundEnd': {
          round.finishedAt = deps.now()
          const done = round.picks.filter((p) => p.state === 'done')
          const feasE = round.picks.filter((p) => p.feasibleEst).map((p) => p.objEst)
          if (feasE.length) round.bestEst = feasE.reduce((a, b) => (scoreOf(spec, a) <= scoreOf(spec, b) ? a : b))
          if (done.length) {
            const pool = done.some((p) => p.feasibleCfd) ? done.filter((p) => p.feasibleCfd) : done
            const vals = pool.map((p) => p.objCfd).filter((v): v is number => v !== undefined && Number.isFinite(v))
            if (vals.length) round.bestCfd = vals.reduce((a, b) => (scoreOf(spec, a) <= scoreOf(spec, b) ? a : b))
            const pe: Factors = {}
            for (const k of CORR_KEYS[spec.kind]) {
              const errs = done.filter((p) => p.ratios?.[k] !== undefined).map((p) => Math.abs(Math.log(p.pred[k] ?? 1) - Math.log(p.ratios![k]!)))
              if (errs.length) pe[k] = errs.reduce((a, b) => a + b, 0) / errs.length
            }
            round.predErr = pe
          }
          const samples = collectSamples(st)
          if (samples.length) {
            const c = fitCorrection(spec.kind, samples)
            round.calib = {}
            for (const [k, m] of Object.entries(c.models) as [CorrKey, NonNullable<Correction['models'][CorrKey]>][]) round.calib[k] = { n: m.n, factor: Math.exp(m.mean) }
          }
          st.best = selectBest(st)
          round.bestSoFar = bestValue(st)
          const prev = st.rounds.length >= 2 ? st.rounds[st.rounds.length - 2].bestSoFar : undefined
          if (prev !== undefined && Number.isFinite(prev) && round.bestSoFar !== undefined && Number.isFinite(round.bestSoFar)) {
            round.improvement = (scoreOf(spec, prev) - scoreOf(spec, round.bestSoFar)) / Math.max(Math.abs(prev), 1e-12)
          }
          log('lgRound', { round: round.n, est: round.bestEst ?? NaN, cfd: round.bestCfd ?? NaN, best: round.bestSoFar ?? NaN })
          st.phase = 'optimize'
          if (round.mode === 'cfd' && !done.length && !st.pendingStop && !st.cancelRequested) return finish('cfdFailed', 'failed')
          if (st.pendingStop) return finish(st.pendingStop)
          if (round.improvement !== undefined && round.improvement < cfg.epsilon) return finish('converged')
          upd()
          break
        }
        default: return finish('error', 'failed')
      }
    }
  } catch (e) {
    st.error = errMsg(e)
    return finish('error', 'failed')
  }
  return st
}

/** Compact status for the AI Copilot / tests. */
export function loopSummary(st: LoopState | null | undefined) {
  if (!st) return { status: 'none' as const }
  const obj = primary(st.spec)
  const b = bestPick(st)
  return {
    status: st.status, phase: st.phase, mode: st.mode, modeReason: st.modeReason ?? null, stop: st.stop ?? null, error: st.error ?? null,
    template: st.spec.kind, title: st.spec.title, objective: `${obj.key} (${obj.sense})`,
    round: st.rounds.length, rounds: st.config.rounds, cfdJobsUsed: st.jobsUsed, cfdJobBudget: st.config.maxJobs,
    elapsedMin: Math.round((st.updatedAt - st.startedAt) / 6000) / 10,
    rotorCfdUnvalidated: st.rotor && st.mode === 'cfd',
    perRound: st.rounds.map((r) => ({
      round: r.n, mode: r.mode, bestEstimate: r.bestEst ?? null, bestCfd: r.bestCfd ?? null, bestSoFar: r.bestSoFar ?? null,
      jobs: r.picks.map((p) => ({ cid: p.cid, state: p.state, job: p.jobId ?? null, stage: p.stage ?? null, est: p.objEst, cfd: p.objCfd ?? null })),
      calibration: r.calib ?? null,
    })),
    best: b ? {
      verifiedByCfd: !!st.best?.verified, round: st.best!.round, candidate: b.cid, params: b.x,
      estimate: b.objRaw, correctedEstimate: b.objEst, cfd: b.objCfd ?? null,
      cfdRaw: b.cfd ? { Cd: b.cfd.Cd ?? null, Cl: b.cfd.Cl ?? null, dragN: b.cfd.dragN ?? null, thrustN: b.cfd.thrustN ?? null, powerW: b.cfd.powerW ?? null, eff: b.cfd.eff ?? null } : null,
    } : null,
  }
}
