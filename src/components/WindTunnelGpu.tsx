// WindTunnelGpu.tsx —— GPU LBM 风洞嘅【驱动器】。冇任何可见输出（永远 return null）：
// 佢做嘅事係喺 useFrame 入面推 solver、量收敛、然后把一个 WindResult 兼容嘅结果写返 store，
// 由现有嗰几个渲染组件（WindOverlay / WindStreaks / WindSmoke / WindLegend）照旧画。
//
//
// ★★ 一、点解係「驱动器」而唔係「求解器组件」★★
// ─────────────────────────────────────────
// CPU 引擎係「跑一次 → 等 → 凍結」（worker 入面同步跑完先返）。GPU 引擎冇呢个奢侈：
// solver 而家同 CAD 视窗争【同一个】帧预算。所以呢度每帧只行几个 substep，
// 而「几个」係由实测帧时间反推嘅（见 convergence.substepBudget）。
//
//
// ★★ 二、收敛只可以由 pollForce() 驱动 ★★
// ────────────────────────────────────
// readback 迟一两帧（asyncReader.ts）。用帧计数器采样量到嘅係帧率抖动，唔係涡脱落。
// 所以呢度每帧【无条件】写 `tracker.push(solver.pollForce())` —— null 就係「今帧冇新数字」，
// tracker 自己识分。呢句嘅形状本身就係防线，唔好改成 `if (…) tracker.push(lastCd)`。
//
//
// ★★ 三、Cd 诚实条款 ★★
// ────────────────────
// GPU 嘅 Cd 係【纯动量交换】：边界 link 上面 dP 求和，冇任何经验摩擦项。CPU 嗰个係
// 压力积分形阻 + 平板 Cf 经验摩擦。两个数唔可以直接比 —— 所以结果对象一定带
// `engine:'gpu'` + `cdBasis:'momentum-exchange'` + `cdNote`，面板要原文显示。
// 见 convergence.ts 嘅 CD_COMPARE_NOTE。
//
//
// ★★ 四、点解结果仲係打包 RGBA8 volData ★★
// ───────────────────────────────────
// 计划书原本想把 solver 嘅 RGBA16F 3D texture 直接餵畀 WindStreaks/WindSmoke。做唔到 ——
// 嗰两个组件係读 `windResult.volData`（Uint8Array）自己起 Data3DTexture 嘅，而呢个 stage
// 唔准掂佢哋。所以呢度收敛之后 readMacro() 一次（会停 pipeline，但一次而已）然后照 CPU
// 嗰个 RGBA8 量化打包。★ 直接餵 16F 係 follow-up，要同时改嗰两个渲染器 ★。
//
//
// ★★ 五、面板唔见人 = 硬暂停 ★★
// ───────────────────────────
// windMode === 0（面板閂咗）或者 document.hidden → 一步都唔行。唔係「行慢啲」，係零。
// 唔咁做嘅话，用户閂咗面板去做建模，个 GPU 仲喺度食紧 60% 帧预算，而佢永远唔会知点解卡。
//
//
// ★★ 六、互动驱动（拖住零件转朝向，流场逐帧跟住变）★★
// ────────────────────────────────────────────────
// store 落一个 `windPose`（16 个 number，★ column-major = three Matrix4.elements ★，
// 语义係「相对建 solver 嗰阵烘焙落去嘅几何」嘅刚体 delta，identity = 冇郁过）。
// 呢度每帧读一次，变咗就 `solver.setPose(m, { keepFlow: true })`。
//
//  · 位姿一变 → ConvergenceTracker 即刻 reset。旧姿态嘅力唔可以撈落新姿态嘅收敛窗口
//    （呢个 bug 唔会 crash，佢只会喺你转完朝向之后即刻畀返上一个朝向嘅数字）。
//  · 拖拽期间【一个样本都唔收】、【一个数都唔报】。放手静够 quietMs 先入 settling，
//    再过一段 relax（流场重建嘅过渡期）先开始收样本 —— 全部逻辑喺 poseCompare.ts，
//    headless 测得到（tests/lbm-pose-driver.test.mjs）。
//  · ★ setPose 由另一条 agent 同时喺度写 ★ —— 所以呢度係 feature-detect + try/catch：
//    佢未落地嘅时候呢个档案照编译、照跑，只係降级成「唔支援拖拽」。
//  · ★ 呢度只报比值 / Δ%，唔卖绝对 Cd ★：真机实测 GPU 球体 Cd 係 Clift-Gauvin 嘅
//    2.0–2.2 倍而且三个解析度都唔飘（= 常数系统增益，根因未查）。常数增益喺 A/B 比值
//    入面会消掉，所以「边个朝向阻力细 12%」而家讲得，「Cd = 0.47」讲唔得。
//    见 poseCompare.POSE_COMPARE_NOTE。
//
//
// ★★ 七、帧预算：三种情境三个上限 ★★
// ──────────────────────────────
// solver 同 CAD 视窗争同一个帧预算，而拖拽嗰阵用户嘅手指就係最高优先。所以：
//   拖拽中   → DRAG_FRAME_BUDGET_MS + substep 上限打三折（互动 > 收敛速度）
//   求解中   → FRAME_BUDGET_MS（≈38fps，够顺又留返时间畀 solver）
//   live 闲置 → LIVE_FRAME_BUDGET_MS（已收敛净係「保持流场生动」，唔可以再抢帧）
// 三个都係行返 convergence.substepBudget，冇另起炉灶。

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Matrix4, WebGLRenderer } from 'three'

import { useApp, moldTargetMesh } from '../store'
import { voxelize } from '../analysis/voxelfea'
import { WIND_FLUIDS } from '../analysis/windtunnel'
import type { WindResult } from '../analysis/windtunnel'
import {
  LbmGpu, QUALITY_TIERS, bakePhi, buildDomain, createLbmSolver, isContextLostError, probeMRT,
} from '../analysis/lbm/lbmGpu'
import type { MrtReport, PhiField, SolverReport, TierName, WindDomain } from '../analysis/lbm/lbmGpu'
import { OMEGA_MINUS, U_LB, lambdaFromOmegas } from '../analysis/lbm/lattice'
import {
  CD_COMPARE_NOTE, ConvergenceTracker, GPU_CD_BASIS, blendFrameMs, planSchedule, substepBudget,
} from '../analysis/lbm/convergence'
import type { CdBasis, ConvStats } from '../analysis/lbm/convergence'
import {
  GPU_CD_GAIN_RANGE, POSE_AREA_NOTE, POSE_COMPARE_NOTE, PoseCompare, isRigidPose,
} from '../analysis/lbm/poseCompare'
import type { PoseCompareTable, PoseState } from '../analysis/lbm/poseCompare'

/* ════════════════════════════════════════════════ store 旁路（key 未落地都照跑） */

// 呢几个 key 由 monolith owner 补落 store.ts。喺佢落地之前呢个档案照编译、照跑 ——
// 同 WindStreaks.tsx 嘅 useKnob() 一模一样嘅防御式读法。
// ★ windEngine 预设一定係 'cpu' ★：球体 Cd 验证过之前，GPU 引擎唔可以静静鸡变咗默认。
type GpuKnobs = {
  windEngine?: 'cpu' | 'gpu'
  windLive?: boolean
  windSubsteps?: number
  windTier?: 'auto' | TierName
  /**
   * 零件位姿：16 个 number，★ column-major，逐 index 等于 three `Matrix4.elements` ★。
   * 语义 = 相对【建 solver 嗰阵烘焙落去嘅几何】嘅刚体 delta（identity = 冇郁过），
   * 唔係世界矩阵 —— 传世界矩阵落去零件会即刻飞出个域外面。
   * 接线：撳落零件嗰刻记住 M0，之后 `windPose = (M_now · M0⁻¹).elements`。
   *
   * ★ 同 WindObjectGizmo.tsx 嘅约定【逐字一样】★（佢文件头写住）：
   *   `posedPointCad = windPoseMatrix ⋅ originalPointCad`，identity = 冇改过嘅原始摆位。
   *   我哋 solver 烘焙嘅就係「原本未郁过嘅 CAD 几何」（moldTargetMesh），所以直接食得。
   */
  windPose?: number[]
  /**
   * 用户而家係咪撳住手柄拖紧（WindObjectGizmo 嗰边写）。
   * ★ 可有可无 ★ —— 冇呢个 key 嘅话 PoseCompare 会退返「静咗 quietMs 就当放咗手」嘅估算；
   * 有嘅话就快 140ms、而且撳落手柄嗰刻即刻停收样本。
   */
  windPoseDragging?: boolean
}

/**
 * ★★ setPose 嘅签名合约（已锁死，由 lbmGpu.ts 嗰条线落地）★★
 *
 *     setPose(m: Matrix4, opts?: { keepFlow?: boolean }): void      // 非刚体矩阵会 throw
 *
 * 佢而家仲写紧，所以呢度【一定】要 feature-detect：`typeof solver.setPose === 'function'`。
 * 未落地嗰阵呢个档案照编译、照跑，只係降级成「唔支援拖拽」（PoseCompare.disable()）。
 */
type PoseCapableSolver = { setPose?: (m: Matrix4, opts?: { keepFlow?: boolean; countRefill?: boolean }) => void }

/** 推一个位姿落 solver。★ 唯一一处掂 setPose 嘅地方 ★。返 null = 成功，返 string = 错误讯息。 */
function applySolverPose(solver: LbmGpu, m: Matrix4, dragging = false): string | null {
  const fn = (solver as unknown as PoseCapableSolver).setPose
  if (typeof fn !== 'function') return 'solver.setPose 未落地（lbmGpu.ts 嗰条线未 merge）'
  try {
    /* keepFlow: true —— 唔重置流场，咁拖拽先至係「流场逐帧跟住变」而唔係「每格重头计一次」
     *
     * countRefill: 拖拽期间熄咗。★ 呢个係实测出嚟嘅，唔係猜 ★ —— RTX 5070 Ti、88×66×66 域：
     *   setPose 全程 8.77ms，其中 refill 诊断计数（CPU vote27 扫外接球并集 6859 格）占 7.99ms，
     *   GPU 嗰个 _rebuildSolid pass 本身先至 ~0.8ms。拖拽每帧都 setPose，唔熄就白白蚀一半帧预算。
     *   refill 数【纯诊断】，物理一个 bit 都唔靠佢；熄咗嗰阵 report 报 -1（= 冇量过，唔係 0）。
     *   放手之后（dragging=false）照计返，所以 settle 落嚟嗰个报告数字齐全。 */
    fn.call(solver, m, { keepFlow: true, countRefill: !dragging })
    return null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

/* ════════════════════════════════════════════════════════════ 结果对象 */

/**
 * WindResult + GPU 专属嘅【全部 optional】附加栏位。
 *
 * ⚠ 呢个 interface 係过渡期嘅嘢：一旦 monolith owner 把 `engine? / cdBasis? / cdNote?`
 *   append 落 windtunnel.ts 嘅 WindResult，呢度可以收返得净 gpu* 几个。
 *   ★ 一律 optional + append-only ★ —— 旧存档 / downloadWindReport / exportSimReport
 *   要逐字节相容（同当年 volData 一样嘅规矩）。
 */
export interface GpuWindResult extends WindResult {
  engine?: 'cpu' | 'gpu'
  /** Cd 係点量出嚟嘅。面板【一定要】显示 —— 冇呢个 tag 两个引擎嘅数字就冇得解释 */
  cdBasis?: CdBasis
  cdNote?: string
  gpuTier?: string
  gpuSubsteps?: number
  /** 反弹 link 数；0 = 条流掂唔到零件（Cd 冇意义） */
  gpuLinks?: number
  gpuAtlas?: [number, number]
  gpuVramMB?: number
  /** 收敛窗口嘅 (max−min)/|mean| —— 「差几远先收敛」 */
  gpuSpread?: number

  /* ── 位姿对比（拖拽驱动）。★ 有呢几个栏位嘅时候，面板要卖比值唔好卖 cd ★ ── */
  /**
   * ★ true = 上面个 `cd` 係【未校正嘅趋势值】★
   * 实测常数系统增益 2.0–2.2×（见 gpuCdGainRange）。面板显示绝对 Cd 嘅话一定要标住。
   */
  gpuCdTrendOnly?: boolean
  /** 实测增益范围，畀面板讲得出「高几多」 */
  gpuCdGainRange?: [number, number]
  /** 诚实文案（比值可信 / 绝对唔可信）—— 面板要原文显示 */
  gpuCdTrendNote?: string
  /** 点解跨朝向要睇 Cd×A 而唔係 Cd */
  gpuAreaNote?: string
  gpuPoseState?: PoseState
  /** 人睇得明嘅位姿描述（「绕 (0,1,0) 32°」） */
  gpuPoseLabel?: string
  /** 位姿对比表（比值 + Δ% + 噪声底）。★ 面板嘅主角就係佢 ★ */
  gpuPoseTable?: PoseCompareTable
  /** 一行字嘅结论：「位姿 #3 vs 参考 #1：阻力细咗 −12.4%」 */
  gpuPoseLine?: string
}

/* ════════════════════════════════════════════════════ 结果打包（唯一一次 GPU→CPU 大读） */

const EPS_MASKELL = 0.96      // ★ 同 windtunnel.ts:324 同一个数 ★ —— 唔同就冇得比

interface PackCtx {
  fluidName: string
  rho: number
  mu: number
  speed: number
  res: number
  areaMM2: number
  links: number
  warnings: string[]
  report: SolverReport
}

/**
 * 由 solver 嘅 macro 场砌一个 WindResult。
 *
 * ★ 呢个 function 会 readMacro() —— 会停低条 pipeline ★。所以佢只可以喺收敛/封顶嗰一刻
 * call 一次（live 模式係低频重发）。逐帧 call = 每帧强制 CPU 等 GPU 排干。
 */
function packResult(solver: LbmGpu, stats: ConvStats, ctx: PackCtx): GpuWindResult {
  const dom = solver.domain
  const { DX, DY, DZ, h, obst, fa, ca, cb, sign } = dom
  const m = solver.readMacro()
  const idxOf = (x: number, y: number, z: number) => x + DX * (y + DY * z)
  const DN = DX * DY * DZ

  // ── 速度场（格子单位）。固体格 = 0：流线撞到壁就自然停低，唔会穿模 ──
  const vfield = new Float32Array(DN * 3)
  for (let n = 0; n < DN; n++) {
    if (obst[n]) continue
    vfield[n * 3] = m.ux[n]; vfield[n * 3 + 1] = m.uy[n]; vfield[n * 3 + 2] = m.uz[n]
  }

  // ── 表面 Cp + 表面流速（windtunnel.ts:340-355 逐条搬）──
  // 偏差形式之下 delta = rho − 1，所以 Cp = delta / (3·½u_lb²) 直接得，唔使再减 1。
  const halfU2 = 0.5 * U_LB * U_LB
  const vm = dom.volMatrix
  const toCad = (x: number, y: number, z: number, out: number[]): void => {
    // volMatrix 係【cell-centre 约定】：cell i 嘅中心係 i + 0.5（同 WindSmoke 嘅 texcoord = p/N 同源）
    const px = x + 0.5, py = y + 0.5, pz = z + 0.5
    out[0] = vm[0] * px + vm[1] * py + vm[2] * pz + vm[3]
    out[1] = vm[4] * px + vm[5] * py + vm[6] * pz + vm[7]
    out[2] = vm[8] * px + vm[9] * py + vm[10] * pz + vm[11]
  }
  const face = [1, -1, DX, -DX, DX * DY, -DX * DY]
  const cadT = [0, 0, 0]
  const surfCenters: number[] = [], surfCp: number[] = [], surfSpd: number[] = []
  const Vscale = solver.flow.latToMs
  let cpMin = Infinity, cpMax = -Infinity
  for (let z = 1; z < DZ - 1; z++) for (let y = 1; y < DY - 1; y++) for (let x = 1; x < DX - 1; x++) {
    const n = idxOf(x, y, z)
    if (!obst[n]) continue
    let dSum = 0, sSum = 0, cnt = 0
    for (let q = 0; q < 6; q++) {
      const k = n + face[q]
      if (k < 0 || k >= DN || obst[k]) continue
      dSum += m.delta[k]
      sSum += Math.hypot(m.ux[k], m.uy[k], m.uz[k])
      cnt++
    }
    if (!cnt) continue                       // 内部体素 → 唔输出（只着色表面壳）
    const cp = (dSum / cnt) / (3 * halfU2)
    toCad(x, y, z, cadT)
    surfCenters.push(cadT[0], cadT[1], cadT[2]); surfCp.push(cp); surfSpd.push((sSum / cnt) * Vscale)
    if (cp < cpMin) cpMin = cp
    if (cp > cpMax) cpMax = cp
  }
  if (!surfCenters.length) { cpMin = 0; cpMax = 0 }

  // ── 流场采样（箭头）──
  const flowPts: number[] = [], flowVel: number[] = []
  let flowSpeedMax = 0
  const stride = Math.max(2, Math.round(Math.cbrt(DN / 5000)))
  for (let z = 1; z < DZ - 1; z += stride) for (let y = 1; y < DY - 1; y += stride) for (let x = 1; x < DX - 1; x += stride) {
    const n = idxOf(x, y, z)
    if (obst[n]) continue
    const vel = [0, 0, 0]
    vel[fa] = sign * m.ux[n] * Vscale; vel[ca] = m.uy[n] * Vscale; vel[cb] = m.uz[n] * Vscale
    const spd = Math.hypot(vel[0], vel[1], vel[2])
    if (spd > flowSpeedMax) flowSpeedMax = spd
    toCad(x, y, z, cadT)
    flowPts.push(cadT[0], cadT[1], cadT[2]); flowVel.push(vel[0], vel[1], vel[2])
  }

  // ── RK2 流线（windtunnel.ts:373-455 嘅搬迁）──
  // ★ 一定要有 ★：windViz 默认係 'stream'，而 Viewport 嗰个渲染器冇 streamPts 就【咩都唔画】。
  // 冇呢段，用户揀 GPU 引擎之后见到嘅係一片空白，然后合理咁认为 GPU 引擎坏咗。
  const sampleV = (px: number, py: number, pz: number, out: number[]): boolean => {
    if (px < 0 || py < 0 || pz < 0 || px > DX - 1 || py > DY - 1 || pz > DZ - 1) return false
    let x0 = Math.floor(px), y0 = Math.floor(py), z0 = Math.floor(pz)
    if (x0 > DX - 2) x0 = DX - 2
    if (y0 > DY - 2) y0 = DY - 2
    if (z0 > DZ - 2) z0 = DZ - 2
    const fx = px - x0, fy = py - y0, fz = pz - z0
    let vx = 0, vy = 0, vz = 0
    for (let c = 0; c < 8; c++) {
      const ix = x0 + (c & 1), iy = y0 + ((c >> 1) & 1), iz = z0 + ((c >> 2) & 1)
      const w = ((c & 1) ? fx : 1 - fx) * (((c >> 1) & 1) ? fy : 1 - fy) * (((c >> 2) & 1) ? fz : 1 - fz)
      const k = (ix + DX * (iy + DY * iz)) * 3
      vx += w * vfield[k]; vy += w * vfield[k + 1]; vz += w * vfield[k + 2]
    }
    out[0] = vx; out[1] = vy; out[2] = vz
    return true
  }
  const inObst = (px: number, py: number, pz: number): boolean => {
    const i = Math.round(px), j = Math.round(py), k = Math.round(pz)
    if (i < 0 || j < 0 || k < 0 || i >= DX || j >= DY || k >= DZ) return false
    return obst[idxOf(i, j, k)] === 1
  }
  const seedDx = Math.min(DX * 0.15, dom.padUp * 0.5 + 2)
  const y0s = Math.max(1, dom.padA - 0.35 * dom.nA), y1s = Math.min(DY - 2, dom.padA + dom.nA + 0.35 * dom.nA)
  const z0s = Math.max(1, dom.padB - 0.35 * dom.nB), z1s = Math.min(DZ - 2, dom.padB + dom.nB + 0.35 * dom.nB)
  const seeds: number[][] = []
  const NA = 7, NB = 7
  for (let a = 0; a < NA; a++) for (let b = 0; b < NB; b++) {
    seeds.push([seedDx, y0s + (y1s - y0s) * (a / (NA - 1)), z0s + (z1s - z0s) * (b / (NB - 1))])
  }
  // 迎风轮廓加密带：沿 silhouette 补最多 24 条，令零件边缘嘅分离睇得到
  const silh: number[] = []
  for (let z = 0; z < DZ; z++) for (let y = 0; y < DY; y++) {
    for (let x = 0; x < DX; x++) if (obst[idxOf(x, y, z)]) { silh.push(y, z); break }
  }
  const nSil = silh.length / 2, wantSil = Math.max(0, Math.min(24, 64 - seeds.length))
  if (nSil > 0 && wantSil > 0) {
    const st = Math.max(1, Math.floor(nSil / wantSil))
    for (let s = 0; s < nSil; s += st) seeds.push([seedDx, silh[s * 2] + 0.5, silh[s * 2 + 1] + 0.5])
  }
  const H_STEP = 0.4, MAX_STEP = 500, V_TINY = 1e-4
  const streamPtsArr: number[] = [], streamSpeedArr: number[] = [], lineOff: number[] = [0]
  const sp = [0, 0, 0], sv1 = [0, 0, 0], sv2 = [0, 0, 0], scad = [0, 0, 0]
  let streamSpeedMax = 1e-9
  for (const sd of seeds) {
    sp[0] = sd[0]; sp[1] = sd[1]; sp[2] = sd[2]
    if (!sampleV(sp[0], sp[1], sp[2], sv1) || Math.hypot(sv1[0], sv1[1], sv1[2]) < V_TINY) continue
    const base = streamPtsArr.length, baseS = streamSpeedArr.length
    let cnt = 0
    for (let it = 0; it < MAX_STEP; it++) {
      if (inObst(sp[0], sp[1], sp[2])) break                       // 踩到零件即刻停（唔好画入去）
      if (!sampleV(sp[0], sp[1], sp[2], sv1)) break
      const s1 = Math.hypot(sv1[0], sv1[1], sv1[2]); if (s1 < V_TINY) break
      toCad(sp[0] - 0.5, sp[1] - 0.5, sp[2] - 0.5, scad)           // sampleV 用【index 约定】，toCad 用 cell-centre
      streamPtsArr.push(scad[0], scad[1], scad[2])
      const spd = s1 * Vscale; streamSpeedArr.push(spd)
      if (spd > streamSpeedMax) streamSpeedMax = spd
      cnt++
      const inv1 = 1 / s1
      const mx = sp[0] + 0.5 * H_STEP * sv1[0] * inv1
      const my = sp[1] + 0.5 * H_STEP * sv1[1] * inv1
      const mz = sp[2] + 0.5 * H_STEP * sv1[2] * inv1
      if (!sampleV(mx, my, mz, sv2)) break
      const s2 = Math.hypot(sv2[0], sv2[1], sv2[2]); if (s2 < V_TINY) break
      const inv2 = 1 / s2
      sp[0] += H_STEP * sv2[0] * inv2; sp[1] += H_STEP * sv2[1] * inv2; sp[2] += H_STEP * sv2[2] * inv2
    }
    if (cnt >= 2) lineOff.push(streamPtsArr.length / 3)
    else { streamPtsArr.length = base; streamSpeedArr.length = baseS }
  }

  // ── volData（RGBA8，同 windtunnel.ts:462-479 逐条一样）──
  // ⚠ 呢个量化係【视觉专用】：±1/255·uMax。Cd / 阻力 / Re 一律唔经佢。
  let volUMax = 1e-6
  for (let n = 0; n < DN; n++) {
    if (obst[n]) continue
    const s = Math.hypot(vfield[n * 3], vfield[n * 3 + 1], vfield[n * 3 + 2])
    if (s > volUMax) volUMax = s
  }
  volUMax = Math.max(volUMax, 1.5 * U_LB)
  const volData = new Uint8Array(DN * 4)
  const volQ = 127 / volUMax
  for (let n = 0; n < DN; n++) {
    const o = n * 4
    if (obst[n]) { volData[o] = 128; volData[o + 1] = 128; volData[o + 2] = 128; volData[o + 3] = 255; continue }
    volData[o] = 128 + Math.max(-127, Math.min(127, Math.round(vfield[n * 3] * volQ)))
    volData[o + 1] = 128 + Math.max(-127, Math.min(127, Math.round(vfield[n * 3 + 1] * volQ)))
    volData[o + 2] = 128 + Math.max(-127, Math.min(127, Math.round(vfield[n * 3 + 2] * volQ)))
    volData[o + 3] = 0
  }

  // ── Cd / 阻力 ──
  // ★ cd 係【纯动量交换】★，冇经验摩擦项；Maskell 堵塞修正係另一回事（风洞壁效应，
  //   同 Cd 点量无关），所以照 CPU 一样加，两个引擎先至用同一把尺睇「堵唔堵」。
  const cd = stats.cd
  const areaMM2 = ctx.areaMM2 > 0 ? ctx.areaMM2 : dom.frontalAreaMM2
  const blockage = dom.frontalCells / (DY * DZ)
  const cdCorr = cd / (1 + EPS_MASKELL * cd * blockage)
  const dragN = cd * 0.5 * ctx.rho * ctx.speed * ctx.speed * (areaMM2 * 1e-6)

  const warnings = ctx.warnings.slice()
  if (!stats.converged) warnings.push(`未收敛（行咗 ${solver.stepCount} substep 就撞到上限）—— Cd 係末段时均，仲喺度飘`)
  if (!(ctx.links > 0)) warnings.push('★ 一条反弹 link 都冇：条流根本掂唔到零件 —— 呢个 Cd 冇意义')
  if (stats.cdSigned < 0) warnings.push(`★ 阻力方向係 −X（cd_signed = ${stats.cdSigned.toFixed(3)}）—— 来流係 +X，动量交换嘅符号可能反咗`)

  return {
    h,
    nSurf: surfCp.length,
    centers: Float32Array.from(surfCenters), cp: Float32Array.from(surfCp), surfSpeed: Float32Array.from(surfSpd),
    flowPts: Float32Array.from(flowPts), flowVel: Float32Array.from(flowVel), flowSpeedMax,
    dragN: Math.abs(dragN), cd,
    re: solver.flow.reReal, reLb: solver.flow.reLbEffective,
    frontalAreaMM2: areaMM2, refLenM: dom.refLenM, speed: ctx.speed,
    fluidName: ctx.fluidName, rho: ctx.rho, mu: ctx.mu,
    steps: solver.stepCount, converged: stats.converged,
    cpMin, cpMax, res: ctx.res, bumped: false, warnings,
    cdCorr, blockage, reClamped: solver.flow.reClamped, cdOsc: stats.cdOsc,
    ...(lineOff.length > 1 ? {
      streamPts: Float32Array.from(streamPtsArr),
      streamSpeed: Float32Array.from(streamSpeedArr),
      streamLineOffsets: Uint32Array.from(lineOff),
      streamSpeedMax,
    } : {}),
    volData, volDims: [DX, DY, DZ] as [number, number, number], volUMax, volMatrix: dom.volMatrix,
    latInletU: U_LB, latToMs: Vscale,
    rake: { x: seedDx + 0.5, y0: y0s + 0.5, y1: y1s + 0.5, z0: z0s + 0.5, z1: z1s + 0.5 },
    // ── GPU 专属（全部 optional）──
    engine: 'gpu',
    cdBasis: GPU_CD_BASIS,
    cdNote: CD_COMPARE_NOTE,
    gpuTier: String(ctx.report.tier),
    gpuSubsteps: solver.substeps,
    gpuLinks: ctx.links,
    gpuAtlas: [ctx.report.atlas.width, ctx.report.atlas.height],
    gpuVramMB: Math.round(ctx.report.vram.total / 1048576),
    gpuSpread: stats.spread,
  }
}

/* ════════════════════════════════════════════════════════════ 组件 */

interface Live {
  solver: LbmGpu | null
  tracker: ConvergenceTracker | null
  /** 位姿记帐（揸住【同一个】tracker —— 收敛判据只可以有一份） */
  pc: PoseCompare | null
  report: SolverReport | null
  ctx: PackCtx | null
  ready: boolean
  /** ready() 仲喺度等紧（唔可以喺呢段时间 advance） */
  compiling: boolean
  substeps: number
  maxSubsteps: number
  /** 开始拖拽之前个 substep 数 —— ★ 呢个係量过嘅数，放手嗰刻直接摆返上去衝 settle ★ */
  substepsPreDrag: number
  /** 上一帧係咪 dragging（用嚟捉状态转变，唔使 PoseCompare 出 callback） */
  dragging: boolean
  frameMs: number
  lastT: number
  lastProgT: number
  lastPublishT: number
  published: boolean
  areaMM2: number
  links: number
  dead: string
  /** solver 有冇 setPose（feature-detect 结果，DEV 探针要睇） */
  poseSupported: boolean
  /** 位姿推唔落去嘅原因（空 = 冇事） */
  poseErr: string
  /** 逐帧重用，唔好喺 useFrame 入面 new Matrix4 */
  m4: Matrix4
}

/** 一帧最多畀 solver 食几多 ms（余返嘅係 CAD 视窗 + React）。 */
const FRAME_BUDGET_MS = 26          // ≈38 fps：够顺，又留返足够 GPU 时间畀 solver
/**
 * ★ live 模式已收敛之后嘅帧预算 ★
 * 呢阵时 solver 做嘅係「保持流场生动」，唔係赶收敛 —— 冇任何理由再食 CAD 嗰份。
 * 用 16.7ms 做目标即係「成个 app 60fps」，substepBudget 会自己退到食得起嘅步数。
 */
const LIVE_FRAME_BUDGET_MS = 16.7
/** ★ 拖拽中：用户嘅手指最大 ★ —— 宁愿慢啲 settle，都唔可以拖到窒。 */
const DRAG_FRAME_BUDGET_MS = 12
/** 拖拽中 substep 上限 = 平时上限嘅几多（打三折）。 */
const DRAG_SUBSTEP_FRAC = 0.34
/** live 模式重发结果嘅最低间隔 —— packResult 会停 pipeline，唔可以逐帧做。 */
const LIVE_PUBLISH_MS = 1500
const PROGRESS_MS = 120

/**
 * 每帧同步一次位姿。★ 一定要喺「已收敛就冻结」嗰个 gate 之【前】call ★
 * —— 否则收敛之后拖零件 = 咩都唔发生（solver 已经冻结，永远见唔到新位姿）。
 */
function syncPose(S: Live, solver: LbmGpu, nowMs: number, invalidate: () => void): void {
  const pc = S.pc
  if (!pc) return
  if (pc.enabled) {
    // ★ 用 getState() 而唔係 useApp 选择器 ★：拖拽期间位姿每帧都变，用 selector 就係
    //   每帧 re-render 一个永远 return null 嘅组件 —— 白畀 React 做嘢，仲会重建 DEV 探针。
    const knobs = useApp.getState() as unknown as GpuKnobs
    const pose = knobs.windPose
    if (pose) {
      const tr = pc.notePose(pose, nowMs, solver.stepCount)
      if (tr.changed) {
        S.published = false                    // 新姿态要重新出报告
        if (tr.needsSolverPose) {
          // 非刚体（用户拉紧 scale / 镜像）就唔好送落去食 exception —— setPose 会 throw
          const err = !isRigidPose(pose)
            ? '位姿唔係刚体（有缩放或者镜像）—— LBM 只食旋转 + 平移'
            // 第三个参数 = 而家係咪拖紧 → 拖紧就熄 refill 诊断（慳返实测 7.99ms/帧，见 applySolverPose）
            : applySolverPose(solver, S.m4.fromArray(pose), pc.state === 'dragging' || !!knobs.windPoseDragging)
          if (err) {
            S.poseErr = err
            S.poseSupported = false
            // ★ 唔可以扮冇事继续报数 ★：solver 入面嘅几何而家同 store 嘅位姿唔同步，
            //   继续报就係攞住旧几何嘅力扮新姿态嘅结果 —— 正正係呢条线要挡嘅嗰种谎话。
            pc.disable('拖拽求解停用：' + err)
            useApp.setState({
              status: '⚠ GPU 风洞：位姿推唔落 solver（' + err + '）—— 拖拽实时求解已停用，其余照旧',
            })
          } else {
            S.poseSupported = true
          }
        }
        invalidate()
      }
      // windPoseDragging 未接线（undefined）→ tick 自己会退返「静咗 quietMs 就当放咗手」
      pc.tick(nowMs, solver.stepCount, knobs.windPoseDragging)
    }
  }
  // substep 策略：拖拽一开始就记住而家个数，放手嗰刻直接摆返上去。
  // ★ 呢个唔係「估个大数」★ —— 係拖拽之前实测撑得住嘅值，所以摆返去係安全嘅；
  //   substepBudget 嘅「加要慢」係为咗试一个未知嘅上限，呢度个上限已经知。
  if (!S.dragging && pc.state === 'dragging') {
    S.substepsPreDrag = S.substeps
    S.dragging = true
  } else if (S.dragging && pc.state !== 'dragging') {
    S.substeps = Math.max(S.substeps, S.substepsPreDrag)
    S.dragging = false
  }
}

export default function WindTunnelGpu() {
  const engine = useApp((s) => (s as unknown as GpuKnobs).windEngine ?? 'cpu')
  const live = useApp((s) => (s as unknown as GpuKnobs).windLive ?? false)
  const substepPref = useApp((s) => (s as unknown as GpuKnobs).windSubsteps ?? 0)
  const tierPref = useApp((s) => (s as unknown as GpuKnobs).windTier ?? 'auto')
  const windMode = useApp((s) => s.windMode)
  const windSpeed = useApp((s) => s.windSpeed)
  const windFluid = useApp((s) => s.windFluid)
  const windAxis = useApp((s) => s.windAxis)
  const windSign = useApp((s) => s.windSign)
  const bodyMesh = useApp((s) => s.bodyMesh)
  const selComp = useApp((s) => s.selectedComponent)
  const nComp = useApp((s) => s.components.length)

  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)

  const L = useRef<Live>({
    solver: null, tracker: null, pc: null, report: null, ctx: null,
    ready: false, compiling: false,
    substeps: 6, maxSubsteps: 24, substepsPreDrag: 6, dragging: false,
    frameMs: NaN, lastT: 0, lastProgT: 0, lastPublishT: 0,
    published: false, areaMM2: 0, links: 0, dead: '',
    poseSupported: false, poseErr: '', m4: new Matrix4(),
  })

  // ── 能力探测：★ allocate 任何嘢之前 ★（probeMRT.ts 文件头讲晒点解）──
  const caps: MrtReport = useMemo(() => {
    try {
      const r = probeMRT(gl.getContext() as WebGL2RenderingContext)
      // probe 郁过 raw GL state（framebuffer / viewport / drawBuffers）→ three 唔知道
      gl.resetState()
      return r
    } catch {
      return probeMRT(null)
    }
  }, [gl])

  // ── 唔够料就【出声】退返 CPU，唔可以静静鸡降级（照抄 WindSmoke.tsx:208-218 嗰个 pattern）──
  useEffect(() => {
    if (engine !== 'gpu') return
    if (caps.ok && caps.force7) return
    useApp.setState({
      windEngine: 'cpu',
      status: '⚠ GPU 风洞用唔到：' + caps.reason + ' — 已自动切返 CPU 引擎（结果一样有效，只係慢啲）',
    } as Partial<ReturnType<typeof useApp.getState>>)
  }, [engine, caps])

  // ── 建 / 拆 solver。★ deps 一变就整个重建 ★：nearBodyPhi 係烘死喺 shader 嘅，换唔到 ──
  useEffect(() => {
    const S = L.current
    S.solver?.dispose()
    S.solver = null; S.tracker = null; S.pc = null; S.report = null; S.ctx = null
    S.ready = false; S.compiling = false; S.published = false; S.dead = ''
    S.areaMM2 = 0; S.links = 0; S.frameMs = NaN
    S.dragging = false; S.poseSupported = false; S.poseErr = ''

    if (engine !== 'gpu' || !caps.ok || !caps.force7) return

    const st = useApp.getState()
    const tgt = moldTargetMesh(st)
    if (!tgt || !tgt.vertices.length || !tgt.triangles.length) return

    const verts = Float32Array.from(tgt.vertices)
    const tris = Uint32Array.from(tgt.triangles)
    let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity
    for (let i = 0; i + 2 < verts.length; i += 3) {
      const x = verts[i], y = verts[i + 1], z = verts[i + 2]
      if (x < mnx) mnx = x; if (x > mxx) mxx = x
      if (y < mny) mny = y; if (y > mxy) mxy = y
      if (z < mnz) mnz = z; if (z > mxz) mxz = z
    }
    const extent: [number, number, number] = [
      Math.max(1e-6, mxx - mnx), Math.max(1e-6, mxy - mny), Math.max(1e-6, mxz - mnz),
    ]
    const fluid = WIND_FLUIDS[st.windFluid] || WIND_FLUIDS.air
    const flow = { speed: st.windSpeed, rho: fluid.rho, mu: fluid.mu }

    let cancelled = false
    try {
      const built = createLbmSolver(gl, {
        extent,
        // ⚠ voxelize 自己个 maxRes 预设係 64（FEA 预算），会静静鸡钳低我哋要求嘅 res
        voxelizeAt: (r) => voxelize(verts, tris, r, undefined, Math.max(64, r)),
        flow,
        axis: st.windAxis ?? undefined,
        sign: st.windSign,
        measure: true,          // ★ Cd 就係产品 ★
        needVolume: false,      // 我哋出 RGBA8 volData 畀现有渲染器，唔使 solver 逐帧填 3D 体积（省 nz 个 draw call）
        needQ: false,
        maxTier: tierPref !== 'auto' ? tierPref : undefined,
        caps,
      })
      const solver = built.solver
      const rep = built.report
      const sched = planSchedule(solver.domain.DX, U_LB, { rampSteps: rep.flow.rampSteps })
      S.solver = solver
      S.report = rep
      S.tracker = new ConvergenceTracker({ ...sched, cdBasis: GPU_CD_BASIS })
      // ★ 位姿记帐揸住【同一个】tracker ★ —— 收敛判据只可以有一份（见 poseCompare.ts 文件头）。
      //   两个门槛都係物理推出嚟嘅：郁得少过 0.05 格，体素化出嚟根本係同一件几何，
      //   重新烘焙一次只係白烧 GPU；旋转门槛就係「最外面嗰点郁得少过 0.05 格」（≈ 0.1/dLb 弧度）。
      S.pc = new PoseCompare({
        tracker: S.tracker,
        eps: {
          trans: solver.domain.h * 0.05,
          rot: 0.1 / Math.max(1, solver.domain.dLb),
        },
      })
      S.poseSupported = typeof (solver as unknown as PoseCapableSolver).setPose === 'function'
      S.poseErr = S.poseSupported ? '' : 'solver.setPose 未落地 —— 拖拽实时求解未 available'
      S.substeps = substepPref > 0 ? Math.round(substepPref) : rep.substeps
      S.maxSubsteps = Math.max(S.substeps, rep.substeps * 4)
      S.substepsPreDrag = S.substeps
      S.dragging = false
      S.ctx = {
        fluidName: fluid.name, rho: fluid.rho, mu: fluid.mu, speed: flow.speed,
        res: Math.max(1, Math.round(Math.max(extent[0], extent[1], extent[2]) / solver.domain.h)),
        areaMM2: 0, links: 0,
        warnings: rep.warnings.concat(built.attempts.map((a) => `品质阶梯：${a.tier} 试唔到（${a.error}）`)),
        report: rep,
      }
      S.compiling = true
      useApp.setState({
        windBusy: true, windProg: 0, windProgNote: '编译 shader',
        status: `GPU 风洞：${rep.nx}×${rep.ny}×${rep.nz}（${rep.tier}）· ${Math.round(rep.vram.total / 1048576)} MB · 编译 shader…`,
      })
      // ★ 第一个 advance() 之前一定要 await ready() ★：展开十九方向嘅 step shader 有千几行，
      //   force 变体再嚟一次 —— 冷 cache 嗰下 link 会喺主线程卡几百 ms。
      void solver.ready().then(() => {
        if (cancelled || S.solver !== solver) return
        S.compiling = false
        S.ready = true
        useApp.setState({ windProgNote: '求解流场' })
        invalidate()
      }).catch((e: unknown) => {
        if (cancelled || S.solver !== solver) return
        S.compiling = false
        S.dead = e instanceof Error ? e.message : String(e)
        useApp.setState({ windBusy: false, status: '⚠ GPU 风洞 shader 编译失败：' + S.dead })
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      S.dead = msg
      // ★ context lost 唔係「显存唔够」★ —— 细 lattice 救唔到，唔好扮可以 retry
      useApp.setState({
        windBusy: false,
        windEngine: 'cpu',
        status: (isContextLostError(e) ? '⚠ GPU 风洞：WebGL context 遗失（重开页面再试）— ' : '⚠ GPU 风洞起唔到 — ')
          + msg + '；已切返 CPU 引擎',
      } as Partial<ReturnType<typeof useApp.getState>>)
    }

    return () => {
      cancelled = true
      S.solver?.dispose()
      S.solver = null; S.tracker = null; S.pc = null; S.report = null; S.ctx = null
      S.ready = false; S.compiling = false; S.dragging = false
    }
    // ⚠ substepPref 蓄意【唔】喺 deps 入面：拉一拉 substep slider 唔应该掉咗成个流场重头计。
    //   佢喺 useFrame 度每帧读，所以照样即时生效。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, caps, gl, invalidate, windSpeed, windFluid, windAxis, windSign, tierPref, bodyMesh, selComp, nComp])

  // ── 每帧 ──
  useFrame(() => {
    const S = L.current
    const solver = S.solver, tracker = S.tracker, ctx = S.ctx, pc = S.pc
    if (!solver || !tracker || !ctx || !pc || !S.ready || S.compiling || S.dead) return
    // ★ 面板閂咗 / tab 唔见人 = 硬暂停 ★（唔係行慢啲，係零）
    // ⚠ 暂停嗰阵一定要把 lastT 清零：唔清嘅话 resume 嗰一帧个 dt 係「暂停咗几耐」，
    //   EMA 会即刻爆 → substep 跌到 1，然后要几十帧先爬返上嚟。
    if (windMode === 0 || (typeof document !== 'undefined' && document.hidden)) {
      S.lastT = 0
      return
    }

    const now = performance.now()

    // ★★ 位姿一定要喺「已收敛就冻结」嗰个 gate 之【前】同步 ★★
    // 收敛之后 solver 係冻结嘅（done && !live 就 return）。位姿检查摆咗喺 gate 之后嘅话，
    // 用户喺一个已收敛嘅流场度拖零件 = 永远冇人见到佢郁过。
    syncPose(S, solver, now, invalidate)

    // ★ 用 pc.finished()，唔可以用 tracker.finished() ★
    // setPose(…,{keepFlow:true}) 之后 solver.stepCount 係继续数落去嘅全局计数器，而
    // tracker 嘅上限 schedule.maxSteps 係个绝对数 —— 第一次求解行完就贴住顶，第二个位姿
    // 一开始就会即刻「行完」，然后攞住零个样本出报告。pc 每个位姿有自己嘅 deadline。
    // （未接线 windPose 嗰阵 pc 留喺 idle，佢自己会转交返 tracker.finished，逐个数一样。）
    const done = pc.finished(solver.stepCount)
    if (done && !live) {
      S.lastT = 0
      return
    }

    if (S.lastT > 0) S.frameMs = blendFrameMs(S.frameMs, now - S.lastT)
    S.lastT = now

    // ── 帧预算：三种情境三个上限（★ 全部行返 substepBudget，冇另起炉灶 ★）──
    //   拖拽中   → 互动优先：预算细、substep 上限打三折
    //   live 闲置 → 已收敛净係「保持流场生动」，唔可以再同 CAD 抢帧
    //   其余     → 赶收敛
    const dragging = pc.state === 'dragging'
    const budgetMs = dragging ? DRAG_FRAME_BUDGET_MS : (done && live) ? LIVE_FRAME_BUDGET_MS : FRAME_BUDGET_MS
    // ★ 加要慢、减要快 ★（见 convergence.substepBudget）
    const want = substepPref > 0
      ? Math.max(1, Math.round(substepPref))
      : substepBudget({ current: S.substeps, frameMs: S.frameMs, budgetMs, min: 1, max: S.maxSubsteps })
    // 拖拽嗰阵连用户钉死嘅 substepPref 都要压 —— 手指嘅优先级高过一个 slider，
    // 而放手嗰一刻 syncPose 会即刻摆返上去，所以钉嗰个值一帧都冇蚀底。
    S.substeps = dragging
      ? Math.max(1, Math.min(want, Math.round(S.maxSubsteps * DRAG_SUBSTEP_FRAC)))
      : want

    try {
      solver.advance(S.substeps)
    } catch (e) {
      S.dead = e instanceof Error ? e.message : String(e)
      useApp.setState({ windBusy: false, status: '⚠ GPU 风洞行到一半死咗：' + S.dead })
      return
    }

    // ★★ 收敛采样：唯一正确嘅写法 ★★ —— null 都照 push，tracker 自己分辨「今帧冇新数字」
    // pc.push() 係 tracker.push() 嘅【闸】：拖拽中 / 流场过渡期一律唔转交，
    // 其余照原封不动交落去。所以呢句嘅形状同以前一样，冇多咗一条收敛判据。
    const sample = solver.pollForce()
    pc.push(sample)
    if (sample) { S.areaMM2 = sample.frontalAreaMM2; S.links = sample.links }

    const finished = pc.finished(solver.stepCount)
    // live 模式 / 未行完 / 仲喺过渡态 → 一定要继续叫帧，否则 on-demand 嘅 frameloop 会瞓着
    if (!finished || live || pc.state === 'dragging') invalidate()

    // 进度（节流；同 runWindSolve 一样 120ms）
    if (!finished && now - S.lastProgT > PROGRESS_MS) {
      S.lastProgT = now
      const p = pc.progress(solver.stepCount)
      // ★ 过渡态嘅文案一定要讲明「未可信」★ —— 呢个係用户唯一见到嘅诚实提示
      const note = pc.state === 'dragging'
        ? '拖拽中（唔收样本）'
        : pc.state === 'settling' && pc.entries.length > 0
          ? '新姿态：流场重建中（数字未可信）'
          : tracker.phase(solver.stepCount) === 'ramp' ? '入口渐升' : '求解流场'
      useApp.setState({
        windProg: p, windProgNote: note,
        status: `GPU 风洞：${note} ${(p * 100).toFixed(0)}% · ${solver.stepCount} step · ${S.substeps} step/帧 · ${tracker.samples} 个 Cd 样本`,
      })
    }

    // 出结果
    const shouldPublish = (finished && !S.published) || (live && finished && now - S.lastPublishT > LIVE_PUBLISH_MS)
    if (!shouldPublish) return
    S.published = true
    S.lastPublishT = now
    // ★ 记帐 ★：收敛嗰阵 pc.push() 自己已经记咗；撞到 deadline 但未收敛嗰阵就係呢句补返，
    //   咁张对比表上面就会有一行标住「未收敛」，而唔係静静鸡当冇发生过。
    const entry = pc.finalize(solver.stepCount)
    const stats = tracker.stats()
    ctx.areaMM2 = S.areaMM2; ctx.links = S.links
    try {
      const r = packResult(solver, stats, ctx)
      const table = pc.compare()
      const line = pc.compareLine()
      // ── 位姿对比（★ 呢啲栏位存在嗰阵，面板要卖比值唔好卖 cd ★）──
      r.gpuCdTrendOnly = true
      r.gpuCdGainRange = [GPU_CD_GAIN_RANGE[0], GPU_CD_GAIN_RANGE[1]]
      r.gpuCdTrendNote = POSE_COMPARE_NOTE
      r.gpuAreaNote = POSE_AREA_NOTE
      r.gpuPoseState = pc.state
      if (entry) r.gpuPoseLabel = entry.label
      if (table.rows.length > 0) r.gpuPoseTable = table
      if (line) r.gpuPoseLine = line
      // ★ 未校正嘅绝对 Cd 一定要标住 ★（实测系统增益 2.0–2.2×，见 POSE_COMPARE_NOTE）
      if (!r.warnings.includes(POSE_COMPARE_NOTE)) r.warnings = r.warnings.concat(POSE_COMPARE_NOTE)
      // ★ 位姿推唔落 solver 嘅时候，个结果係【烘焙嗰阵嘅朝向】嘅 ★ —— 一定要讲，
      //   否则用户见住零件打咗侧，而个数其实係打直嗰个，仲以为已经算咗。
      if (!pc.enabled && pc.disabledReason) {
        r.warnings = r.warnings.concat(
          `★ ${pc.disabledReason} —— 呢个结果係【建 solver 嗰阵嘅朝向】嘅，唔係你而家见到嗰个 ★`,
        )
      }

      const dragStr = r.dragN >= 1 ? `${r.dragN.toFixed(2)} N` : `${(r.dragN * 1000).toFixed(2)} mN`
      useApp.setState({
        windBusy: false, windProg: 1, windProgNote: '完成',
        windResult: r,
        // ★ 有得比就先讲比值 ★ —— 绝对数留喺后面而且逐个标住「未校正趋势值」
        status: (line ? line + ' — ' : '')
          + `GPU 风洞（动量交换 Cd，★ 未校正趋势值：实测偏高 ${GPU_CD_GAIN_RANGE[0]}–${GPU_CD_GAIN_RANGE[1]}× ★）：`
          + `Cd≈${r.cd.toFixed(3)}${(r.cdOsc ?? 0) > 1e-4 ? ` ± ${(r.cdOsc ?? 0).toFixed(3)}` : ''}`
          + ` · 阻力≈${dragStr} · ${solver.stepCount} step${stats.converged ? '（已收敛）' : '（未收敛，达上限）'}`
          + ' — ⚠ 绝对值请用 CPU 引擎；GPU 路径只可以做相对比较',
      })
    } catch (e) {
      S.dead = e instanceof Error ? e.message : String(e)
      useApp.setState({ windBusy: false, status: '⚠ GPU 风洞取场失败：' + S.dead })
    }
  })

  // ── DEV 探针 ──────────────────────────────────────────────────────────
  // ① __lbmGpuValidate()：喺【真 GPU】上面行 lbm.validate.test.ts 嗰四条 GL fixture。
  //    呢啲 fixture 一路都係 headless SKIP 嘅（node 冇 WebGL2）—— 呢度就係佢哋终于跑得到嘅地方。
  // ② __lbmGpu：一眼睇晒 gate（边个 false 就係「点解冇嘢发生」嘅答案）。
  // ③ __lbmGpu.pose()：位姿状态机 + settle 状态 + 对比表，一 call 睇晒
  //    （「点解拖完个数唔郁」= 睇 state / relaxUntil / dropped）。
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as {
      __lbmGpuValidate?: unknown
      __lbmGpu?: unknown
    }
    w.__lbmGpuValidate = (opts?: { includeOom?: boolean }) => runGpuValidation(gl, opts)
    w.__lbmGpu = {
      gate: { engine, windMode, live, hasSolver: !!L.current.solver, ready: L.current.ready, compiling: L.current.compiling, dead: L.current.dead },
      caps,
      report: () => L.current.report,
      stats: () => L.current.tracker?.stats() ?? null,
      rejected: () => L.current.tracker?.rejected ?? null,
      substeps: () => ({
        substeps: L.current.substeps, frameMs: L.current.frameMs, max: L.current.maxSubsteps,
        preDrag: L.current.substepsPreDrag, dragging: L.current.dragging,
        dragCap: Math.max(1, Math.round(L.current.maxSubsteps * DRAG_SUBSTEP_FRAC)),
        budgets: { solve: FRAME_BUDGET_MS, drag: DRAG_FRAME_BUDGET_MS, live: LIVE_FRAME_BUDGET_MS },
      }),
      stepCount: () => L.current.solver?.stepCount ?? -1,
      /** 位姿状态机 + settle 状态 + 对比表 */
      pose: () => {
        const pc = L.current.pc
        if (!pc) return null
        const step = L.current.solver?.stepCount ?? 0
        return {
          // ★ setPose 由另一条 agent 写紧 ★ —— false 就係「点解拖唔郁」嘅答案
          supported: L.current.poseSupported,
          error: L.current.poseErr,
          enabled: pc.enabled,
          disabledReason: pc.disabledReason,
          state: pc.state,
          matrixOrder: 'column-major (three Matrix4.elements)，语义 = 相对烘焙几何嘅 delta',
          pose: pc.pose,
          key: pc.poseKey,
          stepCount: step,
          relaxUntil: pc.relaxUntilStep,
          deadline: pc.deadlineStep,
          relaxSteps: pc.relaxSteps,
          settleCap: pc.settleCap,
          quietMs: pc.quietMs,
          eps: pc.eps,
          finished: pc.finished(step),
          timedOut: pc.timedOut(step),
          progress: pc.progress(step),
          /** 边一种理由掉咗几多个样本 —— 「点解个数唔郁」嘅第一个问题 */
          dropped: pc.dropped,
          trackerRejected: pc.tracker.rejected,
          samples: pc.tracker.samples,
          /** ★ UI 应该问嘅嘢：过渡态攞到嘅係「未可信」而唔係一个数 ★ */
          readout: pc.readout(step),
          entries: pc.entries,
          table: pc.compare(),
          line: pc.compareLine(),
        }
      },
      /** 改参考位姿（面板「以呢个为基准」嘅 console 版）。 */
      setPoseRef: (id: number) => L.current.pc?.setReference(id) ?? false,
    }
    return () => {
      delete (window as unknown as { __lbmGpuValidate?: unknown }).__lbmGpuValidate
      delete (window as unknown as { __lbmGpu?: unknown }).__lbmGpu
    }
  }, [gl, caps, engine, windMode, live])

  // ★ 永远唔画嘢 ★：呢个组件係驱动器。渲染由 WindOverlay / WindStreaks / WindSmoke 做。
  //   engine !== 'gpu' 嗰阵上面所有 effect 都会自己收皮（solver 唔会起），所以呢度统一 null。
  return null
}

/* ══════════════════════════════════════════════════════ DEV：GPU 物理验收 */

export interface ValidateCase {
  name: string
  ok: boolean
  ms: number
  error?: string
  detail?: Record<string, unknown>
}

export interface ValidateReport {
  ok: boolean
  passed: number
  failed: number
  renderer: string
  caps: MrtReport
  cases: ValidateCase[]
}

function vAssert(cond: boolean, msg: string): void { if (!cond) throw new Error(msg) }
function vRel(a: number, b: number, frac: number, msg: string): void {
  const tol = Math.abs(b) * frac + 1e-12
  if (!(Math.abs(a - b) <= tol)) throw new Error(msg + '：' + a + ' vs ' + b + '（±' + (frac * 100).toFixed(0) + '%）')
}

/** 球嘅标准阻力曲线，Clift & Gauvin (1971)。Re < 3e5 之内准到 ±6%。 */
function sphereCd(Re: number): number {
  if (Re <= 0) return Infinity
  if (Re < 0.1) return 24 / Re
  return (24 / Re) * (1 + 0.15 * Math.pow(Re, 0.687)) + 0.42 / (1 + 4.25e4 * Math.pow(Re, -1.16))
}

/** 直接光栅化一个球（唔经 voxelize —— 球嘅体素化唔係我哋喺度测嘅嘢）。 */
function sphereGrid(res: number, diameterMM = 100) {
  const n = res
  const h = diameterMM / n
  const solid = new Uint8Array(n * n * n)
  const c = (n - 1) / 2, r = n / 2
  for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const dx = i - c, dy = j - c, dz = k - c
    if (dx * dx + dy * dy + dz * dz <= (r - 0.5) * (r - 0.5)) solid[i + n * (j + n * k)] = 1
  }
  return { h, nx: n, ny: n, nz: n, ox: 0, oy: 0, oz: 0, solid }
}

/** 一个【冇零件】嘅立方域（手砌：buildDomain 一定要有零件先有迎风面积）。 */
function emptyDomain(n: number): WindDomain {
  return {
    DX: n, DY: n, DZ: n, cells: n * n * n,
    padUp: 0, padDown: 0, padA: 0, padB: 0,
    fa: 0, ca: 1, cb: 2, sign: 1,
    nFlow: 0, nA: 0, nB: 0, h: 1,
    obst: new Uint8Array(n * n * n),
    frontalCells: 1, frontalAreaMM2: 1, dLb: n / 4, refLenM: 0.001,
    bodyCentre: [n / 2, n / 2, n / 2],
    volMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  }
}

/**
 * 让返条主线程一阵。
 *
 * ★ 呢个 yield 唔係礼貌，係【必需】★：pollForce() 要等 fenceSync signal，
 * 而 fence 只会喺 GPU 真係做完啲 command 之后先 signal。喺一个唔放手嘅同步 loop 入面，
 * clientWaitSync(0,0) 会一路 TIMEOUT_EXPIRED，样本永远收唔够 12 个 → fixture 会
 * 报「async readback 冇返嘢」，而其实係我哋自己冇畀过机会佢。
 *
 * ★★ 点解係 MessageChannel 而唔係 setTimeout(0) ★★（实测踩到嘅坑）
 * ────────────────────────────────────────────────────────────
 * 隐藏咗嘅 tab 会畀 Chrome 做 intensive throttling：链式 setTimeout 会由 4 ms 变成
 * 【1000 ms 一次】。球体 Cd fixture 要 ~820 次 yield —— 4 ms 嗰阵係 3 秒，
 * 1000 ms 嗰阵係【十四分钟】。实测：喺一个隐藏 tab 度行，setInterval(100ms) 十秒只跳咗四次。
 * MessagePort 嘅 message 唔受 timer throttling 管，所以隐唔隐藏都一样快。
 * （rAF 更加唔掂：隐藏 tab 根本唔发 rAF —— 同 lbmGpu.ready() 嗰个陷阱一模一样。）
 */
function yieldToBrowser(): Promise<void> {
  if (typeof MessageChannel !== 'function') return new Promise((r) => setTimeout(r, 0))
  return new Promise((resolve) => {
    const ch = new MessageChannel()
    ch.port1.onmessage = () => { ch.port1.close(); ch.port2.close(); resolve() }
    ch.port2.postMessage(0)
  })
}

/**
 * 喺【live renderer】上面行 lbm.validate.test.ts 嘅四条 GL fixture。
 *
 * ⚠ 呢度係嗰四条 fixture 嘅逐条搬迁，唔係另一套测试。任何一边改咗而另一边冇跟，
 *   就係一个 bug —— 请两边一齐改。
 *
 * ⚠ 第 4 条（分配失败要自己 dispose）会【蓄意】试一次 ~40 GB 分配。喺 CAD 视窗自己嗰个
 *   context 上面咁做，最坏情况係整个 viewport 嘅 context 被 driver 收返。所以佢喺一个
 *   【用完即弃】嘅 canvas + renderer 上面行。`includeOom: false` 可以完全跳过佢。
 */
export async function runGpuValidation(
  renderer: WebGLRenderer,
  opts: { includeOom?: boolean } = {},
): Promise<ValidateReport> {
  const gl = renderer.getContext() as WebGL2RenderingContext
  const caps = probeMRT(gl)
  renderer.resetState()
  const cases: ValidateCase[] = []

  const run = async (name: string, body: () => Promise<Record<string, unknown> | void>): Promise<void> => {
    const t0 = performance.now()
    try {
      const detail = await body()
      cases.push({ name, ok: true, ms: Math.round(performance.now() - t0), detail: detail || undefined })
    } catch (e) {
      cases.push({ name, ok: false, ms: Math.round(performance.now() - t0), error: e instanceof Error ? e.message : String(e) })
    } finally {
      renderer.resetState()
    }
  }

  // ── fixture ①：五个 RGBA32F 要真係 clear 得（唔止 COMPLETE）──
  await run('★ 五个 RGBA32F 要真係 clear 得（唔止 COMPLETE）', async () => {
    const r = probeMRT(gl)
    vAssert(r.webgl2, '应该係 WebGL2')
    vAssert(r.levels.length >= 4, '起码要试四组')
    if (r.ok) {
      vAssert(r.supported.indexOf('5 x RGBA32F') >= 0, 'ok=true 但 supported 冇列出嚟')
      vAssert(r.colorBufferFloat, 'RGBA32F 画得但冇 EXT_color_buffer_float？')
    }
    vAssert(gl.getError() === gl.NO_ERROR, 'probe 留低咗 GL error')
    return { supported: r.supported, force7: r.force7, renderer: r.renderer }
  })

  // ── fixture ②：空周期盒行 1000 substep，macro 场要 machine-zero 咁均匀 ──
  await run('★ GPU：空周期盒行 1000 substep，macro 场要 machine-zero 咁均匀', async () => {
    vAssert(caps.ok, 'GPU 唔支援五个 RGBA32F：' + caps.reason)
    const dom = emptyDomain(16)
    const phi = bakePhi(dom)             // 全部 +1：一格固体都冇
    let solver: LbmGpu | null = null
    try {
      solver = new LbmGpu(renderer, dom, phi, {
        bc: { xmin: 'periodic', xmax: 'periodic', ymin: 'periodic', ymax: 'periodic', zmin: 'periodic', zmax: 'periodic' },
        measure: false, needVolume: false, substeps: 1, caps,
      })
      // 呢条 fixture 唔係测 Re 推导：钉一个中庸 omega、熄埋渐升同海绵，
      // 咁「场应该完全唔郁」就係一句可以 machine-zero 咁验嘅嘢。
      solver.flow = {
        ...solver.flow,
        omegaPlus: 1.2,
        magic: lambdaFromOmegas(1.2, OMEGA_MINUS),
        rampSteps: 0, spongeStrength: 0,
      }
      await solver.ready()
      for (let f = 0; f < 100; f++) {
        solver.advance(10)
        if (f % 10 === 9) await yieldToBrowser()     // 唔好锁死成个 tab
      }
      vAssert(solver.stepCount === 1000, 'substep 数唔啱：' + solver.stepCount)
      const m = solver.readMacro()
      let maxD = 0, maxUx = 0, maxUyz = 0
      for (let i = 0; i < m.delta.length; i++) {
        maxD = Math.max(maxD, Math.abs(m.delta[i]))
        maxUx = Math.max(maxUx, Math.abs(m.ux[i] - U_LB))
        maxUyz = Math.max(maxUyz, Math.abs(m.uy[i]), Math.abs(m.uz[i]))
      }
      // fp32 十九项求和误差 ~1e-8；1000 步随机游走最多再放大 sqrt(1000) ≈ 32 倍
      vAssert(maxD < 1e-6, '★ 空盒生出咗密度扰动：max|delta| = ' + maxD)
      vAssert(maxUx < 1e-6, '★ 空盒嘅 ux 飘咗：max|ux − U_LB| = ' + maxUx)
      vAssert(maxUyz < 1e-6, '★ 空盒生出咗横向速度：max|uy,uz| = ' + maxUyz)
      return { maxDelta: maxD, maxUx, maxUyz, steps: solver.stepCount }
    } finally {
      solver?.dispose()
    }
  })

  // ── fixture ③：球嘅 Cd 落喺 Clift-Gauvin ±50% 之内 ──
  await run('★ GPU：球嘅 Cd 落喺 Clift-Gauvin ±50% 之内（趋势级）', async () => {
    vAssert(caps.ok, 'GPU 唔支援五个 RGBA32F：' + caps.reason)
    vAssert(caps.force7, '量唔到力就冇 Cd：' + caps.reason)
    let solver: LbmGpu | null = null
    try {
      const tier = QUALITY_TIERS[0]                     // low：够快、又够解析（球 ~20 格）
      const plan = planResolutionFor(tier)
      const dom = buildDomain(sphereGrid(plan, 100))
      const phi = bakePhi(dom)
      const flow = { speed: 10, rho: 1.204, mu: 1.81e-5 }
      solver = new LbmGpu(renderer, dom, phi, {
        measure: true, needVolume: false, substeps: 8, flow, caps, tier: tier.name,
      })
      await solver.ready()
      const f = solver.report().flow
      vAssert(dom.dLb > 12, '球淨係得 ' + dom.dLb.toFixed(1) + ' 格直径，边界层解唔到，测呢个冇意义')

      // 收敛：★ 由「成功读到几多次」驱动，唔係由帧数 ★（见 asyncReader.ts）
      const samples: number[] = []
      const minSteps = f.rampSteps + Math.round(1.8 * dom.DX / U_LB)
      const maxSteps = f.rampSteps + Math.round(4.5 * dom.DX / U_LB)
      let guard = 0
      while (solver.stepCount < maxSteps && guard++ < 20000) {
        solver.advance()
        // ★★ gl.finish() 唔係优化，係【确定性】★★
        // asyncReader 嘅 fence 要 GPU 真係做完先 signal。喺一个 tight loop 入面，我哋 yield
        // 完就即刻返嚟 —— GPU 连一个 substep 都未行完，clientWaitSync(0,0) 永远 TIMEOUT_EXPIRED。
        // 实测（RTX 5070 Ti）：冇呢句，820 次迭代【只收到 2 个】Cd 样本，fixture 报
        // 「async readback 冇返嘢」而其实係我哋自己冇畀过时间佢。
        // 真机上个 driver 係 rAF 驱动（一帧 16 ms，GPU 早就做完），所以呢句係 fixture 专用嘅，
        // ★ 唔好抄落 WindTunnelGpu 个 useFrame 度 ★ —— 喺嗰度 finish() 就係每帧强制 CPU 等 GPU。
        solver.gl.finish()
        const s = solver.pollForce()
        await yieldToBrowser()
        if (!s || !s.rampDone) continue
        vAssert(s.links > 0, '★ 一条反弹 link 都冇 —— 条流根本掂唔到零件（phi 上传错咗？）')
        samples.push(s.cd)
        if (solver.stepCount > minSteps && samples.length >= 12) {
          const w = samples.slice(-10)
          const mn = Math.min(...w), mx = Math.max(...w)
          const mean = w.reduce((a, b) => a + b, 0) / w.length
          if ((mx - mn) / (Math.abs(mean) + 1e-9) < 0.012) break
        }
      }
      vAssert(samples.length >= 12, '只攞到 ' + samples.length + ' 个 Cd 样本 —— async readback 冇返嘢？')
      const tail = samples.slice(-Math.max(6, Math.round(samples.length * 0.25)))
      const cd = tail.reduce((a, b) => a + b, 0) / tail.length
      // ★ 唔好 Math.abs ★：来流係域嘅 +X，阻力就一定係 +X。取绝对值会把一个
      //   「动量交换符号搞反咗」嘅 bug 变成一个睇落几靓嘅 Cd。
      vAssert(Number.isFinite(cd) && cd > 0, 'Cd 唔係一个正数（' + cd + '）—— 动量交换嘅符号反咗？')
      const want = sphereCd(f.reLbEffective)
      vRel(cd, want, 0.5, '球 @Re_lb=' + f.reLbEffective.toFixed(0) + ' 嘅 Cd（' + tail.length + ' 个样本）')
      return {
        cd, want, reLb: f.reLbEffective, dLb: dom.dLb,
        steps: solver.stepCount, samples: samples.length, domain: [dom.DX, dom.DY, dom.DZ],
      }
    } finally {
      solver?.dispose()
    }
  })

  // ── fixture ④：分配失败要自己 dispose 自己（walk-down 嘅前提）──
  if (opts.includeOom !== false) {
    await run('★ 分配失败要自己 dispose 自己（walk-down 嘅前提）', async () => {
      vAssert(caps.ok, 'GPU 唔支援五个 RGBA32F：' + caps.reason)
      // ★ 用完即弃嘅 renderer ★：呢条 fixture 蓄意撞一次 OOM。喺 CAD 视窗自己嗰个 context
      //   上面咁做，最坏情况係成个 viewport 嘅 context 被 driver 收返（用户见到黑屏）。
      const canvas = document.createElement('canvas')
      canvas.width = 64; canvas.height = 64
      const scratch = new WebGLRenderer({ canvas, antialias: false })
      try {
        const scaps = probeMRT(scratch.getContext() as WebGL2RenderingContext)
        scratch.resetState()
        vAssert(scaps.ok, '用完即弃嗰个 context 撑唔起五个 RGBA32F：' + scaps.reason)
        const base = scratch.info.memory.textures
        // 大到冇任何消费级 GPU 撑得起（atlas ~16384²，五个 target ping-pong = 几十 GB）
        const dom = emptyDomain(256)
        const huge: WindDomain = { ...dom, DX: 1024, DY: 1024, DZ: 256, cells: 1024 * 1024 * 256, obst: new Uint8Array(0) }
        const phi: PhiField = { data: new Float32Array(0), DX: 1024, DY: 1024, DZ: 256, trueSdf: false, band: 1, nearBodyPhi: Infinity, notes: [] }
        let built: LbmGpu | null = null
        let threw = false
        try { built = new LbmGpu(scratch, huge, phi, { measure: true, caps: scaps }) }
        catch { threw = true }
        if (!threw) { built?.dispose(); throw new Error('呢部 GPU 竟然分配到 ~40 GB？测试无效，换个更大嘅尺寸') }
        const after = scratch.info.memory.textures
        vAssert(after <= base, '分配失败之后仲漏低咗 ' + (after - base) + ' 张 texture —— walk-down 冇得救')

        // 而且【成功】嘅 solver dispose 完都要归零
        const okDom = buildDomain(sphereGrid(16, 100))
        const s = new LbmGpu(scratch, okDom, bakePhi(okDom), { measure: true, needVolume: false, caps: scaps })
        vAssert(scratch.info.memory.textures > base, '正常建构应该真係攞咗 texture')
        s.dispose()
        vAssert(scratch.info.memory.textures <= base, 'dispose() 之后仲有 texture 未放')
        return { baseTextures: base }
      } finally {
        scratch.dispose()
        scratch.forceContextLoss()
      }
    })
  }

  const passed = cases.filter((c) => c.ok).length
  const report: ValidateReport = {
    ok: passed === cases.length,
    passed,
    failed: cases.length - passed,
    renderer: caps.renderer,
    caps,
    cases,
  }
  // 喺 console 度打一份人睇得明嘅，唔使揸住个 object 逐层展开
  for (const c of cases) console.log((c.ok ? 'ok   ' : 'FAIL ') + c.name + ` (${c.ms}ms)` + (c.error ? '\n       ' + c.error : ''))
  console.log(`${passed}/${cases.length} passed — ${caps.renderer}`)
  return report
}

/**
 * fixture ③ 用嘅分辨率。
 * lbm.validate.test.ts 係 `SDF.planResolution([100,100,100], tier).res`；呢度做同一件事，
 * 但唔想为咗一个数就把 planResolution 拉入组件 bundle，所以直接用同一条规则搵最大装得落嘅 res。
 */
function planResolutionFor(tier: { nx: number; ny: number; nz: number }): number {
  for (let res = 64; res >= 8; res--) {
    // 立方体零件 → nx = ny = nz = res；predictDomain 嘅公式（sdfBake.ts:208）
    const DX = Math.round(0.4 * res) + 4 + res + Math.round(1.2 * res) + 6
    const DY = res + 2 * (Math.round(0.45 * res) + 4)
    if (DX <= tier.nx && DY <= tier.ny && DY <= tier.nz) return res
  }
  return 8
}
