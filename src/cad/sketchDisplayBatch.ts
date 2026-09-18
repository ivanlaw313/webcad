/**
 * v1.35: batch many sketch polylines into few LineSegments position buffers.
 * Avoids per-shape drei <Line> / Line2 material+fiber explosion on schematic DXF imports.
 */
export type V3 = [number, number, number]
export type Pt2 = [number, number]

/** Prefer merged LineSegments once shape count hits this (CommittedSketches / large SketchDraw). */
export const SKETCH_BATCH_THRESHOLD = 48

/** Soft/force sketchOnly schematics: keep only this many TEXT underline+point markers. */
export const DXF_SCHEMATIC_TEXT_MARKERS = 16

/** Dim HUD: how many DXF TEXT labels to project as DOM overlays (model keeps all). */
export const DXF_LABEL_DISPLAY_CAP = 64

/** Skip closed-region fill triangulation above this non-construction count. */
export const SKETCH_FILL_SKIP_THRESHOLD = 48

export type BatchShape = {
  type: 'rect' | 'circle' | 'poly'
  a?: Pt2
  b?: Pt2
  c?: Pt2
  r?: number
  pts?: Pt2[]
  open?: boolean
  construction?: boolean
  point?: boolean
  centerline?: boolean
  projected?: boolean
}

type Lift = (p: Pt2) => V3

function circleLift(c: Pt2, r: number, lift: Lift, n = 32): V3[] {
  const out: V3[] = []
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    out.push(lift([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]))
  }
  return out
}

function rectLift(a: Pt2, b: Pt2, lift: Lift): V3[] {
  return [lift(a), lift([b[0], a[1]]), lift(b), lift([a[0], b[1]]), lift(a)]
}

/** Append a continuous polyline as LineSegments pairs (a-b, b-c, …). */
export function appendPolylineSegments(out: number[], pts: V3[], closed = false): void {
  const n = pts.length
  if (n < 2) return
  const last = closed ? n : n - 1
  for (let i = 0; i < last; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % n]
    out.push(a[0], a[1], a[2], b[0], b[1], b[2])
  }
}

/** Approximate a dashed segment as short solid segments (no LineDashedMaterial per object). */
export function appendDashedPair(out: number[], a: V3, b: V3, dash = 3.2, gap = 2.4): void {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2]
  const len = Math.hypot(dx, dy, dz)
  if (len < 1e-9) return
  const ux = dx / len, uy = dy / len, uz = dz / len
  let t = 0
  let draw = true
  while (t < len - 1e-9) {
    const span = draw ? dash : gap
    const t1 = Math.min(len, t + span)
    if (draw) {
      out.push(
        a[0] + ux * t, a[1] + uy * t, a[2] + uz * t,
        a[0] + ux * t1, a[1] + uy * t1, a[2] + uz * t1,
      )
    }
    t = t1
    draw = !draw
  }
}

export function appendDashedPolyline(out: number[], pts: V3[], closed = false, dash = 3.2, gap = 2.4): void {
  const n = pts.length
  if (n < 2) return
  const last = closed ? n : n - 1
  for (let i = 0; i < last; i++) appendDashedPair(out, pts[i], pts[(i + 1) % n], dash, gap)
}

/** Point marker as an × (two segments). */
export function appendPointX(out: number[], c: V3, s = 1.8): void {
  out.push(c[0] - s, c[1], c[2] - s, c[0] + s, c[1], c[2] + s)
  out.push(c[0] - s, c[1], c[2] + s, c[0] + s, c[1], c[2] - s)
}

function shapeWorldPts(sh: BatchShape, lift: Lift): V3[] | null {
  if (sh.type === 'circle' && sh.point && sh.c) return [lift(sh.c)]
  if (sh.type === 'circle' && sh.c && sh.r != null) return circleLift(sh.c, sh.r, lift)
  if (sh.type === 'rect' && sh.a && sh.b) return rectLift(sh.a, sh.b, lift)
  if (sh.type === 'poly' && sh.pts && sh.pts.length) {
    const pts = sh.pts.map(lift)
    if (!sh.open && pts.length >= 2) return [...pts, pts[0]]
    return pts
  }
  return null
}

export type BatchedSketchPositions = { solid: Float32Array; constr: Float32Array; solidCount: number; constrCount: number }

/**
 * Pack shapes into two LineSegments buffers (solid + construction).
 * `limit` optionally truncates for progressive reveal (0 = all).
 */
export function batchSketchPositions(
  shapes: BatchShape[],
  lift: Lift,
  opt?: { limit?: number; includeConstruction?: boolean },
): BatchedSketchPositions {
  const solid: number[] = []
  const constr: number[] = []
  const includeCon = opt?.includeConstruction !== false
  const n = opt?.limit && opt.limit > 0 ? Math.min(shapes.length, opt.limit) : shapes.length
  for (let i = 0; i < n; i++) {
    const sh = shapes[i]
    if (sh.type === 'circle' && sh.point) {
      if (!includeCon && sh.construction) continue
      const w = lift(sh.c!)
      appendPointX(sh.construction ? constr : solid, w)
      continue
    }
    const pts = shapeWorldPts(sh, lift)
    if (!pts || pts.length < 2) continue
    const closed = sh.type === 'circle' || sh.type === 'rect' || (sh.type === 'poly' && !sh.open)
    // shapeWorldPts already closes polys by repeating first pt — treat as open chain of segments
    const chainClosed = false
    const usePts = pts
    if (sh.construction || sh.centerline) {
      if (!includeCon) continue
      appendDashedPolyline(constr, usePts, chainClosed, sh.centerline ? 9 : 3.2, sh.centerline ? 3 : 2.4)
    } else {
      appendPolylineSegments(solid, usePts, chainClosed)
      void closed
    }
  }
  return {
    solid: new Float32Array(solid),
    constr: new Float32Array(constr),
    solidCount: solid.length / 6,
    constrCount: constr.length / 6,
  }
}

/** Adaptive TEXT construction-marker budget (labels always retained separately). */
export function dxfTextMarkerBudget(
  preferSketchOnly: boolean,
  forceSketchOnly: boolean,
  defaultCap = 128,
  schematicCap = DXF_SCHEMATIC_TEXT_MARKERS,
): number {
  if (forceSketchOnly || preferSketchOnly) return schematicCap
  return defaultCap
}
