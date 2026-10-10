// FISHING13：草圖指標互動小工具（純函數，node 可單測）。
// FISHING13 P2-2：繪圖工具「按住拖」(press-drag-release) 第二點判定（純函數，node 可單測）。
// 以前只睇位移 > 6px（觸屏 12px）—— 快速連點時手仲喺度移動，按下到放手好容易超過 6px，第一下就當咗拖
// → 即刻建立細小矩形／圓，用戶感覺頭兩下點擊被食咗。Fusion 只會喺真係按住拖嘅時候先當拖。
// 規則：位移超過閾值【而且】按住 ≥ DRAG_DRAW_MIN_MS；或者位移大到唔可能係手震（≥ DRAG_DRAW_FAR_PX）。
export const DRAG_DRAW_MIN_MS = 150
export const DRAG_DRAW_FAR_PX = 48
export function isDragDrawRelease(distPx: number, heldMs: number, touch: boolean): boolean {
  const thr = touch ? 12 : 6
  if (!(distPx > thr)) return false
  if (distPx >= (touch ? DRAG_DRAW_FAR_PX * 1.5 : DRAG_DRAW_FAR_PX)) return true
  return heldMs >= DRAG_DRAW_MIN_MS
}

// FISHING13 P3：邊上嘅約束徽章（＝ 相等、∥、━ …）以前正正坐喺邊中點（pxOff [18·n, 0]）→ 遮住中點，點唔到中點吸附／選取。
// 改為斜向偏離中點（右上 14px 起，同組逐個 18px 橫排）：徽章（約 17px 闊）唔再蓋住中點，但仍然貼近條邊、可點選刪除。
export const EDGE_BADGE_OFFSET: [number, number] = [14, -16]
export function edgeBadgeOffset(groupIndex: number): [number, number] {
  return [EDGE_BADGE_OFFSET[0] + 18 * groupIndex, EDGE_BADGE_OFFSET[1]]
}
