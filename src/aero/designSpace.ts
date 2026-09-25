// Aero Design Lab — design-space specification shared by templates, the AI brief parser,
// the optimizer worker and the UI. Plain JSON (structured-clone safe).
import { analyzeProp, pitchAngleDeg, type PropGeom } from './prop'
import { analyzeWing, type WingGeom } from './wing'
import { analyzeShell, type ShellGeom } from './shell'
import type { AeroFluidKind } from './fluids'

export type AeroKind = 'prop' | 'wing' | 'shell'
export interface VarDef { key: string; min: number; max: number; int?: boolean; value?: number }
export interface ObjDef { key: string; sense: 'max' | 'min' }
export interface ConDef { key: string; op: '>=' | '<='; value: number }
export interface DesignSpec {
  kind: AeroKind
  title: string
  fixed: Record<string, number | string>
  vars: VarDef[]
  objectives: ObjDef[]          // 1 → CMA-ES, ≥2 → NSGA-II
  constraints: ConDef[]
  source?: 'template' | 'ai' | 'fallback'
  brief?: string
}
export type Metrics = Record<string, number>
export interface Evaluation { metrics: Metrics; violation: number }

/** All variable keys, fixed keys and metric keys accepted per kind (used by the JSON validator). */
export const KIND_SCHEMA: Record<AeroKind, { vars: string[]; fixed: string[]; metrics: string[] }> = {
  prop: {
    vars: ['diameter', 'blades', 'pitchRatio', 'chord25', 'chord60', 'chord95', 'twistOffset', 'camber', 'thickness', 'rpm'],
    fixed: ['diameter', 'blades', 'rpm', 'V', 'fluid', 'hubRatio', 'camber', 'thickness', 'pitchRatio', 'material'],
    metrics: ['thrust', 'power', 'torque', 'eff', 'eta', 'FM', 'CT', 'CP', 'J', 'tipMach', 'noise', 'mass', 'stalled'],
  },
  wing: {
    vars: ['span', 'rootChord', 'taper', 'sweep', 'dihedral', 'twistTip', 'camber', 'camberPos', 'thickness'],
    fixed: ['span', 'V', 'fluid', 'massKg', 'rootChord', 'taper', 'sweep', 'dihedral', 'twistTip', 'camber', 'camberPos', 'thickness', 'planform'],
    metrics: ['LD', 'CL', 'CD', 'CDi', 'e', 'alpha', 'drag', 'stallMargin', 'area', 'AR', 'mass', 'rootMoment', 're'],
  },
  shell: {
    vars: ['length', 'diameter', 'xMax', 'noseExp', 'tailExp', 'baseFrac'],
    fixed: ['length', 'diameter', 'V', 'fluid', 'minVolumeL', 'wall', 'xMax', 'noseExp', 'tailExp', 'baseFrac'],
    metrics: ['drag', 'CD', 'CDwet', 'volumeL', 'fineness', 'mass', 'tailAngle', 're', 'dragPerVol'],
  },
}

const num = (v: unknown, d: number): number => { const n = Number(v); return Number.isFinite(n) ? n : d }

/** Merge fixed values + variable values into one parameter record. */
export function paramsOf(spec: DesignSpec, x: Record<string, number>): Record<string, number | string> {
  const p: Record<string, number | string> = { ...spec.fixed }
  for (const v of spec.vars) p[v.key] = x[v.key] ?? v.value ?? (v.min + v.max) / 2
  return p
}

// ── geometry builders (units: mm / deg in the spec → SI in the physics) ─────────────────────
export function propGeomOf(p: Record<string, number | string>): PropGeom {
  const D = num(p.diameter, 120) / 1000, R = D / 2
  const PD = num(p.pitchRatio, 0.8)
  const tw = num(p.twistOffset, 0)
  const c25 = num(p.chord25, 0.2), c60 = num(p.chord60, 0.2), c95 = num(p.chord95, 0.12)
  const hub = Math.min(0.5, Math.max(0.08, num(p.hubRatio, 0.2)))
  const rr = [hub, 0.25, 0.6, 0.95, 1.0].map((r) => Math.max(r, hub))
  const cc = [c25 * 0.9, c25, c60, c95, c95 * 0.7]
  return {
    diameter: D, hubDiameter: hub * D, blades: Math.round(num(p.blades, 3)),
    airfoil: { m: num(p.camber, 4) / 100, p: 0.4, t: num(p.thickness, 10) / 100 },
    stations: rr.map((rR, i) => ({ rR: i === 0 ? rR : Math.max(rR, rr[i - 1] + 1e-3), chord: cc[i] * R, twistDeg: pitchAngleDeg(PD * D, Math.max(rR, 0.05) * R) + tw })),
  }
}
export function wingGeomOf(p: Record<string, number | string>): WingGeom {
  return {
    span: num(p.span, 1200) / 1000,
    rootChord: num(p.rootChord, 200) / 1000,
    taper: Math.min(1, Math.max(0.1, num(p.taper, 0.6))),
    sweepLE: num(p.sweep, 0), dihedral: num(p.dihedral, 3), twistTip: num(p.twistTip, -2),
    planform: p.planform === 'elliptic' ? 'elliptic' : 'trapezoid',
    airfoil: { m: num(p.camber, 2) / 100, p: Math.min(0.7, Math.max(0.2, num(p.camberPos, 40) / 100)), t: num(p.thickness, 10) / 100 },
  }
}
export function shellGeomOf(p: Record<string, number | string>): ShellGeom {
  return {
    length: num(p.length, 400) / 1000, diameter: num(p.diameter, 100) / 1000,
    xMax: num(p.xMax, 0.35), noseExp: num(p.noseExp, 2), tailExp: num(p.tailExp, 2), baseFrac: num(p.baseFrac, 0.05),
  }
}

// ── evaluation ─────────────────────────────────────────────────────────────────────────────
export function evaluateParams(kind: AeroKind, p: Record<string, number | string>): Metrics {
  const fluid = (p.fluid === 'water' ? 'water' : 'air') as AeroFluidKind
  if (kind === 'prop') {
    const g = propGeomOf(p)
    const V = num(p.V, 0)
    const r = analyzeProp(g, { rpm: num(p.rpm, 3000), V, fluid, nElem: 16 })
    const B = g.blades
    // blade volume ≈ Σ 0.68·t·c²·dr per blade → mass with material density
    let vol = 0
    const st = r.stations
    for (let i = 0; i < st.length; i++) {
      const dr = i === 0 ? st[0].r - g.hubDiameter / 2 : st[i].r - st[i - 1].r
      vol += 0.68 * g.airfoil.t * st[i].chord * st[i].chord * Math.abs(dr)
    }
    const mass = vol * B * num(p.material, 1240)
    const noise = 70 + 60 * Math.log10(Math.max(r.tipSpeed, 1) / 50) + 10 * Math.log10(Math.max(r.thrust, 1e-3)) - 5 * Math.log10(B)
    return {
      thrust: r.thrust, power: r.power, torque: r.torque, eta: r.eta, FM: r.FM,
      eff: V > 0.05 ? r.eta : r.FM, CT: r.CT, CP: r.CP, J: r.J, tipMach: r.tipMach,
      noise, mass: mass * 1000, stalled: r.stalledFrac,
    }
  }
  if (kind === 'wing') {
    const g = wingGeomOf(p)
    const V = num(p.V, 12)
    const W = num(p.massKg, 1) * 9.81
    const r = analyzeWing(g, { V, fluid, targetLiftN: W, nSemi: 10 })
    const vol = 0.68 * g.airfoil.t * r.S * r.mac        // ≈ airfoil area × span
    const massG = vol * 40 * 1000 + r.S * 0.3 * 1000     // EPO foam 40 kg/m³ + 0.3 kg/m² skin/spar proxy
    // root bending moment proxy for elliptic-ish load: W/2 · (4/(3π))·b/2
    const rootMoment = W / 2 * g.span / 2 * (4 / (3 * Math.PI))
    return {
      LD: r.LD, CL: r.CL, CD: r.CD, CDi: r.CDi, e: r.e, alpha: r.alphaDeg, drag: r.drag,
      stallMargin: 1 - r.maxClRatio, area: r.S * 1e6, AR: r.AR, mass: massG, rootMoment, re: r.re,
    }
  }
  const g = shellGeomOf(p)
  const r = analyzeShell(g, { V: num(p.V, 2), fluid, wall: num(p.wall, 2) / 1000 })
  return {
    drag: r.drag, CD: r.CD, CDwet: r.CDwet, volumeL: r.volume * 1000, fineness: r.fineness,
    mass: r.mass * 1000, tailAngle: r.maxTailAngle, re: r.re, dragPerVol: r.drag / Math.max(1e-9, Math.pow(r.volume, 2 / 3)),
  }
}

export function violationOf(spec: DesignSpec, m: Metrics): number {
  let v = 0
  for (const c of spec.constraints) {
    const val = m[c.key]
    if (!Number.isFinite(val)) { v += 1; continue }
    const scale = Math.max(Math.abs(c.value), 1e-6)
    if (c.op === '>=' && val < c.value) v += (c.value - val) / scale
    if (c.op === '<=' && val > c.value) v += (val - c.value) / scale
  }
  return v
}

export function evaluateSpec(spec: DesignSpec, x: Record<string, number>): Evaluation {
  let metrics: Metrics
  try { metrics = evaluateParams(spec.kind, paramsOf(spec, x)) }
  catch { return { metrics: {}, violation: 1e6 } }
  for (const k of Object.keys(metrics)) if (!Number.isFinite(metrics[k])) metrics[k] = NaN
  return { metrics, violation: violationOf(spec, metrics) }
}

/** Objective vector to MINIMISE (max-sense negated). NaN → +∞. */
export function objectiveVector(spec: DesignSpec, m: Metrics): number[] {
  return spec.objectives.map((o) => {
    const v = m[o.key]
    if (!Number.isFinite(v)) return Infinity
    return o.sense === 'max' ? -v : v
  })
}

/** Decode a normalised vector u∈[0,1]^n to named variable values (ints rounded). */
export function decode(spec: DesignSpec, u: number[]): Record<string, number> {
  const x: Record<string, number> = {}
  spec.vars.forEach((v, i) => {
    const t = Math.min(1, Math.max(0, u[i] ?? 0.5))
    let val = v.min + t * (v.max - v.min)
    if (v.int) val = Math.round(val)
    x[v.key] = val
  })
  return x
}
export function encode(spec: DesignSpec, x: Record<string, number>): number[] {
  return spec.vars.map((v) => {
    const val = x[v.key] ?? v.value ?? (v.min + v.max) / 2
    return v.max > v.min ? Math.min(1, Math.max(0, (val - v.min) / (v.max - v.min))) : 0.5
  })
}
