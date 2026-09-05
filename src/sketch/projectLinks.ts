import { chainSegments } from './chainsegs'
import type { SketchShape, Pt } from '../store'

type RefGeo = { segs: [Pt, Pt][] }
type Ref = { kind?: string; shape?: number }
type Constraint = { a?: Ref; b?: Ref; c?: Ref }

const linkedShape = (c: { pts: Pt[]; closed: boolean }): SketchShape => c.closed && c.pts.length >= 3
  ? { type: 'poly', pts: c.pts.map((p) => [p[0], p[1]] as Pt), projected: true, projectLink: 'all' }
  : { type: 'poly', pts: c.pts.map((p) => [p[0], p[1]] as Pt), open: true, projected: true, projectLink: 'all' }

/**
 * Conservatively refresh Project/Include-All curves when a sketch reopens.
 * We only replace an existing linked set when its topology is identical and
 * no dimension/constraint refers to it; otherwise its old snapshot remains
 * valid and the caller can tell the user why it was not refreshed.
 */
export function refreshSafeProjectLinks(shapes: SketchShape[], refGeo: RefGeo | null, cons: Constraint[]): { shapes: SketchShape[]; refreshed: number; held: number } {
  const linked = shapes.map((s, i) => s.type === 'poly' && s.projectLink === 'all' ? i : -1).filter((i) => i >= 0)
  if (!linked.length || !refGeo?.segs.length) return { shapes, refreshed: 0, held: 0 }
  const constrained = cons.some((c) => [c.a, c.b, c.c].some((r) => r?.kind !== 'origin' && typeof r?.shape === 'number' && linked.includes(r.shape)))
  const chains = chainSegments(refGeo.segs.map(([a, b]) => [[a[0], a[1]] as Pt, [b[0], b[1]] as Pt]))
    .filter((c) => c.pts.length >= 2)
  const sameTopology = chains.length === linked.length && chains.every((c, i) => {
    const old = shapes[linked[i]]
    return old.type === 'poly' && !!old.open === !c.closed && old.pts.length === c.pts.length
  })
  if (constrained || !sameTopology) return { shapes, refreshed: 0, held: linked.length }
  const next = [...shapes]
  linked.forEach((idx, i) => { next[idx] = linkedShape(chains[i]) })
  return { shapes: next, refreshed: linked.length, held: 0 }
}
