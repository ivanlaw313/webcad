/**
 * Timeline chip/title param summary for sweep — Formal Traditional (zh-HK).
 * Sketch-profile sweeps must NOT show misleading「半徑」(r is still stored from Ø/2).
 * Show path / profile / twist Formal TC instead.
 */

export type SweepLabelFeat = {
  r?: number
  profile?: { kind?: string } | null
  path?: unknown[] | null
  path3?: unknown[] | null
  twist?: number
  scale?: number
  wall?: number
  guide?: unknown[] | null
}

function fmtChipNum(n: number): string {
  if (!Number.isFinite(n)) return String(n)
  if (Number.isInteger(n)) return String(n)
  const t = +n.toFixed(2)
  return Number.isInteger(t) ? String(t) : String(t)
}

function pathPointCount(f: SweepLabelFeat): number | null {
  if (Array.isArray(f.path3) && f.path3.length >= 2) return f.path3.length
  if (Array.isArray(f.path) && f.path.length >= 2) return f.path.length
  return null
}

function profileKindLabel(kind: string | undefined): string {
  if (kind === 'circle') return '圓'
  if (kind === 'rect') return '矩形'
  if (kind === 'ellipse') return '橢圓'
  if (kind === 'poly') return '折線'
  return ''
}

/** Param fragment for timeline chip tooltip (after 【掃掠】). */
export function sweepTimelineParamSummary(f: SweepLabelFeat): string | null {
  const hasProfile = !!f.profile
  if (hasProfile) {
    const parts: string[] = []
    const n = pathPointCount(f)
    if (n != null) parts.push(`路徑 ${n}點`)
    const kind = profileKindLabel(f.profile?.kind)
    parts.push(kind ? `草圖截面（${kind}）` : '草圖截面')
    if (typeof f.twist === 'number' && Number.isFinite(f.twist) && Math.abs(f.twist) > 1e-9) {
      parts.push(`扭轉 ${fmtChipNum(f.twist)}°`)
    }
    if (typeof f.scale === 'number' && Number.isFinite(f.scale) && Math.abs(f.scale - 1) > 1e-9) {
      parts.push(`縮放 ${fmtChipNum(f.scale)}×`)
    }
    if (Array.isArray(f.guide) && f.guide.length >= 2) parts.push('導軌')
    return parts.length ? parts.join(' · ') : '草圖截面'
  }
  // Circle-pipe mode: radius is meaningful (not misleading).
  const r = f.r
  if (!(typeof r === 'number' && Number.isFinite(r) && r > 0)) return null
  const dia = fmtChipNum(r * 2)
  if (typeof f.wall === 'number' && Number.isFinite(f.wall) && f.wall > 0) {
    return `管徑 Ø${dia} · 壁厚 ${fmtChipNum(f.wall)}mm`
  }
  return `管徑 Ø${dia}`
}
