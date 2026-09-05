// M1 擬合后端（Mesh→B-rep 逆向工程，_mesh2brep_plan.md Phase A / M1）—— 2026-07-25
// ════════════════════════════════════════════════════════════════════════════════════════════
// meshSegment.ts 嘅新管線分割出【区】，呢度逐区擬合解析基元：plane / sphere / cylinder / cone /
// torus（只做圆角带）/ freeform，再做【约束 snap】（全域轴、共轴、平行、垂直、等半径）。
// 输出 SegmentationResult 系 M2（FitWrapper 内核 wrapper）同 M3（Tier-1 重建）嘅唯一合约。
//
// 同现有 meshFit.ts::fitPrimitives 嘅关系：fitPrimitives 系 S46 窄版（plane + cylinder，服务窄
// param/prismatic 路径），【一行都唔改，继续跑】。呢个模块系新管線嘅超集，两者并存（零回歸律）。
//
// 设计要点（点解咁做）：
//  ① 擬合系【几何最小二乘】唔係代数最小二乘：代数解只做初值，最后一定 LM 收敛到真正嘅点面距离最小，
//     否则部分弧/短圆柱嘅半径会系统性偏细（代数擬合嘅经典偏差）。
//  ② 模型选择用【简约律 parsimony】：复杂基元要赢简单者 ≥2× RMS 先上位。唔係咁嘅话，一个平面
//     永远可以用「半径 10 米嘅圆柱」擬到 RMS 更细一皮 → 出返嚟嘅 B-rep 会係一堆假圆柱，冇得编辑。
//  ③ 双门槛（Schnabel）：距离 ε 同法向偏差 α 两条都要过 —— 净睇距离会接受「法向乱晒但啱啱好贴面」
//     嘅噪声区。
//  ④ snap 系「睇落似 CAD」而唔係「似量度」嘅关键：0.4998° 嘅倾角同 12.0003mm 嘅半径，人眼一睇就
//     知係逆向出嚟嘅嘢。raw 同 snapped 两套都返，UI 可以逐条 snap 俾用户覆核。
//
// 纯计算、零依赖、零 DOM → worker 直接跑，Node 可测（src/geom/__tests__/mesh2brep.selfcheck.test.ts）。

import { segmentMesh, buildRegionTopology, collectRegionVerts, symEig3, perpAxis } from './meshSegment.ts'
import type { MeshRegion, SegmentOptions, Vec3, WeldedMesh, MeshTopology } from './meshSegment.ts'

// ═══════════════════════════════════ 输出合约（M2/M3 照呢度写）═══════════════════════════════════

export type PrimitiveKind = 'plane' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'freeform'

/** 平面：normal·x = d，point 系区形心喺平面上嘅投影（建面时嘅原点）。 */
export interface PlaneParams { kind: 'plane'; normal: Vec3; d: number; point: Vec3 }

/** 球：centre + radius。 */
export interface SphereParams { kind: 'sphere'; centre: Vec3; radius: number }

/**
 * 圆柱：轴 axis 过 point（point = 区形心喺轴上嘅投影），半径 radius。
 * 参数范围：沿轴 [hMin,hMax]（相对 point），周向 [tMin,tMax]（rad，0 角 = refU 方向，正向 = axis×refU）。
 * convex = 网格法向指离轴（实心柱）；false = 指向轴（孔）。
 */
export interface CylinderParams {
  kind: 'cylinder'; axis: Vec3; point: Vec3; radius: number
  hMin: number; hMax: number; refU: Vec3; tMin: number; tMax: number; full: boolean; convex: boolean
}

/**
 * 圆锥：apex + 轴 axis（由顶点指向【材料所在嗰边】）+ 半顶角 halfAngleDeg。
 * [hMin,hMax] = 沿轴距顶点嘅范围；对应半径 = h*tan(halfAngle)。
 */
export interface ConeParams {
  kind: 'cone'; apex: Vec3; axis: Vec3; halfAngleDeg: number
  hMin: number; hMax: number; refU: Vec3; tMin: number; tMax: number; full: boolean; convex: boolean
}

/** 圆环面（v1 只用嚟表达圆角带 blend）：spine 圆 = centre/axis/majorRadius，截面半径 minorRadius。 */
export interface TorusParams {
  kind: 'torus'; centre: Vec3; axis: Vec3; majorRadius: number; minorRadius: number; convex: boolean
}

/** 擬唔到任何基元 → 自由曲面（交俾 M7 NURBS quilt 路径）。 */
export interface FreeformParams { kind: 'freeform' }

export type PrimitiveParams = PlaneParams | SphereParams | CylinderParams | ConeParams | TorusParams | FreeformParams

/** 模型选择过程嘅证据（UI 逐区覆核 / debug 用）。 */
export interface FitCandidateInfo { kind: PrimitiveKind; rms: number; normalDevDeg: number; accepted: boolean; note: string }

export interface FittedRegion {
  index: number
  kind: PrimitiveKind
  params: PrimitiveParams          // 原始擬合（未 snap）
  paramsSnapped: PrimitiveParams   // snap 后（冇 snap 到就同 params 同值）
  rmsError: number                 // 区顶点到擬合面嘅 RMS 距离（mm）
  maxError: number                 // 最大偏差（mm）
  normalDevDeg: number             // 三角法向 vs 解析法向嘅平均夹角（°）
  area: number
  triCount: number
  vertCount: number
  triIndices: Uint32Array          // 焊接后三角序号（索引 SegmentationResult.tris）
  boundaryLoops: Uint32Array[]     // 边界环 = 焊接顶点 id 链（首尾唔重复，隐式闭合；外环 CCW 相对面法向，孔 CW）
  arcCoverageDeg?: number          // 圆柱/锥/环：周向覆盖角
  illConditioned?: boolean         // 病态（弧太短 / 半径大到荒谬）→ M2 应该退階
  isBlend?: boolean                // 系圆角带（constant-radius blend）
  blendRadius?: number             // 圆角半径（isBlend 时）
  candidates: FitCandidateInfo[]
}

export interface AppliedSnap {
  kind: 'axisGlobal' | 'coaxial' | 'parallel' | 'perpendicular' | 'equalRadius' | 'roundRadius'
  regions: number[]
  applied: boolean                 // false = 只侦测/建议（例如 roundRadii 默认关）
  detail: string
  before: number                   // 数值读数（° / mm，睇 kind）
  after: number
}

export interface SegmentationResult {
  regions: FittedRegion[]
  adjacency: [number, number][]    // 区对邻接
  snaps: AppliedSnap[]
  // ── 几何底座（boundaryLoops / triIndices 嘅索引空间；M2/M3 直接读）──
  verts: Float64Array              // 焊接后顶点 [x,y,z,...]
  tris: Uint32Array                // 焊接后三角（索引 verts）
  triSrc: Uint32Array              // 焊接后三角 → 原三角序号
  labels: Int32Array               // 焊接后三角 → regions[] 序号
  diag: number
  stats: {
    tris: number; weldedVerts: number; msSegment: number; msFit: number
    regions: number; freeformRegions: number; recognizedAreaFrac: number
    openLoops: number; droppedTris: number; nonManifoldEdges: number; merges: number
  }
}

export interface ReverseFitOptions extends SegmentOptions {
  epsDist?: number            // 距离容差 ε。默认 1e-3 × bbox 对角
  normalDevTolDeg?: number    // 法向偏差容差 α。默认 15
  parsimonyRatio?: number     // 复杂基元要赢简单者几多倍 RMS。默认 2
  minArcDeg?: number          // 圆柱/锥周向覆盖不足 → 病态旗。默认 35
  maxFitPoints?: number       // LM 取样上限（大区抽样，量度仍用全部点）。默认 3000
  mergeSameSurface?: boolean  // 合并「同一张解析面」嘅相邻区。默认 true
  refineBoundaries?: boolean  // 边界精修 / 碎区收编。默认 true
  minReliableTris?: number    // 细过此值嘅区「唔可信」，会俾邻区收编。默认 4
  snap?: boolean              // 做约束 snap。默认 true
  snapAngleDeg?: number       // 轴/平行/垂直角容差。默认 1
  snapDistTol?: number        // 共轴距离容差。默认 max(ε*2, diag*2e-3)
  equalRadiusRelTol?: number  // 等半径聚类相对容差。默认 0.01
  roundRadii?: boolean        // 圆整半径（默认 false → 只 flag）
  roundRadiusStep?: number    // 圆整格。默认 0.5mm
}

// ═══════════════════════════════════ 小工具 ═══════════════════════════════════

const dot3 =(a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm3 = (a: Vec3): Vec3 => { const L = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / L, a[1] / L, a[2] / L] }
const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x)
const RAD = Math.PI / 180
const DEG = 180 / Math.PI

/** 单位向量夹角（°），永远 0..180。 */
const angDeg = (a: Vec3, b: Vec3): number => Math.acos(clamp(dot3(a, b), -1, 1)) * DEG
/** 唔理方向嘅夹角（°），0..90 —— 轴系无向嘅，平行 = 0。 */
const angAxisDeg = (a: Vec3, b: Vec3): number => Math.acos(clamp(Math.abs(dot3(a, b)), 0, 1)) * DEG

/** 轴方向规范化：拣一个确定嘅符号（最大分量为正），令共轴/平行比较同快照唔会受任意符号影响。 */
function canonicalDir(a: Vec3): Vec3 {
  const ax = Math.abs(a[0]), ay = Math.abs(a[1]), az = Math.abs(a[2])
  const k = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2
  return a[k] < 0 ? [-a[0], -a[1], -a[2]] : [a[0], a[1], a[2]]
}

// ═══════════════════════════════════ 线代 / LM ═══════════════════════════════════

/** n×n 线性方程组（高斯消元 + 部分选主元）。A/b 会被就地改。返 false = 奇异。 */
function solveLin(A: Float64Array, b: Float64Array, x: Float64Array, n: number): boolean {
  for (let c = 0; c < n; c++) {
    let piv = c, mx = Math.abs(A[c * n + c])
    for (let r = c + 1; r < n; r++) { const v = Math.abs(A[r * n + c]); if (v > mx) { mx = v; piv = r } }
    if (!(mx > 1e-300)) return false
    if (piv !== c) {
      for (let k = 0; k < n; k++) { const t = A[c * n + k]; A[c * n + k] = A[piv * n + k]; A[piv * n + k] = t }
      const t = b[c]; b[c] = b[piv]; b[piv] = t
    }
    const d = A[c * n + c]
    for (let r = c + 1; r < n; r++) {
      const f = A[r * n + c] / d
      if (f === 0) continue
      for (let k = c; k < n; k++) A[r * n + k] -= f * A[c * n + k]
      b[r] -= f * b[c]
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r]
    for (let k = r + 1; k < n; k++) s -= A[r * n + k] * x[k]
    const d = A[r * n + r]
    if (!(Math.abs(d) > 1e-300)) return false
    x[r] = s / d
  }
  return true
}

/**
 * LM 问题：prepare(p) 一次过算好衍生量（轴、中心…），res(i) 再逐点出残差。
 * 咁样 Jacobian 数值差分只需 (np+1) 次 prepare（唔係 n×(np+1) 次），大区先跑得郁。
 */
interface LmProblem { np: number; n: number; prepare(p: Float64Array): void; res(i: number): number }

/** Levenberg-Marquardt（前向差分 Jacobian）。就地改 p，返最终 RMS。 */
function lmSolve(p: Float64Array, prob: LmProblem, maxIter = 25): number {
  const np = prob.np, n = prob.n
  const cost = (q: Float64Array): number => { prob.prepare(q); let s = 0; for (let i = 0; i < n; i++) { const r = prob.res(i); s += r * r } return s }
  let f0 = cost(p)
  if (n < np + 1) { prob.prepare(p); return Math.sqrt(f0 / Math.max(1, n)) }
  const J = new Float64Array(n * np)
  const r0 = new Float64Array(n)
  const JtJ = new Float64Array(np * np), Jtr = new Float64Array(np)
  const A = new Float64Array(np * np), b = new Float64Array(np), dx = new Float64Array(np), trial = new Float64Array(np)
  let lambda = 1e-4
  for (let iter = 0; iter < maxIter; iter++) {
    prob.prepare(p)
    for (let i = 0; i < n; i++) r0[i] = prob.res(i)
    for (let k = 0; k < np; k++) {
      const save = p[k]
      const h = Math.max(1e-7, Math.abs(save) * 1e-6)
      p[k] = save + h
      prob.prepare(p)
      const invh = 1 / h
      for (let i = 0; i < n; i++) J[i * np + k] = (prob.res(i) - r0[i]) * invh
      p[k] = save
    }
    JtJ.fill(0); Jtr.fill(0)
    for (let i = 0; i < n; i++) {
      const base = i * np, ri = r0[i]
      for (let k = 0; k < np; k++) {
        const jk = J[base + k]
        Jtr[k] += jk * ri
        for (let l = k; l < np; l++) JtJ[k * np + l] += jk * J[base + l]
      }
    }
    for (let k = 0; k < np; k++) for (let l = 0; l < k; l++) JtJ[k * np + l] = JtJ[l * np + k]
    let stepped = false
    for (let attempt = 0; attempt < 10; attempt++) {
      A.set(JtJ)
      for (let k = 0; k < np; k++) A[k * np + k] += lambda * (JtJ[k * np + k] || 1)
      for (let k = 0; k < np; k++) b[k] = -Jtr[k]
      if (solveLin(A, b, dx, np)) {
        for (let k = 0; k < np; k++) trial[k] = p[k] + dx[k]
        const f1 = cost(trial)
        if (f1 <= f0) {
          const rel = (f0 - f1) / (f0 || 1)
          p.set(trial); f0 = f1
          lambda = Math.max(1e-12, lambda * 0.3)
          stepped = true
          if (rel < 1e-11) { prob.prepare(p); return Math.sqrt(f0 / n) }
          break
        }
      }
      lambda *= 10
      if (lambda > 1e14) break
    }
    if (!stepped) break
  }
  prob.prepare(p)
  return Math.sqrt(f0 / n)
}

// ═══════════════════════════════════ 代数初值 ═══════════════════════════════════

/** Kåsa 2D 代数圆擬合（最小二乘线性解）。返 null = 退化。 */
function circleKasa(us: Float64Array, vs: Float64Array, n: number): { cu: number; cv: number; r: number } | null {
  if (n < 3) return null
  const M = new Float64Array(9), rhs = new Float64Array(3), sol = new Float64Array(3)
  for (let i = 0; i < n; i++) {
    const u = us[i], v = vs[i], w = u * u + v * v
    const a0 = 2 * u, a1 = 2 * v, a2 = 1
    M[0] += a0 * a0; M[1] += a0 * a1; M[2] += a0 * a2
    M[4] += a1 * a1; M[5] += a1 * a2
    M[8] += a2 * a2
    rhs[0] += a0 * w; rhs[1] += a1 * w; rhs[2] += a2 * w
  }
  M[3] = M[1]; M[6] = M[2]; M[7] = M[5]
  if (!solveLin(M, rhs, sol, 3)) return null
  const r2 = sol[2] + sol[0] * sol[0] + sol[1] * sol[1]
  if (!(r2 > 0) || !isFinite(r2)) return null
  return { cu: sol[0], cv: sol[1], r: Math.sqrt(r2) }
}

/** Kåsa 3D 代数球擬合（|p|² = 2c·p + g）。LM 之前嘅初值；单靠佢喺部分球面会偏细。 */
function sphereKasa(P: Float64Array, n: number): { c: Vec3; r: number } | null {
  if (n < 4) return null
  const M = new Float64Array(16), rhs = new Float64Array(4), sol = new Float64Array(4)
  const a = new Float64Array(4)
  for (let i = 0; i < n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]
    a[0] = 2 * x; a[1] = 2 * y; a[2] = 2 * z; a[3] = 1
    const w = x * x + y * y + z * z
    for (let k = 0; k < 4; k++) { for (let l = k; l < 4; l++) M[k * 4 + l] += a[k] * a[l]; rhs[k] += a[k] * w }
  }
  for (let k = 0; k < 4; k++) for (let l = 0; l < k; l++) M[k * 4 + l] = M[l * 4 + k]
  if (!solveLin(M, rhs, sol, 4)) return null
  const r2 = sol[3] + sol[0] * sol[0] + sol[1] * sol[1] + sol[2] * sol[2]
  if (!(r2 > 0) || !isFinite(r2)) return null
  return { c: [sol[0], sol[1], sol[2]], r: Math.sqrt(r2) }
}

// ═══════════════════════════════════ LM 问题工厂 ═══════════════════════════════════

interface CylState { axis: Vec3; point: Vec3; radius: number }

/**
 * 圆柱 LM：参数 [cu, cv, R] (+ [du, dv] 轴扰动，fixAxis 时冇)。
 * 轴写成 normalize(a0 + du·u + dv·v)、轴上点写成 O + cu·u + cv·v —— 5 个自由度啱啱好覆盖
 * 「唔平行 u,v 平面」嘅所有直线，冇冗余参数（冗余会令 JᵀJ 奇异）。
 */
function makeCylProblem(P: Float64Array, n: number, a0: Vec3, O: Vec3, fixAxis: boolean): { prob: LmProblem; p: Float64Array; state: CylState } {
  const u = perpAxis(a0), v = norm3(cross3(a0, u))
  const state: CylState = { axis: [a0[0], a0[1], a0[2]], point: [O[0], O[1], O[2]], radius: 0 }
  const p = new Float64Array(fixAxis ? 3 : 5)
  const prepare = (q: Float64Array): void => {
    const du = fixAxis ? 0 : q[3], dv = fixAxis ? 0 : q[4]
    const tx = a0[0] + du * u[0] + dv * v[0], ty = a0[1] + du * u[1] + dv * v[1], tz = a0[2] + du * u[2] + dv * v[2]
    const L = Math.hypot(tx, ty, tz) || 1
    state.axis[0] = tx / L; state.axis[1] = ty / L; state.axis[2] = tz / L
    state.point[0] = O[0] + q[0] * u[0] + q[1] * v[0]
    state.point[1] = O[1] + q[0] * u[1] + q[1] * v[1]
    state.point[2] = O[2] + q[0] * u[2] + q[1] * v[2]
    state.radius = q[2]
  }
  const res = (i: number): number => {
    const wx = P[i * 3] - state.point[0], wy = P[i * 3 + 1] - state.point[1], wz = P[i * 3 + 2] - state.point[2]
    const wa = wx * state.axis[0] + wy * state.axis[1] + wz * state.axis[2]
    const rr = wx * wx + wy * wy + wz * wz - wa * wa
    return Math.sqrt(rr > 0 ? rr : 0) - state.radius
  }
  return { prob: { np: p.length, n, prepare, res }, p, state }
}

interface ConeState { apex: Vec3; axis: Vec3; alpha: number }

/** 圆锥 LM：参数 [apex(3)] (+ [du,dv]) + [alpha]。残差 = ρ·cosα − wa·sinα（= 点到锥面嘅有符号距离）。 */
function makeConeProblem(P: Float64Array, n: number, a0: Vec3, apex0: Vec3, alpha0: number, fixAxis: boolean): { prob: LmProblem; p: Float64Array; state: ConeState } {
  const u = perpAxis(a0), v = norm3(cross3(a0, u))
  const state: ConeState = { apex: [apex0[0], apex0[1], apex0[2]], axis: [a0[0], a0[1], a0[2]], alpha: alpha0 }
  const np = fixAxis ? 4 : 6
  const p = new Float64Array(np)
  p[0] = apex0[0]; p[1] = apex0[1]; p[2] = apex0[2]
  p[np - 1] = alpha0
  let ca = Math.cos(alpha0), sa = Math.sin(alpha0)
  const prepare = (q: Float64Array): void => {
    state.apex[0] = q[0]; state.apex[1] = q[1]; state.apex[2] = q[2]
    const du = fixAxis ? 0 : q[3], dv = fixAxis ? 0 : q[4]
    const tx = a0[0] + du * u[0] + dv * v[0], ty = a0[1] + du * u[1] + dv * v[1], tz = a0[2] + du * u[2] + dv * v[2]
    const L = Math.hypot(tx, ty, tz) || 1
    state.axis[0] = tx / L; state.axis[1] = ty / L; state.axis[2] = tz / L
    state.alpha = q[np - 1]
    ca = Math.cos(state.alpha); sa = Math.sin(state.alpha)
  }
  const res = (i: number): number => {
    const wx = P[i * 3] - state.apex[0], wy = P[i * 3 + 1] - state.apex[1], wz = P[i * 3 + 2] - state.apex[2]
    const wa = wx * state.axis[0] + wy * state.axis[1] + wz * state.axis[2]
    const rr = wx * wx + wy * wy + wz * wz - wa * wa
    return Math.sqrt(rr > 0 ? rr : 0) * ca - wa * sa
  }
  return { prob: { np, n, prepare, res }, p, state }
}

interface TorusState { centre: Vec3; axis: Vec3; R: number; r: number }

/** 圆环面 LM：参数 [c(3)] (+ [du,dv]) + [R, r]。残差 = √((ρ−R)² + wa²) − r。 */
function makeTorusProblem(P: Float64Array, n: number, a0: Vec3, c0: Vec3, R0: number, r0: number, fixAxis: boolean): { prob: LmProblem; p: Float64Array; state: TorusState } {
  const u = perpAxis(a0), v = norm3(cross3(a0, u))
  const state: TorusState = { centre: [c0[0], c0[1], c0[2]], axis: [a0[0], a0[1], a0[2]], R: R0, r: r0 }
  const np = fixAxis ? 5 : 7
  const p = new Float64Array(np)
  p[0] = c0[0]; p[1] = c0[1]; p[2] = c0[2]
  p[np - 2] = R0; p[np - 1] = r0
  const prepare = (q: Float64Array): void => {
    state.centre[0] = q[0]; state.centre[1] = q[1]; state.centre[2] = q[2]
    const du = fixAxis ? 0 : q[3], dv = fixAxis ? 0 : q[4]
    const tx = a0[0] + du * u[0] + dv * v[0], ty = a0[1] + du * u[1] + dv * v[1], tz = a0[2] + du * u[2] + dv * v[2]
    const L = Math.hypot(tx, ty, tz) || 1
    state.axis[0] = tx / L; state.axis[1] = ty / L; state.axis[2] = tz / L
    state.R = q[np - 2]; state.r = q[np - 1]
  }
  const res = (i: number): number => {
    const wx = P[i * 3] - state.centre[0], wy = P[i * 3 + 1] - state.centre[1], wz = P[i * 3 + 2] - state.centre[2]
    const wa = wx * state.axis[0] + wy * state.axis[1] + wz * state.axis[2]
    const rr = wx * wx + wy * wy + wz * wz - wa * wa
    const rho = Math.sqrt(rr > 0 ? rr : 0)
    const dR = rho - state.R
    return Math.hypot(dR, wa) - state.r
  }
  return { prob: { np, n, prepare, res }, p, state }
}

// ═══════════════════════════════════ 距离 / 法向 / 覆盖角 ═══════════════════════════════════

/** 点到基元面嘅【无符号】距离（量度 RMS/maxError 用）。 */
function distToPrim(prm: PrimitiveParams, x: number, y: number, z: number): number {
  switch (prm.kind) {
    case 'plane': return Math.abs(prm.normal[0] * x + prm.normal[1] * y + prm.normal[2] * z - prm.d)
    case 'sphere': return Math.abs(Math.hypot(x - prm.centre[0], y - prm.centre[1], z - prm.centre[2]) - prm.radius)
    case 'cylinder': {
      const wx = x - prm.point[0], wy = y - prm.point[1], wz = z - prm.point[2]
      const wa = wx * prm.axis[0] + wy * prm.axis[1] + wz * prm.axis[2]
      const rr = wx * wx + wy * wy + wz * wz - wa * wa
      return Math.abs(Math.sqrt(rr > 0 ? rr : 0) - prm.radius)
    }
    case 'cone': {
      const wx = x - prm.apex[0], wy = y - prm.apex[1], wz = z - prm.apex[2]
      const wa = wx * prm.axis[0] + wy * prm.axis[1] + wz * prm.axis[2]
      const rr = wx * wx + wy * wy + wz * wz - wa * wa
      const a = prm.halfAngleDeg * RAD
      return Math.abs(Math.sqrt(rr > 0 ? rr : 0) * Math.cos(a) - wa * Math.sin(a))
    }
    case 'torus': {
      const wx = x - prm.centre[0], wy = y - prm.centre[1], wz = z - prm.centre[2]
      const wa = wx * prm.axis[0] + wy * prm.axis[1] + wz * prm.axis[2]
      const rr = wx * wx + wy * wy + wz * wz - wa * wa
      return Math.abs(Math.hypot(Math.sqrt(rr > 0 ? rr : 0) - prm.majorRadius, wa) - prm.minorRadius)
    }
    default: return 0
  }
}

/** 基元喺某点嘅解析【外】法向（凸约定：指离轴/心）。退化位返 null。 */
function normalOfPrim(prm: PrimitiveParams, x: number, y: number, z: number): Vec3 | null {
  switch (prm.kind) {
    case 'plane': return prm.normal
    case 'sphere': {
      const d: Vec3 = [x - prm.centre[0], y - prm.centre[1], z - prm.centre[2]]
      const L = Math.hypot(d[0], d[1], d[2])
      return L > 1e-12 ? [d[0] / L, d[1] / L, d[2] / L] : null
    }
    case 'cylinder': {
      const wx = x - prm.point[0], wy = y - prm.point[1], wz = z - prm.point[2]
      const wa = wx * prm.axis[0] + wy * prm.axis[1] + wz * prm.axis[2]
      const ex = wx - wa * prm.axis[0], ey = wy - wa * prm.axis[1], ez = wz - wa * prm.axis[2]
      const L = Math.hypot(ex, ey, ez)
      return L > 1e-12 ? [ex / L, ey / L, ez / L] : null
    }
    case 'cone': {
      const wx = x - prm.apex[0], wy = y - prm.apex[1], wz = z - prm.apex[2]
      const wa = wx * prm.axis[0] + wy * prm.axis[1] + wz * prm.axis[2]
      const ex = wx - wa * prm.axis[0], ey = wy - wa * prm.axis[1], ez = wz - wa * prm.axis[2]
      const L = Math.hypot(ex, ey, ez)
      if (!(L > 1e-12)) return null
      const a = prm.halfAngleDeg * RAD, ca = Math.cos(a), sa = Math.sin(a)
      // n_out = cosα·e − sinα·axis（axis 由顶点指向开口方向）
      return norm3([ca * ex / L - sa * prm.axis[0], ca * ey / L - sa * prm.axis[1], ca * ez / L - sa * prm.axis[2]])
    }
    case 'torus': {
      const wx = x - prm.centre[0], wy = y - prm.centre[1], wz = z - prm.centre[2]
      const wa = wx * prm.axis[0] + wy * prm.axis[1] + wz * prm.axis[2]
      const ex = wx - wa * prm.axis[0], ey = wy - wa * prm.axis[1], ez = wz - wa * prm.axis[2]
      const L = Math.hypot(ex, ey, ez)
      if (!(L > 1e-12)) return null
      const sx = prm.centre[0] + prm.majorRadius * ex / L, sy = prm.centre[1] + prm.majorRadius * ey / L, sz = prm.centre[2] + prm.majorRadius * ez / L
      const dx = x - sx, dy = y - sy, dz = z - sz
      const dl = Math.hypot(dx, dy, dz)
      return dl > 1e-12 ? [dx / dl, dy / dl, dz / dl] : null
    }
    default: return null
  }
}

/**
 * 周向覆盖：把点绕轴嘅角排序，揾【最大缺口】。
 * 唔用固定分格：72 段嘅圆柱顶点啱啱好落喺格界上，分格统计会报 290° 而唔係 360°（假病态）。
 * full 判据用【自适应】门槛（最大缺口 ≤ max(15°, 2.5× 中位间距)）→ 无论粗镶嵌定细镶嵌都啱。
 */
function arcSpan(P: Float64Array, n: number, axis: Vec3, point: Vec3, refU: Vec3): { coverageDeg: number; tMin: number; tMax: number; full: boolean } {
  const refV = norm3(cross3(axis, refU))
  const stride = Math.max(1, Math.ceil(n / 4096))
  const angs: number[] = []
  for (let i = 0; i < n; i += stride) {
    const wx = P[i * 3] - point[0], wy = P[i * 3 + 1] - point[1], wz = P[i * 3 + 2] - point[2]
    const wa = wx * axis[0] + wy * axis[1] + wz * axis[2]
    const ex = wx - wa * axis[0], ey = wy - wa * axis[1], ez = wz - wa * axis[2]
    const cu = ex * refU[0] + ey * refU[1] + ez * refU[2]
    const cv = ex * refV[0] + ey * refV[1] + ez * refV[2]
    if (Math.abs(cu) < 1e-12 && Math.abs(cv) < 1e-12) continue
    let t = Math.atan2(cv, cu)
    if (t < 0) t += 2 * Math.PI
    angs.push(t)
  }
  if (angs.length < 2) return { coverageDeg: 0, tMin: 0, tMax: 0, full: false }
  angs.sort((a, b) => a - b)
  const gaps = new Float64Array(angs.length)
  let maxGap = 0, maxAt = 0
  for (let i = 0; i < angs.length; i++) {
    const g = i + 1 < angs.length ? angs[i + 1] - angs[i] : angs[0] + 2 * Math.PI - angs[i]
    gaps[i] = g
    if (g > maxGap) { maxGap = g; maxAt = i }
  }
  const sortedGaps = Array.from(gaps).sort((a, b) => a - b)
  const median = sortedGaps[Math.floor(sortedGaps.length / 2)]
  const tolGap = Math.max(15 * RAD, 2.5 * median)
  if (maxGap <= tolGap) return { coverageDeg: 360, tMin: 0, tMax: 2 * Math.PI, full: true }
  const tMin = angs[(maxAt + 1) % angs.length]
  const span = 2 * Math.PI - maxGap
  return { coverageDeg: span * DEG, tMin, tMax: tMin + span, full: false }
}

// ═══════════════════════════════════ 逐区擬合 ═══════════════════════════════════

interface RegionData {
  P: Float64Array   // 全部区顶点（量度用）
  nAll: number
  S: Float64Array   // LM 取样点
  nS: number
  C: Float64Array   // 三角重心
  N: Float64Array   // 三角单位法向
  W: Float64Array   // 三角面积
  nTri: number
  meanNormal: Vec3
  kMean: number     // 区平均主曲率（绝对值较大嗰个）
  diag: number
}

interface Candidate {
  kind: PrimitiveKind
  params: PrimitiveParams
  rms: number
  maxErr: number
  normalDevDeg: number
  ok: boolean
  note: string
  arcCoverageDeg?: number
  illConditioned?: boolean
}

/** 量度一个候选：全部区顶点嘅 RMS/max 距离 + 三角法向 vs 解析法向嘅平均夹角。顺手定 convex 方向。 */
function measure(prm: PrimitiveParams, rd: RegionData): { rms: number; maxErr: number; normalDevDeg: number; outwardAgrees: boolean } {
  let ss = 0, mx = 0
  for (let i = 0; i < rd.nAll; i++) {
    const d = distToPrim(prm, rd.P[i * 3], rd.P[i * 3 + 1], rd.P[i * 3 + 2])
    ss += d * d
    if (d > mx) mx = d
  }
  let agree = 0, wsum = 0
  for (let i = 0; i < rd.nTri; i++) {
    const na = normalOfPrim(prm, rd.C[i * 3], rd.C[i * 3 + 1], rd.C[i * 3 + 2])
    if (!na) continue
    agree += rd.W[i] * (na[0] * rd.N[i * 3] + na[1] * rd.N[i * 3 + 1] + na[2] * rd.N[i * 3 + 2])
    wsum += rd.W[i]
  }
  const outwardAgrees = agree >= 0
  const sgn = outwardAgrees ? 1 : -1
  let devSum = 0, devW = 0
  for (let i = 0; i < rd.nTri; i++) {
    const na = normalOfPrim(prm, rd.C[i * 3], rd.C[i * 3 + 1], rd.C[i * 3 + 2])
    if (!na) continue
    const c = clamp(sgn * (na[0] * rd.N[i * 3] + na[1] * rd.N[i * 3 + 1] + na[2] * rd.N[i * 3 + 2]), -1, 1)
    devSum += rd.W[i] * Math.acos(c) * DEG
    devW += rd.W[i]
  }
  return {
    rms: Math.sqrt(ss / Math.max(1, rd.nAll)),
    maxErr: mx,
    normalDevDeg: devW > 0 ? devSum / devW : (wsum > 0 ? 90 : 0),
    outwardAgrees,
  }
}

/** 平面：形心 + 协方差最小特征向量（= 最扁方向）。方向对齐区面积加权法向（保持外向）。 */
function fitPlaneCandidate(rd: RegionData): Candidate | null {
  if (rd.nAll < 3) return null
  let cx = 0, cy = 0, cz = 0
  for (let i = 0; i < rd.nAll; i++) { cx += rd.P[i * 3]; cy += rd.P[i * 3 + 1]; cz += rd.P[i * 3 + 2] }
  cx /= rd.nAll; cy /= rd.nAll; cz /= rd.nAll
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0
  for (let i = 0; i < rd.nAll; i++) {
    const dx = rd.P[i * 3] - cx, dy = rd.P[i * 3 + 1] - cy, dz = rd.P[i * 3 + 2] - cz
    xx += dx * dx; xy += dx * dy; xz += dx * dz; yy += dy * dy; yz += dy * dz; zz += dz * dz
  }
  const { vectors } = symEig3(xx, xy, xz, yy, yz, zz)
  let nrm = vectors[0]
  if (dot3(nrm, rd.meanNormal) < 0) nrm = [-nrm[0], -nrm[1], -nrm[2]]
  const d = nrm[0] * cx + nrm[1] * cy + nrm[2] * cz
  const params: PlaneParams = { kind: 'plane', normal: nrm, d, point: [cx, cy, cz] }
  const m = measure(params, rd)
  return { kind: 'plane', params, rms: m.rms, maxErr: m.maxErr, normalDevDeg: m.normalDevDeg, ok: true, note: '' }
}

/** 球：Kåsa 代数初值 → LM 几何精修。 */
function fitSphereCandidate(rd: RegionData): Candidate | null {
  if (rd.nAll < 8) return null
  const init = sphereKasa(rd.S, rd.nS) ?? sphereKasa(rd.P, rd.nAll)
  if (!init) return null
  const p = new Float64Array([init.c[0], init.c[1], init.c[2], init.r])
  const state = { c: [0, 0, 0] as Vec3, r: 0 }
  const prob: LmProblem = {
    np: 4, n: rd.nS,
    prepare: (q) => { state.c[0] = q[0]; state.c[1] = q[1]; state.c[2] = q[2]; state.r = q[3] },
    res: (i) => Math.hypot(rd.S[i * 3] - state.c[0], rd.S[i * 3 + 1] - state.c[1], rd.S[i * 3 + 2] - state.c[2]) - state.r,
  }
  lmSolve(p, prob)
  const radius = Math.abs(p[3])
  if (!isFinite(radius) || radius <= 0) return null
  const params: SphereParams = { kind: 'sphere', centre: [p[0], p[1], p[2]], radius }
  const m = measure(params, rd)
  const ill = radius > rd.diag * 5
  return { kind: 'sphere', params, rms: m.rms, maxErr: m.maxErr, normalDevDeg: m.normalDevDeg, ok: !ill, note: ill ? '半径 > 5× 包围盒（其实系平面）' : '', illConditioned: ill }
}

/** 由擬合好嘅轴/点/半径砌完整 CylinderParams（轴范围、周向范围、凸凹）。 */
function finishCylinder(rd: RegionData, axisIn: Vec3, pointIn: Vec3, radius: number, minArcDeg: number): Candidate {
  const axis = canonicalDir(norm3(axisIn))
  // point 移到「区形心喺轴上嘅投影」（可重现、唔会飞到十万八千里）
  let gx = 0, gy = 0, gz = 0
  for (let i = 0; i < rd.nAll; i++) { gx += rd.P[i * 3]; gy += rd.P[i * 3 + 1]; gz += rd.P[i * 3 + 2] }
  gx /= rd.nAll; gy /= rd.nAll; gz /= rd.nAll
  const wx = gx - pointIn[0], wy = gy - pointIn[1], wz = gz - pointIn[2]
  const wa = wx * axis[0] + wy * axis[1] + wz * axis[2]
  const point: Vec3 = [pointIn[0] + wa * axis[0], pointIn[1] + wa * axis[1], pointIn[2] + wa * axis[2]]
  let hMin = Infinity, hMax = -Infinity
  for (let i = 0; i < rd.nAll; i++) {
    const h = (rd.P[i * 3] - point[0]) * axis[0] + (rd.P[i * 3 + 1] - point[1]) * axis[1] + (rd.P[i * 3 + 2] - point[2]) * axis[2]
    if (h < hMin) hMin = h
    if (h > hMax) hMax = h
  }
  const refU = perpAxis(axis)
  const span = arcSpan(rd.P, rd.nAll, axis, point, refU)
  const params: CylinderParams = {
    kind: 'cylinder', axis, point, radius, hMin, hMax, refU,
    tMin: span.tMin, tMax: span.tMax, full: span.full, convex: true,
  }
  const m = measure(params, rd)
  params.convex = m.outwardAgrees
  const ill = span.coverageDeg < minArcDeg || radius > rd.diag * 5
  return {
    kind: 'cylinder', params, rms: m.rms, maxErr: m.maxErr, normalDevDeg: m.normalDevDeg,
    ok: radius > 0 && isFinite(radius) && radius <= rd.diag * 5,
    note: ill ? `弧覆盖 ${span.coverageDeg.toFixed(0)}° / 半径 ${radius.toFixed(2)}` : '',
    arcCoverageDeg: span.coverageDeg, illConditioned: ill,
  }
}

/** 圆柱：轴初值 = 单位法向协方差（绕原点）嘅最小特征向量（柱面法向全部 ⊥ 轴）→ 投影 2D 圆擬合 → LM 5 参。 */
function fitCylinderCandidate(rd: RegionData, minArcDeg: number): Candidate | null {
  if (rd.nAll < 6 || rd.nTri < 2) return null
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0
  for (let i = 0; i < rd.nTri; i++) {
    const w = rd.W[i], nx = rd.N[i * 3], ny = rd.N[i * 3 + 1], nz = rd.N[i * 3 + 2]
    xx += w * nx * nx; xy += w * nx * ny; xz += w * nx * nz
    yy += w * ny * ny; yz += w * ny * nz; zz += w * nz * nz
  }
  const a0 = norm3(symEig3(xx, xy, xz, yy, yz, zz).vectors[0])
  const u = perpAxis(a0), v = norm3(cross3(a0, u))
  let gx = 0, gy = 0, gz = 0
  for (let i = 0; i < rd.nS; i++) { gx += rd.S[i * 3]; gy += rd.S[i * 3 + 1]; gz += rd.S[i * 3 + 2] }
  gx /= rd.nS; gy /= rd.nS; gz /= rd.nS
  const O: Vec3 = [gx, gy, gz]
  const us = new Float64Array(rd.nS), vs = new Float64Array(rd.nS)
  for (let i = 0; i < rd.nS; i++) {
    const dx = rd.S[i * 3] - gx, dy = rd.S[i * 3 + 1] - gy, dz = rd.S[i * 3 + 2] - gz
    us[i] = dx * u[0] + dy * u[1] + dz * u[2]
    vs[i] = dx * v[0] + dy * v[1] + dz * v[2]
  }
  const c2 = circleKasa(us, vs, rd.nS)
  if (!c2) return null
  const { prob, p, state } = makeCylProblem(rd.S, rd.nS, a0, O, false)
  p[0] = c2.cu; p[1] = c2.cv; p[2] = c2.r; p[3] = 0; p[4] = 0
  lmSolve(p, prob)
  if (!(state.radius > 0) || !isFinite(state.radius)) return null
  return finishCylinder(rd, state.axis, state.point, state.radius, minArcDeg)
}

/** 由擬合好嘅 apex/axis/α 砌完整 ConeParams。axis 定向：由顶点指向【区所在嗰边】。 */
function finishCone(rd: RegionData, apex: Vec3, axisIn: Vec3, alpha: number, minArcDeg: number): Candidate {
  let axis = norm3(axisIn)
  let hSum = 0
  for (let i = 0; i < rd.nAll; i++) {
    hSum += (rd.P[i * 3] - apex[0]) * axis[0] + (rd.P[i * 3 + 1] - apex[1]) * axis[1] + (rd.P[i * 3 + 2] - apex[2]) * axis[2]
  }
  if (hSum < 0) axis = [-axis[0], -axis[1], -axis[2]]
  let hMin = Infinity, hMax = -Infinity
  for (let i = 0; i < rd.nAll; i++) {
    const h = (rd.P[i * 3] - apex[0]) * axis[0] + (rd.P[i * 3 + 1] - apex[1]) * axis[1] + (rd.P[i * 3 + 2] - apex[2]) * axis[2]
    if (h < hMin) hMin = h
    if (h > hMax) hMax = h
  }
  const refU = perpAxis(axis)
  const span = arcSpan(rd.P, rd.nAll, axis, apex, refU)
  const halfAngleDeg = alpha * DEG
  const params: ConeParams = {
    kind: 'cone', apex, axis, halfAngleDeg, hMin, hMax, refU,
    tMin: span.tMin, tMax: span.tMax, full: span.full, convex: true,
  }
  const m = measure(params, rd)
  params.convex = m.outwardAgrees
  // 退化守衛：α→0 其实系圆柱、α→90° 其实系平面 —— 两边都唔应该由 cone 顶上位
  const degenerate = halfAngleDeg < 3 || halfAngleDeg > 87
  const ill = span.coverageDeg < minArcDeg
  return {
    kind: 'cone', params, rms: m.rms, maxErr: m.maxErr, normalDevDeg: m.normalDevDeg,
    ok: !degenerate && isFinite(halfAngleDeg),
    note: degenerate ? `半顶角 ${halfAngleDeg.toFixed(1)}° 退化（≈圆柱/平面）` : (ill ? `弧覆盖 ${span.coverageDeg.toFixed(0)}°` : ''),
    arcCoverageDeg: span.coverageDeg, illConditioned: ill,
  }
}

/**
 * 圆锥：法向喺高斯球上落喺一个【细圆】（n·axis = −sinα 恒定）→ 擬合呢个圆嘅平面 = 轴 + 半顶角。
 * 顶点：曲面上每点满足 (p − apex)·n = 0 → 线性最小二乘 Σnnᵀ·apex = Σn(n·p)（3×3，靓过任何迭代初值）。
 */
function fitConeCandidate(rd: RegionData, minArcDeg: number): Candidate | null {
  if (rd.nAll < 12 || rd.nTri < 6) return null
  let mx = 0, my = 0, mz = 0, wsum = 0
  for (let i = 0; i < rd.nTri; i++) { const w = rd.W[i]; mx += w * rd.N[i * 3]; my += w * rd.N[i * 3 + 1]; mz += w * rd.N[i * 3 + 2]; wsum += w }
  mx /= wsum; my /= wsum; mz /= wsum
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0
  for (let i = 0; i < rd.nTri; i++) {
    const w = rd.W[i], dx = rd.N[i * 3] - mx, dy = rd.N[i * 3 + 1] - my, dz = rd.N[i * 3 + 2] - mz
    xx += w * dx * dx; xy += w * dx * dy; xz += w * dx * dz
    yy += w * dy * dy; yz += w * dy * dz; zz += w * dz * dz
  }
  let a0 = norm3(symEig3(xx, xy, xz, yy, yz, zz).vectors[0])
  const s = mx * a0[0] + my * a0[1] + mz * a0[2]
  if (s > 0) a0 = [-a0[0], -a0[1], -a0[2]]   // 约定：n·axis = −sinα ≤ 0（axis 由顶点指向开口）
  const alpha0 = Math.asin(clamp(Math.abs(s), 0, 1))
  // 顶点线性解
  const M = new Float64Array(9), rhs = new Float64Array(3), sol = new Float64Array(3)
  for (let i = 0; i < rd.nTri; i++) {
    const w = rd.W[i], nx = rd.N[i * 3], ny = rd.N[i * 3 + 1], nz = rd.N[i * 3 + 2]
    const np = nx * rd.C[i * 3] + ny * rd.C[i * 3 + 1] + nz * rd.C[i * 3 + 2]
    M[0] += w * nx * nx; M[1] += w * nx * ny; M[2] += w * nx * nz
    M[4] += w * ny * ny; M[5] += w * ny * nz; M[8] += w * nz * nz
    rhs[0] += w * nx * np; rhs[1] += w * ny * np; rhs[2] += w * nz * np
  }
  M[3] = M[1]; M[6] = M[2]; M[7] = M[5]
  if (!solveLin(M, rhs, sol, 3)) return null
  const apex0: Vec3 = [sol[0], sol[1], sol[2]]
  if (!isFinite(apex0[0]) || !isFinite(apex0[1]) || !isFinite(apex0[2])) return null
  const { prob, p, state } = makeConeProblem(rd.S, rd.nS, a0, apex0, alpha0 > 1e-3 ? alpha0 : 1e-3, false)
  lmSolve(p, prob)
  let alpha = state.alpha
  let axis = state.axis
  if (alpha < 0) { alpha = -alpha; axis = [-axis[0], -axis[1], -axis[2]] }   // 负角 = 轴反转，几何等价
  alpha = alpha % (2 * Math.PI)
  if (!isFinite(alpha) || alpha <= 0 || alpha >= Math.PI / 2) return null
  return finishCone(rd, [state.apex[0], state.apex[1], state.apex[2]], axis, alpha, minArcDeg)
}

/**
 * 圆环面（只做圆角带）：由区平均曲率 1/|k| 取 minor 半径初值，把三角重心沿法向【内推 minor】→
 * 一堆点应该塌埋落 spine 圆上 → 平面擬合 + 2D 圆擬合 = 轴 / 中心 / major → LM 7 参精修。
 */
function fitTorusCandidate(rd: RegionData): Candidate | null {
  if (rd.nAll < 12 || rd.nTri < 6 || !(Math.abs(rd.kMean) > 1e-9)) return null
  const r0 = 1 / Math.abs(rd.kMean)
  if (!(r0 > 0) || r0 > rd.diag) return null
  const nQ = rd.nTri
  const Q = new Float64Array(nQ * 3)
  let best: { rms: number; axis: Vec3; centre: Vec3; R: number } | null = null
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < nQ; i++) {
      Q[i * 3] = rd.C[i * 3] + sgn * r0 * rd.N[i * 3]
      Q[i * 3 + 1] = rd.C[i * 3 + 1] + sgn * r0 * rd.N[i * 3 + 1]
      Q[i * 3 + 2] = rd.C[i * 3 + 2] + sgn * r0 * rd.N[i * 3 + 2]
    }
    let cx = 0, cy = 0, cz = 0
    for (let i = 0; i < nQ; i++) { cx += Q[i * 3]; cy += Q[i * 3 + 1]; cz += Q[i * 3 + 2] }
    cx /= nQ; cy /= nQ; cz /= nQ
    let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0
    for (let i = 0; i < nQ; i++) {
      const dx = Q[i * 3] - cx, dy = Q[i * 3 + 1] - cy, dz = Q[i * 3 + 2] - cz
      xx += dx * dx; xy += dx * dy; xz += dx * dz; yy += dy * dy; yz += dy * dz; zz += dz * dz
    }
    const ax = norm3(symEig3(xx, xy, xz, yy, yz, zz).vectors[0])
    const u = perpAxis(ax), v = norm3(cross3(ax, u))
    const us = new Float64Array(nQ), vs = new Float64Array(nQ)
    for (let i = 0; i < nQ; i++) {
      const dx = Q[i * 3] - cx, dy = Q[i * 3 + 1] - cy, dz = Q[i * 3 + 2] - cz
      us[i] = dx * u[0] + dy * u[1] + dz * u[2]
      vs[i] = dx * v[0] + dy * v[1] + dz * v[2]
    }
    const cc = circleKasa(us, vs, nQ)
    if (!cc || !(cc.r > 0)) continue
    let ss = 0
    for (let i = 0; i < nQ; i++) { const d = Math.hypot(us[i] - cc.cu, vs[i] - cc.cv) - cc.r; ss += d * d }
    const rms = Math.sqrt(ss / nQ)
    if (!best || rms < best.rms) {
      best = {
        rms, axis: ax, R: cc.r,
        centre: [cx + cc.cu * u[0] + cc.cv * v[0], cy + cc.cu * u[1] + cc.cv * v[1], cz + cc.cu * u[2] + cc.cv * v[2]],
      }
    }
  }
  if (!best) return null
  const { prob, p, state } = makeTorusProblem(rd.S, rd.nS, best.axis, best.centre, best.R, r0, false)
  lmSolve(p, prob)
  const R = Math.abs(state.R), r = Math.abs(state.r)
  if (!(R > 0) || !(r > 0) || !isFinite(R) || !isFinite(r) || R > rd.diag * 5 || r > rd.diag) return null
  const params: TorusParams = { kind: 'torus', centre: [state.centre[0], state.centre[1], state.centre[2]], axis: canonicalDir(norm3(state.axis)), majorRadius: R, minorRadius: r, convex: true }
  const m = measure(params, rd)
  params.convex = m.outwardAgrees
  return { kind: 'torus', params, rms: m.rms, maxErr: m.maxErr, normalDevDeg: m.normalDevDeg, ok: true, note: '' }
}

const KIND_RANK: Record<PrimitiveKind, number> = { plane: 0, cylinder: 1, sphere: 2, cone: 3, torus: 4, freeform: 9 }

interface RegionFit {
  kind: PrimitiveKind
  params: PrimitiveParams
  rms: number
  maxErr: number
  normalDevDeg: number
  candidates: FitCandidateInfo[]
  arcCoverageDeg?: number
  illConditioned?: boolean
  isBlend?: boolean
  blendRadius?: number
}

/** 逐区跑候选 + 简约律选择。返回最终 kind/params/量度 + 候选证据。 */
function fitOneRegion(rd: RegionData, eps: number, alphaDeg: number, ratio: number, minArcDeg: number, blendCandidate: boolean): RegionFit {
  const cands: Candidate[] = []
  const push = (c: Candidate | null): void => { if (c) cands.push(c) }
  push(fitPlaneCandidate(rd))
  const planeC = cands[0]
  // 早退：平面已经好到冇乜可能有更简单嘅嘢 → 慳晒后面 3 个 LM（大件 prismatic 件性能关键）
  const planePerfect = !!planeC && planeC.rms <= eps * 0.2 && planeC.normalDevDeg <= alphaDeg
  if (!planePerfect) {
    push(fitCylinderCandidate(rd, minArcDeg))
    const cyl = cands.find((c) => c.kind === 'cylinder')
    const cylPerfect = !!cyl && cyl.ok && cyl.rms <= eps * 0.2 && cyl.normalDevDeg <= alphaDeg
    if (!cylPerfect) {
      push(fitSphereCandidate(rd))
      const sph = cands.find((c) => c.kind === 'sphere')
      const sphPerfect = !!sph && sph.ok && sph.rms <= eps * 0.2 && sph.normalDevDeg <= alphaDeg
      if (!sphPerfect) {
        push(fitConeCandidate(rd, minArcDeg))
        if (blendCandidate) push(fitTorusCandidate(rd))
      }
    }
  }

  const info: FitCandidateInfo[] = []
  const notes: string[] = []
  let best: Candidate | null = null
  const sorted = cands.slice().sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind])
  for (const c of sorted) {
    const passDist = c.rms <= eps
    const passNorm = c.normalDevDeg <= alphaDeg
    const viable = c.ok && passDist && passNorm
    let note = c.note
    if (!c.ok) note = note || '守衛拒'
    else if (!passDist) note = `RMS ${c.rms.toExponential(2)} > ε ${eps.toExponential(2)}`
    else if (!passNorm) note = `法向偏差 ${c.normalDevDeg.toFixed(1)}° > α ${alphaDeg}°`
    if (viable) {
      if (!best) best = c
      else if (c.rms * ratio <= best.rms) best = c    // 简约律：复杂者要赢 ≥ratio× 先上位
      else note = note || `唔够简单者 ${ratio}× 好（${c.rms.toExponential(2)} vs ${best.rms.toExponential(2)}）`
    }
    notes.push(note)
  }
  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i]
    info.push({ kind: c.kind, rms: c.rms, normalDevDeg: c.normalDevDeg, accepted: best === c, note: notes[i] })
  }
  if (!best) {
    return { kind: 'freeform', params: { kind: 'freeform' }, rms: Infinity, maxErr: Infinity, normalDevDeg: 180, candidates: info }
  }
  // 圆角带 = 恒曲率【窄带】：闭合全圆柱（360°）系轴身唔係圆角，唔可以乱标（M5 会照住呢个 flag 压平）
  const isBlend = blendCandidate && (best.kind === 'torus'
    || (best.kind === 'cylinder' && !(best.params as CylinderParams).full && (best.arcCoverageDeg ?? 360) < 180))
  return {
    kind: best.kind, params: best.params, rms: best.rms, maxErr: best.maxErr, normalDevDeg: best.normalDevDeg,
    candidates: info, arcCoverageDeg: best.arcCoverageDeg, illConditioned: best.illConditioned,
    isBlend: isBlend || undefined,
    blendRadius: isBlend ? (best.kind === 'cylinder' ? (best.params as CylinderParams).radius : (best.params as TorusParams).minorRadius) : undefined,
  }
}

// ═══════════════════════════════════ 区数据准备 ═══════════════════════════════════

function buildRegionData(m: WeldedMesh, topo: MeshTopology, reg: MeshRegion, stamp: Int32Array, mark: number, maxFitPoints: number): RegionData {
  const vids = collectRegionVerts(m, reg.triIndices, stamp, mark)
  const nAll = vids.length
  const P = new Float64Array(nAll * 3)
  for (let i = 0; i < nAll; i++) {
    const v = vids[i]
    P[i * 3] = m.pos[v * 3]; P[i * 3 + 1] = m.pos[v * 3 + 1]; P[i * 3 + 2] = m.pos[v * 3 + 2]
  }
  // LM 取样：大区按步长抽（擬合精度对均匀抽样唔敏感；量度仍然用全部点）
  let S = P, nS = nAll
  if (nAll > maxFitPoints) {
    const stride = Math.ceil(nAll / maxFitPoints)
    nS = Math.ceil(nAll / stride)
    S = new Float64Array(nS * 3)
    for (let i = 0, j = 0; i < nAll && j < nS; i += stride, j++) {
      S[j * 3] = P[i * 3]; S[j * 3 + 1] = P[i * 3 + 1]; S[j * 3 + 2] = P[i * 3 + 2]
    }
  }
  const nTri = reg.triIndices.length
  const C = new Float64Array(nTri * 3), N = new Float64Array(nTri * 3), W = new Float64Array(nTri)
  for (let i = 0; i < nTri; i++) {
    const t = reg.triIndices[i]
    C[i * 3] = topo.triC[t * 3]; C[i * 3 + 1] = topo.triC[t * 3 + 1]; C[i * 3 + 2] = topo.triC[t * 3 + 2]
    N[i * 3] = topo.triN[t * 3]; N[i * 3 + 1] = topo.triN[t * 3 + 1]; N[i * 3 + 2] = topo.triN[t * 3 + 2]
    W[i] = topo.triA[t]
  }
  const kMean = Math.abs(reg.kMinMean) >= Math.abs(reg.kMaxMean) ? reg.kMinMean : reg.kMaxMean
  return { P, nAll, S, nS, C, N, W, nTri, meanNormal: reg.meanNormal, kMean, diag: m.diag }
}

// ═══════════════════════════════════ 边界精修 / 碎区收编 ═══════════════════════════════════

/**
 * 擬合完之后，把【放错咗区】嘅三角搬返啱嘅区。两个真实病症一次过医：
 *  ① G1 过渡漏边：离散曲率喺相切边界必然有一环污染 → 平面区食咗圆角带头一行三角（d 就会走样）
 *  ② 噪声碎区：扫描噪声令曲率判据喺圆柱上到处切细区（1–2 个三角），细区自己擬合永远「完美」
 *     （3 点必定共面），所以【唔可以】净靠擬合质量，要睇【区细唔细可信唔可信】
 * 规则：只可以跨【非折痕边】搬（利边 = 硬边界，绝对唔郁 → 盒面/倒角面永远安全）；
 * 目标基元要解释得到成个三角（3 个顶点距离全部 ≤ ε）而且法向对得上；
 * 自己区可信时要赢一半距离先搬（滞后，防抖）；自己区係碎区/freeform 就冇得守。
 */
function refineBoundaryPass(
  m: WeldedMesh, topo: MeshTopology, labels: Int32Array, fits: RegionFit[],
  counts: Int32Array, dirty: Uint8Array, eps: number, alphaDeg: number, minReliableTris: number,
): number {
  const nt = m.nt
  const next = labels.slice()
  const cosTol = Math.cos(alphaDeg * RAD)
  // 「可信」= 够大 + 擬到基元 + 唔係病态擬合。病态（弧覆盖不足）嗰啲擬出嚟嘅半径根本冇意义，
  // 唔可以俾佢守住自己啲三角 —— 噪声碎区正正就係咁扮成「一个细圆柱」赖死唔走。
  const reliable = (r: number): boolean => counts[r] >= minReliableTris && fits[r].kind !== 'freeform' && fits[r].illConditioned !== true
  const scoreTri = (t: number, prm: PrimitiveParams): number => {
    let mx = 0
    for (let e = 0; e < 3; e++) {
      const v = m.tri[t * 3 + e]
      const d = distToPrim(prm, m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2])
      if (d > mx) mx = d
    }
    return mx
  }
  const normalOk = (t: number, prm: PrimitiveParams): boolean => {
    const na = normalOfPrim(prm, topo.triC[t * 3], topo.triC[t * 3 + 1], topo.triC[t * 3 + 2])
    if (!na) return false
    const c = na[0] * topo.triN[t * 3] + na[1] * topo.triN[t * 3 + 1] + na[2] * topo.triN[t * 3 + 2]
    return Math.abs(c) >= cosTol
  }
  let moved = 0
  for (let t = 0; t < nt; t++) {
    const own = labels[t]
    const ownRel = reliable(own)
    const ownScore = ownRel ? scoreTri(t, fits[own].params) : Infinity
    let best = ownRel ? ownScore * 0.5 : Infinity
    let bestR = -1
    for (let e = 0; e < 3; e++) {
      const h = t * 3 + e
      if (topo.crease[h]) continue                 // ★ 利边绝对唔跨 ★
      const g = topo.twin[h]
      if (g < 0) continue
      const nb = labels[(g / 3) | 0]
      if (nb === own || !reliable(nb)) continue
      const s = scoreTri(t, fits[nb].params)
      if (s > eps || !(s < best)) continue
      if (!normalOk(t, fits[nb].params)) continue
      best = s; bestR = nb
    }
    if (bestR >= 0) { next[t] = bestR; dirty[own] = 1; dirty[bestR] = 1; moved++ }
  }
  if (moved > 0) labels.set(next)
  return moved
}

// ═══════════════════════════════════ 同面合并 ═══════════════════════════════════

/**
 * 两个相邻区係咪【同一张解析面】？曲率判据喺 G1 过渡边界必然会切多一两行三角（离散曲率一环污染），
 * 平面被切成两半 = 假边。擬合完之后用参数比对合并返，係最平最稳嘅补救（唔使调容差调到天荒地老）。
 */
function sameSurface(a: RegionFit, b: RegionFit, eps: number, angTolDeg: number): boolean {
  if (a.kind !== b.kind) return false
  const pa = a.params, pb = b.params
  if (pa.kind === 'plane' && pb.kind === 'plane') {
    if (angDeg(pa.normal, pb.normal) > angTolDeg) return false
    return Math.abs(pa.d - pb.d) <= eps * 2
  }
  if (pa.kind === 'cylinder' && pb.kind === 'cylinder') {
    if (angAxisDeg(pa.axis, pb.axis) > angTolDeg) return false
    if (Math.abs(pa.radius - pb.radius) > Math.max(eps * 2, pa.radius * 0.02)) return false
    const w: Vec3 = [pb.point[0] - pa.point[0], pb.point[1] - pa.point[1], pb.point[2] - pa.point[2]]
    const wa = dot3(w, pa.axis)
    const perp = Math.hypot(w[0] - wa * pa.axis[0], w[1] - wa * pa.axis[1], w[2] - wa * pa.axis[2])
    return perp <= Math.max(eps * 2, pa.radius * 0.02) && pa.convex === pb.convex
  }
  if (pa.kind === 'sphere' && pb.kind === 'sphere') {
    return Math.hypot(pa.centre[0] - pb.centre[0], pa.centre[1] - pb.centre[1], pa.centre[2] - pb.centre[2]) <= eps * 2
      && Math.abs(pa.radius - pb.radius) <= Math.max(eps * 2, pa.radius * 0.02)
  }
  if (pa.kind === 'cone' && pb.kind === 'cone') {
    return angDeg(pa.axis, pb.axis) <= angTolDeg
      && Math.abs(pa.halfAngleDeg - pb.halfAngleDeg) <= 2
      && Math.hypot(pa.apex[0] - pb.apex[0], pa.apex[1] - pb.apex[1], pa.apex[2] - pb.apex[2]) <= Math.max(eps * 4, 0.02 * (Math.abs(pa.hMax) + 1))
  }
  if (pa.kind === 'torus' && pb.kind === 'torus') {
    return angAxisDeg(pa.axis, pb.axis) <= angTolDeg
      && Math.abs(pa.majorRadius - pb.majorRadius) <= Math.max(eps * 2, pa.majorRadius * 0.02)
      && Math.abs(pa.minorRadius - pb.minorRadius) <= Math.max(eps * 2, pa.minorRadius * 0.05)
      && Math.hypot(pa.centre[0] - pb.centre[0], pa.centre[1] - pb.centre[1], pa.centre[2] - pb.centre[2]) <= eps * 4
  }
  return false
}

// ═══════════════════════════════════ 约束 snap ═══════════════════════════════════

function cloneParams(p: PrimitiveParams): PrimitiveParams {
  switch (p.kind) {
    case 'plane': return { kind: 'plane', normal: [...p.normal] as Vec3, d: p.d, point: [...p.point] as Vec3 }
    case 'sphere': return { kind: 'sphere', centre: [...p.centre] as Vec3, radius: p.radius }
    case 'cylinder': return { ...p, axis: [...p.axis] as Vec3, point: [...p.point] as Vec3, refU: [...p.refU] as Vec3 }
    case 'cone': return { ...p, apex: [...p.apex] as Vec3, axis: [...p.axis] as Vec3, refU: [...p.refU] as Vec3 }
    case 'torus': return { ...p, centre: [...p.centre] as Vec3, axis: [...p.axis] as Vec3 }
    default: return { kind: 'freeform' }
  }
}

/** 拎基元嘅方向（平面 = 法向，其余 = 轴）。冇方向（球/自由曲面）→ null。 */
function dirOfParams(p: PrimitiveParams): Vec3 | null {
  switch (p.kind) {
    case 'plane': return p.normal
    case 'cylinder': case 'cone': case 'torus': return p.axis
    default: return null
  }
}

function radiusOfParams(p: PrimitiveParams): number | null {
  switch (p.kind) {
    case 'sphere': case 'cylinder': return p.radius
    case 'torus': return p.minorRadius
    default: return null
  }
}

/** 以【固定方向】重擬合（snap 完唔可以净係扭个向量就算 —— 中心/半径要跟住重解，先至真係最小二乘解）。 */
function refitFixedDir(p: PrimitiveParams, dir: Vec3, rd: RegionData, minArcDeg: number, fixedPoint?: Vec3): PrimitiveParams {
  switch (p.kind) {
    case 'plane': {
      let d = 0
      for (let i = 0; i < rd.nAll; i++) d += dir[0] * rd.P[i * 3] + dir[1] * rd.P[i * 3 + 1] + dir[2] * rd.P[i * 3 + 2]
      d /= Math.max(1, rd.nAll)
      const pt: Vec3 = [...p.point] as Vec3
      const off = dir[0] * pt[0] + dir[1] * pt[1] + dir[2] * pt[2] - d
      return { kind: 'plane', normal: dir, d, point: [pt[0] - off * dir[0], pt[1] - off * dir[1], pt[2] - off * dir[2]] }
    }
    case 'cylinder': {
      if (fixedPoint) {
        // 轴线完全钉死（共轴组）→ 只重解半径 = 平均径向距离
        let sum = 0
        for (let i = 0; i < rd.nAll; i++) {
          const wx = rd.P[i * 3] - fixedPoint[0], wy = rd.P[i * 3 + 1] - fixedPoint[1], wz = rd.P[i * 3 + 2] - fixedPoint[2]
          const wa = wx * dir[0] + wy * dir[1] + wz * dir[2]
          sum += Math.sqrt(Math.max(0, wx * wx + wy * wy + wz * wz - wa * wa))
        }
        const r = sum / Math.max(1, rd.nAll)
        return finishCylinder(rd, dir, fixedPoint, r, minArcDeg).params
      }
      const { prob, p: q, state } = makeCylProblem(rd.S, rd.nS, dir, p.point, true)
      q[0] = 0; q[1] = 0; q[2] = p.radius
      lmSolve(q, prob)
      return finishCylinder(rd, dir, state.point, Math.abs(state.radius), minArcDeg).params
    }
    case 'cone': {
      const { prob, p: q, state } = makeConeProblem(rd.S, rd.nS, dir, p.apex, p.halfAngleDeg * RAD, true)
      lmSolve(q, prob)
      const alpha = Math.abs(state.alpha)
      if (!(alpha > 0) || alpha >= Math.PI / 2) return p
      return finishCone(rd, [state.apex[0], state.apex[1], state.apex[2]], dir, alpha, minArcDeg).params
    }
    case 'torus': {
      const { prob, p: q, state } = makeTorusProblem(rd.S, rd.nS, dir, p.centre, p.majorRadius, p.minorRadius, true)
      lmSolve(q, prob)
      return { kind: 'torus', centre: [state.centre[0], state.centre[1], state.centre[2]], axis: dir, majorRadius: Math.abs(state.R), minorRadius: Math.abs(state.r), convex: p.convex }
    }
    default: return p
  }
}

/** 轴上参考点（共轴判定用）。 */
function axisPointOf(p: PrimitiveParams): Vec3 | null {
  switch (p.kind) {
    case 'cylinder': return p.point
    case 'cone': return p.apex
    case 'torus': return p.centre
    default: return null
  }
}

const GLOBAL_AXES: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]

/**
 * snapping pass：令输出【睇落係 CAD 而唔係量度】。
 * 次序有讲究：全域轴 → 共轴 → 平行 → 垂直 → 等半径 → 圆整半径（默认只 flag）。
 * 每一步 snap 完都【重擬合】受约束嘅参数，唔係净係改个数 —— 否则半径同中心会同 snap 完嘅轴对唔上。
 */
function runSnapPass(
  fits: RegionFit[], datas: RegionData[], snapped: PrimitiveParams[],
  opt: { angleDeg: number; distTol: number; eps: number; minArcDeg: number; equalRadiusRelTol: number; roundRadii: boolean; roundStep: number },
): AppliedSnap[] {
  const snaps: AppliedSnap[] = []
  const n = fits.length

  // ① 轴 / 法向 → 全域 XYZ
  for (let i = 0; i < n; i++) {
    const dir = dirOfParams(snapped[i])
    if (!dir) continue
    let bestAx: Vec3 | null = null, bestAng = opt.angleDeg
    for (const g of GLOBAL_AXES) {
      const a = angDeg(dir, g), b = 180 - a
      if (a <= bestAng) { bestAng = a; bestAx = [g[0], g[1], g[2]] }   // 复制：GLOBAL_AXES 唔可以流入 params（会变共享别名）
      if (b <= bestAng) { bestAng = b; bestAx = [-g[0], -g[1], -g[2]] }
    }
    if (!bestAx) continue
    // 就算偏差係 1e-17（本来就轴对齐），照样【重写成精确 (0,0,1)】：M2 拎住 gp_Dir 唔想食到
    // −0 同 1e-17 呢啲垃圾。但只有真係校正过（> 1e-9°）先记一条 snap，唔好谷爆 UI 清单。
    snapped[i] = refitFixedDir(snapped[i], bestAx, datas[i], opt.minArcDeg)
    if (bestAng > 1e-9) snaps.push({ kind: 'axisGlobal', regions: [i], applied: true, before: bestAng, after: 0, detail: `区 ${i} 轴 → 全域 [${bestAx.join(',')}]（原偏 ${bestAng.toFixed(3)}°）` })
  }

  // ② 共轴（轴平行 + 轴线重合）→ 合并成一条公共轴线（面积大者主导）
  const parent = new Int32Array(n)
  for (let i = 0; i < n; i++) parent[i] = i
  const find = (x: number): number => { let r = x; while (parent[r] !== r) r = parent[r]; while (parent[x] !== r) { const nx = parent[x]; parent[x] = r; x = nx } return r }
  const axial: number[] = []
  for (let i = 0; i < n; i++) if (axisPointOf(snapped[i])) axial.push(i)
  for (let ii = 0; ii < axial.length; ii++) for (let jj = ii + 1; jj < axial.length; jj++) {
    const i = axial[ii], j = axial[jj]
    const ai = dirOfParams(snapped[i]) as Vec3, aj = dirOfParams(snapped[j]) as Vec3
    const ang = angAxisDeg(ai, aj)
    if (ang > opt.angleDeg) continue
    const pi = axisPointOf(snapped[i]) as Vec3, pj = axisPointOf(snapped[j]) as Vec3
    const w: Vec3 = [pj[0] - pi[0], pj[1] - pi[1], pj[2] - pi[2]]
    const wa = dot3(w, ai)
    const perp = Math.hypot(w[0] - wa * ai[0], w[1] - wa * ai[1], w[2] - wa * ai[2])
    if (perp > opt.distTol) continue
    const ri = find(i), rj = find(j)
    if (ri !== rj) parent[rj] = ri
    snaps.push({ kind: 'coaxial', regions: [i, j], applied: true, before: perp, after: 0, detail: `区 ${i} / ${j} 共轴（轴距 ${perp.toExponential(2)}mm，夹角 ${ang.toFixed(3)}°）` })
  }
  const groups = new Map<number, number[]>()
  for (const i of axial) { const r = find(i); const g = groups.get(r); if (g) g.push(i); else groups.set(r, [i]) }
  for (const g of groups.values()) {
    if (g.length < 2) continue
    let ax = 0, ay = 0, az = 0, px = 0, py = 0, pz = 0, wsum = 0
    const ref = dirOfParams(snapped[g[0]]) as Vec3
    for (const i of g) {
      const d = dirOfParams(snapped[i]) as Vec3
      const s = dot3(d, ref) < 0 ? -1 : 1
      const w = datas[i].nAll
      ax += s * d[0] * w; ay += s * d[1] * w; az += s * d[2] * w; wsum += w
    }
    const axis = canonicalDir(norm3([ax / wsum, ay / wsum, az / wsum]))
    for (const i of g) { const p = axisPointOf(snapped[i]) as Vec3; px += p[0]; py += p[1]; pz += p[2] }
    px /= g.length; py /= g.length; pz /= g.length
    const base: Vec3 = [px, py, pz]
    for (const i of g) snapped[i] = refitFixedDir(snapped[i], axis, datas[i], opt.minArcDeg, snapped[i].kind === 'cylinder' ? base : undefined)
  }

  // ③ 平行 / ④ 垂直（未共轴嘅对）：面积细嗰个让步（大面擬合可靠啲）
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const di = dirOfParams(snapped[i]), dj = dirOfParams(snapped[j])
    if (!di || !dj) continue
    if (find(i) === find(j)) continue
    const par = angAxisDeg(di, dj)
    const perpAng = Math.abs(90 - par)
    const small = datas[i].nAll <= datas[j].nAll ? i : j
    const large = small === i ? j : i
    if (par > 0 && par <= opt.angleDeg) {
      const dl = dirOfParams(snapped[large]) as Vec3
      const ds = dirOfParams(snapped[small]) as Vec3
      const target: Vec3 = dot3(dl, ds) < 0 ? [-dl[0], -dl[1], -dl[2]] : dl
      snapped[small] = refitFixedDir(snapped[small], target, datas[small], opt.minArcDeg)
      snaps.push({ kind: 'parallel', regions: [large, small], applied: true, before: par, after: 0, detail: `区 ${small} 轴 ∥ 区 ${large}（原偏 ${par.toFixed(3)}°）` })
    } else if (perpAng > 0 && perpAng <= opt.angleDeg) {
      const dl = dirOfParams(snapped[large]) as Vec3
      const ds = dirOfParams(snapped[small]) as Vec3
      const k = dot3(ds, dl)
      const target = norm3([ds[0] - k * dl[0], ds[1] - k * dl[1], ds[2] - k * dl[2]])
      snapped[small] = refitFixedDir(snapped[small], target, datas[small], opt.minArcDeg)
      snaps.push({ kind: 'perpendicular', regions: [large, small], applied: true, before: perpAng, after: 0, detail: `区 ${small} ⊥ 区 ${large}（原偏 ${perpAng.toFixed(3)}°）` })
    }
  }

  // ⑤ 等半径聚类
  const radIdx: number[] = []
  for (let i = 0; i < n; i++) if (radiusOfParams(snapped[i]) != null) radIdx.push(i)
  radIdx.sort((a, b) => (radiusOfParams(snapped[a]) as number) - (radiusOfParams(snapped[b]) as number))
  let ci = 0
  while (ci < radIdx.length) {
    const cluster = [radIdx[ci]]
    const r0 = radiusOfParams(snapped[radIdx[ci]]) as number
    let cj = ci + 1
    while (cj < radIdx.length) {
      const rj = radiusOfParams(snapped[radIdx[cj]]) as number
      if (Math.abs(rj - r0) > Math.max(opt.eps, r0 * opt.equalRadiusRelTol)) break
      cluster.push(radIdx[cj]); cj++
    }
    if (cluster.length > 1) {
      let sum = 0, wsum = 0, spread = 0
      for (const i of cluster) { const w = datas[i].nAll; sum += (radiusOfParams(snapped[i]) as number) * w; wsum += w }
      const rAvg = sum / wsum
      for (const i of cluster) spread = Math.max(spread, Math.abs((radiusOfParams(snapped[i]) as number) - rAvg))
      for (const i of cluster) setRadius(snapped[i], rAvg)
      snaps.push({ kind: 'equalRadius', regions: cluster.slice(), applied: true, before: spread, after: 0, detail: `区 [${cluster.join(',')}] 等半径 → ${rAvg.toFixed(4)}mm（原散布 ${spread.toExponential(2)}mm）` })
    }
    ci = cj
  }

  // ⑥ 圆整半径（默认只 flag，唔改 —— 逆向工程唔可以擅自「靓化」尺寸）
  for (let i = 0; i < n; i++) {
    const r = radiusOfParams(snapped[i])
    if (r == null || !(r > 0)) continue
    const step = opt.roundStep
    const rr = Math.round(r / step) * step
    if (rr <= 0) continue
    const delta = Math.abs(rr - r)
    if (delta <= Math.max(opt.eps, r * 0.01) && delta > 0) {
      if (opt.roundRadii) setRadius(snapped[i], rr)
      snaps.push({ kind: 'roundRadius', regions: [i], applied: opt.roundRadii, before: r, after: rr, detail: `区 ${i} 半径 ${r.toFixed(4)} ≈ ${rr}mm` })
    }
  }
  return snaps
}

function setRadius(p: PrimitiveParams, r: number): void {
  if (p.kind === 'sphere' || p.kind === 'cylinder') p.radius = r
  else if (p.kind === 'torus') p.minorRadius = r
}

// ═══════════════════════════════════ 主入口 ═══════════════════════════════════

/**
 * STL/网格 → 分割 + 基元识别 + 约束 snap 嘅一站式入口（M1 出口 = M2/M3 入口）。
 * @param input { v: 扁平顶点, t: 扁平三角索引 }（CAD mm 坐标）
 * @param options 容差/开关（全部尺度自适应默认）
 */
export function segmentAndFit(input: { v: ArrayLike<number>; t: ArrayLike<number> }, options: ReverseFitOptions = {}): SegmentationResult {
  const seg = segmentMesh(input, options)
  const tFit0 = performance.now()
  const m = seg.mesh
  const eps = options.epsDist != null && options.epsDist > 0 ? options.epsDist : m.diag * 1e-3
  const alphaDeg = options.normalDevTolDeg ?? 15
  const ratio = options.parsimonyRatio ?? 2
  const minArcDeg = options.minArcDeg ?? 35
  const maxFitPoints = options.maxFitPoints ?? 3000
  const doMerge = options.mergeSameSurface ?? true
  const doSnap = options.snap ?? true

  const stamp = new Int32Array(Math.max(1, m.nv)).fill(-1)
  let regions = seg.regions
  let adjacency = seg.adjacency
  let labels = seg.labels

  // 圆角带候选：曲率恒定非零 + 至少接住两个邻区（fillet 一定夹喺两张面中间）
  const blendFlags = (regs: MeshRegion[], adj: [number, number][]): boolean[] => {
    const degree = new Int32Array(regs.length)
    for (const [a, b] of adj) { degree[a]++; degree[b]++ }
    return regs.map((r, i) => {
      const k = Math.abs(r.kMinMean) >= Math.abs(r.kMaxMean) ? r.kMinMean : r.kMaxMean
      return Math.abs(k) > seg.opts.curvAbsTol && degree[i] >= 2
    })
  }

  let datas = regions.map((r, i) => buildRegionData(m, seg.topo, r, stamp, i, maxFitPoints))
  const blends0 = blendFlags(regions, adjacency)
  let fits = regions.map((_, i) => fitOneRegion(datas[i], eps, alphaDeg, ratio, minArcDeg, blends0[i]))
  let merges = 0
  let stampMark = regions.length

  /**
   * 用新 labels 重砌区（压缩掉空区）+ 重擬合。
   * dirtyOld[oldLabel]=1 先重擬合，其余直接沿用旧结果 —— 精修/合并通常只郁两三个区，
   * 全部重擬合会白白贵一倍（50k 三角 3 秒预算好紧）。
   */
  const rebuild = (raw: Int32Array, oldFits: RegionFit[], dirtyOld: Uint8Array): void => {
    const nOld = oldFits.length
    const map = new Int32Array(nOld).fill(-1)
    const firstOld: number[] = []
    let nNew = 0
    for (let t = 0; t < m.nt; t++) {
      const l = raw[t]
      if (map[l] < 0) { map[l] = nNew++; firstOld.push(l) }
    }
    const newLabels = new Int32Array(m.nt)
    for (let t = 0; t < m.nt; t++) newLabels[t] = map[raw[t]]
    const rb = buildRegionTopology(m, seg.topo, newLabels, nNew)
    labels = newLabels
    regions = rb.regions
    adjacency = rb.adjacency
    const nb = blendFlags(regions, adjacency)
    const newDatas: RegionData[] = []
    const newFits: RegionFit[] = []
    for (let i = 0; i < regions.length; i++) {
      const old = firstOld[i]
      if (!dirtyOld[old]) { newDatas.push(datas[old]); newFits.push(oldFits[old]); continue }
      const rd = buildRegionData(m, seg.topo, regions[i], stamp, stampMark++, maxFitPoints)
      newDatas.push(rd)
      newFits.push(fitOneRegion(rd, eps, alphaDeg, ratio, minArcDeg, nb[i]))
    }
    datas = newDatas
    fits = newFits
  }

  // ── ① 边界精修 / 碎区收编（最多 3 趟）──
  if (options.refineBoundaries ?? true) {
    for (let pass = 0; pass < 3; pass++) {
      const counts = new Int32Array(regions.length)
      for (let t = 0; t < m.nt; t++) counts[labels[t]]++
      const dirty = new Uint8Array(regions.length)
      const raw = labels.slice()
      const moved = refineBoundaryPass(m, seg.topo, raw, fits, counts, dirty, eps, alphaDeg, options.minReliableTris ?? 4)
      if (moved === 0) break
      rebuild(raw, fits, dirty)
    }
  }

  // ── ② 同面合并（一轮）──
  if (doMerge && regions.length > 1) {
    const parent = new Int32Array(regions.length)
    for (let i = 0; i < regions.length; i++) parent[i] = i
    const find = (x: number): number => { let r = x; while (parent[r] !== r) r = parent[r]; while (parent[x] !== r) { const nx = parent[x]; parent[x] = r; x = nx } return r }
    const dirty = new Uint8Array(regions.length)
    for (const [a, b] of adjacency) {
      if (fits[a].kind === 'freeform' || fits[b].kind === 'freeform') continue
      if (!sameSurface(fits[a], fits[b], eps, 1.5)) continue
      const ra = find(a), rb = find(b)
      if (ra !== rb) { parent[rb] = ra; merges++ }
    }
    if (merges > 0) {
      const raw = new Int32Array(m.nt)
      for (let t = 0; t < m.nt; t++) { const r = find(labels[t]); raw[t] = r; if (r !== labels[t]) { dirty[r] = 1; dirty[labels[t]] = 1 } }
      rebuild(raw, fits, dirty)
    }
  }

  // ── snap ──
  const snappedParams = fits.map((f) => cloneParams(f.params))
  let snaps: AppliedSnap[] = []
  if (doSnap) {
    snaps = runSnapPass(fits, datas, snappedParams, {
      angleDeg: options.snapAngleDeg ?? 1,
      distTol: options.snapDistTol ?? Math.max(eps * 2, m.diag * 2e-3),
      eps,
      minArcDeg,
      equalRadiusRelTol: options.equalRadiusRelTol ?? 0.01,
      roundRadii: options.roundRadii ?? false,
      roundStep: options.roundRadiusStep ?? 0.5,
    })
  }

  const out: FittedRegion[] = regions.map((r, i) => ({
    index: i,
    kind: fits[i].kind,
    params: fits[i].params,
    paramsSnapped: snappedParams[i],
    rmsError: fits[i].rms,
    maxError: fits[i].maxErr,
    normalDevDeg: fits[i].normalDevDeg,
    area: r.area,
    triCount: r.triIndices.length,
    vertCount: datas[i].nAll,
    triIndices: r.triIndices,
    boundaryLoops: r.boundaryLoops,
    arcCoverageDeg: fits[i].arcCoverageDeg,
    illConditioned: fits[i].illConditioned,
    isBlend: fits[i].isBlend,
    blendRadius: fits[i].blendRadius,
    candidates: fits[i].candidates,
  }))

  let openLoops = 0, freeArea = 0, totalArea = 0, freeCount = 0
  for (let i = 0; i < regions.length; i++) {
    openLoops += regions[i].openLoops
    totalArea += regions[i].area
    if (fits[i].kind === 'freeform') { freeArea += regions[i].area; freeCount++ }
  }
  const tFit1 = performance.now()

  return {
    regions: out,
    adjacency,
    snaps,
    verts: m.pos,
    tris: m.tri,
    triSrc: m.triSrc,
    labels,
    diag: m.diag,
    stats: {
      tris: m.nt,
      weldedVerts: m.nv,
      msSegment: seg.msWeld + seg.msTopo + seg.msGrow,
      msFit: tFit1 - tFit0,
      regions: out.length,
      freeformRegions: freeCount,
      recognizedAreaFrac: totalArea > 0 ? 1 - freeArea / totalArea : 0,
      openLoops,
      droppedTris: m.droppedTris,
      nonManifoldEdges: seg.topo.nonManifoldHe,
      merges,
    },
  }
}

