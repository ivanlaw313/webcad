// BUG（Coil-3）：螺旋（建立 ▾ → 螺旋）唔可以靜默取代活動實體。
// 有實體時缺省 = ⬡新實體（獨立實體，原實體唔郁）；用戶可明確揀 ＋合併 / －切割 / ∩相交。
export type CoilOp = 'new' | 'newbody' | 'cut' | 'intersect'

export function resolveCoilOp(raw: unknown, hasSolid: boolean, cutMode = false): CoilOp {
  if (!hasSolid) return 'new'                     // 冇實體 → 螺旋自己做首個實體
  const r = String(raw ?? '')
  if (r === 'new' || r === 'newbody' || r === 'cut' || r === 'intersect') return r
  return cutMode ? 'cut' : 'newbody'
}

/** 合併結果體積明顯細過原實體或螺旋本身 → 布爾失敗（OCCT 返回垃圾，例如只剩螺旋）。 */
export function fuseLostMaterial(vBase: number, vTool: number, vResult: number, tol = 0.02): boolean {
  if (!(vBase > 0)) return false
  return vResult < Math.max(vBase, vTool) * (1 - tol)
}
