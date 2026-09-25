// Aero Design Lab — main-thread clients for the optimizer worker and the CAD (OCCT) worker.
// Same pattern as analysis/windClient.ts: lazily created comlink singletons, progress via proxy.
import { wrap, proxy, type Remote } from 'comlink'
import type { AeroWorkerAPI } from '../worker/aero.worker'
import type { AeroCadWorkerAPI } from '../worker/aerocad.worker'
import type { AeroProgress, AeroRunOptions, AeroRunResult } from './optimize/runner'
import type { DesignSpec } from './designSpace'

let optWorker: Worker | null = null
let optApi: Remote<AeroWorkerAPI> | null = null
let cadWorker: Worker | null = null
let cadApi: Remote<AeroCadWorkerAPI> | null = null

function opt(): Remote<AeroWorkerAPI> {
  if (!optApi) {
    optWorker = new Worker(new URL('../worker/aero.worker.ts', import.meta.url), { type: 'module', name: 'aero' })
    optApi = wrap<AeroWorkerAPI>(optWorker)
  }
  return optApi
}

export async function runAero(spec: DesignSpec, opts: AeroRunOptions, onProgress?: (p: AeroProgress) => void): Promise<AeroRunResult> {
  return opt().run(spec, opts, onProgress ? proxy(onProgress) : undefined)
}

/** One optimisation on a dedicated worker (terminated afterwards) — used by the auto-design loop so
 *  the lab's own Run/Stop (which terminates the shared worker) can never strand a loop round. */
export async function runAeroOnce(spec: DesignSpec, opts: AeroRunOptions): Promise<AeroRunResult> {
  const w = new Worker(new URL('../worker/aero.worker.ts', import.meta.url), { type: 'module', name: 'aero-loop' })
  try { return await wrap<AeroWorkerAPI>(w).run(spec, opts) } finally { w.terminate() }
}

/** Stop a running optimisation (terminates the worker; the pending promise never resolves → caller ignores it). */
export function cancelAero(): void {
  optWorker?.terminate()
  optWorker = null; optApi = null
}

export async function buildAeroCad(spec: DesignSpec, x: Record<string, number>): Promise<{ step: string; volume: number; vertices: Float32Array; triangles: Uint32Array }> {
  if (!cadApi) {
    cadWorker = new Worker(new URL('../worker/aerocad.worker.ts', import.meta.url), { type: 'module', name: 'aerocad' })
    cadApi = wrap<AeroCadWorkerAPI>(cadWorker)
  }
  return cadApi.build(spec, x)
}

/** Free the Aero CAD worker's OCCT heap (called when the panel closes). */
export function disposeAeroWorkers(): void {
  cadWorker?.terminate(); cadWorker = null; cadApi = null
  cancelAero()
}
