import type { SketchPrimitive, Constraint } from '@salusoft89/planegcs'
import { solveSketch } from './solver'
import { pathPts, bulgeMid, tessellateSeg, bulgeCenter, bulgeRadius, bulgeTheta, catmullRomClosed, catmullRomOpen } from './sketchOps'
import { sampleBSpline } from '../cad/bspline2d'   // S127：B 样条解后重铺（逼近型）
import { projectFeatureEdges } from '../geom/projectSilhouette'   // S189：实体特征边投影（Project Body）
import type { Pt } from './sketchOps'

// ── Constraints & dimensions for the MAIN (freehand) sketcher ──
// Bridges committed sketch shapes (rect / circle / poly) to planegcs: decompose shapes into
// solver primitives, map user constraints/dims, solve, write the solution back into the shapes.
// All coordinates are sketch-plane 2D [s, t] — plane-agnostic (XY/XZ/YZ/offset all work).
// Smooth splines are excluded (their pts are tessellated from ctrl points — constraining them
// would be overwritten); the UI reports this honestly instead of silently failing.

export type FPt = [number, number]
export type FShape =
  | { type: 'rect'; a: FPt; b: FPt; construction?: boolean }
  | { type: 'circle'; c: FPt; r: number; construction?: boolean; point?: boolean }  // point = 草图点（r=0，只有圆心，冇 rim）
  | { type: 'poly'; pts: FPt[]; ctrl?: FPt[]; smooth?: boolean; bspline?: boolean; conic?: boolean; arc?: { a: FPt; b: FPt; m: FPt }; verts?: FPt[]; bulges?: number[]; construction?: boolean; open?: boolean }  // open（T760 Trim）：开放路径 — n 顶点 n−1 段，冇闭合段; bspline（S127）= 逼近型立方 B 样条（vs Catmull-Rom 插值）; conic（S177）= 有理二次圆锥曲线（smooth 但无 ctrl → solvable 排除，唔入求解器）
// poly.arc = "augmented poly": pts stay tessellated for every existing consumer (render/area/DXF/…),
// while the kernel draws a TRUE circular arc (threePointsArcTo) and the solver gets a planegcs arc
// primitive. Refs for an arc-poly: pt 0 = start a, pt 1 = end b, pt 2 = centre; edge 0 = chord; circle = rim.
// poly.verts+bulges = mixed line/arc path (T724): solver refs index the TRUE corner verts (pt j / edge j =
// segment verts[j]→verts[j+1]); arc segments enter the solver as their chord line (v1 — endpoints draggable
// and constrainable, the bulge follows the endpoints); pts re-tessellated via pathPts after every solve.

// Circumcircle through 3 points (null when collinear).
export function circum3(p0: FPt, p1: FPt, p2: FPt): { c: FPt; r: number } | null {
  const ax = p0[0], ay = p0[1], bx = p1[0], by = p1[1], cx = p2[0], cy = p2[1]
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
  if (Math.abs(d) < 1e-9) return null
  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d
  return { c: [ux, uy], r: Math.hypot(ax - ux, ay - uy) }
}

const isArcPoly = (sh: FShape): sh is FShape & { type: 'poly'; arc: { a: FPt; b: FPt; m: FPt } } =>
  sh.type === 'poly' && !!sh.arc

// Mixed line/arc path (verts+bulges) — mutually exclusive with arc (standalone 3-pt arc) and smooth (spline).
const isVertsPoly = (sh: FShape): sh is FShape & { type: 'poly'; verts: FPt[]; bulges: number[] } =>
  sh.type === 'poly' && !!sh.verts && !!sh.bulges && !sh.arc && !sh.smooth

// S103[8] 样条（Fit-Point Spline）：ctrl 控制点系一等 solver 自由点（可 coincident/fix/h/v/距离），
// pts 系 Catmull-Rom 密铺仅供显示/布尔。只有【有 ctrl】嘅 smooth poly 先算可解样条（退化 smooth 仍跳过）。
const isSplinePoly = (sh: FShape): sh is FShape & { type: 'poly'; smooth: true; ctrl: FPt[] } =>
  sh.type === 'poly' && !!sh.smooth && !!sh.ctrl && sh.ctrl.length >= 3

// Resample an arc (start a → end b through m) into display points (matches the draw tool's bow).
export function arcResample(a: FPt, b: FPt, m: FPt, seg = 24): FPt[] {
  const cc = circum3(a, m, b)
  if (!cc) return [a, m, b]
  const [cx, cy] = cc.c
  const a0 = Math.atan2(a[1] - cy, a[0] - cx)
  const a1 = Math.atan2(b[1] - cy, b[0] - cx)
  const am = Math.atan2(m[1] - cy, m[0] - cx)
  // sweep direction so the arc passes through m
  const ccw = ((a1 - a0 + Math.PI * 2) % (Math.PI * 2)) >= ((am - a0 + Math.PI * 2) % (Math.PI * 2))
  let span = a1 - a0
  if (ccw) { if (span <= 0) span += Math.PI * 2 } else { if (span >= 0) span -= Math.PI * 2 }
  const out: FPt[] = []
  for (let i = 0; i <= seg; i++) { const t = a0 + (span * i) / seg; out.push([cx + cc.r * Math.cos(t), cy + cc.r * Math.sin(t)]) }
  return out
}

// Reference into the combined committed-shape array ([...profiles, shape]).
// pt: poly vertex idx / rect corner 0-3 / circle CENTER (idx 0). edge: poly segment idx / rect edge 0-3.
// origin: the sketch origin (0,0) — a fixed solver point ('o0'), selectable for positioning dims.
// refpt/refedge: PROJECTED reference geometry (the body's face boundary / section on the sketch plane,
// Fusion-style) — fixed in the solver, selectable for dims & constraints.
export type SkRef =
  | { kind: 'pt'; shape: number; idx: number }
  | { kind: 'edge'; shape: number; idx: number }
  | { kind: 'circle'; shape: number }
  | { kind: 'origin' }
  | { kind: 'refpt'; idx: number }
  | { kind: 'refedge'; idx: number }

// ── Projected reference geometry registry ──
// One sketch is active at a time, so a module registry keeps every helper signature unchanged.
export type RefGeo = { pts: FPt[]; segs: [FPt, FPt][] }
let _refGeo: RefGeo | null = null
export function setRefGeo(g: RefGeo | null) { _refGeo = g }
export function getRefGeo(): RefGeo | null { return _refGeo }

// Compute the body's footprint on a cardinal sketch plane, in sketch [s,t] coords:
//   pass 1 — coplanar-triangle BOUNDARY edges (sketching ON a face → its exact outline);
//   pass 2 — mesh cross-section segments (offset/datum plane through the body).
// mesh vertices are CAD Z-up. Sketch-coord mapping mirrors SK[plane].toST ∘ (CAD→three).
export function computeRefGeo(
  mesh: { vertices: ArrayLike<number>; triangles: ArrayLike<number> } | null,
  plane: 'XY' | 'XZ' | 'YZ',
  baseZ: number,
): RefGeo | null {
  if (!mesh || !mesh.vertices.length) return null
  const V = mesh.vertices, T = mesh.triangles
  // CAD → (s, t, n): n = distance coord along the plane normal
  const map = (x: number, y: number, z: number): [number, number, number] =>
    plane === 'XY' ? [x, -y, z] : plane === 'XZ' ? [x, z, y] : [-y, z, x]
  const TOL = 0.08
  const key = (p: FPt) => `${Math.round(p[0] * 50)},${Math.round(p[1] * 50)}`
  const segs: [FPt, FPt][] = []
  // pass 1: boundary of coplanar triangles
  const edgeCount = new Map<string, [FPt, FPt]>()
  const seen = new Map<string, number>()
  for (let i = 0; i < T.length; i += 3) {
    const ps: [number, number, number][] = []
    let coplanar = true
    for (let k = 0; k < 3; k++) {
      const vi = (T[i + k] as number) * 3
      const m = map(V[vi] as number, V[vi + 1] as number, V[vi + 2] as number)
      if (Math.abs(m[2] - baseZ) > TOL) { coplanar = false; break }
      ps.push(m)
    }
    if (!coplanar) continue
    for (let k = 0; k < 3; k++) {
      const a: FPt = [ps[k][0], ps[k][1]], b: FPt = [ps[(k + 1) % 3][0], ps[(k + 1) % 3][1]]
      const ek = key(a) < key(b) ? key(a) + '|' + key(b) : key(b) + '|' + key(a)
      seen.set(ek, (seen.get(ek) ?? 0) + 1)
      if (!edgeCount.has(ek)) edgeCount.set(ek, [a, b])
    }
  }
  for (const [ek, n] of seen) if (n === 1) { const s = edgeCount.get(ek)!; if (Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]) > 0.2) segs.push(s) }
  // pass 2: cross-section (when the plane cuts through the body rather than lying on a face)
  if (!segs.length) {
    for (let i = 0; i < T.length && segs.length < 400; i += 3) {
      const m: [number, number, number][] = []
      for (let k = 0; k < 3; k++) {
        const vi = (T[i + k] as number) * 3
        m.push(map(V[vi] as number, V[vi + 1] as number, V[vi + 2] as number))
      }
      const d = m.map((q) => q[2] - baseZ)
      const cross: FPt[] = []
      for (let k = 0; k < 3; k++) {
        const a = m[k], b = m[(k + 1) % 3], da = d[k], db = d[(k + 1) % 3]
        if ((da > 0 && db <= 0) || (da <= 0 && db > 0)) {
          const t = da / (da - db)
          cross.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
        }
      }
      if (cross.length === 2 && Math.hypot(cross[1][0] - cross[0][0], cross[1][1] - cross[0][1]) > 0.2) segs.push([cross[0], cross[1]])
    }
  }
  // S189 pass 3: body sits OFF the plane (not coplanar, plane doesn't cut through) → project its
  // FEATURE edges (sharp dihedral) + open-boundary edges onto the plane ALONG the normal —— Fusion
  // 「投影实体 / Project Body」。纯几何抽出 projectFeatureEdges（Node-tested）；computeRefGeo 只接线。
  if (!segs.length) { for (const s of projectFeatureEdges(mesh, plane)) segs.push(s) }
  if (!segs.length) return null
  // unique endpoints → reference points
  const ptsMap = new Map<string, FPt>()
  for (const [a, b] of segs) { ptsMap.set(key(a), a); ptsMap.set(key(b), b) }
  // 圆/弧 loop → 圆心 也做捕捉点（画同心圆、定位喺孔心 —— Fusion 同款）。
  // 圆心【放最前】：孔多嘅件边缘点会逼近 400 预算，圆心摆后会畀 slice 切走 → 优先保。
  const centers = arcCentersFromSegs(segs)
  return { segs: segs.slice(0, 400), pts: [...centers, ...ptsMap.values()].slice(0, 400) }
}

/**
 * Intersect a triangulated body with an arbitrary sketch plane.  The returned
 * coordinates use the same local frame as SketchLayer.arbFrame(): xDir is the
 * sketch horizontal axis, yDir = normal x xDir, and normal is the signed
 * distance axis.  This deliberately returns only real coplanar boundaries or
 * plane intersections: unlike cardinal Project Body, we do not invent a
 * silhouette for an arbitrary plane when the body does not meet it.
 */
export function computeArbitraryRefGeo(
  mesh: { vertices: ArrayLike<number>; triangles: ArrayLike<number> } | null,
  arb: { o: [number, number, number]; xd: [number, number, number]; n: [number, number, number] },
): RefGeo | null {
  if (!mesh || !mesh.vertices.length) return null
  const V = mesh.vertices, T = mesh.triangles
  const unit = (v: [number, number, number]): [number, number, number] => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1
    return [v[0] / l, v[1] / l, v[2] / l]
  }
  const n = unit(arb.n)
  // Re-orthogonalize xDir so a persisted, slightly rounded datum frame cannot
  // skew dimensions or create a false section.
  const xn = arb.xd[0] * n[0] + arb.xd[1] * n[1] + arb.xd[2] * n[2]
  const xd = unit([arb.xd[0] - xn * n[0], arb.xd[1] - xn * n[1], arb.xd[2] - xn * n[2]])
  const yd: [number, number, number] = [n[1] * xd[2] - n[2] * xd[1], n[2] * xd[0] - n[0] * xd[2], n[0] * xd[1] - n[1] * xd[0]]
  const map = (x: number, y: number, z: number): [number, number, number] => {
    const dx = x - arb.o[0], dy = y - arb.o[1], dz = z - arb.o[2]
    return [dx * xd[0] + dy * xd[1] + dz * xd[2], dx * yd[0] + dy * yd[1] + dz * yd[2], dx * n[0] + dy * n[1] + dz * n[2]]
  }
  const TOL = 0.08
  const key = (p: FPt) => `${Math.round(p[0] * 50)},${Math.round(p[1] * 50)}`
  const segs: [FPt, FPt][] = []
  const edgeCount = new Map<string, [FPt, FPt]>()
  const seen = new Map<string, number>()
  for (let i = 0; i < T.length; i += 3) {
    const ps: [number, number, number][] = []
    let coplanar = true
    for (let k = 0; k < 3; k++) {
      const vi = (T[i + k] as number) * 3
      const m = map(V[vi] as number, V[vi + 1] as number, V[vi + 2] as number)
      if (Math.abs(m[2]) > TOL) { coplanar = false; break }
      ps.push(m)
    }
    if (!coplanar) continue
    for (let k = 0; k < 3; k++) {
      const a: FPt = [ps[k][0], ps[k][1]], b: FPt = [ps[(k + 1) % 3][0], ps[(k + 1) % 3][1]]
      const ek = key(a) < key(b) ? key(a) + '|' + key(b) : key(b) + '|' + key(a)
      seen.set(ek, (seen.get(ek) ?? 0) + 1)
      if (!edgeCount.has(ek)) edgeCount.set(ek, [a, b])
    }
  }
  for (const [ek, count] of seen) if (count === 1) {
    const s = edgeCount.get(ek)!
    if (Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]) > 0.2) segs.push(s)
  }
  if (!segs.length) {
    for (let i = 0; i < T.length && segs.length < 400; i += 3) {
      const m: [number, number, number][] = []
      for (let k = 0; k < 3; k++) {
        const vi = (T[i + k] as number) * 3
        m.push(map(V[vi] as number, V[vi + 1] as number, V[vi + 2] as number))
      }
      const cross: FPt[] = []
      for (let k = 0; k < 3; k++) {
        const a = m[k], b = m[(k + 1) % 3], da = a[2], db = b[2]
        if ((da > 0 && db <= 0) || (da <= 0 && db > 0)) {
          const t = da / (da - db)
          cross.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
        }
      }
      if (cross.length === 2 && Math.hypot(cross[1][0] - cross[0][0], cross[1][1] - cross[0][1]) > 0.2) segs.push([cross[0], cross[1]])
    }
  }
  if (!segs.length) return null
  const ptsMap = new Map<string, FPt>()
  for (const [a, b] of segs) { ptsMap.set(key(a), a); ptsMap.set(key(b), b) }
  return { segs: segs.slice(0, 400), pts: [...arcCentersFromSegs(segs), ...ptsMap.values()].slice(0, 400) }
}

// 由共面边界 segs 侦测【圆形 loop】(孔/圆柱面/圆角边界) → 返圆心。连通分量 → 质心 + 半径变异系数判圆。
// 矩形/直边 loop CV 大 → 跳过；圆 CV 细 → 圆心做捕捉点。纯几何，无依赖。
function arcCentersFromSegs(segs: [FPt, FPt][]): FPt[] {
  const K = (p: FPt) => `${Math.round(p[0] * 50)},${Math.round(p[1] * 50)}`
  const pt = new Map<string, FPt>()
  const adj = new Map<string, Set<string>>()
  for (const [a, b] of segs) {
    const ka = K(a), kb = K(b); if (ka === kb) continue
    pt.set(ka, a); pt.set(kb, b)
    if (!adj.has(ka)) adj.set(ka, new Set()); if (!adj.has(kb)) adj.set(kb, new Set())
    adj.get(ka)!.add(kb); adj.get(kb)!.add(ka)
  }
  const seen = new Set<string>(), centers: FPt[] = []
  for (const k0 of adj.keys()) {
    if (seen.has(k0)) continue
    const comp: string[] = [], stack = [k0]; seen.add(k0)
    while (stack.length) { const c = stack.pop()!; comp.push(c); for (const nb of adj.get(c)!) if (!seen.has(nb)) { seen.add(nb); stack.push(nb) } }
    if (comp.length < 4) continue                              // 至少 4 点（细孔横截面 facet 都得）
    const ps = comp.map((c) => pt.get(c)!)
    let cx = 0, cy = 0; for (const p of ps) { cx += p[0]; cy += p[1] } cx /= ps.length; cy /= ps.length
    const rs = ps.map((p) => Math.hypot(p[0] - cx, p[1] - cy))
    const rm = rs.reduce((a, b) => a + b, 0) / rs.length; if (rm < 0.3) continue
    let v = 0; for (const r of rs) v += (r - rm) * (r - rm)
    if (Math.sqrt(v / rs.length) / rm >= 0.15) continue        // 半径变异 ≥15% = 唔够圆（排除细长边）
    // 长宽比过滤：外框矩形/槽（长≠阔）唔当圆 —— bbox 接近正方先算圆心。
    let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity
    for (const p of ps) { if (p[0] < mnx) mnx = p[0]; if (p[0] > mxx) mxx = p[0]; if (p[1] < mny) mny = p[1]; if (p[1] > mxy) mxy = p[1] }
    const w = mxx - mnx, h = mxy - mny, asp = Math.max(w, h) / Math.max(1e-6, Math.min(w, h))
    if (asp < 1.6) centers.push([cx, cy])                      // bbox 近正方 = 圆/正多边形 → 圆心做捕捉点
  }
  return centers
}

export type SkConType = 'h' | 'v' | 'coincident' | 'parallel' | 'perp' | 'equal' | 'tangent' | 'fix' | 'midpoint' | 'concentric' | 'collinear' | 'symmetric'
export type SkCon =
  | { id: string; kind: 'con'; type: SkConType; a: SkRef; b?: SkRef; c?: SkRef }  // c: symmetric 嘅对称轴（第 3 选）
  | { id: string; kind: 'dim'; type: 'dist' | 'hdist' | 'vdist' | 'len' | 'dia' | 'rad' | 'angle' | 'p2l' | 'arclen'; a: SkRef; b?: SkRef; value: number; driven?: boolean; param?: string; paramId?: string; refs?: Record<string,string>; expr?: string; name?: string; radDiaFlip?: boolean }  // expr（S97）= ƒx 公式：优先 param，evalExpr 求值入 value（引用参数/常量/函数 d1*2+5）; rad = R; arclen = 弧长（净系真弧：verts-poly 弧段 / 三点弧 rim — 成个圆创建侧已挡）; hdist/vdist = 水平/竖直 point-point distance (Fusion 位置尺寸); driven = 从动尺寸（只量度唔驱动，括号显示）; param = ƒx 用户参数名（T746 批3：参数驱动尺寸 — 改参数 → 草图重解 → 全树重建）; name = 尺寸稳定名 d1/d2…（创建时派、全文档唯一、序列化生还 — 其他尺寸 expr 可引用；旧档无名 → editSketchOf lazy 补）; radDiaFlip = GM-FP2 #29：R↔Ø 显示翻转旗（只影响显示/输入，type 与 value 保持自然表示 — 旧档零影响、solver 唔变；显示值经 radDiaDisplay ×2/÷2）

// GM-FP2 #29：R↔Ø 显示（右键弧/圆尺寸切半径/直径）。stored value + type 保持自然表示（rad→R、dia→Ø），
// 唔改内核语义/旧档；净系显示时按 radDiaFlip 翻转（rad 翻显 Ø=value×2、dia 翻显 R=value÷2）。
// 输入编辑时用逆变换（radDiaStore）把用户打嘅【显示值】折返自然 value。纯函数、可单测。
export function radDiaDisplay(type: 'rad' | 'dia', value: number, flip?: boolean): { prefix: 'R' | 'Ø'; value: number } {
  if (type === 'rad') return flip ? { prefix: 'Ø', value: value * 2 } : { prefix: 'R', value }
  return flip ? { prefix: 'R', value: value / 2 } : { prefix: 'Ø', value }
}
// 逆变换：把用户打入嘅【显示值】(经 radDiaDisplay 翻转后所见) 折返成 stored 自然 value（type 对应）。
export function radDiaStore(type: 'rad' | 'dia', shownValue: number, flip?: boolean): number {
  if (!flip) return shownValue
  return type === 'rad' ? shownValue / 2 : shownValue * 2   // rad 翻显 Ø → stored R = Ø/2；dia 翻显 R → stored Ø = R×2
}

let _cid = 0
export const skConId = () => 'k' + ++_cid
// T746：还原保存嘅约束后要推进计数器，否则页面重载后新约束 id 同旧 id 撞（removeSkCon 会一次删两个、React key 冲突）
export const bumpCid = (cons: { id: string }[]) => { for (const c of cons) { const n = parseInt(String(c.id).replace(/^k/, ''), 10); if (Number.isFinite(n) && n > _cid) _cid = n } }

// rect {a,b} → 4 corners (c0=a, c1=(bx,ay), c2=b, c3=(ax,by)); edges 0=c0c1 1=c1c2 2=c2c3 3=c3c0.
const rectCorners = (s: { a: FPt; b: FPt }): FPt[] => [s.a, [s.b[0], s.a[1]], s.b, [s.a[0], s.b[1]]]

const pid = (i: number, j: number) => `p${i}_${j}`
const lid = (i: number, j: number) => `l${i}_${j}`
const cid = (i: number) => `c${i}`
// verts-poly arc SEGMENT prims (T725): centre point + arc, per segment j of shape i.
const paid = (i: number, j: number) => `pa${i}_${j}`
const said = (i: number, j: number) => `sa${i}_${j}`
// Is this ref an arc segment of a verts-poly? → its solver arc id (else null).
const arcSegOf = (shapes: FShape[], r?: SkRef): string | null => {
  if (r?.kind !== 'edge') return null
  const sh = shapes[r.shape]
  return isVertsPoly(sh) && Math.abs(sh.bulges[r.idx] || 0) > 1e-12 ? said(r.shape, r.idx) : null
}

// S103[8]：有 ctrl 嘅样条可解（ctrl 当自由点）；冇 ctrl 嘅退化 smooth poly 仍跳过（无可约束目标）。
const solvable = (sh: FShape | undefined): sh is FShape => !!sh && !(sh.type === 'poly' && sh.smooth && !sh.ctrl)

export function refValid(shapes: FShape[], r: SkRef): boolean {
  if (r.kind === 'origin') return true
  if (r.kind === 'refpt') return !!_refGeo && r.idx >= 0 && r.idx < _refGeo.pts.length
  if (r.kind === 'refedge') return !!_refGeo && r.idx >= 0 && r.idx < _refGeo.segs.length
  const sh = shapes[r.shape]
  if (!solvable(sh)) return false
  if (isSplinePoly(sh)) return r.kind === 'pt' && r.idx >= 0 && r.idx < sh.ctrl.length  // S103[8]：样条只准 ctrl 点 ref（拒 edge/circle → 杜绝沿 48 密铺点嘅幽灵弦边）
  if (r.kind === 'circle') return (sh.type === 'circle' && !sh.point) || isArcPoly(sh)  // 草图点冇 rim
  if (sh.type === 'circle') return r.kind === 'pt' && r.idx === 0
  if (isArcPoly(sh)) return r.kind === 'pt' ? r.idx >= 0 && r.idx < 3 : r.idx === 0  // pts: a/b/centre; edge: chord
  const n = sh.type === 'rect' ? 4 : (sh.verts ?? sh.pts).length  // verts-poly refs live in verts-space
  return r.idx >= 0 && r.idx < n
}

// Coordinates of a referenced point / the two endpoints of a referenced edge.
export function refPts(shapes: FShape[], r: SkRef): FPt[] {
  if (r.kind === 'origin') return [[0, 0]]
  if (r.kind === 'refpt') return _refGeo ? [_refGeo.pts[r.idx]] : []
  if (r.kind === 'refedge') return _refGeo ? [..._refGeo.segs[r.idx]] : []
  const sh = shapes[r.shape]
  if (!sh) return []
  if (sh.type === 'circle') return [sh.c]
  if (isArcPoly(sh)) {
    const cc = circum3(sh.arc.a, sh.arc.m, sh.arc.b)
    const pts: FPt[] = [sh.arc.a, sh.arc.b, cc ? cc.c : sh.arc.m]
    if (r.kind === 'pt') return [pts[r.idx]]
    if (r.kind === 'edge') return [sh.arc.a, sh.arc.b]  // chord
    return []
  }
  if (isSplinePoly(sh)) { return r.kind === 'pt' ? [sh.ctrl[r.idx]] : [] }  // S103[8]：样条 ref 住 ctrl 控制点
  const pts = sh.type === 'rect' ? rectCorners(sh) : (sh.verts ?? sh.pts)
  if (r.kind === 'pt') return [pts[r.idx]]
  if (r.kind === 'edge') return [pts[r.idx], pts[(r.idx + 1) % pts.length]]  // arc segment → its chord endpoints
  return []
}

// ── 重合推断 v2（commit 时自动捕捉 → 真约束，零误判政策）──
// 一个 shape 有几多个可寻址点（addressing 同 refValid / refPts 完全一致）：
// circle → 圆心 = pt idx 0；三点弧 poly → a / b / 圆心 = idx 0..2；rect → 4 角（rectCorners 顺序）；
// 普通/verts-poly → verts ?? pts 逐个 idx（verts-poly 嘅 ref 住喺 verts 空间）。
const addrPtCount = (sh: FShape): number =>
  sh.type === 'circle' ? 1 : isArcPoly(sh) ? 3 : isSplinePoly(sh) ? sh.ctrl.length : sh.type === 'rect' ? 4 : (sh.verts ?? sh.pts).length

// 两个 ref 系咪指住同一对象：kind 相同 + shape/idx 逐字段相等（origin 冇字段 → kind 相同即相等）
const refEq = (x: SkRef, y: SkRef): boolean =>
  x.kind === y.kind &&
  (x as { shape?: number }).shape === (y as { shape?: number }).shape &&
  (x as { idx?: number }).idx === (y as { idx?: number }).idx

// 推断 shapes[newIdx]（啱啱 commit 嘅新 shape）同已有几何嘅重合约束。
// 候选 = 草图原点 [0,0]（solver 固定点 'o0'）+ 每个其他可解 shape 嘅全部可寻址点（含圆心）。
// 每个新 shape 点至多 1 条 — 取距离 ≤ tol 嘅最近候选（tol=1e-4：只捕捉"本来就重合"，唔系磁吸）。
// 同 existing 撞（同一对 ref，唔分 a/b 顺序、唔分类型 — dist 尺寸都算，避免落咗即冲突）→ 跳过该点。
// 总数封顶 cap。smooth spline 两边都跳过（solvable）— 约束会被重新 tessellate 冲走，诚实唔落。
// 纯函数：唔改 shapes / existing，净系生成新 SkCon（id 由 skConId() 派）。
export function inferCoincident(shapes: FShape[], newIdx: number, existing: SkCon[], tol = 1e-4, cap = 8): SkCon[] {
  const out: SkCon[] = []
  const sh = shapes[newIdx]
  if (!solvable(sh) || isSplinePoly(sh)) return out  // S103[8]：样条暂唔自动推断重合（解后重铺会冲走，保守跳过）
  // 候选点（原点行先 — 距离相同时偏向原点，原点系固定点，约束最稳）
  const cands: { ref: SkRef; p: FPt }[] = [{ ref: { kind: 'origin' }, p: [0, 0] }]
  shapes.forEach((osh, i) => {
    if (i === newIdx || !solvable(osh) || isSplinePoly(osh)) return   // smooth spline 两边都跳过（同 line 242 新 shape 一致）：ctrl 样条虽 solvable，但重合约束会被重铺 tessellate 冲走 → 候选都唔收
    for (let j = 0; j < addrPtCount(osh); j++) {
      const ref: SkRef = { kind: 'pt', shape: i, idx: j }
      const [p] = refPts(shapes, ref)
      if (p) cands.push({ ref, p })
    }
  })
  const dup = (a: SkRef, b: SkRef): boolean =>
    existing.some((c) => !!c.b && ((refEq(c.a, a) && refEq(c.b, b)) || (refEq(c.a, b) && refEq(c.b, a))))
  const n = addrPtCount(sh)
  for (let j = 0; j < n && out.length < cap; j++) {
    const a: SkRef = { kind: 'pt', shape: newIdx, idx: j }
    const [p] = refPts(shapes, a)
    if (!p) continue
    let best: { ref: SkRef; d: number } | null = null
    for (const cd of cands) {
      const d = Math.hypot(cd.p[0] - p[0], cd.p[1] - p[1])
      if (d <= tol && (!best || d < best.d)) best = { ref: cd.ref, d }
    }
    if (!best || dup(a, best.ref)) continue  // 最近候选已有约束 → 成点跳过（唔退而求其次，免传递冗余）
    out.push({ id: skConId(), kind: 'con', type: 'coincident', a, b: best.ref })
  }
  return out.slice(0, cap)
}

// Label anchor for a constraint/dim (midpoint of what it references).
export function refMid(shapes: FShape[], r: SkRef): FPt {
  if (r.kind === 'origin') return [0, 0]
  if (r.kind === 'refpt' || r.kind === 'refedge') {
    const ps = refPts(shapes, r)
    if (ps.length === 2) return [(ps[0][0] + ps[1][0]) / 2, (ps[0][1] + ps[1][1]) / 2]
    return ps[0] ?? [0, 0]
  }
  const sh = shapes[r.shape]
  if (sh && sh.type === 'circle' && r.kind === 'circle') return [sh.c[0] + sh.r * 0.7071, sh.c[1] + sh.r * 0.7071]
  if (sh && isArcPoly(sh) && r.kind === 'circle') return sh.arc.m  // arc rim label sits at the on-arc point
  if (sh && isVertsPoly(sh) && r.kind === 'edge' && Math.abs(sh.bulges[r.idx] || 0) > 1e-12) {
    // arc segment's label anchors at the on-arc midpoint, not the chord midpoint
    return bulgeMid(sh.verts[r.idx], sh.verts[(r.idx + 1) % sh.verts.length], sh.bulges[r.idx])
  }
  const ps = refPts(shapes, r)
  if (ps.length === 2) return [(ps[0][0] + ps[1][0]) / 2, (ps[0][1] + ps[1][1]) / 2]
  return ps[0] ?? [0, 0]
}

// planegcs prim ids for a ref (point id / line id / circle id).
function refPtId(shapes: FShape[], r: SkRef): string | null {
  if (r.kind === 'origin') return 'o0'
  if (r.kind === 'refpt') return `rp${r.idx}`
  if (r.kind !== 'pt') return null
  return pid(r.shape, shapes[r.shape].type === 'circle' ? 0 : r.idx)
}
function refLineId(r: SkRef): string | null {
  if (r.kind === 'refedge') return `rl${r.idx}`
  return r.kind === 'edge' ? lid(r.shape, r.idx) : null
}

// Hit-test committed geometry, three priority tiers:
//   1. points (incl. circle centres) — but only inside a TIGHTER radius (0.6×tol), otherwise a vertex
//      several mm away steals clicks aimed at an edge (vertex-greedy picking, classic CAD pitfall);
//   2. circle rims;  3. edges — both at the full tol.
export function hitTest(shapes: FShape[], p: FPt, tol: number, exclude?: (r: SkRef) => boolean): SkRef | null {
  const d2 = (a: FPt, b: FPt) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2
  const t2 = tol * tol
  const ok = (r: SkRef) => !(exclude && exclude(r))   // 揾第 2 点时可跳过已选 ref（避免撳第 2 点反而 toggle 走第 1 点）
  // tier 1: points (incl. the sketch origin ⊕ and projected reference points)
  let best: SkRef | null = null
  let bestD = (tol * 0.6) ** 2
  const cand = (r: SkRef, d: number) => { if (d < bestD && ok(r)) { best = r; bestD = d } }
  const dO = p[0] * p[0] + p[1] * p[1]
  cand({ kind: 'origin' }, dO)
  if (_refGeo) _refGeo.pts.forEach((q, j) => cand({ kind: 'refpt', idx: j }, d2(q, p)))
  shapes.forEach((sh, i) => {
    if (!solvable(sh)) return
    if (sh.type === 'circle') { cand({ kind: 'pt', shape: i, idx: 0 }, d2(sh.c, p)); return }
    if (isArcPoly(sh)) {
      const cc = circum3(sh.arc.a, sh.arc.m, sh.arc.b)
      const aps: FPt[] = [sh.arc.a, sh.arc.b, ...(cc ? [cc.c] : [])]
      aps.forEach((q, j) => cand({ kind: 'pt', shape: i, idx: j }, d2(q, p)))
      return
    }
    if (isSplinePoly(sh)) { sh.ctrl.forEach((q, j) => cand({ kind: 'pt', shape: i, idx: j }, d2(q, p))); return }  // S103[8]：样条只命中 ctrl 控制点
    const pts = sh.type === 'rect' ? rectCorners(sh) : (sh.verts ?? sh.pts)  // verts-poly: only TRUE corners are pickable points
    pts.forEach((q, j) => cand({ kind: 'pt', shape: i, idx: j }, d2(q, p)))
  })
  // #52 GM-L2：记住 tier-1 最佳点（含永久原点 ⊕）同其距离²。原本「一命中即 return best」令近原点／顶点
  //   嘅边、圆周成日拣唔到（顶点贪食）。改为：点若非常贴近（≤0.35tol）先算定胜（细半径点优先区，Fusion 手感），
  //   否则落 tier-2/3 揾最近边／圆周，再同点比真实距离拣真正最近。
  const ptBest: SkRef | null = best
  const ptBestD = bestD
  if (ptBest && ptBestD <= (tol * 0.35) ** 2) return ptBest
  // tiers 2+3: circle rims and edges at full tolerance (incl. projected reference edges)
  best = null       // #52：重开 best 畀边／圆周填（tier-1 点结果已存喺 ptBest，唔好被 tier-2/3 覆盖）
  bestD = t2 * 1.3225   // GM-FP3 #49：曲线（边／圆周）命中容差略放宽 1.15×（1.15²=1.3225）— 操作员实战「圆周细，边细」易命中
  if (_refGeo) _refGeo.segs.forEach(([a, b], j) => {
    const ab2 = d2(a, b)
    if (ab2 < 1e-9) return
    let t = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / ab2
    t = Math.max(0, Math.min(1, t))
    const d = d2([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], p)
    if (d < bestD) { best = { kind: 'refedge', idx: j }; bestD = d }
  })
  shapes.forEach((sh, i) => {
    if (!solvable(sh)) return
    if (sh.type === 'circle') {
      if (sh.point) return  // 草图点冇 rim（圆心喺 tier-1 已可拣）
      const rim = (Math.sqrt(d2(sh.c, p)) - sh.r) ** 2
      if (rim < bestD) { best = { kind: 'circle', shape: i }; bestD = rim }
      return
    }
    if (isArcPoly(sh)) {
      const cc = circum3(sh.arc.a, sh.arc.m, sh.arc.b)
      if (cc) {
        const rim = (Math.sqrt(d2(cc.c, p)) - cc.r) ** 2
        if (rim < bestD) { best = { kind: 'circle', shape: i }; bestD = rim }  // rim hit = the arc itself
      }
      // chord edge
      const a = sh.arc.a, b = sh.arc.b
      const ab2 = d2(a, b)
      if (ab2 > 1e-9) {
        let t = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / ab2
        t = Math.max(0, Math.min(1, t))
        const d = d2([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], p)
        if (d < bestD) { best = { kind: 'edge', shape: i, idx: 0 }; bestD = d }
      }
      return
    }
    if (isVertsPoly(sh)) {
      // each segment hit-tested along its TRUE curve (arc segs via their tessellation), ref = segment idx
      const vs = sh.verts, n = vs.length
      const segN = sh.open ? n - 1 : n   // T760：开放路径冇闭合段（唔好点中幽灵边）
      for (let j = 0; j < segN; j++) {
        const a = vs[j], b = vs[(j + 1) % n], bu = sh.bulges[j] || 0
        const chain: FPt[] = Math.abs(bu) > 1e-12 ? [a, ...tessellateSeg(a, b, bu)] : [a, b]
        for (let k = 0; k + 1 < chain.length; k++) {
          const qa = chain[k], qb = chain[k + 1]
          const ab2 = d2(qa, qb)
          if (ab2 < 1e-12) continue
          let t = ((p[0] - qa[0]) * (qb[0] - qa[0]) + (p[1] - qa[1]) * (qb[1] - qa[1])) / ab2
          t = Math.max(0, Math.min(1, t))
          const d = d2([qa[0] + (qb[0] - qa[0]) * t, qa[1] + (qb[1] - qa[1]) * t], p)
          if (d < bestD) { best = { kind: 'edge', shape: i, idx: j }; bestD = d }
        }
      }
      return
    }
    if (isSplinePoly(sh)) return  // S103[8]：样条只命中 ctrl 点（tier-1），唔做边命中 → 无幽灵弦边可落假约束
    const pts = sh.type === 'rect' ? rectCorners(sh) : sh.pts
    const n = pts.length
    for (let j = 0; j < n; j++) {
      const a = pts[j], b = pts[(j + 1) % n]
      const ab2 = d2(a, b)
      if (ab2 < 1e-9) continue
      let t = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / ab2
      t = Math.max(0, Math.min(1, t))
      const proj: FPt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
      const d = d2(proj, p)
      if (d < bestD) { best = { kind: 'edge', shape: i, idx: j }; bestD = d }
    }
  })
  // #52：tier-1 点距 > 0.35tol → 同 tier-2/3 最近边／圆周比真实距离。
  // GM-FP3 #49：曲线 > 填充 > 点 —— 平手/曲线更近都拣【曲线】（操作员实战「圆周易被其上点抢」）；
  //   点净系【严格更近】先赢（`<`，非 `<=`）。≤0.35tol 短半径点优先区已喺上面短路返 ptBest（#52 保留）。
  if (ptBest && (!best || ptBestD < bestD)) return ptBest
  return best
}

// GM-FP3 #46 双击链选：由一条边（seed）出发，沿【共享端点】走遍成条相连闭链/开链，返回沿途所有 edge ref。
// 圆／非 edge seed = 单一整体（一击即代表成个 shape），原样返回。纯函数、可单测（shared-endpoint walk）。
type ChainSeg = { ref: SkRef; a: FPt; b: FPt }
function chainSegsOf(shapes: FShape[]): ChainSeg[] {
  const out: ChainSeg[] = []
  shapes.forEach((sh, i) => {
    if (!solvable(sh) || sh.type === 'circle' || isSplinePoly(sh)) return   // 圆无 edge；样条只 ctrl，唔入链
    if (isArcPoly(sh)) { out.push({ ref: { kind: 'edge', shape: i, idx: 0 }, a: sh.arc.a, b: sh.arc.b }); return }  // 三点弧：chord 两端
    const pts = sh.type === 'rect' ? rectCorners(sh) : (sh.verts ?? sh.pts)
    const n = pts.length
    const segN = sh.type === 'poly' && sh.open ? n - 1 : n
    for (let j = 0; j < segN; j++) out.push({ ref: { kind: 'edge', shape: i, idx: j }, a: pts[j], b: pts[(j + 1) % n] })
  })
  return out
}
export function chainSelect(shapes: FShape[], seed: SkRef): SkRef[] {
  if (seed.kind !== 'edge') return [seed]   // 圆／点 = 整体，唔链
  const segs = chainSegsOf(shapes)
  const near = (p: FPt, q: FPt) => Math.abs(p[0] - q[0]) < 1e-3 && Math.abs(p[1] - q[1]) < 1e-3
  const share = (s1: ChainSeg, s2: ChainSeg) => near(s1.a, s2.a) || near(s1.a, s2.b) || near(s1.b, s2.a) || near(s1.b, s2.b)
  const eqE = (a: SkRef, b: SkRef) => a.kind === b.kind && (a as { shape?: number }).shape === (b as { shape?: number }).shape && (a as { idx?: number }).idx === (b as { idx?: number }).idx
  const seedIdx = segs.findIndex((s) => eqE(s.ref, seed))
  if (seedIdx < 0) return [seed]
  const visited = new Set<number>()
  const stack = [seedIdx]
  const out: SkRef[] = []
  while (stack.length) {
    const i = stack.pop()!
    if (visited.has(i)) continue
    visited.add(i)
    out.push(segs[i].ref)
    segs.forEach((s, j) => { if (!visited.has(j) && share(segs[i], s)) stack.push(j) })
  }
  return out
}

// GM-FP3 #44 草图框选：window（左→右全包，crossing=false）/ crossing（右→左相触，crossing=true）。
// a/b = 框两对角（草图 2D）。返回每个命中 shape 一个代表 ref（圆→circle · 草图点→pt · 其余→edge#0）。
// 纯函数、可单测（inclusion 数学：全包=所有轮廓采样点喺框内；相触=任一采样点喺框内 或 任一轮廓段穿过框）。
function segSegX(p1: FPt, p2: FPt, p3: FPt, p4: FPt): boolean {
  const d = (a: FPt, b: FPt, c: FPt) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}
function marqueeOutline(sh: FShape): { pts: FPt[]; closed: boolean } | null {
  if (!solvable(sh)) return null
  if (sh.type === 'circle') {
    if (sh.point) return { pts: [sh.c], closed: false }
    const out: FPt[] = []
    for (let k = 0; k < 32; k++) { const t = (k / 32) * Math.PI * 2; out.push([sh.c[0] + sh.r * Math.cos(t), sh.c[1] + sh.r * Math.sin(t)]) }
    return { pts: out, closed: true }
  }
  if (sh.type === 'rect') return { pts: rectCorners(sh), closed: true }
  if (!sh.pts || !sh.pts.length) return null
  return { pts: sh.pts, closed: !sh.open }
}
export function marqueeHits(shapes: FShape[], a: FPt, b: FPt, crossing: boolean): SkRef[] {
  const minx = Math.min(a[0], b[0]), maxx = Math.max(a[0], b[0]), miny = Math.min(a[1], b[1]), maxy = Math.max(a[1], b[1])
  const inRect = (p: FPt) => p[0] >= minx && p[0] <= maxx && p[1] >= miny && p[1] <= maxy
  const corners: FPt[] = [[minx, miny], [maxx, miny], [maxx, maxy], [minx, maxy]]
  const out: SkRef[] = []
  shapes.forEach((sh, i) => {
    const ol = marqueeOutline(sh)
    if (!ol || !ol.pts.length) return
    let sel = false
    if (!crossing) {
      sel = ol.pts.every(inRect)   // window：所有采样点喺框内（真全包）
    } else if (ol.pts.some(inRect)) {
      sel = true                   // crossing：任一采样点喺框内
    } else {
      const n = ol.pts.length, segN = ol.closed ? n : n - 1   // 或任一轮廓段穿过框边（框细过轮廓、边穿过嘅情形）
      for (let j = 0; j < segN && !sel; j++) { const p = ol.pts[j], q = ol.pts[(j + 1) % n]; for (let k = 0; k < 4 && !sel; k++) if (segSegX(p, q, corners[k], corners[(k + 1) % 4])) sel = true }
    }
    if (sel) out.push(sh.type === 'circle' ? (sh.point ? { kind: 'pt', shape: i, idx: 0 } : { kind: 'circle', shape: i }) : { kind: 'edge', shape: i, idx: 0 })
  })
  return out
}

// Decompose shapes + user constraints into a full planegcs primitive list.
function buildPrims(shapes: FShape[], cons: SkCon[]): (SketchPrimitive | Constraint)[] | null {
  const fixedPts = new Set<string>()
  for (const c of cons) {
    if (c.kind !== 'con' || c.type !== 'fix') continue
    const r = c.a
    // S198 实体级 Fix：成条边 → 钉两端点；圆 → 钉圆心（半径喺下面 cons 循环补 circle_radius/arc_radius）；
    // 三点弧（rim 或 chord edge）→ a/b/圆心三点全钉（arc_rules 联动下半径/扫角随之封死）
    if (r.kind === 'edge' && shapes[r.shape] && solvable(shapes[r.shape])) {
      const sh = shapes[r.shape]
      // 三点弧：钉 a+b【唔钉圆心】— 圆心由 arc_rules + 半径钉（cons 循环补 arc_radius）唯一解出。
      // 三点全钉会令 arc_rules 冗余（半径被决定两次）→ planegcs 报 conflict。
      if (isArcPoly(sh)) { fixedPts.add(pid(r.shape, 0)); fixedPts.add(pid(r.shape, 1)); continue }
      const n = sh.type === 'rect' ? 4 : (((sh as { verts?: FPt[]; pts: FPt[] }).verts ?? (sh as { pts: FPt[] }).pts).length)
      fixedPts.add(pid(r.shape, r.idx)); fixedPts.add(pid(r.shape, (r.idx + 1) % n))
      continue
    }
    if (r.kind === 'circle' && shapes[r.shape]) {
      const sh = shapes[r.shape]
      if (isArcPoly(sh)) { fixedPts.add(pid(r.shape, 0)); fixedPts.add(pid(r.shape, 1)) }  // 同上：a+b+半径钉
      else fixedPts.add(pid(r.shape, 0))  // 整圆：钉圆心，半径见 cons 循环
      continue
    }
    const id = refPtId(shapes, c.a); if (id) fixedPts.add(id)
  }
  const prims: (SketchPrimitive | Constraint)[] = [
    { id: 'o0', type: 'point', x: 0, y: 0, fixed: true } as SketchPrimitive,  // sketch origin (for future origin dims)
  ]
  // projected reference geometry actually USED by constraints → fixed points / fixed-endpoint lines
  if (_refGeo) {
    const usedP = new Set<number>(), usedE = new Set<number>()
    for (const c of cons) {
      for (const r of [c.a, c.b, (c as { c?: SkRef }).c]) {
        if (r?.kind === 'refpt') usedP.add(r.idx)
        else if (r?.kind === 'refedge') usedE.add(r.idx)
      }
    }
    for (const j of usedP) { const q = _refGeo.pts[j]; if (q) prims.push({ id: `rp${j}`, type: 'point', x: q[0], y: q[1], fixed: true } as SketchPrimitive) }
    for (const j of usedE) {
      const s = _refGeo.segs[j]
      if (!s) continue
      prims.push({ id: `rl${j}a`, type: 'point', x: s[0][0], y: s[0][1], fixed: true } as SketchPrimitive)
      prims.push({ id: `rl${j}b`, type: 'point', x: s[1][0], y: s[1][1], fixed: true } as SketchPrimitive)
      prims.push({ id: `rl${j}`, type: 'line', p1_id: `rl${j}a`, p2_id: `rl${j}b` } as SketchPrimitive)
    }
  }
  shapes.forEach((sh, i) => {
    if (!solvable(sh)) return
    if (sh.type === 'circle') {
      prims.push({ id: pid(i, 0), type: 'point', x: sh.c[0], y: sh.c[1], fixed: fixedPts.has(pid(i, 0)) } as SketchPrimitive)
      if (!sh.point) prims.push({ id: cid(i), type: 'circle', c_id: pid(i, 0), radius: sh.r } as SketchPrimitive)  // 草图点：只有圆心，冇 circle prim
      return
    }
    if (isArcPoly(sh)) {
      const cc = circum3(sh.arc.a, sh.arc.m, sh.arc.b)
      if (!cc) return  // collinear (degenerate) → no solver participation
      const [cx, cy] = cc.c
      const A = sh.arc.a, B = sh.arc.b, M = sh.arc.m
      prims.push({ id: pid(i, 0), type: 'point', x: A[0], y: A[1], fixed: fixedPts.has(pid(i, 0)) } as SketchPrimitive)
      prims.push({ id: pid(i, 1), type: 'point', x: B[0], y: B[1], fixed: fixedPts.has(pid(i, 1)) } as SketchPrimitive)
      prims.push({ id: pid(i, 2), type: 'point', x: cx, y: cy, fixed: fixedPts.has(pid(i, 2)) } as SketchPrimitive)
      prims.push({ id: lid(i, 0), type: 'line', p1_id: pid(i, 0), p2_id: pid(i, 1) } as SketchPrimitive)  // chord
      // planegcs arcs run CCW start→end; orient so the sweep passes through m
      const a0 = Math.atan2(A[1] - cy, A[0] - cx), a1 = Math.atan2(B[1] - cy, B[0] - cx), am = Math.atan2(M[1] - cy, M[0] - cx)
      const TAU = Math.PI * 2
      const ccw = ((a1 - a0 + TAU) % TAU) >= ((am - a0 + TAU) % TAU)
      const arcP = ccw
        ? { start_id: pid(i, 0), end_id: pid(i, 1), start_angle: a0, end_angle: a0 + ((a1 - a0 + TAU) % TAU) }
        : { start_id: pid(i, 1), end_id: pid(i, 0), start_angle: a1, end_angle: a1 + ((a0 - a1 + TAU) % TAU) }
      prims.push({ id: cid(i), type: 'arc', c_id: pid(i, 2), radius: cc.r, ...arcP } as SketchPrimitive)
      // FreeCAD-style arc rules: couple start/end points to (centre, radius, angles) — the wrapper's
      // push_arc only registers params, WITHOUT this the radius dim wouldn't drive the endpoints.
      prims.push({ id: `arr${i}`, type: 'arc_rules', a_id: cid(i) } as Constraint)
      return
    }
    if (isVertsPoly(sh)) {
      // Corner verts = free points; every segment gets a chord line prim (h/v/parallel/len refs);
      // arc segments ADDITIONALLY get centre point + arc prim + arc_rules (T725) → radius dims,
      // tangency and equal-radius work on them. Convention: bulge>0 = 凸左 = CW a→b around the
      // centre = the planegcs CCW arc runs b→a (planegcs arcs always sweep CCW start→end).
      const vs = sh.verts, n = vs.length
      const TAU2 = Math.PI * 2
      vs.forEach((q, j) => prims.push({ id: pid(i, j), type: 'point', x: q[0], y: q[1], fixed: fixedPts.has(pid(i, j)) } as SketchPrimitive))
      const segN = sh.open ? n - 1 : n   // T760：开放路径唔好生成闭合段 prim（幽灵边会令求解器锁死两端）
      for (let j = 0; j < segN; j++) {
        prims.push({ id: lid(i, j), type: 'line', p1_id: pid(i, j), p2_id: pid(i, (j + 1) % n) } as SketchPrimitive)
        const bu = sh.bulges[j] || 0
        if (Math.abs(bu) < 1e-12) continue
        const a = vs[j], b = vs[(j + 1) % n]
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-9) continue
        const ctr = bulgeCenter(a, b, bu), R = bulgeRadius(a, b, bu)
        prims.push({ id: paid(i, j), type: 'point', x: ctr[0], y: ctr[1], fixed: false } as SketchPrimitive)
        const a0 = Math.atan2(a[1] - ctr[1], a[0] - ctr[0]), a1 = Math.atan2(b[1] - ctr[1], b[0] - ctr[0])
        const arcP = bu < 0
          ? { start_id: pid(i, j), end_id: pid(i, (j + 1) % n), start_angle: a0, end_angle: a0 + ((a1 - a0 + TAU2) % TAU2) }
          : { start_id: pid(i, (j + 1) % n), end_id: pid(i, j), start_angle: a1, end_angle: a1 + ((a0 - a1 + TAU2) % TAU2) }
        prims.push({ id: said(i, j), type: 'arc', c_id: paid(i, j), radius: R, ...arcP } as SketchPrimitive)
        prims.push({ id: `sar${i}_${j}`, type: 'arc_rules', a_id: said(i, j) } as Constraint)
      }
      return
    }
    if (isSplinePoly(sh)) {
      // S103[8]：ctrl 控制点 = 自由 solver 点（可 coincident/fix/h/v/距离）。唔 push line/circle —
      // 控制多边形唔系真几何边（落 line 会引入假约束目标），曲线由 ctrl 重铺。
      sh.ctrl.forEach((q, j) => prims.push({ id: pid(i, j), type: 'point', x: q[0], y: q[1], fixed: fixedPts.has(pid(i, j)) } as SketchPrimitive))
      return
    }
    const pts = sh.type === 'rect' ? rectCorners(sh) : sh.pts
    pts.forEach((q, j) => prims.push({ id: pid(i, j), type: 'point', x: q[0], y: q[1], fixed: fixedPts.has(pid(i, j)) } as SketchPrimitive))
    const n = pts.length
    for (let j = 0; j < n; j++) prims.push({ id: lid(i, j), type: 'line', p1_id: pid(i, j), p2_id: pid(i, (j + 1) % n) } as SketchPrimitive)
    if (sh.type === 'rect') {
      // a rect stays a rect: bottom/top horizontal, right/left vertical
      if (!cons.some(c=>c.kind==='con'&&c.type==='h'&&c.a.kind==='edge'&&c.a.shape===i&&c.a.idx===0)) prims.push({ id: `ar${i}h0`, type: 'horizontal_l', l_id: lid(i, 0) } as Constraint)
      if (!cons.some(c=>c.kind==='con'&&c.type==='h'&&c.a.kind==='edge'&&c.a.shape===i&&c.a.idx===2)) prims.push({ id: `ar${i}h2`, type: 'horizontal_l', l_id: lid(i, 2) } as Constraint)
      if (!cons.some(c=>c.kind==='con'&&c.type==='v'&&c.a.kind==='edge'&&c.a.shape===i&&c.a.idx===1)) prims.push({ id: `ar${i}v1`, type: 'vertical_l', l_id: lid(i, 1) } as Constraint)
      if (!cons.some(c=>c.kind==='con'&&c.type==='v'&&c.a.kind==='edge'&&c.a.shape===i&&c.a.idx===3)) prims.push({ id: `ar${i}v3`, type: 'vertical_l', l_id: lid(i, 3) } as Constraint)
    }
  })
  for (const c of cons) {
    if (!refValid(shapes, c.a) || (c.b && !refValid(shapes, c.b))) continue
    if (c.kind === 'con' && c.c && !refValid(shapes, c.c)) continue
    if (c.kind === 'dim') {
      if (c.driven) continue  // 从动尺寸：只显示量度值，唔入 solver
      if (c.type === 'dia' && c.a.kind === 'circle') { prims.push({ id: c.id, type: 'circle_radius', c_id: cid(c.a.shape), radius: c.value / 2 } as Constraint); continue }
      if (c.type === 'rad' && c.a.kind === 'circle') { prims.push({ id: c.id, type: 'circle_radius', c_id: cid(c.a.shape), radius: c.value } as Constraint); continue }   // 审计修复：整圆 cid 是 'circle' prim，旧版发 arc_radius → planegcs BindingError(Expected Arc) 抛错冻结 UI；整圆用 circle_radius（同 :510 dia）
      if ((c.type === 'rad' || c.type === 'dia') && c.a.kind === 'edge') {
        // radius/Ø dim on a verts-poly ARC SEGMENT (slot cap / rrect corner / fillet arc)
        const seg = arcSegOf(shapes, c.a)
        if (seg) prims.push({ id: c.id, type: 'arc_radius', a_id: seg, radius: c.type === 'dia' ? c.value / 2 : c.value } as Constraint)
        continue
      }
      if (c.type === 'arclen') {
        // 弧长尺寸：planegcs arc_length（dist = 弧长）。净系真弧 prim 先有得驱动 —
        // verts-poly 弧段 → 佢嘅 solver arc (said)；三点弧 rim → cid prim（本身就系 'arc'）。
        // 成个圆永远冇 arclen（创建侧已挡）。从动（driven）喺上面 :486 已 skip，display-only 走 measureDim。
        if (c.a.kind === 'edge') {
          const seg = arcSegOf(shapes, c.a)
          if (seg) prims.push({ id: c.id, type: 'arc_length', a_id: seg, dist: c.value } as Constraint)
          continue
        }
        if (c.a.kind === 'circle' && isArcPoly(shapes[c.a.shape])) prims.push({ id: c.id, type: 'arc_length', a_id: cid(c.a.shape), dist: c.value } as Constraint)
        continue
      }
      if (c.type === 'len' && c.a.kind === 'edge') { const l = c.a; const sh = shapes[l.shape]; const pts = sh.type === 'rect' ? 4 : ((sh as { verts?: FPt[]; pts: FPt[] }).verts ?? (sh as { pts: FPt[] }).pts).length; prims.push({ id: c.id, type: 'p2p_distance', p1_id: pid(l.shape, l.idx), p2_id: pid(l.shape, (l.idx + 1) % pts), distance: c.value } as Constraint); continue }
      if (c.type === 'dist' && c.b) { const a = refPtId(shapes, c.a), b = refPtId(shapes, c.b); if (a && b) prims.push({ id: c.id, type: 'p2p_distance', p1_id: a, p2_id: b, distance: c.value } as Constraint); continue }
      if ((c.type === 'hdist' || c.type === 'vdist') && c.b) {
        // Fusion 位置尺寸: horizontal / vertical distance between two points (difference on x or y
        // params). Params ordered at creation so the difference stays POSITIVE (label edits stay simple).
        const a = refPtId(shapes, c.a), b = refPtId(shapes, c.b)
        if (a && b) {
          const [pa] = refPts(shapes, c.a), [pb] = refPts(shapes, c.b)
          const prop = c.type === 'hdist' ? 'x' : 'y'
          const v1 = c.type === 'hdist' ? pa[0] : pa[1], v2 = c.type === 'hdist' ? pb[0] : pb[1]
          const [lo, hi] = v1 <= v2 ? [a, b] : [b, a]
          prims.push({ id: c.id, type: 'difference', param1: { o_id: lo, prop }, param2: { o_id: hi, prop }, difference: c.value } as Constraint)
        }
        continue
      }
      if (c.type === 'angle' && c.b) { const la = refLineId(c.a), lb = refLineId(c.b); if (la && lb) prims.push({ id: c.id, type: 'l2l_angle_ll', l1_id: la, l2_id: lb, angle: (c.value * Math.PI) / 180 } as Constraint); continue }  // 度 → planegcs 弧度
      if (c.type === 'p2l' && c.b) { const p = refPtId(shapes, c.a), l = refLineId(c.b); if (p && l) prims.push({ id: c.id, type: 'p2l_distance', p_id: p, l_id: l, distance: c.value } as Constraint); continue }
      continue
    }
    const A = c.a, B = c.b
    const aLn = refLineId(A), bLn = B ? refLineId(B) : null
    const aPt = refPtId(shapes, A), bPt = B ? refPtId(shapes, B) : null
    switch (c.type) {
      case 'h':
        if (aLn) prims.push({ id: c.id, type: 'horizontal_l', l_id: aLn } as Constraint)
        else if (aPt && bPt) prims.push({ id: c.id, type: 'horizontal_pp', p1_id: aPt, p2_id: bPt } as Constraint)
        break
      case 'v':
        if (aLn) prims.push({ id: c.id, type: 'vertical_l', l_id: aLn } as Constraint)
        else if (aPt && bPt) prims.push({ id: c.id, type: 'vertical_pp', p1_id: aPt, p2_id: bPt } as Constraint)
        break
      case 'coincident':
        if (aPt && bPt) prims.push({ id: c.id, type: 'p2p_coincident', p1_id: aPt, p2_id: bPt } as Constraint)
        else if (aPt && bLn) prims.push({ id: c.id, type: 'point_on_line_pl', p_id: aPt, l_id: bLn } as Constraint)
        else if (aLn && bPt) prims.push({ id: c.id, type: 'point_on_line_pl', p_id: bPt, l_id: aLn } as Constraint)
        break
      case 'parallel': if (aLn && bLn) prims.push({ id: c.id, type: 'parallel', l1_id: aLn, l2_id: bLn } as Constraint); break
      case 'perp': if (aLn && bLn) prims.push({ id: c.id, type: 'perpendicular_ll', l1_id: aLn, l2_id: bLn } as Constraint); break
      case 'equal': {
        const sgA = arcSegOf(shapes, A), sgB = B ? arcSegOf(shapes, B) : null
        if (sgA && sgB) prims.push({ id: c.id, type: 'equal_radius_aa', a1_id: sgA, a2_id: sgB } as Constraint)  // 两弧段 = 等半径（Fusion 语义）
        else if (sgA || sgB) {
          const seg = (sgA ?? sgB)!, circ = sgA ? B : A
          if (circ?.kind === 'circle') {
            if (isArcPoly(shapes[circ.shape])) prims.push({ id: c.id, type: 'equal_radius_aa', a1_id: cid(circ.shape), a2_id: seg } as Constraint)  // 三点弧 prim 都系 arc
            else prims.push({ id: c.id, type: 'equal_radius_ca', c1_id: cid(circ.shape), a2_id: seg } as Constraint)
          }
          // #53 GM-L2：弧段 + 直边 = 等弦长语义误导，诚实唔落（唔 push 任何 prim）。诚实拒绝喺
          // conApplicable('equal') 统一做（弧段 isC／直边 isSE，两个 predicate 都唔同时成立 → false），
          // UI 按钮 + store.addSkCon 全部入口一致拒；此处已移除原本不可达嘅 `else if (sgA||sgB) break` 死分支。
        }
        else if (aLn && bLn) prims.push({ id: c.id, type: 'equal_length', l1_id: aLn, l2_id: bLn } as Constraint)
        else if (A.kind === 'circle' && B?.kind === 'circle') prims.push({ id: c.id, type: 'equal_radius_cc', c1_id: cid(A.shape), c2_id: cid(B.shape) } as Constraint)
        break
      }
      case 'tangent': {
        const sgA = arcSegOf(shapes, A), sgB = B ? arcSegOf(shapes, B) : null
        if (sgA || sgB) {
          if (sgA && sgB) { prims.push({ id: c.id, type: 'tangent_aa', a1_id: sgA, a2_id: sgB } as Constraint); break }  // 弧段↔弧段（T726 实测 tangent_aa 收敛良好）
          const seg = (sgA ?? sgB)!
          const other = sgA ? B : A
          if (other?.kind === 'circle') {
            if (isArcPoly(shapes[other.shape])) prims.push({ id: c.id, type: 'tangent_aa', a1_id: cid(other.shape), a2_id: seg } as Constraint)  // 三点弧 ↔ 弧段
            else prims.push({ id: c.id, type: 'tangent_ca', c_id: cid(other.shape), a_id: seg } as Constraint)
          } else {
            const oLn = other ? refLineId(other) : null
            if (oLn) prims.push({ id: c.id, type: 'tangent_la', l_id: oLn, a_id: seg } as Constraint)
          }
          break
        }
        const arcA = A.kind === 'circle' && isArcPoly(shapes[A.shape]), arcB = B?.kind === 'circle' && isArcPoly(shapes[B.shape])
        if (aLn && B?.kind === 'circle') prims.push(arcB ? ({ id: c.id, type: 'tangent_la', l_id: aLn, a_id: cid(B.shape) } as Constraint) : ({ id: c.id, type: 'tangent_lc', l_id: aLn, c_id: cid(B.shape) } as Constraint))
        else if (A.kind === 'circle' && bLn) prims.push(arcA ? ({ id: c.id, type: 'tangent_la', l_id: bLn, a_id: cid(A.shape) } as Constraint) : ({ id: c.id, type: 'tangent_lc', l_id: bLn, c_id: cid(A.shape) } as Constraint))
        else if (A.kind === 'circle' && B?.kind === 'circle') {
          if (arcA && arcB) prims.push({ id: c.id, type: 'tangent_aa', a1_id: cid(A.shape), a2_id: cid(B.shape) } as Constraint)  // 三点弧↔三点弧（T726：tangent_aa 实测可用，撤销 T715 保守跳过）
          else if (arcA) prims.push({ id: c.id, type: 'tangent_ca', c_id: cid(B.shape), a_id: cid(A.shape) } as Constraint)
          else if (arcB) prims.push({ id: c.id, type: 'tangent_ca', c_id: cid(A.shape), a_id: cid(B.shape) } as Constraint)
          else prims.push({ id: c.id, type: 'tangent_cc', c1_id: cid(A.shape), c2_id: cid(B.shape) } as Constraint)
        }
        break
      }
      case 'midpoint': {
        // S198 直边：两端点对称于 P（原有 ppp）。弧（弧段 / 三点弧 rim·弦 edge）＝真弧参数中点：
        //   辅助线 圆心→P ⊥ 弦线 prim（⇔ P 喺弦嘅垂直平分径上）+ point_on_arc（P 落弧圆周）→ P 锁 2 DOF，无冗余。
        const p = aPt ?? bPt
        const other = aPt ? B : A
        if (!p || !other) break
        const arcMid = (ctrId: string, chordId: string, endId: string) => {
          // 圆心→P ⊥ 弦（P 喺垂直平分径）+ |圆心→P| = |圆心→端点a|（P 到圆心距离 = R，随弧联动）
          // 用 equal_length 而非 point_on_arc：后者内部连角度范围（>1 条方程）→ 同 2-DOF 目标冗余报 conflict（实测）
          prims.push({ id: c.id + 'L', type: 'line', p1_id: ctrId, p2_id: p } as SketchPrimitive)
          prims.push({ id: c.id + 'M', type: 'line', p1_id: ctrId, p2_id: endId } as SketchPrimitive)
          prims.push({ id: c.id + 'a', type: 'perpendicular_ll', l1_id: c.id + 'L', l2_id: chordId } as Constraint)
          prims.push({ id: c.id + 'b', type: 'equal_length', l1_id: c.id + 'L', l2_id: c.id + 'M' } as Constraint)
        }
        if (other.kind === 'refedge') { prims.push({ id: c.id, type: 'p2p_symmetric_ppp', p1_id: `rl${other.idx}a`, p2_id: `rl${other.idx}b`, p_id: p } as Constraint); break }  // 顺手修：旧码对 refedge 会 shapes[undefined] TypeError
        if (other.kind === 'circle' && isArcPoly(shapes[other.shape])) { arcMid(pid(other.shape, 2), lid(other.shape, 0), pid(other.shape, 0)); break }  // 三点弧 rim
        if (other.kind !== 'edge') break
        const sg = arcSegOf(shapes, other)
        if (sg) { arcMid(paid(other.shape, other.idx), lid(other.shape, other.idx), pid(other.shape, other.idx)); break }  // verts-poly 弧段
        const sh = shapes[other.shape]
        if (isArcPoly(sh)) { arcMid(pid(other.shape, 2), lid(other.shape, 0), pid(other.shape, 0)); break }  // 三点弧嘅弦 edge → 一样当弧中点（Fusion 语义）
        const n = sh.type === 'rect' ? 4 : ((sh as { verts?: FPt[]; pts: FPt[] }).verts ?? (sh as { pts: FPt[] }).pts).length
        prims.push({ id: c.id, type: 'p2p_symmetric_ppp', p1_id: pid(other.shape, other.idx), p2_id: pid(other.shape, (other.idx + 1) % n), p_id: p } as Constraint)
        break
      }
      case 'concentric': {
        // works for circle+circle / circle+arc / arc+arc — coincident CENTRE points (arc centre = pt idx 2);
        // T725: also circle/arc ↔ verts-poly ARC SEGMENT (its solver centre prim paid) — e.g. 孔同心于槽端帽.
        const ctr = (r: SkRef & { kind: 'circle' }) => pid(r.shape, isArcPoly(shapes[r.shape]) ? 2 : 0)
        const segCtr = (r?: SkRef) => (r?.kind === 'edge' && arcSegOf(shapes, r) ? paid(r.shape, r.idx) : null)
        const scA = segCtr(A), scB = segCtr(B)
        if (scA && scB) prims.push({ id: c.id, type: 'p2p_coincident', p1_id: scA, p2_id: scB } as Constraint)
        else if (scA && B?.kind === 'circle') prims.push({ id: c.id, type: 'p2p_coincident', p1_id: scA, p2_id: ctr(B) } as Constraint)
        else if (scB && A.kind === 'circle') prims.push({ id: c.id, type: 'p2p_coincident', p1_id: ctr(A), p2_id: scB } as Constraint)
        else if (A.kind === 'circle' && B?.kind === 'circle') prims.push({ id: c.id, type: 'p2p_coincident', p1_id: ctr(A), p2_id: ctr(B) } as Constraint)
        break
      }
      case 'collinear':
        // planegcs 无直接 collinear：parallel + B 嘅起点落喺 A 线上（两条约束，同 csketch T706）
        if (aLn && bLn && B?.kind === 'edge') {
          prims.push({ id: c.id + 'a', type: 'parallel', l1_id: aLn, l2_id: bLn } as Constraint)
          prims.push({ id: c.id + 'b', type: 'point_on_line_pl', p_id: pid(B.shape, B.idx), l_id: aLn } as Constraint)
        }
        break
      case 'symmetric': {
        // S198 对称于轴线（第 3 选 c.c = 轴）。2 点＝原有；实体级：2 条直边 → 端点就近镜像配对（2×ppl）；
        // 2 个整圆 → 圆心镜像 + 等半径；2 段弧（弧段/三点弧）→ 端点两对镜像 + 等半径。
        // 一个 SkCon 展开多 prim（id 后缀 a/b/c — 同 collinear 惯用法）→ 一个徽章、一齐删。
        const axis = c.c ? refLineId(c.c) : null
        if (!axis) break
        if (aPt && bPt) { prims.push({ id: c.id, type: 'p2p_symmetric_ppl', p1_id: aPt, p2_id: bPt, l_id: axis } as Constraint); break }
        if (!B || !c.c) break
        const ax = refPts(shapes, c.c)
        // q 关于轴嘅镜像 — 净系用嚟决定端点配对（启发式，唔入 solver）；解一次后已对称，配对稳定
        const mir = (q: FPt): FPt => {
          if (ax.length < 2) return q
          const dx = ax[1][0] - ax[0][0], dy = ax[1][1] - ax[0][1], L2 = dx * dx + dy * dy || 1
          const t = ((q[0] - ax[0][0]) * dx + (q[1] - ax[0][1]) * dy) / L2
          return [2 * (ax[0][0] + t * dx) - q[0], 2 * (ax[0][1] + t * dy) - q[1]]
        }
        const nOf = (sh: FShape) => (sh.type === 'rect' ? 4 : (((sh as { verts?: FPt[]; pts: FPt[] }).verts ?? (sh as { pts: FPt[] }).pts).length))
        // ref → 端点 prim id 对 + 坐标对：直边/弧段（edge）、三点弧（rim circle 或 chord edge）、参考边（rl{j}a/b）
        const endsOf = (r: SkRef): { ids: [string, string]; qs: [FPt, FPt] } | null => {
          if (r.kind === 'refedge') { const s2 = refPts(shapes, r); return s2.length === 2 ? { ids: [`rl${r.idx}a`, `rl${r.idx}b`], qs: [s2[0], s2[1]] } : null }
          if (r.kind === 'circle') { const sh = shapes[r.shape]; return isArcPoly(sh) ? { ids: [pid(r.shape, 0), pid(r.shape, 1)], qs: [sh.arc.a, sh.arc.b] } : null }
          if (r.kind !== 'edge') return null
          const sh = shapes[r.shape]
          if (isArcPoly(sh)) return { ids: [pid(r.shape, 0), pid(r.shape, 1)], qs: [sh.arc.a, sh.arc.b] }
          const qs = refPts(shapes, r)
          return qs.length === 2 ? { ids: [pid(r.shape, r.idx), pid(r.shape, (r.idx + 1) % nOf(sh))], qs: [qs[0], qs[1]] } : null
        }
        // solver 弧 prim id（verts-poly 弧段 said / 三点弧 cid）；整圆或直边 → null
        const arcIdOf = (r: SkRef): string | null => {
          if (r.kind === 'edge') return arcSegOf(shapes, r) ?? (isArcPoly(shapes[r.shape]) ? cid(r.shape) : null)
          if (r.kind === 'circle' && isArcPoly(shapes[r.shape])) return cid(r.shape)
          return null
        }
        const fullA = A.kind === 'circle' && shapes[A.shape].type === 'circle'
        const fullB = B.kind === 'circle' && shapes[B.shape].type === 'circle'
        const arcIdA = arcIdOf(A), arcIdB = arcIdOf(B)
        if (fullA || fullB) {
          // 有整圆嗰对：圆心镜像 + 等半径（cc / ca 按对方系咪弧）
          const ctrOf = (r: SkRef): string | null =>
            r.kind === 'circle' ? pid(r.shape, isArcPoly(shapes[r.shape]) ? 2 : 0)
            : r.kind === 'edge' && arcSegOf(shapes, r) ? paid(r.shape, r.idx)
            : r.kind === 'edge' && isArcPoly(shapes[r.shape]) ? pid(r.shape, 2) : null
          const ca = ctrOf(A), cb2 = ctrOf(B)
          if (!ca || !cb2) break
          prims.push({ id: c.id + 'a', type: 'p2p_symmetric_ppl', p1_id: ca, p2_id: cb2, l_id: axis } as Constraint)
          if (fullA && fullB) prims.push({ id: c.id + 'b', type: 'equal_radius_cc', c1_id: cid((A as { shape: number }).shape), c2_id: cid((B as { shape: number }).shape) } as Constraint)
          else {
            const circShape = fullA ? (A as { shape: number }).shape : (B as { shape: number }).shape
            const arcOther = fullA ? arcIdB : arcIdA
            if (arcOther) prims.push({ id: c.id + 'b', type: 'equal_radius_ca', c1_id: cid(circShape), a2_id: arcOther } as Constraint)
          }
          break
        }
        const ea = endsOf(A), eb = endsOf(B)
        if (!ea || !eb) break
        const m0 = mir(ea.qs[0])
        const swap = Math.hypot(m0[0] - eb.qs[0][0], m0[1] - eb.qs[0][1]) > Math.hypot(m0[0] - eb.qs[1][0], m0[1] - eb.qs[1][1])
        const ob = swap ? [eb.ids[1], eb.ids[0]] : eb.ids
        prims.push({ id: c.id + 'a', type: 'p2p_symmetric_ppl', p1_id: ea.ids[0], p2_id: ob[0], l_id: axis } as Constraint)
        prims.push({ id: c.id + 'b', type: 'p2p_symmetric_ppl', p1_id: ea.ids[1], p2_id: ob[1], l_id: axis } as Constraint)
        if (arcIdA && arcIdB) prims.push({ id: c.id + 'c', type: 'equal_radius_aa', a1_id: arcIdA, a2_id: arcIdB } as Constraint)  // 两段弧补等半径
        break
      }
      case 'fix': {
        // 点 fix 靠 fixedPts（prim fixed:true）。S198 实体 fix 补「半径钉」（planegcs 现成 circle_radius/arc_radius）；
        // 值取当前几何 — 同 fixed 点用当前坐标一个道理。
        const r = c.a
        if (r.kind === 'circle') {
          const sh = shapes[r.shape]
          if (sh?.type === 'circle' && !sh.point) prims.push({ id: c.id + 'r', type: 'circle_radius', c_id: cid(r.shape), radius: sh.r } as Constraint)
          else if (sh && isArcPoly(sh)) {
            // 三点弧：a+b 已钉 + 半径钉 → 圆心由 arc_rules 唯一解出（通用弧零冗余，实测 conflicts=[] dof 正确）。
            // 已知奇点：【正半圆】（圆心啱啱喺弦上）半径对剩余 DOF 梯度=0 → GCS 诊断误报 (arr0,k?r) conflict，
            // 但几何照样解啱（同类商用 solver 同款奇异配置行为）— 唔好当 bug 修。
            const cc = circum3(sh.arc.a, sh.arc.m, sh.arc.b)
            if (cc) prims.push({ id: c.id + 'r', type: 'arc_radius', a_id: cid(r.shape), radius: cc.r } as Constraint)
          }
        } else if (r.kind === 'edge') {
          const sg = arcSegOf(shapes, r)
          if (sg) {
            const sh = shapes[r.shape] as FShape & { type: 'poly'; verts: FPt[]; bulges: number[] }
            const R = bulgeRadius(sh.verts[r.idx], sh.verts[(r.idx + 1) % sh.verts.length], sh.bulges[r.idx])
            prims.push({ id: c.id + 'r', type: 'arc_radius', a_id: sg, radius: R } as Constraint)  // 弧段：两端已钉 + 半径钉 → 成段封死
          } else {
            // 三点弧嘅弦 edge 命中 → 同 rim 一样成条弧钉死（a+b 已钉 + 半径）
            const sh = shapes[r.shape]   // 先取再 guard — narrowing 唔跨 fresh index access（tsc -b 严格版报）
            if (isArcPoly(sh)) {
              const cc = circum3(sh.arc.a, sh.arc.m, sh.arc.b)
              if (cc) prims.push({ id: c.id + 'r', type: 'arc_radius', a_id: cid(r.shape), radius: cc.r } as Constraint)
            }
          }
        }
        break
      }
    }
  }
  return prims
}

// Live measured value of a dim from the CURRENT geometry — for 从动 (driven/reference) dims, which
// display the measurement in parentheses instead of driving the solver.
export function measureDim(shapes: FShape[], c: SkCon): number | null {
  if (c.kind !== 'dim') return null
  const P = (r?: SkRef) => (r ? refPts(shapes, r) : [])
  switch (c.type) {
    case 'dist': { const [a] = P(c.a), [b] = P(c.b); return a && b ? Math.hypot(b[0] - a[0], b[1] - a[1]) : null }
    case 'hdist': { const [a] = P(c.a), [b] = P(c.b); return a && b ? Math.abs(b[0] - a[0]) : null }
    case 'vdist': { const [a] = P(c.a), [b] = P(c.b); return a && b ? Math.abs(b[1] - a[1]) : null }
    case 'len': { const [a, b] = P(c.a); return a && b ? Math.hypot(b[0] - a[0], b[1] - a[1]) : null }
    case 'dia': case 'rad': {
      const r = c.a
      if (r.kind === 'circle') {
        const sh = shapes[r.shape]
        if (sh?.type === 'circle') return c.type === 'dia' ? sh.r * 2 : sh.r
        if (sh && isArcPoly(sh)) { const cc = circum3(sh.arc.a, sh.arc.m, sh.arc.b); return cc ? (c.type === 'dia' ? cc.r * 2 : cc.r) : null }
        return null
      }
      if (r.kind === 'edge') {
        const sh = shapes[r.shape]
        if (sh && isVertsPoly(sh) && Math.abs(sh.bulges[r.idx] || 0) > 1e-12) {
          const R = bulgeRadius(sh.verts[r.idx], sh.verts[(r.idx + 1) % sh.verts.length], sh.bulges[r.idx])
          return c.type === 'dia' ? R * 2 : R
        }
      }
      return null
    }
    case 'arclen': {
      // 弧长（从动显示 / 落约束前预填都用呢度）：净系真弧有值，弦/直边 → null
      const r = c.a
      if (r.kind === 'edge') {
        const sh = shapes[r.shape]
        if (sh && isVertsPoly(sh) && Math.abs(sh.bulges[r.idx] || 0) > 1e-12) {
          const bu = sh.bulges[r.idx]
          // 弧长 = R·θ，θ = 4·atan|bulge|
          return bulgeRadius(sh.verts[r.idx], sh.verts[(r.idx + 1) % sh.verts.length], bu) * bulgeTheta(bu)
        }
        return null
      }
      if (r.kind === 'circle') {
        const sh = shapes[r.shape]
        if (sh && isArcPoly(sh)) {
          // 三点弧：圆周角扫角（扫向跟 m 嗰边 — 同 buildPrims / arcResample 同一套选边逻辑）
          const cc = circum3(sh.arc.a, sh.arc.m, sh.arc.b)
          if (!cc) return null
          const [cx, cy] = cc.c
          const a0 = Math.atan2(sh.arc.a[1] - cy, sh.arc.a[0] - cx), a1 = Math.atan2(sh.arc.b[1] - cy, sh.arc.b[0] - cx), am = Math.atan2(sh.arc.m[1] - cy, sh.arc.m[0] - cx)
          const TAU = Math.PI * 2
          const ccw = ((a1 - a0 + TAU) % TAU) >= ((am - a0 + TAU) % TAU)
          const sweep = ccw ? (a1 - a0 + TAU) % TAU : (a0 - a1 + TAU) % TAU
          return cc.r * sweep  // 弧长 = R × |扫角|
        }
      }
      return null
    }
    case 'angle': {
      const [a1, a2] = P(c.a), [b1, b2] = P(c.b)
      if (!a1 || !a2 || !b1 || !b2) return null
      const u = Math.atan2(a2[1] - a1[1], a2[0] - a1[0]), v = Math.atan2(b2[1] - b1[1], b2[0] - b1[0])
      let d = Math.abs(u - v) * 180 / Math.PI; d %= 180
      return d
    }
    case 'p2l': {
      const [p] = P(c.a), [a, b] = P(c.b)
      if (!p || !a || !b) return null
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
      return Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / L
    }
  }
}

// Dimension GRAPHICS (T731): real extension + dimension lines per dim (Fusion-style), plus the label
// anchor sitting ON the dimension line — the renderer (SkSelDraw) and the HTML label layer share this
// single geometry source so the label always lands on its line.
export type DimGfx = { lines: [FPt, FPt][]; label: FPt }
export function dimGfx(shapes: FShape[], c: SkCon, off = 9): DimGfx | null {
  if (c.kind !== 'dim') return null
  const P = (r?: SkRef) => (r ? refPts(shapes, r) : [])
  const mid = (a: FPt, b: FPt): FPt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  switch (c.type) {
    case 'dist': case 'len': {
      const pts = c.type === 'len' ? P(c.a) : [P(c.a)[0], P(c.b)[0]]
      const [a, b] = pts
      if (!a || !b) return null
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1
      const n: FPt = [-dy / L, dx / L]
      const A: FPt = [a[0] + n[0] * off, a[1] + n[1] * off], B: FPt = [b[0] + n[0] * off, b[1] + n[1] * off]
      return { lines: [[a, A], [b, B], [A, B]], label: mid(A, B) }
    }
    case 'hdist': {
      const [a] = P(c.a), [b] = P(c.b)
      if (!a || !b) return null
      const y = Math.max(a[1], b[1]) + off
      return { lines: [[a, [a[0], y]], [b, [b[0], y]], [[a[0], y], [b[0], y]]], label: [(a[0] + b[0]) / 2, y] }
    }
    case 'vdist': {
      const [a] = P(c.a), [b] = P(c.b)
      if (!a || !b) return null
      const x = Math.max(a[0], b[0]) + off
      return { lines: [[a, [x, a[1]]], [b, [x, b[1]]], [[x, a[1]], [x, b[1]]]], label: [x, (a[1] + b[1]) / 2] }
    }
    case 'rad': case 'dia': case 'arclen': {
      // arclen 同 rad 共用锚点几何：锚喺弧中点（bulge 中点 / arc.m），引出线沿径向出，标签喺 ctr + dir·(R + off·0.8)
      const r = c.a
      let ctr: FPt | null = null, R = 0, dir: FPt | null = null
      if (r.kind === 'circle') {
        const sh = shapes[r.shape]
        if (sh?.type === 'circle') { ctr = sh.c; R = sh.r; dir = [Math.SQRT1_2, Math.SQRT1_2] }
        else if (sh && isArcPoly(sh)) { const cc = circum3(sh.arc.a, sh.arc.m, sh.arc.b); if (cc) { ctr = cc.c; R = cc.r; const dl = Math.hypot(sh.arc.m[0] - cc.c[0], sh.arc.m[1] - cc.c[1]) || 1; dir = [(sh.arc.m[0] - cc.c[0]) / dl, (sh.arc.m[1] - cc.c[1]) / dl] } }
      } else if (r.kind === 'edge') {
        const sh = shapes[r.shape]
        if (sh && isVertsPoly(sh) && Math.abs(sh.bulges[r.idx] || 0) > 1e-12) {
          const a = sh.verts[r.idx], b = sh.verts[(r.idx + 1) % sh.verts.length], bu = sh.bulges[r.idx]
          ctr = bulgeCenter(a, b, bu); R = bulgeRadius(a, b, bu)
          const m = bulgeMid(a, b, bu); const dl = Math.hypot(m[0] - ctr[0], m[1] - ctr[1]) || 1
          dir = [(m[0] - ctr[0]) / dl, (m[1] - ctr[1]) / dl]  // label 沿弧中点方向（落喺弧上）
        }
      }
      if (!ctr || !dir || !(R > 0)) return null
      const rim: FPt = [ctr[0] + dir[0] * R, ctr[1] + dir[1] * R]
      const out: FPt = [ctr[0] + dir[0] * (R + off * 0.8), ctr[1] + dir[1] * (R + off * 0.8)]
      const lines: [FPt, FPt][] = c.type === 'dia'
        ? [[[ctr[0] - dir[0] * R, ctr[1] - dir[1] * R], rim], [rim, out]]  // 直径线穿圆 + 引出
        : c.type === 'arclen'
          ? [[rim, out]]                                                  // 弧长：净系由弧中点向外引出（冇半径线 — 唔好误读成 R）
          : [[ctr, rim], [rim, out]]                                      // 半径线 + 引出
      return { lines, label: out }
    }
    case 'p2l': {
      const [p] = P(c.a), [a, b] = P(c.b)
      if (!p || !a || !b) return null
      const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1
      const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2
      const foot: FPt = [a[0] + dx * t, a[1] + dy * t]  // 唔 clamp — 垂距延伸线（Fusion 同款）
      return { lines: [[p, foot]], label: mid(p, foot) }
    }
    case 'angle': {
      const [a1, a2] = P(c.a), [b1, b2] = P(c.b)
      if (!a1 || !a2 || !b1 || !b2) return null
      const m1 = mid(a1, a2), m2 = mid(b1, b2)
      return { lines: [[m1, m2]], label: mid(m1, m2) }  // v1: 两边中点连线做引导，标签喺中点
    }
  }
}

// ── 切点圆解算器（纯函数 — UI 由另一边接线）──
// 每条切线：单位法线 nᵢ、偏移 dᵢ（nᵢ·x = dᵢ）、侧别 σᵢ = sign(nᵢ·clickᵢ − dᵢ)
// （点击话畀我哋知圆喺线嘅边一侧）。相切条件：σᵢ(nᵢ·c − dᵢ) = r。
//   · 2 条线 + rFixed：2×2 线性解 (cx, cy)；平行（奇异）→ null
//   · 3 条线（rFixed 唔理）：3×3 解 (cx, cy, r) — Apollonius LLL 特例，
//     三角形内切圆/旁切圆由 σ 自动拣（点击喺内 → 内切，点击喺外 → 旁切）
// 退化（零长线 / 点击正喺线上 σ=0 / 奇异 / r ≤ 1e-9）→ null，诚实降级。
export interface TanLine { p1: Pt; p2: Pt; click: Pt }   // 直线两点 + 用户点击位（定圆喺边一侧）
export function solveTangentCircle(lines: TanLine[], rFixed?: number): { c: Pt; r: number } | null {
  // 逐条线砌带符号法线行：σn·c − r·(3线) = σd
  const N: [number, number][] = [], D: number[] = []
  for (const ln of lines) {
    const dx = ln.p2[0] - ln.p1[0], dy = ln.p2[1] - ln.p1[1]
    const L = Math.hypot(dx, dy)
    if (L < 1e-9) return null  // 两点重合 — 退化线
    const nx = -dy / L, ny = dx / L          // 单位法线
    const d = nx * ln.p1[0] + ny * ln.p1[1]  // n·x = d
    const s = Math.sign(nx * ln.click[0] + ny * ln.click[1] - d)
    if (s === 0) return null  // 点击正正喺线上 → 侧别不明，拒绝
    N.push([s * nx, s * ny]); D.push(s * d)
  }
  if (lines.length === 2) {
    // σ₁(n₁·c − d₁) = r, σ₂(n₂·c − d₂) = r → 2×2 Cramer 解 (cx, cy)
    if (rFixed == null || !(rFixed > 1e-9)) return null
    const det = N[0][0] * N[1][1] - N[0][1] * N[1][0]
    if (Math.abs(det) < 1e-12) return null  // 平行（同侧矛盾 / 异侧解唔唯一）→ 奇异
    const b0 = D[0] + rFixed, b1 = D[1] + rFixed
    return { c: [(b0 * N[1][1] - b1 * N[0][1]) / det, (N[0][0] * b1 - N[1][0] * b0) / det], r: rFixed }
  }
  if (lines.length !== 3) return null
  // 3×3 增广矩阵：[σnx, σny, −1 | σd]，未知 (cx, cy, r) — 内联高斯消元（部分选主元）
  const M: number[][] = [
    [N[0][0], N[0][1], -1, D[0]],
    [N[1][0], N[1][1], -1, D[1]],
    [N[2][0], N[2][1], -1, D[2]],
  ]
  for (let k = 0; k < 3; k++) {
    let piv = k
    for (let i = k + 1; i < 3; i++) if (Math.abs(M[i][k]) > Math.abs(M[piv][k])) piv = i
    if (Math.abs(M[piv][k]) < 1e-12) return null  // 奇异（三线平行 / 共点等退化）
    if (piv !== k) { const t = M[k]; M[k] = M[piv]; M[piv] = t }
    for (let i = k + 1; i < 3; i++) {
      const f = M[i][k] / M[k][k]
      for (let j = k; j < 4; j++) M[i][j] -= f * M[k][j]
    }
  }
  const x = [0, 0, 0]
  for (let k = 2; k >= 0; k--) {
    let s = M[k][3]
    for (let j = k + 1; j < 3; j++) s -= M[k][j] * x[j]
    x[k] = s / M[k][k]
  }
  if (!Number.isFinite(x[0]) || !Number.isFinite(x[1]) || !(x[2] > 1e-9)) return null  // r ≤ 0：呢个 σ 组合无圆
  return { c: [x[0], x[1]], r: x[2] }
}

export type FreeSolveResult = { shapes: FShape[]; dof: number; conflict: boolean; conflictIds: string[] }  // conflictIds（S194）= planegcs 报嘅冲突约束 id（=SkCon.id），UI 逐个红标俾用户拣删边个（Fusion 式）

// Solve and write the solution back into (copies of) the shapes.
// drag (to): pin the referenced POINT to the cursor (coordinate_x/y, FreeCAD-style drag solve) — the rest of
// the sketch follows its constraints in real time. Used by the select tool's point dragging.
// drag (ends)（S197）: 拖成条边/弧（Fusion 手感）— 段两端点同步 pin 到平移后目标，一次解 → 欠约束时成条边刚性跟手。
// ref.kind='edge'（poly/rect 直段、verts-poly 弧段、三点弧 chord）或 'circle'（三点弧 rim）。
// 弧另加 arc_radius 钉住当前半径：唔钉嘅话圆心只受等距约束，Newton 会沿新弦中垂线搵最近点 → 半径逐帧漂移弧变形。
export async function solveFree(shapes: FShape[], cons: SkCon[], drag?: { ref: SkRef; to: FPt } | { ref: SkRef; ends: [FPt, FPt] }): Promise<FreeSolveResult | null> {
  const prims = buildPrims(shapes, cons)
  if (!prims) return null
  if (drag && 'ends' in drag) {
    const r = drag.ref
    const sh = 'shape' in r ? shapes[r.shape] : undefined
    let ids: [string, string] | null = null
    let radPin: Constraint | null = null
    if (sh && (r.kind === 'edge' || r.kind === 'circle') && isArcPoly(sh)) {
      // 三点弧（chord 或 rim 命中都系平移成条弧）：端点 = pt 0/1 — 唔好用 (idx+1)%pts.length（pts 系密铺）
      ids = [pid((r as { shape: number }).shape, 0), pid((r as { shape: number }).shape, 1)]
      const cc = circum3(sh.arc.a, sh.arc.m, sh.arc.b)
      if (cc) radPin = { id: '_dgr', type: 'arc_radius', a_id: cid((r as { shape: number }).shape), radius: cc.r } as Constraint
    } else if (sh && r.kind === 'edge') {
      const n = sh.type === 'rect' ? 4 : ((sh as { verts?: FPt[]; pts: FPt[] }).verts ?? (sh as { pts: FPt[] }).pts).length
      ids = [pid(r.shape, r.idx), pid(r.shape, (r.idx + 1) % n)]
      const seg = arcSegOf(shapes, r)   // verts-poly 弧段 → 佢嘅 solver arc
      if (seg && isVertsPoly(sh)) radPin = { id: '_dgr', type: 'arc_radius', a_id: seg, radius: bulgeRadius(sh.verts[r.idx], sh.verts[(r.idx + 1) % sh.verts.length], sh.bulges[r.idx]) } as Constraint
    }
    if (ids && ids[0] !== ids[1]) {   // 零长段守卫：同一点钉两对 x/y = 即时假冲突
      prims.push({ id: '_dgx0', type: 'coordinate_x', p_id: ids[0], x: drag.ends[0][0] } as Constraint)
      prims.push({ id: '_dgy0', type: 'coordinate_y', p_id: ids[0], y: drag.ends[0][1] } as Constraint)
      prims.push({ id: '_dgx1', type: 'coordinate_x', p_id: ids[1], x: drag.ends[1][0] } as Constraint)
      prims.push({ id: '_dgy1', type: 'coordinate_y', p_id: ids[1], y: drag.ends[1][1] } as Constraint)
      if (radPin) prims.push(radPin)
    }
  } else if (drag) {
    const pId = refPtId(shapes, drag.ref)
    if (pId) {
      prims.push({ id: '_dgx', type: 'coordinate_x', p_id: pId, x: drag.to[0] } as Constraint)
      prims.push({ id: '_dgy', type: 'coordinate_y', p_id: pId, y: drag.to[1] } as Constraint)
    }
  }
  const res = await solveSketch(prims as SketchPrimitive[])
  const byId = new Map<string, { x?: number; y?: number; radius?: number }>()
  for (const g of res.geometry) byId.set((g as { id: string }).id, g as { x?: number; y?: number; radius?: number })
  const P = (i: number, j: number): FPt | null => { const g = byId.get(pid(i, j)); return g && g.x != null && g.y != null ? [g.x, g.y] : null }
  const out: FShape[] = shapes.map((sh, i) => {
    if (!solvable(sh)) return sh
    if (sh.type === 'circle') {
      const c = P(i, 0)
      const g = byId.get(cid(i))
      return { ...sh, c: c ?? sh.c, r: g?.radius ?? sh.r }
    }
    if (sh.type === 'rect') {
      const c0 = P(i, 0), c2 = P(i, 2)
      return c0 && c2 ? { ...sh, a: c0, b: c2 } : sh
    }
    if (isArcPoly(sh)) {
      // solved endpoints + centre/radius → new on-arc point m (kept on the same side) → resample pts
      const a = P(i, 0) ?? sh.arc.a, b = P(i, 1) ?? sh.arc.b, ctr = P(i, 2)
      const g = byId.get(cid(i)) as { radius?: number } | undefined
      if (!ctr || g?.radius == null) return sh
      const [cx, cy] = ctr, r = g.radius
      const TAU = Math.PI * 2
      const a0 = Math.atan2(a[1] - cy, a[0] - cx), a1 = Math.atan2(b[1] - cy, b[0] - cx)
      const amOld = Math.atan2(sh.arc.m[1] - cy, sh.arc.m[0] - cx)
      const ccw = ((a1 - a0 + TAU) % TAU) >= ((amOld - a0 + TAU) % TAU)  // keep the original sweep side
      const span = ccw ? (a1 - a0 + TAU) % TAU : -((a0 - a1 + TAU) % TAU)
      const tm = a0 + span / 2
      const m: FPt = [cx + r * Math.cos(tm), cy + r * Math.sin(tm)]
      return { ...sh, arc: { a, b, m }, pts: arcResample(a, b, m) }
    }
    if (isVertsPoly(sh)) {
      // solved corner verts → re-tessellate pts (the invariant: pts only ever derived from verts/bulges).
      // Arc segs (T725): the solver may change the arc's RADIUS (radius dim / tangency) — recompute each
      // bulge from the solved centre + endpoints, keeping the original sweep side (sign).
      const nv = sh.verts.map((q, j) => P(i, j) ?? q)
      const n = nv.length, TAU2 = Math.PI * 2
      const nb = sh.bulges.map((bu, j) => {
        if (Math.abs(bu || 0) < 1e-12) return bu
        const g = byId.get(paid(i, j))
        if (!g || g.x == null || g.y == null) return bu
        const a = nv[j], b = nv[(j + 1) % n]
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-9) return bu
        const a0 = Math.atan2(a[1] - g.y, a[0] - g.x), a1 = Math.atan2(b[1] - g.y, b[0] - g.x)
        // bulge>0 = CW a→b around the centre; sweep measured in that direction
        const th = bu > 0 ? (a0 - a1 + TAU2) % TAU2 : (a1 - a0 + TAU2) % TAU2
        if (th < 1e-6 || th > TAU2 - 1e-6) return bu  // degenerate solve → keep old shape
        return Math.sign(bu) * Math.tan(th / 4)
      })
      return { ...sh, verts: nv, bulges: nb, pts: pathPts(nv, nb) }
    }
    if (isSplinePoly(sh)) {
      // S103[8]：读返已解 ctrl 控制点 → 重铺 pts（保显示/布尔同步）。S127：B 样条用 sampleBSpline（逼近型），
      // Catmull-Rom 用 catmullRomClosed（插值型）— 同 store 创建时一致，否则解完会换曲线（显示≠几何）。
      const nc = sh.ctrl.map((q, j) => P(i, j) ?? q)
      const op = !!(sh as { open?: boolean }).open   // S161：开放样条曲线 → 重铺亦要开放（否则解完变闭合 = 显示≠几何）
      const pts = (sh as { bspline?: boolean }).bspline ? sampleBSpline(nc, { closed: !op, samples: 64 }) : (op ? catmullRomOpen(nc) : catmullRomClosed(nc))
      return { ...sh, ctrl: nc, pts }
    }
    return { ...sh, pts: sh.pts.map((q, j) => P(i, j) ?? q) }
  })
  // S198：展开式约束嘅衍生 prim id（collinear a/b、实体fix r、对称 a/b/c、弧中点 L/a/b）归一化返父 SkCon id（k<数字>）
  // → S194 红徽章先对得上（store resolveSk 按 skCons id 过滤）。'_px'/'ar3h0' 等内部 id 唔匹配 pattern，原样保留。
  return { shapes: out, dof: res.dof, conflict: res.conflicts.length > 0 || res.status !== 0, conflictIds: res.conflicts.map((x) => String(x).replace(/^(k\d+)[A-Za-z]$/, '$1')) }
}

// 每个 shape 嘅自由度探针枚举：点（坐标 pid）+ 半径（圆／三点弧 cid，或 verts-poly 弧段 said）。
// 抽到 module scope 方便 node 直测（solver 喺测试被 stub，probeFreeShapes 跑唔起，但探针清单系纯枚举可独立验）。
// #54 GM-L2：verts-poly 弧段半径亦系自由度 — 逐 |bulge|>eps 段补 {kind:'rad', id: said(i,j)}，否则
//   圆角矩形／槽嘅弧半径未约束时会被错判「完全约束」（pin 晒 corner 点 dof 不变）→ 欠定高亮缺失（对标 Fusion）。
//   开放路径冇闭合段（segN=n-1，同 buildPrims 一致）；零长／直段无 said prim → g0 揾唔到会喺主循环 `if(!g)continue` 安全跳过。
function shapeDofProbes(sh: FShape, i: number): { kind: 'pt' | 'rad'; id: string }[] {
  if (!solvable(sh)) return []
  const out: { kind: 'pt' | 'rad'; id: string }[] = []
  if (sh.type === 'circle') { out.push({ kind: 'pt', id: pid(i, 0) }); if (!sh.point) out.push({ kind: 'rad', id: cid(i) }) }
  else if (isArcPoly(sh)) { for (let j = 0; j < 3; j++) out.push({ kind: 'pt', id: pid(i, j) }); out.push({ kind: 'rad', id: cid(i) }) }
  else if (isSplinePoly(sh)) { for (let j = 0; j < sh.ctrl.length; j++) out.push({ kind: 'pt', id: pid(i, j) }) }  // S103[8]：样条只探 ctrl 控制点（唔好读 48 密铺 pts 烧爆探针上限）
  else {
    const n = sh.type === 'rect' ? 4 : (sh.verts ?? sh.pts).length
    for (let j = 0; j < n; j++) out.push({ kind: 'pt', id: pid(i, j) })
    if (isVertsPoly(sh)) {  // #54：弧段半径 DOF 探针（said），同 buildPrims 生成条件一致（|bulge|>eps 段）
      const segN = sh.open ? sh.verts.length - 1 : sh.verts.length
      for (let j = 0; j < segN; j++) if (Math.abs(sh.bulges[j] || 0) > 1e-12) out.push({ kind: 'rad', id: said(i, j) })
    }
  }
  return out
}

// S103[7]：逐实体「欠定诊断」DOF 探针（对标 Fusion under-defined highlight）。求解后，对每个可解 shape 嘅
// 每个自由度（点坐标 + 圆/弧半径）逐个 pin 住重解：若全图 dof 跌 → 该 shape 本来仲有自由度 → 标【欠定】。
// pin 机制同拖拽求解一致（coordinate_x/y），已证稳定；redundant（已被间接定死）pin 唔会跌 dof 亦唔 conflict。
// 半径探针（circle_radius/arc_radius）系审查员要求 — 否则「定咗圆心、半径自由」嘅圆会被错判全约束（pin 圆心 dof 不变）。
// 纯加法、只读：唔改 shapes/solve 主路。只喺 resolveSk（松手/加约束后）跑一次，唔入 dragMove 热路径。
export async function probeFreeShapes(shapes: FShape[], cons: SkCon[]): Promise<Set<number>> {
  const free = new Set<number>()
  const base = buildPrims(shapes, cons)
  if (!base) return free
  const r0 = await solveSketch(base as SketchPrimitive[])
  if (r0.conflicts.length || r0.status !== 0 || r0.dof <= 0) return free  // 冲突 / 全约束 → 无欠定标（全黑）
  const g0 = new Map<string, { x?: number; y?: number; radius?: number }>()
  for (const g of r0.geometry) g0.set((g as { id: string }).id, g as { x?: number; y?: number; radius?: number })
  let probes = 0
  for (let i = 0; i < shapes.length; i++) {
    if (free.has(i)) continue
    for (const pr of shapeDofProbes(shapes[i], i)) {
      if (probes++ > 80) return free   // 守卫：超大草图唔逐个探（防卡顿）
      const g = g0.get(pr.id); if (!g) continue
      const extra: Constraint[] = []
      if (pr.kind === 'pt') {
        if (g.x == null || g.y == null) continue
        extra.push({ id: '_px', type: 'coordinate_x', p_id: pr.id, x: g.x } as Constraint)
        extra.push({ id: '_py', type: 'coordinate_y', p_id: pr.id, y: g.y } as Constraint)
      } else {
        if (g.radius == null) continue
        extra.push(shapes[i].type === 'circle'
          ? { id: '_pr', type: 'circle_radius', c_id: pr.id, radius: g.radius } as Constraint
          : { id: '_pr', type: 'arc_radius', a_id: pr.id, radius: g.radius } as Constraint)
      }
      const r1 = await solveSketch([...base, ...extra] as SketchPrimitive[])
      if (r1.status === 0 && r1.dof < r0.dof) { free.add(i); break }   // pin 后 dof 跌 → 本来自由
    }
  }
  return free
}

// Validation for the constraint buttons: what does this constraint need?
export const SK_CON_REQ: Record<SkConType, string> = {
  h: '选 1 条边 或 2 个点', v: '选 1 条边 或 2 个点', coincident: '选 2 个点（或 点+边）',
  parallel: '选 2 条边', perp: '选 2 条边', equal: '选 2 条边 / 2 个圆 / 2 段圆弧（等半径）', tangent: '选 1 边 + 1 圆/圆弧段 或 2 个圆', fix: '选 1 个点 / 1 条边 / 1 个圆·弧（整体钉死）',
  midpoint: '选 1 个点 + 1 条边或弧（点锁到边/弧中点）', concentric: '选 2 个圆（或 圆+弧段，如孔同心于槽端帽）', collinear: '选 2 条边（成同一直线）', symmetric: '选 2 个点 / 2 条边 / 2 个圆·弧 + 1 条轴边',
}
// shapes (optional) lets the check recognise verts-poly ARC SEGMENT edges (circle-like for
// tangent/equal/concentric). Without shapes the kind-only behaviour is unchanged.
export function conApplicable(t: SkConType, sel: SkRef[], shapes?: FShape[]): boolean {
  const [a, b, c] = sel
  if (!a) return false
  const isPt = (r?: SkRef) => r?.kind === 'pt' || r?.kind === 'origin' || r?.kind === 'refpt', isE = (r?: SkRef) => r?.kind === 'edge' || r?.kind === 'refedge'
  const isArcSeg = (r?: SkRef) => !!shapes && !!r && r.kind === 'edge' && !!arcSegOf(shapes, r)
  const isC = (r?: SkRef) => r?.kind === 'circle' || isArcSeg(r)
  const isSE = (r?: SkRef) => isE(r) && !isArcSeg(r)   // 直线边（refedge 实体直边亦计）。弧段 edge 喺 refLineId 只得「弦线」id → coincident/parallel/perp/collinear/midpoint 会静默锁去弦而非弧 → 喺呢度拒绝（弧请用 tangent/concentric/equal）
  switch (t) {
    case 'h': case 'v': return (isSE(a) && !b) || (isPt(a) && isPt(b) && !c)
    case 'coincident': return ((isPt(a) && isPt(b)) || (isPt(a) && isSE(b)) || (isSE(a) && isPt(b))) && !c
    case 'parallel': case 'perp': case 'collinear': return isSE(a) && isSE(b) && !c
    case 'equal': return ((isSE(a) && isSE(b)) || (isC(a) && isC(b))) && !c
    case 'tangent': return ((isE(a) && isC(b)) || (isC(a) && isE(b)) || (isC(a) && isC(b))) && !c
    case 'fix': return (isPt(a) || a.kind === 'edge' || a.kind === 'circle') && !b   // S198 实体级：成条边/圆/弧都得（refedge/refpt 本身固定，唔收）
    case 'midpoint': {
      // 点 + 直边/参考边（弦中点原有）或 点 + 弧（弧段 / 三点弧 rim·弦 — 真弧中点）；整圆冇中点照拒
      const isArc = (r?: SkRef) => isArcSeg(r) || (!!shapes && !!r && (r.kind === 'circle' || r.kind === 'edge') && !!shapes[(r as { shape: number }).shape] && isArcPoly(shapes[(r as { shape: number }).shape]))
      const tgt = (r?: SkRef) => isE(r) || isArc(r)
      return ((isPt(a) && tgt(b)) || (tgt(a) && isPt(b))) && !c
    }
    case 'concentric': return isC(a) && isC(b) && !c
    case 'symmetric': {
      // S198：2 点 / 2 条直边 / 2 个圆·弧 ＋ 轴（第 3 选，直边）— 实体级对称
      const chord = (r?: SkRef) => !!shapes && r?.kind === 'edge' && !!shapes[r.shape] && isArcPoly(shapes[r.shape])
      const isStr = (r?: SkRef) => isSE(r) && !chord(r)
      const isCC = (r?: SkRef) => isC(r) || chord(r)
      return ((isPt(a) && isPt(b)) || (isStr(a) && isStr(b)) || (isCC(a) && isCC(b))) && isSE(c)
    }
  }
}

// ------------------------------------------------------------------ 测试钩子
// （同 voxelfea/moldflow 嘅 _internals 模式一致 — node 测试直接验 buildPrims / shapeDofProbes 输出，签名不变）
export const _internals = { buildPrims, shapeDofProbes }
