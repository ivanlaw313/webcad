export type BrepEdgeMesh = {
  vertices: number[]
  triangles: number[]
  faceGroups?: { start: number; count: number; faceId: number }[]
}

// OCCT gives the renderer a triangle mesh, but also tags each triangle run with
// its source B-rep face.  A conventional wireframe draws every triangle edge;
// this extracts only edges separating two distinct B-rep faces (plus open
// boundaries), which is the line set a CAD user expects to see.
export function brepEdgePositions(mesh: BrepEdgeMesh): number[] | null {
  const groups = mesh.faceGroups
  if (!groups?.length || mesh.triangles.length % 3 || mesh.vertices.length % 3) return null

  const faceAt = new Int32Array(mesh.triangles.length / 3)
  faceAt.fill(-1)
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    const group = groups[groupIndex]
    const first = Math.max(0, Math.floor(group.start / 3))
    const last = Math.min(faceAt.length, Math.ceil((group.start + group.count) / 3))
    // `faceId` is a hash supplied for selection/colouring.  It is not a safe
    // topological identity: a hash collision must never erase a visible seam.
    // The ordered worker face-group run is the unique identity for rendering.
    for (let tri = first; tri < last; tri++) faceAt[tri] = groupIndex
  }

  type Seen = { a: number; b: number; uses: number; faces: Set<number> }
  const edges = new Map<string, Seen>()
  const pointKey = (i: number) => {
    const k = i * 3
    // Some OCCT triangulations duplicate vertices between faces.  Keying by
    // position instead of index keeps those seams as one topological edge.
    return `${Math.round(mesh.vertices[k] * 1e6)},${Math.round(mesh.vertices[k + 1] * 1e6)},${Math.round(mesh.vertices[k + 2] * 1e6)}`
  }
  const add = (a: number, b: number, face: number) => {
    const ka = pointKey(a), kb = pointKey(b)
    const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
    const prior = edges.get(key)
    if (prior) { prior.uses++; prior.faces.add(face) }
    else edges.set(key, { a, b, uses: 1, faces: new Set([face]) })
  }
  for (let tri = 0; tri < faceAt.length; tri++) {
    const i = tri * 3, face = faceAt[tri]
    if (face < 0) continue
    const a = mesh.triangles[i], b = mesh.triangles[i + 1], c = mesh.triangles[i + 2]
    if (a == null || b == null || c == null || a < 0 || b < 0 || c < 0) continue
    add(a, b, face); add(b, c, face); add(c, a, face)
  }

  const out: number[] = []
  for (const edge of edges.values()) {
    // A single use is an open boundary.  A repeated edge is visible only
    // where its adjacent triangles came from different B-rep faces.
    if (edge.uses === 1 || edge.faces.size > 1) {
      const a = edge.a * 3, b = edge.b * 3
      out.push(mesh.vertices[a], mesh.vertices[a + 1], mesh.vertices[a + 2], mesh.vertices[b], mesh.vertices[b + 1], mesh.vertices[b + 2])
    }
  }
  return out
}
