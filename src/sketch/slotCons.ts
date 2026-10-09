import type { SkCon, SkRef } from './freesolve'

type Pt = [number, number]

// SKETCH12 b2：直槽（4 頂點：V1,V2 = 遠端弧兩端，V3,V4 = 近端弧兩端；邊 0/2 = 端弧，邊 1/3 = 直邊）提交時的約束：
// 4 × 相切（直邊↔端弧）+ 兩端弧相等 → 只餘位置 2 + 方向 1 + 長度 1 + 寬度 1；再加驅動尺寸「長度」（弧心距 = 直邊長）
// 與「寬度」（兩直邊距離），之後可直接點擊尺寸修改。軸向水平／豎直時另加水平／豎直約束（DOF 2）。
export function slotConstraints(shape: number, verts: Pt[], mk: () => { id: string; name?: string }, opts: { aligned?: boolean } = {}): SkCon[] {
  const E = (idx: number): SkRef => ({ kind: 'edge', shape, idx })
  const out: SkCon[] = []
  for (const [l, a] of [[1, 0], [1, 2], [3, 2], [3, 0]]) out.push({ ...mk(), kind: 'con', type: 'tangent', a: E(l), b: E(a) } as SkCon)
  out.push({ ...mk(), kind: 'con', type: 'equal', a: E(0), b: E(2) } as SkCon)
  const [, V2, V3, V4] = verts
  const L = Math.hypot(V3[0] - V2[0], V3[1] - V2[1])
  const dx = V3[0] - V2[0], dy = V3[1] - V2[1]
  const W = Math.abs(dx * (V4[1] - V2[1]) - dy * (V4[0] - V2[0])) / (L || 1)
  if (opts.aligned !== false) {
    if (Math.abs(dy) < 1e-6 * Math.max(1, L)) out.push({ ...mk(), kind: 'con', type: 'h', a: E(1) } as SkCon)
    else if (Math.abs(dx) < 1e-6 * Math.max(1, L)) out.push({ ...mk(), kind: 'con', type: 'v', a: E(1) } as SkCon)
  }
  out.push({ ...mk(), kind: 'dim', type: 'len', a: E(1), value: round(L) } as SkCon)
  out.push({ ...mk(), kind: 'dim', type: 'p2l', a: { kind: 'pt', shape, idx: 3 }, b: E(1), value: round(W) } as SkCon)
  return out
}
const round = (v: number) => Math.round(v * 1e6) / 1e6

export type SlotMode = 'cc' | 'overall' | 'centerpt'
// 依模式由兩次點選求兩個弧心（預覽與提交共用，確保預覽＝結果）：
//   cc = 兩點即兩弧心；overall = 兩點為兩端最外緣（總長）；centerpt = 第一點為槽中心、第二點為一個弧心（對稱）。
export function slotCenters(mode: SlotMode, p0: Pt, p1: Pt, r: number): { c0: Pt; c1: Pt } | { error: string } {
  if (mode === 'centerpt') return { c0: [2 * p0[0] - p1[0], 2 * p0[1] - p1[1]], c1: p1 }
  if (mode === 'overall') {
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], T = Math.hypot(dx, dy)
    if (T <= 2 * r + 1e-6) return { error: `槽（總長）：總長 ${fmt2(T)} mm 必須大於槽寬 ${fmt2(2 * r)} mm，請拉長或減少槽寬` }
    const ux = dx / T, uy = dy / T
    return { c0: [p0[0] + ux * r, p0[1] + uy * r], c1: [p1[0] - ux * r, p1[1] - uy * r] }
  }
  return { c0: p0, c1: p1 }
}
// 模式說明（工具列提示與即時讀數共用，正式書面語）。
export function slotModeReadout(mode: SlotMode, p0: Pt, p1: Pt, w: number): string {
  const d = Math.hypot(p1[0] - p0[0], p1[1] - p0[1])
  if (mode === 'overall') return `⬭ 總長模式：總長 ${fmt2(d)} mm（心心距 ${fmt2(Math.max(0, d - w))}）· 寬 ${fmt2(w)} mm`
  if (mode === 'centerpt') return `⬭ 中心點模式：中心至弧心 ${fmt2(d)} mm（心心距 ${fmt2(2 * d)}）· 寬 ${fmt2(w)} mm`
  return `⬭ 心心模式：心心距 ${fmt2(d)} mm（總長 ${fmt2(d + w)}）· 寬 ${fmt2(w)} mm`
}
export const fmt2 = (v: number) => String(Math.round(v * 100) / 100)
