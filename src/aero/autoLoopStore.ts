// Aero Design Lab — browser wiring of the auto-design loop: zustand mirror of the LoopState,
// localStorage persistence (a reload resumes watching), real optimiser worker + OpenFOAM client.
import { create } from 'zustand'
import { driveLoop, newLoopState, type CfdClient, type LoopConfig, type LoopDeps, type LoopState } from './autoLoop'
import { cancelJob, cfdHealth, getJobResult, getJobStatus, submitJob } from './cfdService'
import { getCfdUrl } from './cfdExport'
import { runAeroOnce } from './aeroClient'
import { LS_AUTO_LOOP } from './aeroUiStore'
import type { DesignSpec } from './designSpace'

const load = (): LoopState | null => { try { const s = JSON.parse(localStorage.getItem(LS_AUTO_LOOP) || 'null'); return s && s.v === 1 ? s : null } catch { return null } }
const save = (st: LoopState | null) => { try { if (st) localStorage.setItem(LS_AUTO_LOOP, JSON.stringify(st)); else localStorage.removeItem(LS_AUTO_LOOP) } catch { /* private mode / quota */ } }

export const useAutoLoop = create<{ state: LoopState | null; driving: boolean }>(() => ({ state: load(), driving: false }))

let live: LoopState | null = null   // the object the driver mutates

export function cfdClient(url: string): CfdClient {
  return {
    health: () => cfdHealth(url),
    submit: (req) => submitJob(url, req),
    status: (id) => getJobStatus(url, id),
    result: (id) => getJobResult(url, id),
    cancel: (id) => cancelJob(url, id),
  }
}

function deps(url: string): LoopDeps {
  return {
    optimize: (spec, opts) => runAeroOnce(spec, opts),
    cfd: cfdClient(url),
    now: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    save: (st) => save(st),
    onUpdate: (st) => useAutoLoop.setState({ state: JSON.parse(JSON.stringify(st)) }),
  }
}

async function drive(st: LoopState): Promise<LoopState> {
  if (useAutoLoop.getState().driving) return st
  live = st
  useAutoLoop.setState({ driving: true, state: JSON.parse(JSON.stringify(st)) })
  try { return await driveLoop(st, deps(st.config.url ?? getCfdUrl())) }
  finally { live = null; useAutoLoop.setState({ driving: false, state: JSON.parse(JSON.stringify(st)) }) }
}

/** Start a new loop (replaces a finished one; refuses while one is running). Resolves when the mode is decided. */
export async function startAutoLoop(spec: DesignSpec, cfg: Partial<LoopConfig>): Promise<LoopState> {
  const cur = useAutoLoop.getState().state
  if (cur?.status === 'running') throw new Error('an auto-design loop is already running')
  const st = newLoopState(spec, { ...cfg, url: cfg.url ?? getCfdUrl() }, Date.now())
  save(st)
  const done = drive(st)
  // wait until the loop has decided CFD vs estimator mode (health check), so callers can report it
  for (let i = 0; i < 100 && st.phase === 'start' && st.status === 'running'; i++) await new Promise((r) => setTimeout(r, 50))
  void done
  return JSON.parse(JSON.stringify(st))
}

/** After a reload: continue a persisted running loop (idempotent). */
export function resumeAutoLoop(): void {
  const st = useAutoLoop.getState().state
  if (st?.status === 'running' && !useAutoLoop.getState().driving) void drive(JSON.parse(JSON.stringify(st)))
}

export function stopAutoLoop(): void {
  if (live) { live.cancelRequested = true; return }
  const st = useAutoLoop.getState().state
  if (st?.status === 'running') { const s = JSON.parse(JSON.stringify(st)) as LoopState; s.cancelRequested = true; void drive(s) }
}

export function clearAutoLoop(): void {
  if (useAutoLoop.getState().state?.status === 'running') return
  save(null)
  useAutoLoop.setState({ state: null })
}

export const currentLoop = (): LoopState | null => useAutoLoop.getState().state
