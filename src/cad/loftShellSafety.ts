/**
 * OCCT can spend an unbounded amount of time trying to shell a shape made by
 * a non-prismatic loft. The worker cannot interrupt a synchronous WASM call,
 * so identify that known-dangerous feature adjacency before entering OCCT.
 */
type LoftSection = { profile?: unknown }

type LoftLike = {
  type?: unknown
  bottom?: unknown
  top?: unknown
  sections?: LoftSection[]
  rails?: unknown[]
  continuity?: unknown
  closed?: unknown
  wall?: unknown
}

const sameProfile = (a: unknown, b: unknown): boolean => {
  try { return JSON.stringify(a) === JSON.stringify(b) }
  catch { return false }
}

/** True only for a direct Shell-after-Loft combination known to stall OCCT. */
export function hasUnsafeLoftShellAdjacency(previous: unknown): boolean {
  const loft = previous as LoftLike | undefined
  if (!loft || loft.type !== 'loft') return false

  if (Array.isArray(loft.rails) && loft.rails.length > 0) return true
  if (loft.continuity || loft.closed || Number(loft.wall) > 0) return true

  const profiles = Array.isArray(loft.sections) && loft.sections.length
    ? loft.sections.map((section) => section?.profile)
    : [loft.bottom, loft.top].filter((profile) => profile !== undefined)

  if (profiles.length > 2) return true
  return profiles.length === 2 && !sameProfile(profiles[0], profiles[1])
}
