/** FISHING14 P3：選中草圖尺寸時狀態列用嘅標籤 —— 以前直接印內部類型（「尺寸 d1（rad）」，似弧度單位）。
 *  而家：半徑「R 21 mm」、直徑「Ø 10 mm」、角度「角度 30°」、其餘「長度 40 mm」等，正式繁體。 */

type DimLike = { type: string; value: number; radDiaFlip?: boolean }
const KIND: Record<string, string> = { len: '長度', dist: '距離', hdist: '水平距離', vdist: '豎直距離', p2l: '點至線距離', arclen: '弧長' }
const num = (v: number) => String(Math.round(v * 1000) / 1000)

export function sketchDimLabel(c: DimLike, unit: 'mm' | 'inch' = 'mm'): string {
  const len = (mm: number) => unit === 'inch' ? `${num(mm / 25.4)} in` : `${num(mm)} mm`
  if (c.type === 'rad' || c.type === 'dia') {
    // 同 freesolve.radDiaDisplay（R↔Ø 翻轉只影響顯示）；呢度唔 import solver，保持純函數可單測
    const r = c.type === 'rad'
    const asR = r !== !!c.radDiaFlip
    const v = r ? (asR ? c.value : c.value * 2) : (asR ? c.value / 2 : c.value)
    return `${asR ? 'R' : 'Ø'} ${len(v)}`
  }
  if (c.type === 'angle') return `角度 ${num(c.value)}°`
  return `${KIND[c.type] ?? '尺寸'} ${len(c.value)}`
}
