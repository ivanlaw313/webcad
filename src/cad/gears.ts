// 齿轮传动纯数学模块（gearbox designer 嘅大脑）— 净系做数：齿数配比搜索、中心距、啮合相位、Feature 样板。
// 无 store / 无 worker / 无 UI 依赖（import type 唔算），node tsx 直接跑得 → tests/gears.test.mjs 全解析验证。
//
// 约定（同 worker 一致）：
//   ratio（减速比）= zOut/zIn（从动齿 ÷ 主动齿），减速 > 1；加速由 caller 自己倒数再调用。
//   分度圆半径 rp = m·z/2；齿顶圆半径 ra = m·(z+2)/2；中心距 cd = m(z1+z2)/2（标准齿、无变位）。
//   gearProfile2D 齿#0 喺 +X 轴正中，phase 系【度】，逆时针转 profile。

import type { Feature } from '../worker/cad.worker'

// Feature 联合体抽成员 — 起 literal 时有齐 optional 字段提示，又唔使 as-cast。
type GearF = Extract<Feature, { type: 'gear' }>
type WormF = Extract<Feature, { type: 'worm' }>
type CrownF = Extract<Feature, { type: 'crowngear' }>
type ExtrudeF = Extract<Feature, { type: 'extrude' }>

export interface GearStage { zIn: number; zOut: number }   // 主动:从动 — stage ratio = zOut/zIn（减速 >1）
export interface GearTrainPlan {
  stages: GearStage[]
  achieved: number          // ∏ zOut/zIn（左折叠连乘 — 测试按同样次序重算须严格相等）
  errPct: number            // |achieved−target|/target×100
  cds: number[]             // 每级中心距 m(zIn+zOut)/2
  totalWidth: number        // 直排总跨度估算：Σcd + 首末齿顶圆半径（ra = m(z+2)/2）
  ok: boolean               // #94：errPct ≤ GEARTRAIN_ERR_TOL 先算达标；false = caller 应拒绝/警告，唔好当成功 GM-L2
  maxReach: number          // #94：n 级理论最大可达比 =(zMax/zMin)^n — 目标超过即注定达唔到，用嚟解释点解未达标
  warning?: string          // #94：未达标嘅诚实提示（含最大可达倍数 + 建议加级数）；达标时 undefined
}

// ── 基础公式 ──────────────────────────────────────────────────────────────

/** 标准中心距 cd = m(z1+z2)/2（无变位）。 */
export function centerDistance(m: number, z1: number, z2: number): number {
  return (m * (z1 + z2)) / 2
}

/** 从动轮啮合相位（度）：两轮中心连线沿 +X 时，主动轮齿#0 对正 +X（齿对齿），
 *  从动轮要 z 偶 → 转半个齿距 180/z 先齿对槽；z 奇 → 0（−X 方向天然就系齿槽）。 */
export function meshPhase(z: number): number {
  return z % 2 === 0 ? 180 / z : 0
}

const ZMIN_DEF = 12, ZMAX_DEF = 120
const TIE_EPS = 1e-12      // 比例误差打和阈值 — 之内先入 tie-break
export const GEARTRAIN_ERR_TOL = 5  // #94：errPct 超此(%)即判未达标（ok=false）— 指定级数唔够达标时唔好当成功 GM-L2

function gcd(a: number, b: number): number {
  while (b) { const t = a % b; a = b; b = t }
  return a
}

// ── 配比搜索 ──────────────────────────────────────────────────────────────

/** 单级穷举：搵 z2/z1 最贴 ratio 嘅一对。win 有值 → z2 限喺 [z1·ratio·(1−win), z1·ratio·(1+win)]
 *  窗口（greedy 中间级用 ±40%），undefined → 全范围。
 *  打和：① z1+z2 细者 ② gcd(z1,z2)===1 优先（hunting tooth — 磨损均匀）。 */
function bestPair(ratio: number, zMin: number, zMax: number, win?: number): GearStage {
  let bz1 = zMin, bz2 = zMin, bErr = Infinity, bSum = Infinity, bCop = false
  for (let z1 = zMin; z1 <= zMax; z1++) {
    let lo = zMin, hi = zMax
    if (win !== undefined) {
      lo = Math.max(zMin, Math.ceil(z1 * ratio * (1 - win)))
      hi = Math.min(zMax, Math.floor(z1 * ratio * (1 + win)))
    }
    for (let z2 = lo; z2 <= hi; z2++) {
      const err = Math.abs(z2 / z1 - ratio)
      const d = err - bErr
      if (d < -TIE_EPS) {
        // 严格更准 → 直接取
      } else if (d <= TIE_EPS) {
        // 打和 → 齿数总和细者；再和 → 互质（hunting tooth）赢
        const sum = z1 + z2
        if (sum > bSum) continue
        if (sum === bSum && !(gcd(z1, z2) === 1 && !bCop)) continue
      } else continue
      bErr = err; bz1 = z1; bz2 = z2; bSum = z1 + z2; bCop = gcd(z1, z2) === 1
    }
  }
  return { zIn: bz1, zOut: bz2 }
}

/** 齿轮系配比建议：target（≥1，clamp 到 [1,10000]）→ n 级 zIn:zOut 方案。
 *  级数：opts.stages>0 即指定（封顶 4）；0/undefined 自动 —— 单级误差 ≤0.5% 且 target ≤ zMax/zMin
 *  就一级搞掂，否则取最细 n 令 target^(1/n) ≤ zMax/zMin（封顶 4；单级唔够准就最少两级）。
 *  多级：逐级 greedy 贴住 r = remaining^(1/剩余级数)（±40% 窗口），最尾一级全范围穷举打磨总误差 ——
 *  remaining 系精确传落去，所以最终 errPct = 尾级分数逼近误差，一般 ≪0.5%。 */
export function suggestGearTrain(target: number, m: number, opts?: { stages?: number; zMin?: number; zMax?: number }): GearTrainPlan {
  const zMin = Math.max(4, Math.round(opts?.zMin ?? ZMIN_DEF))
  const zMax = Math.max(zMin + 1, Math.round(opts?.zMax ?? ZMAX_DEF))
  const t = Math.min(10000, Math.max(1, target))
  const rMax = zMax / zMin                      // 单级最大可达比

  // 级数决策
  let n = 0
  let singleStage: GearStage | null = null
  const want = opts?.stages ?? 0
  if (want > 0) {
    n = Math.min(4, Math.max(1, Math.round(want)))
  } else {
    if (t <= rMax + 1e-9) {
      singleStage = bestPair(t, zMin, zMax)
      const e = (Math.abs(singleStage.zOut / singleStage.zIn - t) / t) * 100
      if (e <= 0.5) n = 1                       // 单级够准 → 收工
    }
    if (n === 0) {
      n = 1
      while (n < 4 && Math.pow(t, 1 / n) > rMax + 1e-9) n++
      if (n === 1) n = 2                        // 单级试过唔够准 → 最少两级
    }
  }

  // 逐级搜索
  const stages: GearStage[] = []
  if (n === 1) {
    stages.push(singleStage ?? bestPair(t, zMin, zMax))
  } else {
    let prod = 1
    for (let i = 0; i < n - 1; i++) {
      const left = n - i
      const remaining = t / prod
      // 每级种子比 r = remaining^(1/剩余级数)，clamp 到可行带先开窗
      const r = Math.min(Math.max(Math.pow(Math.max(remaining, 1e-9), 1 / left), zMin / zMax), rMax)
      const st = bestPair(r, zMin, zMax, 0.4)
      stages.push(st)
      prod *= st.zOut / st.zIn
    }
    // 收尾打磨：最后一级全范围穷举，将【总】误差砸到最细（等价最贴 remaining）
    stages.push(bestPair(t / prod, zMin, zMax))
  }

  // 汇总（achieved 用左折叠连乘 — 测试同次序重算须 === 相等）
  let achieved = 1
  for (const s of stages) achieved *= s.zOut / s.zIn
  const cds = stages.map((s) => centerDistance(m, s.zIn, s.zOut))
  const raFirst = (m * (stages[0].zIn + 2)) / 2
  const raLast = (m * (stages[stages.length - 1].zOut + 2)) / 2
  // #94：达标判定 — errPct 超阈 → ok:false + warning，caller 唔好当成功。maxReach = n 级理论上限，解释点解达唔到。
  const errPct = (Math.abs(achieved - t) / t) * 100
  const maxReach = Math.pow(rMax, n)
  const ok = errPct <= GEARTRAIN_ERR_TOL
  const warning = ok ? undefined
    : `${n} 级最多约 ${maxReach >= 100 ? maxReach.toFixed(0) : maxReach.toFixed(1)} 倍，目标 ${t} 倍达唔到（实得 ${achieved.toFixed(2)}，误差 ${errPct.toFixed(1)}%）— 请加级数`
  return {
    stages,
    achieved,
    errPct,
    cds,
    totalWidth: cds.reduce((a, b) => a + b, 0) + raFirst + raLast,
    ok,
    maxReach,
    warning,
  }
}

// ── Feature 样板 ──────────────────────────────────────────────────────────
// id 用模块计数器 — 呢啲 Feature 唔入正式时间轴，净系畀 cad.rebuild scratch build，单次调用内唯一就够。
let _gid = 0
const gid = () => 'gx' + ++_gid

/** 直齿/斜齿轮 Feature（worker 'gear'）：phase=度（gearProfile2D 齿#0 喺 +X），helix=螺旋角 β°（正=右旋）。 */
export function gearFeature(m: number, z: number, th: number, bore: number, opts?: { phase?: number; helix?: number }): Feature {
  const f: GearF = { id: gid(), type: 'gear', module: m, teeth: z, thickness: th, bore }
  if (opts?.phase !== undefined) f.phase = opts.phase
  if (opts?.helix !== undefined) f.helix = opts.helix
  return f
}

/** 蜗杆 Feature（worker 'worm'，ZA 近似，q=8 惯例）：starts=头数，啮合比 = z_wheel/starts。 */
export function wormFeature(m: number, starts: number, length: number): Feature {
  const f: WormF = { id: gid(), type: 'worm', module: m, starts, length }
  return f
}

/** #90 蜗杆诚实标记：本模块【只造蜗杆本体】，从不生成配对蜗轮几何，亦无运动连接。 GM-L2 */
export const WORM_NO_WHEEL_NOTE = '仅蜗杆（无蜗轮配对）'
export interface WormBuild {
  feature: Feature                       // 蜗杆本体 Feature（同 wormFeature 一致）
  hasWheel: false                        // 恒 false — 本模块无配套蜗轮生成器
  status: string                         // 诚实状态串（含「仅蜗杆（无蜗轮配对）」）— UI 直接显示，杜绝「做到蜗杆蜗轮传动」嘅误会
  meshRatio: (zWheel: number) => number  // 传动比 = zWheel/starts —— 纯运动学参考数，并无对应蜗轮几何
}
/** 蜗杆生成（带诚实元数据）：造一条蜗杆，并明确声明「仅蜗杆（无蜗轮配对）」，
 *  防止 UI 令用户误以为做到蜗杆-蜗轮减速传动。meshRatio 只系纯运动学参考，无实际蜗轮落地。 */
export function wormBuild(m: number, starts: number, length: number): WormBuild {
  const s = Math.max(1, Math.round(starts))
  return {
    feature: wormFeature(m, s, length),
    hasWheel: false,
    status: `蜗杆 m${m} ${s}头 × 长${length}（ZA 近似形）— ${WORM_NO_WHEEL_NOTE}；传动比 = 蜗轮齿数:${s}（纯运动学参考，本模块不生成蜗轮）`,
    meshRatio: (zWheel: number) => zWheel / s,
  }
}

/** 冠齿轮 Feature（worker 'crowngear'，面齿轮近似形）：垂直轴啮合纯运动学。 */
export function crownFeature(m: number, z: number, discH: number, faceW: number, bore: number): Feature {
  const f: CrownF = { id: gid(), type: 'crowngear', module: m, teeth: z, discH, faceW, bore }
  return f
}

/** #93 内齿圈齿廓侧隙 → 负形齿轮嘅【相位偏摆角】(度)。
 *  侧隙 j（分度圆弧长 mm）= 齿空左右各让 j/2；负形齿轮分 ±δ 两刀并挖 → 齿空共加宽 2·rp·δ = j。
 *  ⇒ δ(rad)=j/(2·rp)=j/(m·z)，δ(deg)=j·180/(π·m·z)，rp=m·z/2 分度圆半径。非法输入 →0。 GM-L2 */
export function backlashPhaseDeg(m: number, z: number, backlash: number): number {
  if (!(backlash > 0) || !(m > 0) || !(z > 0)) return 0
  return (backlash * 180) / (Math.PI * m * z)
}

/** 内齿圈（环齿轮）= 圆盘 extrude + 外齿轮负形 cut — 照抄 store loadSample 'gearring' 样板：
 *  盘外半径 = 齿顶圆 ra + rimW，齿轮 cut 厚过盘 4mm 保证切穿。
 *  #93 侧隙 backlash（默认 0.05·m）> 0 → 负形齿轮分 ±δ 两刀并挖出【加宽齿空】，同配对外齿轮啮合先有间隙、
 *  唔会零间隙互锁；分度圆侧隙 = rp·(φ_hi−φ_lo)·π/180 = backlash。backlash ≤ 0 → 退回单刀零侧隙老样式（byte-compat）。
 *  最尾元素必定系 op:'cut' bore:0 嘅 gear。 */
export function internalGearFeatures(m: number, z: number, th: number, rimW: number, backlash: number = 0.05 * m): Feature[] {
  const rTip = (m * z) / 2 + m              // 外齿轮齿顶圆半径 ra = m(z+2)/2
  const rRim = rTip + rimW
  const disk: ExtrudeF = { id: gid(), type: 'extrude', profile: { kind: 'circle', c: [0, 0], r: rRim }, height: th, operation: 'new' }
  const delta = backlashPhaseDeg(m, z, backlash)
  if (delta <= 0) {
    const cut: GearF = { id: gid(), type: 'gear', module: m, teeth: z, thickness: th + 4, bore: 0, op: 'cut' }
    return [disk, cut]
  }
  // ±δ 两刀并挖：每侧齿空各让 rp·δ，合共 backlash 侧隙（负形齿廓 phase 偏摆 ∓δ / ±δ）
  const cutLo: GearF = { id: gid(), type: 'gear', module: m, teeth: z, thickness: th + 4, bore: 0, op: 'cut', phase: -delta }
  const cutHi: GearF = { id: gid(), type: 'gear', module: m, teeth: z, thickness: th + 4, bore: 0, op: 'cut', phase: delta }
  return [disk, cutLo, cutHi]
}
