// Aero Design Lab — CFD correction model: one surrogate per CFD-measured quantity
// (log CFD/estimate vs normalised design variables) → multiplicative factors on the estimator's metrics.
// Serialisable (goes through the optimiser worker's structured clone).
import type { AeroKind, Metrics } from './designSpace'
import { fitSurrogate, predictSurrogate, type Surrogate } from './surrogate'

export type CorrKey = 'Cd' | 'Cl' | 'thrustN' | 'powerW' | 'eff'
export type Factors = Partial<Record<CorrKey, number>>
export const CORR_KEYS: Record<AeroKind, CorrKey[]> = { shell: ['Cd'], wing: ['Cd', 'Cl'], prop: ['thrustN', 'powerW', 'eff'] }

export interface Correction { kind: AeroKind; models: Partial<Record<CorrKey, Surrogate>> }
export interface CorrSample { u: number[]; ratios: Factors }

/** Fit one surrogate per quantity from the samples that carry a positive finite ratio for it. */
export function fitCorrection(kind: AeroKind, samples: CorrSample[]): Correction {
  const models: Correction['models'] = {}
  for (const k of CORR_KEYS[kind]) {
    const rows = samples.filter((s) => Number.isFinite(s.ratios[k]) && (s.ratios[k] as number) > 0)
    if (!rows.length) continue
    models[k] = fitSurrogate(rows.map((s) => s.u), rows.map((s) => Math.log(s.ratios[k] as number)))
  }
  return { kind, models }
}

export function factorsAt(c: Correction | null | undefined, u: number[]): Factors {
  const f: Factors = {}
  if (!c) return f
  for (const [k, m] of Object.entries(c.models) as [CorrKey, Surrogate][]) f[k] = Math.exp(predictSurrogate(m, u).mean)
  return f
}

/** Metrics after applying quantity factors (missing factor = 1). Used both for the surrogate
 *  prediction (factors = e^GP) and for CFD-verified metrics (factors = measured CFD/estimate). */
export function applyFactors(kind: AeroKind, m: Metrics, f: Factors): Metrics {
  const g = (k: CorrKey) => { const v = f[k]; return v !== undefined && Number.isFinite(v) && v > 0 ? v : 1 }
  const o: Metrics = { ...m }
  const mul = (key: string, x: number) => { if (key in o && Number.isFinite(o[key])) o[key] = o[key] * x }
  if (kind === 'shell') {
    for (const k of ['CD', 'CDwet', 'drag', 'dragPerVol']) mul(k, g('Cd'))
  } else if (kind === 'wing') {
    const fd = g('Cd'), fl = g('Cl')
    mul('CD', fd); mul('drag', fd); mul('CDi', fd); mul('CL', fl); mul('LD', fl / fd)
  } else {
    mul('thrust', g('thrustN')); mul('CT', g('thrustN'))
    mul('power', g('powerW')); mul('CP', g('powerW')); mul('torque', g('powerW'))
    for (const k of ['eff', 'eta', 'FM']) mul(k, g('eff'))
  }
  return o
}

/** Estimator value of each correction quantity (what the CFD ratio is measured against). */
export function estimateQuantity(kind: AeroKind, m: Metrics, k: CorrKey): number | undefined {
  const v = kind === 'prop'
    ? (k === 'thrustN' ? m.thrust : k === 'powerW' ? m.power : k === 'eff' ? m.eff : undefined)
    : (k === 'Cd' ? m.CD : k === 'Cl' ? m.CL : undefined)
  return v !== undefined && Number.isFinite(v) ? v : undefined
}
