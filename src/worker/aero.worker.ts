/// <reference lib="webworker" />
// Aero Design Lab optimizer worker — CMA-ES / NSGA-II over BEMT / VLM / shell-drag models.
// Separate from the OCCT kernel worker so a long optimisation never blocks geometry rebuilds.
// Cancel = terminate the worker (aeroClient recreates it lazily).
import { expose } from 'comlink'
import { runAeroOptimization, type AeroProgress, type AeroRunOptions, type AeroRunResult } from '../aero/optimize/runner'
import { evaluateSpec, type DesignSpec, type Evaluation } from '../aero/designSpace'

const api = {
  run(spec: DesignSpec, opts: AeroRunOptions, onProgress?: (p: AeroProgress) => void): AeroRunResult {
    let last = 0
    return runAeroOptimization(spec, opts, (p) => {
      const now = Date.now()
      if (onProgress && (now - last > 120 || p.pct >= 100)) { last = now; onProgress(p) }
    })
  },
  evaluate(spec: DesignSpec, x: Record<string, number>): Evaluation {
    return evaluateSpec(spec, x)
  },
}

export type AeroWorkerAPI = typeof api
expose(api)
