// UX4 #2/#4：草圖單角倒圓角 / 倒斜角之後嘅約束重映射（純函數，node 可單測）。
//
// filletAt / chamferAtIdx 把角點 vi 換成兩個切點（verts.splice(vi, 1, p1, p2)），並喺 vi 插入一段新邊（圓弧 / 斜邊）。
// 以前 commit 冇郁 skCons —— 約束仲用舊 index，即刻錯位：矩形嘅「豎直」黐咗去新圓弧段、「水平」黐咗去斜嘅弦，
// 一求解（或者之後任何拖動 / Ctrl+Z 前後嘅 resolve）草圖就變形（邊變斜）。呢度：
//   • 頂點 k（k>vi → k+1）、邊 e（e===vi → vi+1；e>vi → e+1）、弧心 center 跟段走；
//   • 被倒走嘅角點 vi 已唔存在 → 引用佢嘅約束移除（Fusion 會留「虛擬尖角」；我哋誠實移除並報數）；
//   • 兩條鄰邊嘅「長度」尺寸量度嘅係舊尖角長度 → 保留會逼條邊伸返長 → 移除並報數（之後可重新標）；
//   • 倒圓角：補 2 個相切約束（鄰邊 ⟂ 圓弧兩端，Fusion 同款）—— 重合由同一條路徑共享頂點天然成立。
// rect 輸入：舊 ref 用 freesolve 嘅 rectCorners 次序（a, [b.x,a.y], b, [a.x,b.y]），而角路徑（shapeCornerPath）係
// min/max 正規化次序 → 先按座標配對頂點 / 邊，再做 index 位移。
import type { SkCon, SkRef } from './freesolve'
type Pt = [number, number]
type Shape = { type: string; a?: Pt; b?: Pt; pts?: Pt[]; verts?: Pt[] }

export type CornerRemap = { cons: SkCon[]; dropped: number; tangents: SkCon[] }

function oldVertsOf(sh: Shape): Pt[] {
  if (sh.type === 'rect' && sh.a && sh.b) return [sh.a, [sh.b[0], sh.a[1]], sh.b, [sh.a[0], sh.b[1]]]
  return (sh.verts ?? sh.pts ?? []) as Pt[]
}

export function remapCornerConstraints(
  oldShape: Shape, cornerVerts: Pt[], vi: number, shapeIdx: number, cons: readonly SkCon[],
  opts: { fillet: boolean; mkId: () => string },
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
  let dropped = 0
  for (const c of cons) {
    if (c.kind === 'dim' && c.type === 'len' && c.a.kind === 'edge' && c.a.shape === shapeIdx && adjacentOld.has(c.a.idx)) { dropped++; continue }
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
  return { cons: [...out, ...tangents], dropped, tangents }
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
