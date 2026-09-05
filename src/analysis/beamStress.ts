// Narrow-version structural check — self-written, license-safe (no deps). This is ANALYTIC EULER–BERNOULLI
// BEAM THEORY, NOT a 3D finite-element solver. It treats the part as a prismatic beam (length = longest bbox
// axis, rectangular section from the other two bbox dims) and reports max bending stress, tip deflection, and
// a safety factor vs the material yield. Correct & useful for beam-like parts (brackets, arms, shafts, rails);
// honestly wrong for blobby/short/complex parts (flagged in the UI). A real 3D FEM is out of scope for a
// dependency-free browser build.

export type Support = 'cantilever' | 'simply' // cantilever: fixed one end, load at free tip. simply: both ends supported, centre load.

// Young's modulus E (MPa = N/mm²) and yield strength σy (MPa) for the common maker materials. Conservative
// typical values — real stock varies; the readout says "估算".
// E (MPa), σy (MPa), ρ (g/cm³), α = linear thermal-expansion coefficient (×10⁻⁶ /°C).
// S183：se = 疲劳/耐久极限 (MPa)，su = 极限抗拉强度 (MPa)，用于 modified-Goodman 疲劳安全系数场。
// 保守典型值（实际随合金/批次差异大）；铝/聚合物无真·耐久拐点 → se 取 N-周估算（UI 诚实注明）。
export const MATERIAL_MECH: Record<string, { E: number; sy: number; rho: number; cte: number; se: number; su: number }> = {
  钢: { E: 200000, sy: 250, rho: 7.85, cte: 12, se: 200, su: 400 }, 不锈钢: { E: 193000, sy: 215, rho: 7.9, cte: 17, se: 240, su: 515 }, 铝: { E: 69000, sy: 95, rho: 2.7, cte: 23, se: 55, su: 150 },
  黄铜: { E: 100000, sy: 200, rho: 8.5, cte: 19, se: 100, su: 330 }, 铜: { E: 117000, sy: 70, rho: 8.96, cte: 17, se: 75, su: 210 }, 钛: { E: 116000, sy: 880, rho: 4.5, cte: 8.6, se: 500, su: 950 },
  ABS: { E: 2200, sy: 40, rho: 1.04, cte: 90, se: 14, su: 45 }, PLA: { E: 3500, sy: 55, rho: 1.24, cte: 68, se: 18, su: 60 }, PETG: { E: 2100, sy: 50, rho: 1.27, cte: 60, se: 16, su: 53 }, 尼龙: { E: 2000, sy: 45, rho: 1.14, cte: 80, se: 14, su: 50 },
}
export const DEFAULT_MECH = { E: 200000, sy: 250, rho: 7.85, cte: 12, se: 200, su: 400 } // steel fallback

export type BeamResult = {
  L: number; b: number; h: number      // beam length + section width/height (mm), h = bending depth
  I: number                            // 2nd moment of area (mm⁴)
  Mmax: number                         // max bending moment (N·mm)
  sigmaMax: number                     // max bending stress (MPa)
  deflMax: number                      // max deflection (mm)
  safety: number                       // σy / σmax  (>1 ok, <1 likely yields)
  support: Support
  // Column buckling (if the SAME load F is applied AXIALLY as compression): Euler critical load for a
  // pinned-pinned column about the WEAK axis, capped by the squash (yield) load for stubby columns.
  Imin: number                         // weak-axis 2nd moment (mm⁴) = h·b³/12
  area: number                         // section area (mm²)
  slenderness: number                  // λ = L / radius-of-gyration (high → slender → Euler governs)
  Pcr: number                          // Euler critical load π²E·Imin/L² (N)
  Pcrit: number                        // governing critical load = min(Pcr, σy·A) (N) — squash-capped
  bucklingSafety: number               // Pcrit / F  (>1 ok against buckling)
  freqHz: number                       // 1st bending natural frequency (Hz) — resonance avoidance
  loadCapacity: number                 // max transverse load F (N) before yield (σmax = σy), at this span/section
  Z: number                            // section modulus I/c (mm³) — standard bending section property
  selfWeightDefl: number               // sag under own weight (distributed load ρ·A·g) — mm
}

// Beam check from a bounding-box size [dx,dy,dz] (mm), point load F (N), support type, and material E/σy.
// The longest axis is the span L; the larger of the remaining two is the bending depth h, the smaller is b.
export type SectionShape = 'rect' | 'round' | 'tube'
export function beamCheck(size: [number, number, number], F: number, support: Support, E: number, sy: number, rho = 7.85, shape: SectionShape = 'rect', wallT = 2): BeamResult {
  const dims = size.map((d) => Math.max(0.1, d)) as [number, number, number]
  const L = Math.max(...dims)
  const rest = dims.filter((_, i) => i !== dims.indexOf(L))
  // (indexOf returns the FIRST max; if two axes tie for longest, rest still has 2 entries — fine.)
  const sec = (rest.length === 2 ? rest : [dims[0], dims[1]]).slice(0, 2)
  const h = Math.max(sec[0], sec[1])   // bending depth (resists the moment)
  const b = Math.min(sec[0], sec[1])   // width
  // Round: d=min cross dim, I=πd⁴/64. Tube: hollow round, di=d−2·wall, I=π(d⁴−di⁴)/64. Rect: I=bh³/12.
  const dRound = Math.min(h, b)
  const dIn = shape === 'tube' ? Math.max(0, dRound - 2 * Math.max(0.1, wallT)) : 0
  const I = shape === 'round' ? (Math.PI * dRound ** 4) / 64
    : shape === 'tube' ? (Math.PI * (dRound ** 4 - dIn ** 4)) / 64
    : (b * h * h * h) / 12
  const c = (shape === 'round' || shape === 'tube') ? dRound / 2 : h / 2
  const Fn = Math.max(0, F)
  // cantilever tip load: Mmax = F·L, δ = F·L³/(3EI). simply-supported centre load: Mmax = F·L/4, δ = F·L³/(48EI).
  const Mmax = support === 'cantilever' ? Fn * L : (Fn * L) / 4
  const deflMax = support === 'cantilever' ? (Fn * L ** 3) / (3 * E * I) : (Fn * L ** 3) / (48 * E * I)
  const sigmaMax = (Mmax * c) / I       // MPa (N·mm · mm / mm⁴ = N/mm²)
  const safety = sigmaMax > 1e-9 ? sy / sigmaMax : Infinity
  // Column buckling about the weak axis (Imin = h·b³/12), pinned-pinned K=1. Euler Pcr = π²EImin/L².
  // Euler overpredicts for short/stubby columns → cap by the squash load σy·A (material crushes first).
  const Imin = (shape === 'round' || shape === 'tube') ? I : (h * b * b * b) / 12   // round/tube axisymmetric (Imin = I)
  const area = shape === 'round' ? (Math.PI * dRound * dRound) / 4
    : shape === 'tube' ? (Math.PI * (dRound * dRound - dIn * dIn)) / 4
    : b * h
  const rGyr = Math.sqrt(Imin / Math.max(1e-9, area))
  const slenderness = L / Math.max(1e-9, rGyr)
  const Pcr = (Math.PI ** 2 * E * Imin) / (L * L)
  const Pcrit = Math.min(Pcr, sy * area)
  const bucklingSafety = Fn > 1e-9 ? Pcrit / Fn : Infinity
  // 1st bending natural frequency f1 = β²/(2π)·√(EI/(ρAL⁴)), β²=3.5160 cantilever / π² simply-supported.
  // SI: E[Pa]=E·1e6, I[m⁴]=I·1e-12, A[m²]=area·1e-6, L[m]=L·1e-3, ρ[kg/m³]=rho·1000.
  const k = Math.sqrt((E * 1e6 * I * 1e-12) / (rho * 1000 * area * 1e-6 * (L * 1e-3) ** 4))
  const beta2 = support === 'cantilever' ? 1.875104 ** 2 : Math.PI ** 2
  const freqHz = (beta2 / (2 * Math.PI)) * k
  // Allowable transverse load before yield: σmax = M·c/I = σy ⇒ Mallow = σy·I/c; cantilever Mmax=F·L,
  // simply Mmax=F·L/4 ⇒ Fallow = σy·I/(c·L) (cantilever) or 4·σy·I/(c·L) (simply).
  const Mallow = (sy * I) / c
  const loadCapacity = support === 'cantilever' ? Mallow / L : (4 * Mallow) / L
  const Z = I / c
  // Sag under own weight (uniformly distributed load w = ρ·A·g, N/mm). cantilever δ=wL⁴/(8EI), simply 5wL⁴/(384EI).
  const wPerMm = (rho * 1000) * (area * 1e-6) * 9.81 / 1000   // N/mm  (kg/m³·m²·g → N/m → /1000)
  const selfWeightDefl = support === 'cantilever' ? (wPerMm * L ** 4) / (8 * E * I) : (5 * wPerMm * L ** 4) / (384 * E * I)
  return { L, b, h, I, Mmax, sigmaMax, deflMax, safety, support, Imin, area, slenderness, Pcr, Pcrit, bucklingSafety, freqHz, loadCapacity, Z, selfWeightDefl }
}

export type TorsionResult = { tauMax: number; Jt: number; twistDeg: number; tauYield: number; safety: number }
// Torsion of a prismatic bar of rectangular section (a=long side, b=short) under torque T (N·mm), length L.
// τ_max ≈ T(3 + 1.8·b/a)/(a·b²) (Roark); torsion constant Jt = a·b³(1/3 − 0.21(b/a)(1 − b⁴/12a⁴));
// twist θ = T·L/(G·Jt), G = E/2(1+ν), ν=0.3. Yield in shear τ_y ≈ 0.577·σy (von Mises). Self-written, no deps.
export function torsionCheck(width: number, height: number, L: number, T: number, E: number, sy: number, shape: SectionShape = 'rect', wallT = 2): TorsionResult {
  const a = Math.max(width, height), b = Math.min(width, height)   // a = long side, b = short
  const Tn = Math.max(0, T), Ln = Math.max(0.1, L)
  const G = E / 2.6                                               // E/(2(1+0.3))
  if (shape === 'round' || shape === 'tube') {
    // Circular shaft d (tube: hollow di=d−2·wall): J = π(d⁴−di⁴)/32, τ_max = T·(d/2)/J.
    const d = b, di = shape === 'tube' ? Math.max(0, d - 2 * Math.max(0.1, wallT)) : 0
    const Jt = (Math.PI * (d ** 4 - di ** 4)) / 32
    const tauMax = Jt > 1e-9 ? (Tn * (d / 2)) / Jt : Infinity
    const twistDeg = (Tn * Ln) / (G * Jt) * (180 / Math.PI)
    const tauYield = 0.577 * sy
    return { tauMax, Jt, twistDeg, tauYield, safety: tauMax > 1e-9 ? tauYield / tauMax : Infinity }
  }
  const k = b / a
  const tauMax = Tn * (3 + 1.8 * k) / (a * b * b)                  // MPa
  const Jt = a * b * b * b * (1 / 3 - 0.21 * k * (1 - (b ** 4) / (12 * a ** 4)))
  const twistDeg = (Tn * Ln) / (G * Jt) * (180 / Math.PI)
  const tauYield = 0.577 * sy                                     // von Mises shear yield
  const safety = tauMax > 1e-9 ? tauYield / tauMax : Infinity
  return { tauMax, Jt, twistDeg, tauYield, safety }
}

// Bending stress at distance x from the FREE end (cantilever) or from a support (simply), for a colour map.
// Normalised 0..1 of sigmaMax so the viewport can tint without re-deriving units.
export function stressFractionAlong(x: number, L: number, support: Support): number {
  const t = Math.min(1, Math.max(0, x / Math.max(1e-9, L)))
  // cantilever: moment ∝ distance from the free tip → 0 at tip, 1 at the fixed root.
  // simply: moment ∝ triangular, peak at mid-span → 0 at the ends, 1 at centre.
  return support === 'cantilever' ? t : 1 - Math.abs(2 * t - 1)
}
