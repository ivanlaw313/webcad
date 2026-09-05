// =====================================================================================
// moldsolve.ts — 真 2.5D Hele-Shaw 注塑充填【求解器】（非趋势 proxy）
//
// 全部自写、零运行时依赖、纯 TypeScript（只 import voxelfea 嘅体素化）。
//
// 同 moldflow.ts（趋势级 Dijkstra 最短阻力路径）嘅【本质区别】：
//   呢度真【解】耦合压力场 —— 控制体积有限体积法（FVM）解 Hele-Shaw 压力方程
//       ∇·(S ∇p) = 0,  S = H³/(12·η)  （H = 全壁厚）
//   配【移动流动前沿】控制体积推进（Flow Analysis Network / 充填因子），所有前沿
//   透过质量守恒【互相耦合】→ 真 race-tracking、真焊接线位置、真困气、真压力梯度
//   （浇口高 → 前沿 0），唔再系独立最短路径。黏度用 Cross 剪切变稀模型（非常数）。
//
// ★ 诚实定位（同用户摊牌过）：呢个系【工程级 2.5D 求解器】，唔系「商用验证级」。
//   冇实测材料库（Cross-WLF 系数 = 文献家族典型值，非牌号实测）、Stage-1 等温
//   （Stage-2 加能量方程）、未有保压 PVT（Stage-3）/ 纤维 / 翘曲 FEM（Stage-4）。
//   出嘅压力系【估算 MPa（同阶）】，用解析解（1D 条 / 中心浇口圆盘）验证到几个 %。
//
// 单位：长度 mm，时间 s，压力 Pa，黏度 Pa·s，流量 mm³/s。
// =====================================================================================

import { voxelize } from './voxelfea'

type Grid = ReturnType<typeof voxelize>
type GridLite = Pick<Grid, 'nx' | 'ny' | 'nz' | 'h' | 'solid'>

// ------------------------------------------------------------------ Cross 黏度模型

/** Cross 剪切变稀：η(γ̇) = η₀ / (1 + (η₀·γ̇/τ*)^(1−n))。Stage-1 等温（η₀ 取熔体温度值）。
 *  GM-W8 C5-S2：Stage-2 温度耦合 —— 可选 WLF 位移 + 热物性令 η₀ 随温度变（见 crossWLFVisc）。 */
export interface CrossCoef {
  eta0: number    // 零剪切黏度 Pa·s（= η₀(tMelt) 锚点：等温极限 η₀(tMelt)=eta0）
  n: number       // 幂律指数（剪切变稀程度，越细越稀化）
  tauStar: number // 过渡剪应力 Pa
  // ── GM-W8 C5-S2 Stage-2 Cross-WLF 温度位移系数（可选；缺省 → 用求解器缺省值。全部文献家族典型值，非牌号实测）──
  A1?: number      // WLF 系数（无量纲，文献典型 ~20–30）
  A2?: number      // WLF 系数 K（文献典型 51.6 = WLF 通用值）
  Tstar?: number   // WLF 参考温度 °C（≈D2≈Tg）
  tMelt?: number   // 典型熔体入口温度 °C（eta0 锚定于此）
  tMold?: number   // 典型模壁温度 °C
  tNoFlow?: number // 无流动温度 °C（前沿熔温 < 此 → 冻结/短射判据）
  rho?: number     // 熔体密度 kg/m³
  cp?: number      // 比热容 J/(kg·K)
  kt?: number      // 热导率 W/(m·K)
}

// 文献家族【典型】值（非牌号实测 —— 诚实标明）。eta0 系处理窗口熔体温度（tMelt）嘅同阶估值 = η₀(tMelt) 锚点。
// GM-W8 C5-S2：A2=51.6 系 WLF 通用常数；Tstar≈D2≈Tg；rho/cp/kt 系熔体态热物性，令 α=kt/(ρcp) 同 moldflow MOLD_MATERIALS.alpha 同阶。
export const MOLD_CROSS: Record<string, CrossCoef> = {
  ABS:  { eta0: 2200, n: 0.28, tauStar: 1.5e5, A1: 28, A2: 51.6, Tstar: 100, tMelt: 230, tMold: 60, tNoFlow: 130, rho: 940,  cp: 2100, kt: 0.18  },
  PP:   { eta0: 900,  n: 0.34, tauStar: 3.0e4, A1: 24, A2: 51.6, Tstar: -10, tMelt: 230, tMold: 40, tNoFlow: 135, rho: 740,  cp: 2800, kt: 0.155 },
  PC:   { eta0: 1800, n: 0.40, tauStar: 1.0e5, A1: 25, A2: 51.6, Tstar: 144, tMelt: 300, tMold: 90, tNoFlow: 160, rho: 1050, cp: 2000, kt: 0.21  },
  PA6:  { eta0: 400,  n: 0.40, tauStar: 5.0e4, A1: 27, A2: 51.6, Tstar: 50,  tMelt: 260, tMold: 80, tNoFlow: 200, rho: 980,  cp: 2500, kt: 0.25  },
  POM:  { eta0: 700,  n: 0.38, tauStar: 6.0e4, A1: 26, A2: 51.6, Tstar: -30, tMelt: 205, tMold: 90, tNoFlow: 155, rho: 1200, cp: 2500, kt: 0.24  },
  PMMA: { eta0: 5000, n: 0.25, tauStar: 1.2e5, A1: 30, A2: 51.6, Tstar: 105, tMelt: 240, tMold: 60, tNoFlow: 130, rho: 1100, cp: 2000, kt: 0.20  },
  TPU:  { eta0: 1200, n: 0.42, tauStar: 5.0e4, A1: 25, A2: 51.6, Tstar: -30, tMelt: 210, tMold: 40, tNoFlow: 110, rho: 1100, cp: 1900, kt: 0.20  },
}

/** Cross 黏度（γ̇ = 剪切率 1/s）。γ̇→0 = η₀；γ̇ 大 = 稀化。Stage-1 等温（η₀ 恒 = eta0）。 */
export function crossVisc(c: CrossCoef, shearRate: number): number {
  const g = shearRate > 1e-12 ? shearRate : 1e-12
  const r = (c.eta0 * g) / c.tauStar
  return c.eta0 / (1 + Math.pow(r, 1 - c.n))
}

/**
 * GM-W8 C5-S2：Cross-WLF 温度耦合黏度 η(γ̇, T)。
 *   η(γ̇,T) = η₀(T) / (1 + (η₀(T)·γ̇/τ*)^(1−n))
 *   η₀(T)   = eta0 · exp( A1·[ f(meltRef) − f(T) ] ),  f(t) = (t−T*)/(A2 + (t−T*))
 * 呢个系标准 Cross-WLF 嘅【锚定於熔温】形式：D1 用 eta0=η₀(meltRef) 取代 → η₀(meltRef)=eta0（等温极限逐位退回 Stage-1）。
 * f(t) 随温度单调增（A2>0），T<meltRef → 括号 >0 → exp>1 → η₀ 升（冷 → 稠）；T=meltRef → η₀=eta0；物理正确。
 * 温度钳：T < T*−A2+5 时（远低於 Tg）分母近零 → 钳住令 f 有限单调；shift 钳 ±30（防 exp 溢出）。
 */
export function crossWLFVisc(c: CrossCoef, shearRate: number, T: number, meltRef: number, A1: number, A2: number, Tstar: number): number {
  let t = T
  const tFloor = Tstar - A2 + 5
  if (t < tFloor) t = tFloor
  const fRef = (meltRef - Tstar) / (A2 + (meltRef - Tstar))
  const fT = (t - Tstar) / (A2 + (t - Tstar))
  let shift = A1 * (fRef - fT)
  if (shift > 30) shift = 30
  else if (shift < -30) shift = -30
  const eta0T = c.eta0 * Math.exp(shift)
  const g = shearRate > 1e-12 ? shearRate : 1e-12
  const r = (eta0T * g) / c.tauStar
  return eta0T / (1 + Math.pow(r, 1 - c.n))
}

// ═══════════════════════════════════════════════════════════════ GM-P3 Stage-3 保压 / PVT ═══════════════════════════════════════════════════════════════
//
// ★ 诚实定位（同 Stage-1/2 一脉）：呢个系【趋势级】保压 + 收缩预测，唔系商用 Moldflow/Moldex3D。
//   保压压力衰减用 quasi-static 代理（浇口沿流程线性压降 + 冻结即锁压），唔系真解耦合 PVT 连续方程；
//   收缩系单元 seal 态 vs 室温态嘅 Tait 比容差（体积收缩），忽略取向/结晶动力学/翘曲/模具刚度。
//   出嘅系「边度缩得多、保压升边度改善」嘅同阶趋势，唔可当尺寸公差用。
//
// ── 2-domain modified Tait PVT 方程（标准形式，见 polymer PVT 文献 / Moldflow 材料库家族）──
//   ṽ(T,P) = ṽ0(T)·[1 − C·ln(1 + P/B(T))] + ṽt(T,P),  C = 0.0894（万能常数）
//   熔态 T > Tt(P)：ṽ0 = b1m + b2m·(T−b5)，  B = b3m·exp(−b4m·(T−b5))，  ṽt = 0
//   固态 T < Tt(P)：ṽ0 = b1s + b2s·(T−b5)，  B = b3s·exp(−b4s·(T−b5))，  ṽt = b7·exp(b8·(T−b5) − b9·P)
//   转变温度 Tt(P) = b5 + b6·P（受压升高）。单位：ṽ m³/kg，T K，P Pa。
//   系数全部【文献家族典型值（非牌号实测）】—— 诚实标明，同 Stage-2 Cross-WLF 做法一致。
//   b7 ≡ b1m − b1s 令 P=0 常压转变点比容【连续】（标准做法：熔/固两支喺 Tt 无缝）；
//   非晶（ABS/PC/PMMA/TPU 之 PC/PMMA）b7≈0（Tg 转变无结晶跳跃），半晶（PP/PA6/POM）b7 显著（结晶体积跳）。

export interface TaitCoef {
  b1m: number; b2m: number; b3m: number; b4m: number   // 熔态：比容截距 m³/kg、温度系数 m³/(kg·K)、B 参 Pa、B 温度衰减 1/K
  b1s: number; b2s: number; b3s: number; b4s: number   // 固态：同上
  b5: number; b6: number                                // 常压转变温度 K、转变温度压力系数 K/Pa
  b7: number; b8: number; b9: number                    // 固态转变项：幅 m³/kg、温度 1/K、压力 1/Pa（= b1m−b1s 保连续）
}

// 文献家族【典型值】（非牌号实测 —— 诚实标明）。对应 Stage-2 同样 7 种材料 key。
// b5=常压转变温度（半晶≈熔点、非晶≈Tg）；b7=b1m−b1s（常压连续）；半晶 b7 大（结晶跳）、非晶 b7≈0。
// b9 ≈ b8·b6 令固态转变项 ṽt 喺 Tt 沿全压力段近连续（消去 exp(b8·dT−b9·P) 喺 dT=b6·P 时嘅漂移 → 半晶高压转变亦顺滑）。
export const MOLD_TAIT: Record<string, TaitCoef> = {
  // 非晶（Tg 转变，b7≈0）
  ABS:  { b1m: 1.010e-3, b2m: 6.0e-7, b3m: 1.75e8, b4m: 3.5e-3, b1s: 0.995e-3, b2s: 2.6e-7, b3s: 2.40e8, b4s: 3.3e-3, b5: 378, b6: 2.5e-7, b7: 1.5e-5, b8: 0.10, b9: 2.5e-8 },
  PC:   { b1m: 0.842e-3, b2m: 5.5e-7, b3m: 2.20e8, b4m: 3.5e-3, b1s: 0.842e-3, b2s: 3.0e-7, b3s: 3.00e8, b4s: 3.0e-3, b5: 418, b6: 3.5e-7, b7: 0.0,    b8: 0.0,  b9: 0.0 },
  PMMA: { b1m: 0.900e-3, b2m: 5.0e-7, b3m: 2.20e8, b4m: 3.5e-3, b1s: 0.900e-3, b2s: 2.8e-7, b3s: 2.90e8, b4s: 3.2e-3, b5: 388, b6: 3.0e-7, b7: 0.0,    b8: 0.0,  b9: 0.0 },
  // 半晶（熔点转变，b7 = b1m−b1s 显著 → 结晶收缩大）
  PP:   { b1m: 1.260e-3, b2m: 9.0e-7, b3m: 8.00e7, b4m: 4.0e-3, b1s: 1.160e-3, b2s: 4.5e-7, b3s: 1.40e8, b4s: 2.8e-3, b5: 438, b6: 3.0e-7, b7: 1.00e-4, b8: 0.09, b9: 2.7e-8 },
  PA6:  { b1m: 1.020e-3, b2m: 8.0e-7, b3m: 1.00e8, b4m: 4.5e-3, b1s: 0.910e-3, b2s: 4.0e-7, b3s: 1.80e8, b4s: 3.0e-3, b5: 493, b6: 2.5e-7, b7: 1.10e-4, b8: 0.10, b9: 2.5e-8 },
  POM:  { b1m: 0.870e-3, b2m: 8.5e-7, b3m: 9.00e7, b4m: 4.5e-3, b1s: 0.730e-3, b2s: 3.5e-7, b3s: 1.60e8, b4s: 2.8e-3, b5: 448, b6: 2.5e-7, b7: 1.40e-4, b8: 0.11, b9: 2.75e-8 },
  // 热塑弹性体（低转变、中等结晶）
  TPU:  { b1m: 0.910e-3, b2m: 6.5e-7, b3m: 1.60e8, b4m: 4.0e-3, b1s: 0.880e-3, b2s: 3.5e-7, b3s: 2.20e8, b4s: 3.2e-3, b5: 373, b6: 2.5e-7, b7: 3.00e-5, b8: 0.08, b9: 2.0e-8 },
}

const TAIT_C = 0.0894   // Tait 万能常数（无量纲）

/**
 * GM-P3：2-domain modified Tait 比容 ṽ(T,P)。T 单位 K，P 单位 Pa（≥0），返回 m³/kg。
 * 熔态（T>Tt）用 b*m 支、固态用 b*s 支 + 转变项 ṽt；Tt(P)=b5+b6·P。
 * 物理正确性：∂ṽ/∂P<0（C·ln 项随 P 增 → 比容降，压缩）；∂ṽ/∂T>0（b2>0 主导，中低压单调升）。
 */
export function taitVolume(c: TaitCoef, T: number, P: number): number {
  const p = P > 0 ? P : 0
  const Tt = c.b5 + c.b6 * p
  const dT = T - c.b5
  if (T > Tt) {
    const v0 = c.b1m + c.b2m * dT
    const B = c.b3m * Math.exp(-c.b4m * dT)
    return v0 * (1 - TAIT_C * Math.log(1 + p / B))
  }
  const v0 = c.b1s + c.b2s * dT
  const B = c.b3s * Math.exp(-c.b4s * dT)
  const vt = c.b7 * Math.exp(c.b8 * dT - c.b9 * p)
  return v0 * (1 - TAIT_C * Math.log(1 + p / B)) + vt
}

// ------------------------------------------------------------------ 求解器 I/O

export interface MoldSolveOpts {
  injRate: number          // 总注射体积流率 mm³/s（分摊到各浇口）
  srcInj?: ArrayLike<number>   // 逐 source 体素注射流率 mm³/s（流道平衡/手动权重）；缺省 = injRate/N 均分
  srcLabel?: ArrayLike<number> // 逐 source 体素所属【逻辑浇口】label（扇形浇口多格共享同一 label）；缺省 = 顺序
  reSolveEvery?: number     // 已弃用（移动边界 FVM 必须每步重解；保留唔破调用签名，已忽略）。原意：每填几个控制体积重解一次压力（默认 1 = 每步重解，最准）
  maxSteps?: number         // 安全上限（默认 4×nVox）
  cgTol?: number            // CG 相对残差容差（默认 1e-6）
  cgMaxIter?: number        // CG 每次最大迭代（默认 400）
  onProgress?: (frac: number) => void   // 充填进度 0..1
  // ── GM-W8 C5-S2 Stage-2 能量方程耦合（缺省 off → Stage-1 等温路径逐位一致）──
  thermal?: boolean         // true = 解温度场 + Cross-WLF η(γ̇,T)；缺省/false = 等温 crossVisc
  tMelt?: number            // 熔体入口温度 °C（缺省用材料 cross.tMelt；浇口/热流道恒温源）
  tMold?: number            // 模壁温度 °C（缺省用材料 cross.tMold）
  viscousHeating?: boolean  // 黏性耗散升温开关（缺省 true）
  // ── GM-P3 Stage-3 保压 / PVT（全部可选，缺省 off → 唔分配/唔运行 → 结果逐位一致於 Stage-2）──
  enablePacking?: boolean   // true = 充填后行保压 + Tait 收缩预测；缺省/false = 唔行（逐位一致）
  packPressure?: number     // 保压压力 Pa（浇口保持压力；缺省 0）
  packTime?: number         // 保压时间 s（缺省 0）
  tait?: TaitCoef           // 该材料 Tait 系数（由 moldflow.ts 按 material key 传入；缺则跳过收缩）
}

export interface MoldSolveOut {
  fillTime: Float64Array   // 全网格充填时间 s（未填/孤岛 = ∞）
  pressure: Float64Array   // 全网格压力 Pa（充填结束瞬时；浇口高 → 前沿 0）
  label: Int32Array        // 全网格充填来源浇口序号（未填 = −1）
  weld: Uint8Array         // 1 = 焊接线（两股【唔同来源/方向】前沿对冲充填处）
  airtrap: Uint8Array      // 1 = 困气（前沿终止死腔 = fillTime 全向局部极大）
  tFill: number            // 总充填时间 s
  pPeak: number            // 峰值压力 Pa（浇口）
  clampForce: number       // 锁模力估算 N（旧：充填末瞬时全场均压 × 单层投影面积；系统性低估 —— 保留作对比）
  clampForcePeak: number   // #88 修正：峰值压力×投影面积积分 Σ_列(历时峰压)·h²（N）—— 修正旧值低估，趋势级同阶
  nReached: number         // 已充填体素数
  iters: number            // 总 CG 迭代（性能诊断）
  // ── GM-W8 C5-S2 Stage-2 能量耦合结果（仅 thermal 开时有；关时 undefined → Stage-1 逐位一致）──
  tempField?: Float32Array // 全网格最终温度 °C（未填 = NaN）
  tMin?: number            // 已填 CV 最低温度 °C
  tMax?: number            // 已填 CV 最高温度 °C
  frozenFraction?: number  // 入口熔温 < 无流动温度 而充填嘅 CV 占比（潜在短射指标）
  shortShotRisk?: boolean  // frozenFraction 超阈值 → 短射风险
  notes?: string[]         // 诚实假设 / 风险注记
  thermalUsed?: boolean    // true = 行咗 Stage-2 能量耦合路径
  // ── GM-P3 Stage-3 保压 / PVT 结果（仅 enablePacking 开时有；关时 undefined → 逐位一致於 Stage-2）──
  packing?: {
    sealedPressure: Float32Array   // 全网格逐 CV 冻结（seal）瞬间锁定嘅局部压力 Pa（未填 = 0）
    shrinkageField: Float32Array   // 全网格逐 CV 体积收缩率 %（Tait：seal 态 vs 室温常压比容差；未填 = NaN）
    shrinkMax: number              // 最大体积收缩率 %（缩水最严重位 —— 潜在缩痕/尺寸偏差）
    shrinkAvg: number              // 平均体积收缩率 %（已填 CV）
    shrinkUniformity: number       // 收缩均匀度 0..1（1=处处一致；低=厚薄/远近浇口收缩差大 → 翘曲风险）
    packTraceNote: string          // 诚实注记：保压参数 + 趋势级假设摊牌
    // ── GM-S4 Stage-4 翘曲（趋势级；仅保压开时有；差异收缩弯矩 proxy，非 FEM 位移）──
    warpField: Float32Array        // 全网格逐 CV 翘曲风险 0..1 归一（= |面内 ∇体积收缩| 归一；未填/浇口 = NaN/0）
    warpMaxDir: [number, number, number]   // 主导微分收缩轴单位向量（结构张量主特征向量；CAD 坐标）
    warpIndex: number              // 翘曲趋势指数 0..100（微分收缩弯矩 proxy × 收缩幅度 → 饱和映射）
    warpNote: string               // 诚实注记：趋势级差异收缩弯矩 proxy，非 FEM 翘曲位移
  }
}

// ------------------------------------------------------------------ 求解器

/**
 * 真 2.5D Hele-Shaw 充填求解。grid = 体素网格，hHalf = 半壁厚场（mm），sources = 浇口体素 grid index。
 *
 * 算法（控制体积 FVM + 移动前沿）：
 *  1. 局部迁移率 λ_i = k_i/η_i，k_i = (2h_i)²/12 = h_i²/3（Hele-Shaw 等效渗透率），η 由 Cross 按【上一步】剪切率算（lag Picard）。
 *  2. 面传导率 T_ij = 调和平均(λ_i,λ_j)·(A/d) = 调和平均·h（A=h²,d=h）。
 *  3. 已充填域解压力 Poisson：Σ_j T_ij(p_i−p_j) = b_i，前沿(空且邻充填)= Dirichlet p=0，浇口 b=注射流率分摊，其余 b=0。共轭梯度（Jacobi 预条件）。
 *  4. 前沿空体素充填速率 r_i = Σ_{已填 j} T_ij·p_j；Δt = 填满最快体素所需；全前沿按 Δt 推进充填因子 f；f≥1 转已填、记 fillTime。
 *  5. 充填体素继承贡献流量最大嘅已填邻居 label；空体素同时收到【唔同 label】前沿流量 → 焊接线。
 *  6. 重复到全填 / 无进展（困气）。
 */
export function solveMoldFill(
  grid: GridLite,
  hHalf: Float64Array,
  sources: ArrayLike<number>,
  cross: CrossCoef,
  opts: MoldSolveOpts,
): MoldSolveOut {
  const { nx, ny, nz, h, solid } = grid
  const n = nx * ny * nz
  const nxny = nx * ny
  const maxSteps = opts.maxSteps ?? 4 * n
  const cgTol = opts.cgTol ?? 1e-6
  const cgMaxIter = opts.cgMaxIter ?? 400
  const cellVol = h * h * h

  const fillTime = new Float64Array(n).fill(Infinity)
  const pressure = new Float64Array(n)
  const label = new Int32Array(n).fill(-1)
  const weld = new Uint8Array(n)
  const f = new Float64Array(n)          // 充填因子 0..1
  const filled = new Uint8Array(n)       // 1 = 已充满
  const eta = new Float64Array(n)        // 当前局部黏度（lag）
  const lam = new Float64Array(n)        // 当前局部迁移率 λ = k/η
  const vel = new Float64Array(n)        // 上一步速度幅（算剪切率）
  for (let p = 0; p < n; p++) eta[p] = cross.eta0

  // ── GM-W8 C5-S2 Stage-2 能量方程耦合参数（thermal 关时下面所有分支唔行 → Stage-1 逐位一致）──
  const thermalOn = opts.thermal === true
  const viscHeat = opts.viscousHeating !== false           // 黏性耗散升温，缺省开
  const meltRef = cross.tMelt ?? 230                       // eta0 = η₀(meltRef) 锚点温度 °C
  const wlfA1 = cross.A1 ?? 22
  const wlfA2 = cross.A2 ?? 51.6
  const wlfTstar = cross.Tstar ?? -20
  const tMeltIn = opts.tMelt ?? cross.tMelt ?? 230         // 熔体入口温度 °C（浇口/热流道恒温源）
  const tMold = opts.tMold ?? cross.tMold ?? 60            // 模壁温度 °C
  const tNoFlow = cross.tNoFlow ?? (tMold + 0.55 * (meltRef - tMold))  // 无流动温度 °C
  const rhoT = cross.rho ?? 940
  const cpT = cross.cp ?? 2000
  const ktT = cross.kt ?? 0.18
  const alphaMM2 = (ktT / (rhoT * cpT)) * 1e6              // 热扩散率 mm²/s（k/(ρcp) [m²/s]→mm²/s）
  const PI2 = Math.PI * Math.PI
  const THERM_MAXSUB = 25
  const tCapHi = tMeltIn + 150                             // 升温安全上限（防耗散数值失控）
  // 温度场 + 对流速度矢量 v=−λ∇p + 浇口恒温遮罩（只喺 thermal 开时分配）
  const T = thermalOn ? new Float64Array(n).fill(tMeltIn) : null
  const Tbuf = thermalOn ? new Float64Array(n) : null
  const velx = thermalOn ? new Float64Array(n) : null
  const vely = thermalOn ? new Float64Array(n) : null
  const velz = thermalOn ? new Float64Array(n) : null
  const gateMask = thermalOn ? new Uint8Array(n) : null
  let frozenCount = 0

  // 邻接偏移（6 面）
  const nb = [-1, 1, -nx, nx, -nxny, nxny]
  const inb = (p: number, d: number): boolean => {
    // 边界跨越守卫（x 方向唔可绕行）
    if (d === -1) return p % nx > 0
    if (d === 1) return p % nx < nx - 1
    if (d === -nx) return ((p / nx) | 0) % ny > 0
    if (d === nx) return ((p / nx) | 0) % ny < ny - 1
    if (d === -nxny) return (p / nxny | 0) > 0
    return (p / nxny | 0) < nz - 1
  }

  // 迁移率 λ_i = h_i²/3 / η_i（k=(2h)²/12=h²/3）
  const updateLambda = (): void => {
    for (let p = 0; p < n; p++) {
      if (!solid[p]) { lam[p] = 0; continue }
      const k = (hHalf[p] * hHalf[p]) / 3
      lam[p] = k / Math.max(eta[p], 1e-6)
    }
  }
  // 面传导率（调和平均 × h）
  const trans = (p: number, q: number): number => {
    const a = lam[p], b = lam[q]
    if (a <= 0 || b <= 0) return 0
    // Hele-Shaw depth integration uses H³/(12η).  `lam` already carries
    // H²/(12η), so the face conductance needs the mean full-wall thickness
    // as well as its in-plane face width h.  hHalf is H/2, hence Havg is the
    // sum of the two half-thickness values.  Without it, solver:true had an
    // H² pressure sensitivity instead of the physical H³ relation.
    const hAvg = hHalf[p] + hHalf[q]
    return ((2 * a * b) / (a + b)) * h * hAvg
  }

  // 浇口初始化：浇口体素即【已充满】源。label 用 srcLabel（扇形多格共享逻辑浇口）；注射流率用 srcInj（流道平衡/手动权重）。
  const gateVox: number[] = []
  const gateInjOf: number[] = []          // 对齐 gateVox：每个 source 体素嘅注射流率
  for (let s = 0; s < sources.length; s++) {
    const g = sources[s]
    if (!(g >= 0 && g < n) || !solid[g] || filled[g]) continue
    filled[g] = 1; f[g] = 1; fillTime[g] = 0
    label[g] = opts.srcLabel ? (opts.srcLabel[s] | 0) : gateVox.length
    gateVox.push(g)
    gateInjOf.push(opts.srcInj ? Math.max(0, opts.srcInj[s]) : NaN)
  }
  if (gateVox.length === 0) {
    return { fillTime, pressure, label, weld, airtrap: markAirTrapsLocal(grid, fillTime), tFill: 0, pPeak: 0, clampForce: 0, clampForcePeak: 0, nReached: 0, iters: 0 }
  }
  // GM-W8 C5-S2：浇口 CV = 热流道恒温源，温度钉住 tMeltIn（唔参与冷却 march）
  if (thermalOn) for (const g of gateVox) { gateMask![g] = 1; T![g] = tMeltIn }
  const injPer = opts.injRate / gateVox.length    // 均分回退（srcInj 缺省时）

  // 压力 CG（matrix-free，未知 = 已充填体素；前沿空体素 p=0 Dirichlet；墙跳过）
  const p = pressure
  const pPeakCell = new Float64Array(n)   // #88：逐 CV 历时峰值压力 Pa（用于修正锁模力投影积分）
  const Ap = new Float64Array(n)
  const rr = new Float64Array(n)
  const zz = new Float64Array(n)
  const dd = new Float64Array(n)
  const diag = new Float64Array(n)
  let totalIters = 0

  const applyA = (x: Float64Array, out: Float64Array, fl: Uint8Array): void => {
    for (let p0 = 0; p0 < n; p0++) {
      if (!fl[p0]) { out[p0] = 0; continue }
      let acc = 0
      for (let d = 0; d < 6; d++) {
        if (!inb(p0, nb[d])) continue
        const q = p0 + nb[d]
        if (!solid[q]) continue              // 墙 = 无流
        const t = trans(p0, q)
        if (t <= 0) continue
        // 邻居系已填(未知 x[q]) 或 前沿空(p=0)；两者都贡献 t 到对角，已填减 t·x[q]
        acc += t * x[p0]
        if (fl[q]) acc -= t * x[q]
      }
      out[p0] = acc
    }
  }

  const solvePressure = (b: Float64Array, fl: Uint8Array): void => {
    // Jacobi 预条件对角 = Σ T_ij（邻居系已填或前沿空）
    for (let p0 = 0; p0 < n; p0++) {
      if (!fl[p0]) { diag[p0] = 1; continue }
      let dg = 0
      for (let d = 0; d < 6; d++) {
        if (!inb(p0, nb[d])) continue
        const q = p0 + nb[d]
        if (!solid[q]) continue
        dg += trans(p0, q)
      }
      diag[p0] = dg > 1e-30 ? dg : 1
    }
    // r = b − A p（warm-start p）
    applyA(p, Ap, fl)
    let rzOld = 0
    for (let p0 = 0; p0 < n; p0++) {
      if (!fl[p0]) { rr[p0] = 0; zz[p0] = 0; dd[p0] = 0; continue }
      rr[p0] = b[p0] - Ap[p0]
      zz[p0] = rr[p0] / diag[p0]
      dd[p0] = zz[p0]
      rzOld += rr[p0] * zz[p0]
    }
    let bnorm = 0
    for (let p0 = 0; p0 < n; p0++) if (fl[p0]) bnorm += b[p0] * b[p0]
    const tol2 = cgTol * cgTol * Math.max(bnorm, 1e-30)
    let it = 0
    for (; it < cgMaxIter; it++) {
      let rnorm = 0
      for (let p0 = 0; p0 < n; p0++) if (fl[p0]) rnorm += rr[p0] * rr[p0]
      if (rnorm < tol2) break
      applyA(dd, Ap, fl)              // Ap = A d
      let dAd = 0
      for (let p0 = 0; p0 < n; p0++) if (fl[p0]) dAd += dd[p0] * Ap[p0]
      if (!(Math.abs(dAd) > 1e-300)) break
      const alpha = rzOld / dAd
      let rzNew = 0
      for (let p0 = 0; p0 < n; p0++) {
        if (!fl[p0]) continue
        p[p0] += alpha * dd[p0]
        rr[p0] -= alpha * Ap[p0]
        zz[p0] = rr[p0] / diag[p0]
        rzNew += rr[p0] * zz[p0]
      }
      const beta = rzNew / (rzOld || 1e-300)
      for (let p0 = 0; p0 < n; p0++) if (fl[p0]) dd[p0] = zz[p0] + beta * dd[p0]
      rzOld = rzNew
    }
    totalIters += it
  }

  // 源向量 b（浇口注射流率；其余 0）—— per-source（流道平衡/手动权重）或均分回退
  const bvec = new Float64Array(n)
  for (let i = 0; i < gateVox.length; i++) { const q = gateInjOf[i]; bvec[gateVox[i]] = Number.isFinite(q) ? q : injPer }

  // ---- 主充填循环
  let nSolid = 0
  for (let p0 = 0; p0 < n; p0++) if (solid[p0]) nSolid++
  // 批量步长目标：~140 次压力重解封顶（chunky 件几千体素唔再每粒重解 → 由 O(nVox) 卡死降到秒级）
  const TARGET_STEPS = 140
  const batchVol = (nSolid * cellVol) / TARGET_STEPS
  const prog = opts.onProgress
  let t = 0
  let nFilled = gateVox.length
  let step = 0
  for (; step < maxSteps; step++) {
    if (nFilled >= nSolid) break                       // 全部实体已充填
    if (prog && (step & 15) === 0) { try { prog(nFilled / Math.max(nSolid, 1)) } catch { /* 进度回调出错唔影响计算 */ } }

    // 每步重解压力（lag η → λ）—— 移动边界 FVM 必须每步重解：跳步会令新前沿用到旧域嘅
    // 陈旧压力（新填体素 p=0），前沿流率塌缩 → 充填提前停（实测 reSolveEvery>1 会喺几粒体素就死）。
    // warm-start CG 令每步只需几十迭代，纯 TS 体素数千级仍秒内。
    let maxU = 0   // GM-W8 C5-S2：本步最大流速（thermal march 定 CFL 子步数）
    {
      updateLambda()
      solvePressure(bvec, filled)
      // 由新压力更新速度幅 → 剪切率 → Cross 黏度（lag 落下一解）
      for (let p0 = 0; p0 < n; p0++) {
        if (!filled[p0]) continue
        if (p[p0] > pPeakCell[p0]) pPeakCell[p0] = p[p0]   // #88：记录历时峰压（充填末瞬时全场均压会被前沿 p≈0 拉低）
        let gx = 0, gy = 0, gz = 0, cnt = 0
        if (inb(p0, -1) && solid[p0 - 1]) { gx += p[p0] - p[p0 - 1]; cnt++ }
        if (inb(p0, 1) && solid[p0 + 1]) { gx += p[p0 + 1] - p[p0]; cnt++ }
        if (cnt === 2) gx *= 0.5
        let c2 = 0
        if (inb(p0, -nx) && solid[p0 - nx]) { gy += p[p0] - p[p0 - nx]; c2++ }
        if (inb(p0, nx) && solid[p0 + nx]) { gy += p[p0 + nx] - p[p0]; c2++ }
        if (c2 === 2) gy *= 0.5
        let c3 = 0
        if (inb(p0, -nxny) && solid[p0 - nxny]) { gz += p[p0] - p[p0 - nxny]; c3++ }
        if (inb(p0, nxny) && solid[p0 + nxny]) { gz += p[p0 + nxny] - p[p0]; c3++ }
        if (c3 === 2) gz *= 0.5
        const gradP = Math.sqrt(gx * gx + gy * gy + gz * gz) / h    // |∇p| Pa/mm
        const u = lam[p0] * gradP                                   // Darcy 平均速度 mm/s
        vel[p0] = u
        const shear = (3 * u) / Math.max(hHalf[p0], 1e-6)           // 壁面剪切率 ≈ 3·v̄/h
        if (thermalOn) {
          // GM-W8 C5-S2：存对流速度矢量 v=−λ∇p（mm/s），黏度改用 Cross-WLF η(γ̇,T)（T lag 上一步温度场）
          velx![p0] = (-lam[p0] * gx) / h
          vely![p0] = (-lam[p0] * gy) / h
          velz![p0] = (-lam[p0] * gz) / h
          if (u > maxU) maxU = u
          eta[p0] = crossWLFVisc(cross, shear, T![p0], meltRef, wlfA1, wlfA2, wlfTstar)
        } else {
          eta[p0] = crossVisc(cross, shear)
        }
      }
    }

    // 前沿（空且邻已填实体）充填速率 r_i = Σ_{已填 j} T_ij·p_j
    let dtMin = Infinity, totalRate = 0
    const frontRate = new Map<number, number>()
    const frontSrc = new Map<number, number>()   // 主贡献 label
    const frontTemp = thermalOn ? new Map<number, number>() : null   // GM-W8 C5-S2：新充 CV 继承嘅入口熔温（主贡献邻居温度）
    for (let p0 = 0; p0 < n; p0++) {
      if (!solid[p0] || filled[p0]) continue
      let r = 0, bestT = -1, bestLab = -1, bestQ = -1
      for (let d = 0; d < 6; d++) {
        if (!inb(p0, nb[d])) continue
        const q = p0 + nb[d]
        if (!solid[q] || !filled[q]) continue
        const t2 = trans(p0, q)
        const flux = t2 * p[q]          // p_front=0 → 净流入
        if (flux > 0) r += flux
        if (t2 > bestT) { bestT = t2; bestLab = label[q]; bestQ = q }
      }
      if (r > 1e-30) {
        frontRate.set(p0, r)
        frontSrc.set(p0, bestLab)
        if (thermalOn) frontTemp!.set(p0, bestQ >= 0 ? T![bestQ] : tMeltIn)
        totalRate += r
        const remain = (1 - f[p0]) * cellVol
        const dt = remain / r
        if (dt < dtMin) dtMin = dt
      }
    }
    if (!(dtMin < Infinity)) break    // 无前沿可进 = 剩余系困气孤岛

    // 批量步长：每步填 ~总体积/TARGET_STEPS（≥最快 CV 保证进度）。压力每步都重解（filled 集一致，无陈旧塌缩），
    // 但每步填一【批】CV 而非一粒 → 重解次数由 O(nVox)（chunky 件几千步会卡死）降到 ~TARGET_STEPS。
    // 超填 CV 钳 f=1（趋势级可接受嘅守恒小误差；压力场/充填次序/焊接/困气位置不受影响）。
    const dt = Math.max(dtMin, totalRate > 1e-30 ? batchVol / totalRate : dtMin)

    // ── GM-W8 C5-S2 能量方程推进（对流迎风 + 黏性耗散 显式；壁面导热汇 隐式）——喺推进前沿【之前】march 旧充填集 ──
    //   ρcp(∂T/∂t + u·∇T) = η·γ̇² − ρcp·β(T−T_mold)，β = α·π²/H²（Hele-Shaw gap 导热首模衰减，H=全壁厚 2·hHalf；
    //   参 Kennedy & Zheng, "Flow Analysis of Injection Molds" gap-wise 平均能量方程）。
    //   隐式汇：T=(T + dt·(conv+diss) + dt·β·T_mold)/(1 + dt·β)。对流受 CFL（|u|·dt/h≤1）→ 按 maxU 子步；汇隐式无条件稳定。
    //   浇口 CV 系热流道恒温源（gateMask）唔 march。新充 CV 喺下面推进时先赋入口温度，本步唔 march（避免重复冷却）。
    if (thermalOn) {
      const Tf = T!, Tb = Tbuf!, vX = velx!, vY = vely!, vZ = velz!, gM = gateMask!
      const M = Math.min(THERM_MAXSUB, Math.max(1, Math.ceil((dt * maxU) / (0.4 * h))))
      const dts = dt / M
      for (let s = 0; s < M; s++) {
        for (let p0 = 0; p0 < n; p0++) {
          if (!filled[p0] || gM[p0]) { Tb[p0] = Tf[p0]; continue }
          let conv = 0   // −u·∇T 迎风（上游 = 高压邻居 = 流速指向嘅反方向）
          const vx = vX[p0]
          if (vx > 0) { if (p0 % nx > 0 && solid[p0 - 1] && filled[p0 - 1]) conv -= vx * (Tf[p0] - Tf[p0 - 1]) / h }
          else if (vx < 0) { if (p0 % nx < nx - 1 && solid[p0 + 1] && filled[p0 + 1]) conv -= vx * (Tf[p0 + 1] - Tf[p0]) / h }
          const vy = vY[p0]
          if (vy > 0) { if (((p0 / nx) | 0) % ny > 0 && solid[p0 - nx] && filled[p0 - nx]) conv -= vy * (Tf[p0] - Tf[p0 - nx]) / h }
          else if (vy < 0) { if (((p0 / nx) | 0) % ny < ny - 1 && solid[p0 + nx] && filled[p0 + nx]) conv -= vy * (Tf[p0 + nx] - Tf[p0]) / h }
          const vz = vZ[p0]
          if (vz > 0) { if ((p0 / nxny | 0) > 0 && solid[p0 - nxny] && filled[p0 - nxny]) conv -= vz * (Tf[p0] - Tf[p0 - nxny]) / h }
          else if (vz < 0) { if ((p0 / nxny | 0) < nz - 1 && solid[p0 + nxny] && filled[p0 + nxny]) conv -= vz * (Tf[p0 + nxny] - Tf[p0]) / h }
          const gdot = (3 * vel[p0]) / Math.max(hHalf[p0], 1e-6)          // 壁面剪切率 γ̇_wall（同 Cross 模型一致）
          // gap-averaged 黏性耗散：抛物线速度剖面 ⟨γ̇²⟩ = γ̇_wall²/3（∫₀ᵇγ̇²dy /b）→ 用 γ̇_wall² 会高估 3×
          const diss = viscHeat ? (eta[p0] * gdot * gdot) / (3 * rhoT * cpT) : 0   // η·⟨γ̇²⟩/(ρcp) [K/s]（SI 体积热率抵消）
          const Hgap = 2 * Math.max(hHalf[p0], 1e-6)
          const beta = (alphaMM2 * PI2) / (Hgap * Hgap)                  // 壁面导热汇系数 [1/s]
          let Tn = (Tf[p0] + dts * (conv + diss) + dts * beta * tMold) / (1 + dts * beta)
          if (Tn < tMold) Tn = tMold                                    // 隐式汇下界 = 模壁温（唔可冷过壁）
          else if (Tn > tCapHi) Tn = tCapHi                             // 升温安全上限
          Tb[p0] = Tn
        }
        for (let p0 = 0; p0 < n; p0++) if (filled[p0] && !gM[p0]) Tf[p0] = Tb[p0]
      }
    }

    // 推进全前沿 + 焊接线检测（空体素同时收到唔同 label 前沿）
    for (const [p0, r] of frontRate) {
      // 焊接：检查 p0 嘅已填邻居有冇唔同 label
      let lab0 = -1, multi = false
      for (let d = 0; d < 6; d++) {
        if (!inb(p0, nb[d])) continue
        const q = p0 + nb[d]
        if (!solid[q] || !filled[q]) continue
        if (lab0 < 0) lab0 = label[q]
        else if (label[q] !== lab0) multi = true
      }
      f[p0] += (r * dt) / cellVol
      if (f[p0] >= 1 - 1e-9) {
        filled[p0] = 1
        f[p0] = 1
        fillTime[p0] = t + dt
        label[p0] = frontSrc.get(p0) ?? lab0
        if (multi) weld[p0] = 1          // 唔同来源前沿喺此对冲合流 = 焊接线
        nFilled++
        if (thermalOn) {
          // GM-W8 C5-S2：新充 CV 继承主贡献上游邻居嘅（已冷）入口熔温；低於无流动温度 → 记冻结前沿（潜在短射）
          const inT = frontTemp!.get(p0) ?? tMeltIn
          T![p0] = inT
          if (inT < tNoFlow) frozenCount++
        }
      }
    }
    t += dt
  }

  // 焊接线补充：同源前沿绕障下游再合流（fillTime 沿轴局部极大 = cut-locus）
  markWeldRidge(grid, fillTime, filled, weld)

  // 注：唔做「全充填态」最终重解 —— 型腔填满后冇流动前沿做 p=0 锚点，纯 Neumann 系统奇异。
  // `p` 保留充填末段（最后前沿仍在）嘅解 = 物理上嘅「end-of-fill 压力」（浇口高 → 末填点≈0）。
  let pPeak = 0
  for (const g of gateVox) if (p[g] > pPeak) pPeak = p[g]
  // 锁模力（旧·保留）≈ 充填末瞬时全场均压 × 单层投影面积（趋势级 —— 投影面积用「占用 z 层最多嗰层」）。
  let pSum = 0, nF = 0
  for (let p0 = 0; p0 < n; p0++) if (filled[p0]) { pSum += p[p0]; nF++ }
  const perLayer = new Float64Array(nz)
  for (let p0 = 0; p0 < n; p0++) if (filled[p0]) perLayer[(p0 / nxny) | 0]++
  let maxLayer = 0
  for (let z = 0; z < nz; z++) if (perLayer[z] > maxLayer) maxLayer = perLayer[z]
  const projArea = maxLayer * h * h                                    // mm²
  const avgP = nF > 0 ? pSum / nF : 0                                  // Pa
  const clampForce = avgP * (projArea * 1e-6)                          // Pa × m² = N（旧值：系统性低估）
  // #88 修正锁模力：峰值压力×投影面积积分。逐 (i,j) 开模方向列取【历时峰值压力】，Σ_列 maxPeakP·h²。
  //   诚实：旧「末瞬时全场均压」把末端前沿 p≈0 一大批低压区平均入去 → 系统性偏低、机台吨位推荐偏细（易飞边）。
  //   改用逐列历时峰压投影积分（工程惯例「型腔峰压 × 投影面积」嘅逐列形式，含近浇口高压分布），方向偏保守（宁大唔细）。
  const colPeak = new Float64Array(nxny)                               // 逐 (i,j) 列历时峰压 Pa（投影到 z 开模方向）
  for (let p0 = 0; p0 < n; p0++) {
    if (!filled[p0]) continue
    const col = p0 % nxny                                              // i + nx·j（z 列）
    if (pPeakCell[p0] > colPeak[col]) colPeak[col] = pPeakCell[p0]
  }
  let colPeakSum = 0
  for (let c = 0; c < nxny; c++) colPeakSum += colPeak[c]
  const clampForcePeak = colPeakSum * (h * h * 1e-6)                   // Σ_列 maxPeakP·h² [Pa·m² = N]

  const airtrap = markAirTrapsLocal(grid, fillTime)
  const out: MoldSolveOut = { fillTime, pressure: p, label, weld, airtrap, tFill: t, pPeak, clampForce, clampForcePeak, nReached: nF, iters: totalIters }

  // ── GM-W8 C5-S2 Stage-2 温度场结果（thermal 关 → 唔加，返回逐位一致於 Stage-1）──
  if (thermalOn) {
    const Tf = T!
    const tempField = new Float32Array(n)
    let tmn = Infinity, tmx = -Infinity
    for (let p0 = 0; p0 < n; p0++) {
      if (filled[p0]) { const tv = Tf[p0]; tempField[p0] = tv; if (tv < tmn) tmn = tv; if (tv > tmx) tmx = tv }
      else tempField[p0] = NaN
    }
    out.tempField = tempField
    out.tMin = Number.isFinite(tmn) ? tmn : tMeltIn
    out.tMax = Number.isFinite(tmx) ? tmx : tMeltIn
    out.frozenFraction = nF > 0 ? frozenCount / nF : 0
    out.shortShotRisk = (out.frozenFraction ?? 0) > 0.01
    out.thermalUsed = true
    out.notes = [
      '工程级 Stage-2 能量耦合：gap-averaged 温度场（对流迎风 + 黏性耗散 η·γ̇² + 壁面导热汇 β=α·π²/H²）+ Cross-WLF η(γ̇,T)',
      'WLF 位移系数 / 热物性 = 文献家族典型值（非牌号实测）；eta0 锚定於 tMelt → η₀(tMelt)=eta0 → 等温极限逐位退回 Stage-1',
      `熔体入口 ${tMeltIn}°C · 模壁 ${tMold}°C · 无流动温度 ${tNoFlow.toFixed(0)}°C · 冻结前沿占比 ${((out.frozenFraction ?? 0) * 100).toFixed(1)}%`,
    ]
    if (out.shortShotRisk) out.notes.push('⚠ 短射风险：部分前沿熔温已降至无流动温度以下（长薄流程冷却过快）—— 建议升熔温/模温、增大浇口、缩短流程或加浇口')
  }

  // ── GM-P3 Stage-3 保压 / PVT 收缩预测（enablePacking 关 → 下面全部唔行 → 逐位一致於 Stage-2）──
  //   算法（趋势级 quasi-static，O(cells × timesteps)，步数封顶 PACK_MAXSTEPS）：
  //     1. 各 CV seed 温度：Stage-2 开 → 用充填末温度场；否则 → 均匀熔温（保压期只导热冷却，无流 → 无对流/耗散）。
  //     2. 空间压降代理 reach_i = 1 − LOSS·(fillTime_i/tFill)：近浇口≈保压压力、远端按流程线性衰减（真解会解压力场，此处代理）。
  //     3. 显式时间 march 保压期：每步只行壁面导热汇 T←(T+dt·β·Tmold)/(1+dt·β)（隐式无条件稳定，β=α·π²/H²）。
  //        CV 温度跌穿无流动温度 tNoFlow ⇒ 冻结（seal）→ 锁定当刻局部压力 sealedPressure = packPressure·reach_i。
  //     4. 保压期结束仍未冻结嘅 CV：浇口泄压、无补缩 → seal 於残余压力（packPressure·reach·RESIDUAL，趋势级低压）。
  //     5. 收缩 = Tait 比容差：(ṽ(T_seal,P_seal) − ṽ(室温,常压)) / ṽ(T_seal,P_seal) × 100%。
  //        保压压力升 → P_seal 升 → ṽ_seal 降（压实）→ 收缩降；远浇口 seal 压低 → 收缩高（经典缩水型态）。
  if (opts.enablePacking === true && opts.tait) {
    const tait = opts.tait
    const packP = Math.max(0, opts.packPressure ?? 0)
    const packT = Math.max(0, opts.packTime ?? 0)
    const PACK_MAXSTEPS = 200                        // 时间步封顶（O(cells × steps) 有界；~0.05s/步、封顶 200）
    const PACK_LOSS = 0.6                            // 保压沿流程线性压降比例（浇口→末端；趋势代理，非真压力解）
    const PACK_REACH_MIN = 0.15                      // 远端最低压力保留比例（防 reach→0）
    const PACK_RESIDUAL = 0.08                       // 保压结束仍未冻结 CV 嘅残余锁压比例（泄压后无补缩）
    const P_ATM = 1.013e5                            // 常压 Pa（室温参考态）
    const T_ROOM_K = 298.15                          // 室温 25°C（K）—— 收缩参考态
    const tFillP = t > 1e-12 ? t : 1                 // 充填总时长（reach 归一；退化守卫）

    // seed 温度（K 内部用 °C，同 Stage-2 一致）+ reach + 状态
    const Tpk = new Float64Array(n)                  // 保压期逐 CV 温度 °C
    const sealedPressure = new Float32Array(n)       // 冻结瞬间锁定局部压力 Pa
    const sealTemp = new Float64Array(n)             // 冻结瞬间温度 °C（内部，算 Tait）
    const frozenPk = new Uint8Array(n)               // 1 = 已 seal
    const reach = new Float64Array(n)                // 空间压降代理 0..1
    for (let p0 = 0; p0 < n; p0++) {
      if (!filled[p0]) { Tpk[p0] = NaN; continue }
      Tpk[p0] = T ? T[p0] : tMeltIn                  // Stage-2 开用真末温，否则均匀熔温
      const ft = Number.isFinite(fillTime[p0]) ? fillTime[p0] : tFillP
      const rc = 1 - PACK_LOSS * (ft / tFillP)
      reach[p0] = rc > PACK_REACH_MIN ? rc : PACK_REACH_MIN
    }

    // 步数：~0.05s 分辨率，封顶 PACK_MAXSTEPS，下限 20（够解析冻结时刻）
    const NPK = Math.min(PACK_MAXSTEPS, Math.max(20, Math.round(packT / 0.05) || 20))
    const dtP = packT / NPK
    // 显式 march（隐式壁面汇 → dt 任意稳定；无流 → 无对流/耗散）
    for (let s = 0; s < NPK; s++) {
      for (let p0 = 0; p0 < n; p0++) {
        if (!filled[p0] || frozenPk[p0] || gateMask?.[p0]) continue   // 浇口恒温源唔 seal
        const Hgap = 2 * Math.max(hHalf[p0], 1e-6)
        const beta = (alphaMM2 * PI2) / (Hgap * Hgap)                 // 壁面导热汇 [1/s]（同 Stage-2）
        let Tn = (Tpk[p0] + dtP * beta * tMold) / (1 + dtP * beta)
        if (Tn < tMold) Tn = tMold
        Tpk[p0] = Tn
        if (Tn < tNoFlow) { frozenPk[p0] = 1; sealedPressure[p0] = packP * reach[p0]; sealTemp[p0] = Tn }
      }
    }
    // 保压结束仍未冻结（含均匀 seed 下步数为 0 时）→ 残余低压 seal（泄压无补缩 → 缩水大）
    for (let p0 = 0; p0 < n; p0++) {
      if (!filled[p0] || frozenPk[p0]) continue
      if (gateMask?.[p0]) { sealedPressure[p0] = packP * reach[p0]; sealTemp[p0] = Tpk[p0]; frozenPk[p0] = 1; continue }
      sealedPressure[p0] = packP * reach[p0] * PACK_RESIDUAL
      sealTemp[p0] = Number.isFinite(Tpk[p0]) ? Tpk[p0] : tMeltIn
      frozenPk[p0] = 1
    }

    // Tait 体积收缩：seal 态 vs 室温常压
    const vRoom = taitVolume(tait, T_ROOM_K, P_ATM)
    const shrinkageField = new Float32Array(n)
    let shMax = -Infinity, shMin = Infinity, shSum = 0, shN = 0
    for (let p0 = 0; p0 < n; p0++) {
      if (!filled[p0]) { shrinkageField[p0] = NaN; continue }
      const vSeal = taitVolume(tait, sealTemp[p0] + 273.15, sealedPressure[p0])
      let sh = vSeal > 1e-12 ? ((vSeal - vRoom) / vSeal) * 100 : 0    // 体积收缩 %
      if (sh < 0) sh = 0                                              // seal 态比容 < 室温（罕见高压过压）→ 钳 0
      shrinkageField[p0] = sh
      if (sh > shMax) shMax = sh
      if (sh < shMin) shMin = sh
      shSum += sh; shN++
    }
    const shrinkMax = shN > 0 && Number.isFinite(shMax) ? shMax : 0
    const shrinkAvg = shN > 0 ? shSum / shN : 0
    const shrinkMinV = shN > 0 && Number.isFinite(shMin) ? shMin : 0
    // 均匀度 0..1：1 − 相对极差（越均匀越接近 1；厚薄/远近浇口差大 → 低 → 翘曲风险）
    const shrinkUniformity = shrinkMax > 1e-9 ? Math.max(0, 1 - (shrinkMax - shrinkMinV) / shrinkMax) : 1
    // ── GM-S4 Stage-4 翘曲（趋势级）：微分收缩弯矩 proxy = 面内 ∇体积收缩 —— 排除浇口 CV（熔态 seal 伪峰会污染场/方向）──
    const gateFlagW = new Uint8Array(n)
    for (const g of gateVox) gateFlagW[g] = 1
    const warp = computeWarpage(grid, filled, shrinkageField, gateFlagW, shrinkAvg)
    out.packing = {
      sealedPressure, shrinkageField, shrinkMax, shrinkAvg, shrinkUniformity,
      packTraceNote: `趋势级 Stage-3 保压/PVT（2-domain Tait，文献典型系数非牌号实测）：保压 ${(packP / 1e6).toFixed(1)} MPa · ${packT.toFixed(2)} s → ` +
        `平均体积收缩 ${shrinkAvg.toFixed(2)}% · 最大 ${shrinkMax.toFixed(2)}% · 均匀度 ${(shrinkUniformity * 100).toFixed(0)}%。` +
        `压降/冻结锁压为 quasi-static 代理，忽略取向/结晶动力学/翘曲 —— 同阶趋势，非尺寸公差。`,
      warpField: warp.warpField, warpMaxDir: warp.warpMaxDir, warpIndex: warp.warpIndex, warpNote: warp.warpNote,
    }
  }

  return out
}

// ------------------------------------------------------------------ GM-S4 Stage-4 翘曲（趋势级差异收缩弯矩 proxy）

/**
 * GM-S4 Stage-4 翘曲趋势指标（趋势级，非 FEM 翘曲位移）。
 *
 * 物理 proxy：翘曲由【差异收缩】驱动 —— 零件各处体积收缩唔一致 → 内部约束应力 → 弯矩 → 变形。
 *   逐 CV 面内梯度 |∇(体积收缩)|（中央/单侧差分，%/mm）= 局部弯矩 proxy（warpField 归一 0..1 供着色）。
 *   主导微分收缩轴 = 梯度结构张量 Σ(g⊗g) 主特征向量（幂迭代）—— 零件最易「揻」嘅方向（warpMaxDir）。
 *   翘曲指数 warpIndex 0..100 = rms|∇收缩|（弯矩 proxy）× 平均收缩幅度 → 饱和映射。
 *
 * ★ 诚实定位：呢个系【差异收缩弯矩趋势】，唔系 FEM 翘曲位移 —— 未解残余应力场、约束刚度、结晶取向、
 *   顶出/冷却后回弹。出嘅系「边度/边个方向易翘、保压升翘曲趋势改善」嘅同阶趋势，唔可当 mm 翘曲量。
 *   为何 ×收缩幅度：单纯 rms 梯度随保压压力升会微升（reach 模型令远近浇口 seal 压绝对差扩大），但整体
 *   收缩幅度 shrinkAvg 显著降，乘积 ≈ 绝对翘曲应变驱动，随保压升单调降 —— 符合「保压足→翘曲低」工程经验。
 *   浇口 CV（gateFlag）排除：浇口系热流道恒温源，末态仍熔（seal 于熔温）→ Tait 伪高收缩峰，会污染梯度场/主轴。
 *
 * 纯函数，可 Node 直测（喂受控 shrinkageField）。均匀收缩场 → warpIndex ≈ 0。
 */
function computeWarpage(
  grid: GridLite,
  filled: Uint8Array,
  sf: ArrayLike<number>,
  gateFlag: Uint8Array | null,
  shrinkAvg: number,
): { warpField: Float32Array; warpMaxDir: [number, number, number]; warpIndex: number; warpNote: string } {
  const { nx, ny, nz, h } = grid
  const nxny = nx * ny
  const n = nx * ny * nz
  const warpField = new Float32Array(n)
  const ok = (q: number): boolean => filled[q] !== 0 && Number.isFinite(sf[q] as number) && !(gateFlag !== null && gateFlag[q] !== 0)
  const val = (q: number): number => sf[q] as number
  const gradAx = (q: number, qm: number, qp: number, hasM: boolean, hasP: boolean): number => {
    const okm = hasM && ok(qm), okp = hasP && ok(qp)
    if (okm && okp) return (val(qp) - val(qm)) / (2 * h)
    if (okp) return (val(qp) - val(q)) / h
    if (okm) return (val(q) - val(qm)) / h
    return 0
  }
  const mmag = new Float64Array(n)
  let mmax = 0, sumSq = 0, cnt = 0
  let Txx = 0, Tyy = 0, Tzz = 0, Txy = 0, Txz = 0, Tyz = 0
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const p0 = i + nx * (j + ny * k)
    if (!ok(p0)) { warpField[p0] = (filled[p0] !== 0 && Number.isFinite(sf[p0] as number)) ? 0 : NaN; continue }
    const gx = gradAx(p0, p0 - 1, p0 + 1, i > 0, i < nx - 1)
    const gy = gradAx(p0, p0 - nx, p0 + nx, j > 0, j < ny - 1)
    const gz = gradAx(p0, p0 - nxny, p0 + nxny, k > 0, k < nz - 1)
    const mag = Math.sqrt(gx * gx + gy * gy + gz * gz)
    mmag[p0] = mag
    if (mag > mmax) mmax = mag
    Txx += gx * gx; Tyy += gy * gy; Tzz += gz * gz; Txy += gx * gy; Txz += gx * gz; Tyz += gy * gz
    sumSq += mag * mag; cnt++
  }
  if (mmax > 1e-30) for (let p0 = 0; p0 < n; p0++) if (mmag[p0] > 0) warpField[p0] = mmag[p0] / mmax
  const rmsGrad = cnt > 0 ? Math.sqrt(sumSq / cnt) : 0
  // 主微分收缩轴 = 结构张量主特征向量（幂迭代；PSD 保证收敛到主向量）
  let vx = 0, vy = 0, vz = 0
  if (Txx + Tyy + Tzz > 1e-30) {
    vx = 1; vy = 1; vz = 1
    for (let it = 0; it < 60; it++) {
      const ax = Txx * vx + Txy * vy + Txz * vz
      const ay = Txy * vx + Tyy * vy + Tyz * vz
      const az = Txz * vx + Tyz * vy + Tzz * vz
      const L = Math.hypot(ax, ay, az) || 1
      vx = ax / L; vy = ay / L; vz = az / L
    }
  }
  // 翘曲指数 0..100：饱和映射（趋势级；WREF 标定令典型件落中段）
  const WREF = 0.30
  const warpRaw = rmsGrad * Math.max(0, shrinkAvg)
  const warpIndex = 100 * (1 - Math.exp(-warpRaw / WREF))
  const warpNote = `趋势级 Stage-4 翘曲指数 ${warpIndex.toFixed(0)}/100：微分收缩弯矩 proxy（面内 |∇体积收缩| rms=${rmsGrad.toFixed(3)}%/mm × 平均收缩 ${shrinkAvg.toFixed(2)}%），` +
    `主导微分收缩轴 [${vx.toFixed(2)}, ${vy.toFixed(2)}, ${vz.toFixed(2)}]。此为差异收缩弯矩趋势，非 FEM 翘曲位移（未解残余应力/约束刚度/结晶取向/回弹）。`
  return { warpField, warpMaxDir: [vx, vy, vz], warpIndex, warpNote }
}

// ------------------------------------------------------------------ 焊接 / 困气（由真解 fillTime）

/** 同源前沿绕障下游合流：fillTime 沿某轴局部极大（两侧都早充）= 焊接脊线。 */
function markWeldRidge(grid: GridLite, fillTime: Float64Array, filled: Uint8Array, weld: Uint8Array): void {
  const { nx, ny, nz, solid } = grid
  const n = nx * ny * nz, nxny = nx * ny
  const strides = [1, nx, nxny]
  const lim = [nx, ny, nz]
  for (let p = 0; p < n; p++) {
    if (!solid[p] || !filled[p] || !Number.isFinite(fillTime[p])) continue
    const c = [p % nx, ((p / nx) | 0) % ny, (p / nxny) | 0]
    for (let ax = 0; ax < 3; ax++) {
      if (c[ax] <= 0 || c[ax] >= lim[ax] - 1) continue
      const st = strides[ax], qm = p - st, qp = p + st
      if (!solid[qm] || !solid[qp] || !filled[qm] || !filled[qp]) continue
      if (fillTime[qm] < fillTime[p] && fillTime[qp] < fillTime[p]) { weld[p] = 1; break }
    }
  }
}

/** 困气：fillTime 全方向（6 邻）局部极大 = 前沿终止死腔。 */
export function markAirTrapsLocal(grid: GridLite, fillTime: Float64Array): Uint8Array {
  const { nx, ny, nz, solid } = grid
  const n = nx * ny * nz, nxny = nx * ny
  const trap = new Uint8Array(n)
  const nb = [-1, 1, -nx, nx, -nxny, nxny]
  for (let p = 0; p < n; p++) {
    if (!solid[p] || !Number.isFinite(fillTime[p])) continue
    const ix = p % nx, iy = ((p / nx) | 0) % ny, iz = (p / nxny) | 0
    let isMax = true
    for (let d = 0; d < 6 && isMax; d++) {
      const dd = nb[d]
      if (dd === -1 && ix === 0) continue
      if (dd === 1 && ix === nx - 1) continue
      if (dd === -nx && iy === 0) continue
      if (dd === nx && iy === ny - 1) continue
      if (dd === -nxny && iz === 0) continue
      if (dd === nxny && iz === nz - 1) continue
      const q = p + dd
      if (solid[q] && Number.isFinite(fillTime[q]) && fillTime[q] >= fillTime[p]) isMax = false
    }
    if (isMax) trap[p] = 1
  }
  return trap
}

export const _solveInternals = { crossVisc, crossWLFVisc, markAirTrapsLocal, markWeldRidge, taitVolume, MOLD_TAIT, computeWarpage }
