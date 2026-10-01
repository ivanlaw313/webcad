/*
 * 球體 Cd 驗收 fixture 嘅【純邏輯】部分
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 點解要獨立一個檔：lbm.validate.test.ts 嗰條球體 Cd fixture 要 GPU，headless
 * 永遠 SKIP。但佢個「方法學」—— 堵塞率、來流軸、時均窗口 —— 全部係純算術，
 * 完全驗得到。方法學錯咗，GPU 有幾準都冇意義（2026-07 ~ 2026-10 嗰個
 * 「GPU 有 ~2× 系統偏差」嘅結論就係咁嚟）。
 *
 * 所以：呢度嘅嘢喺 lbm.cdmethod.test.ts 度 headless 測，GPU fixture 直接 import，
 * 兩邊【同一份數】，唔會再出現「探針用一套、fixture 用另一套」。
 *
 *
 * ★★ 2026-10-01 修正咗嘅三個方法學問題 ★★
 * ──────────────────────────────────────
 *
 * (1) 來流軸會靜靜雞轉
 *     buildDomain(g) 唔傳 opts.axis 嘅話，佢【自己揀最長軸】做來流方向
 *     （sdfBake.ts:147）。側向加留白之後 Y/Z 就變成最長軸 → 流向軸由 X 跳去 Y，
 *     而個 fixture 本身一句都唔會響。見 pickFlowAxisDefault() 同佢嘅測試。
 *     ⇒ 鐵律：所有 buildDomain call 一律明確傳 { axis: 0, sign: 1 }。
 *
 * (2) 重度壁面約束，而個閘攔唔到
 *     原本 sphereGrid(res, 100) 出一個【貼邊】立方包圍盒，buildDomain 嘅側邊距
 *     只有 0.45×截面+4 → DY = DZ = 47、frontalCells = 317、dLb = 20.09
 *     ⇒ λ = d/D = 0.427、堵塞率 14.35%。
 *     而個 `assert(blockage < 0.15)` 喺【另一條 case】，攔唔到 Cd 嗰條；
 *     medium / high tier 實測 15.4% / 16.6%，兩個都超咗 15% 都冇人知。
 *     ⇒ blockageOf() + BLOCKAGE_MAX，而個 assert 要落喺 Cd fixture 自己身上。
 *
 * (3) 從來冇收斂過，但個判據假裝收斂
 *     原判據：末 10 個樣本波動 < 1.2%。Re ≈ 600 嘅球有渦脫落，尾流本質非穩態
 *     ⇒ 呢個條件【永遠達唔到】（實測五個配置全部 converged:false，Cd 由 0.509
 *     跳到 1.393 非單調亂跳）。所以嗰個「Cd」係一個隨機時刻嘅快照。
 *     ⇒ averagingWindow() + timeAverage()：跑夠 N 個流過時間 → 對一個
 *     【由 Strouhal 數推出嚟】嘅窗口做時均，並且報返波動幅度（唔隱藏非穩態）。
 */

import type { VoxelGridLike, WindDomain } from '../sdfBake.ts'

/* ══════════════════════════════════════════════════════════ 常數（有出處） */

/**
 * 球體渦脫落嘅 Strouhal 數，St = f·d/U。
 *
 * 球體尾流：Re ≲ 210 穩態軸對稱；210–270 穩態非軸對稱（double-thread）；
 * Re ≳ 270–300 開始週期性脫落，St 喺 subcritical 帶（3e2 ~ 1e5）大致 0.15–0.21
 * （Taneda 1956、Achenbach 1974、Sakamoto & Haniu 1990）。
 * 取 0.2 —— 我哋唔係要個準 St，係要個【脫落週期嘅量級】嚟定時均窗口長度。
 * 取細啲嘅 St = 週期長啲 = 窗口長啲 = 保守。
 */
export const STROUHAL_SPHERE = 0.2

/** 球體尾流由穩態轉非穩態嘅 Re 門檻（Taneda 1956）。低過呢個就真係收斂得到。 */
export const SHEDDING_RE_ONSET = 210

/**
 * 堵塞率上限 S = A_frontal / A_cross。
 *
 * 點嚟：Maskell (1963) 鈍體堵塞修正 Cd_corr ≈ Cd_meas / (1 + K·S)，鈍體 K ≈ 2.5–2.9。
 * 取 K = 2.77，要求【殘餘堵塞偏差 ≤ 6%】—— 即係鈍到唔再係一階項，啜入
 * Clift-Gauvin 自己嗰 ±6% 相關式精度裏面：
 *     S ≤ 0.06 / 2.77 = 0.0217
 * 所以上限 0.022（λ = sqrt(4S/π) ≈ 0.166）。
 *
 * 對照：原本嗰個域 S = 0.1435 → Maskell 偏差 +40%，而 Stokes 區嘅
 * Haberman-Sayre 管壁修正喺 λ=0.427 係 3.99×。「2×」完全落喺約束物理嘅範圍。
 *
 * 文獻習慣：Barlow / Rae / Pope《Low-Speed Wind Tunnel Testing》建議模型迎風面積
 * ≤ 試驗段 ~5% 並且【要做修正】；唔做修正而直接同標準曲線比，習慣壓到 1–2%。
 * 2.2% 係「唔做修正都夠鈍」嘅邊緣，同時域唔會大到跑唔起（見下面 cost）。
 */
export const BLOCKAGE_MAX = 0.022

/** Maskell 鈍體堵塞修正嘅 K。 */
export const MASKELL_K = 2.77

/**
 * Cd fixture 用嘅側向留白（格）。
 *
 * 最細合格值係 19（S = 2.165%）；用 20（S = 2.10%、λ = 0.163）留一格 margin，
 * 咁 domainPads 嗰啲 Math.round 細細郁一下都唔會令個閘反覆跳。
 *
 * ── cost（res = 21、tier low 嘅 planResolution 出嘅解析度）──────────────
 *   pad=0  （舊）  域 64×47×47    = 0.14 M 格   S = 14.35%  λ = 0.427
 *   pad=20（新）  域 128×123×123 = 1.94 M 格   S =  2.10%  λ = 0.163
 *   → 格數大 13.7×。VRAM（needVolume:false、measure:true）≈ 488 MB。
 *   ⚠ 側邊距一大，buildDomain 嘅上下游邊距【亦然】跟住大（upBase = 0.4·crossMax+4、
 *     downBase = 1.2·crossMax+6），所以 DX 由 64 → 128。cost 唔係只乘 DY·DZ。
 *   ⚠ 呢個域【超出】所有 QUALITY_TIERS 嘅 budget（high 都只係 160×80×80），
 *     即係佢係一個驗收專用域，唔係產品 tier。planResolution 只用嚟定球嘅解析度。
 */
export const CD_LATERAL_PAD = 20

/* ══════════════════════════════════════════════════════════ 幾何 / 堵塞率 */

/**
 * 球 + 【側向留白】嘅體素網格。
 *
 * ★ 球本身一個格都唔改 ★ —— 留白只係喺 Y/Z 兩軸外面加空體素，所以 frontalCells、
 * dLb、h 全部同 sphereGrid(res) 一模一樣，而 DY/DZ 變大 → 堵塞率跌。
 * 咁樣掃堵塞率嗰陣解析度係真不變量（原先七月嗰個「三個 tier 比值都 2.1 →
 * 同解析度無關 → 所以係碼錯」嘅推論，就係因為三個 tier 嘅堵塞率【亦然冇變】而失效）。
 *
 * ⚠ 加完留白之後 ny = nz = res + 2·pad > nx = res，即係 Y/Z 變成最長軸。
 *   buildDomain 一定要傳 { axis: 0, sign: 1 }，否則來流軸會跳去 Y。
 */
export function sphereGridLateralPad(res: number, lateralPad: number, diameterMM = 100): VoxelGridLike {
  const n = Math.max(1, Math.round(res))
  const p = Math.max(0, Math.round(lateralPad))
  const m = n + 2 * p
  const h = diameterMM / n
  const solid = new Uint8Array(n * m * m)
  const c = (n - 1) / 2, r = n / 2
  for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const dx = i - c, dy = j - c, dz = k - c
    if (dx * dx + dy * dy + dz * dz <= (r - 0.5) * (r - 0.5)) {
      solid[i + n * ((j + p) + m * (k + p))] = 1
    }
  }
  return { h, nx: n, ny: m, nz: m, ox: 0, oy: 0, oz: 0, solid }
}

/**
 * buildDomain 唔傳 opts.axis 嗰陣【自己揀】嘅來流軸 —— sdfBake.ts:147 嘅同一條規則。
 *
 * 呢個函數存在嘅唯一理由：令「唔傳 axis 就會轉軸」呢個陷阱變成一句測得到嘅嘢。
 * 唔係用嚟喺產品碼度揀軸。
 */
export function pickFlowAxisDefault(dims: [number, number, number]): 0 | 1 | 2 {
  return (dims[0] >= dims[1] && dims[0] >= dims[2]) ? 0 : (dims[1] >= dims[2] ? 1 : 2)
}

export interface BlockageReport {
  /** 迎風投影格數（域 X 投影） */
  frontalCells: number
  /** 橫截面格數 DY·DZ */
  crossCells: number
  /** 堵塞率 S = A_frontal / A_cross */
  blockage: number
  /** 等效直徑比 λ = d_eq / D_eq，d_eq = dLb、D_eq = sqrt(DY·DZ) */
  lambda: number
  /** Maskell 鈍體修正估到嘅 Cd 高估量（分數，+0.058 = 高估 5.8%） */
  maskellBias: number
  /** Stokes 區 Haberman-Sayre 管壁因子（Re→0 嘅上界，唔係 Re≈600 嘅真值） */
  habermanSayre: number
}

/**
 * Stokes 區管壁修正因子 K = 1 / (1 − 2.104λ + 2.089λ³ − 0.948λ⁵)
 * （Haberman & Sayre 1958，球喺圓管中心）。
 *
 * ⚠ 呢個係 Re → 0 嘅結果，喺 Re ≈ 150–600 會【高估】約束效應。放喺報告裏面做
 *   上界參考：λ=0.427 → 3.99×，即係原先嗰個「2×」連 Stokes 上界都未到。
 */
export function habermanSayreK(lambda: number): number {
  const d = 1 - 2.104 * lambda + 2.089 * lambda ** 3 - 0.948 * lambda ** 5
  return d > 0 ? 1 / d : Infinity
}

/** 由一個已建好嘅域算堵塞率同埋兩個修正估計。純函數，唔使 GPU。 */
export function blockageOf(dom: Pick<WindDomain, 'frontalCells' | 'DY' | 'DZ' | 'dLb'>): BlockageReport {
  const crossCells = dom.DY * dom.DZ
  const blockage = dom.frontalCells / crossCells
  const lambda = dom.dLb / Math.sqrt(crossCells)
  return {
    frontalCells: dom.frontalCells,
    crossCells,
    blockage,
    lambda,
    maskellBias: MASKELL_K * blockage,
    habermanSayre: habermanSayreK(lambda),
  }
}

/** 一句人話，畀 assert 嘅 message 用。 */
export function blockageLine(b: BlockageReport): string {
  return '堵塞率 ' + (b.blockage * 100).toFixed(2) + '%（λ=' + b.lambda.toFixed(3)
    + '、迎風 ' + b.frontalCells + ' / 截面 ' + b.crossCells
    + '、Maskell 偏差 +' + (b.maskellBias * 100).toFixed(1) + '%'
    + '、Haberman-Sayre 上界 ' + b.habermanSayre.toFixed(2) + '×）'
}

/**
 * 搵最細嘅側向留白，令堵塞率跌到 limit 以下。
 *
 * 用 buildDomain 嘅真路徑嚟試（唔係手推公式）—— domainPads 嘅側邊距同上下游邊距
 * 互相耦合（crossMax 一大，DX 都會一齊大），手推好易錯。
 */
export function lateralPadFor(
  res: number,
  limit: number,
  build: (g: VoxelGridLike) => Pick<WindDomain, 'frontalCells' | 'DY' | 'DZ' | 'dLb'>,
  maxPad = 64,
): number {
  for (let p = 0; p <= maxPad; p++) {
    if (blockageOf(build(sphereGridLateralPad(res, p))).blockage <= limit) return p
  }
  return -1
}

/* ══════════════════════════════════════════════════════ 時均窗口（非穩態） */

export interface WindowSpec {
  /** 一個流過時間 = DX / U_LB（格子步） */
  flowThrough: number
  /** 一個渦脫落週期 = dLb / (St · U_LB)（格子步） */
  shedPeriod: number
  /** Re 高過 SHEDDING_RE_ONSET → 尾流非穩態，唔可以等「收斂」 */
  unsteady: boolean
  /** 開始取平均之前要跑到邊步（= rampSteps + settleFlowThroughs 個流過時間） */
  avgStart: number
  /** 跑到邊步收工 */
  avgEnd: number
  /** 平均窗口長度（格子步） */
  windowSteps: number
  /** 窗口蓋到幾多個脫落週期（穩態個案可以 < 1，冇所謂） */
  cycles: number
  /** 窗口蓋到幾多個流過時間 */
  flowThroughs: number
}

export interface WindowInput {
  dLb: number
  DX: number
  uLb: number
  rampSteps: number
  /** 真正跑緊嘅格子 Re（deriveFlow().reLbEffective），唔係真實 Re */
  reLb: number
  strouhal?: number
  /** 非穩態個案要蓋幾多個脫落週期（預設 10） */
  shedCycles?: number
  /** 入口渐升完之後要再沖幾多個流過時間先開始取平均（預設 3） */
  settleFlowThroughs?: number
}

/**
 * 推時均窗口。★ 呢度就係「唔再假裝收斂」嘅地方 ★
 *
 * 兩個時間尺度：
 *
 *   · 流過時間  T_flow = DX / U_LB
 *     初始瞬態（入口壓力波、尾流由零長出嚟）要幾個 T_flow 沖走。取 3 個：
 *     第 1 個畀擾動行到出口，第 2–3 個畀尾流本身建立。再加 rampSteps（入口
 *     餘弦渐升，deriveFlow 已經係 0.6 T_flow）。
 *
 *   · 脫落週期  T_shed = d / (St · U) = dLb / (St · U_LB)
 *     Re > 210 嘅球尾流週期性擺動，Cd(t) 係一條帶 T_shed 週期嘅波。
 *     時均要蓋【整數個】週期，而且要夠多個週期令窗口起點嘅相位唔再影響均值。
 *     取 10 個 —— 相位誤差 ~1/10 個週期 → 均值誤差 ~ (振幅/2)·(1/10)/π，
 *     振幅 20% 都只係 ~0.3%，遠細過其他誤差源。文獻做鈍體時均一般 10–30 個週期。
 *
 * 穩態個案（Re ≤ 210）冇脫落，窗口只需要夠長嚟壓低讀數噪聲 → 取 1 個 T_flow。
 *
 * ⛔ 刻意【冇】收斂判據。「末 10 個樣本波動 < 1.2%」對有渦脫落嘅鈍體係一個
 *    永遠達唔到嘅條件：Cd(t) 嘅峰峰值本身就有 10–30%，而 10 個樣本只蓋到
 *    一個週期嘅幾個百分比。唔好再拎佢返嚟。
 */
export function averagingWindow(p: WindowInput): WindowSpec {
  const uLb = p.uLb > 0 ? p.uLb : 1e-6
  const st = p.strouhal ?? STROUHAL_SPHERE
  const flowThrough = p.DX / uLb
  const shedPeriod = p.dLb / (st * uLb)
  const unsteady = p.reLb > SHEDDING_RE_ONSET
  const settleFT = p.settleFlowThroughs ?? 3
  const cycles = p.shedCycles ?? 10

  const avgStart = Math.round(p.rampSteps + settleFT * flowThrough)
  const windowSteps = unsteady
    ? Math.round(Math.max(cycles * shedPeriod, flowThrough))
    : Math.round(flowThrough)
  const avgEnd = avgStart + windowSteps

  return {
    flowThrough, shedPeriod, unsteady,
    avgStart, avgEnd, windowSteps,
    cycles: windowSteps / shedPeriod,
    flowThroughs: windowSteps / flowThrough,
  }
}

export interface TimeAverage {
  /** 窗口內嘅時均 Cd */
  mean: number
  min: number
  max: number
  /** 峰峰波動 / |mean|（分數）—— ★ 呢個要報出嚟，唔好收埋 ★ */
  fluctuation: number
  /** 窗口內用到幾多個樣本 */
  n: number
  /** 樣本真正蓋到嘅格子步範圍 */
  spanSteps: number
  /** 樣本真正蓋到幾多個脫落週期 */
  spanCycles: number
}

/**
 * 對窗口內嘅樣本做時均。
 *
 * ★ 用樣本自己嘅 step 嚟篩，唔係用「末 N 個」★ —— async readback 嘅延遲同
 *   miss rate 唔定，「末 N 個」對應嘅物理時間長度係未知數。
 */
export function timeAverage(
  samples: readonly { step: number; cd: number }[],
  win: Pick<WindowSpec, 'avgStart' | 'avgEnd' | 'shedPeriod'>,
): TimeAverage | null {
  const w = samples.filter((s) => s.step >= win.avgStart && s.step <= win.avgEnd && Number.isFinite(s.cd))
  if (w.length === 0) return null
  let sum = 0, mn = Infinity, mx = -Infinity, lo = Infinity, hi = -Infinity
  for (const s of w) {
    sum += s.cd
    if (s.cd < mn) mn = s.cd
    if (s.cd > mx) mx = s.cd
    if (s.step < lo) lo = s.step
    if (s.step > hi) hi = s.step
  }
  const mean = sum / w.length
  const spanSteps = hi - lo
  return {
    mean, min: mn, max: mx,
    fluctuation: (mx - mn) / (Math.abs(mean) + 1e-12),
    n: w.length,
    spanSteps,
    spanCycles: spanSteps / win.shedPeriod,
  }
}

/**
 * 原先嗰個收斂判據，照抄 —— ★ 淨係畀測試用嚟證明佢唔 work ★。
 * 返回 true = 佢會宣稱「收斂」。
 */
export function legacyConvergedWindow(window: readonly number[], tol = 0.012): boolean {
  if (window.length === 0) return false
  const mn = Math.min(...window), mx = Math.max(...window)
  const mean = window.reduce((a, b) => a + b, 0) / window.length
  return (mx - mn) / (Math.abs(mean) + 1e-9) < tol
}
