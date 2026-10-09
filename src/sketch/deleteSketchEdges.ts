// Fusion-style sketch Delete: deleting ONE line of a rectangle / polyline removes only that line — the rest of the
// contour survives as open polyline(s). Only selected entities (and constraints/dims touching them) are removed.
// Pure: shapes in, shapes + ref remapper out (no store access) so it is unit-testable.
type Pt = [number, number]
type AnyShape = { type: string; construction?: boolean; [k: string]: unknown }
type Ref = { kind: string; shape?: number; idx?: number; [k: string]: unknown }

/** Straight-segment contour vertices (rect corners in freesolve order, or plain poly pts); null = not edge-splittable. */
export function straightContour(sh: AnyShape): { pts: Pt[]; closed: boolean } | null {
  if (sh.type === 'rect') {
    const a = sh.a as Pt, b = sh.b as Pt
    return { pts: [a, [b[0], a[1]], b, [a[0], b[1]]], closed: true }
  }
  if (sh.type !== 'poly') return null
  const p = sh as AnyShape & { pts?: Pt[]; verts?: Pt[]; bulges?: number[]; open?: boolean }
  if (p.arc || p.smooth || p.bspline || p.conic || p.ctrl || p.ell || p.earc || p.projected || p.verts || p.bulges) return null
  if (!Array.isArray(p.pts) || p.pts.length < 2) return null
  return { pts: p.pts.map((q) => [q[0], q[1]] as Pt), closed: !p.open }
}

/** Number of edges of a straight contour. */
const edgeCount = (c: { pts: Pt[]; closed: boolean }) => (c.closed ? c.pts.length : c.pts.length - 1)

export type EdgeSplit = {
  shapes: AnyShape[]                                   // replacement open polylines (0..n)
  mapRef: (r: Ref) => Ref | null                       // old ref on this shape → new ref (shape = local run index) or null (dropped)
}

/**
 * Remove `edges` (edge indices) from one straight contour. Returns null when the shape isn't splittable
 * (circles, splines, arcs … → caller deletes the whole entity as before).
 */
export function removeContourEdges(sh: AnyShape, edges: Iterable<number>): EdgeSplit | null {
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
  const shapes: AnyShape[] = runs.map((run) => ({ type: 'poly', pts: [...run.map((e) => c.pts[e]), c.pts[(run[run.length - 1] + 1) % n]], open: true, ...extra }))
  const edgeAt = new Map<number, [number, number]>()     // old edge → [run, local edge]
  const ptAt = new Map<number, [number, number]>()       // old vertex → [run, local vertex] (first run wins)
  runs.forEach((run, ri) => run.forEach((e, j) => {
    edgeAt.set(e, [ri, j])
    if (!ptAt.has(e)) ptAt.set(e, [ri, j])
    const v = (e + 1) % n
    if (!ptAt.has(v)) ptAt.set(v, [ri, j + 1])
  }))
  const mapRef = (r: Ref): Ref | null => {
    if (r.kind === 'edge' && typeof r.idx === 'number') { const t = edgeAt.get(r.idx); return t ? { ...r, shape: t[0], idx: t[1] } : null }
    if (r.kind === 'pt' && typeof r.idx === 'number') { const t = ptAt.get(r.idx); return t ? { ...r, shape: t[0], idx: t[1] } : null }
    return null
  }
  return { shapes, mapRef }
}
