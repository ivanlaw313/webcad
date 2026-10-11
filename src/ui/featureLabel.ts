/**
 * FISHING27 P3: Timeline chip / Browser / feature Formal TC (zh-HK) kind labels.
 * CREATE cylinder is stored as sketch-less circle extrude; cone as prim shape=cone —
 * both must not show generic「拉伸」/「原語」.
 * Detection matches CORE16 openFeatDlgForEdit (cylinder / cone reopen heuristics).
 */

export type FeatureLabelFeat = {
  type: string
  profile?: { kind?: string } | null
  sketchId?: string | null
  arbPlane?: unknown
  plane?: unknown
  twist?: number
  draft?: number
  symmetric?: boolean
  through?: boolean
  down?: boolean
  distanceExpression?: unknown
  extent?: unknown
  toFace?: unknown
  inward?: unknown
  shape?: string
  sides?: number
}

/** Sketch-less circle extrude = CREATE「圓柱」primitive (not generic Extrude). */
export function isCylinderPrimitive(f: FeatureLabelFeat): boolean {
  return (
    f.type === 'extrude' &&
    f.profile?.kind === 'circle' &&
    !f.sketchId &&
    !f.arbPlane &&
    !f.plane &&
    !f.twist &&
    !f.draft &&
    !f.symmetric &&
    !f.through &&
    !f.down &&
    !f.distanceExpression &&
    !f.extent &&
    !f.toFace &&
    !f.inward
  )
}

/** CREATE「圓錐」primitive (sides≥3 = prism/pyramid, still generic 原語). */
export function isConePrimitive(f: FeatureLabelFeat): boolean {
  return f.type === 'prim' && f.shape === 'cone' && !f.sides
}

/**
 * Formal TC kind label for Timeline chip title / Browser / featureDisplayName.
 * Returns override for cylinder/cone; otherwise `fallback` (META/FEAT/FEATURE_TYPE_LABEL).
 */
export function featureKindLabel(f: FeatureLabelFeat, fallback: string): string {
  if (isCylinderPrimitive(f)) return '圓柱'
  if (isConePrimitive(f)) return '圓錐'
  return fallback
}
