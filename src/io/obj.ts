// Minimal Wavefront OBJ mesh parser (self-written, no deps). Reads vertex positions (v) and faces (f),
// triangulating polygons by a fan. Handles f formats "a", "a/vt", "a//vn", "a/vt/vn", 1-based and negative
// (relative) indices. Texture/normal indices are ignored (we only need geometry for a reference component).
// Coordinates are taken verbatim (same as the STL import — no axis flip); the user can rotate after import.

export type MeshData = { vertices: number[]; triangles: number[]; normals: number[] }

export function parseOBJ(text: string): MeshData {
  const verts: number[] = []      // flat x,y,z
  const tris: number[] = []       // flat vertex indices (0-based)
  const invalidVerts: boolean[] = []
  const lines = text.split(/\r?\n/)
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line[0] === '#') continue
    const parts = line.split(/\s+/)
    const tag = parts[0]
    if (tag === 'v') {
      // v x y z [w] — keep the first three.
      // Loose OBJ text sometimes contains NaN/Infinity.  Keep the vertex slot
      // (so face indices remain valid) but never let non-finite values reach
      // bounds, GPU buffers or a later export.
      const xyz = [Number(parts[1]), Number(parts[2]), Number(parts[3])]
      const valid = xyz.every(Number.isFinite)
      // Preserve OBJ's positional vertex numbering, but mark a malformed slot
      // so every face that references it is rejected below.
      verts.push(valid ? xyz[0] : 0, valid ? xyz[1] : 0, valid ? xyz[2] : 0)
      invalidVerts.push(!valid)
    } else if (tag === 'f') {
      // Resolve each face-corner token to a 0-based vertex index (token before the first '/').
      const nv = verts.length / 3
      const idx: number[] = []
      let badFace = false
      for (let i = 1; i < parts.length; i++) {
        const tok = parts[i].split('/')[0]
        if (!tok) continue
        let vi = parseInt(tok, 10)
        if (!Number.isFinite(vi)) continue
        vi = vi > 0 ? vi - 1 : nv + vi   // 1-based, or negative = relative to current vertex count
        if (vi >= 0 && vi < nv) {
          if (invalidVerts[vi]) { badFace = true; break }
          idx.push(vi)
        }
      }
      // Fan-triangulate the polygon (idx[0],idx[i],idx[i+1]).
      if (!badFace) for (let i = 1; i + 1 < idx.length; i++) tris.push(idx[0], idx[i], idx[i + 1])
    }
  }
  // Per-vertex normals from face cross-products (so the imported mesh shades correctly without a recompute).
  const normals = new Array(verts.length).fill(0)
  for (let i = 0; i < tris.length; i += 3) {
    const a = tris[i] * 3, b = tris[i + 1] * 3, c = tris[i + 2] * 3
    const ux = verts[b] - verts[a], uy = verts[b + 1] - verts[a + 1], uz = verts[b + 2] - verts[a + 2]
    const vx = verts[c] - verts[a], vy = verts[c + 1] - verts[a + 1], vz = verts[c + 2] - verts[a + 2]
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    for (const k of [a, b, c]) { normals[k] += nx; normals[k + 1] += ny; normals[k + 2] += nz }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const L = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1
    normals[i] /= L; normals[i + 1] /= L; normals[i + 2] /= L
  }
  return { vertices: verts, triangles: tris, normals }
}
