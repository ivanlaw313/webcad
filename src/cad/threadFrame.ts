// Thread on a cylindrical face of ANY axis direction. A thread feature is still built in its own local
// frame exactly like the original Z-axis code (x/y/z0 local, thread runs along local +Z); an optional
// `frame` places that local frame in the model: local +Z → frame.axis, local origin → frame.o.
// Rotation = right-handed turn about normalize(Z × axis) by acos(Z·axis) (same as replicad rotate()).
export type V3 = [number, number, number]
export type ThreadFrame = { o: V3; axis: V3 }

const norm = (a: V3): V3 => { const L = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / L, a[1] / L, a[2] / L] }

// Rotation (axis-angle) mapping local +Z onto `axis`; null = identity.
export function threadFrameRotation(axis: V3): { deg: number; dir: V3 } | null {
  const a = norm(axis), c = Math.max(-1, Math.min(1, a[2]))
  if (c > 1 - 1e-12) return null
  if (c < -1 + 1e-12) return { deg: 180, dir: [1, 0, 0] }
  return { deg: (Math.acos(c) * 180) / Math.PI, dir: norm([-a[1], a[0], 0]) }   // Z × a
}

// Local point → model point (Rodrigues; identical convention to the kernel rotate()).
export function threadLocalToWorld(frame: ThreadFrame | undefined, p: V3): V3 {
  if (!frame) return p
  const r = threadFrameRotation(frame.axis)
  let q = p
  if (r) {
    const k = r.dir, th = (r.deg * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th)
    const kd = k[0] * p[0] + k[1] * p[1] + k[2] * p[2]
    const kx: V3 = [k[1] * p[2] - k[2] * p[1], k[2] * p[0] - k[0] * p[2], k[0] * p[1] - k[1] * p[0]]
    q = [p[0] * c + kx[0] * s + k[0] * kd * (1 - c), p[1] * c + kx[1] * s + k[1] * kd * (1 - c), p[2] * c + kx[2] * s + k[2] * kd * (1 - c)]
  }
  return [q[0] + frame.o[0], q[1] + frame.o[1], q[2] + frame.o[2]]
}

// Is this cylinder axis close enough to ±Z for the original (frame-less) Z path?
export const isZAxis = (axis: V3): boolean => Math.abs(norm(axis)[2]) >= 0.996

// Picked cylindrical face (CAD coords: centroid p on the axis, unit axis, axial span h0..h1 relative to p)
// → frame whose origin is the face's start end and whose +Z runs along the face, plus the thread length.
export function threadFrameFromFace(det: { p: V3; axis: V3; h0?: number; h1?: number }): { frame: ThreadFrame; height: number } {
  const a = norm(det.axis), h0 = det.h0 ?? 0, h1 = det.h1 ?? 0
  const r6 = (x: number) => Math.round(x * 1e6) / 1e6
  return {
    frame: { o: [r6(det.p[0] + a[0] * h0), r6(det.p[1] + a[1] * h0), r6(det.p[2] + a[2] * h0)], axis: [r6(a[0]), r6(a[1]), r6(a[2])] },
    height: h1 - h0,
  }
}
