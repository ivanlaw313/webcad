// M3 重建整合器（Mesh→B-rep 逆向工程，_mesh2brep_plan.md Phase A / M3）—— 2026-07-25
// ════════════════════════════════════════════════════════════════════════════════════════════
// 呢个模块系 M1（识别：segmentAndFit）同 M2（内核：OC.FitWrapper）之间嘅【唯一桥】：
//   SegmentationResult ──planRebuild()──> RebuildPlan（纯数据：每张面点样起 + 边界环点样裁）
//   RebuildPlan + OC   ──executePlan()──> TopoDS 实体/壳 + tier + 偏差报告
//
// 点解要分「plan」同「execute」两层：
//  ① plan 全纯（零 OC、零 DOM）→ Node 直接跑得、可 snapshot 可 diff，UI 亦可以喺唔开内核嘅情况下
//     预览「会起几多张面、边界系圆定多边形」；
//  ② execute 一段过喂内核，所有内核返回值即刻 IsNull() 检查 —— M2 合约系「坏输入返 null 唔抛」，
//     所以唔查 null 会静静地拎住烂 shape，最后喺 tessellate 度爆唔可 catch 嘅 wasm abort。
//
// ★ 五条硬教训（全部由 M2 探针 + 本模块自跑实证，改嘢前睇清楚）★
//  1. MakeAnalyticFace 一定要传 refX（平面/柱/锥）—— 唔传嘅话 uvBounds 嘅方向系内核自己拣，
//     裁出嚟嘅面会喺意想不到嘅方位。柱/锥用 M1 嘅 refU，平面用本模块 planeFrame() 嘅确定性 X。
//  2. 平面【冇裁环】就要精确 uv（唔可以加 margin）：多出嗰截面会伸出邻面之外 → 缝合直接 null。
//     本模块永远「大 uv host + TrimFaceByLoop 裁到啱」，所以 host 加 margin 反而系安全嘅。
//  3. 一次 TrimFaceByLoop 只做一条 wire —— 带孔面要 BRepBuilderAPI_MakeFace_22(face, holeWire)，
//     而且 holeWire 要【反向】(Reversed) 先当孔；唔反向嘅话面积会变成 outer+hole（实测 2201 vs 1798）。
//  4. 【单张自然闭合面】（整球/整环面）SewSolidify 会返 null（Sewing 唔当一张面系壳）→ 要行
//     TopoDS_Builder.MakeShell + BRepBuilderAPI_MakeSolid 嘅后备路。
//  5. 圆边界一定要用【解析圆】(gp_Circ) 而唔系镶嵌折线：96 边形盖比真圆细 0.32%，唔止过唔到
//     0.05% 体积闸，仲会同解析柱面嘅接缝差 sagitta（r=10 时 0.048mm）→ 缝合失败。
//     圆嘅半径/圆心优先由【邻区解析参数】攞（同一组数 → 两边接缝逐位相等，缝隙 = 0）。
//
// 零依赖（除咗 M1 嘅型别）、零 DOM → worker / Node 直接跑。
// 验收：tests/mesh2brep-golden.mjs（7 件 golden STL → tier/面数/体积/偏差）。

import type { SegmentationResult, FittedRegion, PrimitiveKind, PrimitiveParams } from './primitiveFit.ts'
import type { Vec3 } from './meshSegment.ts'

/* eslint-disable @typescript-eslint/no-explicit-any */
/** OCCT wasm 模块（replicad-opencascadejs 出嚟嗰个）。内核冇型别宣告，照 worker 惯例用 any。 */
export type OCModule = any
/** TopoDS_Shape / TopoDS_Face / TopoDS_Wire 嘅 handle。 */
export type OCShape = any
/* eslint-enable @typescript-eslint/no-explicit-any */

// ═══════════════════════════════════ 输出合约 ═══════════════════════════════════

export type RebuildTier = 'solid' | 'shell' | 'failed'

/** MakeAnalyticFace 嘅 kind 编码（M2 合约：0=plane 1=cylinder 2=sphere 3=cone 4=torus）。 */
export const ANALYTIC_KIND: Record<string, number> = { plane: 0, cylinder: 1, sphere: 2, cone: 3, torus: 4 }

/** 边界环计划：圆 = 解析圆（gp_Circ），polygon = 折线（TrimFaceByLoop / 折线 wire）。 */
export interface LoopPlan {
  kind: 'circle' | 'polygon'
  isOuter: boolean
  /** 折线点（扁平 xyz，首尾唔重复，隐式闭合）。circle 时系原始环点（只作参考/偏差用）。 */
  pts: number[]
  /** kind==='circle' 时嘅解析圆。 */
  circle?: { centre: Vec3; normal: Vec3; radius: number }
  /** 环喺面参数平面上嘅有向面积绝对值（拣外环用）。 */
  area: number
  /** 环对面嗰个 group（-1 = 冇邻区，通常系网格本身唔水密）。 */
  neighbour: number
  /** 圆参数嘅来源：'neighbour' = 由邻区解析面攞（最准），'fit' = 环点最小二乘。 */
  circleSource?: 'neighbour' | 'fit'
}

/** 一张面嘅起法。 */
export interface FacePlan {
  group: number
  kind: PrimitiveKind
  /** 'analytic' = MakeAnalyticFace，'discWire' = 圆环 wire 直接起平面盘，'bspline' = FitBSplineFace，'skip' = 起唔到 */
  build: 'analytic' | 'discWire' | 'bspline' | 'skip'
  /** MakeAnalyticFace 嘅 params（已经照 M2 合约排好）。 */
  params: number[]
  /** MakeAnalyticFace 嘅 uvBounds（[] = 自然界）。 */
  uvBounds: number[]
  /** 面系咪自然闭合（整球/整环面）→ 缝唔到就行 MakeSolid 后备。 */
  naturalClosed: boolean
  loops: LoopPlan[]
  regions: number[]
  triCount: number
  area: number
  /** bspline 用：resample 网格 + 维度。 */
  grid?: { pts: number[]; nu: number; nv: number }
  note: string
}

export interface RebuildPlan {
  faces: FacePlan[]
  /** 起唔到面嘅 group（freeform 拟合失败等）→ 拖低 tier。 */
  skipped: number[]
  sewTol: number
  diag: number
  warnings: string[]
  stats: { groups: number; coalesced: number; absorbed: number; circleLoops: number; rectifiedLoops: number }
}

export interface RebuildResult {
  shape: OCShape | null
  tier: RebuildTier
  faceCount: number
  deviation: { max: number; mean: number; samples: number }
  warnings: string[]
  plan: RebuildPlan
  /** BRepCheck_Analyzer 结果（null = 冇查到）。 */
  valid: boolean | null
  msPlan: number
  msBuild: number
}

export interface RebuildOptions {
  /** 缝合容差。默认 max(diag*1e-6, 1e-6)。 */
  sewTol?: number
  /** 平面 host 面 uv 界嘅相对 margin（一定会再裁环，所以放大系安全嘅）。默认 0.02。 */
  uvMargin?: number
  /** 合并「同一张解析面」嘅相邻区（M1 因法向翻转等原因可能合唔到）。默认 true。 */
  coalesce?: boolean
  /** 收编贴喺已识别面上嘅碎区/freeform（例如球嘅极点扇）。默认 true。 */
  absorb?: boolean
  /** 收编距离容差。默认 max(diag*2e-3, 1e-6)。 */
  absorbTol?: number
  /** 平面环整形（共线合并 + 短弦复原角点）。默认 true。 */
  rectifyLoops?: boolean
  /** 共线判据（垂距）。默认 diag*1e-6 —— 一定要细过真曲线嘅 sagitta，否则会拉直圆环。 */
  collinearTol?: number
  /** 短弦复原：弦长要细过邻边嘅呢个比例先郁。默认 0.2。 */
  rectifyShortFrac?: number
  /** 圆识别：环点到擬合圆嘅最大残差（相对 diag）。默认 2e-4。 */
  circleTolFrac?: number
  /** freeform 试 FitBSplineFace。默认 true（起完会用 DeviationSample 复核，唔过就丢）。 */
  bsplineFreeform?: boolean
  /** 偏差取样点数。默认 500（M2 实测 500 点 ~25ms）。 */
  deviationSamples?: number
  /**
   * 偏差逐面量（取各面最小值）。默认 'auto' = 面数 ≤ 32 时逐面。
   * 点解要咁：整个 shape 一次过量嘅时候，BRepExtrema 喺【锥面】上会收敛落错嘅局部极值 ——
   * 实测 cone_r12_h30 底圆上有 8 个点报 22.283mm（= 2r·cos(半角)，即量咗对面嗰条母线），
   * 而实际距离系 0。逐面量再取 min 就返 1.9e-13。呢个系内核侧（M2 DeviationSample）嘅已知限制。
   */
  deviationPerFace?: 'auto' | boolean
  /**
   * 计划面数上限（超过就唔入内核，直接 failed）。默认 4000。
   * 保险丝：M1 喺重噪声扫描件上会碎成「每三角一区」（实测 ±0.15mm 噪声嘅球 → 12320 区），
   * 咁样逐张起面 + 缝合要 5.4s 先返 failed，worker 会当机咁滞。上层收到 failed 应该即刻退
   * faceted 路径。
   */
  maxFaces?: number
}

// ═══════════════════════════════════ 向量小工具 ═══════════════════════════════════

const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const mul3 = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
const len3 = (a: Vec3): number => Math.hypot(a[0], a[1], a[2])
const norm3 = (a: Vec3): Vec3 => { const L = len3(a) || 1; return [a[0] / L, a[1] / L, a[2] / L] }

/** 由法向起一个确定性正交基（同一个法向永远出同一个 X）—— refX 唔确定嘅话 uv 界会飘。 */
function planeFrame(n: Vec3): { x: Vec3; y: Vec3 } {
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2])
  const seed: Vec3 = ax <= ay && ax <= az ? [1, 0, 0] : ay <= az ? [0, 1, 0] : [0, 0, 1]
  const x = norm3(cross3(n, seed))
  return { x, y: norm3(cross3(n, x)) }
}

/** 点到已识别解析面嘅距离（收编判据用）。 */
function surfDist(p: Vec3, prm: PrimitiveParams): number {
  switch (prm.kind) {
    case 'plane': return Math.abs(dot3(prm.normal, p) - prm.d)
    case 'sphere': return Math.abs(len3(sub3(p, prm.centre)) - prm.radius)
    case 'cylinder': {
      const w = sub3(p, prm.point), a = dot3(w, prm.axis)
      return Math.abs(len3(sub3(w, mul3(prm.axis, a))) - prm.radius)
    }
    case 'cone': {
      const w = sub3(p, prm.apex), a = dot3(w, prm.axis)
      const rad = len3(sub3(w, mul3(prm.axis, a)))
      const h = prm.halfAngleDeg * Math.PI / 180
      return Math.abs(rad * Math.cos(h) - a * Math.sin(h))
    }
    case 'torus': {
      const w = sub3(p, prm.centre), a = dot3(w, prm.axis)
      const rad = len3(sub3(w, mul3(prm.axis, a)))
      return Math.abs(Math.hypot(rad - prm.majorRadius, a) - prm.minorRadius)
    }
    default: return Infinity
  }
}

/** 两个区系咪同一张解析面。★平面【唔理法向符号】★ —— STL 三角缠绕唔一致（golden box_with_hole
 *  嘅盖就系咁）会令共面三角擬出 ±n 两种，M1 嘅 sameSurface 用有向夹角就合唔埋。呢度只喺
 *  「网格上相邻」嘅前提下做无向比对，风险（零厚度片两面）实务上唔存在。 */
function sameSurfaceLoose(a: PrimitiveParams, b: PrimitiveParams, eps: number): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'plane' && b.kind === 'plane') {
    const cosang = dot3(a.normal, b.normal)
    if (Math.abs(cosang) < 0.999) return false
    const db = cosang > 0 ? b.d : -b.d
    return Math.abs(a.d - db) <= eps * 2
  }
  if (a.kind === 'cylinder' && b.kind === 'cylinder') {
    if (Math.abs(dot3(a.axis, b.axis)) < 0.999) return false
    if (Math.abs(a.radius - b.radius) > Math.max(eps * 2, a.radius * 0.02)) return false
    const w = sub3(b.point, a.point)
    const perp = len3(sub3(w, mul3(a.axis, dot3(w, a.axis))))
    return perp <= Math.max(eps * 2, a.radius * 0.02)
  }
  if (a.kind === 'sphere' && b.kind === 'sphere')
    return len3(sub3(a.centre, b.centre)) <= eps * 2 && Math.abs(a.radius - b.radius) <= Math.max(eps * 2, a.radius * 0.02)
  if (a.kind === 'cone' && b.kind === 'cone')
    return Math.abs(dot3(a.axis, b.axis)) > 0.999 && Math.abs(a.halfAngleDeg - b.halfAngleDeg) <= 1 && len3(sub3(a.apex, b.apex)) <= Math.max(eps * 4, 0.02 * (Math.abs(a.hMax) + 1))
  if (a.kind === 'torus' && b.kind === 'torus')
    return Math.abs(dot3(a.axis, b.axis)) > 0.999 && Math.abs(a.majorRadius - b.majorRadius) <= Math.max(eps * 2, a.majorRadius * 0.02)
      && Math.abs(a.minorRadius - b.minorRadius) <= Math.max(eps * 2, a.minorRadius * 0.05) && len3(sub3(a.centre, b.centre)) <= eps * 4
  return false
}

// ═══════════════════════════════════ 分组（coalesce + absorb）═══════════════════════════════════

interface Group {
  id: number
  kind: PrimitiveKind
  params: PrimitiveParams
  regions: number[]
  tris: number[]        // 三角序号（索引 seg.tris / 3）
  area: number
  absorbed: number      // 收编咗几多个碎区
  coalesced: boolean    // 系咪由多过一个 M1 区合成
}

function buildGroups(seg: SegmentationResult, eps: number, opts: RebuildOptions, warnings: string[]): Group[] {
  const R = seg.regions
  const n = R.length
  const parent = new Int32Array(n)
  for (let i = 0; i < n; i++) parent[i] = i
  const find = (x: number): number => { let r = x; while (parent[r] !== r) r = parent[r]; while (parent[x] !== r) { const nx = parent[x]; parent[x] = r; x = nx } return r }

  // ① 同面合并：只沿网格邻接走（唔可以夹硬合唔相邻嘅共面区 —— B-rep 入面佢哋本来就系两张面）
  if (opts.coalesce ?? true) {
    for (const [a, b] of seg.adjacency) {
      if (R[a].kind === 'freeform' || R[b].kind === 'freeform') continue
      if (!sameSurfaceLoose(R[a].paramsSnapped, R[b].paramsSnapped, eps)) continue
      const ra = find(a), rb = find(b)
      if (ra !== rb) parent[rb] = ra
    }
  }

  // 组员整理：代表 = 面积最大嗰个区（佢嘅擬合最可信）
  const members = new Map<number, number[]>()
  for (let i = 0; i < n; i++) {
    const r = find(i)
    const arr = members.get(r)
    if (arr) arr.push(i); else members.set(r, [i])
  }
  const groups: Group[] = []
  const regionGroup = new Int32Array(n).fill(-1)
  for (const [, mem] of members) {
    let best = mem[0]
    for (const m of mem) if (R[m].area > R[best].area) best = m
    if (R[best].kind === 'freeform') continue      // 纯 freeform 组留返落面 absorb / bspline 处理
    const g: Group = {
      id: groups.length, kind: R[best].kind, params: R[best].paramsSnapped,
      regions: mem.slice(), tris: [], area: 0, absorbed: 0, coalesced: mem.length > 1,
    }
    for (const m of mem) { regionGroup[m] = g.id; g.area += R[m].area }
    groups.push(g)
  }

  // ② 收编：贴喺已识别面上嘅碎区（球极点扇 / 病态细区 / freeform）—— 佢哋本来就係同一张面嘅一部分，
  //    唔收编嘅话个面会留住个窿，缝极都缝唔埋。判据 = 区【所有】顶点到该面嘅距离 ≤ absorbTol。
  const absorbTol = opts.absorbTol ?? Math.max(seg.diag * 2e-3, 1e-6)
  if (opts.absorb ?? true) {
    const adjOf = new Map<number, Set<number>>()
    for (const [a, b] of seg.adjacency) {
      if (!adjOf.has(a)) adjOf.set(a, new Set())
      if (!adjOf.has(b)) adjOf.set(b, new Set())
      adjOf.get(a)!.add(b); adjOf.get(b)!.add(a)
    }
    for (let pass = 0; pass < 3; pass++) {
      let moved = 0
      for (let i = 0; i < n; i++) {
        if (regionGroup[i] >= 0) continue
        const cand = new Set<number>()
        for (const j of adjOf.get(i) ?? []) if (regionGroup[j] >= 0) cand.add(regionGroup[j])
        let bestG = -1, bestD = Infinity
        for (const gi of cand) {
          const d = maxVertDist(seg, R[i], groups[gi].params)
          if (d < bestD) { bestD = d; bestG = gi }
        }
        if (bestG >= 0 && bestD <= absorbTol) {
          regionGroup[i] = bestG
          groups[bestG].regions.push(i)
          groups[bestG].area += R[i].area
          groups[bestG].absorbed++
          moved++
        }
      }
      if (!moved) break
    }
  }

  // ③ 收唔到嘅区自成一组（freeform → 试 bspline；其余 → 照自己嘅擬合起面）
  for (let i = 0; i < n; i++) {
    if (regionGroup[i] >= 0) continue
    const g: Group = {
      id: groups.length, kind: R[i].kind, params: R[i].paramsSnapped,
      regions: [i], tris: [], area: R[i].area, absorbed: 0, coalesced: false,
    }
    regionGroup[i] = g.id
    groups.push(g)
    if (R[i].kind !== 'freeform') warnings.push(`区 ${i}（${R[i].kind}, 面积 ${R[i].area.toFixed(2)}）孤立成面`)
  }

  // 三角归组
  for (let t = 0; t < seg.labels.length; t++) {
    const gi = regionGroup[seg.labels[t]]
    if (gi >= 0) groups[gi].tris.push(t)
  }
  return groups
}

/** 区顶点到某解析面嘅最大距离（收编判据）。 */
function maxVertDist(seg: SegmentationResult, r: FittedRegion, prm: PrimitiveParams): number {
  let mx = 0
  const seen = new Set<number>()
  for (const t of r.triIndices) {
    for (let k = 0; k < 3; k++) {
      const vi = seg.tris[t * 3 + k]
      if (seen.has(vi)) continue
      seen.add(vi)
      const p: Vec3 = [seg.verts[vi * 3], seg.verts[vi * 3 + 1], seg.verts[vi * 3 + 2]]
      const d = surfDist(p, prm)
      if (d > mx) mx = d
      if (mx === Infinity) return mx
    }
  }
  return mx
}

// ═══════════════════════════════════ 边界环 ═══════════════════════════════════

const edgeKey = (a: number, b: number, nv: number): number => (a < b ? a * nv + b : b * nv + a)

/** 由一堆三角重砌边界环（只用一次嘅无向边 = 边界）。合并组一定要重砌 —— M1 嘅 boundaryLoops
 *  系【逐区】嘅，合完之后内部边界要消失。缠绕唔一致都冇所谓：无向计数照样啱。 */
function loopsFromTris(seg: SegmentationResult, tris: number[]): Uint32Array[] {
  const nv = seg.verts.length / 3
  const count = new Map<number, number>()
  const store = new Map<number, [number, number]>()
  for (const t of tris) {
    for (let k = 0; k < 3; k++) {
      const a = seg.tris[t * 3 + k], b = seg.tris[t * 3 + (k + 1) % 3]
      if (a === b) continue
      const key = edgeKey(a, b, nv)
      count.set(key, (count.get(key) ?? 0) + 1)
      if (!store.has(key)) store.set(key, [a, b])
    }
  }
  const adj = new Map<number, number[]>()
  for (const [key, c] of count) {
    if (c !== 1) continue
    const [a, b] = store.get(key)!
    if (!adj.has(a)) adj.set(a, [])
    if (!adj.has(b)) adj.set(b, [])
    adj.get(a)!.push(b); adj.get(b)!.push(a)
  }
  const used = new Set<number>()
  const loops: Uint32Array[] = []
  for (const start of adj.keys()) {
    if ((adj.get(start) ?? []).every((nb) => used.has(edgeKey(start, nb, nv)))) continue
    const chain: number[] = [start]
    let cur = start, prev = -1
    for (let guard = 0; guard < count.size + 4; guard++) {
      const nbs = adj.get(cur) ?? []
      let nxt = -1
      for (const nb of nbs) {
        if (nb === prev && nbs.length > 1) continue
        if (used.has(edgeKey(cur, nb, nv))) continue
        nxt = nb; break
      }
      if (nxt < 0) break
      used.add(edgeKey(cur, nxt, nv))
      if (nxt === start) break
      chain.push(nxt)
      prev = cur; cur = nxt
    }
    if (chain.length >= 3) loops.push(Uint32Array.from(chain))
  }
  return loops
}

/** 边 → 相邻三角（搵环对面嗰张面用）。 */
function buildEdgeTris(seg: SegmentationResult): Map<number, number[]> {
  const nv = seg.verts.length / 3
  const m = new Map<number, number[]>()
  const nt = seg.tris.length / 3
  for (let t = 0; t < nt; t++) {
    for (let k = 0; k < 3; k++) {
      const a = seg.tris[t * 3 + k], b = seg.tris[t * 3 + (k + 1) % 3]
      if (a === b) continue
      const key = edgeKey(a, b, nv)
      const arr = m.get(key)
      if (arr) arr.push(t); else m.set(key, [t])
    }
  }
  return m
}

// ═══════════════════════════════════ 环整形 / 圆识别 ═══════════════════════════════════

interface Pt2 { u: number; v: number }

/** 环点投影到面参数平面。 */
function project(seg: SegmentationResult, loop: ArrayLike<number>, o: Vec3, x: Vec3, y: Vec3): Pt2[] {
  const out: Pt2[] = []
  for (let i = 0; i < loop.length; i++) {
    const vi = loop[i]
    const p: Vec3 = [seg.verts[vi * 3] - o[0], seg.verts[vi * 3 + 1] - o[1], seg.verts[vi * 3 + 2] - o[2]]
    out.push({ u: dot3(p, x), v: dot3(p, y) })
  }
  return out
}

const signedArea2 = (p: Pt2[]): number => {
  let s = 0
  for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; s += p[i].u * q.v - q.u * p[i].v }
  return s / 2
}

/** 最小二乘圆（代数解已经够：镶嵌顶点系【精确落喺真圆上】嘅，唔使 LM）。 */
function fitCircle2(p: Pt2[]): { cu: number; cv: number; r: number; maxRes: number } | null {
  const n = p.length
  if (n < 5) return null
  let Suu = 0, Suv = 0, Svv = 0, Suuu = 0, Svvv = 0, Suvv = 0, Svuu = 0, mu = 0, mv = 0
  for (const q of p) { mu += q.u; mv += q.v }
  mu /= n; mv /= n
  for (const q of p) {
    const u = q.u - mu, v = q.v - mv
    Suu += u * u; Svv += v * v; Suv += u * v
    Suuu += u * u * u; Svvv += v * v * v; Suvv += u * v * v; Svuu += v * u * u
  }
  const det = Suu * Svv - Suv * Suv
  if (Math.abs(det) < 1e-12) return null
  const b1 = (Suuu + Suvv) / 2, b2 = (Svvv + Svuu) / 2
  const cu = (b1 * Svv - b2 * Suv) / det
  const cv = (b2 * Suu - b1 * Suv) / det
  let r = 0
  for (const q of p) r += Math.hypot(q.u - mu - cu, q.v - mv - cv)
  r /= n
  let maxRes = 0
  for (const q of p) maxRes = Math.max(maxRes, Math.abs(Math.hypot(q.u - mu - cu, q.v - mv - cv) - r))
  return { cu: cu + mu, cv: cv + mv, r, maxRes }
}

/** 环系咪覆盖成个圆（角度要连续铺满 2π，唔可以得半边）。 */
function fullCircleCoverage(p: Pt2[], cu: number, cv: number): boolean {
  const ang = p.map((q) => Math.atan2(q.v - cv, q.u - cu)).sort((a, b) => a - b)
  for (let i = 0; i < ang.length; i++) {
    const gap = (i === ang.length - 1 ? ang[0] + Math.PI * 2 : ang[i + 1]) - ang[i]
    if (gap > Math.PI / 3) return false
  }
  return true
}

/**
 * 平面环整形：① 拉走共线中间点 ② 短弦复原角点。
 * 点解要做②：CAD 出身 STL 嘅面片有时会喺角位切一刀（golden box_with_hole 嘅盖就系咁 —— 外框
 * 用周长等分取样，取唔中角），个盖细过真面 0.04%，仲同侧墙嘅精确矩形边对唔上 → 缝合必失败。
 * 安全闸：只准郁【冇同其他环共用】嘅短弦（真倒角嘅边一定同倒角面嘅环共用，咁就唔会被拉直）。
 */
function rectifyPolygon(pts: Pt2[], ids: number[], shared: Set<number>, nv: number, collinearTol: number, shortFrac: number): { pts: Pt2[]; ids: number[]; changed: boolean } {
  let P = pts.slice(), I = ids.slice(), changed = false
  // ① 共线合并（几何保持：垂距 ≤ collinearTol）
  for (let guard = 0; guard < 4 && P.length > 3; guard++) {
    const keep: boolean[] = P.map(() => true)
    let removed = 0
    for (let i = 0; i < P.length; i++) {
      const a = P[(i - 1 + P.length) % P.length], b = P[i], c = P[(i + 1) % P.length]
      if (!keep[(i - 1 + P.length) % P.length]) continue
      const ax = c.u - a.u, ay = c.v - a.v
      const L = Math.hypot(ax, ay)
      if (L < 1e-12) continue
      const d = Math.abs((b.u - a.u) * ay - (b.v - a.v) * ax) / L
      if (d <= collinearTol) { keep[i] = false; removed++ }
    }
    if (!removed) break
    P = P.filter((_, i) => keep[i]); I = I.filter((_, i) => keep[i])
    changed = true
  }
  // ② 短弦复原：邻两条边延长求交，交点顶走成条短弦
  for (let guard = 0; guard < 8 && P.length > 4; guard++) {
    let best = -1, bestLen = Infinity
    for (let i = 0; i < P.length; i++) {
      const j = (i + 1) % P.length
      const h = (i - 1 + P.length) % P.length, k = (j + 1) % P.length
      const eLen = Math.hypot(P[j].u - P[i].u, P[j].v - P[i].v)
      const prevLen = Math.hypot(P[i].u - P[h].u, P[i].v - P[h].v)
      const nextLen = Math.hypot(P[k].u - P[j].u, P[k].v - P[j].v)
      if (eLen > shortFrac * Math.min(prevLen, nextLen)) continue
      if (shared.has(edgeKey(I[i], I[j], nv))) continue      // ★ 同邻面共用嘅边 = 真特征，唔准郁
      const d1 = { u: P[i].u - P[h].u, v: P[i].v - P[h].v }
      const d2 = { u: P[k].u - P[j].u, v: P[k].v - P[j].v }
      const den = d1.u * d2.v - d1.v * d2.u
      if (Math.abs(den) < 1e-9) continue
      const cosang = (d1.u * d2.u + d1.v * d2.v) / (Math.hypot(d1.u, d1.v) * Math.hypot(d2.u, d2.v) || 1)
      if (Math.abs(cosang) > 0.966) continue                 // 夹角 <15° → 唔係角点，唔郁
      if (eLen < bestLen) { bestLen = eLen; best = i }
    }
    if (best < 0) break
    const i = best, j = (best + 1) % P.length
    const h = (i - 1 + P.length) % P.length, k = (j + 1) % P.length
    const d1 = { u: P[i].u - P[h].u, v: P[i].v - P[h].v }
    const d2 = { u: P[k].u - P[j].u, v: P[k].v - P[j].v }
    const den = d1.u * d2.v - d1.v * d2.u
    const t = ((P[j].u - P[i].u) * d2.v - (P[j].v - P[i].v) * d2.u) / den
    const ix = { u: P[i].u + d1.u * t, v: P[i].v + d1.v * t }
    // 交点要喺俾拉走嗰条弦附近（唔係就係误判）
    const shift = Math.max(Math.hypot(ix.u - P[i].u, ix.v - P[i].v), Math.hypot(ix.u - P[j].u, ix.v - P[j].v))
    if (shift > bestLen * 2) break
    const nP: Pt2[] = [], nI: number[] = []
    for (let q = 0; q < P.length; q++) {
      if (q === j) continue
      if (q === i) { nP.push(ix); nI.push(-1) } else { nP.push(P[q]); nI.push(I[q]) }
    }
    P = nP; I = nI; changed = true
  }
  return { pts: P, ids: I, changed }
}

// ═══════════════════════════════════ planRebuild ═══════════════════════════════════

/**
 * SegmentationResult → 起面计划（纯数据、零内核）。
 * 呢步做晒所有【几何判断】：分组、边界环、圆识别、uv 界、邻面接缝对齐。
 */
export function planRebuild(seg: SegmentationResult, opts: RebuildOptions = {}): RebuildPlan {
  const t0 = performance.now()
  const warnings: string[] = []
  const diag = seg.diag || 1
  const eps = diag * 1e-3
  const sewTol = opts.sewTol ?? Math.max(diag * 1e-6, 1e-6)
  const uvMargin = opts.uvMargin ?? 0.02
  const circleTol = (opts.circleTolFrac ?? 2e-4) * diag
  const collinearTol = opts.collinearTol ?? diag * 1e-6
  const nv = seg.verts.length / 3

  const groups = buildGroups(seg, eps, opts, warnings)
  const edgeTris = buildEdgeTris(seg)
  const triGroup = new Int32Array(seg.tris.length / 3).fill(-1)
  for (const g of groups) for (const t of g.tris) triGroup[t] = g.id

  // 所有环嘅边（搵「共用边」用 —— 整形嘅安全闸）
  const groupLoops: Uint32Array[][] = groups.map((g) => {
    if (!g.coalesced && g.absorbed === 0 && g.regions.length === 1) return seg.regions[g.regions[0]].boundaryLoops
    return loopsFromTris(seg, g.tris)
  })
  const edgeUse = new Map<number, number>()
  for (const loops of groupLoops) for (const lp of loops) for (let i = 0; i < lp.length; i++) {
    const key = edgeKey(lp[i], lp[(i + 1) % lp.length], nv)
    edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1)
  }
  const sharedEdges = new Set<number>()
  for (const [k, c] of edgeUse) if (c > 1) sharedEdges.add(k)

  // 环 → 邻组（拎解析圆参数用）
  const loopNeighbour = (loop: ArrayLike<number>, self: number): number => {
    const tally = new Map<number, number>()
    for (let i = 0; i < loop.length; i++) {
      const key = edgeKey(loop[i], loop[(i + 1) % loop.length], nv)
      for (const t of edgeTris.get(key) ?? []) {
        const g = triGroup[t]
        if (g < 0 || g === self) continue
        tally.set(g, (tally.get(g) ?? 0) + 1)
      }
    }
    let best = -1, bestN = 0
    for (const [g, c] of tally) if (c > bestN) { bestN = c; best = g }
    return best
  }

  // 邻组解析面 × 平面 → 精确圆（同一组数字两边共用 → 接缝缝隙 = 0）
  const analyticCircle = (gi: number, planeN: Vec3, planeD: number): { centre: Vec3; radius: number } | null => {
    if (gi < 0) return null
    const p = groups[gi].params
    if (p.kind === 'cylinder') {
      const denom = dot3(planeN, p.axis)
      if (Math.abs(denom) < 0.999) return null                 // 轴唔垂直於平面 → 交线唔係圆
      const t = (planeD - dot3(planeN, p.point)) / denom
      return { centre: add3(p.point, mul3(p.axis, t)), radius: p.radius }
    }
    if (p.kind === 'cone') {
      const denom = dot3(planeN, p.axis)
      if (Math.abs(denom) < 0.999) return null
      const t = (planeD - dot3(planeN, p.apex)) / denom
      const r = Math.abs(t) * Math.tan(p.halfAngleDeg * Math.PI / 180)
      if (!(r > 0)) return null
      return { centre: add3(p.apex, mul3(p.axis, t)), radius: r }
    }
    return null
  }

  let circleLoops = 0, rectifiedLoops = 0, coalesced = 0, absorbed = 0
  for (const g of groups) { if (g.coalesced) coalesced++; absorbed += g.absorbed }

  // ── 曲面组嘅 h 界对齐：柱/锥嘅端界 snap 落邻接平面（两边用同一个轴向坐标 → 接缝重合）──
  const axialSnap = new Map<number, { lo: number; hi: number }>()
  for (const g of groups) {
    const p = g.params
    if (p.kind !== 'cylinder' && p.kind !== 'cone') continue
    const origin = p.kind === 'cylinder' ? p.point : p.apex
    let lo = p.hMin, hi = p.hMax
    for (const lp of groupLoops[g.id]) {
      const nb = loopNeighbour(lp, g.id)
      if (nb < 0) continue
      const np = groups[nb].params
      if (np.kind !== 'plane') continue
      if (Math.abs(dot3(np.normal, p.axis)) < 0.999) continue
      const t = (np.d - dot3(np.normal, origin)) / dot3(np.normal, p.axis)
      if (Math.abs(t - lo) < Math.abs(t - hi)) { if (Math.abs(t - lo) <= eps * 5) lo = t } else if (Math.abs(t - hi) <= eps * 5) hi = t
    }
    axialSnap.set(g.id, { lo, hi })
  }

  const faces: FacePlan[] = []
  const skipped: number[] = []

  for (const g of groups) {
    const loops = groupLoops[g.id]
    const prm = g.params
    const fp: FacePlan = {
      group: g.id, kind: g.kind, build: 'skip', params: [], uvBounds: [], naturalClosed: false,
      loops: [], regions: g.regions.slice(), triCount: g.tris.length, area: g.area, note: '',
    }

    if (prm.kind === 'plane') {
      const n = norm3(prm.normal)
      const { x, y } = planeFrame(n)
      const o: Vec3 = prm.point
      const planned: LoopPlan[] = []
      let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity
      for (const lp of loops) {
        let p2 = project(seg, lp, o, x, y)
        let ids = Array.from(lp)
        const nb = loopNeighbour(lp, g.id)
        const fit = fitCircle2(p2)
        const ac = analyticCircle(nb, n, prm.d)
        let plan: LoopPlan
        if (ac && fit && Math.abs(fit.r - ac.radius) <= Math.max(circleTol, ac.radius * 0.02) && fullCircleCoverage(p2, fit.cu, fit.cv)) {
          // 邻区（柱/锥）俾嘅精确圆
          plan = { kind: 'circle', isOuter: false, pts: flat3(seg, lp), circle: { centre: ac.centre, normal: n, radius: ac.radius }, area: Math.PI * ac.radius * ac.radius, neighbour: nb, circleSource: 'neighbour' }
          circleLoops++
        } else if (fit && fit.maxRes <= circleTol && p2.length >= 8 && fullCircleCoverage(p2, fit.cu, fit.cv)) {
          const centre = add3(add3(o, mul3(x, fit.cu)), mul3(y, fit.cv))
          plan = { kind: 'circle', isOuter: false, pts: flat3(seg, lp), circle: { centre, normal: n, radius: fit.r }, area: Math.PI * fit.r * fit.r, neighbour: nb, circleSource: 'fit' }
          circleLoops++
        } else {
          if (opts.rectifyLoops ?? true) {
            const rec = rectifyPolygon(p2, ids, sharedEdges, nv, collinearTol, opts.rectifyShortFrac ?? 0.2)
            if (rec.changed) { rectifiedLoops++; p2 = rec.pts; ids = rec.ids }
          }
          const pts: number[] = []
          for (const q of p2) { const P = add3(add3(o, mul3(x, q.u)), mul3(y, q.v)); pts.push(P[0], P[1], P[2]) }
          plan = { kind: 'polygon', isOuter: false, pts, area: Math.abs(signedArea2(p2)), neighbour: nb }
        }
        for (const q of p2) { uMin = Math.min(uMin, q.u); uMax = Math.max(uMax, q.u); vMin = Math.min(vMin, q.v); vMax = Math.max(vMax, q.v) }
        planned.push(plan)
      }
      if (!planned.length) { fp.note = '平面冇边界环（网格坏）'; skipped.push(g.id); warnings.push(`组 ${g.id}: 平面冇边界环，跳过`); faces.push(fp); continue }
      let oi = 0
      for (let i = 1; i < planned.length; i++) if (planned[i].area > planned[oi].area) oi = i
      planned[oi].isOuter = true
      const du = Math.max((uMax - uMin) * uvMargin, eps), dv = Math.max((vMax - vMin) * uvMargin, eps)
      fp.build = planned[oi].kind === 'circle' ? 'discWire' : 'analytic'
      fp.params = [o[0], o[1], o[2], n[0], n[1], n[2], x[0], x[1], x[2]]
      fp.uvBounds = [uMin - du, uMax + du, vMin - dv, vMax + dv]
      fp.loops = planned
      fp.note = `plane ${planned.length} loop(s)`
    } else if (prm.kind === 'cylinder') {
      const snap = axialSnap.get(g.id) ?? { lo: prm.hMin, hi: prm.hMax }
      const full = prm.full || (prm.tMax - prm.tMin) >= Math.PI * 2 - 1e-6
      const u0 = full ? 0 : prm.tMin, u1 = full ? Math.PI * 2 : prm.tMax
      fp.build = 'analytic'
      fp.params = [prm.point[0], prm.point[1], prm.point[2], prm.axis[0], prm.axis[1], prm.axis[2], prm.radius, prm.refU[0], prm.refU[1], prm.refU[2]]
      fp.uvBounds = [u0, u1, snap.lo, snap.hi]
      fp.loops = loops.map((lp) => ({ kind: 'polygon' as const, isOuter: false, pts: flat3(seg, lp), area: 0, neighbour: loopNeighbour(lp, g.id) }))
      fp.note = `cylinder r=${prm.radius.toFixed(4)} v=[${snap.lo.toFixed(3)},${snap.hi.toFixed(3)}]${full ? ' full' : ' partial(uv-rect)'}`
      if (!full) warnings.push(`组 ${g.id}: 部分圆柱只用 uv 矩形界（v1 限制，环形边界未裁）`)
    } else if (prm.kind === 'cone') {
      const snap = axialSnap.get(g.id) ?? { lo: prm.hMin, hi: prm.hMax }
      const half = prm.halfAngleDeg * Math.PI / 180
      const cosh = Math.cos(half) || 1
      const full = prm.full || (prm.tMax - prm.tMin) >= Math.PI * 2 - 1e-6
      fp.build = 'analytic'
      // ★ M2 合约：锥以【顶点】为原点，v = 母线（slant）距离；M1 嘅 hMin/hMax 系轴向 → 要除 cos(半角)
      fp.params = [prm.apex[0], prm.apex[1], prm.apex[2], prm.axis[0], prm.axis[1], prm.axis[2], half, prm.refU[0], prm.refU[1], prm.refU[2]]
      fp.uvBounds = [full ? 0 : prm.tMin, full ? Math.PI * 2 : prm.tMax, Math.max(0, snap.lo) / cosh, snap.hi / cosh]
      fp.loops = loops.map((lp) => ({ kind: 'polygon' as const, isOuter: false, pts: flat3(seg, lp), area: 0, neighbour: loopNeighbour(lp, g.id) }))
      fp.note = `cone half=${prm.halfAngleDeg.toFixed(3)}° slant=[${(Math.max(0, snap.lo) / cosh).toFixed(3)},${(snap.hi / cosh).toFixed(3)}]`
      if (!full) warnings.push(`组 ${g.id}: 部分圆锥只用 uv 矩形界（v1 限制）`)
    } else if (prm.kind === 'sphere') {
      fp.build = 'analytic'
      fp.params = [prm.centre[0], prm.centre[1], prm.centre[2], prm.radius]
      fp.uvBounds = []
      fp.naturalClosed = loops.length === 0
      fp.loops = loops.map((lp) => ({ kind: 'polygon' as const, isOuter: false, pts: flat3(seg, lp), area: 0, neighbour: loopNeighbour(lp, g.id) }))
      fp.note = `sphere r=${prm.radius.toFixed(4)}${fp.naturalClosed ? ' natural-closed' : ' 有边界环（v1 用自然整球，会缝唔埋）'}`
      if (!fp.naturalClosed) warnings.push(`组 ${g.id}: 部分球面 v1 未裁（用整球面）`)
    } else if (prm.kind === 'torus') {
      fp.build = 'analytic'
      fp.params = [prm.centre[0], prm.centre[1], prm.centre[2], prm.axis[0], prm.axis[1], prm.axis[2], prm.majorRadius, prm.minorRadius]
      fp.uvBounds = []
      fp.naturalClosed = loops.length === 0
      fp.loops = loops.map((lp) => ({ kind: 'polygon' as const, isOuter: false, pts: flat3(seg, lp), area: 0, neighbour: loopNeighbour(lp, g.id) }))
      fp.note = `torus R=${prm.majorRadius.toFixed(4)} r=${prm.minorRadius.toFixed(4)}`
      if (!fp.naturalClosed) warnings.push(`组 ${g.id}: 圆角带（部分环面）v1 未裁 —— 交俾 M5 圆角路径`)
    } else {
      // freeform：试 B 样条被单（execute 会用 DeviationSample 复核，唔过就丢）
      const grid = opts.bsplineFreeform ?? true ? resampleGrid(seg, g.tris) : null
      if (grid) {
        fp.build = 'bspline'
        fp.grid = grid
        fp.note = `freeform → FitBSplineFace ${grid.nu}×${grid.nv}`
      } else {
        fp.build = 'skip'
        fp.note = 'freeform 无法参数化（网格投影唔单射）'
        skipped.push(g.id)
        warnings.push(`组 ${g.id}: freeform 区（${g.tris.length} 三角）起唔到解析/样条面 → 唔会入缝合`)
      }
    }
    faces.push(fp)
  }

  const plan: RebuildPlan = {
    faces, skipped, sewTol, diag, warnings,
    stats: { groups: groups.length, coalesced, absorbed, circleLoops, rectifiedLoops },
  }
  void t0
  return plan
}

/** 环顶点 id → 扁平 xyz。 */
function flat3(seg: SegmentationResult, loop: ArrayLike<number>): number[] {
  const out: number[] = []
  for (let i = 0; i < loop.length; i++) {
    const vi = loop[i]
    out.push(seg.verts[vi * 3], seg.verts[vi * 3 + 1], seg.verts[vi * 3 + 2])
  }
  return out
}

/**
 * freeform 区 → 规则 (u,v) 网格：投影落 PCA 主平面，格仔取最近点（IDW 平滑）。
 * 只做「投影单射」嘅浅曲面；深弯/包卷嘅 organic 面唔喺 v1 范围（返 null → 上层退階）。
 */
function resampleGrid(seg: SegmentationResult, tris: number[]): { pts: number[]; nu: number; nv: number } | null {
  const ids = new Set<number>()
  for (const t of tris) for (let k = 0; k < 3; k++) ids.add(seg.tris[t * 3 + k])
  if (ids.size < 16) return null
  const P: Vec3[] = []
  let cx = 0, cy = 0, cz = 0
  for (const vi of ids) { const p: Vec3 = [seg.verts[vi * 3], seg.verts[vi * 3 + 1], seg.verts[vi * 3 + 2]]; P.push(p); cx += p[0]; cy += p[1]; cz += p[2] }
  const c: Vec3 = [cx / P.length, cy / P.length, cz / P.length]
  // 协方差最小特征向量 = 法向（幂迭代求最大，再用 Gram-Schmidt 出另外两轴）
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0
  for (const p of P) { const d = sub3(p, c); xx += d[0] * d[0]; xy += d[0] * d[1]; xz += d[0] * d[2]; yy += d[1] * d[1]; yz += d[1] * d[2]; zz += d[2] * d[2] }
  let n: Vec3 = [0, 0, 1]
  { // 反幂法太重，直接试三个轴向嘅最细方差方向
    const cands: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
    let best = 0, bestVar = Infinity
    for (let i = 0; i < 3; i++) {
      const v = cands[i]
      const q = xx * v[0] * v[0] + yy * v[1] * v[1] + zz * v[2] * v[2] + 2 * (xy * v[0] * v[1] + xz * v[0] * v[2] + yz * v[1] * v[2])
      if (q < bestVar) { bestVar = q; best = i }
    }
    n = cands[best]
  }
  const { x, y } = planeFrame(n)
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity
  const uv: { u: number; v: number; w: number }[] = []
  for (const p of P) {
    const d = sub3(p, c)
    const u = dot3(d, x), v = dot3(d, y), w = dot3(d, n)
    uv.push({ u, v, w })
    uMin = Math.min(uMin, u); uMax = Math.max(uMax, u); vMin = Math.min(vMin, v); vMax = Math.max(vMax, v)
  }
  if (!(uMax > uMin) || !(vMax > vMin)) return null
  const nu = Math.max(4, Math.min(12, Math.round(Math.sqrt(P.length) / 1.5)))
  const nv = nu
  const pts: number[] = []
  const cell = Math.max((uMax - uMin) / (nu - 1), (vMax - vMin) / (nv - 1))
  for (let i = 0; i < nu; i++) {
    const u = uMin + (uMax - uMin) * i / (nu - 1)
    for (let j = 0; j < nv; j++) {
      const v = vMin + (vMax - vMin) * j / (nv - 1)
      let sw = 0, sww = 0, nearest = Infinity
      for (const q of uv) {
        const d2 = (q.u - u) * (q.u - u) + (q.v - v) * (q.v - v)
        nearest = Math.min(nearest, d2)
        const wgt = 1 / (d2 + cell * cell * 1e-3)
        sw += wgt; sww += wgt * q.w
      }
      if (Math.sqrt(nearest) > cell * 1.5) return null      // 格仔冇样本 → 唔係矩形 patch，退階
      const w = sww / sw
      const p = add3(add3(add3(c, mul3(x, u)), mul3(y, v)), mul3(n, w))
      pts.push(p[0], p[1], p[2])
    }
  }
  return { pts, nu, nv }
}

// ═══════════════════════════════════ executePlan（内核）═══════════════════════════════════

const ST_FACE = 4

function shapeType(OC: OCModule, s: OCShape): number {
  try { const v = s.ShapeType(); return (v && typeof v === 'object' && 'value' in v) ? v.value : v } catch { void OC; return -1 }
}
function faceArea(OC: OCModule, s: OCShape): number {
  try { const g = new OC.GProp_GProps_1(); OC.BRepGProp.SurfaceProperties_1(s, g, false, false); return g.Mass() } catch { return NaN }
}
function countFaces(OC: OCModule, s: OCShape): number {
  try {
    let n = 0
    const ex = new OC.TopExp_Explorer_2(s, OC.TopAbs_ShapeEnum.TopAbs_FACE, OC.TopAbs_ShapeEnum.TopAbs_SHAPE)
    for (; ex.More(); ex.Next()) n++
    return n
  } catch { return -1 }
}
function checkValid(OC: OCModule, s: OCShape): boolean | null {
  try { const a = new OC.BRepCheck_Analyzer(s, true, false); return !!(a.IsValid_2 ? a.IsValid_2() : a.IsValid()) } catch { return null }
}
const nonNull = (s: OCShape): OCShape | null => { try { return s && !s.IsNull() ? s : null } catch { return null } }

/** 解析圆 → wire（reverse = true 时反向，用嚟做孔）。 */
function circleWire(OC: OCModule, centre: Vec3, normal: Vec3, radius: number, reverse: boolean): OCShape | null {
  try {
    const ax2 = new OC.gp_Ax2_3(new OC.gp_Pnt_3(centre[0], centre[1], centre[2]), new OC.gp_Dir_4(normal[0], normal[1], normal[2]))
    const mw = new OC.BRepBuilderAPI_MakeWire_1()
    mw.Add_1(new OC.BRepBuilderAPI_MakeEdge_8(new OC.gp_Circ_2(ax2, radius)).Edge())
    const w = mw.Wire()
    return reverse ? OC.TopoDS.Wire_1(w.Reversed()) : w
  } catch { return null }
}

/** 折线 → wire（首尾自动闭合）。 */
function polyWire(OC: OCModule, pts: number[], reverse: boolean): OCShape | null {
  try {
    const n = pts.length / 3
    if (n < 3) return null
    const mw = new OC.BRepBuilderAPI_MakeWire_1()
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const a = new OC.gp_Pnt_3(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2])
      const b = new OC.gp_Pnt_3(pts[j * 3], pts[j * 3 + 1], pts[j * 3 + 2])
      if (a.IsEqual(b, 1e-9)) continue
      mw.Add_1(new OC.BRepBuilderAPI_MakeEdge_3(a, b).Edge())
    }
    const w = mw.Wire()
    return reverse ? OC.TopoDS.Wire_1(w.Reversed()) : w
  } catch { return null }
}

/**
 * 面 + 孔环 → 带孔面。★孔环要反向先当孔★（唔反向 = 多咗个外环，面积变 outer+hole）。
 * 稳阵做法：两个方向都试，边个令面积【减少】就要边个。
 */
function addHole(OC: OCModule, face: OCShape, mkWire: (rev: boolean) => OCShape | null, holeArea: number): OCShape | null {
  const base = faceArea(OC, face)
  for (const rev of [true, false]) {
    const w = mkWire(rev)
    if (!w) continue
    try {
      const f = nonNull(new OC.BRepBuilderAPI_MakeFace_22(OC.TopoDS.Face_1(face), w).Face())
      if (!f) continue
      const a = faceArea(OC, f)
      if (Number.isFinite(a) && a < base - holeArea * 0.5) return f
    } catch { /* 试下一个方向 */ }
  }
  return null
}

/** 单张自然闭合面（整球/整环面）→ 实体。SewSolidify 唔食单面，要行 TopoDS_Builder。 */
function solidFromClosedFace(OC: OCModule, face: OCShape): OCShape | null {
  try {
    const b = new OC.TopoDS_Builder()
    const sh = new OC.TopoDS_Shell()
    b.MakeShell(sh)
    b.Add(sh, face)
    const mk = new OC.BRepBuilderAPI_MakeSolid_1()
    mk.Add(sh)
    return nonNull(mk.Solid())
  } catch { return null }
}

/** 起一张面（照 FacePlan）。返 null = 起唔到（上层记 warning + 拖低 tier）。 */
function buildFace(OC: OCModule, fp: FacePlan, sewTol: number, warnings: string[]): OCShape | null {
  const W = OC.FitWrapper
  if (!W) return null
  const trimTol = Math.max(sewTol, 1e-7)
  try {
    if (fp.build === 'skip') return null

    if (fp.build === 'bspline') {
      if (!fp.grid) return null
      const f = nonNull(W.FitBSplineFace(fp.grid.pts, fp.grid.nu, fp.grid.nv, 3, 8, trimTol * 10))
      if (!f) { warnings.push(`组 ${fp.group}: FitBSplineFace 返 null`); return null }
      return f
    }

    const outer = fp.loops.find((l) => l.isOuter)
    const holes = fp.loops.filter((l) => !l.isOuter)

    if (fp.build === 'discWire') {
      // 外环系解析圆 → 直接由圆 wire 起平面盘（比折线裁精确，同柱面接缝逐位相等）
      if (!outer || !outer.circle) return null
      const w = circleWire(OC, outer.circle.centre, outer.circle.normal, outer.circle.radius, false)
      if (!w) return null
      let face = nonNull(new OC.BRepBuilderAPI_MakeFace_15(w, true).Face())
      if (!face) { warnings.push(`组 ${fp.group}: 圆盘面起唔到`); return null }
      face = applyHoles(OC, face, holes, fp, warnings)
      return face
    }

    // analytic：解析面 → （平面）用外环裁
    const kind = ANALYTIC_KIND[fp.kind]
    if (kind === undefined) return null
    let face = nonNull(W.MakeAnalyticFace(kind, fp.params, fp.uvBounds))
    if (!face) { warnings.push(`组 ${fp.group}: MakeAnalyticFace(${fp.kind}) 返 null`); return null }

    if (fp.kind === 'plane') {
      if (!outer) return null
      const t = nonNull(W.TrimFaceByLoop(face, outer.pts, trimTol))
      if (!t) { warnings.push(`组 ${fp.group}: TrimFaceByLoop（外环 ${outer.pts.length / 3} 点）返 null`); return null }
      face = t
      face = applyHoles(OC, face, holes, fp, warnings)
      return face
    }
    // 柱/锥/球/环面：v1 用 uv 界（曲面上嘅折线裁会引入镶嵌棱边 → 接缝对唔准）
    return face
  } catch (e) {
    warnings.push(`组 ${fp.group}: 起面抛异常 ${(e as Error)?.message ?? e}`)
    return null
  }
}

function applyHoles(OC: OCModule, face: OCShape, holes: LoopPlan[], fp: FacePlan, warnings: string[]): OCShape {
  let cur = face
  for (const h of holes) {
    const mk = h.kind === 'circle' && h.circle
      ? (rev: boolean) => circleWire(OC, h.circle!.centre, h.circle!.normal, h.circle!.radius, rev)
      : (rev: boolean) => polyWire(OC, h.pts, rev)
    const holed = addHole(OC, cur, mk, Math.max(h.area, 0))
    if (holed) cur = holed
    else warnings.push(`组 ${fp.group}: 孔环（${h.kind}）加唔入，面保持无孔`)
  }
  return cur
}

/**
 * 计划 + 内核 → shape。缝合策略：
 *   ① SewSolidify(wantClosed=true) —— M2 实证呢个闸会喺唔闭合时返 null（唔会返烂实体去 abort）
 *   ② 单张自然闭合面 → TopoDS_Builder 后备
 *   ③ SewSolidify(wantClosed=false) → 开放壳（Tier-1 退階）
 */
export function executePlan(seg: SegmentationResult, plan: RebuildPlan, OC: OCModule, opts: RebuildOptions = {}): RebuildResult {
  const t0 = performance.now()
  const warnings = plan.warnings.slice()
  const W = OC?.FitWrapper
  const empty: RebuildResult = {
    shape: null, tier: 'failed', faceCount: 0, deviation: { max: NaN, mean: NaN, samples: 0 },
    warnings, plan, valid: null, msPlan: 0, msBuild: 0,
  }
  if (!W) { warnings.push('OC.FitWrapper 唔存在 —— 内核未重建（_occt-build/_rebuilt）'); return empty }
  const maxFaces = opts.maxFaces ?? 4000
  const buildable = plan.faces.filter((f) => f.build !== 'skip').length
  if (buildable > maxFaces) {
    warnings.push(`计划 ${buildable} 张面 > maxFaces ${maxFaces} —— 识别碎晒（噪声/扫描件），唔入内核，请退 faceted 路径`)
    return empty
  }

  const faces: OCShape[] = []
  for (const fp of plan.faces) {
    const f = buildFace(OC, fp, plan.sewTol, warnings)
    if (f && shapeType(OC, f) === ST_FACE) faces.push(f)
    else if (fp.build !== 'skip') warnings.push(`组 ${fp.group}（${fp.kind}）起唔到面 → 缺面`)
  }
  if (!faces.length) { warnings.push('冇任何面起到'); return { ...empty, msBuild: performance.now() - t0 } }

  let shape: OCShape | null = null
  let tier: RebuildTier = 'failed'
  const closedCandidate = faces.length === 1 && plan.faces.some((f) => f.naturalClosed)

  if (!closedCandidate) {
    try { shape = nonNull(W.SewSolidify(faces, plan.sewTol, true)) } catch (e) { warnings.push(`SewSolidify(closed) 抛 ${(e as Error)?.message ?? e}`) }
    if (shape) tier = 'solid'
  }
  if (!shape && closedCandidate) {
    shape = solidFromClosedFace(OC, faces[0])
    if (shape) { tier = 'solid'; warnings.push('单张自然闭合面 → TopoDS_Builder 实体（SewSolidify 唔食单面）') }
  }
  if (!shape) {
    try { shape = nonNull(W.SewSolidify(faces, plan.sewTol, false)) } catch (e) { warnings.push(`SewSolidify(open) 抛 ${(e as Error)?.message ?? e}`) }
    if (shape) {
      tier = 'shell'
      let free = -1
      try { free = JSON.parse(W.FreeBoundaryInfo(shape)).freeEdges } catch { /* */ }
      warnings.push(`闭合缝合失败 → 开放壳（自由边 ${free}）`)
    }
  }
  if (!shape) { warnings.push('缝合完全失败'); return { ...empty, msBuild: performance.now() - t0 } }

  // 偏差：网格顶点 → 重建面嘅最近距离
  const dev = sampleDeviation(seg, OC, shape, opts.deviationSamples ?? 500, opts.deviationPerFace ?? 'auto')
  const valid = checkValid(OC, shape)
  if (valid === false) warnings.push('BRepCheck_Analyzer 报唔有效')

  return {
    shape, tier, faceCount: countFaces(OC, shape), deviation: dev, warnings, plan, valid,
    msPlan: 0, msBuild: performance.now() - t0,
  }
}

function sampleDeviation(seg: SegmentationResult, OC: OCModule, shape: OCShape, want: number, perFace: 'auto' | boolean): { max: number; mean: number; samples: number } {
  const nv = seg.verts.length / 3
  if (!nv) return { max: NaN, mean: NaN, samples: 0 }
  const step = Math.max(1, Math.floor(nv / Math.max(1, want)))
  const pts: number[] = []
  for (let i = 0; i < nv; i += step) pts.push(seg.verts[i * 3], seg.verts[i * 3 + 1], seg.verts[i * 3 + 2])
  const measure = (target: OCShape): number[] | null => {
    try {
      const arr = JSON.parse(OC.FitWrapper.DeviationSample(target, pts)) as number[]
      return Array.isArray(arr) && arr.length === pts.length / 3 ? arr : null
    } catch { return null }
  }
  let best: number[] | null = null
  const nf = countFaces(OC, shape)
  if (perFace === true || (perFace === 'auto' && nf > 1 && nf <= 32)) {
    // 逐面量再取 min —— 绕开 BRepExtrema 喺锥面上收敛落错局部极值嘅问题（见 RebuildOptions 注释）
    try {
      const ex = new OC.TopExp_Explorer_2(shape, OC.TopAbs_ShapeEnum.TopAbs_FACE, OC.TopAbs_ShapeEnum.TopAbs_SHAPE)
      for (; ex.More(); ex.Next()) {
        const arr = measure(ex.Current())
        if (!arr) continue
        if (!best) best = arr.map((d) => Math.abs(d))
        else for (let i = 0; i < arr.length; i++) best[i] = Math.min(best[i], Math.abs(arr[i]))
      }
    } catch { best = null }
  }
  if (!best) best = measure(shape)?.map((d) => Math.abs(d)) ?? null
  if (!best || !best.length) return { max: NaN, mean: NaN, samples: 0 }
  let mx = 0, sum = 0
  for (const a of best) { if (a > mx) mx = a; sum += a }
  return { max: mx, mean: sum / best.length, samples: best.length }
}

/** 一站式：SegmentationResult + 内核 → 实体/壳 + tier + 偏差。 */
export function rebuild(seg: SegmentationResult, OC: OCModule, opts: RebuildOptions = {}): RebuildResult {
  const t0 = performance.now()
  const plan = planRebuild(seg, opts)
  const msPlan = performance.now() - t0
  const res = executePlan(seg, plan, OC, opts)
  res.msPlan = msPlan
  return res
}
