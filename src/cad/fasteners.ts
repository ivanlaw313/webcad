// Standard metric fastener library — self-written, license-safe (dimensions are public ISO standard values,
// not copied code). Builders emit the SAME Feature[] the worker already understands (extrude circle/poly +
// boolean), so each fastener is a REAL parametric solid (correct envelope for fit/clearance/BOM/assembly),
// not a decorative mesh.
//
// Honest scope: shanks are PLAIN cylinders (no helical thread cut). Real CAD fastener libraries (incl.
// SolidWorks Toolbox by default) use simplified/cosmetic threads for the same reason — a true swept helix is
// heavy and fragile to boolean. The OUTER dimensions are ISO-accurate, so clearance/tap/counterbore checks
// and assembly fit are correct; only the thread flanks are omitted. Flagged in the UI.

import type { Feature } from '../worker/cad.worker'

export type FastenerKind = 'capscrew' | 'hexbolt' | 'flathead' | 'button' | 'setscrew' | 'hexnut' | 'washer' | 'dowel'
export type FastenerSize = 'M3' | 'M4' | 'M5' | 'M6' | 'M8' | 'M10' | 'M12'

export const FASTENER_KIND_LABEL: Record<FastenerKind, string> = {
  capscrew: '内六角螺丝 (ISO 4762)', hexbolt: '六角头螺栓 (ISO 4017)', flathead: '沉头螺丝 (ISO 10642)',
  button: '圆头螺丝 (ISO 7380)', setscrew: '机米/无头螺丝 (ISO 4026)',
  hexnut: '六角螺母 (ISO 4032)', washer: '平垫圈 (ISO 7089)', dowel: '定位销 (ISO 2338)',
}
export const FASTENER_SIZES: FastenerSize[] = ['M3', 'M4', 'M5', 'M6', 'M8', 'M10', 'M12']

// Per-size ISO dimensions (mm). d=nominal thread Ø, P=pitch.
// capscrew ISO 4762: dk=head Ø, k=head height, hexAf=hex-socket across-flats.
// hexbolt ISO 4017: hbS=hex-head across-flats, hbK=head height.  flathead ISO 10642: fhDk=head Ø, fhK=head height (90° csk).
// hexnut ISO 4032 (style 1): nutS=across-flats, nutM=thickness.   washer ISO 7089: wIn/wOut/wTh.
// button ISO 7380: btnDk=dome Ø, btnK=head height, btnHex=socket across-flats.  setscrew ISO 4026: ssHex=socket across-flats.
export type FastenerSpec = {
  d: number; P: number
  dk: number; k: number; hexAf: number
  hbS: number; hbK: number
  fhDk: number; fhK: number
  btnDk: number; btnK: number; btnHex: number
  ssHex: number
  nutS: number; nutM: number
  wIn: number; wOut: number; wTh: number
}
export const FASTENER_SPEC: Record<FastenerSize, FastenerSpec> = {
  M3: { d: 3, P: 0.5, dk: 5.5, k: 3, hexAf: 2.5, hbS: 5.5, hbK: 2.0, fhDk: 6.0, fhK: 1.7, btnDk: 5.7, btnK: 1.65, btnHex: 2.0, ssHex: 1.5, nutS: 5.5, nutM: 2.4, wIn: 3.2, wOut: 7, wTh: 0.5 },
  M4: { d: 4, P: 0.7, dk: 7, k: 4, hexAf: 3, hbS: 7, hbK: 2.8, fhDk: 8.0, fhK: 2.3, btnDk: 7.6, btnK: 2.2, btnHex: 2.5, ssHex: 2.0, nutS: 7, nutM: 3.2, wIn: 4.3, wOut: 9, wTh: 0.8 },
  M5: { d: 5, P: 0.8, dk: 8.5, k: 5, hexAf: 4, hbS: 8, hbK: 3.5, fhDk: 10.0, fhK: 2.8, btnDk: 9.5, btnK: 2.75, btnHex: 3.0, ssHex: 2.5, nutS: 8, nutM: 4.7, wIn: 5.3, wOut: 10, wTh: 1 },
  M6: { d: 6, P: 1.0, dk: 10, k: 6, hexAf: 5, hbS: 10, hbK: 4.0, fhDk: 12.0, fhK: 3.3, btnDk: 10.5, btnK: 3.3, btnHex: 4.0, ssHex: 3.0, nutS: 10, nutM: 5.2, wIn: 6.4, wOut: 12, wTh: 1.6 },
  M8: { d: 8, P: 1.25, dk: 13, k: 8, hexAf: 6, hbS: 13, hbK: 5.3, fhDk: 16.0, fhK: 4.4, btnDk: 14.0, btnK: 4.4, btnHex: 5.0, ssHex: 4.0, nutS: 13, nutM: 6.8, wIn: 8.4, wOut: 16, wTh: 1.6 },
  M10: { d: 10, P: 1.5, dk: 16, k: 10, hexAf: 8, hbS: 16, hbK: 6.4, fhDk: 20.0, fhK: 5.5, btnDk: 17.5, btnK: 5.5, btnHex: 6.0, ssHex: 5.0, nutS: 16, nutM: 8.4, wIn: 10.5, wOut: 20, wTh: 2 },
  M12: { d: 12, P: 1.75, dk: 18, k: 12, hexAf: 10, hbS: 18, hbK: 7.5, fhDk: 24.0, fhK: 6.5, btnDk: 21.0, btnK: 6.6, btnHex: 8.0, ssHex: 6.0, nutS: 18, nutM: 10.8, wIn: 13, wOut: 24, wTh: 2.5 },
}

// Regular hexagon polygon with the given ACROSS-FLATS distance, centred at origin (flats horizontal/vertical).
// circumradius R = af / √3 ; vertices at 30°+k·60° → flat-to-flat distance = 2·R·cos30° = af.
export function hexPolyByAcrossFlats(af: number): [number, number][] {
  const R = af / Math.sqrt(3)
  const pts: [number, number][] = []
  for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i * Math.PI) / 3; pts.push([R * Math.cos(a), R * Math.sin(a)]) }
  return pts
}

let _fc = 0
const fid = () => 'FN' + ++_fc

// Build the Feature[] for a fastener. `length` only used by capscrew (shank length under the head).
export function buildFastener(kind: FastenerKind, size: FastenerSize, length = 16): Feature[] {
  const s = FASTENER_SPEC[size]
  if (kind === 'capscrew') {
    const L = Math.max(s.d, length)
    const sockDepth = Math.min(s.k * 0.6, s.k - 0.5)
    return [
      // head: cylinder z∈[0,k]
      { id: fid(), type: 'extrude', profile: { kind: 'circle', c: [0, 0], r: s.dk / 2 }, height: s.k, operation: 'new', baseZ: 0 } as Feature,
      // shank: cylinder z∈[−L,0] (plain — see module note)
      { id: fid(), type: 'extrude', profile: { kind: 'circle', c: [0, 0], r: s.d / 2 }, height: L, operation: 'join', baseZ: -L } as Feature,
      // hex socket: recess from the head top
      { id: fid(), type: 'extrude', profile: { kind: 'poly', pts: hexPolyByAcrossFlats(s.hexAf) }, height: sockDepth + 1, operation: 'cut', baseZ: s.k - sockDepth } as Feature,
    ]
  }
  if (kind === 'hexbolt') {
    const L = Math.max(s.d, length)
    return [
      // hex head: hexagonal prism z∈[0,hbK]
      { id: fid(), type: 'extrude', profile: { kind: 'poly', pts: hexPolyByAcrossFlats(s.hbS) }, height: s.hbK, operation: 'new', baseZ: 0 } as Feature,
      // shank: cylinder z∈[−L,0] (plain — see module note)
      { id: fid(), type: 'extrude', profile: { kind: 'circle', c: [0, 0], r: s.d / 2 }, height: L, operation: 'join', baseZ: -L } as Feature,
    ]
  }
  if (kind === 'flathead') {
    const L = Math.max(s.d, length)
    const sockDepth = Math.min(s.fhK * 0.7, s.fhK - 0.3)
    return [
      // countersunk (90°) head: cone widening upward from the shank Ø to dk over height fhK (loft of 2 circles).
      { id: fid(), type: 'loft', operation: 'new', sections: [
        { profile: { kind: 'circle', c: [0, 0], r: s.d / 2 }, z: 0 },
        { profile: { kind: 'circle', c: [0, 0], r: s.fhDk / 2 }, z: s.fhK },
      ], ruled: true } as Feature,
      // shank: cylinder z∈[−L,0]
      { id: fid(), type: 'extrude', profile: { kind: 'circle', c: [0, 0], r: s.d / 2 }, height: L, operation: 'join', baseZ: -L } as Feature,
      // hex socket recess from the head top (flush face)
      { id: fid(), type: 'extrude', profile: { kind: 'poly', pts: hexPolyByAcrossFlats(s.hexAf) }, height: sockDepth + 1, operation: 'cut', baseZ: s.fhK - sockDepth } as Feature,
    ]
  }
  if (kind === 'button') {
    // Domed button head (ISO 7380): approximate the dome by a smooth loft of 3 circles (base→mid→top),
    // then the shank, then the hex socket. Honest: dome is a loft approximation, base Ø & height ISO-exact.
    const L = Math.max(s.d, length)
    const sockDepth = Math.min(s.btnK * 0.6, s.btnK - 0.3)
    return [
      { id: fid(), type: 'loft', operation: 'new', sections: [
        { profile: { kind: 'circle', c: [0, 0], r: s.btnDk / 2 }, z: 0 },
        { profile: { kind: 'circle', c: [0, 0], r: (s.btnDk / 2) * 0.82 }, z: s.btnK * 0.55 },
        { profile: { kind: 'circle', c: [0, 0], r: (s.btnDk / 2) * 0.42 }, z: s.btnK },
      ] } as Feature,
      { id: fid(), type: 'extrude', profile: { kind: 'circle', c: [0, 0], r: s.d / 2 }, height: L, operation: 'join', baseZ: -L } as Feature,
      { id: fid(), type: 'extrude', profile: { kind: 'poly', pts: hexPolyByAcrossFlats(s.btnHex) }, height: sockDepth + 1, operation: 'cut', baseZ: s.btnK - sockDepth } as Feature,
    ]
  }
  if (kind === 'setscrew') {
    // Headless set screw / grub (ISO 4026): a plain cylinder Ø d × length with a hex socket sunk in one end.
    const L = Math.max(s.d, length)
    const sockDepth = Math.min(L * 0.5, s.d)
    return [
      { id: fid(), type: 'extrude', profile: { kind: 'circle', c: [0, 0], r: s.d / 2 }, height: L, operation: 'new', baseZ: 0 } as Feature,
      { id: fid(), type: 'extrude', profile: { kind: 'poly', pts: hexPolyByAcrossFlats(s.ssHex) }, height: sockDepth + 1, operation: 'cut', baseZ: L - sockDepth } as Feature,
    ]
  }
  if (kind === 'dowel') {
    // Dowel pin (ISO 2338): a precise plain cylinder Ø d × length. (End chamfers omitted — outer envelope exact.)
    const L = Math.max(s.d, length)
    return [
      { id: fid(), type: 'extrude', profile: { kind: 'circle', c: [0, 0], r: s.d / 2 }, height: L, operation: 'new', baseZ: 0 } as Feature,
    ]
  }
  if (kind === 'hexnut') {
    return [
      { id: fid(), type: 'extrude', profile: { kind: 'poly', pts: hexPolyByAcrossFlats(s.nutS) }, height: s.nutM, operation: 'new', baseZ: 0 } as Feature,
      { id: fid(), type: 'extrude', profile: { kind: 'circle', c: [0, 0], r: s.d / 2 }, height: s.nutM + 2, operation: 'cut', baseZ: -1 } as Feature,
    ]
  }
  // washer: annulus
  return [
    { id: fid(), type: 'extrude', profile: { kind: 'circle', c: [0, 0], r: s.wOut / 2 }, height: s.wTh, operation: 'new', baseZ: 0 } as Feature,
    { id: fid(), type: 'extrude', profile: { kind: 'circle', c: [0, 0], r: s.wIn / 2 }, height: s.wTh + 2, operation: 'cut', baseZ: -1 } as Feature,
  ]
}

// Recommend the standard size for a measured hole Ø (mm): the size whose ISO 273 medium clearance hole is
// closest to it (so the screw passes through). e.g. Ø5.5→M5, Ø9→M8. Returns the nearest size + how it fits.
const CLEARANCE: Record<FastenerSize, number> = { M3: 3.4, M4: 4.5, M5: 5.5, M6: 6.6, M8: 9, M10: 11, M12: 13.5 }
export function recommendFastenerSize(holeDia: number): { size: FastenerSize; clearance: number; fit: 'clearance' | 'tap' | 'loose' } {
  let best: FastenerSize = 'M3', bd = Infinity
  for (const sz of FASTENER_SIZES) { const d = Math.abs(CLEARANCE[sz] - holeDia); if (d < bd) { bd = d; best = sz } }
  // If the hole matches the thread tap (≈ nominal d) better, flag it as a tap hole (screw threads INTO it).
  let tap: FastenerSize = 'M3', td = Infinity
  for (const sz of FASTENER_SIZES) { const d = Math.abs(FASTENER_SPEC[sz].d - holeDia); if (d < td) { td = d; tap = sz } }
  if (td < bd - 0.3) return { size: tap, clearance: CLEARANCE[tap], fit: 'tap' }
  return { size: best, clearance: CLEARANCE[best], fit: bd < 0.6 ? 'clearance' : 'loose' }
}

export function fastenerLabel(kind: FastenerKind, size: FastenerSize, length = 16): string {
  if (kind === 'capscrew') return `${size}×${length} 内六角螺丝`
  if (kind === 'hexbolt') return `${size}×${length} 六角头螺栓`
  if (kind === 'flathead') return `${size}×${length} 沉头螺丝`
  if (kind === 'button') return `${size}×${length} 圆头螺丝`
  if (kind === 'setscrew') return `${size}×${length} 机米螺丝`
  if (kind === 'dowel') return `${size}×${length} 定位销`
  if (kind === 'hexnut') return `${size} 六角螺母`
  return `${size} 平垫圈`
}

// Recommended tightening torque (N·m) for a steel screw, property class 8.8 / 10.9 / 12.9, dry (K≈0.2).
// T = K·F·d, target preload F = 0.7·At·σproof. At = 0.7854·(d−0.9382·P)² (ISO tensile stress area).
// σproof: 8.8→640, 10.9→940, 12.9→1100 MPa. Returns N·m (d in mm → /1000). Self-written, license-safe.
export function tighteningTorque(size: FastenerSize, cls: '8.8' | '10.9' | '12.9' = '8.8', K = 0.2): number {
  const s = FASTENER_SPEC[size]
  const At = 0.7854 * (s.d - 0.9382 * s.P) ** 2
  const proof = cls === '12.9' ? 1100 : cls === '10.9' ? 940 : 640
  const F = 0.7 * At * proof
  return (K * F * s.d) / 1000
}
