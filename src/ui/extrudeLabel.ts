/**
 * Timeline chip/title param summary for extrude — Formal Traditional (zh-HK).
 * Through-all cut must show「貫通」, not only a baked distance.
 */

export type ExtrudeLabelFeat = {
  height?: number
  through?: boolean
  operation?: string
  twist?: number
  plane?: string
  symmetric?: boolean
  extent?: string
}

function fmtChipNum(n: number): string {
  if (!Number.isFinite(n)) return String(n)
  if (Number.isInteger(n)) return String(n)
  const t = +n.toFixed(2)
  return Number.isInteger(t) ? String(t) : String(t)
}

const OP_LABEL: Record<string, string> = {
  new: '加料',
  newbody: '新實體',
  cut: '切割',
  intersect: '相交',
  join: '加料',
}

const PLANE_LABEL: Record<string, string> = {
  XY: '上 XY',
  XZ: '前 XZ',
  YZ: '右 YZ',
}

/** True when extrude extent is through-all (chip + quick-edit must show 貫通, not height). */
export function isExtrudeThroughAll(f: Pick<ExtrudeLabelFeat, 'through' | 'extent'>): boolean {
  return !!f.through || f.extent === 'through'
}

/** Param fragment for timeline chip tooltip (after 【拉伸】/【切割】). */
export function extrudeTimelineParamSummary(f: ExtrudeLabelFeat): string | null {
  const parts: string[] = []
  const throughAll = isExtrudeThroughAll(f)
  if (throughAll) {
    parts.push('貫通')
  } else if (typeof f.height === 'number' && Number.isFinite(f.height)) {
    parts.push(`高度 ${fmtChipNum(f.height)}mm`)
  }
  if (f.symmetric && !throughAll) parts.push('對稱')
  if (typeof f.twist === 'number' && Number.isFinite(f.twist) && Math.abs(f.twist) > 1e-9) {
    parts.push(`扭轉 ${fmtChipNum(f.twist)}°`)
  }
  if (f.operation && OP_LABEL[f.operation]) {
    parts.push(`操作 ${OP_LABEL[f.operation]}`)
  }
  if (f.plane && f.plane !== 'XY' && PLANE_LABEL[f.plane]) {
    parts.push(`草圖面 ${PLANE_LABEL[f.plane]}`)
  }
  return parts.length ? parts.join(' · ') : null
}
