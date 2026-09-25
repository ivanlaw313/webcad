// Aero Design Lab — real B-rep CAD bodies via replicad/OCCT.
//   wing  : B-spline airfoil sections lofted tip → root → tip (one smooth solid)
//   prop  : lofted blade, circular pattern ×B, fused with a cylindrical hub
//   shell : B-spline meridian revolved about the body (X) axis
// The replicad module is injected so the same code runs in the browser worker (aerocad.worker.ts)
// and in node kernel tests.
import { bladeSections, hubDims, shellMeridian, spinnerProfile, wingSections, type P3 } from './geometry'
import { paramsOf, propGeomOf, type DesignSpec } from './designSpace'

// Minimal structural typing of the replicad API we use (avoid importing replicad here → keeps the
// pure-TS physics bundle free of the kernel).
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ReplicadLike {
  makeBSplineApproximation: (points: any[], cfg?: any) => any
  assembleWire: (edges: any[]) => any
  loft: (wires: any[], cfg?: any, returnShell?: boolean) => any
  makeCylinder: (radius: number, height: number, location?: any, direction?: any) => any
  makeLine: (a: any, b: any) => any
  makeFace: (wire: any) => any
  revolution: (face: any, center?: any, direction?: any, angle?: number) => any
}

function sectionWire(r: ReplicadLike, pts: P3[]): any {
  // closed airfoil loop: open B-spline through TE→lower→LE→upper→TE, closed by the (sharp) TE point.
  // Tiny blunt TE segment keeps the wire valid if the approximation does not land exactly on TE.
  const open = pts.slice(0, -1)
  const e = r.makeBSplineApproximation(open.concat([pts[pts.length - 1]]).map((p) => [p[0], p[1], p[2]]), { tolerance: 1e-3, smoothing: null, degMax: 3, degMin: 1 })
  return r.assembleWire([e])
}

export function buildAeroShape(r: ReplicadLike, spec: DesignSpec, x: Record<string, number>): any {
  if (spec.kind === 'wing') {
    const secs = wingSections(spec, x, 10, 30)
    return r.loft(secs.map((s) => sectionWire(r, s)), { ruled: false })
  }
  if (spec.kind === 'prop') {
    const g = propGeomOf(paramsOf(spec, x))
    const secs = bladeSections(spec, x, 12, 26)
    const blade0 = r.loft(secs.map((s) => sectionWire(r, s)), { ruled: false })
    const h = hubDims(spec, x)
    let body = r.makeCylinder(h.r, h.z1 - h.z0, [0, 0, h.z0], [0, 0, 1])
    // spinner: elliptic ogive meridian in the XZ plane, closed along the axis, revolved about Z
    const sp = spinnerProfile(spec, x, 12)
    const apex = sp[sp.length - 1]
    const ogive = r.makeBSplineApproximation(sp.map(([rr, z]) => [rr, 0, z]), { tolerance: 0.02, smoothing: null, degMax: 3, degMin: 1 })
    const spinner = r.revolution(r.makeFace(r.assembleWire([ogive, r.makeLine([0, 0, apex[1]], [0, 0, sp[0][1]]), r.makeLine([0, 0, sp[0][1]], [sp[0][0], 0, sp[0][1]])])), [0, 0, 0], [0, 0, 1], 360)
    body = body.fuse(spinner)
    for (let b = 0; b < g.blades; b++) {
      const bl = b === 0 ? blade0 : blade0.clone().rotate(360 * b / g.blades, [0, 0, 0], [0, 0, 1])
      body = body.fuse(bl)
    }
    return body
  }
  // shell: meridian (x, r) in the XZ plane, closed along the axis, revolved about X
  const prof = shellMeridian(spec, x, 48)
  const L = prof[prof.length - 1][0], rb = prof[prof.length - 1][1]
  const curve = r.makeBSplineApproximation(prof.map(([a, b]) => [a, 0, b]), { tolerance: 0.05, smoothing: null, degMax: 3, degMin: 1 })
  const edges = [curve]
  if (rb > 0.05) edges.push(r.makeLine([L, 0, rb], [L, 0, 0]))
  edges.push(r.makeLine([L, 0, 0], [0, 0, 0]))
  const face = r.makeFace(r.assembleWire(edges))
  return r.revolution(face, [0, 0, 0], [1, 0, 0], 360)
}
