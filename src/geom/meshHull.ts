// S178：3D 凸包（incremental hull，QuickHull 式）—— 把网格顶点云包成凸包，做新组件（Fusion Mesh > Convex Hull）。
// 纯 JS、零内核、零依赖。返回凸包 { vertices, triangles, normals }（外向缠绕 + 面积权顶点法线）。
// triangles 入参忽略（只用顶点云）。<4 点 / 共线 / 全共面 → 返回空（无法成 3D 凸包）。
//
// 算法：① 由极值点起一个非退化四面体；② 逐点：揾「睇得到」嘅面（点喺面外侧）删走，
//   揾可见区边界（horizon，只属一个可见面嘅边）连去新点起新面；③ 输出面（外向法线由【内点 c0】定向）。
// c0 = 初始四面体重心，永远喺凸包内（凸包只会长大）→ 用 `dot(n, a−c0)>0` 判外向，全程可靠。

type V3 = [number, number, number]
type Face = { v: [number, number, number]; n: V3; off: number; dead: boolean }

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

export function convexHull3D(verts: number[], _triangles?: number[]): { vertices: number[]; triangles: number[]; normals: number[] } {
  const empty = { vertices: [] as number[], triangles: [] as number[], normals: [] as number[] }
  const n0 = Math.floor(verts.length / 3)
  if (n0 < 4) return empty

  // 焊接量化重合点（避免退化面）
  const seen = new Map<string, number>()
  const pts: V3[] = []
  for (let i = 0; i < n0; i++) {
    const p: V3 = [verts[i * 3], verts[i * 3 + 1], verts[i * 3 + 2]]
    const k = `${Math.round(p[0] * 1e5)}_${Math.round(p[1] * 1e5)}_${Math.round(p[2] * 1e5)}`
    if (!seen.has(k)) { seen.set(k, pts.length); pts.push(p) }
  }
  if (pts.length < 4) return empty

  // ① 初始四面体：每轴极值 → 取展度最大嘅轴定 i0/i1，再揾离线最远 i2、离面最远 i3
  const minA = [0, 0, 0], maxA = [0, 0, 0]
  for (let ax = 0; ax < 3; ax++) {
    let mn = 0, mx = 0
    for (let i = 1; i < pts.length; i++) { if (pts[i][ax] < pts[mn][ax]) mn = i; if (pts[i][ax] > pts[mx][ax]) mx = i }
    minA[ax] = mn; maxA[ax] = mx
  }
  let bestAx = 0, bestSpread = -1
  for (let ax = 0; ax < 3; ax++) { const s = pts[maxA[ax]][ax] - pts[minA[ax]][ax]; if (s > bestSpread) { bestSpread = s; bestAx = ax } }
  const i0 = minA[bestAx], i1 = maxA[bestAx]
  if (i0 === i1 || bestSpread <= 1e-9) return empty
  const line = sub(pts[i1], pts[i0]); const lineLen = Math.hypot(line[0], line[1], line[2]) || 1
  let i2 = -1, d2 = 1e-9 * bestSpread
  for (let i = 0; i < pts.length; i++) { if (i === i0 || i === i1) continue; const c = cross(line, sub(pts[i], pts[i0])); const dist = Math.hypot(c[0], c[1], c[2]) / lineLen; if (dist > d2) { d2 = dist; i2 = i } }
  if (i2 < 0) return empty   // 全共线
  const nrm0 = cross(sub(pts[i1], pts[i0]), sub(pts[i2], pts[i0]))
  const nrm0L = Math.hypot(nrm0[0], nrm0[1], nrm0[2]) || 1
  let i3 = -1, d3 = 1e-9 * bestSpread
  for (let i = 0; i < pts.length; i++) { if (i === i0 || i === i1 || i === i2) continue; const dist = Math.abs(dot(nrm0, sub(pts[i], pts[i0]))) / nrm0L; if (dist > d3) { d3 = dist; i3 = i } }
  if (i3 < 0) return empty   // 全共面 → 无 3D 体积

  const c0: V3 = [
    (pts[i0][0] + pts[i1][0] + pts[i2][0] + pts[i3][0]) / 4,
    (pts[i0][1] + pts[i1][1] + pts[i2][1] + pts[i3][1]) / 4,
    (pts[i0][2] + pts[i1][2] + pts[i2][2] + pts[i3][2]) / 4,
  ]
  // 起一个面：法线由 c0（内点）定向外；退化（近零面积）→ null
  const mkFace = (a: number, b: number, c: number): Face | null => {
    const nn = cross(sub(pts[b], pts[a]), sub(pts[c], pts[a]))
    const L = Math.hypot(nn[0], nn[1], nn[2])
    if (L < 1e-12) return null
    let nv: V3 = [nn[0] / L, nn[1] / L, nn[2] / L]
    if (dot(nv, sub(pts[a], c0)) < 0) { nv = [-nv[0], -nv[1], -nv[2]]; return { v: [a, c, b], n: nv, off: dot(nv, pts[a]), dead: false } }
    return { v: [a, b, c], n: nv, off: dot(nv, pts[a]), dead: false }
  }
  let faces: Face[] = []
  for (const f of [mkFace(i0, i1, i2), mkFace(i0, i1, i3), mkFace(i0, i2, i3), mkFace(i1, i2, i3)]) if (f) faces.push(f)
  if (faces.length < 4) return empty

  const EPS = 1e-7 * (bestSpread || 1)
  // ② 逐点增量
  for (let pi = 0; pi < pts.length; pi++) {
    if (pi === i0 || pi === i1 || pi === i2 || pi === i3) continue
    const p = pts[pi]
    const visible: Face[] = []
    for (const f of faces) if (!f.dead && dot(f.n, p) - f.off > EPS) visible.push(f)
    if (!visible.length) continue   // 喺凸包内
    const ekey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`)
    const edge = new Map<string, { a: number; b: number; count: number }>()
    for (const f of visible) {
      f.dead = true
      const [a, b, c] = f.v
      for (const [x, y] of [[a, b], [b, c], [c, a]] as [number, number][]) { const k = ekey(x, y); const e = edge.get(k); if (e) e.count++; else edge.set(k, { a: x, b: y, count: 1 }) }
    }
    for (const e of edge.values()) { if (e.count !== 1) continue; const nf = mkFace(e.a, e.b, pi); if (nf) faces.push(nf) }   // horizon → 新面
    faces = faces.filter((f) => !f.dead)
  }

  // ③ 输出：压实只用到嘅顶点 + 重映三角；面积权法线（同房子惯例 recomputeNormals）
  const used = new Map<number, number>()
  const outV: number[] = []
  const tris: number[] = []
  for (const f of faces) {
    const idx = f.v.map((vi) => {
      let m = used.get(vi)
      if (m === undefined) { m = outV.length / 3; used.set(vi, m); outV.push(pts[vi][0], pts[vi][1], pts[vi][2]) }
      return m
    })
    tris.push(idx[0], idx[1], idx[2])
  }
  if (outV.length < 12 || tris.length < 12) return empty   // 退化（<4 顶点 / <4 面）
  // S178 audit：2-流形 sanity —— 每条无向边恰 2 面。高展比/近退化点云会令简单 horizon(count===1) 失效 → 出非流形（边用 >2 / 开边），
  //   meshVolume 会算出垃圾、布尔/导出都坏。检测到即弃（store 以「顶点云退化」干净收场），唔好把烂网格推落组件。
  const ec = new Map<string, number>()
  for (let i = 0; i < tris.length; i += 3) {
    const f = [tris[i], tris[i + 1], tris[i + 2]]
    for (const [a, b] of [[f[0], f[1]], [f[1], f[2]], [f[2], f[0]]] as [number, number][]) { const k = a < b ? `${a}_${b}` : `${b}_${a}`; ec.set(k, (ec.get(k) || 0) + 1) }
  }
  for (const cnt of ec.values()) if (cnt !== 2) return empty   // 非流形 → 弃
  return { vertices: outV, triangles: tris, normals: recomputeNormals(outV, tris) }
}

// 面积权顶点法线（同 meshSmooth.ts:99 / meshRepair.ts 一致惯例）
function recomputeNormals(v: number[], t: number[]): number[] {
  const n = new Array<number>(v.length).fill(0)
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3
    const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2]
    const wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2]
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx
    for (const idx of [a, b, c]) { n[idx] += nx; n[idx + 1] += ny; n[idx + 2] += nz }
  }
  for (let i = 0; i < n.length; i += 3) { const L = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= L; n[i + 1] /= L; n[i + 2] /= L }
  return n
}
