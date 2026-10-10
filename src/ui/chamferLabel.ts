/**
 * Timeline chip/title param summary for chamfer — Formal Traditional (zh-HK).
 * Dual-distance must show both legs (match commit status 「倒角 C2×5」), not only distance1.
 */

export type ChamferLabelFeat = {
  distance?: number
  dist2?: number
  cmode?: 'equal' | 'two' | 'angle' | string
  angle?: number
}

function fmtChipNum(n: number): string {
  if (!Number.isFinite(n)) return String(n)
  if (Number.isInteger(n)) return String(n)
  const t = +n.toFixed(2)
  return Number.isInteger(t) ? String(t) : String(t)
}

/** Param fragment for timeline chip tooltip (after 【倒角】). */
export function chamferTimelineParamSummary(f: ChamferLabelFeat): string | null {
  const d = f.distance
  if (!(typeof d === 'number' && Number.isFinite(d))) return null
  const cm = f.cmode ?? 'equal'
  if (cm === 'two' && typeof f.dist2 === 'number' && Number.isFinite(f.dist2) && f.dist2 > 0) {
    return `倒角 C${fmtChipNum(d)}×${fmtChipNum(f.dist2)}`
  }
  if (cm === 'angle' && typeof f.angle === 'number' && Number.isFinite(f.angle)) {
    return `倒角 C${fmtChipNum(d)}∠${fmtChipNum(f.angle)}°`
  }
  return `距離 ${fmtChipNum(d)}mm`
}
