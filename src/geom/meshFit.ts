// Mesh→B-rep 参数化推断（分析层，spec B1+B2+B3）。纯 JS、零内核、零依赖 → Node 可测（项目第一道防线）。
// 把 faceted 三角网格分析成【参数化基元】：平面（PlanePrim，带边界环 boundaryLoops，支持带孔）、圆柱（CylPrim）。
// 输出俾 worker（B4）重建精确 B-rep：平面区 → 平面面 + 修剪环；圆柱区 → 拉伸/旋转圆柱面。识别唔到（RMS 守衛拒）
// 就诚实标 faceted（保守偏平面 / 偏 full 圆柱），宁缺毋滥 — 唔会推出虚假几何。
//
// 复用：平面区分割直接 import 现有 segmentPlanarRegions（meshSegment.ts:24），本文件只加①边界环提取
// ②圆柱识别（Gauss-map 轴候选 + region growing + Kåsa 代数圆拟合 + θ 范围 + RMS 守衛）③统一编排 fitPrimitives。
//
// 坐标系：CAD 坐标进出（同 mesh.vertices 同系），调用方转 world。容差按模型尺度自适应，由 opts 传。

import { segmentPlanarRegions } from './meshSegment'

// ───────────────────────── 输出型别 ─────────────────────────

/** 平面基元。normal·x = d。boundaryLoops = 边界环（顶点 3D 坐标序列，见 §boundaryLoops 语义）。 */
export interface PlanePrim {
  kind: 'plane'
  normal: [number, number, number]  // 单位法向（面积加权，指向网格外侧 = 三角外向缠绕侧）
  d: number                         // 平面方程 normal·x = d
  area: number                      // 平面区总面积 mm²
  rms: number                       // 三角顶点到拟合平面嘅 RMS 距离（守衛读数；平面区一般极小）
  triIndices: number[]              // 组成三角喺 triangles 入面嘅【三角序号】(i/3)
  // 边界环：每个 loop 系一串 3D 顶点坐标 [[x,y,z],...]，首尾【唔重复】（隐式闭合，last→first 连回）。
  // loops[0] = 外环（面积最大，CCW 相对 normal），loops[1..] = 内环 = 孔（顺时针相对 normal）。
  // 多环 = 带孔平面（如带圆孔平板 → 2 环：外方框 + 内圆）。见文件尾 §boundaryLoops 语义详解。
  boundaryLoops: [number, number, number][][]
}

/** 圆柱基元。轴 axis 过 origin，半径 r，参数范围 [h0,h1]（沿轴）× [t0,t1]（周向弧度）。 */
export interface CylPrim {
  kind: 'cyl'
  axis: [number, number, number]    // 单位轴向
  origin: [number, number, number]  // 轴上一点（圆心，沿轴投影到 h=0）
  r: number                         // 半径 mm
  h0: number                        // 沿轴下界（相对 origin，origin+h0*axis）
  h1: number                        // 沿轴上界
  t0: number                        // 周向起始角（rad，相对 refU 基准，见 CylPrim.refU）
  t1: number                        // 周向终止角（rad）；t1-t0 ≈ 2π = 闭合全圆柱，< 2π = 部分（半圆柱等）
  full: boolean                     // 是否闭合全圆柱（θ 最大 gap < gapTol → true）；保守偏 full
  refU: [number, number, number]    // 周向 0 角基准方向（⊥ axis 单位向量），配 axis×refU 定 t 正向
  area: number                      // 圆柱区总面积 mm²
  rms: number                       // 顶点到拟合圆柱面（径向）嘅 RMS 距离（守衛读数）
  triIndices: number[]              // 组成三角序号
}

export type MeshPrim = PlanePrim | CylPrim

/** fitPrimitives 结果。primitives = 识别到嘅基元；facetedTriCount = 冇归入任何基元嘅三角数（自由曲面/噪声）。 */
export interface MeshFitResult {
  primitives: MeshPrim[]            // 按面积降序
  planeCount: number
  cylCount: number
  facetedTriCount: number           // 未识别三角数（覆盖率 = 1 - facetedTriCount/totalTri）
  totalTriCount: number
}

/** fitPrimitives 选项。全部有尺度自适应默认；调用方一般只传 diag（包围盒对角）令容差自适应。 */
export interface FitOptions {
  diag?: number          // 包围盒对角线（mm）；驱动距离容差尺度。缺省由顶点算。
  planeAngleTolDeg?: number  // 平面区法向夹角容差（传落 segmentPlanarRegions）。默认 8。
  planeDistTol?: number  // 平面区共面距离容差。默认 max(0.05, diag*0.003)。
  planeRmsTol?: number   // 平面 RMS 守衛：rms > 此值 → 拒（当 faceted）。默认 max(0.05, diag*0.004)。
  cylAngleTolDeg?: number // 圆柱 region-growing 法向⊥轴容差（|n·a| < sin(tol)）。默认 12。
  cylRmsFracTol?: number // 圆柱 RMS 守衛：rms/r > 此比例 → 拒。默认 0.06。
  minCylTri?: number     // 圆柱区最少三角数（太细唔可靠）。默认 8。
  gapTolDeg?: number     // θ 最大 gap < 此角 → 判 full 全圆柱（保守偏 full）。默认 40。
}

// ───────────────────────── 向量工具（同房子惯例 meshSegment/faceDetect）─────────────────────────

type V3 = [number, number, number]
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const len = (a: V3): number => Math.hypot(a[0], a[1], a[2])
const norm = (a: V3): V3 => { const L = len(a) || 1; return [a[0] / L, a[1] / L, a[2] / L] }

// ───────────────────────── 焊接 / 拓扑（抄 meshSegment.ts idiom）─────────────────────────

interface Topo {
  nT: number
  vAt: (vi: number) => V3
  vKey: Int32Array          // 原始顶点 → 焊接规范 id
  nCanon: number
  triN: V3[]                // 每三角单位法向（外向缠绕侧）
  triC: V3[]                // 每三角重心
  triA: number[]            // 每三角面积
  canonPos: V3[]            // 规范 id → 代表坐标（首次遇到嘅原始坐标）
  // 三角 t 嘅焊接后三顶点规范 id
  triW: (t: number) => [number, number, number]
  // 边（无向，规范 id）→ 邻接三角序号表
  edgeTris: Map<string, number[]>
  neighbors: (t: number) => number[]
}

const edgeKey = (a: number, b: number): string => (a < b ? a + '_' + b : b + '_' + a)

function buildTopo(vertices: ArrayLike<number>, triangles: ArrayLike<number>, q: number): Topo {
  const nT = Math.floor(triangles.length / 3)
  const nV = Math.floor(vertices.length / 3)
  const vAt = (vi: number): V3 => [vertices[vi * 3] as number, vertices[vi * 3 + 1] as number, vertices[vi * 3 + 2] as number]

  const triN: V3[] = new Array(nT)
  const triC: V3[] = new Array(nT)
  const triA: number[] = new Array(nT)
  for (let t = 0; t < nT; t++) {
    const a = vAt(triangles[t * 3] as number), b = vAt(triangles[t * 3 + 1] as number), c = vAt(triangles[t * 3 + 2] as number)
    const cr = cross(sub(b, a), sub(c, a))
    const L = len(cr)
    triA[t] = L / 2
    triN[t] = L > 1e-12 ? [cr[0] / L, cr[1] / L, cr[2] / L] : [0, 0, 0]
    triC[t] = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]
  }

  // 焊接顶点（量化位置）→ 规范 id，稳健对付未焊接 STL（同 meshSegment.ts:49-53）
  const qq = Math.max(1e-6, q)
  const keyOf = (p: V3): string => `${Math.round(p[0] / qq)},${Math.round(p[1] / qq)},${Math.round(p[2] / qq)}`
  const vKey = new Int32Array(nV)
  const keyMap = new Map<string, number>()
  const canonPos: V3[] = []
  for (let i = 0; i < nV; i++) {
    const p = vAt(i)
    const k = keyOf(p)
    let id = keyMap.get(k)
    if (id == null) { id = keyMap.size; keyMap.set(k, id); canonPos.push(p) }
    vKey[i] = id
  }
  const nCanon = keyMap.size

  const triW = (t: number): [number, number, number] => [vKey[triangles[t * 3] as number], vKey[triangles[t * 3 + 1] as number], vKey[triangles[t * 3 + 2] as number]]

  const edgeTris = new Map<string, number[]>()
  for (let t = 0; t < nT; t++) {
    const w = triW(t)
    for (let e = 0; e < 3; e++) { const k = edgeKey(w[e], w[(e + 1) % 3]); const arr = edgeTris.get(k); if (arr) arr.push(t); else edgeTris.set(k, [t]) }
  }
  const neighbors = (t: number): number[] => {
    const out: number[] = []
    const w = triW(t)
    for (let e = 0; e < 3; e++) { const arr = edgeTris.get(edgeKey(w[e], w[(e + 1) % 3])); if (arr) for (const o of arr) if (o !== t) out.push(o) }
    return out
  }

  return { nT, vAt, vKey, nCanon, triN, triC, triA, canonPos, triW, edgeTris, neighbors }
}

// ───────────────────────── §2.4 边界环提取 ─────────────────────────

// 一个 patch（三角序号集合）嘅边界 = 只属 patch 内【一个】三角嘅无向边（其它边 = patch 内共享或跨 patch）。
// 把呢啲边界边串成闭合环（可多环 = 带孔）。返回每环嘅【规范顶点 id】序列（首尾唔重复，隐式闭合）。
function extractBoundaryLoops(topo: Topo, triSet: number[]): number[][] {
  // 统计 patch 内每条无向边被几多 patch 内三角用；==1 即边界边。记有向边（保绕向 → 定环 winding）。
  // 有向边 (a→b) 来自三角缠绕；边界边嘅有向版本用嚟接龙（每个边界顶点出/入各一，形成有向环）。
  const undirCount = new Map<string, number>()
  const dirEdges: Array<[number, number]> = []  // 收集所有 patch 内三角嘅有向边
  for (const t of triSet) {
    const w = topo.triW(t)
    for (let e = 0; e < 3; e++) {
      const a = w[e], b = w[(e + 1) % 3]
      if (a === b) continue
      const k = edgeKey(a, b)
      undirCount.set(k, (undirCount.get(k) || 0) + 1)
      dirEdges.push([a, b])
    }
  }
  // 边界有向边 = 无向计数 ==1 嘅那条有向边。建 a→b 邻接（每个 a 理论上唯一后继，闭合流形 patch）。
  const nextOf = new Map<number, number[]>()
  const boundaryDir: Array<[number, number]> = []
  for (const [a, b] of dirEdges) {
    if ((undirCount.get(edgeKey(a, b)) || 0) === 1) {
      boundaryDir.push([a, b])
      const arr = nextOf.get(a); if (arr) arr.push(b); else nextOf.set(a, [b])
    }
  }
  if (boundaryDir.length === 0) return []

  // 串环：由未用有向边起步，沿 a→b→… 接龙直到回起点。多个不连通环 = 带孔。
  const usedDir = new Set<string>()
  const loops: number[][] = []
  for (const [sa, sb] of boundaryDir) {
    const startKey = sa + '>' + sb
    if (usedDir.has(startKey)) continue
    const loop: number[] = [sa]
    let cur = sa, nxt = sb, guard = 0
    const maxSteps = boundaryDir.length + 5
    while (guard++ < maxSteps) {
      usedDir.add(cur + '>' + nxt)
      loop.push(nxt)
      if (nxt === sa) { loop.pop(); break }  // 回到起点 → 闭合（pop 掉重复嘅起点）
      const cands = nextOf.get(nxt)
      if (!cands || cands.length === 0) break  // 断链（非流形边界）→ 收残链
      // 拣未用嘅后继（正常 patch 每顶点唯一；退化时取第一个未用）
      let picked = -1
      for (const c of cands) { if (!usedDir.has(nxt + '>' + c)) { picked = c; break } }
      if (picked < 0) break
      cur = nxt; nxt = picked
    }
    if (loop.length >= 3) loops.push(loop)
  }
  return loops
}

// 把规范 id 环转成 3D 坐标环，并按【外环优先 + 相对 normal 定 winding】排序：
// loops[0] = 外环（周长最长，逆时针相对 normal），内环（孔）翻成顺时针相对 normal。
function orientLoops(topo: Topo, idLoops: number[][], normal: V3): [number, number, number][][] {
  const toPts = (ids: number[]): V3[] => ids.map((id) => topo.canonPos[id])
  const signedArea2 = (pts: V3[]): number => {
    // 投影到 ⊥normal 平面算有向面积（× normal），正 = CCW 相对 normal
    let s = 0
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], qn = pts[(i + 1) % pts.length]
      s += dot(normal, cross(p, qn))
    }
    return s / 2
  }
  const perim = (pts: V3[]): number => { let s = 0; for (let i = 0; i < pts.length; i++) s += len(sub(pts[(i + 1) % pts.length], pts[i])); return s }
  const items = idLoops.map((ids) => { const pts = toPts(ids); return { pts, sa: signedArea2(pts), per: perim(pts) } })
  // 外环 = |有向面积| 最大者
  items.sort((a, b) => Math.abs(b.sa) - Math.abs(a.sa) || b.per - a.per)
  const out: [number, number, number][][] = []
  items.forEach((it, i) => {
    let pts = it.pts
    // i==0 外环要 CCW（sa>0）；内环要 CW（sa<0）。反则翻转顺序。
    const wantPositive = i === 0
    if ((it.sa >= 0) !== wantPositive) pts = pts.slice().reverse()
    out.push(pts.map((p) => [p[0], p[1], p[2]] as [number, number, number]))
  })
  return out
}

// ───────────────────────── B1：平面区 + 边界环 → PlanePrim ─────────────────────────

// 从一个平面区（triIndices）算最小二乘平面 + RMS，转 PlanePrim（含边界环）。RMS 守衛不过 → null。
function buildPlanePrim(topo: Topo, region: { normal: V3; d: number; area: number; triIndices: number[] }, rmsTol: number): PlanePrim | null {
  const idx = region.triIndices
  // 面积加权拟合平面已由 segmentPlanarRegions 给出（normal,d）。这里算 RMS 守衛 + 提边界环。
  const n = norm(region.normal)
  // 收区内所有【规范顶点】算到平面距离 RMS
  const vset = new Set<number>()
  for (const t of idx) { const w = topo.triW(t); vset.add(w[0]); vset.add(w[1]); vset.add(w[2]) }
  let ss = 0, cnt = 0
  for (const id of vset) { const dev = dot(n, topo.canonPos[id]) - region.d; ss += dev * dev; cnt++ }
  const rms = cnt ? Math.sqrt(ss / cnt) : 0
  if (rms > rmsTol) return null  // 守衛：区其实唔够平（曲面被误分）→ 拒
  // 面积由传入三角自算（可能系原区子集，圆柱佔用后剩余），唔靠 region.area
  let area = 0
  for (const t of idx) area += topo.triA[t]
  const idLoops = extractBoundaryLoops(topo, idx)
  const boundaryLoops = orientLoops(topo, idLoops, n)
  return { kind: 'plane', normal: n, d: region.d, area, rms, triIndices: idx, boundaryLoops }
}

// ───────────────────────── B2：圆柱识别 ─────────────────────────

// 3×3 对称矩阵特征分解（Jacobi 旋转）。返回特征值 eig[0..2] + 特征向量列 vec[·][0..2]（未排序）。
function jacobiEig3(M: number[][]): { eig: number[]; vec: number[][] } {
  // 复制（Jacobi 会就地改）
  const a = [[M[0][0], M[0][1], M[0][2]], [M[1][0], M[1][1], M[1][2]], [M[2][0], M[2][1], M[2][2]]]
  const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
  for (let sweep = 0; sweep < 50; sweep++) {
    // 揾最大非对角元
    let p = 0, qi = 1, mx = Math.abs(a[0][1])
    if (Math.abs(a[0][2]) > mx) { mx = Math.abs(a[0][2]); p = 0; qi = 2 }
    if (Math.abs(a[1][2]) > mx) { mx = Math.abs(a[1][2]); p = 1; qi = 2 }
    if (mx < 1e-14) break
    const app = a[p][p], aqq = a[qi][qi], apq = a[p][qi]
    const phi = 0.5 * Math.atan2(2 * apq, aqq - app)
    const c = Math.cos(phi), s = Math.sin(phi)
    // 旋转 a = Jᵀ a J
    for (let k = 0; k < 3; k++) {
      const akp = a[k][p], akq = a[k][qi]
      a[k][p] = c * akp - s * akq
      a[k][qi] = s * akp + c * akq
    }
    for (let k = 0; k < 3; k++) {
      const apk = a[p][k], aqk = a[qi][k]
      a[p][k] = c * apk - s * aqk
      a[qi][k] = s * apk + c * aqk
    }
    // 累积特征向量 V = V J
    for (let k = 0; k < 3; k++) {
      const vkp = V[k][p], vkq = V[k][qi]
      V[k][p] = c * vkp - s * vkq
      V[k][qi] = s * vkp + c * vkq
    }
  }
  return { eig: [a[0][0], a[1][1], a[2][2]], vec: V }
}

// 最小特征向量。用于 Gauss-map 轴候选：三角法向散布喺单位球上一个【大圆】（圆柱侧壁法向 ⊥ 轴），
// 法向协方差矩阵嘅【最小特征值】方向 ≈ 轴向。
function smallestEigenvector3(M: number[][]): V3 {
  const { eig, vec } = jacobiEig3(M)
  let mi = 0
  if (eig[1] < eig[mi]) mi = 1
  if (eig[2] < eig[mi]) mi = 2
  return norm([vec[0][mi], vec[1][mi], vec[2][mi]])
}

// 特征值升序 [λ0≤λ1≤λ2]。用于散度守衛：λ1 反映"第二主展布方向"强度（平面≈0，圆柱显著）。
function sortedEigenvalues3(M: number[][]): [number, number, number] {
  const { eig } = jacobiEig3(M)
  const e = eig.slice().sort((a, b) => a - b)
  return [e[0], e[1], e[2]]
}

// Kåsa 代数圆拟合：一堆 2D 点 (u,v) 拟合圆心+半径。解线性系统（最小二乘），返回 { cu,cv,r,rms }。
function fitCircleKasa(us: number[], vs: number[]): { cu: number; cv: number; r: number; rms: number } | null {
  const n = us.length
  if (n < 3) return null
  // 最小二乘：u²+v² = 2·cu·u + 2·cv·v + (r²−cu²−cv²)。设 A=[2u,2v,1], b=u²+v²，解 x=[cu,cv,c]。
  let Suu = 0, Suv = 0, Svv = 0, Su = 0, Sv = 0, Sn = n
  let Sbu = 0, Sbv = 0, Sb = 0
  for (let i = 0; i < n; i++) {
    const u = us[i], v = vs[i], b = u * u + v * v
    Suu += u * u; Suv += u * v; Svv += v * v; Su += u; Sv += v
    Sbu += b * u; Sbv += b * v; Sb += b
  }
  // 正规方程 M·x = r，M = AᵀA（用 2u,2v,1 展开），这里直接用 (u,v,1) 基再折算。
  // 用 A=[u,v,1] 拟 b = D·u + E·v + F，则 cu=D/2, cv=E/2, r²=F+cu²+cv²。
  const M = [
    [Suu, Suv, Su],
    [Suv, Svv, Sv],
    [Su, Sv, Sn],
  ]
  const rhs = [Sbu, Sbv, Sb]
  const sol = solve3(M, rhs)
  if (!sol) return null
  const [D, E, F] = sol
  const cu = D / 2, cv = E / 2
  const r2 = F + cu * cu + cv * cv
  if (!(r2 > 0)) return null
  const r = Math.sqrt(r2)
  let ss = 0
  for (let i = 0; i < n; i++) { const du = us[i] - cu, dv = vs[i] - cv; const dev = Math.hypot(du, dv) - r; ss += dev * dev }
  return { cu, cv, r, rms: Math.sqrt(ss / n) }
}

// 3×3 线性解（Cramer；奇异返回 null）
function solve3(M: number[][], b: number[]): [number, number, number] | null {
  const det = (m: number[][]): number =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  const D = det(M)
  if (Math.abs(D) < 1e-14) return null
  const col = (i: number): number[][] => M.map((row, r) => row.map((val, c) => (c === i ? b[r] : val)))
  return [det(col(0)) / D, det(col(1)) / D, det(col(2)) / D]
}

// 单个候选种子长出一个圆柱区：BFS 收【法向 ⊥ 轴（|n·a| < sin(angTol)）】嘅连通三角。
function growCylRegion(topo: Topo, seed: number, axis: V3, sinTol: number, used: Uint8Array): number[] {
  const region: number[] = []
  const stack = [seed]
  const localSeen = new Set<number>([seed])
  while (stack.length) {
    const t = stack.pop() as number
    if (used[t]) continue
    if (topo.triA[t] <= 0) continue
    if (Math.abs(dot(topo.triN[t], axis)) >= sinTol) continue  // 法向唔够⊥轴 → 唔属呢个圆柱
    region.push(t)
    for (const o of topo.neighbors(t)) {
      if (localSeen.has(o) || used[o]) continue
      if (topo.triA[o] <= 0) continue
      if (Math.abs(dot(topo.triN[o], axis)) >= sinTol) continue
      localSeen.add(o); stack.push(o)
    }
  }
  return region
}

// 尝试把一组三角拟合成圆柱：估轴（Gauss-map 最小特征向量）→ 长区 → Kåsa 圆拟合 → 参数范围 → 守衛。
// 返回 { prim, tris } 或 null。tris = 实际归入嘅三角（用于标记 used + faceted 计数）。
function tryFitCylinder(
  topo: Topo, seed: number, used: Uint8Array,
  sinTol: number, rmsFracTol: number, minTri: number, gapTolRad: number,
): { prim: CylPrim; tris: number[] } | null {
  // ① 轴候选：由 seed 出发收【曲率连续】邻域（相邻三角法向夹角 ≤ curveTol，跨得过圆柱离散棱、
  //    但跨唔过 B-rep 锐边如盒角），法向散布喺单位球一个大圆 → 协方差【最小特征向量】≈ 轴。
  //    有 gate 好紧要：无 gate 泛洪会由圆柱吞落相邻平面/别嘅圆柱，令轴估计与圆拟合都坏。
  const curveTol = Math.cos((30 * Math.PI) / 180)  // 相邻法向夹角 ≤30° 视为同一光滑曲面
  const seedRegion: number[] = []
  {
    const stack = [seed]; const seen = new Set<number>([seed]); let cap = 0
    while (stack.length && cap < 4000) {
      const t = stack.pop() as number; cap++
      if (used[t] || topo.triA[t] <= 0) continue
      seedRegion.push(t)
      const nt = topo.triN[t]
      for (const o of topo.neighbors(t)) {
        if (seen.has(o) || used[o] || topo.triA[o] <= 0) continue
        if (dot(nt, topo.triN[o]) < curveTol) continue  // 跨过锐边（盒角/平面-圆柱交界）→ 唔收
        seen.add(o); stack.push(o)
      }
    }
  }
  if (seedRegion.length < minTri) return null
  // 法向协方差矩阵（面积加权）
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  for (const t of seedRegion) {
    const n = topo.triN[t], w = topo.triA[t]
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M[i][j] += w * n[i] * n[j]
  }
  // 前置散度守衛：若区法向几乎一致（平坦面），协方差最小/最大特征值比 → 大 gap = 平面，唔当圆柱。
  // 圆柱侧壁法向散喺大圆：最大 & 次大特征值相近（大），最小特征值≈0（沿轴）。平面：只有一个大特征值。
  const eig = sortedEigenvalues3(M)  // 升序 [λ0,λ1,λ2]
  const totA = seedRegion.reduce((s, t) => s + topo.triA[t], 0) || 1
  // 次大特征值 λ1 归一（除总面积）反映"第二个展布方向"强度；平面≈0，圆柱显著>0
  if (eig[1] / totA < 0.02) return null  // 展布近一维（平面/棱柱面）→ 唔当圆柱，留俾平面阶段
  const axis0 = smallestEigenvector3(M)
  if (len(axis0) < 0.5) return null

  // ② 用 axis0 严格 region-grow（|n·axis| < sinTol）
  let region = growCylRegion(topo, seed, axis0, sinTol, used)
  if (region.length < minTri) return null

  // ③ 用长出嘅区【重估轴】（更准）→ 再 grow 一次（迭代精化）
  const M2 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  for (const t of region) { const n = topo.triN[t], w = topo.triA[t]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M2[i][j] += w * n[i] * n[j] }
  const axis = smallestEigenvector3(M2)
  region = growCylRegion(topo, seed, axis, sinTol, used)
  if (region.length < minTri) return null

  // ④ Kåsa 圆拟合：把区内规范顶点投影到 ⊥axis 平面（(refU,refV) 基），拟合圆。
  const refU = pickPerp(axis)
  const refV = norm(cross(axis, refU))
  const vset = new Set<number>()
  for (const t of region) { const w = topo.triW(t); vset.add(w[0]); vset.add(w[1]); vset.add(w[2]) }
  const ids = [...vset]
  const us: number[] = [], vs: number[] = [], hs: number[] = []
  for (const id of ids) {
    const p = topo.canonPos[id]
    us.push(dot(p, refU)); vs.push(dot(p, refV)); hs.push(dot(p, axis))
  }
  const fit = fitCircleKasa(us, vs)
  if (!fit || fit.r < 1e-4) return null

  // ⑤ RMS 守衛：径向 rms/r 太大 = 唔系干净圆柱 → 拒（当 faceted）
  if (fit.rms / fit.r > rmsFracTol) return null

  // ⑥ 参数范围：沿轴 [h0,h1]，周向角范围（θ 最大 gap 判 full/partial）
  let h0 = Infinity, h1 = -Infinity
  const thetas: number[] = []
  for (let i = 0; i < ids.length; i++) {
    if (hs[i] < h0) h0 = hs[i]
    if (hs[i] > h1) h1 = hs[i]
    const th = Math.atan2(vs[i] - fit.cv, us[i] - fit.cu)  // [-π,π]
    thetas.push(th)
  }
  // 圆心喺 axis 上嘅点：origin = cu*refU + cv*refV（h=0 平面上），加上沿轴 h 由 h 参数带出
  const origin: V3 = add(scale(refU, fit.cu), scale(refV, fit.cv))
  // θ 范围：排序找最大 gap；gap（含跨 -π/π 环绕）< gapTol → full
  thetas.sort((a, b) => a - b)
  let maxGap = -1, gapAt = 0
  for (let i = 0; i < thetas.length; i++) {
    const nx = i + 1 < thetas.length ? thetas[i + 1] : thetas[0] + 2 * Math.PI
    const g = nx - thetas[i]
    if (g > maxGap) { maxGap = g; gapAt = i }
  }
  let full = false, t0 = -Math.PI, t1 = Math.PI
  if (maxGap < gapTolRad) {
    full = true; t0 = -Math.PI; t1 = Math.PI
  } else {
    // 部分：占用区间 = gap 之外。占用起点 = gap 之后那个 θ，终点 = gap 之前那个（环绕 +2π）
    t0 = thetas[(gapAt + 1) % thetas.length]
    t1 = thetas[gapAt]
    if (t1 < t0) t1 += 2 * Math.PI
    full = false
  }

  let area = 0
  for (const t of region) area += topo.triA[t]

  const prim: CylPrim = {
    kind: 'cyl', axis: norm(axis), origin, r: fit.r,
    h0, h1, t0, t1, full, refU, area, rms: fit.rms, triIndices: region,
  }
  return { prim, tris: region }
}

// 拣一个 ⊥ 给定轴嘅单位向量（稳健：避开与 axis 平行嘅基轴）
function pickPerp(axis: V3): V3 {
  const ax = Math.abs(axis[0]), ay = Math.abs(axis[1]), az = Math.abs(axis[2])
  const base: V3 = ax <= ay && ax <= az ? [1, 0, 0] : ay <= az ? [0, 1, 0] : [0, 0, 1]
  return norm(cross(axis, base))
}

// ───────────────────────── 编排 fitPrimitives（B1+B2 统一入口）─────────────────────────

/**
 * 把三角网格分析成参数化基元（平面 + 圆柱）。纯函数、可在 Node 测。
 * @param vertices 扁平 [x,y,z,...]（ArrayLike，Float32Array/number[] 皆可）
 * @param triangles 扁平索引 [i0,i1,i2,...]
 * @param opts 容差选项（尺度自适应默认；一般只需传 diag）
 * @returns MeshFitResult：基元（面积降序）+ faceted 计数
 */
export function fitPrimitives(vertices: ArrayLike<number>, triangles: ArrayLike<number>, opts: FitOptions = {}): MeshFitResult {
  const nT = Math.floor(triangles.length / 3)
  if (nT === 0) return { primitives: [], planeCount: 0, cylCount: 0, facetedTriCount: 0, totalTriCount: 0 }

  // 尺度自适应容差
  let diag = opts.diag
  if (diag == null) {
    let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i] as number, y = vertices[i + 1] as number, z = vertices[i + 2] as number
      if (x < mnx) mnx = x; if (y < mny) mny = y; if (z < mnz) mnz = z
      if (x > mxx) mxx = x; if (y > mxy) mxy = y; if (z > mxz) mxz = z
    }
    diag = Math.hypot(mxx - mnx, mxy - mny, mxz - mnz) || 1
  }
  const planeAngleTolDeg = opts.planeAngleTolDeg ?? 8
  const planeDistTol = opts.planeDistTol ?? Math.max(0.05, diag * 0.003)
  const planeRmsTol = opts.planeRmsTol ?? Math.max(0.05, diag * 0.004)
  const cylAngleTolDeg = opts.cylAngleTolDeg ?? 12
  const sinTol = Math.sin((cylAngleTolDeg * Math.PI) / 180)
  const cylRmsFracTol = opts.cylRmsFracTol ?? 0.06
  const minCylTri = opts.minCylTri ?? 8
  const gapTolRad = ((opts.gapTolDeg ?? 40) * Math.PI) / 180

  // 焊接容差同 meshSegment 一致（distTol*0.05）
  const topo = buildTopo(vertices, triangles, planeDistTol * 0.05)

  const used = new Uint8Array(nT)          // 已归入某基元嘅三角
  const primitives: MeshPrim[] = []

  // ── B2 先行：圆柱识别（喺全部三角）──
  // 【圆柱优先】编排：一段 faceted 圆柱嘅每块平段本身系 tiny 平面，若先做平面会吞晒圆柱三角令圆柱冇得识别。
  // 反之圆柱识别对平坦面有散度守衛（sortedEigenvalues3 λ1 门槛）自然拒绝盒面 → 唔会误吞平面。故先圆柱后平面。
  const order: number[] = []
  for (let t = 0; t < nT; t++) if (topo.triA[t] > 0) order.push(t)
  order.sort((a, b) => topo.triA[b] - topo.triA[a])  // 大三角优先做种子（稳）
  for (const seed of order) {
    if (used[seed]) continue
    const fit = tryFitCylinder(topo, seed, used, sinTol, cylRmsFracTol, minCylTri, gapTolRad)
    if (!fit) continue
    for (const t of fit.tris) used[t] = 1
    primitives.push(fit.prim)
  }

  // ── B1 后行：平面区（复用 segmentPlanarRegions）→ PlanePrim（含边界环）──
  // segmentPlanarRegions 喺全部三角跑（佢唔接排除集）；但只接受【未被圆柱佔用】嘅区：区内 unused 三角
  // 占多数先当真平面，跳过与圆柱重叠嘅碎区（圆柱段被切出嘅假平面区，其三角已 used）。
  const regions = segmentPlanarRegions(vertices, triangles, planeAngleTolDeg, planeDistTol)
  for (const reg of regions) {
    const freeTris = reg.triIndices.filter((t) => !used[t])
    if (freeTris.length === 0) continue                  // 全被圆柱吞 → 唔系独立平面
    if (freeTris.length < reg.triIndices.length * 0.5) continue  // 多数被圆柱吞 → 跳（碎片）
    const prim = buildPlanePrim(topo, { normal: reg.normal as V3, d: reg.d, area: reg.area, triIndices: freeTris }, planeRmsTol)
    if (!prim) continue
    primitives.push(prim)
    for (const t of freeTris) used[t] = 1
  }

  // 未归入任何基元嘅三角 = faceted
  let facetedTriCount = 0
  for (let t = 0; t < nT; t++) if (!used[t]) facetedTriCount++

  primitives.sort((a, b) => b.area - a.area)
  const planeCount = primitives.filter((p) => p.kind === 'plane').length
  const cylCount = primitives.filter((p) => p.kind === 'cyl').length
  return { primitives, planeCount, cylCount, facetedTriCount, totalTriCount: nT }
}

// ───────────────────────── §boundaryLoops 语义（B4 worker 重建需知）─────────────────────────
//
// PlanePrim.boundaryLoops：number[][][] = 每平面区嘅边界环列表。
//   • 每个 loop = 一串 3D 顶点坐标 [[x,y,z], ...]，【首尾唔重复】（隐式闭合：last 连回 first）。
//   • loops[0] = 外环，逆时针（CCW）相对 normal（右手定则：拇指沿 normal，四指绕 loop 方向）。
//   • loops[1..] = 内环 = 孔，顺时针（CW）相对 normal（与外环相反 winding）→ B4 可直接用于修剪（trim）。
//   • 顶点系【焊接后规范位置】（重合顶点已合并），故环上相邻点唔会重复；共线点未简化（B4 可自行 collinear-merge）。
//   • 单环（无孔）→ boundaryLoops.length===1；带孔 → ≥2；退化 patch 可能空 []（B4 应 fallback faceted）。
//
// B4 重建平面面：以 normal·x=d 建平面，用 loops[0] 做外轮廓、loops[1..] 做孔，投影到平面 UV 建修剪面。
// B4 重建圆柱面：CylPrim 给 axis/origin/r/[h0,h1]/[t0,t1]/full/refU；full=true 建闭合圆柱侧面，
//   否则建 [t0,t1] 弧段（周向 0 角 = refU 方向，正向 = axis×refU）。origin 系 h=0 平面上嘅圆心。

// ───────────────────────── #2b Mesh→B-rep v2：box − cylinder 布尔重建（分析层） ─────────────────────────
// 从 fitPrimitives 结果识别【轴对齐盒 + 圆柱孔】→ worker 用高阶 makeBox/makeCylinder 布尔重建成参数化实体。
// 纯几何、零内核、Node 可测（worker build + store 侦测【共用】呢两个函数，唔重复）。v2.0 = HOLES-ONLY（凸台/斜孔/圆角边 → 返 null，caller 退 faceted，诚实）。

export interface AxisBox { min: [number, number, number]; max: [number, number, number]; dims: [number, number, number] }
export interface BoxCylTool { kind: 'hole'; base: [number, number, number]; len: number; r: number; axis: [number, number, number] }

/** 从平面基元识别单一轴对齐盒。6 世界方向各要有代表面 + 盒面覆盖 ≥80% 总平面面积（拒 L 形/多盒）。返 null = 唔系单盒。 */
export function detectAxisBox(fit: MeshFitResult, diag: number): AxisBox | null {
  const planes = fit.primitives.filter((p): p is PlanePrim => p.kind === 'plane')
  if (planes.length < 6) return null
  const AXIS_DOT = 0.985
  const DTOL = Math.max(0.05, diag * 0.01)
  const DIRS: [number, number][] = [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]]   // [轴序, 正负号]
  const bins: (PlanePrim | null)[] = [null, null, null, null, null, null]                // 每方向留最大面积代表
  const binArea = [0, 0, 0, 0, 0, 0]
  let totalPlaneArea = 0
  for (const p of planes) {
    totalPlaneArea += p.area
    let matched = -1
    for (let d = 0; d < 6; d++) { const [ax, sg] = DIRS[d]; if (p.normal[ax] * sg >= AXIS_DOT) { matched = d; break } }
    if (matched < 0) continue                                                            // 斜面 → 忽略
    binArea[matched] += p.area
    if (!bins[matched] || p.area > bins[matched]!.area) bins[matched] = p
  }
  for (let d = 0; d < 6; d++) if (!bins[d]) return null                                   // 有方向缺面 → 唔系闭合盒
  const faceCoord = (d: number) => { const p = bins[d]!; const ax = DIRS[d][0]; return p.d / p.normal[ax] }   // signed-component 投影，抗近轴噪声
  const maxX = faceCoord(0), minX = faceCoord(1), maxY = faceCoord(2), minY = faceCoord(3), maxZ = faceCoord(4), minZ = faceCoord(5)
  const dx = maxX - minX, dy = maxY - minY, dz = maxZ - minZ
  if (!(dx > DTOL * 2 && dy > DTOL * 2 && dz > DTOL * 2)) return null                     // 正体积
  const boxArea = binArea.reduce((a, b) => a + b, 0)
  if (boxArea < totalPlaneArea * 0.80) return null                                        // 盒面覆盖 <80% → L 形/多盒/杂面 → bail
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ], dims: [dx, dy, dz] }
}

/**
 * Strict replacement gate for Simplify → Replace with Primitive.
 * This deliberately accepts only a clean, hole-free axis-aligned rectangular solid:
 * six planar regions, no cylindrical/faceted remainder, one boundary loop per face,
 * and surface area matching the derived dimensions.  It is stricter than detectAxisBox
 * because replacement must never turn a detailed part into an approximate box.
 */
export function detectExactAxisBox(fit: MeshFitResult, diag: number): AxisBox | null {
  const box = detectAxisBox(fit, diag)
  if (!box || fit.totalTriCount <= 0 || fit.facetedTriCount !== 0 || fit.cylCount !== 0 || fit.planeCount !== 6) return null
  const planes = fit.primitives.filter((p): p is PlanePrim => p.kind === 'plane')
  if (planes.length !== 6 || planes.some((p) => p.boundaryLoops.length !== 1 || p.rms > Math.max(0.02, diag * 0.0005))) return null
  const [x, y, z] = box.dims
  const expectedArea = 2 * (x * y + x * z + y * z)
  const actualArea = planes.reduce((sum, p) => sum + p.area, 0)
  if (Math.abs(actualArea - expectedArea) > Math.max(expectedArea * 0.005, diag * diag * 0.001)) return null
  return box
}

/** Strict, lossless gate for a Z-axis solid cylinder with two unperforated planar caps. */
export function detectExactZCylinder(fit: MeshFitResult, diag: number): { center: [number, number]; z0: number; h: number; r: number } | null {
  if (fit.totalTriCount <= 0 || fit.facetedTriCount !== 0 || fit.cylCount !== 1 || fit.planeCount !== 2) return null
  const cyl = fit.primitives.find((p): p is CylPrim => p.kind === 'cyl')
  const planes = fit.primitives.filter((p): p is PlanePrim => p.kind === 'plane')
  if (!cyl || !cyl.full || Math.abs(cyl.axis[2]) < 0.985 || planes.length !== 2 || planes.some((p) => p.boundaryLoops.length !== 1 || Math.abs(p.normal[2]) < 0.985)) return null
  const zA = cyl.origin[2] + cyl.h0 * cyl.axis[2], zB = cyl.origin[2] + cyl.h1 * cyl.axis[2]
  const z0 = Math.min(zA, zB), z1 = Math.max(zA, zB), h = z1 - z0
  if (!(cyl.r > Math.max(0.02, diag * 0.0005) && h > Math.max(0.02, diag * 0.0005))) return null
  const capZ = planes.map((p) => p.d / p.normal[2]).sort((a, b) => a - b)
  const tol = Math.max(0.03, diag * 0.003)
  if (Math.abs(capZ[0] - z0) > tol || Math.abs(capZ[1] - z1) > tol) return null
  const expectedArea = 2 * Math.PI * cyl.r * h + 2 * Math.PI * cyl.r * cyl.r
  const actualArea = fit.primitives.reduce((sum, p) => sum + p.area, 0)
  if (Math.abs(actualArea - expectedArea) > Math.max(expectedArea * 0.01, diag * diag * 0.002)) return null
  return { center: [cyl.origin[0], cyl.origin[1]], z0, h, r: cyl.r }
}

/** Strict closed-sphere gate. Checks vertices, triangle centroids and welded manifold edges. */
export function detectExactSphere(vertices: ArrayLike<number>, triangles: ArrayLike<number>, diag?: number): { center: [number, number, number]; r: number } | null {
  if (vertices.length < 12 || triangles.length < 12) return null
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (let i = 0; i + 2 < vertices.length; i += 3) { const x = vertices[i], y = vertices[i + 1], z = vertices[i + 2]; minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z) }
  const span = diag ?? Math.hypot(maxX - minX, maxY - minY, maxZ - minZ)
  const r = (maxX - minX + maxY - minY + maxZ - minZ) / 6
  const center: [number, number, number] = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2]
  const tol = Math.max(0.03, span * 0.003)
  if (!(r > tol) || Math.abs((maxX - minX) - 2 * r) > tol || Math.abs((maxY - minY) - 2 * r) > tol || Math.abs((maxZ - minZ) - 2 * r) > tol) return null
  const dist = (x: number, y: number, z: number) => Math.hypot(x - center[0], y - center[1], z - center[2])
  // Edge welding must be much tighter than the surface-fit tolerance.  A
  // coarse tolerance can merge adjacent UV-sphere vertices near a pole and
  // falsely turn a valid manifold into a non-manifold shell.
  const weldTol = Math.max(1e-7, tol * 0.25)
  const vkey = (i: number) => `${Math.round((vertices[i * 3] as number) / weldTol)},${Math.round((vertices[i * 3 + 1] as number) / weldTol)},${Math.round((vertices[i * 3 + 2] as number) / weldTol)}`
  const edges = new Map<string, number>()
  for (let t = 0; t + 2 < triangles.length; t += 3) {
    const ia = triangles[t] as number, ib = triangles[t + 1] as number, ic = triangles[t + 2] as number
    if (![ia, ib, ic].every((i) => Number.isInteger(i) && i >= 0 && i * 3 + 2 < vertices.length) || ia === ib || ib === ic || ia === ic) return null
    const pts = [ia, ib, ic].map((i) => [vertices[i * 3] as number, vertices[i * 3 + 1] as number, vertices[i * 3 + 2] as number])
    if (pts.some((p) => Math.abs(dist(p[0], p[1], p[2]) - r) > tol)) return null
    const cx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3, cy = (pts[0][1] + pts[1][1] + pts[2][1]) / 3, cz = (pts[0][2] + pts[1][2] + pts[2][2]) / 3
    if (Math.abs(dist(cx, cy, cz) - r) > Math.max(tol, r * 0.02)) return null
    for (const [a, b] of [[ia, ib], [ib, ic], [ic, ia]]) { const ka = vkey(a), kb = vkey(b), k = ka < kb ? ka + '|' + kb : kb + '|' + ka; edges.set(k, (edges.get(k) || 0) + 1) }
  }
  if ([...edges.values()].some((n) => n !== 2)) return null
  return { center, r }
}

/** 把圆柱基元分类为【盒内钻孔】并算 makeCylinder(r,len,base,axis) 切割工具。返 null = 唔系干净轴对齐孔（凸台/斜孔/浮孔/半径过大/圆角边）→ 触发 v2 bail。 */
export function classifyBoxHole(box: AxisBox, c: CylPrim, diag: number): BoxCylTool | null {
  if (!c.full) return null                                                               // 部分圆柱（圆角边等）→ 唔当孔
  const AXIS_DOT = 0.985, OVER = Math.max(0.5, diag * 0.02), DTOL = Math.max(0.05, diag * 0.01)
  let ai = -1
  for (let a = 0; a < 3; a++) if (Math.abs(c.axis[a]) >= AXIS_DOT) { ai = a; break }
  if (ai < 0) return null                                                                // 斜圆柱 → bail 整个 v2
  const P = (ai + 1) % 3, Q = (ai + 2) % 3
  const cP = c.origin[P], cQ = c.origin[Q]
  const minP = box.min[P], maxP = box.max[P], minQ = box.min[Q], maxQ = box.max[Q]
  if (c.r > 0.5 * Math.min(maxP - minP, maxQ - minQ)) return null                         // 半径 > 半个横截面 → 唔似孔
  const inside = (cP - c.r >= minP - DTOL) && (cP + c.r <= maxP + DTOL) && (cQ - c.r >= minQ - DTOL) && (cQ + c.r <= maxQ + DTOL)
  if (!inside) return null                                                                // footprint 伸出盒 = 凸台，v2.0 唔支持 → bail
  const e0 = c.origin[ai] + c.h0 * c.axis[ai], e1 = c.origin[ai] + c.h1 * c.axis[ai]
  const lo = Math.min(e0, e1), hi = Math.max(e0, e1)
  const boxLo = box.min[ai], boxHi = box.max[ai]
  if (hi > boxHi + DTOL || lo < boxLo - DTOL) return null                                 // 轴向伸出盒 = stud/凸台 → bail
  const axis: [number, number, number] = [0, 0, 0]; axis[ai] = 1                          // 工具永远 lo→hi 建（+ai），snap 到精确世界轴
  const base: [number, number, number] = [0, 0, 0]; base[P] = cP; base[Q] = cQ
  const atLo = Math.abs(lo - boxLo) < DTOL, atHi = Math.abs(hi - boxHi) < DTOL
  if (atLo && atHi) { base[ai] = boxLo - OVER; return { kind: 'hole', base, len: (boxHi - boxLo) + 2 * OVER, r: c.r, axis } }   // 通孔：两端 overshoot
  if (atHi && !atLo) { base[ai] = lo; return { kind: 'hole', base, len: (boxHi + OVER) - lo, r: c.r, axis } }                   // 盲孔口在 hi
  if (atLo && !atHi) { base[ai] = boxLo - OVER; return { kind: 'hole', base, len: hi - (boxLo - OVER), r: c.r, axis } }         // 盲孔口在 lo
  return null                                                                             // 两端都唔贴盒面（浮孔）→ bail
}
