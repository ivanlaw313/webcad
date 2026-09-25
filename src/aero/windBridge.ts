// Aero Design Lab — "accurate mode": hand a candidate's mesh to the EXISTING in-browser LBM wind
// tunnel (analysis/windtunnel.ts via windClient/wind.worker — not modified here). Trend-level CFD:
// good for ranking a few shortlisted shells, not for absolute numbers.
import { runWind } from '../analysis/windClient'
import { designMesh } from './geometry'
import type { DesignSpec } from './designSpace'

export interface AccurateWind { cd: number; dragN: number; re: number; frontalMM2: number; converged: boolean; warnings: string[] }

export async function runAccurateWind(spec: DesignSpec, x: Record<string, number>, resolution = 32, onProgress?: (pct: number, note: string) => void): Promise<AccurateWind> {
  const m = designMesh(spec, x)
  const fluid = spec.fixed.fluid === 'water' ? 'water' : 'air'
  const V = Math.max(0.1, Number(spec.fixed.V) || (fluid === 'water' ? 2 : 10))
  const r = await runWind({
    vertices: new Float32Array(m.vertices), triangles: new Uint32Array(m.triangles),
    speed: V, fluid,
    axis: spec.kind === 'prop' ? 2 : 0,
    sign: spec.kind === 'prop' ? -1 : 1,
    resolution, maxRes: 48, onProgress,
  })
  return { cd: r.cd, dragN: r.dragN, re: r.re, frontalMM2: r.frontalAreaMM2, converged: r.converged, warnings: r.warnings }
}
