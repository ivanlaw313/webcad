// BUG(F)：相切弧纯几何（由 store 搬出，node 可单测）。bulge 约定同 sketchOps：bulge>0 = 绕圆心顺时针（右转）。
import { bulgeCenter } from './sketchOps'
import type { SkCon } from './freesolve'   // type-only（freesolve 运行时带 wasm；id 由调用方注入）
type Pt = [number, number]

// BUG(F)：相切弧 bulge —— phi = 起点切线 → 弦 嘅有向转角（>0 左转）。sketchOps 约定 bulge>0 = 顺时针（右转），
// 所以左转弧要负 bulge。旧版 +tan(φ/2) 令弧反向弯（起点切线同上段唔连续，视觉似「偏离端点」）。
export function tangentArcBulge(phi: number): number { return -Math.tan(phi / 2) }
// BUG(F)：verts-poly 内【相切弧段】同前一段（直线／弧）之间补 相切 约束（重合系同一 poly 共享顶点，天然成立）。
// 只对几何上已 G1 嘅接口加（<0.5°），避免将普通折角误锁；已存在嘅相切约束唔重复。纯函数。
export function polyTangentArcCons(sh: { type: string; verts?: Pt[]; bulges?: number[]; open?: boolean }, shapeIdx: number, existing: readonly SkCon[], mkId: () => string): SkCon[] {
  if (sh.type !== 'poly' || !sh.verts || !sh.bulges) return []
  const V = sh.verts, B = sh.bulges, n = V.length
  const segN = sh.open ? n - 1 : n
  if (segN < 2) return []
  const segDir = (i: number, atEnd: boolean): Pt | null => {
    const a = V[i], b = V[(i + 1) % n], bu = B[i] ?? 0
    if (Math.abs(bu) < 1e-12) { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); return L > 1e-9 ? [(b[0] - a[0]) / L, (b[1] - a[1]) / L] : null }
    const c = bulgeCenter(a, b, bu), p = atEnd ? b : a
    const vx = p[0] - c[0], vy = p[1] - c[1], L = Math.hypot(vx, vy) || 1, dir = bu > 0 ? -1 : 1
    return [(-vy / L) * dir, (vx / L) * dir]
  }
  const has = (i: number, j: number) => existing.some((c) => c.kind === 'con' && c.type === 'tangent' && [c.a, c.b].every((r) => r?.kind === 'edge' && r.shape === shapeIdx) && new Set([(c.a as { idx: number }).idx, (c.b as { idx: number }).idx]).size === 2 && [i, j].includes((c.a as { idx: number }).idx) && [i, j].includes((c.b as { idx: number }).idx))
  const out: SkCon[] = []
  for (let i = 0; i < segN; i++) {
    if (Math.abs(B[i] ?? 0) < 1e-12) continue
    const prev = i > 0 ? i - 1 : (sh.open ? -1 : segN - 1)
    if (prev < 0 || prev === i) continue
    const t0 = segDir(prev, true), t1 = segDir(i, false)
    if (!t0 || !t1 || t0[0] * t1[0] + t0[1] * t1[1] < Math.cos((0.5 * Math.PI) / 180)) continue
    if (has(prev, i)) continue
    out.push({ id: mkId(), kind: 'con', type: 'tangent', a: { kind: 'edge', shape: shapeIdx, idx: prev }, b: { kind: 'edge', shape: shapeIdx, idx: i } } as SkCon)
  }
  return out
}
export function endTangent(pts: Pt[], bulges: number[]): Pt | null {   // GM-FP1 #13：SketchLayer 相切弧 live 预览复用（准确切线，支持弧接弧）
  if (pts.length < 2) return null
  const a = pts[pts.length - 2], b = pts[pts.length - 1]
  const bu = bulges[pts.length - 2] ?? 0
  if (Math.abs(bu) < 1e-12) { const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / L, (b[1] - a[1]) / L] }
  const c = bulgeCenter(a, b, bu)
  const vx = b[0] - c[0], vy = b[1] - c[1]
  const L = Math.hypot(vx, vy) || 1
  // BUG(F)：同 sketchOps 约定一致 — bulge>0 = 绕圆心【顺时针】（tessellateSeg / fillet：左转弧 bulge<0）。
  // 旧版写反（当 bulge>0 逆时针）→ 弧接弧／端点续弧切线方向反转。
  const dir = bu > 0 ? -1 : 1
  return [(-vy / L) * dir, (vx / L) * dir]
}
