// Mesh repair — self-written, license-safe (no deps). Imported STL/OBJ meshes are often "non-watertight" only
// because vertices at the same position aren't shared (per-triangle duplicates), or carry degenerate / duplicate
// triangles. This welds coincident vertices, drops zero-area & duplicate triangles, and recomputes normals — a
// genuine, common fix that makes many imported meshes manifold/printable again. Honest scope: it does NOT fill
// real geometric holes (gaps in the surface) — that needs hole-filling, which is out of scope; flagged in the UI.

// Mesh simplification (decimation) by VERTEX CLUSTERING: snap vertices to a coarse grid of cell size `cell`
// (mm), merge each cell's vertices to their average position, remap triangles, drop the triangles that
// collapse (two corners land in the same cell) + duplicates. Fast & robust (unlike QEM it isn't feature-
// preserving, so sharp edges soften at high reduction) — good for lightening heavy imported scan/STL meshes.
// Returns the lighter mesh + before/after counts. cell larger → fewer triangles.
export type SimplifyResult = { vertices: number[]; triangles: number[]; normals: number[]; tIn: number; tOut: number }
export function simplifyMesh(vertices: ArrayLike<number>, triangles: ArrayLike<number>, cell: number): SimplifyResult {
  const tIn = (triangles.length / 3) | 0
  const c = Math.max(1e-4, cell)
  // Cluster cell key per original vertex; accumulate sum+count to get each cell's centroid.
  const cellOf = new Map<string, number>(); const sum: number[] = []; const cnt: number[] = []; const vCell = new Array<number>((vertices.length / 3) | 0)
  for (let i = 0; i < vertices.length; i += 3) {
    const k = `${Math.floor(vertices[i] / c)},${Math.floor(vertices[i + 1] / c)},${Math.floor(vertices[i + 2] / c)}`
    let id = cellOf.get(k)
    if (id === undefined) { id = sum.length / 3; cellOf.set(k, id); sum.push(0, 0, 0); cnt.push(0) }
    sum[id * 3] += vertices[i]; sum[id * 3 + 1] += vertices[i + 1]; sum[id * 3 + 2] += vertices[i + 2]; cnt[id]++
    vCell[i / 3] = id
  }
  const outV: number[] = []
  for (let id = 0; id < cnt.length; id++) { const n = cnt[id] || 1; outV.push(sum[id * 3] / n, sum[id * 3 + 1] / n, sum[id * 3 + 2] / n) }
  // Remap triangles to cell ids; drop collapsed + duplicate.
  const outT: number[] = []; const seen = new Set<string>()
  for (let i = 0; i < triangles.length; i += 3) {
    const a = vCell[triangles[i]], b = vCell[triangles[i + 1]], d = vCell[triangles[i + 2]]
    if (a === b || b === d || a === d) continue
    const key = [a, b, d].sort((x, y) => x - y).join(',')
    if (seen.has(key)) continue
    seen.add(key); outT.push(a, b, d)
  }
  // Area-weighted vertex normals.
  const normals = new Array<number>(outV.length).fill(0)
  for (let i = 0; i < outT.length; i += 3) {
    const a = outT[i], b = outT[i + 1], d = outT[i + 2]
    const ax = outV[a * 3], ay = outV[a * 3 + 1], az = outV[a * 3 + 2]
    const ux = outV[b * 3] - ax, uy = outV[b * 3 + 1] - ay, uz = outV[b * 3 + 2] - az
    const wx = outV[d * 3] - ax, wy = outV[d * 3 + 1] - ay, wz = outV[d * 3 + 2] - az
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx
    for (const id of [a, b, d]) { normals[id * 3] += nx; normals[id * 3 + 1] += ny; normals[id * 3 + 2] += nz }
  }
  for (let i = 0; i < normals.length; i += 3) { const L = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1; normals[i] /= L; normals[i + 1] /= L; normals[i + 2] /= L }
  return { vertices: outV, triangles: outT, normals, tIn, tOut: outT.length / 3 }
}

// Unify triangle WINDING (fix flipped/inconsistent normals — a classic imported-STL defect that shows black
// faces & confuses slicers about inside/outside). Welds by position, builds edge adjacency, BFS-propagates a
// consistent orientation (adjacent triangles must traverse a shared edge in OPPOSITE directions), then flips
// the whole mesh outward if the signed volume came out negative. Returns new triangles + normals + #flipped.
export type WindingResult = { vertices: number[]; triangles: number[]; normals: number[]; flipped: number; outwardFlip: boolean }
export function unifyWinding(vertices: ArrayLike<number>, triangles: ArrayLike<number>, grid = 1e4): WindingResult {
  const nt = (triangles.length / 3) | 0
  const idOf = new Map<string, number>(); let nid = 0; const canon = new Array<number>((vertices.length / 3) | 0); const outV: number[] = []
  for (let i = 0; i < vertices.length; i += 3) {
    const k = `${Math.round(vertices[i] * grid)},${Math.round(vertices[i + 1] * grid)},${Math.round(vertices[i + 2] * grid)}`
    let id = idOf.get(k); if (id === undefined) { id = nid++; idOf.set(k, id); outV.push(vertices[i], vertices[i + 1], vertices[i + 2]) }
    canon[i / 3] = id
  }
  const tri: [number, number, number][] = []
  for (let i = 0; i < triangles.length; i += 3) tri.push([canon[triangles[i]], canon[triangles[i + 1]], canon[triangles[i + 2]]])
  const ekey = (a: number, b: number) => (a < b ? a * nid + b : b * nid + a)
  const edgeToTris = new Map<number, number[]>()
  for (let k = 0; k < nt; k++) { const t = tri[k]; for (let e = 0; e < 3; e++) { const key = ekey(t[e], t[(e + 1) % 3]); const arr = edgeToTris.get(key); if (arr) arr.push(k); else edgeToTris.set(key, [k]) } }
  const hasDirected = (t: [number, number, number], p: number, q: number) => (t[0] === p && t[1] === q) || (t[1] === p && t[2] === q) || (t[2] === p && t[0] === q)
  const visited = new Uint8Array(nt); let flipped = 0
  for (let seed = 0; seed < nt; seed++) {
    if (visited[seed]) continue
    visited[seed] = 1; const queue = [seed]
    while (queue.length) {
      const k = queue.shift()!; const t = tri[k]
      for (let e = 0; e < 3; e++) {
        const p = t[e], q = t[(e + 1) % 3]
        for (const m of edgeToTris.get(ekey(p, q)) || []) {
          if (m === k || visited[m]) continue
          // Neighbour must traverse this shared edge in the OPPOSITE direction (q,p). If it ALSO has (p,q),
          // it's wound the same way as us → inconsistent → flip it (swap two corners reverses winding).
          if (hasDirected(tri[m], p, q)) { const tm = tri[m]; const tmp = tm[1]; tm[1] = tm[2]; tm[2] = tmp; flipped++ }
          visited[m] = 1; queue.push(m)
        }
      }
    }
  }
  // Orient outward: signed volume of the (now consistent) mesh should be positive. If negative, flip all.
  const P = (id: number, c: number) => outV[id * 3 + c]   // welded positions
  let vol6 = 0
  for (const t of tri) {
    const ax = P(t[0], 0), ay = P(t[0], 1), az = P(t[0], 2), bx = P(t[1], 0), by = P(t[1], 1), bz = P(t[1], 2), cx = P(t[2], 0), cy = P(t[2], 1), cz = P(t[2], 2)
    vol6 += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)
  }
  const outwardFlip = vol6 < 0
  if (outwardFlip) for (const t of tri) { const tmp = t[1]; t[1] = t[2]; t[2] = tmp }
  // Emit triangles over the welded vertex list outV (returned), so {vertices, triangles, normals} are consistent.
  const outTris: number[] = []
  for (const t of tri) outTris.push(t[0], t[1], t[2])
  const normals = new Array<number>(nid * 3).fill(0)
  for (const t of tri) {
    const ax = P(t[0], 0), ay = P(t[0], 1), az = P(t[0], 2)
    const ux = P(t[1], 0) - ax, uy = P(t[1], 1) - ay, uz = P(t[1], 2) - az
    const wx = P(t[2], 0) - ax, wy = P(t[2], 1) - ay, wz = P(t[2], 2) - az
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx
    for (const id of t) { normals[id * 3] += nx; normals[id * 3 + 1] += ny; normals[id * 3 + 2] += nz }
  }
  for (let i = 0; i < normals.length; i += 3) { const L = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1; normals[i] /= L; normals[i + 1] /= L; normals[i + 2] /= L }
  return { vertices: outV, triangles: outTris, normals, flipped, outwardFlip }
}

export type RepairStats = { vIn: number; vOut: number; tIn: number; tOut: number; degenerate: number; duplicate: number }
export type RepairResult = { vertices: number[]; triangles: number[]; normals: number[]; stats: RepairStats }

export function repairMesh(vertices: ArrayLike<number>, triangles: ArrayLike<number>, grid = 1e4): RepairResult {
  const vIn = (vertices.length / 3) | 0, tIn = (triangles.length / 3) | 0
  // 1. Weld vertices by quantised position → unique welded vertex list + per-original canonical id.
  const idOf = new Map<string, number>(); const outV: number[] = []; const canon = new Array<number>(vIn)
  for (let i = 0; i < vertices.length; i += 3) {
    const x = vertices[i], y = vertices[i + 1], z = vertices[i + 2]
    const k = `${Math.round(x * grid)},${Math.round(y * grid)},${Math.round(z * grid)}`
    let id = idOf.get(k)
    if (id === undefined) { id = outV.length / 3; idOf.set(k, id); outV.push(x, y, z) }
    canon[i / 3] = id
  }
  // 2. Remap triangles to welded ids; drop degenerate (a shared corner) & zero-area; dedup identical faces.
  const outT: number[] = []; const seen = new Set<string>(); let degenerate = 0, duplicate = 0
  const P = (id: number): [number, number, number] => [outV[id * 3], outV[id * 3 + 1], outV[id * 3 + 2]]
  for (let i = 0; i < triangles.length; i += 3) {
    const a = canon[triangles[i]], b = canon[triangles[i + 1]], c = canon[triangles[i + 2]]
    if (a === b || b === c || a === c) { degenerate++; continue }
    const pa = P(a), pb = P(b), pc = P(c)
    const ux = pb[0] - pa[0], uy = pb[1] - pa[1], uz = pb[2] - pa[2]
    const wx = pc[0] - pa[0], wy = pc[1] - pa[1], wz = pc[2] - pa[2]
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx
    if (Math.hypot(nx, ny, nz) < 1e-9) { degenerate++; continue }   // zero-area
    const key = [a, b, c].sort((x, y) => x - y).join(',')           // dedup regardless of winding order
    if (seen.has(key)) { duplicate++; continue }
    seen.add(key); outT.push(a, b, c)
  }
  // 3. Area-weighted smooth vertex normals over the welded mesh.
  const normals = new Array<number>(outV.length).fill(0)
  for (let i = 0; i < outT.length; i += 3) {
    const a = outT[i], b = outT[i + 1], c = outT[i + 2], pa = P(a), pb = P(b), pc = P(c)
    const ux = pb[0] - pa[0], uy = pb[1] - pa[1], uz = pb[2] - pa[2]
    const wx = pc[0] - pa[0], wy = pc[1] - pa[1], wz = pc[2] - pa[2]
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx // length ∝ 2·area (area-weight)
    for (const id of [a, b, c]) { normals[id * 3] += nx; normals[id * 3 + 1] += ny; normals[id * 3 + 2] += nz }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const L = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1
    normals[i] /= L; normals[i + 1] /= L; normals[i + 2] /= L
  }
  return { vertices: outV, triangles: outT, normals, stats: { vIn, vOut: outV.length / 3, tIn, tOut: outT.length / 3, degenerate, duplicate } }
}
