/*
 * 球體 Cd fixture 嘅【方法學】驗收 —— 全部 headless 跑得
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 點跑
 * ────
 *     node --experimental-strip-types src/analysis/lbm/__tests__/lbm.cdmethod.test.ts
 *
 * 呢個檔測嘅唔係 GPU 嘅數值，係【嗰條 GPU fixture 有冇資格宣稱自己量到 Cd】：
 *   · 來流軸有冇被 buildDomain 靜靜雞轉走
 *   · 堵塞率有冇真係攔到
 *   · 時均窗口嘅長度係點推出嚟，推錯會點
 *   · 原先嗰個「末 10 個樣本波動 < 1.2%」判據【錯成點樣】
 *
 * 2026-07 ~ 2026-10 嗰個「GPU 有 ~2× 系統偏差」嘅產品文案，就係因為以上四樣
 * 冇一樣驗過。方法學錯咗，GPU 幾準都冇意義。
 */

import * as SDF from '../sdfBake.ts'
import * as GPU from '../lbmGpu.ts'
import * as LAT from '../lattice.ts'
import * as CDF from './cdFixture.ts'

/* ══════════════════════════════════════════════════ HARNESS（同 lbm.validate 一樣） */

type Body = () => void

interface Harness {
  describe: (name: string, body: Body) => void
  it: (name: string, body: Body) => void
  expect: (actual: unknown) => unknown
}

const HOST = globalThis as unknown as Partial<Harness>
const useHost = typeof HOST.describe === 'function' && typeof HOST.it === 'function' && typeof HOST.expect === 'function'

const cases: { name: string; error: string | null }[] = []
const suite: string[] = []

const localDescribe = (name: string, body: Body): void => {
  suite.push(name)
  try { body() } finally { suite.pop() }
}
const localIt = (name: string, body: Body): void => {
  const full = suite.concat(name).join(' > ')
  try { body(); cases.push({ name: full, error: null }) }
  catch (err) { cases.push({ name: full, error: err instanceof Error ? err.message : String(err) }) }
}

const describe = useHost && HOST.describe ? HOST.describe : localDescribe
const it = useHost && HOST.it ? HOST.it : localIt

function assert(cond: boolean, msg: string): void { if (!cond) throw new Error(msg) }
/** 唔係 null 就還返，係 null 就掟錯。畀 TS 收窄用 —— assert() 唔會收窄。 */
function notNull<T>(v: T | null | undefined, msg: string): T {
  if (v === null || v === undefined) throw new Error(msg)
  return v
}

function rel(a: number, b: number, frac: number, msg: string): void {
  const tol = Math.abs(b) * frac + 1e-12
  if (!(Math.abs(a - b) <= tol)) throw new Error(msg + '：' + a + ' vs ' + b + '（±' + (frac * 100).toFixed(1) + '%）')
}

/** 個 fixture 真正用嘅配置 —— 同 lbm.validate.test.ts 嗰邊一個字都要一樣。 */
const AXIS = { axis: 0, sign: 1 } as const
const buildAt = (pad: number, res = 21) => SDF.buildDomain(CDF.sphereGridLateralPad(res, pad, 100), AXIS)

/* ════════════════════════════════════════════ (1) 來流軸：唔傳 axis 就會轉走 */

describe('cd 方法學/(1) 來流軸一定要釘死', () => {
  it('★ 側向加留白之後，buildDomain 嘅預設會由 X 跳去 Y', () => {
    // 呢個就係 2026-10-01 報廢咗一次掃描嘅陷阱：DY 冇變、只有 DZ 變大。
    assert(CDF.pickFlowAxisDefault([21, 21, 21]) === 0, '立方：最長軸攞 X（平手取 X）')
    assert(CDF.pickFlowAxisDefault([21, 61, 61]) === 1, '★ 側向留白之後預設來流軸變成 Y —— 呢個就係陷阱')
    assert(CDF.pickFlowAxisDefault([21, 41, 61]) === 2, '最長係 Z 就攞 Z')
  })

  it('★ pickFlowAxisDefault 同 buildDomain 嘅預設【逐條一樣】', () => {
    // 唔係抄一條似樣嘅公式就算 —— 要同真路徑對數。
    const dimsList: [number, number, number][] = [
      [21, 21, 21], [21, 61, 61], [21, 41, 61], [8, 4, 4], [4, 8, 4], [4, 4, 8], [20, 12, 8], [7, 7, 9],
    ]
    for (const dims of dimsList) {
      const g: SDF.VoxelGridLike = {
        h: 1, nx: dims[0], ny: dims[1], nz: dims[2], ox: 0, oy: 0, oz: 0,
        solid: new Uint8Array(dims[0] * dims[1] * dims[2]).fill(1),
      }
      assert(SDF.buildDomain(g).fa === CDF.pickFlowAxisDefault(dims),
        'dims ' + dims.join('x') + '：預設軸對唔上 buildDomain')
    }
  })

  it('★ 傳咗 { axis: 0 } 之後，留白只會動 DY/DZ，fa 永遠係 0', () => {
    let prevDY = 0, prevDZ = 0
    for (const pad of [0, 8, 16, 20, 24]) {
      const d = buildAt(pad)
      assert(d.fa === 0 && d.sign === 1, 'pad=' + pad + '：來流軸應該釘死喺 +X，實際 fa=' + d.fa)
      assert(d.DY === d.DZ, 'pad=' + pad + '：Y/Z 應該對稱 —— DY=' + d.DY + ' DZ=' + d.DZ)
      assert(d.DY > prevDY && d.DZ > prevDZ, 'pad=' + pad + '：留白加大 DY/DZ 竟然冇一齊大（軸轉咗？）')
      prevDY = d.DY; prevDZ = d.DZ
    }
    // 反面對照：唔傳 axis 嘅話，同一個 grid 嘅來流軸真係跳咗
    const bad = SDF.buildDomain(CDF.sphereGridLateralPad(21, 20, 100))
    assert(bad.fa === 1, '★ 唔傳 axis 應該跳去 Y（如果呢句爆咗，sdfBake 嘅預設規則改咗，要重寫註釋）')
  })
})

/* ══════════════════════════════════════════ (2) 側向留白：球唔變、堵塞率跌 */

describe('cd 方法學/(2) 側向留白係一個乾淨嘅堵塞率旋鈕', () => {
  it('★ 加留白完全唔影響球本身（dLb / frontalCells / h 不變）', () => {
    // 呢個係整個堵塞率掃描嘅前提。唔成立嘅話「解析度不變、只掃堵塞率」就係假嘅。
    const base = buildAt(0)
    for (const pad of [4, 12, 20, 32]) {
      const d = buildAt(pad)
      assert(d.frontalCells === base.frontalCells,
        'pad=' + pad + '：迎風格數變咗 ' + base.frontalCells + ' → ' + d.frontalCells)
      rel(d.dLb, base.dLb, 1e-12, 'pad=' + pad + ' 嘅 dLb')
      rel(d.h, base.h, 1e-12, 'pad=' + pad + ' 嘅 h')
      rel(d.refLenM, base.refLenM, 1e-12, 'pad=' + pad + ' 嘅特徵長度')
    }
  })

  it('堵塞率隨留白單調跌，而且 DX 會跟住大（邊距耦合，唔好手推）', () => {
    let prevS = Infinity, prevDX = 0
    for (const pad of [0, 4, 8, 12, 16, 20, 24]) {
      const d = buildAt(pad)
      const b = CDF.blockageOf(d)
      assert(b.blockage < prevS, 'pad=' + pad + '：堵塞率冇跌（' + prevS + ' → ' + b.blockage + '）')
      // domainPads：upBase = 0.4·crossMax + 4、downBase = 1.2·crossMax + 6
      // → 側邊距一大，上下游邊距【亦然】一齊大。cost 要照呢個算，唔係只算 DY·DZ。
      assert(d.DX > prevDX || pad === 0, 'pad=' + pad + '：DX 應該跟 crossMax 一齊大')
      prevS = b.blockage; prevDX = d.DX
    }
  })

  it('★ 原先嗰個貼邊域係【重度受限】—— 2× 完全可以係純約束物理', () => {
    const d = buildAt(0)
    const b = CDF.blockageOf(d)
    // 2026-10-01 喺真 5070 Ti 量到嘅同一組數，釘死喺呢度
    assert(d.DY === 47 && d.DZ === 47, '原域橫截面應該係 47×47，實際 ' + d.DY + '×' + d.DZ)
    assert(d.frontalCells === 317, '原域迎風應該 317 格，實際 ' + d.frontalCells)
    rel(d.dLb, 20.09, 0.005, '原域 dLb')
    rel(b.blockage, 0.1435, 0.01, '原域堵塞率')
    rel(b.lambda, 0.427, 0.01, '原域 λ')
    // Haberman-Sayre 喺 λ=0.427 畀到 3.99× —— 即係「2×」連 Stokes 上界都未到。
    rel(b.habermanSayre, 3.99, 0.01, '原域嘅 Stokes 區管壁因子')
    assert(b.habermanSayre > 2.0, '★ 約束上界細過 2× 嘅話，「2× 係約束造成」呢個假設就唔成立')
    assert(b.blockage > CDF.BLOCKAGE_MAX, '原域一定要被新閘攔住，否則呢次修正冇意義')
  })

  it('★ 新閘：所揀嘅留白真係過得到 BLOCKAGE_MAX，而貼邊域過唔到', () => {
    // 最細合格值係 19（S = 2.165%，距上限 2.2% 只差 1.6%）。fixture 用 20 ——
    // 留一格 margin，咁 domainPads 嘅 Math.round 細細郁一下都唔會令個閘反覆跳。
    const minPad = CDF.lateralPadFor(21, CDF.BLOCKAGE_MAX, (g) => SDF.buildDomain(g, AXIS))
    assert(minPad > 0, '搵唔到任何留白可以令堵塞率跌到 ' + CDF.BLOCKAGE_MAX + ' 以下')
    assert(minPad === 19, '最細合格留白應該係 19 格（實測），實際 ' + minPad + ' —— domainPads 改過？')
    assert(CDF.blockageOf(buildAt(minPad - 1)).blockage > CDF.BLOCKAGE_MAX,
      'pad=' + (minPad - 1) + ' 竟然都過閘，lateralPadFor 搵錯最細值')

    const b = CDF.blockageOf(buildAt(CDF.CD_LATERAL_PAD))
    assert(CDF.CD_LATERAL_PAD > minPad, 'fixture 用嘅留白應該高過最細合格值，留返 margin')
    assert(b.blockage <= CDF.BLOCKAGE_MAX, CDF.blockageLine(b) + ' 唔應該過閘')
    assert(b.maskellBias <= 0.06, '殘餘 Maskell 偏差 ' + (b.maskellBias * 100).toFixed(1) + '% 應該 ≤ 6%')
    rel(b.blockage, 0.0210, 0.01, 'fixture 域嘅堵塞率')
    rel(b.lambda, 0.163, 0.01, 'fixture 域嘅 λ')
  })

  it('Haberman-Sayre K 嘅行為（λ=0 → 1、單調升）', () => {
    rel(CDF.habermanSayreK(0), 1, 1e-12, 'λ=0 冇管壁效應')
    let prev = 0
    for (const l of [0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.427]) {
      const k = CDF.habermanSayreK(l)
      assert(k > prev, 'λ=' + l + ' 嘅 K 冇單調升')
      prev = k
    }
    rel(CDF.habermanSayreK(0.1), 1.263, 0.005, 'λ=0.1')
    rel(CDF.habermanSayreK(0.427), 3.988, 0.005, 'λ=0.427')
  })

  it('cost 要報得出：新域嘅格數同 VRAM', () => {
    const d = buildAt(CDF.CD_LATERAL_PAD)
    assert(d.DX === 128 && d.DY === 123 && d.DZ === 123, '新域應該係 128×123×123，實際 ' + [d.DX, d.DY, d.DZ].join('×'))
    rel(d.cells / 1e6, 1.936, 0.01, '新域格數（百萬）')
    const v = GPU.vramBytesFor(d.DX, d.DY, d.DZ, true, 16384)
    const noVol = (v.total - v.vol) / 1048576
    assert(noVol > 400 && noVol < 600, 'needVolume:false 之下 VRAM 應該 ~488 MB，實際 ' + noVol.toFixed(0) + ' MB')
    // 原域 0.14M 格 / ~30 MB → 新域大 14× 格數。呢個就係誠實嘅代價。
    rel(d.cells / buildAt(0).cells, 13.7, 0.05, '新域 / 原域 嘅格數比')
    assert(v.atlas.width <= 16384 && v.atlas.height <= 16384, 'atlas 爆 maxTextureSize：' + v.atlas.width + '×' + v.atlas.height)
  })
})

/* ════════════════════════════════════════ (3) 時均窗口：由 Strouhal 推出嚟 */

describe('cd 方法學/(3) 時均窗口', () => {
  const dom = buildAt(CDF.CD_LATERAL_PAD)

  it('脫落週期同流過時間嘅數式', () => {
    const f = GPU.deriveFlow(dom, { speed: 10, rho: 1.204, mu: 1.81e-5 })
    const w = CDF.averagingWindow({
      dLb: dom.dLb, DX: dom.DX, uLb: LAT.U_LB, rampSteps: f.rampSteps, reLb: f.reLbEffective,
    })
    rel(w.flowThrough, dom.DX / LAT.U_LB, 1e-12, '流過時間 = DX / U_LB')
    rel(w.shedPeriod, dom.dLb / (CDF.STROUHAL_SPHERE * LAT.U_LB), 1e-12, '脫落週期 = dLb / (St·U_LB)')
    rel(w.flowThrough, 2560, 0.001, '流過時間（步）')
    rel(w.shedPeriod, 2009, 0.001, '脫落週期（步）')
    // ★ 一個流過時間只係 1.27 個脫落週期 ★ —— 原 fixture 嘅 maxSteps = 4.5 個流過時間，
    //   減去 1.8 個嘅 minSteps 之後平均窗口最多 2.7 個流過時間 ≈ 3.4 個週期，
    //   而且佢根本冇用個窗口做時均（係攞末 25% 個樣本）。
    rel(w.flowThrough / w.shedPeriod, 1.274, 0.01, '一個流過時間 = 幾多個脫落週期')
  })

  it('★ 空氣個案（Re_lb ≈ 597）判定為非穩態，窗口要 ≥ 10 個脫落週期', () => {
    const f = GPU.deriveFlow(dom, { speed: 10, rho: 1.204, mu: 1.81e-5 })
    assert(f.reLbEffective > CDF.SHEDDING_RE_ONSET,
      '空氣個案嘅 Re_lb = ' + f.reLbEffective.toFixed(0) + ' 應該高過脫落門檻 210')
    const w = CDF.averagingWindow({
      dLb: dom.dLb, DX: dom.DX, uLb: LAT.U_LB, rampSteps: f.rampSteps, reLb: f.reLbEffective,
    })
    assert(w.unsteady, '應該判定為非穩態')
    // 1e-3 嘅鬆動係 windowSteps 嗰個 Math.round —— 唔係物理鬆動。
    assert(w.cycles >= 10 - 1e-3, '窗口只蓋 ' + w.cycles.toFixed(3) + ' 個脫落週期，少過 10')
    // 瞬態要沖走：rampSteps + 3 個流過時間
    rel(w.avgStart, f.rampSteps + 3 * w.flowThrough, 0.001, 'settle 長度')
    assert(w.avgStart > f.rampSteps, 'settle 一定要喺渐升【之後】')
    rel(w.avgEnd, 29306, 0.001, '總步數（空氣個案）')
  })

  it('★ 穩態個案（Re_lb ≈ 143）判定為穩態，窗口 = 1 個流過時間', () => {
    // mu 調高到令 Re_real 落入穩態帶。Clift-Gauvin 係一條【只睇 Re】嘅相關式，
    // 所以任何 (rho, V, mu) 組合出同一個 Re 都係合法對照。
    const mu = 1.204 * 10 * 0.1 / 150
    const f = GPU.deriveFlow(dom, { speed: 10, rho: 1.204, mu })
    assert(!f.reClamped, '穩態個案唔應該被 [6,800] 鉗（Re_real = ' + f.reReal.toFixed(0) + '）')
    assert(!f.omegaClamped, '穩態個案唔應該撞 omega_plus 上限（omega+ = ' + f.omegaPlus.toFixed(4) + '）')
    assert(f.reLbEffective < CDF.SHEDDING_RE_ONSET,
      'Re_lb = ' + f.reLbEffective.toFixed(0) + ' 應該低過脫落門檻 210')
    rel(f.reLbEffective, 143.5, 0.02, '穩態個案嘅 Re_lb')
    const w = CDF.averagingWindow({
      dLb: dom.dLb, DX: dom.DX, uLb: LAT.U_LB, rampSteps: f.rampSteps, reLb: f.reLbEffective,
    })
    assert(!w.unsteady, '應該判定為穩態')
    rel(w.flowThroughs, 1, 1e-9, '穩態窗口應該係 1 個流過時間')
    rel(w.avgEnd, 11776, 0.001, '總步數（穩態個案）')
    // 穩態個案便宜 2.5×，所以佢做量化閘、空氣個案做趨勢閘。
    assert(w.avgEnd * 2 < 29306, '穩態個案應該明顯便宜過空氣個案')
  })

  it('窗口推導嘅邊界行為', () => {
    const base = { dLb: 20, DX: 128, uLb: 0.05, rampSteps: 1000, reLb: 600 }
    // shedCycles 加大 → 窗口線性加大
    const a = CDF.averagingWindow({ ...base, shedCycles: 10 })
    const b = CDF.averagingWindow({ ...base, shedCycles: 20 })
    rel(b.windowSteps / a.windowSteps, 2, 0.01, 'shedCycles 加倍窗口應該加倍')
    // St 大 → 週期短 → 窗口短
    assert(CDF.averagingWindow({ ...base, strouhal: 0.4 }).windowSteps
      < CDF.averagingWindow({ ...base, strouhal: 0.1 }).windowSteps, 'St 大應該窗口短')
    // 就算 shedCycles 細到離譜，窗口都唔應該短過一個流過時間
    const tiny = CDF.averagingWindow({ ...base, shedCycles: 0.01 })
    assert(tiny.windowSteps >= tiny.flowThrough - 1, '窗口下限應該係一個流過時間')
    // uLb = 0 唔可以出 NaN / Infinity
    const z = CDF.averagingWindow({ ...base, uLb: 0 })
    assert(Number.isFinite(z.flowThrough) && Number.isFinite(z.avgEnd), 'uLb=0 出咗非有限值')
  })
})

/* ══════════════════════════════════ (4) 時均 vs 原先嗰個收斂判據 */

describe('cd 方法學/(4) 時均真係做到，而原判據係錯嘅', () => {
  /** 一條有渦脫落嘅合成 Cd(t)：均值 MEAN、峰峰 2·AMP、週期 T。 */
  const MEAN = 0.55, AMP = 0.08, T = 2009
  const cdOf = (step: number) => MEAN + AMP * Math.sin(2 * Math.PI * step / T)

  /** 模擬 solver：每 8 個 substep（substeps=8）攞一個樣本。 */
  function synth(from: number, to: number, every = 8): { step: number; cd: number }[] {
    const out: { step: number; cd: number }[] = []
    for (let s = from; s <= to; s += every) out.push({ step: s, cd: cdOf(s) })
    return out
  }

  it('★ 時均蓋 10 個週期之後，均值準到 1% 以内（唔理起點相位）', () => {
    const win = { avgStart: 9216, avgEnd: 9216 + Math.round(10 * T), shedPeriod: T }
    for (const phase of [0, 137, 401, 902, 1500]) {
      const ta = notNull(
        CDF.timeAverage(synth(win.avgStart + phase, win.avgEnd + phase), { ...win, avgStart: win.avgStart + phase, avgEnd: win.avgEnd + phase }),
        'phase=' + phase + '：時均攞唔到樣本')
      rel(ta.mean, MEAN, 0.01, 'phase=' + phase + ' 嘅時均 Cd')
      // 而且佢要【老實報】波動：2·AMP / MEAN = 29%
      rel(ta.fluctuation, 2 * AMP / MEAN, 0.05, 'phase=' + phase + ' 嘅峰峰波動')
      assert(ta.spanCycles > 9.9, 'phase=' + phase + '：只蓋到 ' + ta.spanCycles.toFixed(2) + ' 個週期')
    }
  })

  it('★ 只蓋 1 個週期嘅話，均值誤差大好多（即係 10 個週期唔係亂定嘅）', () => {
    const worst = (cycles: number) => {
      let w = 0
      for (let phase = 0; phase < T; phase += 97) {
        const a = Math.round(9216 + phase), b = a + Math.round(cycles * T)
        const ta = CDF.timeAverage(synth(a, b), { avgStart: a, avgEnd: b, shedPeriod: T })
        if (ta) w = Math.max(w, Math.abs(ta.mean - MEAN) / MEAN)
      }
      return w
    }
    const e1 = worst(1), e10 = worst(10)
    assert(e10 < 0.01, '10 個週期嘅最差相位誤差 ' + (e10 * 100).toFixed(2) + '% 應該 < 1%')
    assert(e1 > e10 * 2, '1 個週期（' + (e1 * 100).toFixed(2) + '%）應該明顯差過 10 個週期（'
      + (e10 * 100).toFixed(2) + '%）—— 唔係嘅話呢個合成訊號測唔到嘢')
  })

  it('★★ 原判據（末 10 個樣本波動 < 1.2%）會喺波峰附近「收斂」，報一個偏咗 >10% 嘅快照', () => {
    // 呢個就係 2026-07 ~ 2026-10 嗰個「2×」嘅第三個來源：唔係時均，係一個隨機相位嘅快照。
    const samples: number[] = []
    let fired = -1
    for (let s = 9216; s < 9216 + 4 * T; s += 8) {
      samples.push(cdOf(s))
      if (samples.length >= 12 && CDF.legacyConvergedWindow(samples.slice(-10))) { fired = s; break }
    }
    assert(fired > 0, '★ 如果原判據喺純正弦上面都唔會 fire，呢個合成訊號同 solver 嘅取樣率唔匹配')
    // 佢 fire 嗰刻嘅「Cd」= 末 25% 樣本嘅均值（原 fixture 嘅做法）
    const tail = samples.slice(-Math.max(6, Math.round(samples.length * 0.25)))
    const snapshot = tail.reduce((a, b) => a + b, 0) / tail.length
    const err = Math.abs(snapshot - MEAN) / MEAN
    assert(err > 0.10, '★ 原判據報嘅快照偏差只有 ' + (err * 100).toFixed(1)
      + '%，呢個測試冇捉到問題（峰峰 ' + (2 * AMP / MEAN * 100).toFixed(0) + '%）')
    // 而正確嘅時均喺同一條訊號上面準到 1%
    const a = 9216, b = a + Math.round(10 * T)
    const ta = notNull(CDF.timeAverage(synth(a, b), { avgStart: a, avgEnd: b, shedPeriod: T }), '時均攞唔到樣本')
    rel(ta.mean, MEAN, 0.01, '同一條訊號嘅正確時均')
  })

  it('timeAverage 用 step 篩，唔係「末 N 個」', () => {
    const win = { avgStart: 1000, avgEnd: 2000, shedPeriod: T }
    const mixed = [
      { step: 10, cd: 99 }, { step: 999, cd: 99 },           // 窗口前，要丟
      { step: 1000, cd: 1 }, { step: 1500, cd: 2 }, { step: 2000, cd: 3 },
      { step: 2001, cd: 99 }, { step: 5000, cd: 99 },         // 窗口後，要丟
      { step: 1600, cd: NaN },                                // 非有限，要丟
    ]
    const ta = notNull(CDF.timeAverage(mixed, win), '應該有結果')
    assert(ta.n === 3, '應該只收 3 個樣本，實際 ' + ta.n)
    rel(ta.mean, 2, 1e-12, '時均')
    rel(ta.spanSteps, 1000, 1e-12, '樣本跨度')
    assert(CDF.timeAverage([{ step: 1, cd: 1 }], win) === null, '窗口內冇樣本要還 null，唔好扮有數')
  })
})

/* ══════════════════════════════════════════════════════════════ 報告 */

if (!useHost) {
  const failed = cases.filter((c) => c.error)
  for (const c of cases) console.log((c.error ? 'FAIL ' : 'ok   ') + c.name + (c.error ? '\n       ' + c.error.split('\n')[0] : ''))
  console.log('')
  console.log((cases.length - failed.length) + '/' + cases.length + ' passed')
  if (failed.length) {
    const proc = (globalThis as { process?: { exitCode?: number } }).process
    if (proc) proc.exitCode = 1
  }
}
