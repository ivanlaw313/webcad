// CFD verification job store: persisted in localStorage (a reload resumes polling), one poll loop
// with backoff for all active jobs, per-template calibration factors (CFD / engineering estimate).
import { create } from 'zustand'
import { getCfdUrl } from './cfdExport'
import { cancelJob, cfdHealth, getJobResult, getJobStatus, nextDelay, ratio, submitJob, type CfdEstimate, type CfdHealth, type CfdSummary, type JobState, type ServiceSpec } from './cfdService'

export type CfdSource = 'shell' | 'wing' | 'prop' | 'wind'
export interface CfdJob {
  id: string
  source: CfdSource
  label: string
  candidateId?: number
  url: string
  submittedAt: number
  preset?: string
  mesh?: string
  estimate: CfdEstimate            // lab estimate or LBM value (wind: Cd = LBM Cd)
  state: JobState
  stage: string
  progress: number
  queuePosition?: number
  liveCd?: number
  startedAt?: number
  finishedAt?: number
  error?: string
  result?: CfdSummary
  calibrated?: boolean             // already folded into the calibration table
}

/** Per-template calibration: running mean of CFD/estimate for each quantity. */
export type CalibTable = Partial<Record<CfdSource, Record<string, { f: number; n: number }>>>

const LS_JOBS = 'webcad.aero.cfdJobs'
const LS_CAL = 'webcad.aero.cfdCalib'
const load = <T>(k: string, d: T): T => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d } catch { return d } }
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* private mode */ } }

export const isActive = (j: CfdJob): boolean => j.state === 'queued' || j.state === 'running'

interface CfdStore {
  jobs: CfdJob[]
  calib: CalibTable
  health: CfdHealth | null
  checking: boolean
}
export const useCfdJobs = create<CfdStore>(() => ({ jobs: load<CfdJob[]>(LS_JOBS, []), calib: load<CalibTable>(LS_CAL, {}), health: null, checking: false }))

const persist = () => { const s = useCfdJobs.getState(); save(LS_JOBS, s.jobs.slice(0, 60)); save(LS_CAL, s.calib) }
const patch = (id: string, p: Partial<CfdJob>) => {
  useCfdJobs.setState((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...p } : j)) }))
  persist()
}

export async function checkHealth(url = getCfdUrl()): Promise<CfdHealth> {
  useCfdJobs.setState({ checking: true })
  const h = await cfdHealth(url)
  useCfdJobs.setState({ health: h, checking: false })
  return h
}

/** Quantities that get a calibration factor, per source. */
const CAL_KEYS: Record<CfdSource, (keyof CfdEstimate)[]> = { shell: ['Cd'], wing: ['Cd', 'Cl'], prop: ['thrustN', 'powerW', 'eff'], wind: ['Cd'] }
const resultValue = (r: CfdSummary, k: keyof CfdEstimate): number | undefined => (k === 'Cd' ? r.Cd : k === 'Cl' ? r.Cl : k === 'thrustN' ? r.thrustN : k === 'powerW' ? r.powerW : k === 'eff' ? r.eff : k === 'dragN' ? r.dragN : undefined)

function foldCalibration(j: CfdJob) {
  if (!j.result || j.calibrated) return
  const cal: CalibTable = { ...useCfdJobs.getState().calib }
  const row = { ...(cal[j.source] ?? {}) }
  for (const k of CAL_KEYS[j.source]) {
    const r = ratio(resultValue(j.result, k), j.estimate[k])
    if (r === undefined || !(r > 0)) continue   // sign flips (e.g. negative rotor thrust) are not a scale factor
    const o = row[k] ?? { f: 0, n: 0 }
    row[k] = { f: (o.f * o.n + r) / (o.n + 1), n: o.n + 1 }
  }
  cal[j.source] = row
  useCfdJobs.setState({ calib: cal })
  patch(j.id, { calibrated: true })
}

export function resetCalibration(source: CfdSource) {
  const cal = { ...useCfdJobs.getState().calib }
  delete cal[source]
  useCfdJobs.setState({ calib: cal, jobs: useCfdJobs.getState().jobs.map((j) => (j.source === source ? { ...j, calibrated: true } : j)) })
  persist()
}

export async function submitCfdJob(req: { source: CfdSource; label: string; candidateId?: number; spec: ServiceSpec; stlBase64: string; name: string; estimate: CfdEstimate }, url = getCfdUrl()): Promise<CfdJob> {
  const id = await submitJob(url, { name: req.name, spec: req.spec, stlBase64: req.stlBase64 })
  const job: CfdJob = {
    id, source: req.source, label: req.label, candidateId: req.candidateId, url, submittedAt: Date.now(),
    preset: req.spec.kind === 'external' ? req.spec.preset : 'rotor-MRF', mesh: req.spec.mesh,
    estimate: req.estimate, state: 'queued', stage: 'queued', progress: 0,
  }
  useCfdJobs.setState((s) => ({ jobs: [job, ...s.jobs] }))
  persist()
  kick()
  return job
}

export async function cancelCfdJob(id: string) {
  const j = useCfdJobs.getState().jobs.find((x) => x.id === id)
  if (!j) return
  try { await cancelJob(j.url, id) } catch { /* offline: still mark locally */ }
  patch(id, { state: 'cancelled', stage: 'cancelled', finishedAt: Date.now() })
}

export function removeCfdJob(id: string) {
  useCfdJobs.setState((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) }))
  persist()
}

// ── single poll loop ──
let timer: ReturnType<typeof setTimeout> | null = null
let delay = 2000
let polling = false

async function pollOnce(): Promise<{ changed: boolean; failed: boolean }> {
  let changed = false, failed = false
  for (const j of useCfdJobs.getState().jobs.filter(isActive)) {
    try {
      const s = await getJobStatus(j.url, j.id)
      const p: Partial<CfdJob> = { state: s.state, stage: s.stage, progress: s.progress, queuePosition: s.queuePosition, liveCd: s.liveCd ?? j.liveCd, error: s.error ?? undefined }
      if (s.startedAt && !j.startedAt) p.startedAt = Date.parse(s.startedAt)
      if (s.finishedAt) p.finishedAt = Date.parse(s.finishedAt)
      if (s.state !== j.state || s.stage !== j.stage || Math.abs(s.progress - j.progress) > 1e-4 || s.liveCd !== j.liveCd) changed = true
      if (s.state === 'done') {
        try { p.result = await getJobResult(j.url, j.id); if (s.warning) p.error = s.warning }
        catch (e) { p.state = 'running'; p.error = `result: ${String((e as Error)?.message || e)}`; failed = true }   // retry next poll
      }
      patch(j.id, p)
      const cur = useCfdJobs.getState().jobs.find((x) => x.id === j.id)
      if (cur?.result) foldCalibration(cur)
      if (cur && !isActive(cur)) void checkHealth(j.url)   // refresh the queue badge once a job ends
    } catch { failed = true }
  }
  return { changed, failed }
}

function schedule() {
  if (timer) clearTimeout(timer)
  if (!useCfdJobs.getState().jobs.some(isActive)) { timer = null; return }
  timer = setTimeout(async () => {
    timer = null
    if (polling) return
    polling = true
    try {
      const r = await pollOnce()
      delay = nextDelay(delay, r.changed, r.failed)
      if (r.failed) useCfdJobs.setState({ health: { ok: false, running: [], queued: [], error: 'unreachable' } })
    } finally { polling = false; schedule() }
  }, delay)
}

/** Start/refresh polling now (called on submit, on panel mount after a reload, on "refresh"). */
export function kick() { delay = 1500; schedule() }

/** Calibrated value = estimate × factor (factor 1 when no CFD data yet). */
export function calibrated(cal: CalibTable, source: CfdSource, key: keyof CfdEstimate, est: number | undefined): number | undefined {
  if (est === undefined || !Number.isFinite(est)) return undefined
  const f = cal[source]?.[key]?.f
  return f && f > 0 ? est * f : est
}

/** Objective value for ranking: CFD value when that candidate has a finished job, else estimate × calibration. */
export function calibratedMetric(kind: 'shell' | 'wing' | 'prop', key: string, m: Record<string, number>, cal: CalibTable, cfd?: CfdSummary): number | undefined {
  const f = (k: keyof CfdEstimate) => { const v = cal[kind]?.[k]?.f; return v && v > 0 ? v : 1 }
  const v = m[key]
  if (kind === 'shell') {
    if (key === 'CD') return cfd?.Cd ?? v * f('Cd')
    if (key === 'drag') return cfd?.dragN ?? v * f('Cd')
    if (key === 'dragPerVol') return cfd?.dragN !== undefined && m.drag ? v * cfd.dragN / m.drag : v * f('Cd')
  } else if (kind === 'wing') {
    if (key === 'CD') return cfd?.Cd ?? v * f('Cd')
    if (key === 'CL') return cfd?.Cl ?? v * f('Cl')
    if (key === 'LD') return cfd?.Cd && cfd.Cl !== undefined ? cfd.Cl / cfd.Cd : v * f('Cl') / f('Cd')
    if (key === 'drag') return v * f('Cd')
  } else {
    if (key === 'thrust') return cfd?.thrustN ?? v * f('thrustN')
    if (key === 'power') return cfd?.powerW ?? v * f('powerW')
    if (key === 'eff' || key === 'eta' || key === 'FM') return cfd?.eff ?? v * f('eff')
  }
  return v
}
