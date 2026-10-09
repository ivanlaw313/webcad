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
  // UX4（Fusion）：剪裁一条直边后，剩低嘅直段仍然喺同一条线上 → 水平/豎直/平行/垂直/共線等「線」約束照跟住剩段；
  // 長度/相等/中點/對稱呢類量度原整段嘅約束，只有該段完全未被剪先保留（否則誠實移除）。
  const straightPieces = (r: SkRef, full: boolean): SkRef[] => {
    if (r.kind !== 'edge') return []
    const src = shapes[removed]
    if (src.type === 'poly' && (src.arc || src.smooth || src.ell || src.earc || Math.abs(src.bulges?.[r.idx] ?? 0) > 1e-10)) return []
    const [A, B] = refPts(shapes, r); if (!A || !B) return []
    const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy); if (L < 1e-9) return []
    const onSeg = (p: number[]) => Math.abs((p[0] - A[0]) * dy - (p[1] - A[1]) * dx) / L < 1e-6 && ((p[0] - A[0]) * dx + (p[1] - A[1]) * dy) / L > -1e-6 && ((p[0] - A[0]) * dx + (p[1] - A[1]) * dy) / L < L + 1e-6
    const out: SkRef[] = []
    parts.forEach((part, j) => { if (part.type !== 'poly') return
      const vs = part.verts ?? part.pts, n = vs.length, segN = part.open ? n - 1 : n
      for (let k = 0; k < segN; k++) {
        if (Math.abs(part.bulges?.[k] ?? 0) > 1e-10) continue
        const P = vs[k], Q = vs[(k + 1) % n]
        if (!onSeg(P) || !onSeg(Q) || Math.hypot(P[0] - Q[0], P[1] - Q[1]) < 1e-9) continue
        if (full && !((near(P, A) && near(Q, B)) || (near(P, B) && near(Q, A)))) continue
        out.push({ kind: 'edge', shape: base + j, idx: k })
      }
    }); return out
  }
  let needFull = false
  const remap = (r?: SkRef, circular = false): SkRef | undefined | null => {
    if (!r || !('shape' in r)) return r
    if (r.shape !== removed) return { ...r, shape: r.shape - (r.shape > removed ? 1 : 0) }
    const source = shapes[removed]
    const isCenter = r.kind === 'center' || (r.kind === 'pt' && ((source.type === 'circle' && r.idx === 0) || (source.type === 'poly' && !!source.arc && r.idx === 2)))
    if (isCenter) { const arc = matchingArcs(r)[0]; return arc && arc.kind === 'edge' ? { kind: 'center', shape: arc.shape, idx: arc.idx } : null }
    if (circular) return matchingArcs(r)[0] ?? null
    if (r.kind === 'edge') return straightPieces(r, needFull)[0] ?? null
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
    needFull = (c.kind === 'dim' && c.type === 'len') || (c.kind === 'con' && ['equal', 'midpoint', 'symmetric'].includes(c.type))
    const a = remap(c.a, circular), b = remap(c.b, circular), axis = remap('c' in c ? c.c : undefined)
    if (a === null || b === null || axis === null) { dropped++; continue }
    result.push({ ...c, a: a!, ...(b ? { b } : {}), ...(axis ? { c: axis } : {}) } as SkCon)
    // 一條水平/豎直邊中間被剪開成兩段 → 兩段都保持水平/豎直
    if (c.kind === 'con' && (c.type === 'h' || c.type === 'v') && !c.b && c.a.kind === 'edge' && c.a.shape === removed)
      for (const extra of straightPieces(c.a, false).slice(1)) result.push({ id: skConId(), kind: 'con', type: c.type, a: extra })
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
  // UX4（Fusion）：剪口端點落喺直線刀具上 → 加「點在線上」重合，剪完唔會無故多出自由度
  const onLine = (p: number[], a: number[], b: number[]) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy); if (L < 1e-9) return false; const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (L * L); return t > 1e-9 && t < 1 - 1e-9 && Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / L < 1e-6 }
  const oldVerts = (() => { const src = shapes[removed]; if (src.type === 'rect') return [0, 1, 2, 3].map(idx => refPts(shapes, { kind: 'pt', shape: removed, idx })[0]); return src.type === 'poly' ? (src.verts ?? src.pts) : [] })()
  parts.forEach((part, j) => { if (part.type !== 'poly' || !part.open) return
    const vs = part.verts ?? part.pts
    for (const idx of [0, vs.length - 1]) {
      const p = vs[idx]; if (!p || oldVerts.some(v => v && near(v, p))) continue
      search: for (let si = 0; si < next.length; si++) { if (si === base + j) continue
        const sh = next[si]; if (sh.construction && !(sh as { centerline?: boolean }).centerline) continue
        const sv = sh.type === 'rect' ? [0, 1, 2, 3].map(k => refPts(next, { kind: 'pt', shape: si, idx: k })[0]) : sh.type === 'poly' && !sh.arc && !sh.smooth && !sh.ell && !sh.earc ? (sh.verts ?? sh.pts) : []
        const segN = sh.type === 'rect' ? 4 : sh.type === 'poly' && sh.open ? sv.length - 1 : sv.length
        for (let k = 0; k < segN; k++) {
          if (sh.type === 'poly' && Math.abs(sh.bulges?.[k] ?? 0) > 1e-10) continue
          if (onLine(p, sv[k], sv[(k + 1) % sv.length])) { result.push({ id: skConId(), kind: 'con', type: 'coincident', a: { kind: 'pt', shape: base + j, idx }, b: { kind: 'edge', shape: si, idx: k } }); break search }
        }
      }
    }
  })
  return { cons: result, dropped }
}
