/**
 * Unified illegal-input / reject status strings (QA A / BUG-UI-001).
 * All length / hole Ø / shell thickness / sketch dim rejects share the
 * recognizable marker 「尺寸已拒絕」 (Traditional Chinese) so UI tests
 * and users can spot them.
 */
export const ILLEGAL_REJECT_MARKER = '尺寸已拒絕'

export const ILLEGAL_THICKNESS_DETAIL = '壁厚必須大於 0'
export const ILLEGAL_LENGTH_DETAIL = '尺寸必須大於 0，未更改模型'
export const ILLEGAL_HOLE_DETAIL = '孔徑Ø必須大於 0'

/** Build a status line that always contains ILLEGAL_REJECT_MARKER. */
export function illegalRejectStatus(detail: string): string {
  const d = (detail || '').trim()
  if (!d) return `${ILLEGAL_REJECT_MARKER}：非法輸入`
  if (d.includes(ILLEGAL_REJECT_MARKER)) return d
  return `${ILLEGAL_REJECT_MARKER}：${d}`
}

export function isIllegalRejectStatus(status: string | null | undefined): boolean {
  return typeof status === 'string' && status.includes(ILLEGAL_REJECT_MARKER)
}

export function isNonPositiveDim(n: unknown): boolean {
  return !(Number(n) > 0)
}
