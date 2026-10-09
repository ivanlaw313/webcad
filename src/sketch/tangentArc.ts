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

// SKETCH12 #4：相切弧（或 A 鍵弧段）由【另一個形狀】嘅端點引出 → 同嗰條直線／弧加相切約束（之前只得重合，
// 拖動後會折角）。只對幾何上已 G1（<0.5°）嘅接口加；已有相同相切唔重複。純函數（id 由呼叫者注入）。
type AnyShape = { type: string; pts?: Pt[]; verts?: Pt[]; bulges?: number[]; open?: boolean; arc?: { a: Pt; b: Pt; m: Pt }; construction?: boolean; smooth?: boolean; ell?: unknown; earc?: unknown }
type Ref = { kind: 'edge'; shape: number; idx: number } | { kind: 'circle'; shape: number }
const unit = (x: number, y: number): Pt | null => { const L = Math.hypot(x, y); return L > 1e-12 ? [x / L, y / L] : null }
function circ3(a: Pt, b: Pt, c: Pt): Pt | null {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]))
  if (Math.abs(d) < 1e-12) return null
  const a2 = a[0] ** 2 + a[1] ** 2, b2 = b[0] ** 2 + b[1] ** 2, c2 = c[0] ** 2 + c[1] ** 2
  return [(a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d, (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d]
}
/** Every curve end of shape i that touches point p, with the travel direction ARRIVING at p (continuing out of the curve). */
function endsAt(sh: AnyShape, i: number, p: Pt, tol: number): { ref: Ref; dir: Pt }[] {
  const out: { ref: Ref; dir: Pt }[] = []
  const at = (q: Pt) => Math.hypot(q[0] - p[0], q[1] - p[1]) <= tol
  if (sh.type !== 'poly' || sh.smooth || sh.ell || sh.earc) return out
  if (sh.arc) {
    const { a, b, m } = sh.arc, c = circ3(a, m, b)
    if (!c) return out
    const tan = (q: Pt, toward: Pt, sign: 1 | -1) => { let t = unit(-(q[1] - c[1]), q[0] - c[0]); if (!t) return null; if ((t[0] * (toward[0] - q[0]) + t[1] * (toward[1] - q[1])) * sign < 0) t = [-t[0], -t[1]]; return t }
    if (at(b)) { const t = tan(b, m, -1); if (t) out.push({ ref: { kind: 'circle', shape: i }, dir: t }) }          // arriving at b: away from m
    if (at(a)) { const t = tan(a, m, -1); if (t) out.push({ ref: { kind: 'circle', shape: i }, dir: t }) }          // arriving at a (reverse travel): away from m
    return out
  }
  const V = sh.verts ?? sh.pts ?? [], B = sh.bulges ?? [], n = V.length
  if (n < 2) return out
  const segN = sh.open ? n - 1 : n
  for (let j = 0; j < segN; j++) {
    const a = V[j], b = V[(j + 1) % n], bu = B[j] ?? 0
    const dirAt = (atEnd: boolean): Pt | null => {
      if (Math.abs(bu) < 1e-12) return unit(b[0] - a[0], b[1] - a[1])
      const c = bulgeCenter(a, b, bu), q = atEnd ? b : a, d = bu > 0 ? -1 : 1
      return unit(-(q[1] - c[1]) * d, (q[0] - c[0]) * d)
    }
    if (at(b)) { const t = dirAt(true); if (t) out.push({ ref: { kind: 'edge', shape: i, idx: j }, dir: t }) }
    if (at(a)) { const t = dirAt(false); if (t) out.push({ ref: { kind: 'edge', shape: i, idx: j }, dir: [-t[0], -t[1]] }) }
  }
  return out
}
export function crossShapeTangentCons(shapes: readonly AnyShape[], newIdx: number, existing: readonly SkCon[], mkId: () => string, tol = 1e-6): SkCon[] {
  const sh = shapes[newIdx]
  if (!sh || sh.type !== 'poly' || !sh.verts || !sh.bulges || sh.verts.length < 2) return []
  const V = sh.verts, B = sh.bulges, n = V.length
  const out: SkCon[] = []
  const same = (x: Ref, y: { kind: string; shape?: number; idx?: number } | undefined) => !!y && x.kind === y.kind && x.shape === y.shape && (x.kind !== 'edge' || x.idx === y.idx)
  const has = (x: Ref, y: Ref) => existing.some((c) => c.kind === 'con' && c.type === 'tangent' && ((same(x, c.a) && same(y, c.b)) || (same(y, c.a) && same(x, c.b))))
  const segStartDir = (j: number, atEnd: boolean): Pt | null => {
    const a = V[j], b = V[(j + 1) % n], bu = B[j] ?? 0
    if (Math.abs(bu) < 1e-12) return unit(b[0] - a[0], b[1] - a[1])
    const c = bulgeCenter(a, b, bu), q = atEnd ? b : a, d = bu > 0 ? -1 : 1
    return unit(-(q[1] - c[1]) * d, (q[0] - c[0]) * d)
  }
  const tryEnd = (vi: number, seg: number, leaving: Pt | null) => {
    if (!leaving || Math.abs(B[seg] ?? 0) < 1e-12) return   // only arc segments of the new path
    const mine: Ref = { kind: 'edge', shape: newIdx, idx: seg }
    shapes.forEach((o, i) => {
      if (i === newIdx || o.construction) return
      for (const e of endsAt(o, i, V[vi], tol)) {
        if (e.dir[0] * leaving[0] + e.dir[1] * leaving[1] < Math.cos((0.5 * Math.PI) / 180)) continue
        if (has(e.ref, mine) || out.some((c) => c.kind === 'con' && same(e.ref, c.a) && same(mine, c.b))) continue
        out.push({ id: mkId(), kind: 'con', type: 'tangent', a: e.ref, b: mine } as SkCon)
      }
    })
  }
  tryEnd(0, 0, segStartDir(0, false))
  if (sh.open && n >= 2) { const t = segStartDir(n - 2, true); tryEnd(n - 1, n - 2, t ? [-t[0], -t[1]] : null) }
  return out
}
