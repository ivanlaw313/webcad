// Fusion-style sketch Delete: deleting ONE line of a rectangle / polyline removes only that line — the rest of the
// contour survives as open polyline(s). Only selected entities (and constraints/dims touching them) are removed.
// Pure: shapes in, shapes + ref remapper out (no store access) so it is unit-testable.
type Pt = [number, number]
type AnyShape = { type: string; construction?: boolean; [k: string]: unknown }
type Ref = { kind: string; shape?: number; idx?: number; [k: string]: unknown }

/**
 * Edge-splittable contour: rect corners (freesolve order), plain poly pts, or a line/arc path (verts + bulges —
 * what the Line tool, fillets and tangent arcs produce; UX4 #9). `bulges` is per-edge (undefined = all straight).
 * null = not edge-splittable (circle, 3-pt arc, spline, ellipse, projected …).
 */
export function straightContour(sh: AnyShape): { pts: Pt[]; closed: boolean; bulges?: number[] } | null {
  if (sh.type === 'rect') {
    const a = sh.a as Pt, b = sh.b as Pt
    return { pts: [a, [b[0], a[1]], b, [a[0], b[1]]], closed: true }
  }
  if (sh.type !== 'poly') return null
  const p = sh as AnyShape & { pts?: Pt[]; verts?: Pt[]; bulges?: number[]; open?: boolean }
  if (p.arc || p.smooth || p.bspline || p.conic || p.ctrl || p.ell || p.earc || p.projected) return null
  // UX2 #5 + UX4 #9：折線工具畫出嚟嘅線帶 verts + bulges — 照拆（直段同弧段都得，弧 bulge 跟住佢嗰段）
  if (Array.isArray(p.verts) && Array.isArray(p.bulges)) {
    if (p.verts.length < 2) return null
    return { pts: p.verts.map((q) => [q[0], q[1]] as Pt), closed: !p.open, bulges: p.verts.map((_, k) => Number(p.bulges![k]) || 0) }
  }
  if (p.verts || p.bulges) return null
  if (!Array.isArray(p.pts) || p.pts.length < 2) return null
  return { pts: p.pts.map((q) => [q[0], q[1]] as Pt), closed: !p.open }
}

/** Number of edges of a straight contour. */
const edgeCount = (c: { pts: Pt[]; closed: boolean }) => (c.closed ? c.pts.length : c.pts.length - 1)

/** Builder for an open line/arc path run (store passes its openVertsPoly so pts get the true arc tessellation). */
export type OpenPathBuilder = (verts: Pt[], bulges: number[]) => AnyShape

export type EdgeSplit = {
  shapes: AnyShape[]                                   // replacement open polylines (0..n)
  mapRef: (r: Ref) => Ref | null                       // old ref on this shape → new ref (shape = local run index) or null (dropped)
}

/**
 * Remove `edges` (edge indices) from one straight contour. Returns null when the shape isn't splittable
 * (circles, splines, arcs … → caller deletes the whole entity as before).
 */
export function removeContourEdges(sh: AnyShape, edges: Iterable<number>, openPath?: OpenPathBuilder): EdgeSplit | null {
  const c = straightContour(sh)
  if (!c) return null
  const n = c.pts.length, m = edgeCount(c)
  const del = new Set([...edges].filter((e) => Number.isInteger(e) && e >= 0 && e < m))
  if (!del.size) return null
  // Runs of consecutive surviving edges. For a closed contour start right after a deleted edge so runs don't wrap.
  const start = c.closed ? ([...del].sort((a, b) => a - b)[0] + 1) % m : 0
  const runs: number[][] = []   // each run = list of old edge indices in order
  let cur: number[] = []
  for (let k = 0; k < m; k++) {
    const e = (start + k) % m
    if (del.has(e)) { if (cur.length) runs.push(cur); cur = [] } else cur.push(e)
  }
  if (cur.length) runs.push(cur)
  const extra = sh.construction ? { construction: true } : {}
  const shapes: AnyShape[] = runs.map((run) => {
    const verts: Pt[] = [...run.map((e) => c.pts[e]), c.pts[(run[run.length - 1] + 1) % n]]
    if (!c.bulges) return { type: 'poly', pts: verts, open: true, ...extra }
    const bul = run.map((e) => c.bulges![e])
    const built = openPath ? openPath(verts, bul) : { type: 'poly', pts: verts, verts, bulges: bul, open: true }
    return { ...built, open: true, ...extra }
  })
  const edgeAt = new Map<number, [number, number]>()     // old edge → [run, local edge]
  const ptAt = new Map<number, [number, number]>()       // old vertex → [run, local vertex] (first run wins)
  runs.forEach((run, ri) => run.forEach((e, j) => {
    edgeAt.set(e, [ri, j])
    if (!ptAt.has(e)) ptAt.set(e, [ri, j])
    const v = (e + 1) % n
    if (!ptAt.has(v)) ptAt.set(v, [ri, j + 1])
  }))
  const mapRef = (r: Ref): Ref | null => {
    // 'center' = arc-segment centre of a verts path → follows its segment like an edge
    if ((r.kind === 'edge' || r.kind === 'center') && typeof r.idx === 'number') { const t = edgeAt.get(r.idx); return t ? { ...r, shape: t[0], idx: t[1] } : null }
    if (r.kind === 'pt' && typeof r.idx === 'number') { const t = ptAt.get(r.idx); return t ? { ...r, shape: t[0], idx: t[1] } : null }
    return null
  }
  return { shapes, mapRef }
}
