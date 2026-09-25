// Aero Design Lab — hand-off of top candidates to CFD verification (tier 3: local GPU OpenFOAM
// service, built by another lane). This file only defines the case format + a client stub that
// fails gracefully, plus an offline ZIP (case.json + STL per candidate) fallback.
import { zipSync, strToU8 } from 'fflate'
import { designMesh, meshToStl } from './geometry'
import { paramsOf, type DesignSpec } from './designSpace'
import { fluidOf } from './fluids'
import type { Candidate } from './optimize/runner'

export const CFD_DEFAULT_URL = 'http://127.0.0.1:8765'
const LS_KEY = 'webcad.aero.cfdUrl'

export function getCfdUrl(): string {
  try { return localStorage.getItem(LS_KEY) || CFD_DEFAULT_URL } catch { return CFD_DEFAULT_URL }
}
export function setCfdUrl(url: string): void {
  try { localStorage.setItem(LS_KEY, url) } catch { /* private mode */ }
}

export interface CfdCase {
  schema: 'webcad.aero.cfd-case/1'
  createdAt: string
  kind: DesignSpec['kind']
  title: string
  units: 'mm'
  frame: { up: 'Z'; flowAxis: 'X' | 'Z'; note: string }
  fluid: { kind: 'air' | 'water'; rho: number; mu: number }
  operating: Record<string, number | string>
  objectives: DesignSpec['objectives']
  constraints: DesignSpec['constraints']
  candidates: { id: number; params: Record<string, number | string>; estimate: Record<string, number>; stlFile: string; stlBase64?: string }[]
}

function b64(buf: ArrayBuffer): string {
  const u = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
  return btoa(s)
}

export function buildCfdCase(spec: DesignSpec, cands: Candidate[], embedStl: boolean): { caseJson: CfdCase; stls: Record<string, ArrayBuffer> } {
  const fl = fluidOf(String(spec.fixed.fluid ?? 'air'))
  const stls: Record<string, ArrayBuffer> = {}
  const frame = spec.kind === 'prop'
    ? { up: 'Z' as const, flowAxis: 'Z' as const, note: 'rotation axis +Z, thrust +Z (air leaves toward −Z), CCW seen from +Z; hub at origin' }
    : spec.kind === 'wing'
      ? { up: 'Z' as const, flowAxis: 'X' as const, note: 'freestream +X, span ±Y, lift +Z; AoA from the Aero Lab estimate (see estimate.alpha)' }
      : { up: 'Z' as const, flowAxis: 'X' as const, note: 'body axis +X, nose at x=0, freestream +X' }
  const caseJson: CfdCase = {
    schema: 'webcad.aero.cfd-case/1', createdAt: new Date().toISOString(),
    kind: spec.kind, title: spec.title, units: 'mm', frame,
    fluid: { kind: fl.kind, rho: fl.rho, mu: fl.mu },
    operating: { ...spec.fixed },
    objectives: spec.objectives, constraints: spec.constraints,
    candidates: cands.map((c) => {
      const file = `candidate_${c.id}.stl`
      const stl = meshToStl(designMesh(spec, c.x), `${spec.kind}-${c.id}`)
      stls[file] = stl
      return { id: c.id, params: paramsOf(spec, c.x), estimate: c.metrics, stlFile: file, ...(embedStl ? { stlBase64: b64(stl) } : {}) }
    }),
  }
  return { caseJson, stls }
}

/** POST {url}/jobs with the case (STLs embedded as base64). Never throws. */
export async function sendToCfd(url: string, spec: DesignSpec, cands: Candidate[], timeoutMs = 5000): Promise<{ ok: boolean; jobId?: string; error?: string }> {
  const { caseJson } = buildCfdCase(spec, cands, true)
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetch(url.replace(/\/$/, '') + '/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(caseJson), signal: ctl.signal })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const data = await res.json().catch(() => ({}))
    return { ok: true, jobId: String((data as { id?: string; jobId?: string }).id ?? (data as { jobId?: string }).jobId ?? '') }
  } catch (e) {
    return { ok: false, error: (e as Error)?.name === 'AbortError' ? 'timeout' : String((e as Error)?.message || e) }
  } finally { clearTimeout(timer) }
}

/** Offline fallback: ZIP with case.json + one STL per candidate. */
export function cfdCaseZip(spec: DesignSpec, cands: Candidate[]): Uint8Array {
  const { caseJson, stls } = buildCfdCase(spec, cands, false)
  const files: Record<string, Uint8Array> = { 'case.json': strToU8(JSON.stringify(caseJson, null, 2)) }
  for (const [k, v] of Object.entries(stls)) files[k] = new Uint8Array(v)
  return zipSync(files, { level: 6 })
}
