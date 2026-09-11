/**
 * SIM result invalidation (BUG-BD-010 / BUG-BD-011 / handoff P1).
 *
 * Constraint or geometry changes must not leave a prior colormap looking like a
 * live result. Callers clear overlays and set feaStale + an explicit 失效 status.
 */

/** Options that change the physics / BCs of a solved FEA case (not display-only). */
export const FEA_PHYSICS_OPT_KEYS = [
  'feaFixMode',
  'feaForceN',
  'feaLoadMode',
  'feaPressure',
  'feaDir',
  'feaCustomDir',
  'feaRes',
  'feaMat',
] as const

export type FeaPhysicsOptKey = (typeof FEA_PHYSICS_OPT_KEYS)[number]

export type SimResultBag = {
  feaResult: unknown | null
  feaConvResult?: unknown | null
  modalResult?: unknown | null
  bucklingResult?: unknown | null
  topoptResult?: unknown | null
  thermalResult?: unknown | null
  moldResult?: unknown | null
  windResult?: unknown | null
}

export function hasLiveSimResults(s: SimResultBag): boolean {
  return !!(
    s.feaResult
    || s.feaConvResult
    || s.modalResult
    || s.bucklingResult
    || s.topoptResult
    || s.thermalResult
    || s.moldResult
    || s.windResult
  )
}

export function feaPhysicsOptChanged(
  prev: Partial<Record<FeaPhysicsOptKey, unknown>>,
  patch: Partial<Record<FeaPhysicsOptKey, unknown>>,
): boolean {
  for (const key of FEA_PHYSICS_OPT_KEYS) {
    if (key in patch && patch[key] !== prev[key]) return true
  }
  return false
}

/** Patch that drops overlays and marks results 失效 (status is caller-overridable). */
export function invalidateSimResultsPatch(reason: string): {
  feaResult: null
  feaProbe: null
  feaConvResult: null
  modalResult: null
  bucklingResult: null
  topoptResult: null
  thermalResult: null
  moldResult: null
  moldReport: string
  windResult: null
  windReport: string
  feaDeform: { show: false; anim: false; scale: 1; real: true; mag: 1 }
  feaStale: true
  status: string
} {
  return {
    feaResult: null,
    feaProbe: null,
    feaConvResult: null,
    modalResult: null,
    bucklingResult: null,
    topoptResult: null,
    thermalResult: null,
    moldResult: null,
    moldReport: '',
    windResult: null,
    windReport: '',
    feaDeform: { show: false, anim: false, scale: 1, real: true, mag: 1 },
    feaStale: true,
    status: `⚠ 仿真结果已失效（${reason}）— 请重新运行`,
  }
}

/** Visible copy for FEA panel + viewport strip (QA looks for 失效). */
export function feaStaleBannerText(): string {
  return '⚠ 结果已失效 — 约束或几何已改，请重新运行（旧彩图已清除）'
}
