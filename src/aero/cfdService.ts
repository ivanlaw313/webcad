// Local OpenFOAM verification service client (C:\ClaudeCode\aero-cfd-service, default
// http://127.0.0.1:8765). Pure spec mapping (node-tested) + thin fetch wrappers.
// API (server.mjs / src/jobs.mjs / src/externalCase.mjs / src/rotorCase.mjs / src/results.mjs):
//   GET /health · POST /jobs {name, stlBase64, spec} → 202 {id} · GET /jobs/:id (state, stage, progress, live)
//   GET /jobs/:id/result (409 while running) · DELETE /jobs/:id
// Frames: the service takes flowDirection/liftDirection (external) or axis (= inflow; thrust > 0 pushes
// fluid toward +axis; rpm right-handed about axis) in MODEL coordinates, STL units mm.
import type { CfdCase } from './cfdExport'

export type CfdPreset = 'bluff-lowRe' | 'fast-rans'
export type CfdMesh = 'coarse' | 'medium' | 'fine'
export type CfdPresetChoice = CfdPreset | 'auto'

export interface ExternalSpec {
  kind: 'external'
  velocity: number
  fluid: 'air' | 'water'
  flowDirection: [number, number, number]
  liftDirection: [number, number, number]
  units: 'mm'
  mesh: CfdMesh
  preset?: CfdPreset
  refArea?: number     // m²
  refLength?: number   // m
}
export interface RotorSpec {
  kind: 'rotor'
  rpm: number
  axis: [number, number, number]
  inflowVelocity: number
  diameter: number     // m
  centre: [number, number, number]   // model units (mm)
  fluid: 'air' | 'water'
  units: 'mm'
  mesh: CfdMesh
}
export type ServiceSpec = ExternalSpec | RotorSpec

/** What the lab predicted, in the same quantities the CFD result reports (for the ratio column). */
export interface CfdEstimate { Cd?: number; Cl?: number; thrustN?: number; powerW?: number; eff?: number; dragN?: number }

export interface CfdJobRequest {
  name: string
  candidateId: number
  spec: ServiceSpec
  stlBase64: string
  estimate: CfdEstimate
  reynolds?: number
}

const NU: Record<'air' | 'water', number> = { air: 1.5e-5, water: 1e-6 }   // service FLUIDS (externalCase.mjs)
const num = (v: unknown, d = NaN): number => { const n = Number(v); return Number.isFinite(n) ? n : d }
const round = (v: number, k = 6): number => Math.round(v * 10 ** k) / 10 ** k

/** 'auto' → the validated laminar-transient setup for Re < 3e5 (service warns against steady RANS there), else SST. */
export function pickPreset(choice: CfdPresetChoice, reynolds: number): CfdPreset {
  if (choice !== 'auto') return choice
  return Number.isFinite(reynolds) && reynolds >= 3e5 ? 'fast-rans' : 'bluff-lowRe'
}

/** Wing AoA → freestream direction in the lab frame (+X chord, +Z up): relative wind from below-front. */
export function flowDirForAlpha(alphaDeg: number): [number, number, number] {
  const a = (alphaDeg || 0) * Math.PI / 180
  return [round(Math.cos(a)), 0, round(Math.sin(a))]
}

/** Map one candidate of a `webcad.aero.cfd-case/1` case to a service job request. */
export function jobFromCase(c: CfdCase, idx: number, opts: { mesh: CfdMesh; preset: CfdPresetChoice }): CfdJobRequest {
  const cand = c.candidates[idx]
  if (!cand) throw new Error(`candidate index ${idx} out of range`)
  if (!cand.stlBase64) throw new Error('case built without embedded STL')
  const fluid: 'air' | 'water' = c.fluid.kind === 'water' ? 'water' : 'air'
  const p = cand.params, est = cand.estimate
  const V = num(p.V ?? c.operating.V, 0)
  const name = `webcad-${c.kind}-${cand.id}`
  if (c.kind === 'prop') {
    // Lab frame: axis +Z, thrust +Z on the rotor (air leaves toward −Z), CCW seen from +Z.
    // Service: axis = inflow direction; thrust > 0 when fluid is pushed toward +axis; rpm right-handed about axis.
    // → axis −Z, and CCW-about-+Z is left-handed about −Z → negative rpm.
    const rpm = num(p.rpm ?? c.operating.rpm)
    const D = num(p.diameter ?? c.operating.diameter) / 1000
    const eff = V > 0.5 ? est.eta : est.FM
    return {
      name, candidateId: cand.id, stlBase64: cand.stlBase64,
      spec: { kind: 'rotor', rpm: -rpm, axis: [0, 0, -1], inflowVelocity: Math.max(0, V), diameter: round(D), centre: [0, 0, 0], fluid, units: 'mm', mesh: opts.mesh },
      estimate: { thrustN: est.thrust, powerW: est.power, eff: Number.isFinite(eff) ? eff : est.eff },
    }
  }
  if (c.kind === 'wing') {
    const areaM2 = num(est.area) * 1e-6
    const span = num(p.span ?? c.operating.span) / 1000
    const mac = areaM2 > 0 && span > 0 ? areaM2 / span : num(p.rootChord) / 1000
    const re = V * mac / NU[fluid]
    return {
      name, candidateId: cand.id, stlBase64: cand.stlBase64, reynolds: re,
      spec: {
        kind: 'external', velocity: V, fluid, flowDirection: flowDirForAlpha(num(est.alpha, 0)), liftDirection: [0, 0, 1], units: 'mm', mesh: opts.mesh,
        preset: pickPreset(opts.preset, re),
        ...(areaM2 > 0 ? { refArea: round(areaM2, 8) } : {}), ...(mac > 0 ? { refLength: round(mac) } : {}),
      },
      estimate: { Cd: est.CD, Cl: est.CL, dragN: est.drag },
    }
  }
  // shell: body axis +X, nose at x=0, freestream +X. Lab CD is on the frontal area π(D/2)².
  const D = num(p.diameter) / 1000, L = num(p.length) / 1000
  const re = V * L / NU[fluid]
  return {
    name, candidateId: cand.id, stlBase64: cand.stlBase64, reynolds: re,
    spec: {
      kind: 'external', velocity: V, fluid, flowDirection: [1, 0, 0], liftDirection: [0, 0, 1], units: 'mm', mesh: opts.mesh,
      preset: pickPreset(opts.preset, re),
      ...(D > 0 ? { refArea: round(Math.PI * D * D / 4, 8) } : {}), ...(L > 0 ? { refLength: round(L) } : {}),
    },
    estimate: { Cd: est.CD, dragN: est.drag },
  }
}

/** Wind-tunnel panel → external spec. axis null = the tunnel's auto (longest bbox axis); sign +1 = flow toward +axis. */
export function windSpec(o: { vertices: ArrayLike<number>; speed: number; fluid: 'air' | 'water'; axis: 0 | 1 | 2 | null; sign: number; mesh: CfdMesh; preset: CfdPresetChoice }): { spec: ExternalSpec; axis: 0 | 1 | 2; reynolds: number } {
  const v = o.vertices
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i + 2 < v.length; i += 3) for (let k = 0; k < 3; k++) { const x = v[i + k]; if (x < mn[k]) mn[k] = x; if (x > mx[k]) mx[k] = x }
  const ext = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]]
  const axis: 0 | 1 | 2 = o.axis ?? (ext[0] >= ext[1] && ext[0] >= ext[2] ? 0 : ext[1] >= ext[2] ? 1 : 2)
  const s = o.sign < 0 ? -1 : 1
  const flow: [number, number, number] = [0, 0, 0]; flow[axis] = s
  // lift "up" = +Z unless the flow is along Z, then +Y (the service orthogonalises anyway)
  const lift: [number, number, number] = axis === 2 ? [0, 1, 0] : [0, 0, 1]
  const L = Math.max(...ext) / 1000
  const reynolds = o.speed * L / NU[o.fluid]
  return { axis, reynolds, spec: { kind: 'external', velocity: o.speed, fluid: o.fluid, flowDirection: flow, liftDirection: lift, units: 'mm', mesh: o.mesh, preset: pickPreset(o.preset, reynolds) } }
}

// ── result summary (what the UI + calibration need; full JSON stays on the service) ──
export interface CfdSummary {
  kind: 'external' | 'rotor'
  Cd?: number; Cl?: number; CdStd?: number; dragN?: number; liftN?: number
  thrustN?: number; torqueNm?: number; powerW?: number; eff?: number; effKind?: 'eta' | 'FM'
  reynolds?: number; cells?: number; runtimeS?: number
  converged: boolean
  warnings: string[]
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function summarizeResult(r: any): CfdSummary {
  const conv = !!r?.convergence?.converged
  const warnings: string[] = Array.isArray(r?.warnings) ? r.warnings.map(String) : []
  const cells = Number.isFinite(Number(r?.mesh?.cells)) ? Number(r.mesh.cells) : undefined
  if (r?.kind === 'rotor') {
    const eta = num(r.efficiency), fm = num(r.figureOfMerit)
    return {
      kind: 'rotor', thrustN: num(r.thrustN), torqueNm: num(r.torqueNm), powerW: num(r.powerW),
      eff: Number.isFinite(eta) ? eta : Number.isFinite(fm) ? fm : undefined, effKind: Number.isFinite(eta) ? 'eta' : Number.isFinite(fm) ? 'FM' : undefined,
      cells, runtimeS: num(r.runtimeSeconds), converged: conv, warnings,
    }
  }
  const f = r?.forcesN?.solverFrame
  return {
    kind: 'external', Cd: num(r?.coefficients?.Cd), Cl: num(r?.coefficients?.Cl), CdStd: num(r?.coefficients?.CdStd),
    dragN: f ? num(f.drag) : undefined, liftN: f ? num(f.lift) : undefined,
    reynolds: num(r?.reference?.reynolds), cells, runtimeS: num(r.runtimeSeconds), converged: conv, warnings,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** CFD / estimate (undefined when either side is missing or the estimate is ~0). */
export function ratio(cfd: number | undefined, est: number | undefined): number | undefined {
  if (cfd === undefined || est === undefined || !Number.isFinite(cfd) || !Number.isFinite(est) || Math.abs(est) < 1e-12) return undefined
  return cfd / est
}

// ── HTTP ──
export const CFD_START_HINT = 'C:\\ClaudeCode\\aero-cfd-service\\start-service.bat'
export interface CfdHealth { ok: boolean; openfoam?: string; cpus?: number; running: string[]; queued: string[]; error?: string; /** Chrome Local Network Access permission denied for this site (service may be running fine) */ blocked?: boolean }

/** Chrome ≥ 142 gates public-site → 127.0.0.1 requests behind the "Local network access" permission. 'denied' means the user (or an embedded browser) refused it. */
async function localNetworkDenied(): Promise<boolean> {
  const perms = (globalThis as { navigator?: Navigator }).navigator?.permissions
  if (!perms) return false
  for (const name of ['local-network-access', 'loopback-network']) {
    try { if ((await perms.query({ name } as unknown as PermissionDescriptor)).state === 'denied') return true } catch { /* unknown permission name in this browser */ }
  }
  return false
}
export type JobState = 'queued' | 'running' | 'done' | 'failed' | 'cancelled' | 'interrupted' | 'lost'
export interface JobStatus { state: JobState; stage: string; progress: number; queuePosition?: number; liveCd?: number; liveCl?: number; error?: string; warning?: string; startedAt?: string; finishedAt?: string }

const base = (url: string) => url.replace(/\/+$/, '')

async function timed(url: string, init: RequestInit = {}, ms = 8000): Promise<Response> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), ms)
  try { return await fetch(url, { ...init, signal: ctl.signal }) } finally { clearTimeout(t) }
}

export async function cfdHealth(url: string, ms = 4000): Promise<CfdHealth> {
  try {
    const r = await timed(`${base(url)}/health`, {}, ms)
    if (!r.ok) return { ok: false, running: [], queued: [], error: `HTTP ${r.status}` }
    const j = await r.json()
    return { ok: !!j.ok, openfoam: j.openfoam?.version ?? undefined, cpus: j.openfoam?.cpus ?? undefined, running: j.queue?.running ?? [], queued: j.queue?.queued ?? [], error: j.ok ? undefined : 'OpenFOAM unavailable' }
  } catch (e) {
    const blocked = await localNetworkDenied()
    return { ok: false, running: [], queued: [], blocked, error: (e as Error)?.name === 'AbortError' ? 'timeout' : String((e as Error)?.message || e) }
  }
}

export async function submitJob(url: string, req: { name: string; spec: ServiceSpec; stlBase64: string }): Promise<string> {
  const r = await timed(`${base(url)}/jobs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: req.name, stlBase64: req.stlBase64, spec: req.spec }) }, 60000)
  const j = await r.json().catch(() => ({}))
  if (r.status !== 202 && !r.ok) throw new Error(String(j.error || `HTTP ${r.status}`))
  if (!j.id) throw new Error('service returned no job id')
  return String(j.id)
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function parseStatus(s: any): JobStatus {
  const live = s?.live ?? {}
  return {
    state: s?.state ?? 'queued', stage: String(s?.stage ?? s?.state ?? ''), progress: Math.max(0, Math.min(1, num(s?.progress, 0))),
    queuePosition: s?.queuePosition, liveCd: Number.isFinite(Number(live.Cd)) ? Number(live.Cd) : undefined, liveCl: Number.isFinite(Number(live.Cl)) ? Number(live.Cl) : undefined,
    error: s?.error ?? undefined, warning: s?.warning ?? undefined, startedAt: s?.startedAt, finishedAt: s?.finishedAt,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function getJobStatus(url: string, id: string): Promise<JobStatus> {
  const r = await timed(`${base(url)}/jobs/${encodeURIComponent(id)}`)
  if (r.status === 404) return { state: 'lost', stage: 'lost', progress: 0, error: 'job not found on service' }
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return parseStatus(await r.json())
}

export async function getJobResult(url: string, id: string): Promise<CfdSummary> {
  const r = await timed(`${base(url)}/jobs/${encodeURIComponent(id)}/result`, {}, 15000)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return summarizeResult(await r.json())
}

export async function cancelJob(url: string, id: string): Promise<void> {
  await timed(`${base(url)}/jobs/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/** Poll delay: fast while something changes, backing off to 15 s when idle, 30 s when unreachable. */
export function nextDelay(prev: number, changed: boolean, failed: boolean): number {
  if (failed) return Math.min(30000, Math.max(4000, prev * 2))
  if (changed) return 2000
  return Math.min(15000, Math.round(prev * 1.5))
}

export function b64FromBuffer(buf: ArrayBuffer): string {
  const u = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
  return btoa(s)
}
