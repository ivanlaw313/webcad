import { cardinalSketchFrame, localPointToCad, type CardinalPlane, type PlaneFrame } from './sketchPlaneFrame'
type P2 = [number, number]
export type RevolveFrameSource = { plane?: CardinalPlane; baseZ?: number; arb?: PlaneFrame; arbPlane?: PlaneFrame; faceBinding?: unknown; sketchFaceBinding?: unknown }

/**
 * BUG-SO16-001: a lathe profile must have extent *along* the axis.
 * Cardinal XZ places sketch V → world Z; revolving that about Y keeps every
 * point at constant Y → zero-volume planar sheet. Preview still draws a ring
 * that *looks* like it cuts a base plate, but confirm's B-rep intersect is empty
 * → rebuild-failed toast. Same for YZ about X / XY about Z.
 *
 * Remap to a plane that carries the axis as one sketch direction (Fusion front
 * lathe: vertical sketch = world up along the axis). Axis-aligned only; arbitrary
 * axisV / arbPlane keep the authored frame.
 */
export function revolveLathePlane(plane: CardinalPlane | undefined, axisDir: [number, number, number]): CardinalPlane {
  const p = plane ?? 'XY'
  const ax = Math.abs(axisDir[0]), ay = Math.abs(axisDir[1]), az = Math.abs(axisDir[2])
  if (ay >= ax && ay >= az) {
    // About Y: XY (V→Y) or YZ (U→Y) are valid; XZ is planar about Y → use XY
    return p === 'XZ' ? 'XY' : p
  }
  if (ax >= ay && ax >= az) {
    // About X: XY / XZ valid; YZ is planar about X → use XY
    return p === 'YZ' ? 'XY' : p
  }
  // About Z: XZ / YZ valid; XY is planar about Z → use XZ
  return p === 'XY' ? 'XZ' : p
}

export function revolveFrame(source: RevolveFrameSource, axisDir?: [number, number, number]): PlaneFrame {
  const offset = source.baseZ ?? 0
  if (source.arb ?? source.arbPlane) return (source.arb ?? source.arbPlane)!
  const authored = source.plane ?? 'XY'
  const plane = axisDir ? revolveLathePlane(authored, axisDir) : authored
  // When remapping XZ→XY (or similar), drop the authored plane offset — it was
  // along the old normal, not along the lathe axis.
  const remapped = plane !== authored
  const legacyXZ = !remapped && source.plane === 'XZ' && !source.faceBinding && !source.sketchFaceBinding
  return cardinalSketchFrame(plane, remapped ? 0 : (legacyXZ ? -offset : offset))
}

/** Map profile UV from the authored cardinal plane into the lathe plane's kernel UV. */
export function revolveRemapProfileUv(uv: P2, from: CardinalPlane, to: CardinalPlane): P2 {
  if (from === to) return uv
  // Back to sketch s/t from authored kernel UV, then into lathe kernel UV.
  const st: P2 = from === 'XY' ? [uv[0], -uv[1]] : from === 'YZ' ? [-uv[0], uv[1]] : [uv[0], uv[1]]
  return to === 'XY' ? [st[0], -st[1]] : to === 'YZ' ? [-st[0], st[1]] : [st[0], st[1]]
}

type AnyProfile = {
  kind?: string; a?: P2; b?: P2; c?: P2; r?: number; rx?: number; ry?: number; rot?: number
  pts?: P2[]; verts?: P2[]; holes?: AnyProfile[]; islands?: AnyProfile[]
  arc?: { a: P2; b: P2; m: P2 }; earc?: { cx: number; cy: number; [k: string]: unknown }
  cubics?: P2[][]; [k: string]: unknown
}
export function revolveRemapProfile<T extends AnyProfile>(profile: T, from: CardinalPlane, to: CardinalPlane): T {
  if (from === to) return profile
  const m = (p: P2) => revolveRemapProfileUv(p, from, to)
  const out: AnyProfile = { ...profile }
  if (out.a) out.a = m(out.a as P2)
  if (out.b) out.b = m(out.b as P2)
  if (out.c) out.c = m(out.c as P2)
  if (Array.isArray(out.pts)) out.pts = (out.pts as P2[]).map(m)
  if (Array.isArray(out.verts)) out.verts = (out.verts as P2[]).map(m)
  if (out.arc) out.arc = { a: m(out.arc.a), b: m(out.arc.b), m: m(out.arc.m) }
  if (out.earc) {
    const p = m([out.earc.cx, out.earc.cy])
    out.earc = { ...out.earc, cx: p[0], cy: p[1] }
  }
  if (Array.isArray(out.cubics)) out.cubics = out.cubics.map((seg) => seg.map(m))
  // XY mirror flips V → negate ellipse rotation so the silhouette matches.
  if (typeof out.rot === 'number' && (from === 'XY') !== (to === 'XY')) out.rot = -out.rot
  if (out.holes) out.holes = out.holes.map((h) => revolveRemapProfile(h, from, to))
  if (out.islands) out.islands = out.islands.map((h) => revolveRemapProfile(h, from, to))
  return out as T
}

/** New dialog loops are sketch s/t; saved feature loops are kernel u/v. */
export function revolvePointToCad(point: P2, source: RevolveFrameSource, rawSketch: boolean, axisDir?: [number, number, number]): [number, number, number] {
  const authored = source.plane ?? 'XY'
  const plane = axisDir ? revolveLathePlane(authored, axisDir) : authored
  let uv: P2
  if (rawSketch && !source.arb && !source.arbPlane) {
    // Mirror-map uses the *effective* lathe plane so UV matches profileToSketch.
    uv = plane === 'XY' ? [point[0], -point[1]] : plane === 'YZ' ? [-point[0], point[1]] : point
  } else if (!source.arb && !source.arbPlane && plane !== authored) {
    // Saved feature UV is in the authored plane; remap into lathe kernel UV.
    uv = revolveRemapProfileUv(point, authored, plane)
  } else {
    uv = point
  }
  return localPointToCad(revolveFrame(source, axisDir), uv[0], uv[1])
}
