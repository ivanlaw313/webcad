// Stage 6 headless 验收：收敛判定 + 帧预算。
//
//   node --experimental-strip-types --test tests/lbm-stage6.test.mjs
//
// 呢度冇 GPU（node 开唔到 WebGL2），所以【一定要】测嘅係两样纯逻辑：
//
//  ① 收敛判定同 CPU 求解器（windtunnel.ts:274-299）喺【同一串输入】之下畀出同一个答案。
//     两个引擎嘅 Cd 定义本身唔同（动量交换 vs 压力积分＋摩擦经验项），所以「收敛」呢件事
//     至少要用同一把尺度量 —— 否则连「GPU 收敛得快啲」都係一句冇意义嘅话。
//  ② 采样【只可以】由 pollForce() 非 null 驱动。用帧计数器采样嘅 bug 唔会 crash、唔会报错，
//     佢只会令收敛窗口塞满同一个数然后宣布收敛 —— 呢个 regression 一定要有测试挡住。

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CONV_MIN_SAMPLES, CONV_TOL, CONV_WINDOW, ConvergenceTracker, SAMPLE_EVERY, TAIL_FRAC, TAIL_MIN,
  blendFrameMs, planSchedule, rampFactor, substepBudget,
} from '../src/analysis/lbm/convergence.ts'

/* ══════════════════════════════════════════ CPU 参考解（windtunnel.ts:274-299 逐条抄） */

const CPU_U_LB = 0.1        // windtunnel.ts:84（GPU 用 0.05，见 lattice.ts）

/**
 * windtunnel.ts 个主循环嘅收敛部分，一个字都冇改。
 * 呢个就係「同一把尺」嘅定义 —— 唔係我哋觉得应该係点，係佢真係点做。
 */
function cpuReference(cdOf, { rampSteps, minSteps, maxSteps }) {
  const samples = []
  let converged = false
  let step = 0
  for (; step < maxSteps; step++) {
    if (step >= rampSteps && step % 20 === 0) {
      samples.push(cdOf(step))
      if (step > minSteps && samples.length >= 12) {
        const w = samples.slice(-10)
        let mn = Infinity, mx = -Infinity, sum = 0
        for (const x of w) { if (x < mn) mn = x; if (x > mx) mx = x; sum += x }
        if ((mx - mn) / (Math.abs(sum / w.length) + 1e-9) < 0.012) { converged = true; step++; break }
      }
    }
  }
  const tailN = Math.max(6, Math.round(samples.length * 0.25))
  const tailW = samples.slice(-tailN)
  let tSum = 0, tMn = Infinity, tMx = -Infinity
  for (const x of tailW) { tSum += x; if (x < tMn) tMn = x; if (x > tMx) tMx = x }
  return {
    converged,
    steps: step,
    samples: samples.length,
    cd: Math.abs(tailW.length ? tSum / tailW.length : 0),
    cdOsc: tailW.length > 1 ? (tMx - tMn) / 2 : 0,
  }
}

/** 同一串输入餵落 tracker，行 windtunnel 一模一样嘅循环形状。 */
function trackerRun(cdOf, sched) {
  const t = new ConvergenceTracker(sched)
  let step = 0
  for (; step < sched.maxSteps; step++) {
    if (step >= sched.rampSteps && step % 20 === 0) {
      // ★ 就係呢句 ★：一个「pollForce() 返咗嘢」嘅样本，带住单调 substep 戳
      const r = t.push({ cd: cdOf(step), step, rampDone: true, links: 12 })
      if (r.justConverged) { step++; break }
    }
  }
  return { loopSteps: step, tracker: t, stats: t.stats() }
}

function assertSameAsCpu(name, cdOf, sched) {
  const cpu = cpuReference(cdOf, sched)
  const { loopSteps, stats } = trackerRun(cdOf, sched)
  assert.equal(stats.converged, cpu.converged, `${name}：converged 唔一致`)
  assert.equal(stats.samples, cpu.samples, `${name}：样本数唔一致`)
  assert.equal(loopSteps, cpu.steps, `${name}：宣布收敛嘅 step 唔一致`)
  assert.ok(Math.abs(stats.cd - cpu.cd) < 1e-12, `${name}：末段时均 Cd 唔一致（${stats.cd} vs ${cpu.cd}）`)
  assert.ok(Math.abs(stats.cdOsc - cpu.cdOsc) < 1e-12, `${name}：cdOsc 唔一致（${stats.cdOsc} vs ${cpu.cdOsc}）`)
  if (cpu.converged) assert.equal(stats.steps, cpu.steps, `${name}：stats().steps 应该 = 收敛样本 + 1`)
  return { cpu, stats }
}

/* ══════════════════════════════════════════════════════ ① 同 CPU 逐条对数 */

test('收敛判定同 CPU 求解器喺同一串输入之下逐条一致', () => {
  const sched = planSchedule(64, CPU_U_LB, { rampMin: 150 })

  // (a) 衰减振荡 → 一定收敛（钝体起动之后尾流定落嚟嘅典型样）
  const { cpu: a } = assertSameAsCpu('衰减振荡', (s) => {
    const t = (s - sched.rampSteps) / 400
    return 0.62 + 0.35 * Math.exp(-t) * Math.sin(t * 5.1)
  }, sched)
  assert.equal(a.converged, true, '衰减振荡应该收敛得到（fixture 本身有问题）')

  // (b) 持续等幅振荡（涡脱落唔停）→ 两边都要【老实报未收敛】，唔可以扮收敛
  const { cpu: b } = assertSameAsCpu('等幅涡脱落', (s) => 0.9 + 0.12 * Math.sin(s / 37), sched)
  assert.equal(b.converged, false, '等幅振荡唔应该收敛（fixture 本身有问题）')
  assert.ok(b.cdOsc > 0.02, '等幅振荡嘅 cdOsc 应该真係量到嘢')

  // (c) 单调渐近（流线型件）
  assertSameAsCpu('单调渐近', (s) => 0.31 + 0.9 * Math.exp(-(s - sched.rampSteps) / 260), sched)

  // (d) 极细 Cd（|mean| 接近零 → 相对判据靠 +1e-9 保命）
  assertSameAsCpu('极细 Cd', (s) => 1e-7 * (1 + 0.001 * Math.sin(s / 13)), sched)

  // (e) 负 Cd（动量交换符号反咗）—— 两边都唔可以因为 Math.abs 而睇落正常
  const neg = assertSameAsCpu('负 Cd', () => -0.75, sched)
  assert.ok(neg.stats.cd > 0, 'cd 係取绝对值嘅（同 CPU 一样）')
  assert.ok(neg.stats.cdSigned < 0, '★ cdSigned 一定要保住符号，否则符号 bug 会被 abs 藏起')
})

test('三条不同域长 / 格子速度都同 CPU 一致', () => {
  for (const DX of [40, 96, 160]) {
    const sched = planSchedule(DX, CPU_U_LB, { rampMin: 150 })
    assertSameAsCpu(`DX=${DX}`, (s) => 0.5 + 0.4 * Math.exp(-(s - sched.rampSteps) / 300) * Math.cos(s / 29), sched)
  }
})

/* ══════════════════════════════════════ ② 采样只可以由 pollForce 驱动 */

test('pollForce() 返 null 唔算一个样本', () => {
  const t = new ConvergenceTracker(planSchedule(64, 0.05))
  for (let i = 0; i < 500; i++) {
    const r = t.push(null)
    assert.equal(r.accepted, false)
    assert.equal(r.reason, 'empty')
  }
  assert.equal(t.samples, 0, 'null 唔可以变成样本')
  assert.equal(t.converged, false)
  assert.equal(t.rejected.empty, 500)
})

test('★ regression：用帧计数器采样（重复塞同一个数）唔可以扮到收敛', () => {
  const sched = planSchedule(64, 0.05)
  const t = new ConvergenceTracker(sched)
  // 呢个就係 bug 嘅样：readback 迟到，caller 每帧照塞【上一次】嗰个 Cd（同一个 step 戳）。
  // 冇单调闸嘅话，10 个一模一样嘅数 → (max−min)/|mean| = 0 → 即刻「收敛」。
  const step = sched.minSteps + 200
  let accepted = 0
  for (let f = 0; f < 200; f++) if (t.push({ cd: 0.83, step, rampDone: true }).accepted) accepted++
  assert.equal(accepted, 1, '同一个 substep 戳只可以入一次')
  assert.equal(t.converged, false, '★ 重复同一个数唔可以宣布收敛')
  assert.equal(t.rejected.stale, 199)
})

test('采样间距唔够 20 步嘅样本要掉（采得密 = 样本高度相关 = 假收敛）', () => {
  const sched = planSchedule(64, 0.05)
  const t = new ConvergenceTracker({ ...sched, tol: 0 })     // tol=0：呢条测嘅係间距闸，唔係收敛
  let step = sched.minSteps + 100
  let accepted = 0
  // 每帧行 8 个 substep（典型 GPU cadence），每帧都有 readback 返嚟
  for (let f = 0; f < 400; f++) {
    step += 8
    if (t.push({ cd: 0.5 + 0.001 * Math.sin(step), step, rampDone: true }).accepted) accepted++
  }
  assert.ok(t.rejected.tooSoon > 0, '应该有样本因为太密畀掉')
  // 8 步一帧、SAMPLE_EVERY=20 → 大约每三帧先收一个（24 步）
  const want = Math.floor(400 * 8 / (SAMPLE_EVERY + 4))
  assert.ok(Math.abs(accepted - want) <= 2, `收咗 ${accepted} 个样本，唔似係每 ~24 步一个（预期 ~${want}）`)
})

test('渐升未行完嘅 Cd 一律唔收', () => {
  const sched = planSchedule(64, 0.05)
  const t = new ConvergenceTracker(sched)
  for (let s = 0; s < sched.rampSteps; s += 20) {
    assert.equal(t.push({ cd: 3.5, step: s }).reason, 'ramp')
  }
  assert.equal(t.samples, 0)
  // solver 自己个 rampDone 亦要认
  assert.equal(t.push({ cd: 1, step: sched.rampSteps + 40, rampDone: false }).reason, 'ramp')
  assert.equal(t.push({ cd: 1, step: sched.rampSteps + 40, rampDone: true }).accepted, true)
})

test('冇反弹 link / NaN 嘅样本要掉，唔可以入窗口', () => {
  const sched = planSchedule(64, 0.05)
  const t = new ConvergenceTracker(sched)
  const s0 = sched.rampSteps + 100
  assert.equal(t.push({ cd: 9e9, step: s0, links: 0 }).reason, 'noLinks')
  assert.equal(t.push({ cd: NaN, step: s0 }).reason, 'nonFinite')
  assert.equal(t.push({ cd: Infinity, step: s0 }).reason, 'nonFinite')
  assert.equal(t.push({ cd: 1, step: NaN }).reason, 'nonFinite')
  assert.equal(t.samples, 0)
})

test('收敛之后唔会再收样本（唔会自己「甩返」收敛状态）', () => {
  const sched = planSchedule(64, CPU_U_LB, { rampMin: 150 })
  const t = new ConvergenceTracker(sched)
  let step = sched.minSteps + 20
  while (!t.converged && step < sched.maxSteps) { t.push({ cd: 0.44, step, rampDone: true }); step += 20 }
  assert.equal(t.converged, true)
  const n = t.samples
  assert.equal(t.push({ cd: 99, step: step + 20, rampDone: true }).reason, 'done')
  assert.equal(t.samples, n)
  assert.equal(t.stats().cd, 0.44)
})

/* ══════════════════════════════════════════════════ ③ 统计量 / 排程 / 渐升 */

test('末段窗口统计：tailN = max(6, round(n·0.25))，cdOsc = (max−min)/2', () => {
  const sched = planSchedule(64, CPU_U_LB, { rampMin: 150 })
  const t = new ConvergenceTracker({ ...sched, tol: 0 })     // tol=0 → 永远唔收敛，方便攞足样本
  const vals = []
  for (let i = 0; i < 40; i++) {
    const cd = 1 + i * 0.01
    vals.push(cd)
    t.push({ cd, step: sched.rampSteps + 20 * (i + 1), rampDone: true })
  }
  const st = t.stats()
  assert.equal(st.samples, 40)
  const tailN = Math.max(TAIL_MIN, Math.round(40 * TAIL_FRAC))
  assert.equal(st.tailN, tailN)
  const tail = vals.slice(-tailN)
  const mean = tail.reduce((a, b) => a + b, 0) / tail.length
  assert.ok(Math.abs(st.cd - mean) < 1e-12)
  assert.ok(Math.abs(st.cdOsc - (Math.max(...tail) - Math.min(...tail)) / 2) < 1e-12)
  assert.equal(st.cdBasis, 'momentum-exchange', '★ GPU 嘅 Cd 一定要标住係动量交换')
})

test('planSchedule 喺 u_lb=0.1 之下同 windtunnel.ts 嘅公式逐条相同', () => {
  for (const DX of [24, 64, 120, 200]) {
    const s = planSchedule(DX, 0.1, { rampMin: 150 })
    const ramp = Math.max(150, Math.round(0.6 * DX / 0.1))
    assert.equal(s.rampSteps, ramp, `DX=${DX} rampSteps`)
    assert.equal(s.minSteps, ramp + Math.round(1.8 * DX / 0.1), `DX=${DX} minSteps`)
    assert.equal(s.maxSteps, ramp + Math.min(6000, Math.max(1500, Math.round(4.5 * DX / 0.1))), `DX=${DX} maxSteps`)
  }
})

test('★ u_lb 减半，收敛上限要跟住加倍（否则「未收敛」标签係单位换算错，唔係物理）', () => {
  const a = planSchedule(160, 0.1, { rampMin: 150 })
  const b = planSchedule(160, 0.05, { rampMin: 150 })
  const extraA = a.maxSteps - a.rampSteps
  const extraB = b.maxSteps - b.rampSteps
  assert.ok(extraB > extraA, `u_lb 细一半，行嘅步数应该多啲（${extraB} vs ${extraA}）`)
  // 而且 maxSteps 一定要真係大过 minSteps 一个以上嘅采样窗口，否则收敛判定根本冇机会 fire
  for (const uLb of [0.1, 0.05, 0.025]) {
    for (const DX of [40, 96, 160, 240]) {
      const s = planSchedule(DX, uLb)
      assert.ok(
        s.maxSteps - s.minSteps >= CONV_WINDOW * SAMPLE_EVERY,
        `DX=${DX} u=${uLb}：minSteps 同 maxSteps 之间得 ${s.maxSteps - s.minSteps} 步，装唔落一个收敛窗口`,
      )
    }
  }
})

test('余弦渐升同 lbmGpu.inletRamp 係同一条式', async () => {
  const { inletRamp, RAMP_MIN_STEPS } = await import('../src/analysis/lbm/lbmGpu.ts')
  // ⚠ step 係一个由 0 数起嘅 substep 计数器 —— 负数唔係一个合法输入，所以唔测（见 rampFactor 注释）
  for (const ramp of [0, 1, 200, 780]) {
    for (const s of [0, 1, 13, 99, 200, 400, 779, 780, 5000]) {
      assert.ok(
        Math.abs(rampFactor(s, ramp) - inletRamp(s, ramp)) < 1e-15,
        `rampFactor(${s},${ramp}) 同 inletRamp 唔一致 —— 两边一定要一齐改`,
      )
    }
  }
  assert.equal(rampFactor(0, 100), 0)
  assert.equal(rampFactor(100, 100), 1)
  assert.equal(rampFactor(500, 100), 1)
  assert.ok(Math.abs(rampFactor(50, 100) - 0.5) < 1e-12, '一半嗰度啱啱好 0.5')
  let prev = -1
  for (let s = 0; s <= 100; s++) { const v = rampFactor(s, 100); assert.ok(v >= prev, '渐升要单调'); prev = v }
  // planSchedule 冇畀 rampSteps 嗰阵嘅下限要同 lbmGpu 一致
  assert.equal(planSchedule(10, 0.05).rampSteps, RAMP_MIN_STEPS)
})

test('progress / phase / finished 唔会讲大话', () => {
  const sched = planSchedule(64, 0.05)
  const t = new ConvergenceTracker(sched)
  assert.equal(t.phase(0), 'ramp')
  assert.equal(t.phase(sched.rampSteps + 1), 'solve')
  assert.equal(t.finished(sched.maxSteps), true, '撞到上限就係行完（就算未收敛）')
  assert.equal(t.progress(0), 0)
  assert.ok(Math.abs(t.progress(sched.maxSteps) - 1) < 1e-12)
  assert.ok(t.progress(sched.maxSteps * 10) <= 1, 'progress 唔可以爆一')
})

test('reset() 之后旧样本唔会污染新一次求解', () => {
  const sched = planSchedule(64, CPU_U_LB, { rampMin: 150 })
  const t = new ConvergenceTracker(sched)
  let step = sched.minSteps + 20
  while (!t.converged) { t.push({ cd: 0.4, step, rampDone: true }); step += 20 }
  t.reset()
  assert.equal(t.converged, false)
  assert.equal(t.samples, 0)
  assert.equal(t.lastStep, -1)
  assert.equal(t.rejected.ok, 0)
  // 而且换零件之后 step 由零重新数都要收得返
  assert.equal(t.push({ cd: 1, step: sched.rampSteps, rampDone: true }).accepted, true)
})

test('常数冇畀人静静鸡改走', () => {
  assert.equal(CONV_WINDOW, 10)
  assert.equal(CONV_TOL, 0.012)
  assert.equal(CONV_MIN_SAMPLES, 12)
  assert.equal(SAMPLE_EVERY, 20)
  assert.equal(TAIL_FRAC, 0.25)
  assert.equal(TAIL_MIN, 6)
})

/* ══════════════════════════════════════════════════════════ ④ 帧预算 */

test('substepBudget：过咗预算一定要真係减，而且至少减一步', () => {
  // 轻微超支：按比例出嚟嘅数可能同 current 一样 → 一定要额外保证「至少减一」，
  // 否则一部啱啱好差少少嘅机会永远卡喺超支状态。
  assert.equal(substepBudget({ current: 8, frameMs: 17, budgetMs: 16.7, min: 1, max: 32 }), 7)
  // 严重超支：按比例（8 × 16.7/50 = 2.67 → 2）
  assert.equal(substepBudget({ current: 8, frameMs: 50, budgetMs: 16.7, min: 1, max: 32 }), 2)
  // 超到离谱都唔可以跌穿 min
  assert.equal(substepBudget({ current: 8, frameMs: 5000, budgetMs: 16.7, min: 1, max: 32 }), 1)
  assert.equal(substepBudget({ current: 8, frameMs: 5000, budgetMs: 16.7, min: 4, max: 32 }), 4)
})

test('substepBudget：有明显余裕先加，而且一次只加一步', () => {
  assert.equal(substepBudget({ current: 8, frameMs: 5, budgetMs: 16.7, min: 1, max: 32 }), 9)
  assert.equal(substepBudget({ current: 31, frameMs: 5, budgetMs: 16.7, min: 1, max: 32 }), 32)
  assert.equal(substepBudget({ current: 32, frameMs: 5, budgetMs: 16.7, min: 1, max: 32 }), 32, '唔可以爆 max')
  // 贴住预算（余裕唔够 30%）→ 唔郁。加咗就会喺 budget 上下震荡。
  assert.equal(substepBudget({ current: 8, frameMs: 13, budgetMs: 16.7, min: 1, max: 32 }), 8)
  assert.equal(substepBudget({ current: 8, frameMs: 16.7, budgetMs: 16.7, min: 1, max: 32 }), 8)
})

test('substepBudget：冇有效读数就唔好乱郁（第一帧 / 啱啱 resume）', () => {
  for (const bad of [NaN, 0, -3, Infinity]) {
    assert.equal(substepBudget({ current: 6, frameMs: bad, budgetMs: 16.7, min: 1, max: 32 }), 6)
  }
  // current 本身唔合法都要钳返入区间
  assert.equal(substepBudget({ current: NaN, frameMs: 8, budgetMs: 16.7, min: 2, max: 32 }), 3)
  assert.equal(substepBudget({ current: 999, frameMs: NaN, budgetMs: 16.7, min: 1, max: 12 }), 12)
  assert.equal(substepBudget({ current: -5, frameMs: NaN, budgetMs: 16.7, min: 3, max: 12 }), 3)
})

test('substepBudget：闭环会落到一个固定点，唔会一路震', () => {
  // 一个假 GPU：每个 substep 3ms + 4ms 固定开销
  const frameOf = (n) => 4 + 3 * n
  let n = 24
  const seen = []
  for (let i = 0; i < 200; i++) {
    n = substepBudget({ current: n, frameMs: frameOf(n), budgetMs: 26, min: 1, max: 64 })
    seen.push(n)
  }
  const tail = seen.slice(-20)
  assert.ok(Math.max(...tail) - Math.min(...tail) <= 1, `固定点唔稳：${tail.join(',')}`)
  assert.ok(frameOf(Math.max(...tail)) <= 26 * 1.35, '固定点唔应该长期超支好多')
  assert.ok(Math.max(...tail) >= 6, `固定点太保守（${Math.max(...tail)}）—— 26ms 预算应该行到 ~7 步`)
})

test('blendFrameMs：第一个读数直接过，之后係 EMA，垃圾读数唔理', () => {
  assert.equal(blendFrameMs(NaN, 12), 12)
  assert.equal(blendFrameMs(0, 12), 12)
  assert.equal(blendFrameMs(10, NaN), 10)
  assert.equal(blendFrameMs(10, -1), 10)
  assert.ok(Math.abs(blendFrameMs(10, 20, 0.2) - 12) < 1e-12)
  // 单帧尖峰（GC / tab 切换）唔应该即刻拉走成个估计
  let e = 16
  for (let i = 0; i < 1; i++) e = blendFrameMs(e, 400)
  assert.ok(e < 100, `一个 400ms 尖峰就把 EMA 拉到 ${e}，太敏感`)
  // 但持续超支要跟得上
  for (let i = 0; i < 40; i++) e = blendFrameMs(e, 400)
  assert.ok(Math.abs(e - 400) < 5, `持续 400ms 之后 EMA 应该贴到 400，而家 ${e}`)
})
