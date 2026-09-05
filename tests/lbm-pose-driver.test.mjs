// 位姿驱动（拖住零件转朝向）嘅 headless 验收。
//
//   node --experimental-strip-types --test tests/lbm-pose-driver.test.mjs
//
// 呢度冇 GPU、冇 React。测嘅係 poseCompare.ts 入面【边个数可以信】嘅判定 —— 亦即係
// 呢条线唯一可以出错但唔会 crash 嘅地方：
//
//  ① 位姿一变，旧姿态嘅力一定要清走。唔清嘅话个 bug 唔会报错，佢只会喺你转完朝向之后
//     即刻畀返【上一个朝向】嘅数字，而个数睇落完全合理。
//  ② 过渡态（dragging / settling）唔准报数。报咗嘅话用户见到嘅係流场追紧新姿态嗰阵嘅
//     瞬时值，而佢会当咗係结论。
//  ③ 跨朝向嘅比较要用【阻力面积 Cd×A】。朝向一转迎风面积就变，净係比 Cd = 比紧两个
//     唔同分母嘅数。呢度有一条 fixture 係「Cd 升咗 20% 但阻力实情细咗 40%」。
//  ④ 诚实文案（实测 2.0–2.2× 常数增益、绝对值唔可信）唔可以畀人静静鸡改走。

import test from 'node:test'
import assert from 'node:assert/strict'

import { CD_COMPARE_NOTE, ConvergenceTracker, planSchedule } from '../src/analysis/lbm/convergence.ts'
import {
  GPU_CD_ABSOLUTE_TRUSTWORTHY, GPU_CD_GAIN_DLB_TESTED, GPU_CD_GAIN_RANGE,
  IDENTITY_POSE, POSE_AREA_NOTE, POSE_COMPARE_NOTE, POSE_IS_DELTA_FROM_BAKE,
  POSE_MATRIX_ORDER, POSE_STATE_LABEL, POSE_UNSETTLED_NOTE, PoseCompare,
  isPose16, isRigidPose, poseKey, poseLabel, poseRotation, poseScale, posesEqual, toWindPoseRecords,
} from '../src/analysis/lbm/poseCompare.ts'

/* ══════════════════════════════════════════════════════════ 工具 */

/**
 * 绕 Y 轴旋转，★ column-major（three Matrix4.elements）★。
 * three 嘅 makeRotationY 係 set(c,0,s,0, 0,1,0,0, -s,0,c,0, 0,0,0,1)（row-major 参数），
 * 出嚟嘅 .elements 就係下面呢串。搞错咗行主/列主 = 攞到佢嘅转置 = 反方向旋转。
 */
function rotY(deg) {
  const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r)
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]
}

function translate(x, y, z) {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]
}

function makeRig(opts = {}) {
  const DX = opts.DX ?? 96
  const uLb = opts.uLb ?? 0.05
  const sched = planSchedule(DX, uLb)
  const tracker = new ConvergenceTracker(sched)
  const pc = new PoseCompare({
    tracker,
    quietMs: opts.quietMs ?? 140,
    relaxSteps: opts.relaxSteps,
    settleCap: opts.settleCap,
    eps: opts.eps,
  })
  return { sched, tracker, pc }
}

/**
 * 餵样本直到 settle（或者放弃）。行嘅係 driver 真正嘅形状：
 * 每「帧」行 20 个 substep、每帧照 push 一次 pollForce() 嘅结果。
 */
function feedUntilSettled(pc, { cd, area, step0, oscillate = 0, max = 400 }) {
  let step = step0
  const pushed = []
  for (let i = 0; i < max && pc.state !== 'settled'; i++) {
    const s = {
      cd: cd + (oscillate ? (i % 2 ? oscillate : 0) : 0),
      step,
      rampDone: true,
      links: 12,
      frontalAreaMM2: area,
    }
    pushed.push(s)
    pc.push(s)
    step += 20
  }
  return { step, pushed }
}

/* ══════════════════════════════════════ ① 矩阵约定（★ 搞错就係反方向旋转 ★） */

test('★ 矩阵约定係 column-major（three Matrix4.elements）—— 搞错就係反方向旋转', () => {
  assert.match(POSE_MATRIX_ORDER, /column-major/)
  assert.match(POSE_MATRIX_ORDER, /Matrix4\.elements/)
  assert.equal(POSE_IS_DELTA_FROM_BAKE, true, 'windPose 係相对烘焙几何嘅 delta，唔係世界矩阵')

  const r = poseRotation(rotY(30))
  assert.ok(Math.abs(r.deg - 30) < 1e-9, `绕 Y 30° 应该量返 30°，而家 ${r.deg}`)
  // ★ 呢句就係 row-major regression ★：转置咗嘅话 axis 会变成 [0,−1,0]（即 −30°）
  assert.ok(r.axis[1] > 0.999, `旋转轴应该係 +Y，而家 ${JSON.stringify(r.axis)} —— 係咪当咗 row-major？`)
  assert.ok(Math.abs(r.axis[0]) < 1e-9 && Math.abs(r.axis[2]) < 1e-9)

  // 转置（= 有人当咗 row-major 塞落嚟）一定要量到相反方向
  const m = rotY(30)
  const tPose = [m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0, 0, 0, 0, 1]
  assert.ok(poseRotation(tPose).axis[1] < -0.999, '转置之后应该係 −Y —— 证明呢个约定真係有分别')

  // 180° 嘅退化路径（轴向量归零）都要攞返条轴
  const r180 = poseRotation(rotY(180))
  assert.ok(Math.abs(r180.deg - 180) < 1e-6)
  assert.ok(Math.abs(Math.abs(r180.axis[1]) - 1) < 1e-6, `180° 嘅轴应该仲係 ±Y，而家 ${JSON.stringify(r180.axis)}`)
})

test('刚体检查：缩放 / 镜像唔係刚体（送落 LBM 会整烂几何）', () => {
  assert.equal(isRigidPose(IDENTITY_POSE), true)
  assert.equal(isRigidPose(rotY(37)), true)
  assert.equal(isRigidPose(translate(12, -3, 0.5)), true)

  const scaled = rotY(37).slice()
  scaled[0] *= 2; scaled[1] *= 2; scaled[2] *= 2
  assert.equal(isRigidPose(scaled), false, '★ 有缩放唔係刚体')

  const mirrored = IDENTITY_POSE.slice()
  mirrored[0] = -1
  assert.equal(isRigidPose(mirrored), false, '★ 镜像（det = −1）唔係刚体')
  assert.ok(Math.abs(poseScale(mirrored).det + 1) < 1e-12, 'det 应该係 −1')

  assert.equal(isPose16(rotY(1)), true)
  assert.equal(isPose16([1, 2, 3]), false)
  assert.equal(isPose16(null), false)
  const nan = IDENTITY_POSE.slice(); nan[5] = NaN
  assert.equal(isPose16(nan), false, 'NaN 唔可以当一个合法位姿')
  assert.equal(isRigidPose(nan), false)

  // 位姿相等：细过门槛嘅抖动唔算「郁咗」
  assert.equal(posesEqual(rotY(0), IDENTITY_POSE), true)
  // rot 门槛係基向量分量嘅绝对差 ≈ sin(θ)：1e-5 ≈ 0.00057°，所以 0.0001° 唔算郁过、0.01° 算
  assert.equal(posesEqual(rotY(0.0001), IDENTITY_POSE, { rot: 1e-5 }), true)
  assert.equal(posesEqual(rotY(0.01), IDENTITY_POSE, { rot: 1e-5 }), false)
  assert.equal(posesEqual(translate(1e-6, 0, 0), IDENTITY_POSE, { trans: 1e-4 }), true)
  assert.equal(posesEqual(translate(1e-2, 0, 0), IDENTITY_POSE, { trans: 1e-4 }), false)
  assert.notEqual(poseKey(rotY(10)), poseKey(rotY(11)))
  assert.equal(poseLabel(IDENTITY_POSE), '基准姿态')
  assert.match(poseLabel(rotY(32)), /32\.0°/)
})

/* ══════════════════════════════════ ② 完整状态机：拖拽 → 放手 → settle */

test('★ 完整状态机序列：settling → settled → dragging → settling → settled', () => {
  const { sched, pc, tracker } = makeRig()
  const seq = []
  const mark = () => { if (seq[seq.length - 1] !== pc.state) seq.push(pc.state) }

  assert.equal(pc.state, 'idle', '未收过位姿之前係 idle（= windPose 未接线嗰条路径）')
  seq.push(pc.state)

  // ── 基准姿态上场 ──
  const t0 = pc.notePose(IDENTITY_POSE, 1000, 0)
  assert.equal(t0.reason, 'first')
  assert.equal(t0.needsSolverPose, false, '★ 基准姿态 = 烘焙嗰阵嘅几何，唔使 call setPose')
  mark()
  assert.equal(pc.state, 'settling')

  // ── 基准 settle ──
  const a = feedUntilSettled(pc, { cd: 1.0, area: 1000, step0: sched.minSteps + 20 })
  mark()
  assert.equal(pc.state, 'settled')
  assert.equal(pc.entries.length, 1)
  assert.equal(pc.referenceId, pc.entries[0].id, '第一个 settle 嘅位姿自动做参考')

  // ── 用户撳住转 30°（连续几帧都喺度郁）──
  let t = 2000
  for (const deg of [5, 12, 19, 26, 30]) {
    const tr = pc.notePose(rotY(deg), t, a.step)
    assert.equal(tr.changed, true)
    assert.equal(tr.needsSolverPose, true, '每一格都要真係推落 solver')
    assert.equal(pc.tick(t, a.step), 'dragging')
    t += 16                          // 一帧 16ms，仲喺 quietMs 之内
  }
  mark()
  assert.equal(pc.state, 'dragging')
  assert.equal(tracker.samples, 0, '★ 拖拽期间一个样本都唔可以收')

  // 拖紧嗰阵就算有力返嚟都要掉
  const dropped0 = pc.dropped.dragging
  pc.push({ cd: 9.9, step: a.step + 20, rampDone: true, links: 12, frontalAreaMM2: 500 })
  assert.equal(pc.dropped.dragging, dropped0 + 1)
  assert.equal(tracker.samples, 0)

  // ── 静咗 quietMs 之内：仲係 dragging ──
  assert.equal(pc.tick(t + 100, a.step), 'dragging', '静 100ms（< quietMs 140）唔算放咗手')
  // ── 静够：放咗手 ──
  const releaseStep = a.step
  assert.equal(pc.tick(t + 200, releaseStep), 'settling')
  mark()
  assert.equal(pc.relaxUntilStep, releaseStep + pc.relaxSteps)
  assert.equal(pc.deadlineStep, releaseStep + pc.settleCap)

  // ── 流场过渡期：样本照掉 ──
  const r0 = pc.dropped.relax
  pc.push({ cd: 0.7, step: releaseStep + 20, rampDone: true, links: 12, frontalAreaMM2: 500 })
  assert.equal(pc.dropped.relax, r0 + 1, '★ relax 期内嘅样本要掉（转朝向 = 一次细规模冲击启动）')
  assert.equal(tracker.samples, 0)
  assert.equal(pc.readout(releaseStep + 20).trusted, false)

  // ── 过咗 relax：开始收，然后 settle ──
  const b = feedUntilSettled(pc, { cd: 0.6, area: 500, step0: pc.relaxUntilStep })
  mark()
  assert.equal(pc.state, 'settled')
  assert.equal(pc.entries.length, 2)
  assert.ok(Math.abs(pc.entries[1].cd - 0.6) < 1e-12, '★ 新姿态嘅 Cd 只可以由新样本砌出嚟')
  assert.ok(Math.abs(pc.entries[1].areaMM2 - 500) < 1e-9, '迎风面积要跟住朝向变')
  assert.ok(b.step > releaseStep)

  assert.deepEqual(seq, ['idle', 'settling', 'settled', 'dragging', 'settling', 'settled'])
  for (const s of seq) assert.ok(POSE_STATE_LABEL[s], `状态 ${s} 冇 UI 文案`)
})

/* ═══════════════════════ ③ ★ 核心 regression：旧姿态嘅力唔可以扮新姿态收敛 ★ */

test('★ regression：攞旧姿态嘅力扮新姿态已收敛，一定要 fail', () => {
  const { sched, tracker, pc } = makeRig()
  pc.notePose(IDENTITY_POSE, 1000, 0)

  // 参考姿态：cd = 1.00、迎风面积 1000mm²
  const ref = feedUntilSettled(pc, { cd: 1.0, area: 1000, step0: sched.minSteps + 20 })
  assert.equal(pc.state, 'settled')
  assert.equal(pc.entries.length, 1)
  assert.ok(Math.abs(pc.entries[0].cd - 1.0) < 1e-12)
  assert.ok(ref.pushed.length >= 12, 'fixture 本身要真係收够样本')

  // ── 转朝向 ──
  pc.notePose(rotY(90), 2000, ref.step)
  assert.equal(tracker.samples, 0, '★ 位姿一变，之前收嘅样本一定要全部作废')
  assert.equal(tracker.converged, false, '★ 亦唔可以仲留住「已收敛」呢个状态')

  // ★★ 攻击 ①：拖紧嗰阵把【上一个姿态】收埋嘅力原封不动再塞一次 ★★
  for (const s of ref.pushed) pc.push(s)
  assert.equal(pc.state, 'dragging', '塞几多旧数字都唔可以令佢 settle')
  assert.equal(tracker.samples, 0, '★ 旧姿态嘅力一个都唔可以入到新姿态嘅收敛窗口')
  assert.equal(pc.entries.length, 1, '★ 唔可以帮新姿态记一笔用旧数字砌返嚟嘅帐')
  assert.equal(pc.readout(ref.step).trusted, false)

  // ★★ 攻击 ②：放咗手先再塞 —— step 戳係旧嘅，要畀 relax gate 挡住 ★★
  assert.equal(pc.tick(2500, ref.step), 'settling')
  for (const s of ref.pushed) pc.push(s)
  assert.equal(tracker.samples, 0, '★ 旧 step 戳嘅样本要畀 relax gate 挡住')
  assert.equal(pc.entries.length, 1)
  assert.equal(pc.readout(ref.step).trusted, false)
  assert.ok(pc.dropped.dragging >= ref.pushed.length)
  assert.ok(pc.dropped.relax >= ref.pushed.length)

  // ── 真係行返新姿态：个数只可以係新嗰个 ──
  feedUntilSettled(pc, { cd: 0.55, area: 400, step0: pc.relaxUntilStep })
  assert.equal(pc.state, 'settled')
  assert.equal(pc.entries.length, 2)
  assert.ok(Math.abs(pc.entries[1].cd - 0.55) < 1e-12, `新姿态嘅 Cd 畀污染咗：${pc.entries[1].cd}`)
})

test('★ regression：keepFlow 之下 stepCount 唔会归零 —— 唔可以照用 tracker.finished()', () => {
  const { sched, tracker, pc } = makeRig()
  pc.notePose(IDENTITY_POSE, 1000, 0)
  const ref = feedUntilSettled(pc, { cd: 1.0, area: 1000, step0: sched.minSteps + 20 })

  // setPose(m,{keepFlow:true}) 之后 solver.stepCount 係继续数落去嘅 —— 扮佢已经贴住 maxSteps
  const far = sched.maxSteps + 5000
  pc.notePose(rotY(45), 2000, far)
  pc.tick(2500, far)
  assert.equal(pc.state, 'settling')

  // ★ 呢句就係个陷阱本身 ★：tracker 嗰把绝对尺已经「行完」，但新姿态一个样本都未收
  assert.equal(tracker.finished(far), true, 'fixture 前提：tracker 会话行完（因为 stepCount 过咗 maxSteps）')
  assert.equal(tracker.samples, 0)
  assert.equal(pc.finished(far), false, '★ PoseCompare 一定要有自己嘅 deadline，否则零样本就出报告')
  assert.equal(pc.finished(far + pc.settleCap - 1), false)
  assert.equal(pc.finished(far + pc.settleCap), true, '撞到自己嘅 deadline 就係行完（未收敛都算）')
  assert.equal(pc.timedOut(far + pc.settleCap), true)
  assert.ok(ref.step > 0)
})

/* ══════════════════════════ ④ 过渡态唔准报数（型别上就冇得攞） */

test('★ settling / dragging 期间问数字，攞到嘅係「未可信」而唔係一个数', () => {
  const { sched, pc } = makeRig()
  pc.notePose(IDENTITY_POSE, 1000, 0)

  // ── 未 settle ──
  for (const step of [0, sched.rampSteps, sched.minSteps]) {
    const r = pc.readout(step)
    assert.equal(r.trusted, false)
    assert.equal(r.state, 'settling')
    assert.ok(r.reason.length > 0, '一定要讲得出点解唔可信')
    assert.equal(r.note, POSE_UNSETTLED_NOTE)
    assert.equal('cd' in r, false, '★ 过渡态嘅 readout 唔可以有 cd')
    assert.equal('entry' in r, false, '★ 过渡态嘅 readout 唔可以有 entry')
    assert.equal('table' in r, false, '★ 过渡态嘅 readout 唔可以有对比表')
  }

  const a = feedUntilSettled(pc, { cd: 1.0, area: 1000, step0: sched.minSteps + 20 })
  const ok = pc.readout(a.step)
  assert.equal(ok.trusted, true)
  assert.equal(ok.state, 'settled')
  assert.ok(ok.entry && Number.isFinite(ok.entry.cd))
  assert.equal(ok.note, POSE_COMPARE_NOTE)

  // ── 一郁返就即刻收返啲数字 ──
  pc.notePose(rotY(20), 2000, a.step)
  const drag = pc.readout(a.step)
  assert.equal(drag.trusted, false)
  assert.equal(drag.state, 'dragging')
  assert.equal(drag.progress, 0, '拖紧根本未开始计，progress 唔可以扮有进度')
  assert.equal('cd' in drag, false)
  assert.match(drag.reason, /拖拽/)

  // ── 放手之后 relax 期：要讲得出仲要几多 substep ──
  pc.tick(2500, a.step)
  const relax = pc.readout(a.step + 20)
  assert.equal(relax.trusted, false)
  assert.equal(relax.state, 'settling')
  assert.match(relax.reason, /substep/)
  assert.ok(relax.progress >= 0 && relax.progress < 1)
})

test('disable()（setPose 未落地 / throw 咗）之后一律报未可信', () => {
  const { sched, pc } = makeRig()
  pc.notePose(IDENTITY_POSE, 1000, 0)
  feedUntilSettled(pc, { cd: 1.0, area: 1000, step0: sched.minSteps + 20 })
  assert.equal(pc.readout(sched.maxSteps).trusted, true)

  pc.disable('solver.setPose 未落地')
  const r = pc.readout(sched.maxSteps)
  assert.equal(r.trusted, false)
  assert.equal(r.reason, 'solver.setPose 未落地')
  assert.equal(pc.state, 'idle')
  assert.equal(pc.enabled, false)
  assert.equal(pc.notePose(rotY(30), 3000, 0).reason, 'disabled')
  assert.equal(pc.push({ cd: 1, step: sched.maxSteps + 100, rampDone: true, links: 4 }).reason, 'disabled')
  assert.equal(pc.isNewPose(rotY(30)), false)
})

/* ═══════════════ ⑤ 比值 / Δ% 数学（★ 迎风面积会跟住朝向变 ★） */

test('★ 跨朝向：Cd 升咗 20% 但阻力实情细咗 40%（分母唔同件事）', () => {
  const { sched, pc } = makeRig()
  pc.notePose(IDENTITY_POSE, 1000, 0)
  // 参考：Cd 1.00 × A 1000mm² → 阻力面积 1000
  const a = feedUntilSettled(pc, { cd: 1.0, area: 1000, step0: sched.minSteps + 20 })
  // 转朝向：Cd 1.20（升咗）但迎风面积得 500mm²（打侧咗）→ 阻力面积 600
  pc.notePose(rotY(90), 2000, a.step)
  pc.tick(2500, a.step)
  const b = feedUntilSettled(pc, { cd: 1.2, area: 500, step0: pc.relaxUntilStep })
  assert.equal(pc.state, 'settled')

  const t = pc.compare()
  assert.equal(t.rows.length, 2)
  const [ref, row] = t.rows
  assert.equal(ref.isReference, true)
  assert.equal(ref.cdRatio, 1)
  assert.equal(ref.dragRatio, 1)
  assert.equal(ref.significant, false, '参考同自己比唔算「有意义嘅差异」')

  assert.ok(Math.abs(row.cdRatio - 1.2) < 1e-12, `cdRatio ${row.cdRatio}`)
  assert.ok(Math.abs(row.cdDeltaPct - 20) < 1e-9, `cdDeltaPct ${row.cdDeltaPct}`)
  assert.ok(Math.abs(row.dragArea - 600) < 1e-9)
  assert.ok(Math.abs(row.dragRatio - 0.6) < 1e-12, `dragRatio ${row.dragRatio}`)
  assert.ok(Math.abs(row.dragDeltaPct + 40) < 1e-9, `★ 阻力应该细咗 40%，而家 ${row.dragDeltaPct}`)
  assert.equal(row.significant, true)

  const line = pc.compareLine()
  assert.match(line, /阻力细咗/)
  assert.match(line, /40\.0%/)
  assert.equal(/Cd\s*[=≈]/.test(line), false, '★ 结论嗰行唔可以卖一个绝对 Cd 数字')
  assert.ok(b.step > a.step)
})

test('★ 常数系统增益（实测 2.0–2.2×）喺比值入面会完全消掉', () => {
  const build = (gain) => {
    const { sched, pc } = makeRig()
    pc.notePose(IDENTITY_POSE, 1000, 0)
    const a = feedUntilSettled(pc, { cd: 0.47 * gain, area: 1000, step0: sched.minSteps + 20 })
    pc.notePose(rotY(90), 2000, a.step)
    pc.tick(2500, a.step)
    feedUntilSettled(pc, { cd: 0.31 * gain, area: 800, step0: pc.relaxUntilStep })
    return pc.compare()
  }
  const truth = build(1)
  for (const gain of [GPU_CD_GAIN_RANGE[0], 2.1, GPU_CD_GAIN_RANGE[1]]) {
    const got = build(gain)
    for (let i = 0; i < truth.rows.length; i++) {
      assert.ok(Math.abs(got.rows[i].cdRatio - truth.rows[i].cdRatio) < 1e-12,
        `增益 ${gain}：cdRatio 变咗（${got.rows[i].cdRatio} vs ${truth.rows[i].cdRatio}）—— 比值应该同增益无关`)
      assert.ok(Math.abs(got.rows[i].dragDeltaPct - truth.rows[i].dragDeltaPct) < 1e-9,
        `增益 ${gain}：dragDeltaPct 变咗 —— 比值应该同增益无关`)
    }
    // 而绝对值就【一定】跟住增益走 —— 呢个就係点解唔可以显示佢
    assert.ok(Math.abs(got.rows[0].cd - truth.rows[0].cd * gain) < 1e-12)
    assert.equal(got.absoluteUsable, false)
  }
})

test('涡脱落噪声底：细过噪声嘅 Δ% 唔可以当结论', () => {
  const mk = (cd2, osc) => {
    const { sched, pc } = makeRig()
    pc.notePose(IDENTITY_POSE, 1000, 0)
    const a = feedUntilSettled(pc, { cd: 1.0, area: 1000, step0: sched.minSteps + 20, oscillate: osc })
    pc.notePose(rotY(90), 2000, a.step)
    pc.tick(2500, a.step)
    feedUntilSettled(pc, { cd: cd2, area: 1000, step0: pc.relaxUntilStep, oscillate: osc })
    return pc.compare().rows[1]
  }
  // 振幅 ±0.25%（每边）→ 噪声底 ~0.5%
  const noisy = mk(1.0, 0.005)
  assert.ok(noisy.noisePct > 0.3 && noisy.noisePct < 1.2, `噪声底 ${noisy.noisePct}% 唔似 fixture 讲紧嗰个`)

  const tiny = mk(1.002, 0.005)      // 差 0.2%，细过噪声底
  assert.equal(tiny.significant, false, '★ 差异细过涡脱落噪声就唔可以话「呢个朝向好啲」')
  const big = mk(0.85, 0.005)        // 差 15%，远大过噪声底
  assert.equal(big.significant, true)
  assert.ok(big.dragDeltaPct < -10)

  // 完全冇振荡（人造 fixture）→ 噪声底 0，任何非零差异都算数
  const clean = mk(0.99, 0)
  assert.equal(clean.noisePct, 0)
  assert.equal(clean.significant, true)
})

test('参考位姿可以改；改咗成张表要跟住重算', () => {
  const { sched, pc } = makeRig()
  pc.notePose(IDENTITY_POSE, 1000, 0)
  const a = feedUntilSettled(pc, { cd: 1.0, area: 1000, step0: sched.minSteps + 20 })
  pc.notePose(rotY(90), 2000, a.step)
  pc.tick(2500, a.step)
  feedUntilSettled(pc, { cd: 0.5, area: 1000, step0: pc.relaxUntilStep })

  const ids = pc.entries.map((e) => e.id)
  assert.equal(pc.referenceId, ids[0])
  assert.ok(Math.abs(pc.compare().rows[1].dragRatio - 0.5) < 1e-12)

  assert.equal(pc.setReference(ids[1]), true)
  const t = pc.compare()
  assert.equal(t.referenceId, ids[1])
  assert.ok(Math.abs(t.rows[0].dragRatio - 2) < 1e-12, '掉转参考，比值要变返倒数')
  assert.equal(t.rows[1].isReference, true)
  assert.equal(pc.setReference(99999), false, '唔存在嘅 id 唔可以做参考')
})

/* ══════════════════════════════════════ ⑥ 诚实文案 / 常数 */

test('★ 诚实文案同实测常数冇畀人静静鸡改走', () => {
  assert.deepEqual([...GPU_CD_GAIN_RANGE], [2.0, 2.2], '实测增益范围唔可以改（改之前请再量一次）')
  assert.deepEqual([...GPU_CD_GAIN_DLB_TESTED], [20, 28, 37], '「唔飘」係基于呢三个解析度')
  assert.equal(GPU_CD_ABSOLUTE_TRUSTWORTHY, false, '★ GPU 绝对 Cd 唔可信 —— 呢个唔係设定，係实测结论')

  for (const claim of ['2.0–2.2', 'dLb 20/28/37', '常数系统增益', '比值', 'CPU 引擎']) {
    assert.ok(POSE_COMPARE_NOTE.includes(claim), `诚实文案唔见咗「${claim}」`)
  }
  assert.ok(POSE_COMPARE_NOTE.length > 120, '文案畀人删剩一句 = 冇讲清楚')
  for (const claim of ['迎风面积', 'Cd×A', 'dragRatio']) {
    assert.ok(POSE_AREA_NOTE.includes(claim), `面积文案唔见咗「${claim}」`)
  }
  assert.ok(POSE_UNSETTLED_NOTE.includes('唔好信'))

  // 兄弟文案（两个引擎唔可以直接比）都要企喺度
  assert.ok(CD_COMPARE_NOTE.includes('唔可以直接比'))

  // 对外嘅表一定要带住晒呢啲嘢
  const { sched, pc } = makeRig()
  pc.notePose(IDENTITY_POSE, 1000, 0)
  feedUntilSettled(pc, { cd: 1.0, area: 1000, step0: sched.minSteps + 20 })
  const t = pc.compare()
  assert.equal(t.note, POSE_COMPARE_NOTE)
  assert.equal(t.areaNote, POSE_AREA_NOTE)
  assert.equal(t.absoluteUsable, false)
  assert.deepEqual([...t.gainRange], [2.0, 2.2])
  assert.equal(pc.readout(sched.maxSteps).note, POSE_COMPARE_NOTE)
})

/* ══════════════════════════════════════ ⑦ 排程 / 兼容 / 边界 */

test('缺省 relaxSteps / settleCap 係由 schedule 推出嚟，唔係凭空嘅魔术数', () => {
  const sched = planSchedule(96, 0.05)
  const { pc } = makeRig({ DX: 96, uLb: 0.05 })
  assert.equal(pc.relaxSteps, Math.round(0.5 * (sched.minSteps - sched.rampSteps)),
    'relax = 初次求解「渐升完之后要行嘅时间」嘅一半 ≈ 一个流过时间')
  assert.equal(pc.settleCap, sched.maxSteps - sched.rampSteps,
    'settleCap = 同初次求解一样嘅 post-ramp 预算')
  // 讲得出就要 override 得到
  const custom = makeRig({ relaxSteps: 7, settleCap: 99 }).pc
  assert.equal(custom.relaxSteps, 7)
  assert.equal(custom.settleCap, 99)
})

test('★ 基准姿态之下，接咗 windPose 同未接线【逐个数一样】', () => {
  const sched = planSchedule(96, 0.05)
  const cdOf = (s) => 0.62 + 0.35 * Math.exp(-(s - sched.rampSteps) / 400) * Math.sin(s / 51)

  // (a) 未接线：只用 ConvergenceTracker（即係今日 WindTunnelGpu 嘅行为）
  const bare = new ConvergenceTracker(sched)
  let bareStep = 0
  for (let s = 0; s < sched.maxSteps; s += 20) {
    if (bare.push({ cd: cdOf(s), step: s, rampDone: s >= sched.rampSteps, links: 12 }).justConverged) { bareStep = s; break }
  }

  // (b) 接咗线，位姿一直冇郁
  const tracker = new ConvergenceTracker(sched)
  const pc = new PoseCompare({ tracker })
  pc.notePose(IDENTITY_POSE, 1000, 0)
  let pcStep = 0
  for (let s = 0; s < sched.maxSteps; s += 20) {
    pc.notePose(IDENTITY_POSE, 1000 + s, s)          // 每帧照 call，冇变
    pc.tick(1000 + s, s)
    if (pc.push({ cd: cdOf(s), step: s, rampDone: s >= sched.rampSteps, links: 12, frontalAreaMM2: 1000 }).justSettled) { pcStep = s; break }
  }

  assert.equal(pcStep, bareStep, '★ 收敛嘅 step 唔可以因为接咗 windPose 而变')
  assert.deepEqual(tracker.stats(), bare.stats(), '★ 统计逐个 field 一样')
  // finished() 亦要逐点一样（未 settle 之前）
  const t2 = new ConvergenceTracker(sched)
  const pc2 = new PoseCompare({ tracker: t2 })
  pc2.notePose(IDENTITY_POSE, 1000, 0)
  for (const s of [0, 100, sched.rampSteps, sched.minSteps, sched.maxSteps - 1, sched.maxSteps, sched.maxSteps + 999]) {
    assert.equal(pc2.finished(s), t2.finished(s), `finished(${s}) 唔一致`)
  }
})

test('solver 重置咗 stepCount（keepFlow=false）→ 门槛要跟住搬', () => {
  const { sched, pc } = makeRig()
  pc.notePose(IDENTITY_POSE, 1000, 0)
  const a = feedUntilSettled(pc, { cd: 1.0, area: 1000, step0: sched.minSteps + 20 })
  pc.notePose(rotY(30), 2000, a.step)
  // setPose 冇 keepFlow → solver 由零重头行
  pc.tick(2500, 0)
  assert.equal(pc.state, 'settling')
  assert.equal(pc.relaxUntilStep, pc.relaxSteps, '★ deadline / relax 要以新嘅零点计')
  assert.equal(pc.deadlineStep, pc.settleCap)
  assert.equal(pc.finished(0), false)
  assert.equal(pc.finished(pc.settleCap), true)
})

test('finalize()：settle 唔到嘅位姿都要留低一行，标住「未收敛」', () => {
  const { sched, tracker, pc } = makeRig()
  pc.notePose(IDENTITY_POSE, 1000, 0)
  const a = feedUntilSettled(pc, { cd: 1.0, area: 1000, step0: sched.minSteps + 20 })
  pc.notePose(rotY(60), 2000, a.step)
  pc.tick(2500, a.step)

  // 等幅涡脱落 → 永远收敛唔到
  let step = pc.relaxUntilStep
  for (let i = 0; i < 60; i++) {
    pc.push({ cd: 0.8 + 0.2 * Math.sin(i / 3), step, rampDone: true, links: 12, frontalAreaMM2: 700 })
    step += 20
  }
  assert.equal(pc.state, 'settling')
  assert.equal(tracker.converged, false)
  assert.ok(tracker.samples > 12)

  const e = pc.finalize(pc.deadlineStep)
  assert.ok(e)
  assert.equal(e.converged, false, '★ 未收敛就一定要标住未收敛，唔可以静静鸡当收咗')
  assert.equal(pc.state, 'settled')
  assert.ok(e.cdOsc > 0.05, '等幅振荡嘅 cdOsc 应该真係量到嘢')
  assert.equal(pc.compare().rows[1].converged, false)
  assert.match(pc.compareLine(), /未收敛/)
  // idempotent：再 call 唔可以多一行
  assert.equal(pc.finalize(pc.deadlineStep).id, e.id)
  assert.equal(pc.entries.length, 2)
})

test('reset()（换零件 / 重建 solver）之后旧位姿记录全部作废', () => {
  const { sched, pc } = makeRig()
  pc.notePose(IDENTITY_POSE, 1000, 0)
  feedUntilSettled(pc, { cd: 1.0, area: 1000, step0: sched.minSteps + 20 })
  assert.equal(pc.entries.length, 1)
  pc.reset()
  assert.equal(pc.state, 'idle')
  assert.equal(pc.entries.length, 0)
  assert.equal(pc.referenceId, null)
  assert.equal(pc.pose, null)
  assert.equal(pc.readout(0).trusted, false)
  assert.equal(pc.dropped.ok, 0)
  // 重新上位姿又要当第一个（唔使 setPose）
  assert.equal(pc.notePose(IDENTITY_POSE, 5000, 0).needsSolverPose, false)
})

test('位姿记录有上限，但参考嗰个永远唔会畀踢走', () => {
  const { sched, pc } = makeRig()
  const small = new PoseCompare({ tracker: pc.tracker, maxEntries: 3, quietMs: 10 })
  small.notePose(IDENTITY_POSE, 0, 0)
  let step = sched.minSteps + 20
  const refId = (() => {
    const r = feedUntilSettled(small, { cd: 1.0, area: 1000, step0: step })
    step = r.step
    return small.referenceId
  })()
  for (let k = 1; k <= 6; k++) {
    small.notePose(rotY(k * 11), k * 1000, step)
    small.tick(k * 1000 + 50, step)
    const r = feedUntilSettled(small, { cd: 1 + k * 0.01, area: 1000, step0: small.relaxUntilStep })
    step = r.step
  }
  assert.equal(small.entries.length, 3)
  assert.ok(small.entries.some((e) => e.id === refId), '★ 参考位姿唔可以畀人踢走（成张表係相对佢嚟讲嘅）')
  assert.equal(small.referenceId, refId)
})

test('push(null) 照收（同 ConvergenceTracker 一样嘅纪律）', () => {
  const { sched, tracker, pc } = makeRig()
  pc.notePose(IDENTITY_POSE, 1000, 0)
  for (let i = 0; i < 50; i++) {
    const r = pc.push(null)
    assert.equal(r.accepted, false)
    assert.equal(r.reason, 'empty')
  }
  assert.equal(pc.dropped.empty, 50)
  assert.equal(tracker.rejected.empty, 50, 'null 要照转交，否则 tracker 嘅诊断计数会失真')
  assert.equal(tracker.samples, 0)
  assert.equal(pc.push(undefined).reason, 'empty')
})

test('★ idle / disabled = 完全 pass-through（windPose 未接线嗰条路径唔可以断）', () => {
  const sched = planSchedule(96, 0.05)

  // (a) 一世都冇 call 过 notePose（= windPose 未落地）→ 样本要原封不动去到 tracker
  const bare = new ConvergenceTracker(sched)
  const pc = new PoseCompare({ tracker: bare })
  let step = sched.minSteps + 20
  let settledAt = -1
  for (let i = 0; i < 200 && settledAt < 0; i++) {
    const r = pc.push({ cd: 0.77, step, rampDone: true, links: 12 })
    assert.equal(r.reason, 'idle', 'idle 要照报「冇做位姿记帐」')
    if (bare.converged) settledAt = step
    step += 20
  }
  assert.ok(settledAt > 0, '★ idle 之下掉咗样本嘅话，基本求解永远唔会收敛')
  assert.equal(bare.samples, 12)
  assert.ok(Math.abs(bare.stats().cd - 0.77) < 1e-12)
  assert.equal(pc.entries.length, 0, 'idle 之下唔可以凭空记一笔位姿帐')
  assert.equal(pc.compare().rows.length, 0)
  assert.equal(pc.finished(sched.maxSteps), bare.finished(sched.maxSteps))
  assert.equal(pc.finalize(step), null, 'idle 之下 finalize 唔可以捏一个 entry 出嚟')

  // (b) disable 之后一样 pass-through（solver 仲喺度行紧基本求解）
  const t2 = new ConvergenceTracker(sched)
  const pc2 = new PoseCompare({ tracker: t2 })
  pc2.notePose(IDENTITY_POSE, 0, 0)
  pc2.disable('setPose 未落地')
  let s2 = sched.minSteps + 20
  for (let i = 0; i < 20 && !t2.converged; i++) {
    assert.equal(pc2.push({ cd: 0.5, step: s2, rampDone: true, links: 12 }).reason, 'disabled')
    s2 += 20
  }
  assert.equal(t2.converged, true, '★ disable 咗都唔可以令基本求解卡死')
  assert.equal(pc2.readout(s2).trusted, false, '但个数一律报未可信')
})

/* ═══════════════ ⑧ 明确拖拽讯号（store.windPoseDragging，另一条 agent 落嘅 key） */

test('★ windPoseDragging：撳落即刻停收样本、放开即刻 settle（唔使等 quietMs）', () => {
  const { sched, tracker, pc } = makeRig()
  pc.notePose(IDENTITY_POSE, 1000, 0)
  const a = feedUntilSettled(pc, { cd: 1.0, area: 1000, step0: sched.minSteps + 20 })
  assert.equal(pc.state, 'settled')

  // 撳落手柄（仲未郁过）→ 即刻唔收样本
  assert.equal(pc.tick(2000, a.step, true), 'dragging')
  assert.equal(pc.explicitDrag, true)
  assert.equal(pc.push({ cd: 5, step: a.step + 20, rampDone: true, links: 12 }).reason, 'dragging')

  // 就算静足几秒，有明确讯号就唔可以自己溜返去 settling
  assert.equal(pc.tick(9999, a.step, true), 'dragging', '★ 有明确讯号就唔准靠「静咗几耐」估')

  // 真係郁咗，然后放开 → 唔使等 quietMs，即刻入 settling
  pc.notePose(rotY(25), 10000, a.step)
  assert.equal(tracker.samples, 0)
  assert.equal(pc.tick(10001, a.step, false), 'settling', '★ 放开嗰刻即刻 settle，唔使呆等 140ms')
  assert.equal(pc.explicitDrag, false)
  assert.equal(pc.relaxUntilStep, a.step + pc.relaxSteps)
})

test('★ 撳咗手柄但一格都冇郁 → 原状返去，唔可以掉咗个已 settle 嘅结果', () => {
  const { sched, tracker, pc } = makeRig()
  pc.notePose(IDENTITY_POSE, 1000, 0)
  const a = feedUntilSettled(pc, { cd: 1.0, area: 1000, step0: sched.minSteps + 20 })
  const before = pc.readout(a.step)
  assert.equal(before.trusted, true)
  const nEntries = pc.entries.length
  const nSamples = tracker.samples

  pc.tick(2000, a.step, true)          // 撳落
  assert.equal(pc.state, 'dragging')
  assert.equal(pc.readout(a.step).trusted, false, '撳住嗰阵照样唔可以报数')
  pc.tick(2050, a.step, false)         // 一格都冇郁就放开

  assert.equal(pc.state, 'settled', '★ 误撳一下唔可以害用户重新等一次 settle')
  assert.equal(pc.entries.length, nEntries)
  assert.equal(tracker.samples, nSamples, '★ 冇郁过就唔可以清走样本')
  const after = pc.readout(a.step)
  assert.equal(after.trusted, true)
  assert.equal(after.entry.id, before.entry.id)
})

test('windPoseDragging 未接线（undefined）→ 退返 quietMs 估算，行为同以前一样', () => {
  const { sched, pc } = makeRig()
  pc.notePose(IDENTITY_POSE, 1000, 0)
  const a = feedUntilSettled(pc, { cd: 1.0, area: 1000, step0: sched.minSteps + 20 })
  pc.notePose(rotY(15), 2000, a.step)
  assert.equal(pc.tick(2000, a.step, undefined), 'dragging')
  assert.equal(pc.tick(2100, a.step, undefined), 'dragging', '静 100ms < quietMs 140 → 仲拖紧')
  assert.equal(pc.tick(2200, a.step, undefined), 'settling')
  assert.equal(pc.explicitDrag, false)
})

/* ══════════════════════════ ⑨ UI 转接（WindPoseCompare.tsx 嘅 store 形状） */

test('★ toWindPoseRecords：id 转 string、比值照过、【蓄意冇 dragN】', () => {
  const { sched, pc } = makeRig()
  pc.notePose(IDENTITY_POSE, 1000, 0)
  const a = feedUntilSettled(pc, { cd: 1.0, area: 1000, step0: sched.minSteps + 20 })
  pc.notePose(rotY(90), 2000, a.step)
  pc.tick(2500, a.step)
  feedUntilSettled(pc, { cd: 1.2, area: 500, step0: pc.relaxUntilStep })

  const recs = toWindPoseRecords(pc.compare())
  assert.equal(recs.length, 2)
  for (const r of recs) {
    assert.equal(typeof r.id, 'string', 'WindPoseCompare.tsx 要 string id 做 React key')
    // ★ 绝对阻力（带住实测 2.0–2.2× 增益）唔可以流出去 store ★
    assert.equal('dragN' in r, false, '★ 蓄意缺栏：绝对阻力唔可以摆落 store 畀人第日「顺手」显示')
    assert.equal('cd' in r, false, '★ 绝对 Cd 一样唔可以流出去')
  }
  assert.equal(recs[0].isReference, true)
  assert.equal(recs[1].isReference, false)
  assert.ok(Math.abs(recs[1].dragRatio - 0.6) < 1e-12)
  assert.ok(Math.abs(recs[1].deltaPct + 40) < 1e-9)
  assert.ok(Math.abs(recs[1].frontalAreaMM2 - 500) < 1e-9)
  assert.notEqual(recs[0].id, recs[1].id, 'React key 要唯一')
  // 未有任何记录嗰阵要出空数组（张卡见到空就唔画，唔会砌假数）
  const empty = makeRig().pc
  assert.deepEqual(toWindPoseRecords(empty.compare()), [])
})

test('isNewPose() 唔可以有副作用（driver 想先试 setPose 再认）', () => {
  const { pc } = makeRig()
  pc.notePose(IDENTITY_POSE, 1000, 0)
  const st = pc.state
  assert.equal(pc.isNewPose(rotY(30)), true)
  assert.equal(pc.isNewPose(rotY(30)), true, '问两次答案要一样')
  assert.equal(pc.state, st, '★ 净係问，唔可以郁状态')
  assert.equal(pc.isNewPose(IDENTITY_POSE), false)
  assert.equal(pc.isNewPose(null), false)
  assert.equal(pc.isNewPose([1, 2, 3]), false)
  // 唔合法嘅位姿唔可以令状态机乱郁
  assert.equal(pc.notePose([1, 2, 3], 2000, 0).reason, 'invalid')
  assert.equal(pc.state, st)
})
