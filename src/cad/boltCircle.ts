// 螺栓孔圈（bolt circle / PCD）圓心計算 —— ★ 預覽同結果嘅唯一來源 ★
//
// BUG-515：孔對話框預覽只畫一個孔，確定之後鑽咗 64 個。根因唔單止係預覽忘記畫，
// 而係【兩邊各自計一次】：store 嘅 holeCommit 同 SketchLayer 嘅 HolePreview 各有
// 一份 clamp + 三角函數。只要有一邊改過，預覽就同結果唔同 —— 而用戶係信預覽落刀嘅。
// 所以兩邊都要行呢一個函數，令「飄」喺結構上唔可能發生。

export const BOLT_COUNT_MIN = 2
export const BOLT_COUNT_MAX = 64
export const BOLT_PCD_RADIUS_MIN = 0.5

/** 夾取孔數：非數／0／小數 → 落返合法範圍（預設 4）。 */
export function boltCircleCount(raw: number): number {
  return Math.max(BOLT_COUNT_MIN, Math.min(BOLT_COUNT_MAX, Math.round(raw) || 4))
}

/** 夾取節圓半徑：PCD/2，但唔准細到變成同心重疊。 */
export function boltCircleRadius(pcd: number): number {
  return Math.max(BOLT_PCD_RADIUS_MIN, pcd / 2)
}

/**
 * 均布圓心（CAD XY）。第 0 個固定喺 +X 方向，逆時針排 —— 次序唔准變，
 * 因為特徵樹存落去嘅 centers 要同重放時逐個對得上。
 */
export function boltCircleCenters(cx: number, cy: number, rawCount: number, pcd: number): [number, number][] {
  const n = boltCircleCount(rawCount)
  const r = boltCircleRadius(pcd)
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as [number, number]
  })
}
