// UX4 #2/#4：草圖單角倒圓角 / 倒斜角之後嘅約束重映射（純函數，node 可單測）。
//
// filletAt / chamferAtIdx 把角點 vi 換成兩個切點（verts.splice(vi, 1, p1, p2)），並喺 vi 插入一段新邊（圓弧 / 斜邊）。
// 以前 commit 冇郁 skCons —— 約束仲用舊 index，即刻錯位：矩形嘅「豎直」黐咗去新圓弧段、「水平」黐咗去斜嘅弦，
// 一求解（或者之後任何拖動 / Ctrl+Z 前後嘅 resolve）草圖就變形（邊變斜）。呢度：
//   • 頂點 k（k>vi → k+1）、邊 e（e===vi → vi+1；e>vi → e+1）、弧心 center 跟段走；
//   • 被倒走嘅角點 vi 已唔存在 → 等效「虛擬尖角」改掛（UX4-B #2，Fusion 同款保留尺寸）：
//       - 水平/豎直位置尺寸（hdist/vdist）→ 改量度同一 x / y 嘅鄰邊遠端點（豎直鄰邊 x 不變、水平鄰邊 y 不變）；
//       - 點到線距離（p2l）→ 改量度同該線平行嘅鄰邊遠端點；
//       - 重合（角點 ≡ 另一點）→ 改成「該點喺兩條鄰邊（延長線）上」×2 = 虛擬尖角仍重合；
//       - 其餘（真係量度尖角本身、冇等效）先移除並報數；
//   • 兩條鄰邊嘅「長度」尺寸量度嘅係舊尖角長度 → 改成「遠端點 → 另一鄰邊（延長線）」嘅點線距離
//     （= 虛擬尖角長度；直角時數值 / 名 / ƒx 公式原樣保留）—— 自由度唔變，條邊唔會被逼伸返長；
//   • 倒圓角：補 2 個相切約束（鄰邊 ⟂ 圓弧兩端，Fusion 同款）—— 重合由同一條路徑共享頂點天然成立。
// rect 輸入：舊 ref 用 freesolve 嘅 rectCorners 次序（a, [b.x,a.y], b, [a.x,b.y]），而角路徑（shapeCornerPath）係
// min/max 正規化次序 → 先按座標配對頂點 / 邊，再做 index 位移。
import type { SkCon, SkRef } from './freesolve'
type Pt = [number, number]
type Shape = { type: string; a?: Pt; b?: Pt; pts?: Pt[]; verts?: Pt[] }

export type CornerRemap = { cons: SkCon[]; dropped: number; kept: number; tangents: SkCon[] }

function oldVertsOf(sh: Shape): Pt[] {
  if (sh.type === 'rect' && sh.a && sh.b) return [sh.a, [sh.b[0], sh.a[1]], sh.b, [sh.a[0], sh.b[1]]]
  return (sh.verts ?? sh.pts ?? []) as Pt[]
}

export function remapCornerConstraints(
  oldShape: Shape, cornerVerts: Pt[], vi: number, shapeIdx: number, cons: readonly SkCon[],
  opts: { fillet: boolean; mkId: () => string; lineDir?: (r: SkRef) => Pt | null },
): CornerRemap {
  const n = cornerVerts.length
  const old = oldVertsOf(oldShape)
  const same = (p: Pt, q: Pt) => Math.abs(p[0] - q[0]) < 1e-9 && Math.abs(p[1] - q[1]) < 1e-9
  // old vertex index → corner-path index
  const vmap = old.map((p) => cornerVerts.findIndex((q) => same(p, q)))
  const oldEdgeToCp = (k: number): number => {
    const m = old.length
    const a = vmap[k], b = vmap[(k + 1) % m]
    if (a < 0 || b < 0) return -1
    if ((a + 1) % n === b) return a
    if ((b + 1) % n === a) return b
    return -1
  }
  const prevI = (vi - 1 + n) % n
  const newPt = (cp: number): number | null => (cp < 0 || cp === vi ? null : cp > vi ? cp + 1 : cp)
  const newEdge = (cp: number): number | null => (cp < 0 ? null : cp === vi ? vi + 1 : cp > vi ? cp + 1 : cp)
  const mapRef = (r: SkRef | undefined): SkRef | undefined | 'drop' => {
    if (!r || !('shape' in r) || r.shape !== shapeIdx) return r
    if (r.kind === 'pt') { const k = newPt(vmap[r.idx] ?? -1); return k == null ? 'drop' : { ...r, idx: k } }
    if (r.kind === 'edge' || r.kind === 'center') {
      const cp = oldShape.type === 'rect' ? oldEdgeToCp(r.idx) : r.idx
      const e = newEdge(cp); return e == null ? 'drop' : { ...r, idx: e }
    }
    return r
  }
  const adjacentOld = new Set<number>()   // old edge indices touching the corner (in old-ref space)
  for (let k = 0; k < old.length; k++) { const cp = oldShape.type === 'rect' ? oldEdgeToCp(k) : k; if (cp === prevI || cp === vi) adjacentOld.add(k) }
  const out: SkCon[] = []
  let dropped = 0, kept = 0
  // corner-path geometry around the corner（新 index 空間）
  const nxtI = (vi + 1) % n
  const V = cornerVerts[vi], VP = cornerVerts[prevI], VN = cornerVerts[nxtI]
  const dP: Pt = [V[0] - VP[0], V[1] - VP[1]], dN: Pt = [VN[0] - V[0], VN[1] - V[1]]
  const lenP = Math.hypot(dP[0], dP[1]), lenN = Math.hypot(dN[0], dN[1])
  const ePrev = newEdge(prevI)!, eNext = vi + 1          // 兩條鄰邊（倒角後被截短）嘅新 index
  const farP = newPt(prevI)!, farN = newPt(nxtI)!          // 兩條鄰邊遠端點嘅新 index
  const ptRef = (idx: number): SkRef => ({ kind: 'pt', shape: shapeIdx, idx } as SkRef)
  const edgeRef = (idx: number): SkRef => ({ kind: 'edge', shape: shapeIdx, idx } as SkRef)
  const unit = (d: Pt, L: number): Pt => [d[0] / (L || 1), d[1] / (L || 1)]
  const uP = unit(dP, lenP), uN = unit(dN, lenN)
  const parallel = (u: Pt, w: Pt) => Math.abs(u[0] * w[1] - u[1] * w[0]) < 1e-6
  /** 喺兩條鄰邊入面揀方向 ∥ dir 嘅一條，返佢嘅遠端點（沿嗰條邊量度值不變 → 等效虛擬尖角）。 */
  const farAlong = (dir: Pt): number | null => (parallel(uP, dir) ? farP : parallel(uN, dir) ? farN : null)
  const isCorner = (r: SkRef | undefined) => !!r && r.kind === 'pt' && 'shape' in r && r.shape === shapeIdx && (vmap[r.idx] ?? -1) === vi
  const dirOfLine = (r: SkRef | undefined): Pt | null => {
    if (!r || r.kind !== 'edge') return null
    if ('shape' in r && r.shape === shapeIdx) {
      const cp = oldShape.type === 'rect' ? oldEdgeToCp(r.idx) : r.idx
      if (cp < 0 || cp >= n) return null
      const A = cornerVerts[cp], B = cornerVerts[(cp + 1) % n], L = Math.hypot(B[0] - A[0], B[1] - A[1])
      return L > 1e-12 ? [(B[0] - A[0]) / L, (B[1] - A[1]) / L] : null
    }
    const d = opts.lineDir?.(r); if (!d) return null
    const L = Math.hypot(d[0], d[1]); return L > 1e-12 ? [d[0] / L, d[1] / L] : null
  }
  /** 引用咗被倒走角點嘅約束 → 等效改掛；返 null = 冇等效（移除）。 */
  const retargetCorner = (c: SkCon): SkCon[] | null => {
    const aC = isCorner(c.a), bC = isCorner(c.b)
    if (aC && bC) return null
    const other = aC ? c.b : c.a
    if (c.kind === 'dim' && (c.type === 'hdist' || c.type === 'vdist') && !(c.frameAngleDeg)) {
      const k = farAlong(c.type === 'hdist' ? [0, 1] : [1, 0]); if (k == null) return null
      const o = mapRef(other); if (o === 'drop' || !o) return null
      return [aC ? { ...c, a: ptRef(k), b: o } as SkCon : { ...c, a: o, b: ptRef(k) } as SkCon]
    }
    if (c.kind === 'dim' && c.type === 'p2l' && aC) {
      const d = dirOfLine(c.b); const k = d ? farAlong(d) : null; if (k == null) return null
      const o = mapRef(c.b); if (o === 'drop' || !o) return null
      return [{ ...c, a: ptRef(k), b: o } as SkCon]
    }
    if (c.kind === 'con' && c.type === 'coincident' && other && other.kind !== 'edge') {
      const o = mapRef(other); if (o === 'drop' || !o) return null
      return [
        { ...c, a: o, b: edgeRef(ePrev) } as SkCon,
        { id: opts.mkId(), kind: 'con', type: 'coincident', a: o, b: edgeRef(eNext) } as SkCon,
      ]
    }
    return null
  }
  for (const c of cons) {
    if (c.kind === 'dim' && c.type === 'len' && c.a.kind === 'edge' && c.a.shape === shapeIdx && adjacentOld.has(c.a.idx)) {
      // 鄰邊長度 → 虛擬尖角長度 = 遠端點到另一條鄰邊（延長線）嘅距離 = L·sinφ
      const cp = oldShape.type === 'rect' ? oldEdgeToCp(c.a.idx) : c.a.idx
      const isPrev = cp === prevI
      const sinPhi = Math.abs(uP[0] * uN[1] - uP[1] * uN[0])
      const perp = Math.abs(sinPhi - 1) < 1e-6
      if (sinPhi < 1e-6 || (!perp && (c.expr || c.param || c.paramId))) { dropped++; continue }
      const nc = { ...c, type: 'p2l', a: ptRef(isPrev ? farP : farN), b: edgeRef(isPrev ? eNext : ePrev) } as SkCon & { value: number }
      if (!perp) nc.value = Math.round(c.value * sinPhi * 1e6) / 1e6
      out.push(nc as SkCon); kept++; continue
    }
    if (isCorner(c.a) || isCorner(c.b)) {
      const rt = retargetCorner(c)
      if (rt) { out.push(...rt); kept++ } else dropped++
      continue
    }
    const a = mapRef(c.a), b = mapRef(c.b), cc = mapRef((c as { c?: SkRef }).c)
    if (a === 'drop' || b === 'drop' || cc === 'drop') { dropped++; continue }
    const nc = { ...c, a: a as SkRef } as SkCon & { b?: SkRef; c?: SkRef }
    if (c.b !== undefined) nc.b = b as SkRef
    if ((c as { c?: SkRef }).c !== undefined) nc.c = cc as SkRef
    out.push(nc as SkCon)
  }
  const tangents: SkCon[] = opts.fillet ? [
    { id: opts.mkId(), kind: 'con', type: 'tangent', a: { kind: 'edge', shape: shapeIdx, idx: newEdge(prevI)! }, b: { kind: 'edge', shape: shapeIdx, idx: vi } } as SkCon,
    { id: opts.mkId(), kind: 'con', type: 'tangent', a: { kind: 'edge', shape: shapeIdx, idx: vi }, b: { kind: 'edge', shape: shapeIdx, idx: vi + 1 } } as SkCon,
  ] : []
  return { cons: [...out, ...tangents], dropped, kept, tangents }
}

/** Largest fillet radius that fits corner vi of a straight-edged path (tangent points must stay inside both edges). */
export function maxFilletRadius(verts: Pt[], vi: number): number {
  const n = verts.length
  const vp = verts[(vi - 1 + n) % n], v = verts[vi], vn = verts[(vi + 1) % n]
  const l1 = Math.hypot(v[0] - vp[0], v[1] - vp[1]), l2 = Math.hypot(vn[0] - v[0], vn[1] - v[1])
  if (l1 < 1e-9 || l2 < 1e-9) return 0
  const u1 = [(v[0] - vp[0]) / l1, (v[1] - vp[1]) / l1], u2 = [(vn[0] - v[0]) / l2, (vn[1] - v[1]) / l2]
  const phi = Math.acos(Math.max(-1, Math.min(1, -(u1[0] * u2[0] + u1[1] * u2[1]))))
  return Math.min(l1, l2) * Math.tan(phi / 2)
}
