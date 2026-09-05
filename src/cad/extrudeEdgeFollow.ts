import type { Feature } from '../worker/cad.worker'

// A narrow, deterministic reference update for the first straight XY extrusion.
// Its top boundary translates with height; no topology-order or nearest-edge guess
// is needed. Other operations continue through the kernel's existing resolver.
export function followExtrudeTopEdges(before: Feature[], after: Feature[], id: string): Feature[] {
  const i = before.findIndex(f => f.id === id)
  const a = before[i], b = after[i]
  if (!a || a.type !== 'extrude' || !b || b.type !== 'extrude') return after
  if (before.slice(0, i).some(f => f.type !== 'sketch' && f.type !== 'datum')) return after
  if ((a.plane && a.plane !== 'XY') || a.symmetric || a.down || a.draft || a.twist || a.through || a.inward || a.toFace || a.extent || a.operation !== 'new') return after
  const { height: ah, ...ap } = a, { height: bh, ...bp } = b
  // Undefined/zero optional values are semantically equivalent in edit dialogs.
  const clean = (p: object) => JSON.stringify(Object.fromEntries(Object.entries(p).filter(([,v]) => v !== undefined && v !== 0 && v !== false).sort(([a],[b]) => a.localeCompare(b))))
  if (clean(ap) !== clean(bp) || !(ah > 0 && bh > 0) || ah === bh) return after
  const top = (a.baseZ ?? 0) + ah, delta = bh - ah
  let safe = true
  return after.map((f, n) => {
    if (n <= i) return f
    if (f.type === 'sketch' || f.type === 'datum') return f
    if (f.type !== 'fillet' && f.type !== 'chamfer') { safe = false; return f }
    if (!safe) return f
    let changed = false
    const move = (p: [number, number, number]): [number, number, number] => {
      if (Math.abs(p[2] - top) > 0.5) return p
      changed = true
      return [p[0], p[1], p[2] + delta]
    }
    const near = f.near ? move(f.near) : undefined
    const nears = f.nears?.map(move)
    if (!changed) return f
    return { ...f, ...(near ? { near } : {}), ...(nears ? { nears } : {}), edgeFp: undefined, edgeFpV2: undefined }
  })
}
