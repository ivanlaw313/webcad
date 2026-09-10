import { bulgeCenter, bulgeRadius } from './sketchOps'
import { circum3, refPts, skConId, inferCoincident, type FShape, type SkCon, type SkRef } from './freesolve'

/** Keep only references whose geometric entity actually survives a trim.
 * Radial dimensions retain their identity and expression metadata; remaining
 * pieces of that same circular support inherit an equal-radius relation. */
export function constraintsAfterTrim(shapes: FShape[], removed: number, parts: FShape[], cons: SkCon[]): { cons: SkCon[]; dropped: number } {
  const next = [...shapes.filter((_, i) => i !== removed), ...parts], base = shapes.length - 1
  const near = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6
  const support = (sh: FShape, r: SkRef) => {
    if (sh.type === 'circle' && (r.kind === 'circle' || (r.kind === 'pt' && r.idx === 0))) return { c: sh.c, r: sh.r }
    if (sh.type !== 'poly') return null
    if (sh.arc && (r.kind === 'circle' || r.kind === 'edge' || r.kind === 'center' || (r.kind === 'pt' && r.idx === 2))) return circum3(sh.arc.a, sh.arc.m, sh.arc.b)
    if ((r.kind === 'edge' || r.kind === 'center') && sh.verts && sh.bulges && Math.abs(sh.bulges[r.idx] || 0) > 1e-10) { const a = sh.verts[r.idx], b = sh.verts[(r.idx + 1) % sh.verts.length], bu = sh.bulges[r.idx]; return { c: bulgeCenter(a, b, bu), r: bulgeRadius(a, b, bu) } }
    return null
  }
  const matchingArcs = (r: SkRef): SkRef[] => {
    const circle = support(shapes[removed], r); if (!circle) return []
    const matches: SkRef[] = []
    parts.forEach((part, j) => { if (part.type !== 'poly' || !part.verts || !part.bulges) return
      for (let k = 0; k < part.verts.length - (part.open ? 1 : 0); k++) { const ref: SkRef = { kind: 'edge', shape: base + j, idx: k }, target = support(part, { ...ref, shape: j }); if (target && near(target.c, circle.c) && Math.abs(target.r - circle.r) < 1e-6) matches.push(ref) }
    }); return matches
  }
  const remap = (r?: SkRef, circular = false): SkRef | undefined | null => {
    if (!r || !('shape' in r)) return r
    if (r.shape !== removed) return { ...r, shape: r.shape - (r.shape > removed ? 1 : 0) }
    const source = shapes[removed]
    const isCenter = r.kind === 'center' || (r.kind === 'pt' && ((source.type === 'circle' && r.idx === 0) || (source.type === 'poly' && !!source.arc && r.idx === 2)))
    if (isCenter) { const arc = matchingArcs(r)[0]; return arc && arc.kind === 'edge' ? { kind: 'center', shape: arc.shape, idx: arc.idx } : null }
    if (circular) return matchingArcs(r)[0] ?? null
    if (r.kind !== 'pt') return null
    const old = refPts(shapes, r)[0]; if (!old) return null
    // Unsupported point references never become arbitrary coincident endpoints.
    if (shapes[removed].type === 'circle') return null
    for (let j = 0; j < parts.length; j++) { const part = parts[j]; if (part.type !== 'poly') continue; const vs = part.verts ?? part.pts; const idx = vs.findIndex(p => near(p, old)); if (idx >= 0) return { kind: 'pt', shape: base + j, idx } }
    return null
  }
  const result: SkCon[] = [], equalPairs = new Set<string>(); let dropped = 0
  for (const c of cons) {
    // Fixing a full circle means its center and radius, not the new cut endpoints.
    // Keep the user's original constraint ID on the center lock.
    if (c.kind === 'con' && c.type === 'fix' && c.a.kind === 'circle' && c.a.shape === removed && shapes[removed].type === 'circle') {
      const arc = matchingArcs(c.a)[0], circle = shapes[removed]
      if (!arc || arc.kind !== 'edge' || circle.type !== 'circle') { dropped++; continue }
      result.push({ ...c, a: { kind: 'center', shape: arc.shape, idx: arc.idx } })
      result.push({ id: skConId(), kind: 'dim', type: 'rad', a: arc, value: circle.r })
      continue
    }
    const radial = c.kind === 'dim' && (c.type === 'rad' || c.type === 'dia')
    const circular = radial || (c.kind === 'con' && ['equal', 'tangent', 'concentric'].includes(c.type))
    const a = remap(c.a, circular), b = remap(c.b, circular), axis = remap('c' in c ? c.c : undefined)
    if (a === null || b === null || axis === null) { dropped++; continue }
    result.push({ ...c, a: a!, ...(b ? { b } : {}), ...(axis ? { c: axis } : {}) } as SkCon)
    if (radial && 'shape' in c.a && c.a.shape === removed && !c.driven) {
      const arcs = matchingArcs(c.a)
      for (const other of arcs.slice(1)) { const key = JSON.stringify([arcs[0], other]); if (equalPairs.has(key)) continue; equalPairs.add(key); result.push({ id: skConId(), kind: 'con', type: 'equal', a: arcs[0], b: other }) }
    }
  }
  const source = shapes[removed]
  if (source.type === 'circle' || (source.type === 'poly' && source.arc)) {
    const arcs = matchingArcs({ kind: 'circle', shape: removed })
    for (const other of arcs.slice(1)) {
      const pair = JSON.stringify([arcs[0], other])
      if (!equalPairs.has(pair)) result.push({ id: skConId(), kind: 'con', type: 'equal', a: arcs[0], b: other })
      result.push({ id: skConId(), kind: 'con', type: 'concentric', a: arcs[0], b: other })
    }
  }
  // New cut endpoints that coincide with real cutter endpoints remain joined
  // when the preserved radius is edited. No vanished original endpoint maps.
  for (let j = 0; j < parts.length; j++) result.push(...inferCoincident(next, base + j, result))
  return { cons: result, dropped }
}
