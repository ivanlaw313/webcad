// Aero Design Lab — geometry from a design (pure TS, no kernel):
//  · 3D section point loops (shared by the triangle mesher and the replicad CAD builder)
//  · watertight-ish triangle meshes for preview / wind tunnel / STL
//  · binary STL writer
// CAD frame: Z up, millimetres.
//   wing  : span along Y, chord along +X (flow +X), lift +Z
//   prop  : rotation axis Z (thrust +Z, rotates counter-clockwise seen from +Z), hub centred at origin
//   shell : body axis along +X (nose at x = 0), flow +X
import { nacaCoords, type NacaSpec } from './airfoil'
import { interpStations } from './prop'
import { chordAt, leAt } from './wing'
import { shellProfile } from './shell'
import { paramsOf, propGeomOf, shellGeomOf, wingGeomOf, type DesignSpec } from './designSpace'

export type P3 = [number, number, number]
export interface TriMesh { vertices: number[]; triangles: number[] }

/** Airfoil loop (unit chord) with n points per side, closed (first = last). */
function foil(a: NacaSpec, nSide: number): [number, number][] {
  return nacaCoords({ m: a.m, p: a.m > 0 ? a.p : 0, t: Math.max(0.02, a.t) }, nSide)
}

/** Wing section loops from left tip → root → right tip (mm). */
export function wingSections(spec: DesignSpec, x: Record<string, number>, nSpan = 9, nSide = 28): P3[][] {
  const g = wingGeomOf(paramsOf(spec, x))
  const half = g.span / 2
  const loop = foil(g.airfoil, nSide)
  const dih = Math.tan(g.dihedral * Math.PI / 180)
  const out: P3[][] = []
  for (let k = -nSpan; k <= nSpan; k++) {
    const s = half * Math.sin((Math.PI / 2) * k / nSpan)
    const c = Math.max(chordAt(g, s), 0.12 * g.rootChord)
    const xle = leAt(g, s) + (g.planform === 'elliptic' ? (chordAt(g, s) - c) / 4 : 0)
    const tw = -g.twistTip * Math.abs(s) / half * Math.PI / 180   // nose-down for washout (twistTip < 0 → rotate TE up)
    const ct = Math.cos(tw), st = Math.sin(tw)
    const z0 = Math.abs(s) * dih
    const xq = xle + 0.25 * c
    out.push(loop.map(([u, v]) => {
      const lx = (u - 0.25) * c, lz = v * c
      // rotate about the ¼-chord point (positive tw rotates the LE down)
      const rx = lx * ct - lz * st, rz = lx * st + lz * ct
      return [(xq + rx) * 1000, s * 1000, (z0 + rz) * 1000]
    }))
  }
  return out
}

/** Blade section loops from root (inside the hub) to tip, for blade 0 (radial axis +X). mm. */
export function bladeSections(spec: DesignSpec, x: Record<string, number>, nRad = 10, nSide = 24): P3[][] {
  const g = propGeomOf(paramsOf(spec, x))
  const R = g.diameter / 2, Rh = g.hubDiameter / 2
  const loop = foil(g.airfoil, nSide)
  const out: P3[][] = []
  const r0 = Rh * 0.7
  for (let i = 0; i <= nRad; i++) {
    const t = i / nRad
    const r = i === nRad ? R * 0.999 : r0 + (R - r0) * t
    const st = interpStations(g.stations, Math.max(r, Rh) / R)
    const c = Math.max(st.chord, 0.02 * R) * (i === nRad ? 0.85 : 1)
    const th = st.twistDeg * Math.PI / 180
    const cth = Math.cos(th), sth = Math.sin(th)
    out.push(loop.map(([u, v]) => {
      const xa = (u - 0.35) * c, ya = v * c
      const tang = -xa * cth - ya * sth       // chord points against rotation (LE leads in +t)
      const ax = -xa * sth + ya * cth
      return [r * 1000, tang * 1000, ax * 1000]   // blade 0: radial +X, tangential +Y, axial +Z
    }))
  }
  return out
}

/** Hub (cylinder) dimensions in mm: radius, z-range. */
export function hubDims(spec: DesignSpec, x: Record<string, number>): { r: number; z0: number; z1: number } {
  const g = propGeomOf(paramsOf(spec, x))
  const secs = bladeSections(spec, x, 4, 12)
  let zmin = Infinity, zmax = -Infinity
  for (const s of secs.slice(0, 2)) for (const p of s) { zmin = Math.min(zmin, p[2]); zmax = Math.max(zmax, p[2]) }
  const pad = 0.15 * (zmax - zmin) + 1
  return { r: g.hubDiameter / 2 * 1000, z0: zmin - pad, z1: zmax + pad }
}

/** Shell meridian profile (x, r) in mm, nose (x=0,r=0) → tail. */
export function shellMeridian(spec: DesignSpec, x: Record<string, number>, n = 64): [number, number][] {
  const g = shellGeomOf(paramsOf(spec, x))
  return shellProfile(g, n).map(([a, b]) => [a * 1000, b * 1000])
}

// ── triangle meshing ────────────────────────────────────────────────────────────────────
function loftMesh(secs: P3[][], m: TriMesh, capStart: boolean, capEnd: boolean): void {
  const base = m.vertices.length / 3
  const t0 = m.triangles.length
  const np = secs[0].length - 1         // loops are closed (last = first) → use np unique points
  for (const s of secs) for (let i = 0; i < np; i++) m.vertices.push(s[i][0], s[i][1], s[i][2])
  for (let k = 0; k < secs.length - 1; k++) {
    for (let i = 0; i < np; i++) {
      const a = base + k * np + i, b = base + k * np + (i + 1) % np
      const c = base + (k + 1) * np + i, d = base + (k + 1) * np + (i + 1) % np
      m.triangles.push(a, c, b, b, c, d)
    }
  }
  const cap = (k: number, flip: boolean) => {
    const s = secs[k]
    let cx = 0, cy = 0, cz = 0
    for (let i = 0; i < np; i++) { cx += s[i][0]; cy += s[i][1]; cz += s[i][2] }
    const ci = m.vertices.length / 3
    m.vertices.push(cx / np, cy / np, cz / np)
    for (let i = 0; i < np; i++) {
      const a = base + k * np + i, b = base + k * np + (i + 1) % np
      if (flip) m.triangles.push(ci, a, b); else m.triangles.push(ci, b, a)
    }
  }
  if (capStart) cap(0, true)
  if (capEnd) cap(secs.length - 1, false)
  // outward normals regardless of section handedness: flip this part if its signed volume is negative
  const part: TriMesh = { vertices: m.vertices, triangles: m.triangles.slice(t0) }
  if (meshVolume(part) < 0) for (let i = t0; i < m.triangles.length; i += 3) { const t = m.triangles[i + 1]; m.triangles[i + 1] = m.triangles[i + 2]; m.triangles[i + 2] = t }
}

function cylinderMesh(m: TriMesh, r: number, z0: number, z1: number, seg = 32): void {
  const base = m.vertices.length / 3
  for (let i = 0; i < seg; i++) { const a = 2 * Math.PI * i / seg; m.vertices.push(r * Math.cos(a), r * Math.sin(a), z0, r * Math.cos(a), r * Math.sin(a), z1) }
  const cb = m.vertices.length / 3
  m.vertices.push(0, 0, z0, 0, 0, z1)
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg
    const a0 = base + 2 * i, a1 = a0 + 1, b0 = base + 2 * j, b1 = b0 + 1
    m.triangles.push(a0, b0, a1, a1, b0, b1, cb, b0, a0, cb + 1, a1, b1)
  }
}

export function designMesh(spec: DesignSpec, x: Record<string, number>): TriMesh {
  const m: TriMesh = { vertices: [], triangles: [] }
  if (spec.kind === 'wing') {
    loftMesh(wingSections(spec, x), m, true, true)
  } else if (spec.kind === 'prop') {
    const g = propGeomOf(paramsOf(spec, x))
    const secs = bladeSections(spec, x)
    for (let b = 0; b < g.blades; b++) {
      const a = 2 * Math.PI * b / g.blades, ca = Math.cos(a), sa = Math.sin(a)
      loftMesh(secs.map((s) => s.map(([px, py, pz]) => [px * ca - py * sa, px * sa + py * ca, pz] as P3)), m, true, true)
    }
    const h = hubDims(spec, x)
    cylinderMesh(m, h.r, h.z0, h.z1)
  } else {
    const prof = shellMeridian(spec, x, 72)
    const seg = 48
    const base = m.vertices.length / 3
    // rings (skip r≈0 at the nose: single apex vertex)
    m.vertices.push(prof[0][0], 0, 0)
    for (let i = 1; i < prof.length; i++) {
      for (let j = 0; j < seg; j++) { const a = 2 * Math.PI * j / seg; m.vertices.push(prof[i][0], prof[i][1] * Math.cos(a), prof[i][1] * Math.sin(a)) }
    }
    const ring = (i: number, j: number) => base + 1 + (i - 1) * seg + (j % seg)
    for (let j = 0; j < seg; j++) m.triangles.push(base, ring(1, j + 1), ring(1, j))
    for (let i = 1; i < prof.length - 1; i++) for (let j = 0; j < seg; j++) {
      m.triangles.push(ring(i, j), ring(i, j + 1), ring(i + 1, j), ring(i, j + 1), ring(i + 1, j + 1), ring(i + 1, j))
    }
    const last = prof.length - 1
    const tc = m.vertices.length / 3
    m.vertices.push(prof[last][0], 0, 0)
    for (let j = 0; j < seg; j++) m.triangles.push(tc, ring(last, j), ring(last, j + 1))
  }
  return m
}

export function meshVolume(m: TriMesh): number {
  let v = 0
  const V = m.vertices, T = m.triangles
  for (let i = 0; i < T.length; i += 3) {
    const a = T[i] * 3, b = T[i + 1] * 3, c = T[i + 2] * 3
    v += (V[a] * (V[b + 1] * V[c + 2] - V[b + 2] * V[c + 1]) - V[a + 1] * (V[b] * V[c + 2] - V[b + 2] * V[c]) + V[a + 2] * (V[b] * V[c + 1] - V[b + 1] * V[c])) / 6
  }
  return v
}

/** Binary STL (little-endian) from a triangle mesh (mm). */
export function meshToStl(m: TriMesh, name = 'aero-lab'): ArrayBuffer {
  const nt = m.triangles.length / 3
  const buf = new ArrayBuffer(84 + nt * 50)
  const dv = new DataView(buf)
  const hdr = `webcad aero-lab ${name}`.slice(0, 79)
  for (let i = 0; i < hdr.length; i++) dv.setUint8(i, hdr.charCodeAt(i) & 0x7f)
  dv.setUint32(80, nt, true)
  const V = m.vertices
  let o = 84
  for (let t = 0; t < nt; t++) {
    const ia = m.triangles[3 * t] * 3, ib = m.triangles[3 * t + 1] * 3, ic = m.triangles[3 * t + 2] * 3
    const ux = V[ib] - V[ia], uy = V[ib + 1] - V[ia + 1], uz = V[ib + 2] - V[ia + 2]
    const vx = V[ic] - V[ia], vy = V[ic + 1] - V[ia + 1], vz = V[ic + 2] - V[ia + 2]
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const l = Math.hypot(nx, ny, nz) || 1
    nx /= l; ny /= l; nz /= l
    dv.setFloat32(o, nx, true); dv.setFloat32(o + 4, ny, true); dv.setFloat32(o + 8, nz, true); o += 12
    for (const i of [ia, ib, ic]) { dv.setFloat32(o, V[i], true); dv.setFloat32(o + 4, V[i + 1], true); dv.setFloat32(o + 8, V[i + 2], true); o += 12 }
    dv.setUint16(o, 0, true); o += 2
  }
  return buf
}
