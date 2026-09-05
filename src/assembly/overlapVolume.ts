// Numeric interference (overlap) VOLUME between two tessellated meshes — self-written, no kernel.
//
// The assembly 干涉检查 only had a world-AABB overlap test (box-vs-box → boolean pair). That over-reports:
// two parts whose bounding boxes overlap but whose actual geometry doesn't still flag as "interfering".
// Here we compute the REAL solid-overlap volume by Monte-Carlo sampling inside the AABB-intersection box:
// a random point counts only if it's inside BOTH meshes. volume ≈ boxVolume · (bothInside / samples).
//
// point-in-mesh = ray-parity test: shoot a +X ray and count triangle crossings; odd ⇒ inside (works for
// any closed/watertight mesh, robust to convex or concave shapes). All math is plain arrays so it runs
// identically in the worker, the page, and a Node verification script.

type Verts = number[] | Float32Array
type Tris = number[] | Uint32Array | Uint16Array
type Mat4 = number[] | Float32Array  // three.js column-major (m[12],m[13],m[14] = translation)

// Apply a column-major mat4 to a point.
function apply(m: Mat4, x: number, y: number, z: number): [number, number, number] {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ]
}

// Möller–Trumbore for a FIXED ray direction (1,0,0) from origin o; returns true if it hits the triangle
// strictly forward (t>0). Specialised for dir=(1,0,0) so the cross products collapse to a few terms.
function rayPlusXHitsTri(
  ox: number, oy: number, oz: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
): boolean {
  const e1x = bx - ax, e1y = by - ay, e1z = bz - az
  const e2x = cx - ax, e2y = cy - ay, e2z = cz - az
  // h = dir × e2, dir=(1,0,0) ⇒ h = (0, -e2z, e2y)
  const hx = 0, hy = -e2z, hz = e2y
  const det = e1x * hx + e1y * hy + e1z * hz
  if (det > -1e-12 && det < 1e-12) return false   // ray parallel to triangle
  const f = 1 / det
  const sx = ox - ax, sy = oy - ay, sz = oz - az
  const u = f * (sx * hx + sy * hy + sz * hz)
  if (u < 0 || u > 1) return false
  // q = s × e1
  const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x
  // v = f · (dir·q) = f·qx   (dir=(1,0,0))
  const v = f * qx
  if (v < 0 || u + v > 1) return false
  const t = f * (e2x * qx + e2y * qy + e2z * qz)
  return t > 1e-9
}

// Is local-space point (px,py,pz) inside the closed mesh (v, t)? +X ray parity.
export function pointInMeshLocal(px: number, py: number, pz: number, v: Verts, t: Tris): boolean {
  let crossings = 0
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3
    if (rayPlusXHitsTri(px, py, pz,
      v[a], v[a + 1], v[a + 2], v[b], v[b + 1], v[b + 2], v[c], v[c + 1], v[c + 2])) crossings++
  }
  return (crossings & 1) === 1
}

export type OverlapResult = { volume: number; boxVol: number; hits: number; samples: number }

// Estimate the solid-overlap volume of mesh1 (local→world m1, so world→local = inv1) and mesh2 (inv2),
// over the world AABB-intersection box [bmin,bmax]. `rand` lets callers inject a seeded PRNG (deterministic
// tests); defaults to Math.random in the app. Returns volume in the meshes' units³ (mm³).
export function estimateOverlapVolume(
  v1: Verts, t1: Tris, inv1: Mat4,
  v2: Verts, t2: Tris, inv2: Mat4,
  bmin: [number, number, number], bmax: [number, number, number],
  samples = 20000,
  rand: () => number = Math.random,
): OverlapResult {
  const dx = bmax[0] - bmin[0], dy = bmax[1] - bmin[1], dz = bmax[2] - bmin[2]
  if (dx <= 0 || dy <= 0 || dz <= 0) return { volume: 0, boxVol: 0, hits: 0, samples: 0 }
  const boxVol = dx * dy * dz
  let hits = 0
  for (let i = 0; i < samples; i++) {
    const wx = bmin[0] + rand() * dx, wy = bmin[1] + rand() * dy, wz = bmin[2] + rand() * dz
    const [lx1, ly1, lz1] = apply(inv1, wx, wy, wz)
    if (!pointInMeshLocal(lx1, ly1, lz1, v1, t1)) continue   // not in mesh1 → skip mesh2 test
    const [lx2, ly2, lz2] = apply(inv2, wx, wy, wz)
    if (pointInMeshLocal(lx2, ly2, lz2, v2, t2)) hits++
  }
  return { volume: boxVol * (hits / samples), boxVol, hits, samples }
}
