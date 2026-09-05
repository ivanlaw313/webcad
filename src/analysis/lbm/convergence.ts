// convergence.ts —— GPU 风洞嘅「几时收敛」同「一帧行几多步」。
//
// ★★ 呢个档案【零 import】★★
// ────────────────────────
// 冇 three、冇 GL、冇 store、冇 React。两个原因：
//
//  ① 收敛判定係我哋同 CPU 求解器【唯一】共用嘅一把尺。两个引擎嘅碰撞算子、边界条件、
//     阻力定义全部唔同（见 CD_COMPARE_NOTE），所以「收敛」呢件事至少要用同一条准则去讲，
//     否则连「GPU 收敛得快啲」都变咗一句冇意义嘅话。
//  ② 呢啲逻辑一定要 headless 验得到。`node --experimental-strip-types` 解唔到 .tsx（JSX 唔会
//     畀 strip 掉），所以凡係要单元测试嘅纯数学，唔可以住喺 WindTunnelGpu.tsx 入面 ——
//     包括下面个 substepBudget()。呢个就係佢点解喺呢度嘅原因。
//
//
// ★★ 采样【只可以】由 pollForce() 非 null 驱动 ★★
// ───────────────────────────────────────────
// GPU 嘅力係经 PBO + fenceSync 迟一两帧先攞到嘅（见 asyncReader.ts）。如果用帧计数器采样：
//
//   · 一帧冇新数字 → 会把【上一次】嗰个 Cd 再塞入收敛窗口一次；
//   · 十帧塞十次同一个数 → (max−min)/|mean| = 0 → 窗口即刻「收敛」；
//   · 而个力本身係非定常嘅（钝体涡脱落），咁样量到嘅係帧率抖动，唔係物理。
//
// 所以 push() 只收一个【ForceLike | null】—— null 就係「今帧冇嘢」，直接掉。仲要加两道闸：
// 单调 substep 戳（step 唔可以倒退或者重复）+ 最少 SAMPLE_EVERY 步间距（同 CPU 一样係 20）。
// 间距唔係装饰：相邻两步嘅 Cd 高度相关，采得密就会「收敛」得早，两个引擎就冇得比。

/* ════════════════════════════════════════════ 常数（逐个由 windtunnel.ts 抄过嚟） */

/** 收敛窗口大细（windtunnel.ts:284 `samples.slice(-10)`） */
export const CONV_WINDOW = 10
/** 收敛阈值（windtunnel.ts:287 `< 0.012`） */
export const CONV_TOL = 0.012
/** 未够呢个数嘅样本连试都唔试（windtunnel.ts:283 `samples.length >= 12`） */
export const CONV_MIN_SAMPLES = 12
/** 采样最小间距（windtunnel.ts:279 `step % 20 === 0`） */
export const SAMPLE_EVERY = 20
/** 末段时均嘅比例（windtunnel.ts:294） */
export const TAIL_FRAC = 0.25
/** 末段最少几多个样本（windtunnel.ts:294 `Math.max(6, …)`） */
export const TAIL_MIN = 6
/**
 * 环形缓冲容量。
 * 一次跑最多 (maxSteps / SAMPLE_EVERY) 个样本 —— 最大域（DX=160、u_lb=0.05）都只係 ~900 个，
 * 所以实际上永远唔会绕圈。留个上限係为咗「live 模式行足一晚」嗰个 case 唔会无限长大。
 * ⚠ 真係绕咗圈嘅话，末段 25% 仍然啱（尾巴永远喺度），但 samples 计数会封顶 → tailN 亦封顶。
 */
export const RING_CAPACITY = 4096

/* ════════════════════════════════════════════════════════ 诚实：两个 Cd 唔同基准 */

export type CdBasis = 'momentum-exchange' | 'pressure-integral+friction'

/** GPU 引擎：阻力 = 边界 link 上面嘅动量交换（唔含任何经验摩擦项）。 */
export const GPU_CD_BASIS: CdBasis = 'momentum-exchange'
/** CPU 引擎：形阻 = 压力场积分（真解），摩擦 = 平板 Cf 经验补（趋势项）。 */
export const CPU_CD_BASIS: CdBasis = 'pressure-integral+friction'

export const CD_BASIS_LABEL: Record<CdBasis, string> = {
  'momentum-exchange': '动量交换（边界 link 直接求和，唔含经验摩擦项）',
  'pressure-integral+friction': '压力积分形阻 + 平板 Cf 经验摩擦项',
}

/**
 * ★ 面板必须原文显示呢句 ★
 *
 * 唔係客套话：两个引擎嘅碰撞算子（BGK+LES vs TRT+LES）、格子速度（0.1 vs 0.05）、
 * 边界条件（自由流六面 vs 入口 Guo NEEM＋出口 sponge＋侧壁镜面）、同埋阻力定义
 * （压力积分＋摩擦经验项 vs 纯动量交换）四样嘢係一齐变嘅。冇一个时刻可以宣布
 * 「新嗰个啱咗」—— 所以过渡期两个数并排摆，由用户自己睇。
 */
export const CD_COMPARE_NOTE =
  '⚠ GPU 引擎同 CPU 引擎嘅 Cd【唔可以直接比】：碰撞算子（TRT+LES vs BGK+LES）、格子速度（0.05 vs 0.10）、'
  + '边界条件、同阻力定义（纯动量交换 vs 压力积分＋经验摩擦项）四样一齐变咗，钝体上典型差 10–30%。'
  + '各自引擎【内部】嘅相对比较（钝体 vs 流线型 / 唔同朝向）先至可信。'

/* ════════════════════════════════════════════════════════════════ 渐升 / 排程 */

/**
 * 入口余弦渐升系数 0 → 1。
 *
 * ★ 一定要同 lbmGpu.inletRamp() / windtunnel.ts:277 逐字一样 ★ —— 呢度唔係另一个实现，
 * 係「畀采样器同 UI 用嘅同一条式」（tests/lbm-stage6.test.mjs 有一条测试逐点比对两者）。
 * 冲击启动会喺入口平面射一道压力波落成条流道，而嗰道波会喺 Cd 上面留低一段冇物理意义嘅超调；
 * 收敛判定必须等佢行完先开始。
 *
 * ⚠ step 係一个由 0 数起嘅 substep 计数器，唔会係负数 —— 所以呢度【冇】负数守卫，
 *   加咗就同 lbmGpu.inletRamp 唔一致，而「两条式一样」先係呢个 function 存在嘅意义。
 */
export function rampFactor(step: number, rampSteps: number): number {
  if (!(rampSteps > 0)) return 1
  if (step >= rampSteps) return 1
  return 0.5 * (1 - Math.cos(Math.PI * step / rampSteps))
}

export interface Schedule {
  /** 余弦渐升步数；未行完嘅 Cd 一律唔收 */
  rampSteps: number
  /** 最早可以宣布收敛嘅 substep（windtunnel.ts:271） */
  minSteps: number
  /** 硬上限：行到呢度仲未收敛就【报未收敛】，唔可以扮收敛（windtunnel.ts:270） */
  maxSteps: number
}

export interface ScheduleOptions {
  /** 求解器已经算好嘅 rampSteps（LbmGpu.report().flow.rampSteps）—— 有就直接用，唔好再估一次 */
  rampSteps?: number
  /** 冇畀 rampSteps 嗰阵嘅下限。CPU 係 150、GPU（lbmGpu.RAMP_MIN_STEPS）係 200。 */
  rampMin?: number
  /** 收敛上限嘅额外步数封顶。缺省 = 6000 × (0.1 / uLb)，即係同 CPU【一样长嘅物理时间】 */
  extraCap?: number
}

/**
 * 由域长同格子速度推排程。
 *
 * ⚠ 点解 extraCap 要按 uLb 缩放：windtunnel.ts 嗰个 6000 係喺 U_LB = 0.1 度调出嚟嘅【墙上时钟】护栏。
 *   GPU 用 u_lb = 0.05（Ma 0.087，精度赢面），同一段物理时间要行【双倍】substep。照搬 6000 落去，
 *   大域会喺 minSteps 之后得返一两个采样窗口就撞顶 —— 咁个「未收敛」标签就唔係物理，係单位换算错。
 */
export function planSchedule(DX: number, uLb: number, opts: ScheduleOptions = {}): Schedule {
  const dx = Number.isFinite(DX) && DX > 0 ? DX : 1
  const u = Number.isFinite(uLb) && uLb > 0 ? uLb : 0.05
  const rampSteps = Math.max(0, Math.round(
    opts.rampSteps !== undefined && Number.isFinite(opts.rampSteps)
      ? opts.rampSteps
      : Math.max(opts.rampMin ?? 200, Math.round(0.6 * dx / u)),
  ))
  const cap = Math.round(opts.extraCap !== undefined && Number.isFinite(opts.extraCap) ? opts.extraCap : 6000 * 0.1 / u)
  const extra = Math.min(cap, Math.max(1500, Math.round(4.5 * dx / u)))
  return {
    rampSteps,
    minSteps: rampSteps + Math.round(1.8 * dx / u),
    maxSteps: rampSteps + extra,
  }
}

/* ════════════════════════════════════════════════════════════════ 采样器 */

/** LbmGpu.pollForce() 还嘅嘢（只用得着呢几个 field，所以结构化咁收）。 */
export interface ForceLike {
  cd: number
  /** 取样嗰阵已经行咗几多 substep —— ★ 单调，而且係物理时间，唔係帧数 ★ */
  step: number
  rampDone?: boolean
  /** 反弹 link 数。0 = 条流根本掂唔到零件 → Cd 冇意义 */
  links?: number
}

export type PushReason =
  | 'ok'         // 收咗
  | 'empty'      // pollForce() 还 null：今帧冇新数字（★ 正常，唔係错 ★）
  | 'ramp'       // 渐升未行完
  | 'stale'      // substep 戳倒退或者重复 → 同一个数唔可以入两次
  | 'tooSoon'    // 距上一个样本唔够 SAMPLE_EVERY 步
  | 'noLinks'    // 一条反弹 link 都冇：条流掂唔到零件
  | 'nonFinite'  // NaN / Inf
  | 'done'       // 已经收敛 / 已经封顶

export interface PushOutcome {
  accepted: boolean
  reason: PushReason
  /** 呢一次 push 令佢由「未收敛」变成「收敛」 */
  justConverged: boolean
}

export interface ConvStats {
  converged: boolean
  /** 宣布收敛嗰个样本嘅 substep 戳；未收敛 = -1 */
  convergedAtStep: number
  /** ★ 同 CPU 一样：收敛之后 steps = 该样本 + 1 ★（windtunnel.ts:287 个 `step++`） */
  steps: number
  /** 收到几多个样本（唔係帧数） */
  samples: number
  /** 最后一个收咗嘅样本嘅 substep 戳 */
  lastStep: number
  /** 末段 25% 时均 Cd（★ 同 CPU 一样取绝对值 ★，见 cdSigned） */
  cd: number
  /** 唔取绝对值嘅同一个数。★ 动量交换符号反咗嘅 bug 唔可以畀 Math.abs() 藏起 ★ */
  cdSigned: number
  /** 涡脱落振荡幅值 ±(max−min)/2（末段窗口内） */
  cdOsc: number
  /** 末段用咗几多个样本 */
  tailN: number
  /** 最近一个 10-样本窗口嘅 (max−min)/|mean|；细过 CONV_TOL 就係收敛（未够样本 = NaN） */
  spread: number
  /** Cd 係点量出嚟嘅 —— 面板一定要显示，唔可以净係畀个数字 */
  cdBasis: CdBasis
}

export interface TrackerOptions extends Schedule {
  window?: number
  tol?: number
  minSamples?: number
  sampleEvery?: number
  tailFrac?: number
  tailMin?: number
  capacity?: number
  cdBasis?: CdBasis
}

/**
 * 收敛采样器 —— windtunnel.ts:274-299 嘅逐条搬迁。
 *
 * 用法（★ 唯一正确嘅用法 ★）：
 *
 *     const t = new ConvergenceTracker(planSchedule(dom.DX, U_LB, { rampSteps: flow.rampSteps }))
 *     …每帧…
 *     solver.advance()
 *     t.push(solver.pollForce())        // ← null 都照 push，佢会自己分辨
 *     if (t.finished(solver.stepCount)) publish(t.stats())
 */
export class ConvergenceTracker {
  readonly schedule: Schedule
  readonly window: number
  readonly tol: number
  readonly minSamples: number
  readonly sampleEvery: number
  readonly tailFrac: number
  readonly tailMin: number
  readonly capacity: number
  readonly cdBasis: CdBasis

  /** 环形缓冲 —— 逐帧 new 数组係 GC 压力，而我哋係喺 render loop 入面行 */
  private ring: Float64Array
  private head = 0
  private count = 0
  private _lastStep = -1
  private _converged = false
  private _convergedAt = -1
  private _spread = NaN
  /** 统计：畀诊断用，唔参与判定 */
  private _rejected: Record<PushReason, number>

  constructor(opts: TrackerOptions) {
    this.schedule = { rampSteps: opts.rampSteps, minSteps: opts.minSteps, maxSteps: opts.maxSteps }
    this.window = Math.max(2, Math.round(opts.window ?? CONV_WINDOW))
    this.tol = opts.tol ?? CONV_TOL
    this.minSamples = Math.max(this.window, Math.round(opts.minSamples ?? CONV_MIN_SAMPLES))
    this.sampleEvery = Math.max(1, Math.round(opts.sampleEvery ?? SAMPLE_EVERY))
    this.tailFrac = opts.tailFrac ?? TAIL_FRAC
    this.tailMin = Math.max(1, Math.round(opts.tailMin ?? TAIL_MIN))
    this.capacity = Math.max(this.window, Math.round(opts.capacity ?? RING_CAPACITY))
    this.cdBasis = opts.cdBasis ?? GPU_CD_BASIS
    this.ring = new Float64Array(this.capacity)
    this._rejected = { ok: 0, empty: 0, ramp: 0, stale: 0, tooSoon: 0, noLinks: 0, nonFinite: 0, done: 0 }
  }

  get converged(): boolean { return this._converged }
  get samples(): number { return this.count }
  get lastStep(): number { return this._lastStep }
  /** 边一种理由掉咗几多个样本 —— 「点解成日都唔收敛」嘅第一个问题 */
  get rejected(): Readonly<Record<PushReason, number>> { return this._rejected }

  /** 换零件 / 换风速 / 换 tier 之后，旧样本係谎话。 */
  reset(): void {
    this.head = 0; this.count = 0
    this._lastStep = -1
    this._converged = false; this._convergedAt = -1
    this._spread = NaN
    for (const k of Object.keys(this._rejected) as PushReason[]) this._rejected[k] = 0
  }

  /**
   * 收一个（可能係 null 嘅）力样本。
   *
   * ★ 参数容许 null 係【故意】嘅 ★ —— 咁 caller 就一定要写 `t.push(solver.pollForce())`，
   * 而唔会写成 `if (frame % 8 === 0) t.push(lastCd)`。见文件头。
   */
  push(s: ForceLike | null | undefined): PushOutcome {
    const no = (reason: PushReason): PushOutcome => {
      this._rejected[reason]++
      return { accepted: false, reason, justConverged: false }
    }
    if (!s) return no('empty')
    if (this._converged) return no('done')
    if (!Number.isFinite(s.cd) || !Number.isFinite(s.step)) return no('nonFinite')
    // ramp：CPU 係 `step >= rampSteps`；solver 自己个 rampDone 係同一句话，两边都认
    if (s.rampDone === false || s.step < this.schedule.rampSteps) return no('ramp')
    if (s.links !== undefined && !(s.links > 0)) return no('noLinks')
    // ★ 单调闸 ★：readback 迟到令同一个 step 可以出现两次；收咗就係把同一个数入两次窗口
    if (this._lastStep >= 0 && s.step <= this._lastStep) return no('stale')
    // ★ 间距闸 ★：CPU 係 `step % 20 === 0`。采得密 = 样本高度相关 = 假收敛
    if (this._lastStep >= 0 && s.step - this._lastStep < this.sampleEvery) return no('tooSoon')

    this.ring[this.head] = s.cd
    this.head = (this.head + 1) % this.capacity
    if (this.count < this.capacity) this.count++
    this._lastStep = s.step
    this._rejected.ok++

    // 收敛判定（windtunnel.ts:283-288）：★ 要过 minSteps 而且够样本先至试 ★
    let justConverged = false
    if (this.count >= this.minSamples) {
      const w = this.tailValues(this.window)
      let mn = Infinity, mx = -Infinity, sum = 0
      for (const x of w) { if (x < mn) mn = x; if (x > mx) mx = x; sum += x }
      this._spread = (mx - mn) / (Math.abs(sum / w.length) + 1e-9)
      if (s.step > this.schedule.minSteps && this._spread < this.tol) {
        this._converged = true
        this._convergedAt = s.step
        justConverged = true
      }
    }
    return { accepted: true, reason: 'ok', justConverged }
  }

  /** 最后 n 个样本（唔够就有几多攞几多）。 */
  tailValues(n: number): number[] {
    const k = Math.min(Math.max(0, Math.round(n)), this.count)
    const out = new Array<number>(k)
    for (let i = 0; i < k; i++) out[i] = this.ring[(this.head - k + i + this.capacity) % this.capacity]
    return out
  }

  /**
   * 行完未。
   * @param stepCount 求解器而家嘅 substep 数（LbmGpu.stepCount）
   */
  finished(stepCount: number): boolean {
    return this._converged || stepCount >= this.schedule.maxSteps
  }

  /** 进度 0..1（同 windtunnel.ts:289 `min(1, step/maxSteps)` 一样）。 */
  progress(stepCount: number): number {
    if (this._converged) return 1
    const m = this.schedule.maxSteps
    if (!(m > 0)) return 0
    return Math.max(0, Math.min(1, stepCount / m))
  }

  /** 而家喺边个阶段（面板文案用）。 */
  phase(stepCount: number): 'ramp' | 'solve' | 'done' {
    if (this.finished(stepCount)) return 'done'
    return stepCount < this.schedule.rampSteps ? 'ramp' : 'solve'
  }

  /**
   * 末段窗口统计（windtunnel.ts:294-299）。
   * 末段【时均】而唔係读最后一步：钝体尾涡係周期性嘅，读末一步等于随机抽咗涡周期入面一点。
   */
  stats(): ConvStats {
    const tailN = this.count > 0 ? Math.max(this.tailMin, Math.round(this.count * this.tailFrac)) : 0
    const tail = this.tailValues(tailN)
    let sum = 0, mn = Infinity, mx = -Infinity
    for (const x of tail) { sum += x; if (x < mn) mn = x; if (x > mx) mx = x }
    const mean = tail.length ? sum / tail.length : 0
    return {
      converged: this._converged,
      convergedAtStep: this._convergedAt,
      steps: this._converged ? this._convergedAt + 1 : Math.max(0, this._lastStep),
      samples: this.count,
      lastStep: this._lastStep,
      cd: Math.abs(mean),
      cdSigned: mean,
      cdOsc: tail.length > 1 ? (mx - mn) / 2 : 0,
      tailN: tail.length,
      spread: this._spread,
      cdBasis: this.cdBasis,
    }
  }
}

/* ══════════════════════════════════════════════════════════════ 帧预算 */

export interface SubstepBudgetInput {
  /** 而家一帧行紧几多 substep */
  current: number
  /** 实测帧间隔 ms（用 EMA，唔好用单帧 —— 见 blendFrameMs） */
  frameMs: number
  /** 想要嘅帧间隔上限 ms（60fps = 16.7、30fps = 33.3） */
  budgetMs: number
  min?: number
  max?: number
}

/**
 * 一帧应该行几多 substep。
 *
 * ★ 点解唔用 GPU 计时 ★：EXT_disjoint_timer_query_webgl2 喺大部分浏览器因为 timing-attack
 * 已经閂咗（或者只畀极粗嘅粒度）。所以我哋唯一诚实嘅信号就係【帧真係行咗几耐】——
 * 而呢个信号本身就係我哋想守住嘅嘢：solver 而家同 CAD 视窗争同一个帧预算。
 *
 * ★ 加要慢、减要快 ★：加多一步嘅代价係下一帧掉帧（用户即刻见到），
 * 减少一步嘅代价只係收敛慢少少（用户见唔到）。所以升係 +1、跌係按比例。
 */
export function substepBudget(inp: SubstepBudgetInput): number {
  const min = Math.max(1, Math.round(inp.min ?? 1))
  const max = Math.max(min, Math.round(inp.max ?? 64))
  const cur = Math.min(max, Math.max(min, Math.round(Number.isFinite(inp.current) ? inp.current : min)))
  const budget = Number.isFinite(inp.budgetMs) && inp.budgetMs > 0 ? inp.budgetMs : 16.7
  // 第一帧 / 刚 resume：冇有效读数就唔好乱郁（郁咗就係靠一个未量过嘅数做决定）
  if (!Number.isFinite(inp.frameMs) || inp.frameMs <= 0) return cur
  if (inp.frameMs > budget) {
    const scaled = Math.floor(cur * budget / inp.frameMs)
    return Math.min(max, Math.max(min, Math.min(cur - 1, scaled)))
  }
  // 只喺仲有【明显】余裕先加 —— 贴住 budget 就加会喺 budget 上下震荡
  if (inp.frameMs < 0.7 * budget) return Math.min(max, cur + 1)
  return cur
}

/**
 * 帧间隔嘅指数移动平均。
 * 单帧读数会畀 GC、tab 切换、别嘅 React 更新污染 —— 用佢直接调 substep 会一路上落。
 * alpha 细 = 稳但反应慢；0.2 大约係「五帧记忆」。
 */
export function blendFrameMs(prev: number, sample: number, alpha = 0.2): number {
  if (!Number.isFinite(sample) || sample <= 0) return prev
  if (!Number.isFinite(prev) || prev <= 0) return sample
  const a = Math.min(1, Math.max(0, alpha))
  return prev * (1 - a) + sample * a
}
