// GM-3DV2 参考几何（V2）纯几何 —— 新 datum/构造点方法嘅可单测核心（唔掂内核/store/three，node 直接 import）。
// 全部工作喺 CAD 坐标（x,y,z）。对应 Fusion CONSTRUCT：
//   R5 Point Through Two Edges  · R6 Point Through Three Planes · R7 Point At Edge And Plane
//   R8 Point At Center（圆形边取心） · R9 Plane Through Two Edges · R10 Perpendicular Plane
export type Vec3 = [number, number, number]

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
const norm = (a: Vec3): Vec3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l] }

// R5：两边最近交点 = 两条 3D 直线最近逼近点嘅中点（相交时 dist≈0）。近平行（sin²夹角<1e-9）返 null。
// 每条边由（点 p, 方向 d）表示（d 可未归一）。
export function nearestPointBetweenLines(p1: Vec3, d1: Vec3, p2: Vec3, d2: Vec3): { point: Vec3; dist: number } | null {
  const u = norm(d1), v = norm(d2)
  const w0 = sub(p1, p2)
  const b = dot(u, v)             // a = c = 1（u,v 已归一）
  const d = dot(u, w0)
  const e = dot(v, w0)
  const denom = 1 - b * b         // = sin²(夹角)
  if (denom < 1e-9) return null   // 平行 → 无唯一最近点
  const t1 = (b * e - d) / denom
  const t2 = (e - b * d) / denom
  const c1 = add(p1, scale(u, t1))
  const c2 = add(p2, scale(v, t2))
  return { point: [(c1[0] + c2[0]) / 2, (c1[1] + c2[1]) / 2, (c1[2] + c2[2]) / 2], dist: len(sub(c1, c2)) }
}

// R6：三平面公共交点。每面 {p, n}。三法向共面/含平行对（行列式≈0，无唯一交）返 null。
export function threePlaneIntersection(planes: { p: Vec3; n: Vec3 }[]): Vec3 | null {
  if (planes.length < 3) return null
  const n1 = norm(planes[0].n), n2 = norm(planes[1].n), n3 = norm(planes[2].n)
  const d1 = dot(n1, planes[0].p), d2 = dot(n2, planes[1].p), d3 = dot(n3, planes[2].p)
  const n23 = cross(n2, n3), n31 = cross(n3, n1), n12 = cross(n1, n2)
  const denom = dot(n1, n23)      // = det[n1 n2 n3]
  if (Math.abs(denom) < 1e-9) return null
  const num = add(add(scale(n23, d1), scale(n31, d2)), scale(n12, d3))
  return scale(num, 1 / denom)
}

// R7：边穿平面交点。edge=(点 ep, 方向 ed，ed 用【弦向 end−start】→ t∈[0,1] 即喺边内)；plane=(点 pp, 法向 pn)。
//   边平行平面（ed·pn≈0）返 null。返 { point, t }（t = 沿 ed 参数）。
export function edgePlaneIntersection(ep: Vec3, ed: Vec3, pp: Vec3, pn: Vec3): { point: Vec3; t: number } | null {
  const n = norm(pn)
  const denom = dot(ed, n)
  if (Math.abs(denom) < 1e-9) return null   // 边平行平面 → 无交（或整条喺面上）
  const t = dot(sub(pp, ep), n) / denom
  return { point: add(ep, scale(ed, t)), t }
}

// R9：两边共面 → 含两边嘅平面。返 { o, xd, n }（arb 基准，同 addDatumFeature arb 一致）。
//   两边不平行 → n = d1×d2；平行 → 用连接向量 (p2−p1) 做第二方向；共线（同一条线）→ null。
export function planeThroughTwoEdges(p1: Vec3, d1: Vec3, p2: Vec3, d2: Vec3): { o: Vec3; xd: Vec3; n: Vec3 } | null {
  const u = norm(d1)
  let n = cross(u, norm(d2))
  if (len(n) < 1e-6) {              // 平行边 → 用两边间连接向量
    n = cross(u, sub(p2, p1))
    if (len(n) < 1e-6) return null  // 共线 → 定唔到平面
  }
  return { o: p1, xd: u, n: norm(n) }
}

// R10：垂直面 —— 垂直于所选面（含面法向 faceN）、含参考方向 refDir、过参考点 refPt，沿平面法向偏移 distance。
//   n = norm(faceN × refDir)；xd = norm(faceN)（在平面内，⊥n → 平面确实⊥所选面）；o = refPt + n·distance。
//   refDir ∥ faceN（退化）→ 改用任意⊥faceN 方向。
export function perpendicularPlane(faceN: Vec3, refPt: Vec3, refDir: Vec3, distance: number): { o: Vec3; xd: Vec3; n: Vec3 } {
  const fn = norm(faceN)
  let rd = refDir
  let n = cross(fn, rd)
  if (len(n) < 1e-6) {             // refDir ∥ faceN → 拣一个任意⊥faceN 方向
    const ref: Vec3 = Math.abs(fn[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]
    rd = sub(ref, scale(fn, dot(ref, fn)))
    n = cross(fn, rd)
  }
  n = norm(n)
  return { o: add(refPt, scale(n, distance)), xd: fn, n }
}

// R8：由圆形边采样点拟合圆心（3D 最小二乘 —— 全圆取形心即得，圆弧靠 Kasa 平面内拟合恢复真心）。
//   步骤：形心 + Newell 法向定平面 → 投 2D → Kasa 圆拟合 → 映射返 3D。点<3 / 共线 / 退化返 null。
export function circleCenterFromPolyline(pts: Vec3[]): { center: Vec3; normal: Vec3; r: number } | null {
  if (pts.length < 3) return null
  const N = pts.length
  let cx = 0, cy = 0, cz = 0
  for (const p of pts) { cx += p[0]; cy += p[1]; cz += p[2] }
  const centroid: Vec3 = [cx / N, cy / N, cz / N]
  // Newell 法向（对采样闭合/近闭合折线稳健）
  let nx = 0, ny = 0, nz = 0
  for (let i = 0; i < N; i++) {
    const a = pts[i], b = pts[(i + 1) % N]
    nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1])
  }
  let nrm: Vec3 = [nx, ny, nz]
  if (len(nrm) < 1e-9) return null   // 退化/直线
  nrm = norm(nrm)
  const ref: Vec3 = Math.abs(nrm[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]
  const e1 = norm(sub(ref, scale(nrm, dot(ref, nrm))))
  const e2 = cross(nrm, e1)
  // 投影到平面内 2D（相对形心）→ Kasa 最小二乘（形心中心化 → Su≈Sv≈0，法方程简化）
  const uv = pts.map((p) => { const w = sub(p, centroid); return [dot(w, e1), dot(w, e2)] as [number, number] })
  let Suu = 0, Suv = 0, Svv = 0, Suuu = 0, Svvv = 0, Suvv = 0, Svuu = 0
  for (const [u, v] of uv) { Suu += u * u; Suv += u * v; Svv += v * v; Suuu += u * u * u; Svvv += v * v * v; Suvv += u * v * v; Svuu += v * u * u }
  const det = Suu * Svv - Suv * Suv
  if (Math.abs(det) < 1e-12) return null
  const bx = 0.5 * (Suuu + Suvv), by = 0.5 * (Svvv + Svuu)
  const uc = (Svv * bx - Suv * by) / det
  const vc = (Suu * by - Suv * bx) / det
  const center = add(add(centroid, scale(e1, uc)), scale(e2, vc))
  let r = 0; for (const [u, v] of uv) r += Math.hypot(u - uc, v - vc); r /= uv.length
  return { center, normal: nrm, r }
}
