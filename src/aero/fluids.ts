// Aero Design Lab — fluid properties (SI). Same values as the LBM wind tunnel (20 °C).

export type AeroFluidKind = 'air' | 'water'
export interface AeroFluid { kind: AeroFluidKind; rho: number; mu: number; a: number }

export const AERO_FLUIDS: Record<AeroFluidKind, AeroFluid> = {
  air: { kind: 'air', rho: 1.204, mu: 1.81e-5, a: 343 },      // a = speed of sound m/s
  water: { kind: 'water', rho: 998, mu: 1.0e-3, a: 1482 },
}

export function fluidOf(kind: string | undefined): AeroFluid {
  return kind === 'water' ? AERO_FLUIDS.water : AERO_FLUIDS.air
}

export const reynolds = (f: AeroFluid, V: number, L: number): number => f.rho * Math.abs(V) * L / f.mu

/**
 * Flat-plate skin-friction coefficient (one side), laminar → turbulent blend.
 * Laminar Blasius 1.328/√Re; turbulent Prandtl–Schlichting with transition correction
 * (0.074/Re^0.2 − 1740/Re), never below laminar. Clamped for tiny Re.
 */
export function skinFriction(re: number): number {
  const R = Math.max(re, 1e3)
  const lam = 1.328 / Math.sqrt(R)
  if (R < 3e5) return lam
  const turb = 0.074 / Math.pow(R, 0.2) - 1740 / R
  return Math.max(lam, turb)
}

/** Fully turbulent (Schlichting) skin friction — used for bodies/hulls (tripped flow). */
export function skinFrictionTurbulent(re: number): number {
  const R = Math.max(re, 1e4)
  return 0.455 / Math.pow(Math.log10(R), 2.58)
}
