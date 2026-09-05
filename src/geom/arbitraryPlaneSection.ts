export type PlanePoint = [number, number]
export type PlaneRefGeo = { pts: PlanePoint[]; segs: [PlanePoint, PlanePoint][] }

// Pure mesh/plane intersection used by tilted datum sketch reference geometry.
// The local axes are xDir, normal × xDir, normal, matching SketchLayer.arbFrame.
export function arbitraryPlaneSection(
  mesh: { vertices: ArrayLike<number>; triangles: ArrayLike<number> } | null,
  arb: { o: [number, number, number]; xd: [number, number, number]; n: [number, number, number] },
): PlaneRefGeo | null {
  if (!mesh || !mesh.vertices.length) return null
  const V = mesh.vertices, T = mesh.triangles
  const unit = (v: [number, number, number]): [number, number, number] => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1
    return [v[0] / l, v[1] / l, v[2] / l]
  }
  const n = unit(arb.n)
  const xn = arb.xd[0] * n[0] + arb.xd[1] * n[1] + arb.xd[2] * n[2]
  const xd = unit([arb.xd[0] - xn * n[0], arb.xd[1] - xn * n[1], arb.xd[2] - xn * n[2]])
  const yd: [number, number, number] = [n[1] * xd[2] - n[2] * xd[1], n[2] * xd[0] - n[0] * xd[2], n[0] * xd[1] - n[1] * xd[0]]
  const map = (x: number, y: number, z: number): [number, number, number] => {
    const dx = x - arb.o[0], dy = y - arb.o[1], dz = z - arb.o[2]
    return [dx * xd[0] + dy * xd[1] + dz * xd[2], dx * yd[0] + dy * yd[1] + dz * yd[2], dx * n[0] + dy * n[1] + dz * n[2]]
  }
  const key = (p: PlanePoint) => `${Math.round(p[0] * 50)},${Math.round(p[1] * 50)}`
  const segs: [PlanePoint, PlanePoint][] = []
  const boundary = new Map<string, [PlanePoint, PlanePoint]>()
  const counts = new Map<string, number>()
  const tol = 0.08
  for (let i = 0; i < T.length; i += 3) {
    const ps: [number, number, number][] = []
    let coplanar = true
    for (let k = 0; k < 3; k++) {
      const vi = (T[i + k] as number) * 3
      const p = map(V[vi] as number, V[vi + 1] as number, V[vi + 2] as number)
      if (Math.abs(p[2]) > tol) { coplanar = false; break }
      ps.push(p)
    }
    if (!coplanar) continue
    for (let k = 0; k < 3; k++) {
      const a: PlanePoint = [ps[k][0], ps[k][1]], b: PlanePoint = [ps[(k + 1) % 3][0], ps[(k + 1) % 3][1]]
      const ek = key(a) < key(b) ? key(a) + '|' + key(b) : key(b) + '|' + key(a)
      counts.set(ek, (counts.get(ek) ?? 0) + 1)
      if (!boundary.has(ek)) boundary.set(ek, [a, b])
    }
  }
  for (const [ek, count] of counts) if (count === 1) {
    const s = boundary.get(ek)!
    if (Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]) > 0.2) segs.push(s)
  }
  if (!segs.length) for (let i = 0; i < T.length && segs.length < 400; i += 3) {
    const p: [number, number, number][] = []
    for (let k = 0; k < 3; k++) { const vi = (T[i + k] as number) * 3; p.push(map(V[vi] as number, V[vi + 1] as number, V[vi + 2] as number)) }
    const cross: PlanePoint[] = []
    for (let k = 0; k < 3; k++) {
      const a = p[k], b = p[(k + 1) % 3], da = a[2], db = b[2]
      if ((da > 0 && db <= 0) || (da <= 0 && db > 0)) { const t = da / (da - db); cross.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]) }
    }
    if (cross.length === 2 && Math.hypot(cross[1][0] - cross[0][0], cross[1][1] - cross[0][1]) > 0.2) segs.push([cross[0], cross[1]])
  }
  if (!segs.length) return null
  const pts = new Map<string, PlanePoint>()
  for (const [a, b] of segs) { pts.set(key(a), a); pts.set(key(b), b) }
  return { segs: segs.slice(0, 400), pts: [...pts.values()].slice(0, 400) }
}
