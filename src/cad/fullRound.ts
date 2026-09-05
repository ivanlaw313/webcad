// Fusion Full Round Fillet — shared kernel path used by the worker and Node regression tests.
// The three selected face sets determine a full cylindrical blend without a radius input.
export type FullRoundFaceIds = { side1: number[]; center: number[]; side2: number[] }

export function fullRoundFilletFromFaces(
  shape: any,
  ids: FullRoundFaceIds,
  makeCylinder: (radius: number, height: number, base: [number, number, number], axis: [number, number, number]) => any,
): any {
  const faces = shape.faces as any[]
  const { side1: s1, center: cc, side2: s2 } = ids
  if (!s1.length || !cc.length || !s2.length) throw new Error('全圆角：侧面组 1、中心面、侧面组 2 都必须有选择')

  let scale = 1
  try { const b = shape.boundingBox.bounds as [number[], number[]]; scale = Math.hypot(b[1][0] - b[0][0], b[1][1] - b[0][1], b[1][2] - b[0][2]) || 1 } catch { /* 1 */ }
  const eps = Math.max(1e-5, scale * 1e-7), q = (v: number) => Math.round(v / eps)
  const xyz = (p: any) => `${q(p.x)},${q(p.y)},${q(p.z)}`
  type BoundaryEdge = { edge: any; fi: number }
  const collect = (faceIds: number[]) => {
    const out = new Map<string, BoundaryEdge>()
    for (const fi of faceIds) for (const edge of (faces[fi]?.edges ?? [])) {
      try { const a = edge.pointAt(0), b = edge.pointAt(1), m = edge.pointAt(0.5); const ends = [xyz(a), xyz(b)].sort(); out.set(`${ends[0]}|${ends[1]}|${xyz(m)}`, { edge, fi }) } catch { /* degenerate */ }
    }
    return out
  }
  const cm = collect(cc), a = collect(s1), b = collect(s2)
  const e1 = [...cm].filter(([k]) => a.has(k)).map(([k, v]) => ({ center: v, side: a.get(k)! }))
  const e2 = [...cm].filter(([k]) => b.has(k)).map(([k, v]) => ({ center: v, side: b.get(k)! }))
  if (!e1.length || !e2.length) throw new Error('全圆角：两组侧面必须分别与中心面相邻')

  const p0 = e1[0].center.edge.pointAt(0), p1 = e1[0].center.edge.pointAt(1)
  const av = [p1.x - p0.x, p1.y - p0.y, p1.z - p0.z]
  const al = Math.hypot(av[0], av[1], av[2])
  if (!(al > eps * 10)) throw new Error('全圆角：中心/侧面边界不是有效直线')
  const axis = [av[0] / al, av[1] / al, av[2] / al] as [number, number, number]
  const midpoint = (edge: any) => { const p = edge.pointAt(0.5); return [p.x, p.y, p.z] as [number, number, number] }
  const m1 = midpoint(e1[0].center.edge), m2 = midpoint(e2[0].center.edge)
  const dot = (u: number[], v: number[]) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2]
  const sub = (u: number[], v: number[]) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]] as [number, number, number]
  const lineOK = (row: { center: BoundaryEdge }[], ref: [number, number, number]) => row.every(({ center }) => {
    const x0 = center.edge.pointAt(0), x1 = center.edge.pointAt(1), mm = midpoint(center.edge)
    const u = [x1.x - x0.x, x1.y - x0.y, x1.z - x0.z]
    const ul = Math.hypot(u[0], u[1], u[2])
    if (!(ul > eps * 10) || Math.abs(dot(u, axis) / ul) < 0.9999) return false
    const dr = sub(mm, ref), along = dot(dr, axis)
    return Math.hypot(dr[0] - along * axis[0], dr[1] - along * axis[1], dr[2] - along * axis[2]) < Math.max(eps * 20, scale * 1e-5)
  })
  if (!lineOK(e1, m1) || !lineOK(e2, m2)) throw new Error('全圆角：目前只支持互相平行的直线边界面组')

  const delta = sub(m2, m1), along = dot(delta, axis)
  const across = [delta[0] - along * axis[0], delta[1] - along * axis[1], delta[2] - along * axis[2]] as [number, number, number]
  const width = Math.hypot(across[0], across[1], across[2])
  if (!(width > eps * 20)) throw new Error('全圆角：两组侧面距离太小或重合')
  const sideDir = [across[0] / width, across[1] / width, across[2] / width] as [number, number, number]
  const c0 = [(m1[0] + m2[0]) / 2, (m1[1] + m2[1]) / 2, (m1[2] + m2[2]) / 2] as [number, number, number]
  const endPts: [number, number, number][] = []
  for (const row of [...e1, ...e2]) for (const t of [0, 1]) { const p = row.center.edge.pointAt(t); endPts.push([p.x, p.y, p.z]) }
  const ts = endPts.map((p) => dot(sub(p, c0), axis)), t0 = Math.min(...ts), t1 = Math.max(...ts)
  if (!(t1 - t0 > eps * 20)) throw new Error('全圆角：边界长度不足')
  const base = [c0[0] + axis[0] * t0, c0[1] + axis[1] * t0, c0[2] + axis[2] * t0] as [number, number, number]
  const tool = makeCylinder(width / 2, t1 - t0, base, axis)

  const n1 = faces[e1[0].side.fi].normalAt(m1), n2 = faces[e2[0].side.fi].normalAt(m2)
  const d1 = n1.x * sideDir[0] + n1.y * sideDir[1] + n1.z * sideDir[2]
  const d2 = n2.x * sideDir[0] + n2.y * sideDir[1] + n2.z * sideDir[2]
  const result = d1 < d2 ? shape.fuse(tool) : shape.cut(tool)
  if (!result?.wrapped || result.wrapped.IsNull()) throw new Error('全圆角：B-rep 运算失败')
  return result
}
