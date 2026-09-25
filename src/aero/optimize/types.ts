// Aero Design Lab — optimizer common types. Variables are normalised to u ∈ [0,1]^n.
export interface OptProblem {
  n: number
  /** f = objective vector to MINIMISE; viol = total constraint violation (0 = feasible) */
  evaluate(u: number[]): { f: number[]; viol: number }
}
export interface Individual { u: number[]; f: number[]; viol: number; rank?: number; crowd?: number }
export interface GenInfo {
  gen: number
  evals: number
  best: Individual | null          // best feasible-first (single objective) or null
  front: Individual[]              // current non-dominated set (multi-objective) / top few (single)
  population: Individual[]
}
export type GenCallback = (info: GenInfo) => void | boolean   // return false to stop

/** Feasibility-first comparison for single-objective ranking (Deb's rules). */
export function betterSO(a: Individual, b: Individual): boolean {
  if (a.viol <= 0 && b.viol <= 0) return a.f[0] < b.f[0]
  if (a.viol <= 0) return true
  if (b.viol <= 0) return false
  return a.viol < b.viol
}
export const soKey = (a: Individual): number => (a.viol > 0 ? 1e12 + a.viol : a.f[0])
