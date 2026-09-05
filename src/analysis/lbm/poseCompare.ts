// poseCompare.ts —— 拖住零件转朝向之后嘅【位姿记帐】。
//
// ★★ 呢个档案净係 import convergence.ts ★★
// ────────────────────────────────────
// 冇 three、冇 GL、冇 store、冇 React —— 同 convergence.ts 一样嘅规矩，两个原因：
//  ① 呢度全部係「边个数可以信 / 边个数唔可以信」嘅判定，一定要 headless 测得到
//     （`node --experimental-strip-types --test tests/lbm-pose-driver.test.mjs`）。
//  ② 收敛判据【唔喺呢度】。呢个档案一条收敛准则都冇写 —— 佢揸住一个 ConvergenceTracker
//     （由 caller 传入），只係决定「几时清走佢」同「几时准佢收样本」。任何人喺呢度写
//     `spread < 0.012` 就係一个 bug：两个引擎嘅唯一一把尺住喺 convergence.ts。
//
//
// ★★★ 一、点解呢个模组【唔报绝对 Cd】★★★
// ────────────────────────────────────
// 喺真机（RTX 5070 Ti）实测：GPU 求解器嘅球体 Cd 係 Clift-Gauvin 基准嘅 2.0–2.2 倍，
// 而且喺三个解析度（dLb 20 / 28 / 37）同两个 Re 之下【完全唔飘】。唔飘 = 唔係网格不足
// （网格不足会随 dLb 收敛），係一个【常数系统增益】。根因未查（最可疑：动量交换喺每条
// 边界 link 上面计咗两次）。
//
// 一个常数增益 k 嘅后果係非常具体嘅：
//
//     Cd_gpu(姿态 i) = k · Cd_真(姿态 i)
//
//   · 单独摆 Cd_gpu 出嚟当数值 → 错足一倍，唔可以做工程判断。
//   · 摆比值 Cd_gpu(A)/Cd_gpu(B) = Cd_真(A)/Cd_真(B) → k 消晒，【而家就可以信】。
//
// 所以呢度所有对外 API 出嘅係【比值同 Δ%】。绝对数只喺 PoseEntry 入面留低（畀诊断），
// 而且成个 table 都带住 POSE_COMPARE_NOTE 讲明佢未校正。UI 唔可以单独卖一个 Cd 数字。
//
//
// ★★★ 二、跨朝向唯一可比嘅量係【阻力面积 Cd×A】，唔係 Cd ★★★
// ──────────────────────────────────────────────────────
// Cd = 2F / (ρU²A)。朝向一转，迎风面积 A 就跟住转（一块板打横 vs 打直可以差几倍）。
// 所以两个朝向嘅 Cd 比值【唔係】阻力比值 —— 分母根本唔同一件事。真正嘅阻力係
//
//     F = Cd · ½ρU² · A        （½ρU² 喺同一次风洞入面係常数）
//
// 即係跨朝向嘅阻力比 = (Cd_i·A_i) / (Cd_ref·A_ref)。呢个量喺下面叫 `dragArea`，
// 而 `dragRatio` / `dragDeltaPct` 就係「边个朝向阻力细几多 %」嘅正确答案。
// `cdRatio` 都照出，但只可以喺【同一个迎风面积】之下解读（例如净係平移、冇转朝向）。
//
//
// ★★★ 三、位姿一变，之前收嘅样本全部係谎话 ★★★
// ──────────────────────────────────────────
// 力样本係「呢个几何喺呢个流场入面受几多力」。几何一变，之前嗰啲力就唔係讲紧同一件事。
// 攞旧姿态嘅力去撞新姿态嘅收敛窗口 = 一转手就「收敛」，而个数係上一个朝向嘅。
// 所以：位姿一变 → tracker.reset()，而且 `dragging` 期间【一个样本都唔收】。
// 放手之后仲要过一段 relax（流场重建嘅过渡期）先开始收 —— 呢个 gate 係 ramp gate 嘅
// 同一个道理：转朝向 = 一次细规模嘅冲击启动。
//
//
// ★★★ 四、状态机 ★★★
// ──────────────────
//                    第一次 notePose（= 烘焙姿态基准）
//     idle ─────────────────────────────────────────────▶ settling
//       ▲                                                  │
//       │ disable()                          justConverged │ / finalize()
//       │                                                  ▼
//       │              位姿又变                          settled
//       └──────────────  dragging  ◀──────────────────────┘
//                          │  静咗 quietMs
//                          ▼
//                       settling
//
//   · idle     —— 未收过任何位姿（windPose 未接线）或者已 disable。★ 现有非拖拽路径就係一直留喺呢度 ★
//   · dragging —— 位姿最近 quietMs 之内郁过。唔收样本、唔报数、finished() 永远 false。
//   · settling —— 位姿定咗，流场重建紧。唔报数（readout().trusted === false）。
//   · settled  —— tracker 宣布咗收敛（或者 caller finalize 咗一个未收敛嘅结果）。得呢个状态先有数。

import { ConvergenceTracker, GPU_CD_BASIS } from './convergence.ts'
import type { CdBasis, ForceLike, Schedule } from './convergence.ts'

/* ════════════════════════════════════════════════════ 矩阵约定（★ 锁死 ★） */

/**
 * ★★ windPose 係 column-major，逐 index 等于 three.js `Matrix4.elements` ★★
 *
 * 即係：
 *   e[0], e[1], e[2]    = 第一条基向量（X 轴）
 *   e[4], e[5], e[6]    = 第二条基向量（Y 轴）
 *   e[8], e[9], e[10]   = 第三条基向量（Z 轴）
 *   e[12],e[13],e[14]   = 平移
 *   e[3]=e[7]=e[11]=0, e[15]=1
 *
 * 拣呢个约定嘅原因唔係品味：driver 嗰边要 `new Matrix4().fromArray(windPose)` 交畀
 * `solver.setPose(m)`，而 three 嘅 `fromArray` / `toArray` / `.elements` 三样都係 column-major。
 * 接线嗰阵 store 直接写 `obj.matrix.elements`（或者 `m.toArray()`）就啱，唔使转置。
 *
 * ⚠ 用 row-major 塞落嚟嘅话，纯旋转矩阵会变成佢嘅【转置】= 反方向嘅旋转。呢种错唔会 throw，
 *   只会令流场朝住相反方向转 —— 所以呢个常数存在，而且测试会验佢。
 */
export const POSE_MATRIX_ORDER = 'column-major (three Matrix4.elements)'

/** 16 个 number 嘅 Matrix4 elements。用 ArrayLike 係为咗 number[] / Float32Array 都收得。 */
export type Pose16 = ArrayLike<number>

/** 单位矩阵 = 「同烘焙嗰阵一模一样，冇郁过」。 */
export const IDENTITY_POSE: readonly number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

/**
 * ★ windPose 嘅语义：相对【建 solver 嗰刻烘焙落去嘅几何】嘅刚体变换（delta），唔係世界矩阵 ★
 *
 * identity = 冇郁过 = 唔使 call setPose。接线嗰阵要喺 store 度维持呢个语义：
 * 撳落零件嗰刻记住 M0，之后 windPose = M_now · M0⁻¹。
 * （solver 内部嘅 SDF 係喺烘焙坐标度嘅，所以佢要嘅一定係 delta；传世界矩阵落去
 *  会令零件即刻飞出个域外面。）
 */
export const POSE_IS_DELTA_FROM_BAKE = true

export function isPose16(m: unknown): m is Pose16 {
  if (m === null || typeof m !== 'object') return false
  const a = m as ArrayLike<number>
  if (a.length !== 16) return false
  for (let i = 0; i < 16; i++) if (!Number.isFinite(a[i])) return false
  return true
}

/** 3×3 基嘅最大逐项差（旋转 / 缩放部分）。 */
export function poseBasisDiff(a: Pose16, b: Pose16): number {
  let d = 0
  for (const i of [0, 1, 2, 4, 5, 6, 8, 9, 10]) d = Math.max(d, Math.abs(a[i] - b[i]))
  return d
}

/** 平移部分嘅最大逐项差（模型单位，通常 mm）。 */
export function poseTransDiff(a: Pose16, b: Pose16): number {
  return Math.max(Math.abs(a[12] - b[12]), Math.abs(a[13] - b[13]), Math.abs(a[14] - b[14]))
}

export interface PoseEps {
  /** 基向量分量嘅门槛（无量纲）。缺省 1e-5 ≈ 0.0006° */
  rot?: number
  /** 平移门槛（模型单位）。★ driver 应该传 0.05·h（半格都唔够嘅移动，LBM 上係同一件事）★ */
  trans?: number
}

export function posesEqual(a: Pose16, b: Pose16, eps: PoseEps = {}): boolean {
  return poseBasisDiff(a, b) <= (eps.rot ?? 1e-5) && poseTransDiff(a, b) <= (eps.trans ?? 1e-4)
}

/**
 * 3×3 部分嘅列长度同行列式 —— 用嚟老实咁讲「呢个唔係刚体变换」。
 * ⚠ 权威嘅刚体检查係 solver.setPose 自己嗰个（佢会 throw）。呢度只係畀 driver 喺
 *   call 落去之前分辨「用户拉紧 scale」，唔使每帧食一个 exception。
 */
export function poseScale(m: Pose16): { sx: number; sy: number; sz: number; det: number } {
  const sx = Math.hypot(m[0], m[1], m[2])
  const sy = Math.hypot(m[4], m[5], m[6])
  const sz = Math.hypot(m[8], m[9], m[10])
  // column-major：R[r][c] = m[c*4 + r]
  const det = m[0] * (m[5] * m[10] - m[9] * m[6])
    - m[4] * (m[1] * m[10] - m[9] * m[2])
    + m[8] * (m[1] * m[6] - m[5] * m[2])
  return { sx, sy, sz, det }
}

/** 刚体（纯旋转 + 平移，冇缩放 / 冇镜像）先至送得入 LBM —— 镜像会令 det = −1。 */
export function isRigidPose(m: Pose16, tol = 1e-3): boolean {
  if (!isPose16(m)) return false
  const s = poseScale(m)
  if (Math.abs(s.sx - 1) > tol || Math.abs(s.sy - 1) > tol || Math.abs(s.sz - 1) > tol) return false
  if (Math.abs(s.det - 1) > tol) return false     // det = −1 就係镜像，唔係刚体
  const d01 = m[0] * m[4] + m[1] * m[5] + m[2] * m[6]
  const d02 = m[0] * m[8] + m[1] * m[9] + m[2] * m[10]
  const d12 = m[4] * m[8] + m[5] * m[9] + m[6] * m[10]
  return Math.abs(d01) <= tol && Math.abs(d02) <= tol && Math.abs(d12) <= tol
}

/** 轴角分解 —— 净係畀 UI 起个人睇得明嘅 label（「绕 Y 32°」）。 */
export function poseRotation(m: Pose16): { axis: [number, number, number]; deg: number } {
  const tr = m[0] + m[5] + m[10]
  const ang = Math.acos(Math.max(-1, Math.min(1, (tr - 1) / 2)))
  let ax: [number, number, number] = [m[6] - m[9], m[8] - m[2], m[1] - m[4]]
  let n = Math.hypot(ax[0], ax[1], ax[2])
  if (n < 1e-8) {
    if (ang < 1e-6) return { axis: [0, 0, 0], deg: 0 }
    // ~180°：(R + I)/2 嘅对角线开方；符号由最大嗰个分量同非对角项夹出嚟
    const x = Math.sqrt(Math.max(0, (m[0] + 1) / 2))
    const y = Math.sqrt(Math.max(0, (m[5] + 1) / 2))
    const z = Math.sqrt(Math.max(0, (m[10] + 1) / 2))
    ax = [x, y, z]
    if (x >= y && x >= z) { if (m[4] + m[1] < 0) ax[1] = -y; if (m[8] + m[2] < 0) ax[2] = -z }
    else if (y >= z) { if (m[4] + m[1] < 0) ax[0] = -x; if (m[9] + m[6] < 0) ax[2] = -z }
    else { if (m[8] + m[2] < 0) ax[0] = -x; if (m[9] + m[6] < 0) ax[1] = -y }
    n = Math.hypot(ax[0], ax[1], ax[2]) || 1
  }
  return { axis: [ax[0] / n, ax[1] / n, ax[2] / n], deg: ang * 180 / Math.PI }
}

/** 量化指纹 —— 畀 UI 分辨「係咪同一个位姿」，唔係用嚟做相等判定（嗰个用 posesEqual）。 */
export function poseKey(m: Pose16, digits = 4): string {
  const out: string[] = []
  for (let i = 0; i < 16; i++) out.push(m[i].toFixed(digits))
  return out.join(',')
}

/** 人睇得明嘅位姿描述（「绕 (0,1,0) 32° · 移 4.0mm」）。 */
export function poseLabel(m: Pose16): string {
  const r = poseRotation(m)
  const t = Math.hypot(m[12], m[13], m[14])
  const parts: string[] = []
  if (r.deg >= 0.05) {
    const a = r.axis.map((v) => (Math.abs(v) < 5e-3 ? 0 : Number(v.toFixed(2))))
    parts.push(`绕 (${a[0]},${a[1]},${a[2]}) ${r.deg.toFixed(1)}°`)
  }
  if (t >= 1e-3) parts.push(`移 ${t.toFixed(2)}`)
  return parts.length ? parts.join(' · ') : '基准姿态'
}

/* ═════════════════════════════════════════════ 诚实文案（★ 面板要原文显示 ★） */

/**
 * ★ 实测常数系统增益 ★
 * RTX 5070 Ti，球体，dLb = 20 / 28 / 37 三个解析度 × 两个 Re：
 * GPU Cd / Clift-Gauvin ∈ [2.0, 2.2]，唔随解析度收敛 → 唔係网格不足，係常数增益。
 */
export const GPU_CD_GAIN_RANGE: readonly [number, number] = [2.0, 2.2]

/** 已经试过嘅解析度（写落嚟係为咗「唔飘」呢句唔係一句形容词）。 */
export const GPU_CD_GAIN_DLB_TESTED: readonly number[] = [20, 28, 37]

/** 绝对 Cd 喺 GPU 路径【唔可以】当真数显示。呢个 flag 唔係设定，係一句实测结论。 */
export const GPU_CD_ABSOLUTE_TRUSTWORTHY = false

/**
 * ★ 面板必须原文显示呢句（同 convergence.CD_COMPARE_NOTE 一齐）★
 *
 * 唔係免责声明嘅客套话：呢句係产品定位。GPU 路径而家卖嘅係「边个朝向阻力细几多 %」，
 * 唔係「阻力係几多牛顿」。绝对值要问 CPU 引擎。
 */
export const POSE_COMPARE_NOTE =
  '⚠ GPU 求解器嘅【绝对】Cd 唔准：真机实测球体 Cd 係 Clift-Gauvin 基准嘅 2.0–2.2 倍，'
  + '而且喺三个解析度（dLb 20/28/37）同两个 Re 之下都唔飘 —— 即係一个常数系统增益'
  + '（根因未查，最可疑係动量交换每条 link 计咗两次），唔係网格唔够。'
  + '所以呢度【只报比值同 Δ%】：常数增益喺 A/B 比值入面会消掉，'
  + '「边个朝向阻力细几多 %」而家就成立；要绝对 Cd 数值请用 CPU 引擎。'

/** 点解跨朝向要睇 Cd×A 而唔係 Cd —— 呢句同上面嗰句一样重要，UI 两句都要有。 */
export const POSE_AREA_NOTE =
  '⚠ 朝向一转，迎风面积 A 就跟住转，所以两个朝向嘅 Cd 比值【唔係】阻力比值（分母唔同件事）。'
  + '真正嘅阻力係 F = Cd·½ρU²·A，而 ½ρU² 喺同一次风洞入面係常数 —— '
  + '所以跨朝向嘅比较一定要睇【阻力面积 Cd×A】（下面嘅 dragRatio / dragDeltaPct）。'

/** 过渡态（dragging / settling）嘅统一讲法 —— 唔准喺呢啲状态畀任何数字出去。 */
export const POSE_UNSETTLED_NOTE =
  '流场仲追紧新姿态 —— 而家嘅数字係过渡值，唔好信。等佢 settle 咗先有得比。'

export const POSE_STATE_LABEL: Record<PoseState, string> = {
  idle: '未追踪位姿',
  dragging: '拖拽中（唔收样本）',
  settling: '流场重建中（未可信）',
  settled: '已 settle',
}

/* ════════════════════════════════════════════════════════════ 型别 */

export type PoseState = 'idle' | 'dragging' | 'settling' | 'settled'

/** pollForce() 还嘅嘢，加返我哋要嘅迎风面积。 */
export interface PoseForceLike extends ForceLike {
  /** GPU 自己量嘅迎风面积 mm²（LbmGpu.ForceSample.frontalAreaMM2）。★ 朝向一转就变 ★ */
  frontalAreaMM2?: number
}

export type PoseDropReason =
  | 'ok'
  | 'empty'      // pollForce() 还 null（正常）
  | 'idle'       // 未开始追踪位姿
  | 'disabled'   // setPose 用唔到 → 已经收皮
  | 'dragging'   // ★ 拖紧，一个样本都唔收 ★
  | 'relax'      // 放手之后嘅流场过渡期，未够 relaxSteps
  | 'tracker'    // 交咗畀 ConvergenceTracker，佢自己唔要（ramp / stale / tooSoon / …）

export interface PosePushOutcome {
  accepted: boolean
  reason: PoseDropReason
  /** 呢一次 push 令个位姿由「未 settle」变成「settled」 */
  justSettled: boolean
}

/** 一个已经记咗帐嘅位姿。 */
export interface PoseEntry {
  id: number
  key: string
  label: string
  /** 位姿嘅 copy（column-major 16）—— 唔可以揸住 caller 嗰个 array，佢会畀人改 */
  pose: number[]
  /** ⚠ 未校正嘅动量交换 Cd（实测系统增益 2.0–2.2×）。★ 唔可以单独显示 ★ */
  cd: number
  cdSigned: number
  cdOsc: number
  /** 迎风面积 mm²，已收样本嘅平均（朝向一转就变 —— 呢个就係 Cd 嘅分母） */
  areaMM2: number
  /** ★ 跨朝向唯一可比嘅量 ★：Cd × A（mm²）。∝ 阻力（½ρU² 係常数） */
  dragArea: number
  converged: boolean
  samples: number
  spread: number
  /** 记帐嗰刻嘅 solver substep 数 */
  atStep: number
  cdBasis: CdBasis
}

export interface PoseCompareRow {
  id: number
  label: string
  isReference: boolean
  /** ⚠ 未校正 */
  cd: number
  areaMM2: number
  dragArea: number
  /** Cd 比值 —— ★ 只喺迎风面积一样嗰阵先解读得到 ★ */
  cdRatio: number
  cdDeltaPct: number
  /** ★ 阻力比值（Cd×A）—— 「边个朝向阻力细几多」嘅正确答案 ★ */
  dragRatio: number
  dragDeltaPct: number
  /** 涡脱落造成嘅相对噪声底 ±%（自己 + 参考两边加埋） */
  noisePct: number
  /** |dragDeltaPct| 有冇大过噪声底。false = 呢个差异讲唔到嘢 */
  significant: boolean
  converged: boolean
  samples: number
}

export interface PoseCompareTable {
  referenceId: number | null
  rows: PoseCompareRow[]
  /** ★ 永远 false ★ —— 呢张表嘅绝对数唔可以当真数用 */
  absoluteUsable: boolean
  note: string
  areaNote: string
  gainRange: readonly [number, number]
}

export interface UntrustedReadout {
  trusted: false
  state: 'idle' | 'dragging' | 'settling'
  reason: string
  /** 0..1；dragging 期间永远 0（根本未开始计） */
  progress: number
  samples: number
  note: string
}

export interface TrustedReadout {
  trusted: true
  state: 'settled'
  entry: PoseEntry
  table: PoseCompareTable
  note: string
}

/** ★ 过渡态嘅 readout 冇任何数字栏位 ★ —— 型别上就攞唔到，唔使靠人自律。 */
export type PoseReadout = UntrustedReadout | TrustedReadout

export interface PoseTransition {
  changed: boolean
  state: PoseState
  /** 要唔要真係 call solver.setPose（第一个 = 烘焙姿态本身就唔使） */
  needsSolverPose: boolean
  reason: 'ok' | 'same' | 'invalid' | 'disabled' | 'first'
}

export interface PoseCompareOptions {
  /** ★ 由 caller 传入 —— 收敛判据只可以有一份 ★ */
  tracker: ConvergenceTracker
  /** 位姿相等门槛 */
  eps?: PoseEps
  /** 位姿静咗几耐先当放咗手（ms）。太短 = 拖到一半就开始 settle；太长 = 放手之后呆等。 */
  quietMs?: number
  /**
   * 放手之后要行几多 substep 先开始收样本。
   * 缺省 = (minSteps − rampSteps)/2 ≈ 0.9·DX/u_lb ≈ 一个流过时间（flow-through）。
   * ⚠ 调细 = 攞紧过渡值当 settle 值，个数会偏。
   */
  relaxSteps?: number
  /** 每个位姿最多畀几多 substep 去 settle。缺省 = maxSteps − rampSteps（同初次求解一样嘅预算）。 */
  settleCap?: number
  /** 最多留几多个位姿记录（参考嗰个永远唔会畀踢走）。 */
  maxEntries?: number
}

/* ════════════════════════════════════════════════════════════ 主体 */

export class PoseCompare {
  readonly tracker: ConvergenceTracker
  readonly schedule: Schedule
  readonly eps: Required<PoseEps>
  readonly quietMs: number
  readonly relaxSteps: number
  readonly settleCap: number
  readonly maxEntries: number

  private _state: PoseState = 'idle'
  private _enabled = true
  private _disabledReason = ''
  /** store 有冇畀紧一个明确嘅 `windPoseDragging === true`（有就唔靠「静咗几耐」估） */
  private _explicitDrag = false
  /** 入 dragging 之前係咩状态 —— 撳咗手柄但冇郁过就要原状返去，唔可以白白重 settle 一次 */
  private _preDragState: PoseState = 'idle'
  /** 今次拖拽入面位姿真係变过冇 */
  private _movedInDrag = false
  private _pose: number[] | null = null
  private _key = ''
  private _lastMoveT = 0
  /** 位姿最后一次变嗰刻嘅 stepCount */
  private _poseStartStep = 0
  /** 进入 settling 嗰刻嘅 stepCount */
  private _settleStartStep = 0
  /** 细过呢个 step 嘅样本一律唔收（流场过渡期） */
  private _relaxUntil = 0
  /** 行到呢个 step 仲未收敛就係「settle 唔到」 */
  private _deadline = 0
  private _areaSum = 0
  private _areaN = 0
  private _entries: PoseEntry[] = []
  private _refId: number | null = null
  private _curEntryId: number | null = null
  private _seq = 0
  private _dropped: Record<PoseDropReason, number>

  constructor(opts: PoseCompareOptions) {
    this.tracker = opts.tracker
    this.schedule = opts.tracker.schedule
    this.eps = { rot: opts.eps?.rot ?? 1e-5, trans: opts.eps?.trans ?? 1e-4 }
    this.quietMs = Math.max(0, opts.quietMs ?? 140)
    const postRamp = Math.max(0, this.schedule.minSteps - this.schedule.rampSteps)
    this.relaxSteps = Math.max(0, Math.round(opts.relaxSteps ?? postRamp * 0.5))
    this.settleCap = Math.max(1, Math.round(opts.settleCap ?? (this.schedule.maxSteps - this.schedule.rampSteps)))
    this.maxEntries = Math.max(2, Math.round(opts.maxEntries ?? 24))
    this._dropped = { ok: 0, empty: 0, idle: 0, disabled: 0, dragging: 0, relax: 0, tracker: 0 }
  }

  get state(): PoseState { return this._state }
  get enabled(): boolean { return this._enabled }
  get disabledReason(): string { return this._disabledReason }
  get pose(): readonly number[] | null { return this._pose }
  get poseKey(): string { return this._key }
  get entries(): readonly PoseEntry[] { return this._entries }
  get referenceId(): number | null { return this._refId }
  get dropped(): Readonly<Record<PoseDropReason, number>> { return this._dropped }
  /** 边一个 step 之前嘅样本会畀 relax gate 掉（诊断用） */
  get relaxUntilStep(): number { return this._relaxUntil }
  get deadlineStep(): number { return this._deadline }

  /**
   * setPose 用唔到（未落地 / throw 咗）就 call 呢个。
   * ★ 之后一律报「未可信」★ —— 因为 solver 入面嘅几何同 store 嘅位姿而家係唔同步嘅，
   * 继续报数就係攞住旧几何嘅力扮新姿态嘅结果，即係我哋成个模组要挡嘅嗰种谎话。
   */
  disable(reason: string): void {
    this._enabled = false
    this._disabledReason = reason
    this._state = 'idle'
  }

  /** 而家係咪由 store 嘅 `windPoseDragging` 明确讲紧拖紧（唔係靠估）。 */
  get explicitDrag(): boolean { return this._explicitDrag }

  /** 换零件 / 换风速 / 重建 solver 之后：全部记录作废（旧几何嘅数字冇得比）。 */
  reset(): void {
    this._state = 'idle'
    this._pose = null; this._key = ''
    this._explicitDrag = false; this._preDragState = 'idle'; this._movedInDrag = false
    this._lastMoveT = 0
    this._poseStartStep = 0; this._settleStartStep = 0; this._relaxUntil = 0; this._deadline = 0
    this._areaSum = 0; this._areaN = 0
    this._entries = []
    this._refId = null; this._curEntryId = null; this._seq = 0
    for (const k of Object.keys(this._dropped) as PoseDropReason[]) this._dropped[k] = 0
  }

  /** 净係问「呢个位姿同而家嗰个一唔一样」，唔郁状态（driver 想先试 setPose 再认嗰阵用）。 */
  isNewPose(m: Pose16 | null | undefined): boolean {
    if (!this._enabled || !isPose16(m)) return false
    if (!this._pose) return true
    return !posesEqual(m, this._pose, this.eps)
  }

  /**
   * 收一个位姿。★ 每帧照 call ★ —— 冇变佢自己识分。
   *
   * @param nowMs     performance.now()
   * @param stepCount solver.stepCount（★ 唔係帧数 ★）
   */
  notePose(m: Pose16 | null | undefined, nowMs: number, stepCount: number): PoseTransition {
    if (!this._enabled) return { changed: false, state: this._state, needsSolverPose: false, reason: 'disabled' }
    if (!isPose16(m)) return { changed: false, state: this._state, needsSolverPose: false, reason: 'invalid' }

    // ── 第一个位姿 = 基准（solver 烘焙落去嗰个几何本身）──────────────────────
    // ★ 呢度【唔可以】reset tracker ★：初次求解正正就係喺度行紧，清咗就係无端端重头嚟过。
    // 而且 relaxUntil / deadline 蓄意钉成同 tracker 自己嗰套 ramp/maxSteps 一模一样，
    // 令「windPose 接咗线」同「windPose 未接线」两条路径喺基准姿态之下【逐个数一样】。
    if (!this._pose) {
      this._pose = Array.from({ length: 16 }, (_, i) => m[i])
      this._key = poseKey(m)
      this._lastMoveT = nowMs
      this._poseStartStep = 0
      this._settleStartStep = this.schedule.rampSteps
      this._relaxUntil = this.schedule.rampSteps           // = ramp gate 本身，唔加辣
      this._deadline = this.schedule.maxSteps              // = tracker.finished() 嘅上限，一模一样
      // _pose 係 null 嘅时候 state 一定係 'idle'（reset() 同 constructor 都咁样），所以直接踩过去
      this._state = 'settling'
      this._areaSum = 0; this._areaN = 0
      this._curEntryId = null
      // identity 就係「同烘焙嗰阵一样」→ 唔使叫 solver 郁；非 identity 就要真係摆过去
      const needs = !posesEqual(m, IDENTITY_POSE, this.eps)
      return { changed: true, state: this._state, needsSolverPose: needs, reason: 'first' }
    }

    if (posesEqual(m, this._pose, this.eps)) {
      return { changed: false, state: this._state, needsSolverPose: false, reason: 'same' }
    }

    // ── 位姿真係变咗 ★ 旧样本全部作废 ★ ──────────────────────────────────
    for (let i = 0; i < 16; i++) this._pose[i] = m[i]
    this._key = poseKey(m)
    this._lastMoveT = nowMs
    this._poseStartStep = stepCount
    if (this._state !== 'dragging') this._preDragState = this._state
    this._state = 'dragging'
    this._movedInDrag = true
    this._curEntryId = null
    this._areaSum = 0; this._areaN = 0
    this.tracker.reset()
    return { changed: true, state: this._state, needsSolverPose: true, reason: 'ok' }
  }

  /**
   * 每帧行一次：睇下拖拽停咗未（dragging → settling）。
   * ★ 一定要每帧 call ★
   *
   * @param dragFlag store 嘅 `windPoseDragging`（WindObjectGizmo 嗰边写）。
   *   · 传咗 boolean → 用【明确信号】：撳落手柄嗰刻即刻停收样本，放开嗰刻即刻入 settling
   *     （唔使等 quietMs，快 140ms 见到结果）。
   *   · 冇传（undefined，即 store 未接呢个 key）→ 退返「静咗 quietMs 就当放咗手」嘅估算。
   *   两条路都要行得通：呢个 key 由另一条 agent 落，我哋唔可以 assume 佢喺度。
   */
  tick(nowMs: number, stepCount: number, dragFlag?: boolean): PoseState {
    if (!this._enabled) return this._state
    // solver 重置咗 stepCount（例如 setPose 冇 keepFlow）→ 我哋啲绝对 step 门槛要跟住搬
    if (stepCount < this._poseStartStep) this._rebase(stepCount)

    if (dragFlag === true) {
      // 撳住手柄（就算仲未郁过）：即刻停收样本 —— 用户下一格就会郁，收到嘅都係将会作废嘅嘢
      if (this._state !== 'dragging') {
        this._preDragState = this._state
        this._movedInDrag = false
        this._state = 'dragging'
      }
      this._explicitDrag = true
      this._lastMoveT = nowMs
      return this._state
    }
    if (dragFlag === false && this._explicitDrag) {
      this._explicitDrag = false
      if (this._state === 'dragging') {
        // ★ 撳咗手柄但一格都冇郁过 → 原状返去 ★
        //   唔咁做嘅话，一次误撳就会掉咗个已经 settle 咗嘅结果，然后无端端重新 settle 一次。
        if (!this._movedInDrag) this._state = this._preDragState
        else this._enterSettling(stepCount)
      }
      return this._state
    }

    // 冇明确信号（windPoseDragging 未接线）→ 靠「静咗几耐」估
    if (!this._explicitDrag && this._state === 'dragging' && nowMs - this._lastMoveT >= this.quietMs) {
      this._enterSettling(stepCount)
    }
    return this._state
  }

  private _enterSettling(stepCount: number): void {
    this._settleStartStep = stepCount
    this._relaxUntil = stepCount + this.relaxSteps
    this._deadline = stepCount + this.settleCap
    this._state = 'settling'
    // ⚠ 呢度【唔使】再 reset tracker：notePose 已经清咗，而 dragging 期间一个样本都冇收。
  }

  private _rebase(stepCount: number): void {
    const shift = this._poseStartStep - stepCount
    this._poseStartStep = stepCount
    this._settleStartStep = Math.max(0, this._settleStartStep - shift)
    this._relaxUntil = Math.max(0, this._relaxUntil - shift)
    this._deadline = Math.max(1, this._deadline - shift)
  }

  /**
   * 收一个力样本。★ 唯一正确嘅写法係 `pc.push(solver.pollForce())` ★
   * —— null 都照 push，同 ConvergenceTracker 一样嘅道理（见 convergence.ts 文件头）。
   */
  push(s: PoseForceLike | null | undefined): PosePushOutcome {
    const no = (reason: PoseDropReason): PosePushOutcome => {
      this._dropped[reason]++
      return { accepted: false, reason, justSettled: false }
    }
    if (!s) { this.tracker.push(null); return no('empty') }        // 转交系为咗 tracker.rejected.empty 唔失真

    // ★★ idle / disabled = 位姿追踪冇上场 → 【完全 pass-through】★★
    // 呢条就係「windPose 未接线」嗰条路径（亦即係今日 WindTunnelGpu 嘅行为）：driver 而家
    // 一律写 `pc.push(solver.pollForce())`，所以呢度掉咗样本 = 基本求解永远唔会收敛。
    // reason 照报 'idle'/'disabled' 话畀 caller 知【冇做位姿记帐】，但样本本身要原封不动交落去。
    if (!this._enabled || this._state === 'idle') {
      const reason: PoseDropReason = this._enabled ? 'idle' : 'disabled'
      const pass = this.tracker.push(s)
      this._dropped[reason]++
      return { accepted: pass.accepted, reason, justSettled: false }
    }

    // ★★ 拖紧嗰阵一个样本都唔收 ★★ —— 呢句就係「唔可以攞旧姿态嘅力去撈新姿态」嘅执行点
    if (this._state === 'dragging') return no('dragging')
    // ★ 放手之后嘅流场过渡期 ★ —— 同 ramp gate 一样嘅道理：转朝向 = 一次细规模冲击启动
    if (Number.isFinite(s.step) && s.step < this._relaxUntil) return no('relax')

    const r = this.tracker.push(s)
    if (!r.accepted) return no('tracker')

    this._dropped.ok++
    if (s.frontalAreaMM2 !== undefined && Number.isFinite(s.frontalAreaMM2) && s.frontalAreaMM2 > 0) {
      this._areaSum += s.frontalAreaMM2
      this._areaN++
    }
    if (r.justConverged) {
      this._record(s.step, true)
      return { accepted: true, reason: 'ok', justSettled: true }
    }
    return { accepted: true, reason: 'ok', justSettled: false }
  }

  /**
   * 收工：把而家 tracker 嘅统计写成呢个位姿嘅记录。
   * 收敛嗰阵 push() 自己会做；呢个係畀 caller 喺【撞到 deadline 但仲未收敛】嗰阵手动 call 嘅
   * —— 咁样张表上面就会有一行标住 `converged: false` 嘅记录，而唔係静静鸡当冇发生过。
   */
  finalize(stepCount: number): PoseEntry | null {
    if (!this._enabled || this._state === 'idle') return null
    if (this._state === 'dragging') return null
    if (this._curEntryId !== null) return this._entries.find((e) => e.id === this._curEntryId) ?? null
    return this._record(stepCount, this.tracker.converged)
  }

  private _record(atStep: number, converged: boolean): PoseEntry {
    const st = this.tracker.stats()
    const area = this._areaN > 0 ? this._areaSum / this._areaN : 0
    const pose = this._pose ? this._pose.slice() : IDENTITY_POSE.slice()
    const entry: PoseEntry = {
      id: ++this._seq,
      key: this._key,
      label: poseLabel(pose),
      pose,
      cd: st.cd,
      cdSigned: st.cdSigned,
      cdOsc: st.cdOsc,
      areaMM2: area,
      dragArea: st.cd * area,
      converged,
      samples: st.samples,
      spread: st.spread,
      atStep: Number.isFinite(atStep) ? atStep : -1,
      cdBasis: st.cdBasis ?? GPU_CD_BASIS,
    }
    this._entries.push(entry)
    this._curEntryId = entry.id
    if (this._refId === null) this._refId = entry.id
    this._trim()
    this._state = 'settled'
    return entry
  }

  /** 参考位姿永远留低（成张表就係相对佢嚟讲嘅），其余踢最旧。 */
  private _trim(): void {
    while (this._entries.length > this.maxEntries) {
      const i = this._entries.findIndex((e) => e.id !== this._refId)
      if (i < 0) break
      this._entries.splice(i, 1)
    }
  }

  /** 改参考位姿（面板「以呢个为基准」）。 */
  setReference(id: number): boolean {
    if (!this._entries.some((e) => e.id === id)) return false
    this._refId = id
    return true
  }

  /** 行完未（★ 唔可以用 tracker.finished(stepCount) ★ —— 见下面注释）。 */
  finished(stepCount: number): boolean {
    if (!this._enabled || this._state === 'idle') {
      // 未追踪位姿 = 现有路径，照 tracker 嗰把尺（逐个数唔变）
      return this.tracker.finished(stepCount)
    }
    if (this._state === 'settled') return true
    if (this._state === 'dragging') return false
    // ★★ 呢度就係 keepFlow 嘅陷阱 ★★
    // setPose(m, {keepFlow:true}) 之后 solver.stepCount 係【继续数落去】嘅全局计数器。
    // tracker.finished() 嘅上限係 schedule.maxSteps（一个绝对数），第一次求解行完就已经贴住顶。
    // 照用嘅话，第二个位姿一开始就即刻「行完」→ driver 会攞住零个样本嘅 stats 出报告。
    // 所以每个位姿要有自己嘅 deadline，由佢 settle 开始嗰刻计。
    return this.tracker.converged || stepCount >= this._deadline
  }

  /** 呢个位姿係咪 settle 唔到（撞到 deadline 都未收敛）。 */
  timedOut(stepCount: number): boolean {
    if (!this._enabled || this._state !== 'settling') return false
    return !this.tracker.converged && stepCount >= this._deadline
  }

  progress(stepCount: number): number {
    if (!this._enabled || this._state === 'idle') return this.tracker.progress(stepCount)
    if (this._state === 'settled') return 1
    if (this._state === 'dragging') return 0
    const span = Math.max(1, this._deadline - this._settleStartStep)
    return Math.max(0, Math.min(1, (stepCount - this._settleStartStep) / span))
  }

  /**
   * ★★ UI 唯一应该问嘅嘢 ★★
   *
   * 过渡态（idle / dragging / settling）攞到嘅係一个【冇任何数字栏位】嘅对象 ——
   * 唔係「一个可能唔准嘅数」，係型别上根本冇得攞。咁 UI 就冇得「顺手」显示佢。
   */
  readout(stepCount: number): PoseReadout {
    if (!this._enabled) {
      return {
        trusted: false, state: 'idle',
        reason: this._disabledReason || '位姿追踪已停用',
        progress: 0, samples: this.tracker.samples, note: POSE_UNSETTLED_NOTE,
      }
    }
    if (this._state === 'settled') {
      const entry = this._entries.find((e) => e.id === this._curEntryId)
      if (entry) return { trusted: true, state: 'settled', entry, table: this.compare(), note: POSE_COMPARE_NOTE }
      // 理论上到唔到呢度（settled 一定有 entry）；到咗就老实报未可信，唔好靠估
      return {
        trusted: false, state: 'settling', reason: '已 settle 但搵唔返记录',
        progress: 1, samples: this.tracker.samples, note: POSE_UNSETTLED_NOTE,
      }
    }
    const reason = this._state === 'dragging'
      ? '拖拽中：位姿仲喺度郁，一个样本都冇收'
      : this._state === 'settling'
        ? (stepCount < this._relaxUntil
          ? `流场过渡期（仲要 ${Math.max(0, Math.round(this._relaxUntil - stepCount))} substep 先开始收样本）`
          : `流场重建中：已收 ${this.tracker.samples} 个样本，未够 / 未收敛`)
        : '未追踪位姿'
    return {
      trusted: false,
      state: this._state as 'idle' | 'dragging' | 'settling',
      reason,
      progress: this.progress(stepCount),
      samples: this.tracker.samples,
      note: POSE_UNSETTLED_NOTE,
    }
  }

  /**
   * 对比表。★ 卖点係 dragDeltaPct，唔係 cd ★
   *
   * 常数系统增益 k 喺 cdRatio / dragRatio 两个比值入面都会消掉 —— 呢个就係点解
   * 「呢个朝向阻力细 12%」而家讲得，而「Cd = 0.47」讲唔得。
   */
  compare(): PoseCompareTable {
    const ref = this._refId === null ? null : this._entries.find((e) => e.id === this._refId) ?? null
    const refCd = ref ? Math.abs(ref.cd) : 0
    const refDA = ref ? Math.abs(ref.dragArea) : 0
    const refOscPct = ref && refCd > 0 ? Math.abs(ref.cdOsc) / refCd * 100 : 0
    const rows = this._entries.map((e): PoseCompareRow => {
      const cdRatio = refCd > 0 ? e.cd / refCd : NaN
      const dragRatio = refDA > 0 ? e.dragArea / refDA : NaN
      const oscPct = Math.abs(e.cd) > 0 ? Math.abs(e.cdOsc) / Math.abs(e.cd) * 100 : 0
      const noisePct = oscPct + refOscPct
      const dragDeltaPct = (dragRatio - 1) * 100
      return {
        id: e.id,
        label: e.label,
        isReference: e.id === this._refId,
        cd: e.cd,
        areaMM2: e.areaMM2,
        dragArea: e.dragArea,
        cdRatio,
        cdDeltaPct: (cdRatio - 1) * 100,
        dragRatio,
        dragDeltaPct,
        noisePct,
        // 参考行同自己比一定係 0%，唔可以叫做「有意义嘅差异」
        significant: e.id !== this._refId && Number.isFinite(dragDeltaPct) && Math.abs(dragDeltaPct) > noisePct,
        converged: e.converged,
        samples: e.samples,
      }
    })
    return {
      referenceId: this._refId,
      rows,
      absoluteUsable: GPU_CD_ABSOLUTE_TRUSTWORTHY,      // ★ 永远 false ★
      note: POSE_COMPARE_NOTE,
      areaNote: POSE_AREA_NOTE,
      gainRange: GPU_CD_GAIN_RANGE,
    }
  }

  /**
   * 一行字嘅结论（status bar 用）。★ 冇绝对 Cd ★
   * 返 null = 而家冇嘢好讲（未 settle / 得一个位姿）。
   */
  compareLine(): string | null {
    if (this._state !== 'settled') return null
    const t = this.compare()
    const cur = t.rows.find((r) => r.id === this._curEntryId)
    if (!cur || cur.isReference || !Number.isFinite(cur.dragDeltaPct)) return null
    const sign = cur.dragDeltaPct <= 0 ? '−' : '+'
    const mag = Math.abs(cur.dragDeltaPct).toFixed(1)
    const verdict = cur.significant
      ? (cur.dragDeltaPct < 0 ? '阻力细咗' : '阻力大咗')
      : '同参考分唔到（差异细过涡脱落噪声）'
    const tail = cur.significant ? `${sign}${mag}%` : `${sign}${mag}% vs 噪声底 ±${cur.noisePct.toFixed(1)}%`
    return `位姿 #${cur.id}（${cur.label}）vs 参考 #${t.referenceId}：${verdict} ${tail}`
      + (cur.converged ? '' : '（★ 未收敛，呢个数唔好用 ★）')
  }
}

/* ══════════════════════════════════ UI 转接（WindPoseCompare.tsx 嘅 store 形状） */

/**
 * `WindPoseCompare.tsx` 张浮卡读嘅 `store.windPoseCompare` 一行嘅形状。
 *
 * ⚠ 呢个 interface 係【另一条 agent 定嘅】（src/components/WindPoseCompare.tsx 嘅 WindPoseRecord），
 *   呢度只係逐字 mirror 佢，方便接线一句过。佢改咗嘅话呢度要跟。
 */
export interface WindPoseRecordLike {
  /** ★ 佢要 string ★（React key）—— 我哋嘅 PoseEntry.id 係 number，所以要转 */
  id: string
  label?: string
  isReference?: boolean
  frontalAreaMM2?: number
  dragRatio?: number
  deltaPct?: number
}

/**
 * 把对比表转成张浮卡食得落嘅形状。
 *
 * ★ 蓄意【唔】填 dragN ★
 * ─────────────────────
 * `WindPoseRecord` 有个 optional `dragN`，而张卡自己写住「只用嚟算比值，本身唔直接显示」。
 * 但我哋手上嗰个绝对阻力带住实测 2.0–2.2× 嘅系统增益 —— 一旦摆咗落 store，第日边个
 * 手痕加一栏就即刻变咗「显示一个错足一倍嘅牛顿数」。既然我哋已经算好 dragRatio / deltaPct
 * （张卡会优先用），就唔好畀嗰个绝对数有机会流出去。呢个係一个【蓄意嘅缺栏】，唔係漏咗。
 */
export function toWindPoseRecords(table: PoseCompareTable): WindPoseRecordLike[] {
  return table.rows.map((r) => ({
    id: 'pose-' + r.id,
    label: r.label,
    isReference: r.isReference,
    frontalAreaMM2: Number.isFinite(r.areaMM2) && r.areaMM2 > 0 ? r.areaMM2 : undefined,
    dragRatio: Number.isFinite(r.dragRatio) ? r.dragRatio : undefined,
    deltaPct: Number.isFinite(r.dragDeltaPct) ? r.dragDeltaPct : undefined,
  }))
}
