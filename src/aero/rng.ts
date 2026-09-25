// Aero Design Lab — deterministic seeded RNG (mulberry32 + Box-Muller).
// Every optimizer run with the same seed reproduces bit-identical results.

export interface Rng {
  /** uniform [0,1) */
  next(): number
  /** standard normal N(0,1) */
  normal(): number
  /** integer in [lo, hi] inclusive */
  int(lo: number, hi: number): number
}

export function makeRng(seed: number): Rng {
  let a = (Math.floor(seed) >>> 0) || 0x9e3779b9
  let spare: number | null = null
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const normal = (): number => {
    if (spare !== null) { const s = spare; spare = null; return s }
    let u: number, v: number, s: number
    do { u = next() * 2 - 1; v = next() * 2 - 1; s = u * u + v * v } while (s >= 1 || s === 0)
    const m = Math.sqrt(-2 * Math.log(s) / s)
    spare = v * m
    return u * m
  }
  return { next, normal, int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)) }
}
