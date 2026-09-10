import { detectRegions, type Pt, type RShape } from './regions'
import { bulgeCenter } from './sketchOps'

/** Exact line/circle provenance is retained separately from the display arrangement.
 * Unsupported splines/conics return null, so callers cannot label sampled curves exact. */
export type AnalyticShape = RShape & { arc?: { a: Pt; b: Pt; m: Pt }; verts?: Pt[]; bulges?: number[]; smooth?: boolean; conic?: boolean; earc?: unknown; ell?: unknown }
export type AnalyticLoop = { kind: 'poly'; pts: Pt[]; verts: Pt[]; bulges: number[]; sources: { shape: number; segment: number; t0: number; t1: number }[] }
type Curve = { shape: number; segment: number; a: Pt; b: Pt; center?: Pt; radius?: number; start?: number; sweep?: number }
const TAU = Math.PI * 2, EPS = 1e-8
const key = (p: Pt) => `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)}`
const cross = (a: Pt, b: Pt) => a[0] * b[1] - a[1] * b[0]
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]]
const at = (c: Curve, t: number): Pt => c.center
  ? [c.center[0] + c.radius! * Math.cos(c.start! + c.sweep! * t), c.center[1] + c.radius! * Math.sin(c.start! + c.sweep! * t)]
  : [c.a[0] + (c.b[0] - c.a[0]) * t, c.a[1] + (c.b[1] - c.a[1]) * t]
function parameter(c: Curve, p: Pt): number | null {
  if (!c.center) { const d = sub(c.b, c.a), q = sub(p, c.a), l2 = d[0] ** 2 + d[1] ** 2; if (!l2 || Math.abs(cross(d, q)) > EPS * Math.sqrt(l2)) return null; const t = (q[0] * d[0] + q[1] * d[1]) / l2; return t >= -EPS && t <= 1 + EPS ? Math.max(0, Math.min(1, t)) : null }
  if (Math.abs(Math.hypot(...sub(p, c.center)) - c.radius!) > EPS * Math.max(1, c.radius!)) return null
  const angle = Math.atan2(p[1] - c.center[1], p[0] - c.center[0]); let delta = ((angle - c.start!) * Math.sign(c.sweep!) % TAU + TAU) % TAU
  if (TAU - delta < EPS) delta = 0
  const t = delta / Math.abs(c.sweep!); return t <= 1 + EPS ? Math.min(1, t) : null
}
function intersections(a: Curve, b: Curve): Pt[] {
  if (!a.center && !b.center) { const da = sub(a.b, a.a), db = sub(b.b, b.a), den = cross(da, db); return Math.abs(den) < EPS ? [a.a, a.b, b.a, b.b] : [at(a, cross(sub(b.a, a.a), db) / den)] }
  if (!a.center || !b.center) { const line = a.center ? b : a, circle = a.center ? a : b, d = sub(line.b, line.a), q = sub(line.a, circle.center!), A = d[0] ** 2 + d[1] ** 2, B = 2 * (d[0] * q[0] + d[1] * q[1]), C = q[0] ** 2 + q[1] ** 2 - circle.radius! ** 2; const disc = B * B - 4 * A * C; if (!A || disc < -EPS) return []; const root = Math.sqrt(Math.max(0, disc)); return [at(line, (-B - root) / (2 * A)), at(line, (-B + root) / (2 * A))] }
  const dxy = sub(b.center, a.center), d = Math.hypot(...dxy), ra = a.radius!, rb = b.radius!
  if (d < EPS) return Math.abs(ra - rb) < EPS ? [a.a, a.b, b.a, b.b] : []
  if (d > ra + rb + EPS || d < Math.abs(ra - rb) - EPS) return []
  const x = (ra * ra - rb * rb + d * d) / (2 * d), y = Math.sqrt(Math.max(0, ra * ra - x * x)), p: Pt = [a.center[0] + dxy[0] * x / d, a.center[1] + dxy[1] * x / d]
  return [[p[0] - dxy[1] * y / d, p[1] + dxy[0] * y / d], [p[0] + dxy[1] * y / d, p[1] - dxy[0] * y / d]]
}
function curvesOf(shapes: AnalyticShape[]): Curve[] | null {
  const out: Curve[] = []
  for (let shape = 0; shape < shapes.length; shape++) {
    const s = shapes[shape]; if (s.construction || s.point) continue
    if (s.smooth || s.conic || s.earc || s.ell) return null
    if (s.type === 'circle' && s.c && s.r && s.r > 0) { out.push({ shape, segment: 0, a: [s.c[0] + s.r, s.c[1]], b: [s.c[0] + s.r, s.c[1]], center: s.c, radius: s.r, start: 0, sweep: TAU }); continue }
    if (s.arc) {
      const { a, b, m } = s.arc, u = sub(b, a), v = sub(m, a), det = 2 * cross(u, v); if (Math.abs(det) < EPS) return null
      const u2 = u[0] ** 2 + u[1] ** 2, v2 = v[0] ** 2 + v[1] ** 2, center: Pt = [a[0] + (u2 * v[1] - v2 * u[1]) / det, a[1] + (u[0] * v2 - v[0] * u2) / det]
      const start = Math.atan2(a[1] - center[1], a[0] - center[0]), angle = (p: Pt) => (Math.atan2(p[1] - center[1], p[0] - center[0]) - start + TAU) % TAU, end = angle(b), mid = angle(m), sweep = mid <= end ? end : end - TAU
      out.push({ shape, segment: 0, a, b, center, radius: Math.hypot(...sub(a, center)), start, sweep }); if (!s.open) out.push({ shape, segment: 1, a: b, b: a }); continue
    }
    const ps: Pt[] | undefined = s.type === 'rect' && s.a && s.b ? [s.a, [s.b[0], s.a[1]], s.b, [s.a[0], s.b[1]]] : s.verts ?? s.pts
    if (!ps) continue
    for (let segment = 0; segment < ps.length - (s.open ? 1 : 0); segment++) { const a = ps[segment], b = ps[(segment + 1) % ps.length]; if (Math.hypot(...sub(b, a)) < EPS) continue; const bulge = s.bulges?.[segment] ?? 0; const c: Curve = { shape, segment, a, b }; if (Math.abs(bulge) > EPS) { c.center = bulgeCenter(a, b, bulge); c.radius = Math.hypot(...sub(a, c.center)); c.start = Math.atan2(a[1] - c.center[1], a[0] - c.center[0]); c.sweep = -4 * Math.atan(bulge) } out.push(c) }
  }
  return out
}
export function detectAnalyticRegions(shapes: AnalyticShape[]): { pfaces: { outer: AnalyticLoop; holes: AnalyticLoop[] }[]; unionLoops: AnalyticLoop[] } | null {
  const curves = curvesOf(shapes); if (!curves || curves.length > 400) return null
  const cuts = curves.map(() => [0, 1])
  for (let i = 0; i < curves.length; i++) for (let j = i + 1; j < curves.length; j++) for (const p of intersections(curves[i], curves[j])) { const t = parameter(curves[i], p), u = parameter(curves[j], p); if (t !== null && u !== null) { cuts[i].push(t); cuts[j].push(u) } }
  type Edge = { curve: Curve; t0: number; t1: number }
  const provenance = new Map<string, Edge>(), display: RShape[] = []
  for (let i = 0; i < curves.length; i++) { const c = curves[i], ts = cuts[i].sort((a, b) => a - b).filter((v, k, all) => !k || v - all[k - 1] > EPS)
    for (let j = 0; j + 1 < ts.length; j++) { const n = c.center ? Math.max(1, Math.ceil(Math.abs(c.sweep! * (ts[j + 1] - ts[j])) / (Math.PI / 24))) : 1
      for (let k = 0; k < n; k++) { const t0 = ts[j] + (ts[j + 1] - ts[j]) * k / n, t1 = ts[j] + (ts[j + 1] - ts[j]) * (k + 1) / n, a = at(c, t0), b = at(c, t1); display.push({ type: 'poly', pts: [a, b], open: true }); provenance.set(key(a) + '|' + key(b), { curve: c, t0, t1 }); provenance.set(key(b) + '|' + key(a), { curve: c, t0: t1, t1: t0 }) }
    }
  }
  const region = detectRegions(display); if (region.overflow) return null
  const loop = (pts: Pt[]): AnalyticLoop | null => {
    const edges = pts.map((p, i) => provenance.get(key(p) + '|' + key(pts[(i + 1) % pts.length]))); if (edges.some(e => !e)) return null
    // Coalesce samples back to analytic spans. Keep each arc below pi and
    // at least three vertices for the existing mixed-profile kernel contract.
    const spans: Edge[] = []
    for (const edge of edges as Edge[]) { const last = spans.at(-1); if (last && last.curve === edge.curve && Math.abs(last.t1 - edge.t0) < EPS && (!edge.curve.center || Math.abs(edge.curve.sweep! * (edge.t1 - last.t0)) < Math.PI - EPS)) last.t1 = edge.t1; else spans.push({ ...edge }) }
    while (spans.length < 3) { const index = spans.findIndex(e => !!e.curve.center); if (index < 0) return null; const e = spans[index], mid = (e.t0 + e.t1) / 2; spans.splice(index, 1, { ...e, t1: mid }, { ...e, t0: mid }) }
    return { kind: 'poly', pts, verts: spans.map(e => at(e.curve, e.t0)), bulges: spans.map(e => e.curve.center ? -Math.tan(e.curve.sweep! * (e.t1 - e.t0) / 4) : 0), sources: spans.map(e => ({ shape: e.curve.shape, segment: e.curve.segment, t0: e.t0, t1: e.t1 })) }
  }
  const pfaces = region.pfaces.map(f => ({ outer: loop(f.outer), holes: f.holes.map(loop) })), unionLoops = region.unionLoops.map(loop)
  if (unionLoops.some(x => !x) || pfaces.some(f => !f.outer || f.holes.some(x => !x))) return null
  return { pfaces: pfaces as { outer: AnalyticLoop; holes: AnalyticLoop[] }[], unionLoops: unionLoops as AnalyticLoop[] }
}
