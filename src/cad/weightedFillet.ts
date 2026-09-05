import { Plane, draw } from 'replicad'

type P2 = [number, number]
type P3 = [number, number, number]

const dot = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (a: P3): P3 => { const n = Math.hypot(a[0], a[1], a[2]); if (!(n > 1e-9)) throw new Error('切线权重圆角：零长度方向'); return [a[0] / n, a[1] / n, a[2] / n] }
const neg = (a: P3): P3 => [-a[0], -a[1], -a[2]]
const xyz = (p: any): P3 => [p.x, p.y, p.z]

const meshVolume = (shape: any, scale: number): number => {
  const { vertices: v, triangles: t } = shape.mesh({ tolerance: Math.max(0.01, scale * 1e-4), angularTolerance: 0.15 })
  let sum = 0
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3
    sum += v[a] * (v[b + 1] * v[c + 2] - v[b + 2] * v[c + 1])
      + v[a + 1] * (v[b + 2] * v[c] - v[b] * v[c + 2])
      + v[a + 2] * (v[b] * v[c + 1] - v[b + 1] * v[c])
  }
  return Math.abs(sum / 6)
}

export function weightedProfileControlPoints(radius: number, weight: number, continuity: 'G1' | 'G2'): P2[] {
  const r = Math.max(1e-6, radius)
  const w = Math.min(2, Math.max(0.1, weight))
  if (continuity === 'G1') {
    // At weight 1 this is the classical cubic quarter-circle coefficient.
    const k0 = 4 * (Math.SQRT2 - 1) / 3
    const k = w <= 1 ? 0.15 + (k0 - 0.15) * ((w - 0.1) / 0.9) : k0 + (0.85 - k0) * (w - 1)
    return [[r * (1 - k), 0], [0, r * (1 - k)]]
  }
  // Quintic Bezier. The first/last three poles are collinear, so curvature is zero
  // where the blend meets planar support faces (true G2 boundary condition).
  const a = r * (0.12 + 0.165 * w)
  return [[r - a, 0], [r - 2 * a, 0], [0, r - 2 * a], [0, r - a]]
}

// Real weighted blend for straight convex edges between perpendicular planar faces.
// Weight 1 preserves the normal G1 circular section; non-default weights alter the
// continuity influence without moving either support-face contact point.
export function weightedFilletNearPoints(shape: any, mids: P3[], radius: number | number[], weights: number | number[], continuity: 'G1' | 'G2'): any {
  if (!mids.length) throw new Error('切线权重圆角：请选择边')
  const radii = Array.isArray(radius) ? radius : mids.map(() => radius)
  const ws = Array.isArray(weights) ? weights : mids.map(() => weights)
  if (radii.length !== mids.length || radii.some((r) => !(r > 0))) throw new Error('切线权重圆角：每条边都需要正半径')
  if (ws.length !== mids.length || ws.some((w) => !(w >= 0.1 && w <= 2))) throw new Error('切线权重圆角：权重必须在 0.1 至 2.0 之间')

  const resolve = (body: any, mid: P3) => {
    let edge: any = null, bd = Infinity
    for (const e of body.edges as any[]) { const m = e.pointAt(0.5); const d = (m.x - mid[0]) ** 2 + (m.y - mid[1]) ** 2 + (m.z - mid[2]) ** 2; if (d < bd) { bd = d; edge = e } }
    if (!edge) throw new Error('切线权重圆角：找不到所选边')
    return edge
  }

  const original = mids.map((m) => resolve(shape, m))
  const ends = original.map((e) => [xyz(e.pointAt(0)), xyz(e.pointAt(1))] as [P3, P3])
  for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length; j++) for (const a of ends[i]) for (const b of ends[j]) {
    if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-5) throw new Error('切线权重圆角：相邻多边需要真正 setback 角补面；目前请逐条或选择不相接的边')
  }

  let out = shape
  for (let k = 0; k < mids.length; k++) {
    const edge = resolve(out, mids[k])
    const p0 = xyz(edge.pointAt(0)), p1 = xyz(edge.pointAt(1)), pm = xyz(edge.pointAt(0.5))
    let axis = unit([p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]])
    const length = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2])
    const pq = xyz(edge.pointAt(0.25)), lineMid: P3 = [(p0[0] + pm[0]) / 2, (p0[1] + pm[1]) / 2, (p0[2] + pm[2]) / 2]
    if (Math.hypot(pq[0] - lineMid[0], pq[1] - lineMid[1], pq[2] - lineMid[2]) > Math.max(1e-5, length * 1e-5)) throw new Error('切线权重圆角：目前只支持直线边')

    let scale = 1
    try { const b = out.boundingBox.bounds as [number[], number[]]; scale = Math.hypot(b[1][0] - b[0][0], b[1][1] - b[0][1], b[1][2] - b[0][2]) || 1 } catch { /* 1 */ }
    const eps = Math.max(1e-5, scale * 1e-7), q = (v: number) => Math.round(v / eps)
    const key = (e: any) => { const a = xyz(e.pointAt(0)), b = xyz(e.pointAt(1)), m = xyz(e.pointAt(0.5)); const ps = (x: P3) => `${q(x[0])},${q(x[1])},${q(x[2])}`; const ab = [ps(a), ps(b)].sort(); return `${ab[0]}|${ab[1]}|${ps(m)}` }
    const ek = key(edge), adj: any[] = []
    for (const face of out.faces as any[]) {
      if (!String(face.geomType).toUpperCase().includes('PLANE')) continue
      if ((face.edges as any[]).some((e) => key(e) === ek)) adj.push(face)
    }
    if (adj.length !== 2) throw new Error('切线权重圆角：所选边必须连接两个平面')
    const normal = (f: any): P3 => { const n = f.normalAt(pm); return unit([n.x, n.y, n.z]) }
    const pair = adj.map((face) => ({ face, n: normal(face) })).sort((a, b) => (b.n[2] - a.n[2]) || (b.n[1] - a.n[1]) || (b.n[0] - a.n[0]))
    const nA = pair[0].n, nB = pair[1].n
    if (Math.abs(dot(nA, nB)) > 1e-3 || Math.abs(dot(nA, axis)) > 1e-3 || Math.abs(dot(nB, axis)) > 1e-3) throw new Error('切线权重圆角：目前只支持互相垂直的平面侧面')
    const u = neg(nB), v = neg(nA)
    let base = p0
    if (dot(cross(axis, u), v) < 0) { axis = neg(axis); base = p1 }
    if (dot(cross(axis, u), v) < 0.999) throw new Error('切线权重圆角：无法建立局部截面坐标')

    const r = radii[k]
    const controls = weightedProfileControlPoints(r, ws[k], continuity)
    const plane = new Plane(base as any, u as any, axis as any)
    const tool = draw([r, 0]).bezierCurveTo([0, r], controls).lineTo([0, 0]).close().sketchOnPlane(plane).extrude(length)
    const candidate = out.cut(tool)
    const circular = r * r * (1 - Math.PI / 4) * length
    let removed = Number.NaN
    try { removed = meshVolume(out, scale) - meshVolume(candidate, scale) } catch { /* validation below */ }
    if (!(removed > circular * 0.2 && removed < circular * 2.2) || !candidate?.wrapped || candidate.wrapped.IsNull()) throw new Error(`切线权重圆角：该边不是可支持的凸直角边，几何保持不变（移除 ${removed.toFixed(3)}）`)
    out = candidate
  }
  return out
}
