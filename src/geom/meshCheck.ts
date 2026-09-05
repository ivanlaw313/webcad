// Mesh manifold / watertight check — self-written, license-safe (no deps).
//
// 3D-printing slicers need a closed, 2-manifold triangle mesh: every edge must be shared by EXACTLY two
// triangles. An edge used once = an open boundary (a hole in the surface); an edge used 3+ times = a
// non-manifold edge (two surfaces meeting along one line). Either makes the slicer guess at the interior.
//
// OCCT tessellation emits vertices per-face (the same corner appears as several distinct array slots), so
// we first WELD vertices by quantised position (a fine grid), then count undirected edges over the welded
// indices. Works whether the input triangles index shared or duplicated vertices.
//
// `t` is the triangle index array (3 indices per face) into the flat `v` xyz array (3 numbers per vertex).
export type ManifoldResult = { closed: boolean; boundary: number; nonManifold: number; tris: number }

export function meshManifold(v: ArrayLike<number>, t: ArrayLike<number>, grid = 1e4): ManifoldResult {
  const tris = (t.length / 3) | 0
  if (v.length === 0 || tris === 0) return { closed: false, boundary: 0, nonManifold: 0, tris: 0 }
  // Weld vertices by quantised position → a canonical id per original vertex.
  const idOf = new Map<string, number>()
  let nextId = 0
  const canon = new Array<number>(v.length / 3)
  for (let i = 0; i < v.length; i += 3) {
    const k = `${Math.round(v[i] * grid)},${Math.round(v[i + 1] * grid)},${Math.round(v[i + 2] * grid)}`
    let id = idOf.get(k)
    if (id === undefined) { id = nextId++; idOf.set(k, id) }
    canon[i / 3] = id
  }
  // Count how many triangles use each undirected edge (a<b, encoded a*nextId+b — unique since both < nextId).
  const use = new Map<number, number>()
  for (let i = 0; i < t.length; i += 3) {
    const i0 = canon[t[i]], i1 = canon[t[i + 1]], i2 = canon[t[i + 2]]
    const ids = [i0, i1, i2]
    for (let e = 0; e < 3; e++) {
      let a = ids[e], b = ids[(e + 1) % 3]
      if (a === b) continue // degenerate edge (collapsed triangle) — ignore
      if (a > b) { const tmp = a; a = b; b = tmp }
      const ek = a * nextId + b
      use.set(ek, (use.get(ek) || 0) + 1)
    }
  }
  let boundary = 0, nonManifold = 0
  use.forEach((c) => { if (c === 1) boundary++; else if (c > 2) nonManifold++ })
  return { closed: boundary === 0 && nonManifold === 0, boundary, nonManifold, tris }
}
