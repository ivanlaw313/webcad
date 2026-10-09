import type { SkCon, SkRef } from './freesolve'

type Pt = [number, number]
export type Ell = { cx: number; cy: number; rx: number; ry: number; rot: number }

// SKETCH12 b2：橢圓尺寸輔助（純函數）。ellipse-axis idx 0 = 中心→rx 端（rot 方向），idx 1 = 中心→ry 端。
export const ellipseMajorIdx = (e: Ell): 0 | 1 => (e.rx >= e.ry ? 0 : 1)
export const ellipseSemi = (e: Ell, idx: 0 | 1) => (idx === 0 ? e.rx : e.ry)

// 尺寸工具點選橢圓曲線：取與點擊方向較接近的半軸（局部座標 |x|/rx 對比 |y|/ry）。
export function ellipseAxisPick(e: Ell, p: Pt): 0 | 1 {
  const a = (-e.rot * Math.PI) / 180, dx = p[0] - e.cx, dy = p[1] - e.cy
  const x = dx * Math.cos(a) - dy * Math.sin(a), y = dx * Math.sin(a) + dy * Math.cos(a)
  return Math.abs(x) / (e.rx || 1) >= Math.abs(y) / (e.ry || 1) ? 0 : 1
}

// 三點橢圓：第一個軸端點定義長軸；第二點若給出較長的半軸，則交換並旋轉 90°，保持 rx 為半長軸。
export function normalizeMajorFirst(e: Ell): { ell: Ell; swapped: boolean } {
  if (e.ry <= e.rx) return { ell: e, swapped: false }
  return { ell: { ...e, rx: e.ry, ry: e.rx, rot: e.rot + 90 }, swapped: true }
}

// 修改一個半軸：回傳新橢圓（中心與旋轉不變），或錯誤訊息（不接受 ≤0，半短軸不可超過半長軸）。
export function editEllipseSemi(e: Ell, idx: 0 | 1, value: number): { ell: Ell } | { error: string } {
  if (!Number.isFinite(value) || value <= 0) return { error: '橢圓半軸必須為大於 0 的有限數值' }
  const major = ellipseMajorIdx(e), other = ellipseSemi(e, idx === 0 ? 1 : 0)
  if (idx !== major && value > other + 1e-9) return { error: `半短軸不可大於半長軸（半長軸目前為 ${fmt(other)} mm）` }
  if (idx === major && value + 1e-9 < other) return { error: `半長軸不可小於半短軸（半短軸目前為 ${fmt(other)} mm）` }
  return { ell: idx === 0 ? { ...e, rx: value } : { ...e, ry: value } }
}

// 對應半軸的驅動尺寸（若已存在則更新數值）。
export function ellipseAxisDim(cons: readonly SkCon[], shape: number, idx: 0 | 1, value: number, mk: () => { id: string; name?: string }): SkCon[] {
  const hit = cons.find((c) => c.kind === 'dim' && c.type === 'len' && c.a.kind === 'ellipse-axis' && c.a.shape === shape && c.a.idx === idx)
  if (hit) return cons.map((c) => (c === hit ? ({ ...c, value, driven: false } as SkCon) : c))
  const a: SkRef = { kind: 'ellipse-axis', shape, idx }
  return [...cons, { ...mk(), kind: 'dim', type: 'len', a, value } as SkCon]
}

export const fmt = (v: number) => String(Math.round(v * 100) / 100)
