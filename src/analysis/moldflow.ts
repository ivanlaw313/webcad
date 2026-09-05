// =====================================================================================
// moldflow.ts — 注塑充填「趋势」模拟（Hele-Shaw 薄壁近似、体素级）
//
// 全部自写（无第三方/无复制代码），零运行时依赖，纯 TypeScript；
// 只 import 同目录 voxelfea.ts 嘅 voxelize（T745 体素化，精度已有测试覆盖）。
//
// 诚实定位（同 voxelfea 一脉相承）：
//   呢个唔系 Moldflow / Moldex3D 级数嘅流变模拟 —— 无 Cross-WLF 黏度模型、
//   无压力-温度耦合、无保压/纤维取向求解。定位系浏览器秒级回答：
//     「边度最后充填？焊接线大概喺边？边度冷却最慢？边度收缩变形风险高？」
//   输出系趋势着色 + 量级估算：pressure 一律归一化 0..1（冇真实 MPa），
//   warp 一律归一化 0..1（冇真实 mm 翘曲量）。假设全部列明喺 warnings。
//
// 物理模型（公式喺各函数注释再详细）：
//   壁厚   — 3D chamfer 距离变换（两 pass，权 1·h/√2·h/√3·h）→ 局部半壁厚 h_i。
//   充填   — Hele-Shaw 薄壁流：板间流导 ∝ h³/μ（Poiseuille 平板解），
//            充填先后用多源 Dijkstra 最小阻力路径近似，边成本 = ds·μrel/h_avg³。
//   焊接线 — ① 唔同浇口前沿相遇（label 唔同 + Δτ 细）；
//            ② 同浇口绕障分流再合流（到达方向相反 + Δτ 细，保守三重条件）。
//   冷却   — 经典板式冷却公式 t = s²/(π²α)·ln(8(Tm−Tw)/(π²(Te−Tw)))，s = 全壁厚。
//   变形   — 差异收缩 proxy：|∇(shrink·全壁厚)| 中央差分，归一化 0..1。
//
// 单位：长度 mm，时间 s，温度 °C，热扩散率 α mm²/s。
// =====================================================================================

import { voxelize } from './voxelfea'
import { solveMoldFill, MOLD_CROSS, MOLD_TAIT, type CrossCoef } from './moldsolve'

// ------------------------------------------------------------------ 材料库

export interface MoldMaterial {
  name: string
  melt: number   // 熔体温度 °C
  mold: number   // 模具温度 °C
  eject: number  // 顶出温度 °C
  alpha: number  // 热扩散率 mm²/s
  visc: number   // 相对黏度指数（无量纲趋势值，ABS=1.0 基准，PP=0.7）
  shrink: number // 成型收缩率 %
}

// 教科书参考值（处理窗口中值；唔同牌号差异可以好大 —— 净系做趋势对比用，非牌号数据）
export const MOLD_MATERIALS: Record<string, MoldMaterial> = {
  ABS:  { name: 'ABS',  melt: 230, mold: 60, eject: 95,  alpha: 0.085, visc: 1.0, shrink: 0.55 },
  PP:   { name: 'PP',   melt: 230, mold: 40, eject: 90,  alpha: 0.075, visc: 0.7, shrink: 1.6 },
  PC:   { name: 'PC',   melt: 300, mold: 90, eject: 125, alpha: 0.11,  visc: 1.8, shrink: 0.6 },
  PA6:  { name: 'PA6',  melt: 260, mold: 80, eject: 110, alpha: 0.10,  visc: 0.9, shrink: 1.2 },
  POM:  { name: 'POM',  melt: 205, mold: 90, eject: 120, alpha: 0.09,  visc: 0.8, shrink: 2.0 },
  PMMA: { name: 'PMMA', melt: 240, mold: 60, eject: 95,  alpha: 0.09,  visc: 1.4, shrink: 0.45 },
  TPU:  { name: 'TPU',  melt: 210, mold: 40, eject: 70,  alpha: 0.10,  visc: 1.1, shrink: 1.2 },
}

// 浇口类型谱搬咗去独立轻模块 gateTypes.ts（令 store/UI 可 import 而唔拖求解器入主 bundle）；呢度 re-export 保旧引用。
export { GATE_TYPES } from './gateTypes'
export type { GateType, GateTypeSpec, GateSpec, GateStat } from './gateTypes'
import { GATE_TYPES, type GateType, type GateSpec, type GateStat } from './gateTypes'

// ------------------------------------------------------------------ API 类型

export interface MoldInput {
  vertices: ArrayLike<number>            // CAD mm 网格（水密三角形）
  triangles: ArrayLike<number>
  gates: [number, number, number][]      // CAD 坐标浇口点（≥1，自动吸附最近实体体素）
  material: string                       // MOLD_MATERIALS key
  resolution?: number                    // 最长边体素数，默认 28，cap 64
  solver?: boolean                       // true = 真 2.5D Hele-Shaw 压力求解器（耦合前沿/真 MPa/race-track）；false/缺省 = 趋势级 Dijkstra
  gateSpecs?: GateSpec[]                  // 逐浇口规格（对齐 gates；缺省 = edge 类型、权重 1）
  runnerBalance?: boolean                 // true = 自动流道平衡（按各浇口几何责任域体积分配流量 → 同步填满）
  // ── GM-W8 C5-S2 Stage-2 温度耦合（仅 solver 模式有效；缺省 off → 等温 Stage-1 逐位一致）──
  thermal?: boolean                      // true = 解能量方程 + Cross-WLF η(γ̇,T)（长薄流程冷却 → 黏度升 → 压力需求升；热流道保温）
  tMelt?: number                         // 熔体入口温度 °C（缺省用材料典型值 MOLD_CROSS.tMelt）
  tMold?: number                         // 模壁温度 °C（缺省用材料典型值 MOLD_CROSS.tMold）
  viscousHeating?: boolean               // 黏性耗散升温开关（缺省 true）
  // ── GM-P3 Stage-3 保压 / PVT 收缩预测（仅 solver 模式有效；缺省 off → 逐位一致，唔分配/唔运行）──
  enablePacking?: boolean                // true = 充填后行保压 + Tait 体积收缩预测（预测缩水）
  packPressure?: number                  // 保压压力 Pa（缺省 0；典型 20–60 MPa = 2e7–6e7）
  packTime?: number                      // 保压时间 s（缺省 0；典型 2–10 s）
  onProgress?: (pct: number, note: string) => void   // pct ∈ [0,100]
}

export interface MoldResult {
  h: number; nVox: number
  centers: Float32Array                  // nVox×3 CAD 坐标（实心体素中心，k→j→i 升序）
  fill: Float32Array                     // 充填时间 s（按 tFill 缩放后）
  pressure: Float32Array                 // 相对压力趋势 0..1（归一化 —— 诚实：无真实流变唔出 MPa）
  cooling: Float32Array                  // 冷却时间 s（板式公式按局部壁厚）
  warp: Float32Array                     // 变形趋势 0..1（差异收缩梯度归一化）
  weld: Uint8Array                       // 1 = 焊接线体素
  airtrap: Uint8Array                    // 1 = 困气/最后充填体素（前沿喺此终止 = τ 局部极大；无排气会烧焦/短射）
  unreached: Uint8Array                  // 1 = 前沿【完全到唔到】嘅实体体素（孤岛/窄缝断连）—— 同「填得迟（红）」唔同，应着色区分
  sinkMark: Float32Array                 // 缩痕趋势 0..1（局部绝对壁厚异常 = 慢冷收缩 → 表面凹陷；筋位/凸台/厚芯）
  fillDir: Float32Array                  // S190：nVox×3 单位流向（∇充填时间方向 = 熔体由浇口往外流向）—— 画流向线/箭头
  gateIdx: number[]                      // 每个浇口最近体素 index（入 centers 序）
  tFill: number                          // 注射时间 s（V/V̇，V̇=50 cm³/s 假设）
  pMaxRel: number                        // 最大相对压力（归一化后恒 1）
  tCool: number                          // 冷却时间 s（最厚位）
  cycle: number                          // 周期估算 s = tFill + tCool + 5s 开合模
  solverUsed: boolean                    // true = 真 2.5D 求解器路径（pressure 系真物理场）；false = 趋势 Dijkstra
  pPeakMPa: number                       // 峰值注射压力估算 MPa（求解器模式先有意义；趋势模式 = 0）
  clampForceKN: number                   // 锁模力估算 kN（#88 修正：峰值压力×投影面积积分；求解器模式；趋势模式 = 0）
  clampForceAvgKN: number                // #88 旧法（充填末瞬时全场均压×单层面积，系统性低估）—— 保留作对比
  resActual: number                      // #87 实际使用嘅体素分辨率（薄壁自动加密后；≥ 请求值）—— UI 应显示此真值
  wallMedian: number                     // 中位全壁厚 mm（= 2·median(半厚)）—— 薄壁判定 + 诚实忠告用
  wallMax: number                        // 最厚全壁厚 mm（= 2·max(半厚)）—— 主导冷却/周期嘅厚段
  moldable: 'ok' | 'thick' | 'solid'     // 注塑适用性：ok=薄壁 / thick=有局部厚段 / solid=整体偏厚实心（建议抽壳）
  gateStats: GateStat[]                  // 逐浇口统计（求解器模式有效；趋势模式仅 type/flowFrac/domainVox）
  balanced: boolean                      // 是否启用咗自动流道平衡
  fillImbalance: number                  // 各浇口责任域充填时间不平衡度 = (max−min)/max（0=完美同步）
  // ── GM-W8 C5-S2 Stage-2 温度耦合结果（thermal 开时；关时 undefined）──
  temp?: Float32Array                    // 逐体素最终温度 °C（compact 序，未填 = NaN）
  tMin?: number                          // 最低熔温 °C
  tMax?: number                          // 最高熔温 °C
  frozenFraction?: number                // 冻结前沿占比（潜在短射）
  shortShotRisk?: boolean                // 短射风险
  thermalUsed?: boolean                  // true = 行咗 Stage-2 温度耦合路径
  // ── GM-P3 Stage-3 保压 / PVT 收缩结果（enablePacking 开时；关时 undefined → 逐位一致）──
  packing?: {
    sealedPressure: Float32Array         // 逐体素冻结瞬间锁定局部压力 Pa（compact 序）
    shrinkageField: Float32Array         // 逐体素体积收缩率 %（compact 序，未填 = NaN）—— THE 预测缩水云图
    shrinkMax: number                    // 最大体积收缩 %
    shrinkAvg: number                    // 平均体积收缩 %
    shrinkUniformity: number             // 收缩均匀度 0..1（低 → 翘曲风险）
    packTraceNote: string                // 诚实注记（保压参数 + 趋势级假设摊牌）
    // ── GM-S4 Stage-4 翘曲（趋势级；仅保压开时有）──
    warpField: Float32Array              // 逐体素翘曲风险 0..1（compact 序，= |面内∇收缩| 归一；未填/浇口 = NaN/0）
    warpMaxDir: [number, number, number] // 主导微分收缩轴单位向量（CAD 坐标）
    warpIndex: number                    // 翘曲趋势指数 0..100（微分收缩弯矩 proxy × 收缩幅度）
    warpNote: string                     // 诚实注记：趋势级差异收缩弯矩 proxy，非 FEM 翘曲位移
  }
  solidRatio: number; warnings: string[]
}

/** 体素网格类型（复用 voxelfea 嘅结构，唔另开定义）。 */
type Grid = ReturnType<typeof voxelize>
type GridLite = Pick<Grid, 'nx' | 'ny' | 'nz' | 'h' | 'solid'>

// ------------------------------------------------------------------ 常量假设（报告列明）

const VDOT = 50000        // 注射体积流率假设 mm³/s（= 50 cm³/s，中型注塑机典型值）
const MOLD_OPEN_S = 5     // 开合模 + 顶出时间假设 s

/** 分辨率截到 [4,256]；未提供/非法值用默认 28。上限 256 = 用户「肯等」时可推到极致细（UI 滑杆 + 预计耗时确认）。 */
function clampResolution(r: number | undefined): number {
  const v = Math.round(r !== undefined && Number.isFinite(r) ? r : 28)
  return Math.min(256, Math.max(4, v))
}

/** 下中位数（空数组 → 0）。 */
function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const a = arr.slice().sort((x, y) => x - y)
  return a[(a.length - 1) >> 1]
}

/**
 * #89：由浇口 CAD 坐标就近扩壳搜索【最近实体体素中心】的 compact 序，取代旧 O(nGate×nVox) 全扫。
 *
 * 算法：坐标 → ijk（clamp 入网格）；由该格逐层扩 Chebyshev 壳（R=0,1,2,…）扫实体体素，
 *   记当前最近（min d²；tie → 最小 grid 序 = 最小 compact 序）；一旦有候选且外层壳最小可能距离
 *   (R·h) ≥ 当前最优距离 → 再扩无更近者，停。规则同暴力最近邻【逐字节一致】：
 *   d² 用同一 Float32 centers、同一算式（位相同），tie-break 同取最小 p —— 见 tests/moldflow-gatesnap。
 * 退化守卫：搜到 Rlim 仍无实体（nVox≥1 时理论不达）→ 回退 {e:0, d2:∞}。
 */
export function nearestSolidVoxel(
  gx: number, gy: number, gz: number,
  nx: number, ny: number, nz: number, h: number,
  ox: number, oy: number, oz: number,
  compactOf: ArrayLike<number>, centers: ArrayLike<number>,
): { e: number; d2: number } {
  const clamp = (v: number, hi: number): number => (v < 0 ? 0 : (v > hi ? hi : v))
  const i0 = clamp(Math.floor((gx - ox) / h), nx - 1)
  const j0 = clamp(Math.floor((gy - oy) / h), ny - 1)
  const k0 = clamp(Math.floor((gz - oz) / h), nz - 1)
  let bestE = -1, bestP = -1, bestD2 = Infinity
  const consider = (i: number, j: number, k: number): void => {
    if (i < 0 || i >= nx || j < 0 || j >= ny || k < 0 || k >= nz) return
    const p = i + nx * (j + ny * k)
    const e = compactOf[p] as number
    if (e < 0) return                       // 非实体
    const dx = (centers[e * 3] as number) - gx, dy = (centers[e * 3 + 1] as number) - gy, dz = (centers[e * 3 + 2] as number) - gz
    const d2 = dx * dx + dy * dy + dz * dz
    if (d2 < bestD2 || (d2 === bestD2 && p < bestP)) { bestD2 = d2; bestE = e; bestP = p }
  }
  const Rlim = nx + ny + nz                  // 守卫上限（覆盖整网格）
  for (let R = 0; R <= Rlim; R++) {
    if (R === 0) {
      consider(i0, j0, k0)
    } else {
      // 只扫 Chebyshev == R 的壳（避免重扫内层）
      for (let dk = -R; dk <= R; dk++) {
        const ak = Math.abs(dk) === R
        for (let dj = -R; dj <= R; dj++) {
          if (ak || Math.abs(dj) === R) {
            for (let di = -R; di <= R; di++) consider(i0 + di, j0 + dj, k0 + dk)   // di 全扫（顶/底/侧面）
          } else {
            consider(i0 - R, j0 + dj, k0 + dk)   // 中间层仅 di = ±R 两片
            consider(i0 + R, j0 + dj, k0 + dk)
          }
        }
      }
    }
    if (bestE >= 0 && R * h >= Math.sqrt(bestD2)) break   // 外层壳不可能更近 → 停
  }
  return bestE >= 0 ? { e: bestE, d2: bestD2 } : { e: 0, d2: Infinity }
}

/**
 * #42/#88：锁模力（kN）对标准最大机台档（3200 公吨力）嘅量程判定（含 marginPct 裕度）。
 * overRange=true → 需求超出标准最大机台 —— 下游应诚实提示「超出量程/需大型特种机」，而唔系静默封顶 3200t。
 * （标准机台表最大档 = 3200t，同 moldExport.MACHINE_TONNES 尾档一致；此处独立复算供求解器诚实警告。）
 */
export function clampMachineFit(clampForceKN: number, marginPct = 15): { requiredTonne: number; overRange: boolean } {
  const reqTonne = clampForceKN > 0 ? clampForceKN / 9.80665 : 0    // kN → 公吨力（tonne-force）
  const withMargin = reqTonne * (1 + marginPct / 100)
  return { requiredTonne: reqTonne, overRange: withMargin > 3200 }
}

// ------------------------------------------------------------------ 1. 半壁厚场（chamfer DT）

/**
 * 3D chamfer 距离变换（两 pass，权 1·h / √2·h / √3·h）→ 局部半壁厚 h_i（mm）。
 *
 * dist 初始：非实体 = 0，实体 = ∞；网格外视为模具（非实体，距离 0）。
 * 前向 pass 扫 k↑j↑i↑ 用扫描序之前嘅 13 邻居，后向 pass 镜像 —— 经典两 pass chamfer，
 * 误差对欧氏距离 ≤ 几个百分点，趋势级足够。
 *
 * 中心距 → 半壁厚修正：最近非实体「体素中心」距 d，表面大约喺两中心中间，
 * 所以 h_i = d − 0.5h；再 clamp h_i ≥ 0.5h（量化保护 —— recon 风险注记：
 * 单层薄板都至少有半个体素嘅半厚，避免 h³ 流导出现 0/极端值）。
 *
 * 返回全网格 Float64Array（非实体 = 0）。
 */
function distanceTransform(grid: GridLite): Float64Array {
  const { nx, ny, nz, h, solid } = grid
  const n = nx * ny * nz
  const dist = new Float64Array(n)
  for (let p = 0; p < n; p++) dist[p] = solid[p] ? Infinity : 0

  // 前向 mask：扫描序（k↑ j↑ i↑）之前嘅 13 个邻居偏移 + chamfer 权重
  const oi: number[] = [], oj: number[] = [], ok: number[] = [], ow: number[] = []
  for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const before = dk < 0 || (dk === 0 && (dj < 0 || (dj === 0 && di < 0)))
    if (!before) continue
    const m = Math.abs(di) + Math.abs(dj) + Math.abs(dk)
    oi.push(di); oj.push(dj); ok.push(dk)
    ow.push(h * (m === 1 ? 1 : m === 2 ? Math.SQRT2 : Math.sqrt(3)))
  }
  const nm = oi.length   // 13

  const pass = (sgn: 1 | -1): void => {
    const kS = sgn === 1 ? 0 : nz - 1
    const jS = sgn === 1 ? 0 : ny - 1
    const iS = sgn === 1 ? 0 : nx - 1
    for (let k = kS; k >= 0 && k < nz; k += sgn) {
      for (let j = jS; j >= 0 && j < ny; j += sgn) {
        for (let i = iS; i >= 0 && i < nx; i += sgn) {
          const p = i + nx * (j + ny * k)
          if (!solid[p]) continue
          let d = dist[p]
          for (let m = 0; m < nm; m++) {
            const ii = i + sgn * oi[m], jj = j + sgn * oj[m], kk = k + sgn * ok[m]
            const nd = (ii < 0 || ii >= nx || jj < 0 || jj >= ny || kk < 0 || kk >= nz)
              ? 0   // 网格外 = 模具壁（非实体），距离 0
              : dist[ii + nx * (jj + ny * kk)]
            const c = nd + ow[m]
            if (c < d) d = c
          }
          dist[p] = d
        }
      }
    }
  }
  pass(1)
  pass(-1)

  const half = 0.5 * h
  for (let p = 0; p < n; p++) {
    if (!solid[p]) { dist[p] = 0; continue }
    const v = dist[p] - half          // 中心距 → 表面距（半壁厚）
    dist[p] = v > half ? v : half     // clamp ≥ 0.5h（量化保护）
  }
  return dist
}

// ------------------------------------------------------------------ 2. 充填（多源 Dijkstra）

interface FillOut {
  tau: Float64Array      // 全网格到达成本（非实体/未连通 = ∞）
  label: Int32Array      // 全网格充填源序号（sources 内位置；未充填 = −1）
  parent: Int32Array     // 全网格 Dijkstra 父体素 grid index（源/未充填 = −1）
  tauMax: number         // 已连通实体体素最大到达成本
  nReached: number       // 已连通实体体素数
}

/**
 * 多源 Dijkstra 充填前沿近似。
 *
 * Hele-Shaw 薄壁流：两平板间隙 2h 嘅体积流导 ∝ h³/μ（Poiseuille 平板解
 * Q = (2h)³·W·ΔP/(12·μ·L)），所以流动「阻力」沿路径积分 ∝ Σ ds·μ/h³。
 * 充填先后用最小阻力路径近似 —— 前沿沿住阻力最细方向推进，τ_i = 到达成本。
 * 诚实注记：呢个忽略咗前沿耦合（质量守恒令并行流道互相影响）同熔体冷却冻结，
 * 系「边度先充边度后充」嘅趋势序，唔系真实时间场 —— 时间标定由调用方按
 * τ/τmax 缩放到 tFill。
 *
 * 边成本（6 邻接）= h · μrel / h_avg³，h_avg = (h_i + h_j)/2。
 * 懒删除二叉小顶堆，零依赖。
 */
function dijkstraFill(
  grid: GridLite,
  hHalf: Float64Array,
  sources: ArrayLike<number>,
  visc: number,
): FillOut {
  const { nx, ny, nz, h, solid } = grid
  const n = nx * ny * nz
  const nxny = nx * ny
  const tau = new Float64Array(n).fill(Infinity)
  const label = new Int32Array(n).fill(-1)
  const parent = new Int32Array(n).fill(-1)
  const done = new Uint8Array(n)

  // ---- 懒删除二叉小顶堆（pop 时跳过已定体素）
  const hIdx: number[] = []
  const hKey: number[] = []
  const push = (idx: number, key: number): void => {
    let c = hIdx.length
    hIdx.push(idx); hKey.push(key)
    while (c > 0) {
      const pa = (c - 1) >> 1
      if (hKey[pa] <= hKey[c]) break
      const tk = hKey[pa]; hKey[pa] = hKey[c]; hKey[c] = tk
      const ti = hIdx[pa]; hIdx[pa] = hIdx[c]; hIdx[c] = ti
      c = pa
    }
  }
  const pop = (): number => {
    const top = hIdx[0]
    const lk = hKey.pop() as number
    const li = hIdx.pop() as number
    const m = hIdx.length
    if (m > 0) {
      hKey[0] = lk; hIdx[0] = li
      let pa = 0
      for (;;) {
        const l = pa * 2 + 1
        if (l >= m) break
        const r = l + 1
        const c = (r < m && hKey[r] < hKey[l]) ? r : l
        if (hKey[pa] <= hKey[c]) break
        const tk = hKey[pa]; hKey[pa] = hKey[c]; hKey[c] = tk
        const ti = hIdx[pa]; hIdx[pa] = hIdx[c]; hIdx[c] = ti
        pa = c
      }
    }
    return top
  }

  // ---- 多源初始化（重复浇口同一体素：首个 label 赢）
  for (let s = 0; s < sources.length; s++) {
    const g = sources[s]
    if (!(g >= 0 && g < n) || !solid[g]) continue
    if (label[g] >= 0) continue
    tau[g] = 0; label[g] = s; parent[g] = -1
    push(g, 0)
  }

  // ---- 主循环（relax 闭包避免 6 份重复代码；cur* 每 pop 更新）
  let curP = 0, curTau = 0, curH = 0, curLab = -1
  const relax = (q: number): void => {
    if (!solid[q] || done[q]) return
    const ha = 0.5 * (curH + hHalf[q])           // h_avg
    const c = curTau + (h * visc) / (ha * ha * ha)  // ds·μrel/h_avg³
    if (c < tau[q]) { tau[q] = c; label[q] = curLab; parent[q] = curP; push(q, c) }
  }
  while (hIdx.length > 0) {
    const p = pop()
    if (done[p]) continue
    done[p] = 1
    curP = p; curTau = tau[p]; curH = hHalf[p]; curLab = label[p]
    const i = p % nx, j = ((p / nx) | 0) % ny, k = (p / nxny) | 0
    if (i > 0) relax(p - 1)
    if (i < nx - 1) relax(p + 1)
    if (j > 0) relax(p - nx)
    if (j < ny - 1) relax(p + nx)
    if (k > 0) relax(p - nxny)
    if (k < nz - 1) relax(p + nxny)
  }

  let tauMax = 0
  let nReached = 0
  for (let p = 0; p < n; p++) {
    if (!solid[p] || !done[p]) continue
    nReached++
    if (tau[p] > tauMax) tauMax = tau[p]
  }
  return { tau, label, parent, tauMax, nReached }
}

// ------------------------------------------------------------------ 3. 焊接线

/**
 * 焊接线标记（保守三重条件 —— recon 风险注记：宁少报唔好乱报）。
 *
 * 对每对相邻（6 邻接）已充填体素 (p,q)：
 *   A. 唔同浇口前沿相遇：label 唔同 且 |τp−τq| ≤ cost(p,q)。
 *      （Dijkstra 三角不等式下相邻体素 Δτ 必然 ≤ cost，所以唔同 label 嘅
 *        接壤面 ≈ 两前沿相遇线，按规格全部标记。）
 *   B. 同浇口分流再合流（绕孔/绕骨位）：label 相同 且 到达方向（parent→自身，
 *      轴对齐单位向量）完全相反（dot = −1 < −0.5）且 |τp−τq| ≤ 0.8·cost。
 *      顺流邻居 Δτ 恰好 = cost，0.8 阈值把佢排除 → 净系「几乎同时从相反方向
 *      到达」先算合流。浇口体素（无 parent，方向未定义）唔参与条件 B。
 *
 * 返回全网格 Uint8Array（1 = 焊接线体素）。
 */
function markWeld(
  grid: GridLite,
  hHalf: Float64Array,
  tau: Float64Array,
  label: Int32Array,
  parent: Int32Array,
  visc: number,
): Uint8Array {
  const { nx, ny, nz, h, solid } = grid
  const n = nx * ny * nz
  const nxny = nx * ny
  const weld = new Uint8Array(n)

  // ── 条件 A：唔同浇口前沿相遇（label 唔同 + Δτ ≤ cost）。多浇口/多源时两股充填前沿撞口处。 ──
  const checkPairA = (p: number, q: number): void => {
    if (!solid[q]) return
    const lp = label[p], lq = label[q]
    if (lp < 0 || lq < 0 || lp === lq) return
    const ha = 0.5 * (hHalf[p] + hHalf[q])
    const cost = (h * visc) / (ha * ha * ha)
    if (Math.abs(tau[p] - tau[q]) <= cost * (1 + 1e-9)) { weld[p] = 1; weld[q] = 1 }
  }
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const p = i + nx * (j + ny * k)
    if (!solid[p]) continue
    if (i < nx - 1) checkPairA(p, p + 1)
    if (j < ny - 1) checkPairA(p, p + nx)
    if (k < nz - 1) checkPairA(p, p + nxny)
  }

  // ── 条件 B（修正）：同浇口绕障（孔/骨位/凸台）分流后【下游再合流】= 充填时间 τ 喺某轴【局部极大】
  //    （cut-locus / 焊接脊线）。两股前沿绕过障碍喺下游对冲汇合 → 该处【最后】充填 → τ 比该轴【两侧】
  //    邻体素都高。呢个先系几何正确嘅汇流轨迹（焊接线喺孔【下游】，唔系上游）。
  //    旧版只认「到达方向严格轴向相反 dp===−dq」漏晒斜向汇合 + 位置错（用户实测：平板双孔，浇口右侧，
  //    焊接线应喺各孔【左/下游】侧 —— 旧条件 B 捉唔到）。τ 系单源 Dijkstra 距离场，沿轴局部极大 ⇔ 两条
  //    等阻力路径喺此相遇（中轴/cut-locus）；平直流道单调推进无局部极大 → 唔会误报；远端充填终点系
  //    边界邻壁（非两股对冲）→ 亦唔会误报。 ──
  const strides = [1, nx, nxny]
  const limAx = [nx, ny, nz]
  for (let p = 0; p < n; p++) {
    if (!solid[p] || parent[p] < 0) continue   // 浇口 / 未充填唔参与
    const ix = p % nx, iy = ((p / nx) | 0) % ny, iz = (p / nxny) | 0
    const coord = [ix, iy, iz]
    for (let ax = 0; ax < 3; ax++) {
      if (coord[ax] <= 0 || coord[ax] >= limAx[ax] - 1) continue
      const st = strides[ax], qm = p - st, qp = p + st
      if (!solid[qm] || !solid[qp] || parent[qm] < 0 || parent[qp] < 0) continue
      // τ 沿此轴局部极大（两侧都比 p 早充填）= 两股前沿喺 p 对冲汇合 → 焊接脊线。
      if (tau[qm] < tau[p] && tau[qp] < tau[p]) { weld[p] = 1; break }
    }
  }
  return weld
}

// ------------------------------------------------------------------ 3b. 困气 / 最后充填点（air trap）

/**
 * 困气点标记 —— 充填前沿【终止】嘅死角（cul-de-sac）。物理：熔体推住型腔里嘅空气走，
 * 空气最后聚喺前沿最迟到达嘅角落；若该处无排气槽 → 空气被压缩 → 烧焦（diesel effect）/ 短射。
 *
 * 判据：实体且已充填（τ 有限）嘅体素 p，若【所有】6 面邻居都唔系「之后先充」——
 * 即每个邻居要么系模壁（出界/非实体）/未连通（孤岛），要么 τ 严格【更早】——
 * 则前沿喺 p 完全终止 ⇒ p 系 τ 局部极大 ⇒ 困气点。
 *
 * 同焊接脊线（markWeld 条件 B）嘅分别：焊接脊线系沿【某一轴】局部极大（两股前沿喺该轴对冲，
 * 但前沿仍沿垂直方向继续推进）；困气点系【全方向】局部极大（前沿无路可走 = 真死角）。
 * 故困气点 ⊂ 焊接脊线嘅末端 + 孤立死腔；典型系远端壁角同盲腔中心（全局 τmax 必然系困气点）。
 *
 * 返回全网格 Uint8Array（1 = 困气体素）。
 */
function markAirTraps(grid: GridLite, tau: Float64Array): Uint8Array {
  const { nx, ny, nz, solid } = grid
  const n = nx * ny * nz
  const nxny = nx * ny
  const trap = new Uint8Array(n)
  for (let p = 0; p < n; p++) {
    if (!solid[p] || !Number.isFinite(tau[p])) continue   // 唔实体 / 未充填唔参与
    const ix = p % nx, iy = ((p / nx) | 0) % ny, iz = (p / nxny) | 0
    let isMax = true
    // 6 面邻接：任一【已充填实体】邻居 τ ≥ 自身 → 前沿仲会经此处往外走 → 唔系终止点
    if (ix > 0)      { const q = p - 1;    if (solid[q] && Number.isFinite(tau[q]) && tau[q] >= tau[p]) isMax = false }
    if (isMax && ix < nx - 1) { const q = p + 1;    if (solid[q] && Number.isFinite(tau[q]) && tau[q] >= tau[p]) isMax = false }
    if (isMax && iy > 0)      { const q = p - nx;   if (solid[q] && Number.isFinite(tau[q]) && tau[q] >= tau[p]) isMax = false }
    if (isMax && iy < ny - 1) { const q = p + nx;   if (solid[q] && Number.isFinite(tau[q]) && tau[q] >= tau[p]) isMax = false }
    if (isMax && iz > 0)      { const q = p - nxny; if (solid[q] && Number.isFinite(tau[q]) && tau[q] >= tau[p]) isMax = false }
    if (isMax && iz < nz - 1) { const q = p + nxny; if (solid[q] && Number.isFinite(tau[q]) && tau[q] >= tau[p]) isMax = false }
    if (isMax) trap[p] = 1   // 全方向 τ 局部极大 = 前沿终止 = 困气
  }
  return trap
}

// ------------------------------------------------------------------ 4. 冷却

/**
 * 经典板式冷却时间公式（一维瞬态导热第一项近似）：
 *   t = s² / (π²·α) · ln( 8·(Tmelt − Tmold) / (π²·(Teject − Tmold)) )
 * s = 全壁厚 mm（= 2·h_i），α = 热扩散率 mm²/s。
 * ln 参数 clamp ≥ 1.05（防 Teject ≤ Tmold 等非物理输入令 ln ≤ 0）。
 */
function coolingTime(s: number, mat: MoldMaterial): number {
  const pi2 = Math.PI * Math.PI
  let arg = (8 * (mat.melt - mat.mold)) / (pi2 * (mat.eject - mat.mold))
  if (!(arg >= 1.05)) arg = 1.05
  return (s * s) / (pi2 * mat.alpha) * Math.log(arg)
}

// ------------------------------------------------------------------ 5. 变形趋势

/**
 * 变形趋势 w_i = |∇(shrink · s_i)|，s_i = 2·h_i = 局部全壁厚。
 * 体素图上中央差分（两侧实心）/ 单侧差分（一侧实心）/ 0（轴向孤立）。
 * 诚实注记：真实翘曲要残余应力 + 约束刚度求解；呢度净系「厚薄过渡急 →
 * 差异收缩大 → 变形风险高」嘅一阶 proxy，输出由调用方归一化 0..1。
 * 返回全网格未归一化 |梯度|。
 */
function warpGradient(grid: GridLite, hHalf: Float64Array, shrink: number): Float64Array {
  const { nx, ny, nz, h, solid } = grid
  const n = nx * ny * nz
  const nxny = nx * ny
  const out = new Float64Array(n)
  const f = (p: number): number => shrink * 2 * hHalf[p]
  const axisGrad = (p: number, pm: number, pp: number, hasM: boolean, hasP: boolean): number => {
    const sm = hasM && solid[pm] !== 0
    const sp = hasP && solid[pp] !== 0
    if (sm && sp) return (f(pp) - f(pm)) / (2 * h)   // 中央差分
    if (sp) return (f(pp) - f(p)) / h                // 单侧（前向）
    if (sm) return (f(p) - f(pm)) / h                // 单侧（后向）
    return 0
  }
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const p = i + nx * (j + ny * k)
    if (!solid[p]) continue
    const gx = axisGrad(p, p - 1, p + 1, i > 0, i < nx - 1)
    const gy = axisGrad(p, p - nx, p + nx, j > 0, j < ny - 1)
    const gz = axisGrad(p, p - nxny, p + nxny, k > 0, k < nz - 1)
    out[p] = Math.sqrt(gx * gx + gy * gy + gz * gz)
  }
  return out
}

// ------------------------------------------------------------------ 5b. 缩痕趋势

/**
 * 缩痕趋势 sinkMark 0..1：局部【绝对】壁厚显著高于零件均值 = 慢冷 + 收缩大 → 表面被拉凹（缩痕/缩孔）。
 * 物理 = max(0, (h_i − h̄)/(1.5σ)) clamp 0..1（h̄/σ = 半壁厚均值/标准差）。
 *
 * 同 warp（warpGradient）嘅本质区别：warp 系厚度【过渡梯度】|∇(shrink·s)|（厚薄交界处高）；
 * sinkMark 系厚度【绝对异常】z-score —— 筋位/凸台/厚芯系经典缩痕位，冷却最慢、收缩最大，
 * 但一大片【均匀】厚区内部梯度 ≈ 0，warp 捉唔到，sinkMark 先反映得到「呢忽净系厚 → 会缩」。
 *
 * 纯函数（hhSolid = 紧凑序半壁厚），可 Node 测。σ≈0（等厚件）→ 全 0（无缩痕差异）。
 */
function sinkMarkField(hhSolid: ArrayLike<number>, nVox: number): Float32Array {
  const out = new Float32Array(nVox)
  if (nVox < 2) return out
  let sum = 0
  for (let e = 0; e < nVox; e++) sum += hhSolid[e] as number
  const mean = sum / nVox
  let varSum = 0
  for (let e = 0; e < nVox; e++) { const d = (hhSolid[e] as number) - mean; varSum += d * d }
  const sd = Math.sqrt(varSum / nVox)
  if (!(sd > 1e-9)) return out
  for (let e = 0; e < nVox; e++) {
    const z = ((hhSolid[e] as number) - mean) / (1.5 * sd)
    out[e] = z > 0 ? (z > 1 ? 1 : z) : 0
  }
  return out
}

// ------------------------------------------------------------------ 主入口

/**
 * 同步纯函数（喺 mold.worker 入面跑）。输入无效直接 throw 中文 Error
 * —— comlink 会原样传返主线程，唔做静默降级。
 */
export function runMoldFlow(inp: MoldInput): MoldResult {
  const warnings: string[] = []

  // ---- 0. 输入校验
  if (!inp || !inp.vertices || !inp.triangles) throw new Error('空网格：无顶点/三角形数组')
  if (inp.vertices.length < 9 || inp.triangles.length < 3) throw new Error('空网格：顶点/三角形不足')
  if (!inp.gates || inp.gates.length < 1) throw new Error('至少需要 1 个浇口（gates）')
  for (let g = 0; g < inp.gates.length; g++) {
    const pt = inp.gates[g]
    if (!pt || pt.length < 3 || !Number.isFinite(pt[0]) || !Number.isFinite(pt[1]) || !Number.isFinite(pt[2])) {
      throw new Error(`浇口 ${g + 1} 坐标无效（需 3 个有限数值）`)
    }
  }
  const mat = MOLD_MATERIALS[inp.material]
  if (!mat) throw new Error(`未知材料「${inp.material}」：可选 ${Object.keys(MOLD_MATERIALS).join(' / ')}`)

  const prog = (pct: number, note: string): void => {
    const cb = inp.onProgress
    if (cb) { try { cb(pct, note) } catch { /* 进度回调出错唔影响计算 */ } }
  }

  // 诚实假设声明（恒列，UI 报告直接显示）
  warnings.push(`趋势级模拟：Hele-Shaw h³ 流导 + 恒定 ${VDOT / 1000} cm³/s 注射 + 板式冷却假设；pressure/warp 为归一化相对值，非真实 MPa/mm`)

  // ---- 1. 体素化（复用 voxelfea T745 z 列奇偶体素化）
  // ★ 薄壁件自动加密：大盒 + 薄壁喺粗分辨率下，体素粗过壁厚 → z列奇偶【漏壁】→ 实体占比过低
  //   （甚至 < 5%）。旧版直接抛「实体体素占比 < 5%」→ UI catch 后只剩 status 报错，用户见
  //   「㩒运行 load 一阵就冇嘢」。改为：占比 < 10% 时自动加大分辨率重试（cap 52，平衡求解器耗时），
  //   仍 < 5% 至当真·非水密/退化先抛。令薄壳件（注塑最常见！）唔使用户手动调到「细」先 work。
  const MOLD_MAXRES = 256          // 模流体素化真上限：旧版 voxelize 内部硬封 64 → UI 256 滑杆形同虚设、细孔点都 carve 唔到（用户报「小孔处理唔到」根因）。此处解封到 256。
  const CELL_BUDGET = 2_000_000    // 总格数预算（防大/厚件高分辨率爆浏览器内存：moldflow/solver 开几条 Float64(n) 场）。薄板真实用例 ~200K 远未触及，只保护病态厚件。
  let res = clampResolution(inp.resolution)
  const reqRes = res
  if (inp.resolution !== undefined && Number.isFinite(inp.resolution) && Math.round(inp.resolution) !== res) {
    warnings.push(`分辨率 ${inp.resolution} 超出 [4,256]，已用 ${res}`)
  }
  // 按总格数预算回退 res（薄件：ex·ey·ez ≪ longest³ → 预算宽松、256 照畀；方/厚件 → 自动降到放得落，仍远高于旧 64）
  {
    let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity
    const V = inp.vertices, nV = Math.floor(V.length / 3)
    for (let i = 0; i < nV; i++) { const x = V[i * 3] as number, y = V[i * 3 + 1] as number, z = V[i * 3 + 2] as number; if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y; if (z < mnz) mnz = z; if (z > mxz) mxz = z }
    const ex = mxx - mnx, ey = mxy - mny, ez = mxz - mnz, longest = Math.max(ex, ey, ez)
    if (longest > 0) {
      const volRatio = Math.max(1e-9, (ex * ey * ez) / (longest * longest * longest))   // 包围盒「方正度」（薄件 ≪ 1）；格数 ≈ res³·volRatio
      const rBudget = Math.floor(Math.cbrt(CELL_BUDGET / volRatio))
      const rMax = Math.max(8, Math.min(MOLD_MAXRES, rBudget))
      if (res > rMax) { warnings.push(`分辨率 ${res} 会超出约 ${(CELL_BUDGET / 1e6).toFixed(0)}M 格内存预算，已回退到 ${rMax}（厚/大件可先抽壳或降精度）`); res = rMax }
    }
  }
  let grid = voxelize(inp.vertices, inp.triangles, res, (fr) => prog(35 * fr, '体素化'), MOLD_MAXRES)
  if (!(grid.h > 0)) throw new Error('包围盒退化：网格无体积范围')
  const AUTO_CAP = 64
  // 审计修复（用户报：一幅薄墙完全冇填 + 柱周围空格 + 唔够细）：根因系体素【中心点】判定 —— 当 h > 壁厚 时，
  //   1.9mm 墙带可整幅跌喺体素中心之间 → 嗰幅墙零体素（对齐依赖，所以净系「1 幅」漏）。
  //   原则修复：加密分辨率直到【h ≤ 壁厚】（h < 壁厚 时墙带必含 ≥1 中心 → 永不漏墙），同时令结果更细。
  //   判定用真距离变换嘅中位半壁厚：medHalf < 0.65h ⇒ 墙得 ~1 体素 ⇒ h 粗过壁 ⇒ 加密。占比过低/nVox==0 亦加密。
  while (res < AUTO_CAP) {
    const tot = grid.nx * grid.ny * grid.nz
    const sr = tot > 0 ? grid.nVox / tot : 0
    let need = grid.nVox === 0 || sr < 0.10
    if (!need && grid.nVox >= 1) {
      const dt = distanceTransform(grid)
      const hh: number[] = []
      for (let p = 0; p < dt.length; p++) if (grid.solid[p]) hh.push(dt[p])
      if (hh.length) { hh.sort((a, b) => a - b); if (hh[(hh.length - 1) >> 1] < grid.h * 0.65) need = true }   // 中位半壁厚 < 0.65h = 墙≈1体素 → h 粗过壁 → 会漏墙 → 加密
    }
    if (!need) break
    const next = Math.min(AUTO_CAP, Math.max(res + 4, Math.round(res * 1.4)))
    if (next <= res) break
    res = next
    grid = voxelize(inp.vertices, inp.triangles, res, (fr) => prog(35 * fr, '体素化（薄壁加密）'), MOLD_MAXRES)
  }
  if (res !== reqRes) warnings.push(`薄壁件自动加密：原分辨率 ${reqRes} 体素粗过壁厚（会漏整幅薄墙），已自动升到 ${res}（h≤壁厚→墙必填、更细）`)
  // 审计修复（用户实件：1mm 壁 @98mm 件，加密封顶 res64 仍 h=1.5>1mm → 整幅墙稀疏/漏）：
  //   保守表面体素回收 —— 中心点判定漏嘅薄墙，用「任何三角形扫过嘅 cell 都补做实体」补返（与分辨率无关，1mm 墙都密填）。
  //   大过体素嘅孔只标边、内部保留（孔唔会被填）；亚体素孔会填（分辨率极限）。逐三角按 ~h/2 重心采样 → 标 voxel。
  // ★ 细孔保形（用户报：模流处理唔到小孔）：表面回收会把孔嘅 rim 填实 → 封死细孔。故只喺 parity 体素化【未解析壁厚】
  //   （中位半壁厚 < 0.65h = 薄墙得 ~1 体素、会漏整幅墙）时先做回收（保住薄墙优先）；当分辨率够细、壁厚已解析时跳过
  //   → 细孔按 parity z-列奇偶干净保留。配合 voxelize 解封 256：用户提高分辨率 → 壁厚解析 → 自动跳过回收 → 小孔现形。
  let needRecovery = true
  {
    const _dt = distanceTransform(grid)
    const _hh: number[] = []
    for (let p = 0; p < _dt.length; p++) if (grid.solid[p]) _hh.push(_dt[p])
    if (_hh.length) { _hh.sort((a, b) => a - b); if (_hh[(_hh.length - 1) >> 1] >= grid.h * 0.65) needRecovery = false }
  }
  if (needRecovery) warnings.push('薄墙未被分辨率完全解析 → 已启用表面体素回收（保住整幅薄墙）：细于体素的小孔可能被填实，请提高「精细度」以解析小孔')
  if (needRecovery) {
    const _V = inp.vertices, _T = inp.triangles, _s = grid.solid
    const _nx = grid.nx, _ny = grid.ny, _nz = grid.nz, _h = grid.h, _ox = grid.ox, _oy = grid.oy, _oz = grid.oz
    let _added = 0
    const _mark = (x: number, y: number, z: number): void => {
      const i = ((x - _ox) / _h) | 0, j = ((y - _oy) / _h) | 0, k = ((z - _oz) / _h) | 0
      if (i < 0 || i >= _nx || j < 0 || j >= _ny || k < 0 || k >= _nz) return
      const p = i + _nx * (j + _ny * k); if (!_s[p]) { _s[p] = 1; _added++ }
    }
    const _nT = Math.floor(_T.length / 3)
    for (let t = 0; t < _nT; t++) {
      const a = (_T[t * 3] as number) * 3, b = (_T[t * 3 + 1] as number) * 3, c = (_T[t * 3 + 2] as number) * 3
      const ax = _V[a] as number, ay = _V[a + 1] as number, az = _V[a + 2] as number
      const bx = _V[b] as number, by = _V[b + 1] as number, bz = _V[b + 2] as number
      const cx = _V[c] as number, cy = _V[c + 1] as number, cz = _V[c + 2] as number
      const e1 = Math.hypot(bx - ax, by - ay, bz - az), e2 = Math.hypot(cx - ax, cy - ay, cz - az), e3 = Math.hypot(cx - bx, cy - by, cz - bz)
      const n = Math.max(1, Math.ceil(Math.max(e1, e2, e3) / (_h * 0.5)))
      for (let u = 0; u <= n; u++) for (let v = 0; v + u <= n; v++) {
        const bu = u / n, bv = v / n, bw = 1 - bu - bv
        _mark(ax * bw + bx * bu + cx * bv, ay * bw + by * bu + cy * bv, az * bw + bz * bu + cz * bv)
      }
    }
    grid.nVox += _added
  }
  const { h, nx, ny, nz, ox, oy, oz, solid, nVox, oddColumns } = grid
  if (nVox < 1) throw new Error('体素化后无实体体素：网格可能非水密或过细，请提高 resolution')
  const solidRatio = nVox / (nx * ny * nz)
  if (solidRatio < 0.05) {
    throw new Error(`实体体素占比 ${(solidRatio * 100).toFixed(1)}% < 5%（已自动试到分辨率 ${res}）：网格疑似非水密或退化薄壳，体素趋势结果不可信`)
  }
  if (oddColumns > 0) warnings.push(`奇异列 ${oddColumns} 条（网格边/缝，疑似非水密）`)

  // 紧凑索引（k→j→i 升序，同 voxelfea 单元顺序一致）+ 体素中心 + grid→compact 反查（#89 浇口吸附空间加速）
  const gridOf = new Int32Array(nVox)
  const compactOf = new Int32Array(nx * ny * nz).fill(-1)   // grid p → compact e（-1 = 非实体）；供 O(邻域) 浇口吸附
  const centers = new Float32Array(nVox * 3)
  {
    let e = 0
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const p = i + nx * (j + ny * k)
      if (!solid[p]) continue
      gridOf[e] = p
      compactOf[p] = e
      centers[e * 3] = ox + (i + 0.5) * h
      centers[e * 3 + 1] = oy + (j + 0.5) * h
      centers[e * 3 + 2] = oz + (k + 0.5) * h
      e++
    }
  }

  // ---- 2. 半壁厚场
  prog(38, '厚度场')
  const hHalf = distanceTransform(grid)
  prog(50, '厚度场')

  // ---- 3. 浇口吸附 + 类型/扇形展开 + 流道平衡（per-source 注射流率）
  const nGate = inp.gates.length
  const nxny = nx * ny, nAll = nx * ny * nz
  const stepOf = [1, -1, nx, -nx, nxny, -nxny]
  const inStep = (q: number, st: number): boolean => {              // 防 x 方向绕行 + 边界
    const r = q + st; if (r < 0 || r >= nAll) return false
    if (st === 1) return q % nx < nx - 1
    if (st === -1) return q % nx > 0
    return true
  }
  const gateIdx: number[] = []          // 每逻辑浇口最近 compact 体素（报告/UI/流向）
  const gateGridVox: number[] = []      // 每逻辑浇口主 grid 体素
  const gateType: GateType[] = []
  const sources: number[] = []          // 全部 source grid index（含扇形多格）
  const srcLabel: number[] = []         // 每 source 嘅逻辑浇口序号（扇形多格共享）
  for (let gI = 0; gI < nGate; gI++) {
    const [gx, gy, gz] = inp.gates[gI]
    // #89：由浇口坐标算 ijk 就近扩壳搜索最近实体体素（O(邻域)），取代旧 O(nGate×nVox) 全扫。
    //   结果同暴力最近邻【逐字节一致】（同 d²、同 tie-break 取最小 compact 序）—— 见 tests/moldflow-gatesnap。
    const snap = nearestSolidVoxel(gx, gy, gz, nx, ny, nz, h, ox, oy, oz, compactOf, centers)
    const best = snap.e, bestD2 = snap.d2
    gateIdx.push(best)
    const d = Math.sqrt(bestD2)
    if (d > 3 * h) warnings.push(`浇口 ${gI + 1} 离最近实体 ${d.toFixed(1)} mm（> 3×体素）：已吸附到最近体素，请确认浇口位置`)
    const spec = (inp.gateSpecs && inp.gateSpecs[gI]) || {}
    const gt: GateType = (spec.type && GATE_TYPES[spec.type]) ? spec.type : 'edge'
    gateType.push(gt)
    const gp = gridOf[best]
    gateGridVox.push(gp)
    const myVox = [gp]
    const fanN = GATE_TYPES[gt].fanCells       // 扇形浇口：沿最长 in-solid 轴铺开成线性入口（平面前沿）
    if (fanN > 1) {
      let bestAx = 0, bestRun = -1
      for (let ax = 0; ax < 3; ax++) {
        const sp = ax === 0 ? 1 : ax === 1 ? nx : nxny
        let run = 1
        for (const dir of [sp, -sp]) { let q = gp; for (let k = 0; k < fanN; k++) { if (!inStep(q, dir)) break; q += dir; if (!solid[q]) break; run++ } }
        if (run > bestRun) { bestRun = run; bestAx = ax }
      }
      const sp = bestAx === 0 ? 1 : bestAx === 1 ? nx : nxny
      const half = (fanN - 1) >> 1
      for (const dir of [sp, -sp]) { let q = gp; for (let k = 0; k < half; k++) { if (!inStep(q, dir)) break; q += dir; if (!solid[q]) break; myVox.push(q) } }
    }
    for (const q of myVox) { if (!sources.includes(q)) { sources.push(q); srcLabel.push(gI) } }
  }

  // 责任域：多源 BFS（图距离）由各浇口 source 体素扩散，每 solid 体素归最近浇口 → 域体积
  const dom = new Int32Array(nAll).fill(-1)
  {
    let frontier: number[] = []
    for (let s = 0; s < sources.length; s++) { const q = sources[s]; if (dom[q] < 0) { dom[q] = srcLabel[s]; frontier.push(q) } }
    while (frontier.length) {
      const next: number[] = []
      for (const q of frontier) { const lab = dom[q]; for (const st of stepOf) { if (!inStep(q, st)) continue; const r = q + st; if (dom[r] < 0 && solid[r]) { dom[r] = lab; next.push(r) } } }
      frontier = next
    }
  }
  const domainVox = new Array<number>(nGate).fill(0)
  for (let q = 0; q < nAll; q++) if (dom[q] >= 0) domainVox[dom[q]]++

  // 流量权重：auto 流道平衡 = 责任域体积（域大→分多啲流量→同步填满）；否则手动 flowWeight（缺省 1）
  const balanced = inp.runnerBalance === true
  const weight = new Array<number>(nGate)
  for (let gI = 0; gI < nGate; gI++) weight[gI] = balanced ? Math.max(1, domainVox[gI]) : Math.max(1e-3, (inp.gateSpecs && inp.gateSpecs[gI]?.flowWeight) ?? 1)
  const wSum = weight.reduce((a, b) => a + b, 0) || 1
  const flowFrac = weight.map((w) => w / wSum)
  const srcCount = new Array<number>(nGate).fill(0)
  for (const lab of srcLabel) srcCount[lab]++
  const srcInj = srcLabel.map((lab) => VDOT * flowFrac[lab] / Math.max(1, srcCount[lab]))   // per-source 注射流率 mm³/s

  // ---- 4. 充填（求解器：真 2.5D Hele-Shaw 压力解 / 趋势：多源 Dijkstra）
  prog(55, '充填')
  const solverUsed = inp.solver === true
  let tau: Float64Array, tauMax: number
  let weldFull: Uint8Array, airtrapFull: Uint8Array
  let pressFull: Float64Array | null = null   // 求解器模式：真压力场 Pa（全网格）
  let pPeakPa = 0, clampForceN = 0, clampForcePeakN = 0
  const gateStats: GateStat[] = []
  let fillImbalance = 0
  // GM-W8 C5-S2 Stage-2 温度耦合输出（thermal 关 → 全 undefined，返回逐位一致）
  let tempCompact: Float32Array | undefined
  let tMinC: number | undefined, tMaxC: number | undefined
  let frozenFracC: number | undefined, shortShotC: boolean | undefined, thermalUsedC: boolean | undefined
  // GM-P3 Stage-3 保压 / PVT 收缩输出（enablePacking 关 → undefined，逐位一致）
  let packingC: MoldResult['packing'] | undefined
  const GATE_DP_CF = 75   // 浇口压降校准常数 Pa·mm³/(mm³/s)：ΔP=K·Qg/dia³·Cf（pin K4/dia1/Qg5e4 ≈ 15 MPa）
  if (solverUsed) {
    const cross: CrossCoef = MOLD_CROSS[inp.material] || { eta0: 1500 * mat.visc, n: 0.3, tauStar: 1e5 }
    const sol = solveMoldFill(grid, hHalf, sources, cross, { injRate: VDOT, srcInj, srcLabel, thermal: inp.thermal, tMelt: inp.tMelt, tMold: inp.tMold, viscousHeating: inp.viscousHeating, enablePacking: inp.enablePacking, packPressure: inp.packPressure, packTime: inp.packTime, tait: MOLD_TAIT[inp.material], onProgress: (fr) => prog(55 + 25 * fr, '压力求解') })
    tau = sol.fillTime          // 真充填时间 s（当 tau 用，单调代理）
    let mx = 0
    for (let p = 0; p < tau.length; p++) if (Number.isFinite(tau[p]) && tau[p] > mx) mx = tau[p]
    tauMax = mx
    weldFull = sol.weld
    airtrapFull = sol.airtrap
    pressFull = sol.pressure
    pPeakPa = sol.pPeak
    clampForceN = sol.clampForce
    clampForcePeakN = sol.clampForcePeak
    // GM-W8 C5-S2：Stage-2 温度场 → compact（k→j→i，未填 NaN）+ 短射/冻结指标 + 诚实注记入 warnings
    if (sol.thermalUsed) {
      thermalUsedC = true
      tMinC = sol.tMin; tMaxC = sol.tMax
      frozenFracC = sol.frozenFraction; shortShotC = sol.shortShotRisk
      const tf = sol.tempField
      if (tf) { const tc = new Float32Array(nVox); for (let e = 0; e < nVox; e++) tc[e] = tf[gridOf[e]]; tempCompact = tc }
      if (sol.notes) for (const nnote of sol.notes) warnings.push(nnote)
    }
    // GM-P3：Stage-3 保压/PVT 收缩场 → compact（k→j→i，未填 NaN）+ 诚实注记入 warnings
    if (sol.packing) {
      const pk = sol.packing
      const sp = new Float32Array(nVox), sf = new Float32Array(nVox), wf = new Float32Array(nVox)
      for (let e = 0; e < nVox; e++) { const g = gridOf[e]; sp[e] = pk.sealedPressure[g]; sf[e] = pk.shrinkageField[g]; wf[e] = pk.warpField[g] }
      packingC = {
        sealedPressure: sp, shrinkageField: sf, shrinkMax: pk.shrinkMax, shrinkAvg: pk.shrinkAvg, shrinkUniformity: pk.shrinkUniformity, packTraceNote: pk.packTraceNote,
        warpField: wf, warpMaxDir: pk.warpMaxDir, warpIndex: pk.warpIndex, warpNote: pk.warpNote,
      }
      warnings.push(pk.packTraceNote)
      warnings.push(pk.warpNote)   // GM-S4 Stage-4 翘曲诚实注记
    }
    // 逐浇口统计：责任域充填时间（由 sol.label）+ 注射压力（型腔 + 浇口 ΔP）
    const labelEnd = new Array<number>(nGate).fill(0)
    for (let q = 0; q < sol.label.length; q++) { const lab = sol.label[q]; if (lab >= 0 && lab < nGate && Number.isFinite(sol.fillTime[q]) && sol.fillTime[q] > labelEnd[lab]) labelEnd[lab] = sol.fillTime[q] }
    let fMin = Infinity, fMax = 0, peakInj = 0
    for (let gI = 0; gI < nGate; gI++) {
      const Qg = VDOT * flowFrac[gI]
      const dia = GATE_TYPES[gateType[gI]].dia || 2
      const gateDpPa = GATE_TYPES[gateType[gI]].restrictK * Qg / (dia * dia * dia) * GATE_DP_CF
      const pCav = pressFull ? Math.max(0, pressFull[gateGridVox[gI]]) : 0
      const pInjPa = pCav + gateDpPa
      if (pInjPa > peakInj) peakInj = pInjPa
      gateStats.push({ type: gateType[gI], flowFrac: flowFrac[gI], pInjMPa: pInjPa / 1e6, gateDpMPa: gateDpPa / 1e6, fillEnd: labelEnd[gI], domainVox: domainVox[gI] })
      if (labelEnd[gI] > 0) { if (labelEnd[gI] < fMin) fMin = labelEnd[gI]; if (labelEnd[gI] > fMax) fMax = labelEnd[gI] }
    }
    pPeakPa = Math.max(pPeakPa, peakInj)   // 头条峰值注射压力计入浇口压降（点/潜伏浇口会显著升）
    fillImbalance = (nGate > 1 && fMax > 0 && Number.isFinite(fMin)) ? (fMax - fMin) / fMax : 0
    if (sol.nReached < nVox) warnings.push(`求解器：${nVox - sol.nReached} 个体素前沿到唔到（困气孤岛/窄缝）`)
    if (nVox > 8000) warnings.push(`求解器体素 ${nVox} 较多，计算较慢（每步重解压力）—— 薄壁件建议；厚实件可降分辨率`)
    if (nGate > 1) warnings.push(balanced ? `已启用自动流道平衡：按责任域体积分配流量，浇口充填不平衡度 ${(fillImbalance * 100).toFixed(0)}%（越细越同步）` : `多浇口未平衡（各 ${(100 / nGate).toFixed(0)}% 均分或手动权重）：充填不平衡度 ${(fillImbalance * 100).toFixed(0)}% — 可开「流道平衡」自动分配`)
    warnings.push('求解器：工程级 2.5D Hele-Shaw（Cross 黏度 + 移动前沿 FVM）；材料系数为文献家族典型值，非牌号实测 — 压力/锁模力/浇口压降系同阶估算')
    // #88 锁模力诚实注记：已改用峰压投影积分（修正旧法系统性低估），旧值保留于 clampForceAvgKN
    if (clampForcePeakN > 0) warnings.push(`锁模力估算 ${(clampForcePeakN / 1e3).toFixed(0)} kN：用峰值压力×投影面积积分（Σ每列历时峰压·h²），修正旧「充填末瞬时全场均压×单层面积」系统性低估（旧值 ${(clampForceN / 1e3).toFixed(0)} kN）—— 趋势级同阶、方向偏保守。`)
    // #42 精神：诚实标出锁模力超出标准最大机台量程（3200t），避免下游「建议机台」静默封顶 3200t 误导
    {
      const fit = clampMachineFit(clampForcePeakN / 1e3)
      if (fit.overRange) {
        warnings.push(`⚠ 估算锁模力 ${(clampForcePeakN / 1e3).toFixed(0)} kN（需 ≈ ${fit.requiredTonne.toFixed(0)} 公吨力 + 15% 裕度）超出标准最大机台 3200 吨【量程】—— 需大型/特种注塑机，或分模/减投影面积/降注射压。下游「建议机台」达上限即封顶，非真够用。`)
      }
    }
  } else {
    const dj = dijkstraFill(grid, hHalf, sources, mat.visc)
    tau = dj.tau; tauMax = dj.tauMax
    weldFull = markWeld(grid, hHalf, dj.tau, dj.label, dj.parent, mat.visc)
    airtrapFull = markAirTraps(grid, dj.tau)
    for (let gI = 0; gI < nGate; gI++) gateStats.push({ type: gateType[gI], flowFrac: flowFrac[gI], pInjMPa: 0, gateDpMPa: 0, fillEnd: 0, domainVox: domainVox[gI] })
  }
  prog(80, '充填')

  // ---- 5. 变形趋势（全网格 → 后面压缩）
  const warpFull = warpGradient(grid, hHalf, mat.shrink)
  prog(90, '后处理')

  // ---- 6. 压缩输出场 + 统计
  // 注射时间：求解器模式 = 真求解出嘅总充填时间（=tauMax）；趋势模式 = 恒定体积流 V_part/V̇
  const volume = nVox * h * h * h
  const tFill = solverUsed && tauMax > 0 ? tauMax : volume / VDOT
  const pNorm = pPeakPa > 0 ? pPeakPa : 1
  const fill = new Float32Array(nVox)
  const pressure = new Float32Array(nVox)
  const cooling = new Float32Array(nVox)
  const warp = new Float32Array(nVox)
  const weld = new Uint8Array(nVox)
  const airtrap = new Uint8Array(nVox)
  const unreached = new Uint8Array(nVox)   // 前沿到唔到嘅体素（孤岛/窄缝）—— 着色用中灰，唔同「填得迟嘅红」
  const reachedTau: number[] = []
  const hhSolid: number[] = []
  let tCool = 0
  let nUnreached = 0
  let warpMax = 0
  for (let e = 0; e < nVox; e++) {
    const p = gridOf[e]
    const hh = hHalf[p]
    hhSolid.push(hh)
    const ct = coolingTime(2 * hh, mat)     // s = 全壁厚 = 2·h_i
    cooling[e] = ct
    if (ct > tCool) tCool = ct              // tCool = 最厚位公式值
    const t = tau[p]
    if (Number.isFinite(t)) {
      reachedTau.push(t)
      // 求解器：t 已系真充填秒数；趋势：归一化×tFill
      fill[e] = solverUsed ? t : (tauMax > 0 ? (t / tauMax) * tFill : 0)
      // 求解器：真压力场 Pa 归一化 0..1（着色用，真值见 pPeakMPa）；趋势：阻力积分归一化（相对值）
      pressure[e] = solverUsed ? (pressFull ? Math.min(1, pressFull[p] / pNorm) : 0) : (tauMax > 0 ? t / tauMax : 0)
    } else {
      nUnreached++
      unreached[e] = 1                     // 永远到唔到 → 云图灰色标出（区分「孤岛/断连」同「填得迟」）
      fill[e] = tFill
      pressure[e] = solverUsed ? 0 : (tauMax > 0 ? 1 : 0)
    }
    weld[e] = weldFull[p]
    airtrap[e] = airtrapFull[p]
    if (warpFull[p] > warpMax) warpMax = warpFull[p]
  }
  if (warpMax > 0) for (let e = 0; e < nVox; e++) warp[e] = warpFull[gridOf[e]] / warpMax
  if (nUnreached > 0) warnings.push(`${nUnreached} 个体素未连通浇口（孤岛/窄缝）：fill/pressure 以最大值填充`)

  const sinkMark = sinkMarkField(hhSolid, nVox)

  // 充填难度：最大/中位流阻比 > 10 → 薄壁远端供料困难（pMaxRel 归一化后恒 1，
  // 真正有信息嘅系比值，所以入 warnings）
  const tauMed = median(reachedTau)
  if (tauMed > 0 && tauMax / tauMed > 10) {
    warnings.push(`充填难度（最大/中位流阻比）${(tauMax / tauMed).toFixed(1)} > 10：薄壁远端供料困难趋势`)
  }
  // 薄壁量化提示：半厚中位数 < 1.5 体素 → 厚度场量化误差大
  const hMed = median(hhSolid)
  if (hMed < 1.5 * h) {
    warnings.push(`壁厚中位数 ${(2 * hMed).toFixed(2)} mm 接近体素尺寸（半厚 < 1.5×h=${(1.5 * h).toFixed(2)} mm）：厚度量化误差大，建议提高 resolution`)
  }

  // ★ 注塑适用性判定（诚实）：注塑模流假设【薄壁件】。冷却用经典 1D 板式公式 t=s²/(π²α)·ln(…)，
  //   对实心/厚段（壁厚远超薄壁范围）会算出超长冷却/周期 —— 公式本身系教科书标准，但厚件实际
  //   会缩水/内部空洞/不可成型，呢个数应理解为「上限 + 零件唔适合直接注塑」，唔系工具坏咗。
  //   THIN_WALL_TYP=4mm 典型上界、THIN_WALL_MAX=6mm 实务上限（再厚=缩痕/长周期主导）。
  let wallMax = 0
  for (let e = 0; e < hhSolid.length; e++) if (hhSolid[e] > wallMax) wallMax = hhSolid[e]
  wallMax *= 2                                 // 半厚 → 全壁厚
  const wallMedian = 2 * hMed
  const THIN_WALL_TYP = 4, THIN_WALL_MAX = 6
  let moldable: 'ok' | 'thick' | 'solid' = 'ok'
  if (wallMedian > THIN_WALL_MAX) {
    moldable = 'solid'
    warnings.unshift(`⚠ 零件偏厚/实心（中位壁厚 ${wallMedian.toFixed(1)} mm，最厚 ${wallMax.toFixed(1)} mm）：注塑模流假设薄壁件（约 1–${THIN_WALL_TYP} mm，上限 ~${THIN_WALL_MAX} mm）。实心/厚件实际会缩水、内部空洞、冷却超长 —— 唔适合直接注塑。建议先用「抽壳」整空到 2–4 mm 壁厚再分析。下列冷却/周期为厚段【上限】估算（1D 板式公式）。`)
  } else if (wallMax > THIN_WALL_MAX) {
    moldable = 'thick'
    warnings.unshift(`⚠ 局部厚段（最厚 ${wallMax.toFixed(1)} mm > 薄壁建议 ~${THIN_WALL_MAX} mm）：厚位（凸台/筋根/芯部）冷却慢 + 易缩痕，周期由最厚位主导。可挖空厚位或加圆角过渡减薄。冷却为该处 1D 板式【上限】估算。`)
  }

  const pMaxRel = tauMax > 0 ? 1 : 0          // 归一化后恒 1（退化单体素 → 0）
  const cycle = tFill + tCool + MOLD_OPEN_S   // 周期 = 注射 + 冷却 + 开合模假设

  // S190：流向场 ∇fill —— 熔体由浇口（fill≈0）往外（fill 大）流嘅方向。供 Viewport 画流向线/箭头。
  const fillDir = flowDirField(centers, fill, h, nVox)
  prog(100, '完成')

  return {
    h, nVox, centers, fill, pressure, cooling, warp, weld, airtrap, unreached, sinkMark, fillDir, gateIdx,
    // #88：clampForceKN = 修正值（峰压投影积分，求解器模式）；clampForceAvgKN = 旧法（保留对比）
    tFill, pMaxRel, tCool, cycle, solverUsed, pPeakMPa: pPeakPa / 1e6,
    clampForceKN: clampForcePeakN / 1e3, clampForceAvgKN: clampForceN / 1e3,
    resActual: res,   // #87：实际用嘅分辨率（薄壁自动加密后真值）
    wallMedian, wallMax, moldable, gateStats, balanced, fillImbalance,
    temp: tempCompact, tMin: tMinC, tMax: tMaxC, frozenFraction: frozenFracC, shortShotRisk: shortShotC, thermalUsed: thermalUsedC,
    packing: packingC,
    solidRatio, warnings,
  }
}

// ------------------------------------------------------------------ 测试钩子

// S190：流向场 —— 充填时间 ∇fill 单位向量（中央差分；用 centers CAD 坐标按格距 h 建空间哈希）。
// 纯函数，可 Node 测。返回 nVox×3 单位流向（退化/边界 → 用同侧值，零梯度 → 零向量）。
export function flowDirField(centers: ArrayLike<number>, fill: ArrayLike<number>, h: number, nVox: number): Float32Array {
  const out = new Float32Array(nVox * 3)
  if (!(h > 0) || nVox <= 0) return out
  const gk = (x: number, y: number, z: number) => `${Math.round(x / h)},${Math.round(y / h)},${Math.round(z / h)}`
  const idxAt = new Map<string, number>()
  for (let e = 0; e < nVox; e++) idxAt.set(gk(centers[e * 3] as number, centers[e * 3 + 1] as number, centers[e * 3 + 2] as number), e)
  for (let e = 0; e < nVox; e++) {
    const cx = centers[e * 3] as number, cy = centers[e * 3 + 1] as number, cz = centers[e * 3 + 2] as number
    const g = [0, 0, 0]
    for (let a = 0; a < 3; a++) {
      const d: [number, number, number] = [0, 0, 0]; d[a] = h
      const ep = idxAt.get(gk(cx + d[0], cy + d[1], cz + d[2]))
      const en = idxAt.get(gk(cx - d[0], cy - d[1], cz - d[2]))
      const fp = ep != null ? (fill[ep] as number) : (fill[e] as number)
      const fn = en != null ? (fill[en] as number) : (fill[e] as number)
      g[a] = (fp - fn) / (2 * h)
    }
    const L = Math.hypot(g[0], g[1], g[2])
    if (L > 1e-12) { out[e * 3] = g[0] / L; out[e * 3 + 1] = g[1] / L; out[e * 3 + 2] = g[2] / L }
  }
  return out
}

export const _internals = {
  distanceTransform,
  dijkstraFill,
  coolingTime,
  flowDirField,
  markWeld,
  markAirTraps,
  sinkMarkField,
  nearestSolidVoxel,
  clampMachineFit,
}
