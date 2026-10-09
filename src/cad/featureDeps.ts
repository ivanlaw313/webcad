/**
 * Timeline dependency graph (T1 delete warning / T2 reorder validity).
 *
 * A feature B depends on an earlier feature A when
 *   · B references A's id anywhere in its own data (sketchFaceBinding.sourceId, toFace/target ids,
 *     feature-pattern targets, …) — scanned generically so new feature kinds are covered; or
 *   · A is a standalone sketch node (type 'sketch') and B consumes the same sketch
 *     (sketchId / loft sketchIds).
 * Body-level dependencies (a shell/fillet that only works on A's solid) are not visible statically;
 * the store discovers those from the rebuild failure list and asks the user (see requestRemoveFeature).
 */
type F = { id: string; type: string; sketchId?: string; sketchIds?: string[] } & Record<string, unknown>

function collectStrings(v: unknown, out: Set<string>, depth = 0): void {
  if (depth > 6 || v == null) return
  if (typeof v === 'string') { out.add(v); return }
  if (Array.isArray(v)) { for (const x of v) collectStrings(x, out, depth + 1); return }
  if (typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (k !== 'id' && k !== 'name') collectStrings(x, out, depth + 1)
}

const sketchesOf = (f: F): string[] => [...(f.sketchId ? [f.sketchId] : []), ...(Array.isArray(f.sketchIds) ? f.sketchIds : [])]

/** Ids of other features that `f` needs to exist (anywhere in the list). */
export function featureRefs(f: F, all: readonly F[]): Set<string> {
  const strings = new Set<string>()
  collectStrings(f, strings)
  const refs = new Set<string>()
  for (const g of all) {
    if (g.id === f.id) continue
    if (strings.has(g.id)) refs.add(g.id)
    else if (g.type === 'sketch' && f.type !== 'sketch' && g.sketchId && sketchesOf(f).includes(g.sketchId)) refs.add(g.id)
  }
  return refs
}

/** Features (in timeline order) that depend on `id`, directly or transitively. */
export function featureDependents(features: readonly F[], id: string): F[] {
  const doomed = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    for (const f of features) {
      if (doomed.has(f.id)) continue
      for (const r of featureRefs(f, features)) if (doomed.has(r)) { doomed.add(f.id); grew = true; break }
    }
  }
  return features.filter((f) => f.id !== id && doomed.has(f.id))
}

/** Move `id` to index `to` (array index in the result). null when out of range / no-op. */
export function reorderedFeatures<T extends F>(features: readonly T[], id: string, to: number): T[] | null {
  const from = features.findIndex((f) => f.id === id)
  if (from < 0 || to < 0 || to >= features.length || to === from) return null
  const next = features.slice()
  const [m] = next.splice(from, 1)
  next.splice(to, 0, m)
  return next
}

/** First ordering violation (a feature placed before something it references), or null if valid. */
export function orderViolation(features: readonly F[]): { feature: F; needs: F } | null {
  const pos = new Map(features.map((f, i) => [f.id, i]))
  for (let i = 0; i < features.length; i++) {
    for (const r of featureRefs(features[i], features)) {
      const j = pos.get(r)
      if (j != null && j > i) return { feature: features[i], needs: features[j] }
    }
  }
  return null
}
