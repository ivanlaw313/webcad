// rigidPose.ts —— 风洞零件嘅【刚体位姿】纯逻辑。零 GL、零 three 以外嘅 import，headless 测得到。
//
// 用嚟做咩
// ────────
// 用户拖住零件即时郁/转嗰阵，唔可以逐帧喺 CPU 重烘一次 SDF（一个 96×48×48 域係 22 万格，
// 再乘返体素化本身，即刻由 60fps 跌落 2fps）。所以【phi 场唔郁】，郁嘅係取样嗰条矩阵：
// solidBody shader 由目的地格心逆变换返去【烘焙嗰阵个姿态】嘅物件空间度取样。
//
//
// ★★ 位姿一定要係刚体，唔係就要掟错 ★★
// ──────────────────────────────────
// phi 係一个【距离场】（就算 v1 用二值 mask，佢嘅约定都係「±1 格」）。缩放会令距离度量
// 乘咗个 factor、切变会令佢连度量都唔係 —— 落到 bounce-back / Bouzidi / nearBody gate
// 手上就係一堆冇根据嘅数。而呢件事唔会 crash、唔会黑屏：流场照跑，Cd 静静鸡错。
// 所以 assertRigid() 一定要掟，唔准「静静接受，反正差唔多」。
//
//
// ★★ 呢度嘅取样模型係 shaders.ts solidBodyShaderSource() 嘅【CPU 镜像】★★
// ─────────────────────────────────────────────────────────────────
// poseSampleAt() 逐句对住 GLSL 写（同一个格心约定、同一个 floor、同一个 mix、同一个出界规则）。
// 【改咗一边就一定要改另一边】，否则 tests/lbm-pose.test.mjs 验嘅係一个已经唔存在嘅 shader。
// 真 GPU 那条验证（readback solid atlas vs 呢个模型）就係用嚟钉死呢个对应关系。
//
//
// ★★ 准静态 ★★
// ────────────
// 每一个位姿当成一件【新嘅静止障碍物】：我哋唔做 Ladd / Aidun 嘅动壁 bounce-back
// （唔加 2·w_i·rho·(c_i · u_wall)/c_s² 呢项，亦冇 momentum-exchange 嘅 wall-velocity 修正）。
// 即係「拖拽过程中嗰个暂态【唔係】物理正确嘅运动体暂态；放手 settle 之后嗰个稳态先至係
// 嗰个姿态嘅正确解」。呢句唔准喺 UI 度扮冇。

import { Matrix4 } from 'three'

/** PhiField（sdfBake.ts）嘅结构子集 —— 刻意唔 import，等呢个档企得住自己。 */
export interface PhiLike {
  data: ArrayLike<number>
  DX: number; DY: number; DZ: number
  trueSdf?: boolean
  band?: number
}

/** WindDomain（sdfBake.ts）嘅结构子集。 */
export interface DomainLike { DX: number; DY: number; DZ: number }

/** three Matrix4 嘅结构子集：column-major 16 个数（e[12..14] = 平移）。 */
export interface Mat4Like { elements: ArrayLike<number> }

/* ════════════════════════════════════════════════════════ 正交性 */

export interface RigidCheck {
  rigid: boolean
  /** max |col_i · col_j − δ_ij|，即係 MᵀM 离单位阵几远 */
  orthoErr: number
  /** 3×3 行列式。−1 = 镜射（保距，SDF 仍然合法，但零件係镜像） */
  det: number
  /** 底行离 [0,0,0,1] 几远（透视分量） */
  affineErr: number
  reason: string
}

/**
 * 检查 3×3 係咪正交（冇缩放、冇切变）+ 底行係咪 [0,0,0,1]（冇透视）。
 *
 * 点解连底行都要查：uPoseInv 係一个 mat4，底行唔係 [0,0,0,1] 嘅话逆变换根本唔係仿射，
 * shader 度 `(uPoseInv * vec4(p,1)).xyz` 冇除 w，会静静鸡畀出一个错位嘅取样点。
 *
 * ★ 镜射（det < 0）预设【收】★：镜射保距，所以 SDF 嘅距离度量仍然合法。佢改嘅係零件嘅
 *   手性（左旋变右旋）—— 呢个係「你摆咗件唔同嘅零件」而唔係「度量爆咗」，所以唔喺呢度掟，
 *   而係由 rigidCheck().det 报出去畀上层决定。
 */
export function rigidCheck(m: Mat4Like, tol = 1e-5): RigidCheck {
  const e = m.elements
  for (let i = 0; i < 16; i++) if (!Number.isFinite(e[i])) {
    return { rigid: false, orthoErr: Infinity, det: NaN, affineErr: Infinity, reason: '矩阵有 NaN / Inf' }
  }
  // column-major：col0 = e[0..2], col1 = e[4..6], col2 = e[8..10]
  const c = [[e[0], e[1], e[2]], [e[4], e[5], e[6]], [e[8], e[9], e[10]]]
  let orthoErr = 0
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const d = c[i][0] * c[j][0] + c[i][1] * c[j][1] + c[i][2] * c[j][2]
    orthoErr = Math.max(orthoErr, Math.abs(d - (i === j ? 1 : 0)))
  }
  const det =
    c[0][0] * (c[1][1] * c[2][2] - c[1][2] * c[2][1]) -
    c[1][0] * (c[0][1] * c[2][2] - c[0][2] * c[2][1]) +
    c[2][0] * (c[0][1] * c[1][2] - c[0][2] * c[1][1])
  const affineErr = Math.max(Math.abs(e[3]), Math.abs(e[7]), Math.abs(e[11]), Math.abs(e[15] - 1))

  if (affineErr > tol) {
    return { rigid: false, orthoErr, det, affineErr, reason: '底行唔係 [0,0,0,1]（有透视分量），偏差 ' + affineErr.toExponential(3) }
  }
  if (orthoErr > tol) {
    // 缩放同切变分开报，因为两者嘅成因完全唔同（前者係单位换错，后者係矩阵砌错）
    const s = [Math.hypot(...c[0]), Math.hypot(...c[1]), Math.hypot(...c[2])]
    const scaley = Math.max(Math.abs(s[0] - 1), Math.abs(s[1] - 1), Math.abs(s[2] - 1)) > tol
    return {
      rigid: false, orthoErr, det, affineErr,
      reason: (scaley ? '有缩放（列长 ' + s.map((v) => v.toFixed(6)).join(' / ') + '）' : '有切变（列之间唔垂直）') +
        '，MᵀM 偏差 ' + orthoErr.toExponential(3),
    }
  }
  return { rigid: true, orthoErr, det, affineErr, reason: det < 0 ? '正交但係镜射（det < 0）' : '' }
}

/**
 * 係咪恒等（= 烘焙姿态）。恒等要行返 shader 嗰条定点 texelFetch，咁「冇转过」先至保证
 * 同烘焙结果逐 bit 一样 —— 用重采样嘅路即使数学上恒等，都会经过 floor 同投票。
 */
export function poseIsIdentity(m: Mat4Like, tol = 1e-9): boolean {
  const e = m.elements
  for (let i = 0; i < 16; i++) {
    const want = (i % 5 === 0) ? 1 : 0
    if (!(Math.abs(e[i] - want) <= tol)) return false
  }
  return true
}

/** 3×3 正交（±缩放/切变）而且底行 = [0,0,0,1]。 */
export function isRigid(m: Mat4Like, tol = 1e-5): boolean {
  return rigidCheck(m, tol).rigid
}

/**
 * 唔係刚体就掟。★ 唔准改成 warn ★ —— 见文件头：非刚体嘅位姿唔会 crash，只会静静鸡出错数。
 */
export function assertRigid(m: Mat4Like, tol = 1e-5): void {
  const r = rigidCheck(m, tol)
  if (!r.rigid) {
    throw new Error('rigidPose: 位姿矩阵唔係刚体 —— ' + r.reason + '。SDF 嘅距离度量喺缩放/切变之下会爆，唔可以静静接受。')
  }
}

/* ════════════════════════════════════════════════════════ 外接球 / 合法平移盒 */

export interface BodySphere {
  /** 烘焙姿态之下嘅外接球球心（域 lattice 坐标，cell-centre 约定） */
  centre: [number, number, number]
  /** 半径（格），已经包住格仔本身嘅角（+√3/2） */
  radius: number
  solidCells: number
  /** 固体格心嘅 AABB（格） */
  min: [number, number, number]
  max: [number, number, number]
}

/**
 * 零件嘅外接球（用 AABB 中心，唔係最小外接球）。
 *
 * 用 AABB 中心而唔係 Ritter / Welzl：呢个半径只係【保守上限】，用嚟留白同夹平移，
 * 大咗几格嘅代价係域大少少，细咗一格嘅代价係零件穿墙。所以保守嗰边先啱。
 *
 * ★ 半径要加 √3/2 ★：solid 係【格】唔係点，一个格心距离 R 嘅格，佢最远嘅角喺 R + √3/2。
 */
export function bodySphere(phi: PhiLike): BodySphere {
  const { DX, DY, DZ, data } = phi
  let lo = [Infinity, Infinity, Infinity]
  let hi = [-Infinity, -Infinity, -Infinity]
  let n = 0
  for (let z = 0; z < DZ; z++) for (let y = 0; y < DY; y++) for (let x = 0; x < DX; x++) {
    if (!(data[x + DX * (y + DY * z)] < 0)) continue
    n++
    if (x < lo[0]) lo[0] = x
    if (y < lo[1]) lo[1] = y
    if (z < lo[2]) lo[2] = z
    if (x > hi[0]) hi[0] = x
    if (y > hi[1]) hi[1] = y
    if (z > hi[2]) hi[2] = z
  }
  if (n === 0) {
    const c: [number, number, number] = [DX * 0.5, DY * 0.5, DZ * 0.5]
    return { centre: c, radius: 0, solidCells: 0, min: c.slice() as [number, number, number], max: c.slice() as [number, number, number] }
  }
  // 格心坐标 = 索引 + 0.5
  const cmin: [number, number, number] = [lo[0] + 0.5, lo[1] + 0.5, lo[2] + 0.5]
  const cmax: [number, number, number] = [hi[0] + 0.5, hi[1] + 0.5, hi[2] + 0.5]
  const centre: [number, number, number] = [
    (cmin[0] + cmax[0]) * 0.5, (cmin[1] + cmax[1]) * 0.5, (cmin[2] + cmax[2]) * 0.5,
  ]
  const halfDiag = Math.hypot(cmax[0] - centre[0], cmax[1] - centre[1], cmax[2] - centre[2])
  return { centre, radius: halfDiag + Math.sqrt(3) / 2, solidCells: n, min: cmin, max: cmax }
}

export interface PoseBox {
  /** 【变换后】外接球球心嘅合法 AABB（域 lattice 坐标） */
  min: [number, number, number]
  max: [number, number, number]
  /** 烘焙姿态嘅球心（clampPose 要靠佢先知道球心去咗边） */
  centre: [number, number, number]
  radius: number
  marginCells: number
  /**
   * false = 域窄过「外接球 + 两边 margin」，即係无论点摆都贴墙。
   * 呢阵 min/max 会退化成域中心（唯一「最唔差」嘅位），caller 应该报出去 /
   * 用 padForRotation 重建个域，唔好当 clamp 成功。
   */
  feasible: boolean
  notes: string[]
}

/**
 * 平移嘅合法 AABB —— 令零件嘅【外接球】喺【任何朝向】都唔会行埋墙（留 marginCells 格）。
 *
 * 点解係对住球心而唔係对住 raw 平移分量：球係旋转不变嘅，所以「球心喺呢个盒入面」呢个
 * 条件同朝向完全无关 —— 呢个就係「任何朝向」嘅意思。raw t 嘅合法范围反而係跟住 R 变嘅
 * （因为球心去到 R·c0 + t），逐个朝向计一次先啱，但咁就唔係一个盒。
 */
export function safePoseBox(dom: DomainLike, phi: PhiLike, marginCells = 2): PoseBox {
  const s = bodySphere(phi)
  const D = [dom.DX, dom.DY, dom.DZ]
  const notes: string[] = []
  if (phi.DX !== dom.DX || phi.DY !== dom.DY || phi.DZ !== dom.DZ) {
    throw new Error('safePoseBox: phi 尺寸 ' + [phi.DX, phi.DY, phi.DZ] + ' 唔等于域 ' + D)
  }
  const margin = Math.max(0, marginCells)
  const min: [number, number, number] = [0, 0, 0]
  const max: [number, number, number] = [0, 0, 0]
  let feasible = true
  for (let a = 0; a < 3; a++) {
    const lo = margin + s.radius
    const hi = D[a] - margin - s.radius
    if (lo <= hi) { min[a] = lo; max[a] = hi }
    else {
      feasible = false
      min[a] = max[a] = D[a] * 0.5
      notes.push('轴 ' + a + '：域得 ' + D[a] + ' 格，装唔落「外接球 ' + (2 * s.radius).toFixed(1) + ' + 两边 margin ' + margin + '」')
    }
  }
  if (s.solidCells === 0) notes.push('phi 入面一个固体格都冇 —— 外接球退化成一点')
  return { min, max, centre: s.centre, radius: s.radius, marginCells: margin, feasible, notes }
}

/**
 * 夹住平移分量，令【变换后】嘅球心跌返落 box 入面。返回一个【新】矩阵（唔改 input）。
 *
 * 做法：q = m · centre（球心去咗边）→ 夹 → 差额直接加落平移分量。
 * 旋转分量一个字都唔郁，所以出嚟嘅嘢仍然係刚体。
 */
export function clampPose(m: Mat4Like, box: PoseBox): Matrix4 {
  const out = new Matrix4()
  const e = m.elements
  for (let i = 0; i < 16; i++) out.elements[i] = e[i]
  const d = poseClampDelta(m, box)
  out.elements[12] += d[0]; out.elements[13] += d[1]; out.elements[14] += d[2]
  return out
}

/** clampPose 要加落平移分量嘅差额（全零 = 本来已经喺盒入面）。 */
export function poseClampDelta(m: Mat4Like, box: PoseBox): [number, number, number] {
  const e = m.elements
  const c = box.centre
  const q = [
    e[0] * c[0] + e[4] * c[1] + e[8] * c[2] + e[12],
    e[1] * c[0] + e[5] * c[1] + e[9] * c[2] + e[13],
    e[2] * c[0] + e[6] * c[1] + e[10] * c[2] + e[14],
  ]
  const delta: [number, number, number] = [0, 0, 0]
  for (let a = 0; a < 3; a++) delta[a] = Math.min(box.max[a], Math.max(box.min[a], q[a])) - q[a]
  return delta
}

/* ════════════════════════════════════════════════════════ 取样模型（GLSL 镜像） */

export type PoseSampleMode = 'vote27' | 'trilinear'

export interface PoseSampleOptions {
  /**
   * 逆变换之后跌【出咗 phi 域】嘅取样点当呢个值。一定要 > 0（＝流体）。
   * 缺省：真 SDF 用 band（远场距离），二值 mask 用 +1。
   * ★ 唔可以 clamp / wrap ★ —— clamp 会把边界嗰一层沿住成条域边拖出一条鬼影柱。
   */
  outside?: number
  /** 迫住行边条路（测试用）。缺省跟 phi.trueSdf。 */
  mode?: PoseSampleMode
}

export function defaultSampleMode(phi: PhiLike): PoseSampleMode {
  return phi.trueSdf ? 'trilinear' : 'vote27'
}

export function defaultOutside(phi: PhiLike): number {
  return phi.trueSdf ? (phi.band && phi.band > 0 ? phi.band : 1) : 1
}

/** 12 个数嘅仿射逆变换 + 出界规则，摊平咗嚟避免逐格 new Vector3。 */
interface Sampler {
  e: ArrayLike<number>
  DX: number; DY: number; DZ: number
  data: ArrayLike<number>
  outside: number
}

function fetch1(S: Sampler, x: number, y: number, z: number): number {
  // ★ 出界 = 流体 ★（同 GLSL phiFetch 逐句一样）
  if (x < 0 || y < 0 || z < 0 || x >= S.DX || y >= S.DY || z >= S.DZ) return S.outside
  return S.data[x + S.DX * (y + S.DY * z)]
}

const MIX = (a: number, b: number, t: number) => a * (1 - t) + b * t   // GLSL mix() 嘅定义

/**
 * shader 会喺目的地格 (cx,cy,cz) 写落去嘅 phi 值（未乘 uPhiToLattice、未同其他零件 min）。
 *
 * @param inv  位姿嘅【逆】：域 lattice → 物件（烘焙）lattice，column-major 16
 */
export function poseSampleAt(
  phi: PhiLike, inv: Mat4Like, cx: number, cy: number, cz: number, opts: PoseSampleOptions = {},
): number {
  const S: Sampler = {
    e: inv.elements, DX: phi.DX, DY: phi.DY, DZ: phi.DZ, data: phi.data,
    outside: opts.outside ?? defaultOutside(phi),
  }
  return sampleOne(S, (opts.mode ?? defaultSampleMode(phi)), cx + 0.5, cy + 0.5, cz + 0.5)
}

function sampleOne(S: Sampler, mode: PoseSampleMode, px: number, py: number, pz: number): number {
  const e = S.e
  if (mode === 'trilinear') {
    // 真 SDF：旋转保距 → 内插距离係合法嘅。手写 trilinear 而唔係靠 sampler 嘅 LINEAR：
    // R32F 要 OES_texture_float_linear 先 filter 得，冇嗰个 extension 嘅机 texture 会变
    // 「incomplete」→ 静静鸡还 (0,0,0,1) → phi = 0 → 成件零件消失。唔值得赌。
    const qx = e[0] * px + e[4] * py + e[8] * pz + e[12] - 0.5
    const qy = e[1] * px + e[5] * py + e[9] * pz + e[13] - 0.5
    const qz = e[2] * px + e[6] * py + e[10] * pz + e[14] - 0.5
    const bx = Math.floor(qx), by = Math.floor(qy), bz = Math.floor(qz)
    const fx = qx - bx, fy = qy - by, fz = qz - bz
    const c000 = fetch1(S, bx, by, bz), c100 = fetch1(S, bx + 1, by, bz)
    const c010 = fetch1(S, bx, by + 1, bz), c110 = fetch1(S, bx + 1, by + 1, bz)
    const c001 = fetch1(S, bx, by, bz + 1), c101 = fetch1(S, bx + 1, by, bz + 1)
    const c011 = fetch1(S, bx, by + 1, bz + 1), c111 = fetch1(S, bx + 1, by + 1, bz + 1)
    const x00 = MIX(c000, c100, fx), x10 = MIX(c010, c110, fx)
    const x01 = MIX(c001, c101, fx), x11 = MIX(c011, c111, fx)
    return MIX(MIX(x00, x10, fy), MIX(x01, x11, fy), fz)
  }
  /*
   * 二值 mask：NEAREST + 3×3×3 覆盖率投票（多数决）。
   *
   * ★ 点解係【单数】27 而唔係 2×2×2 = 8 ★
   * 27 个 ±1 相加【永远係单数】→ 数学上打唔到和 → 唔使有「打和当乜」呢条规矩。
   * 偶数子取样先係个陷阱：一个正正撞正格边界嘅平面，成层格都会 4-4（或者 32-32）打和，
   * 而打和倒去边一边都係一个【系统性】偏差 —— 实测係成层面唔见咗，体积错 −20%。
   * 实测（同一批姿态，同「喺该姿态重新用 CPU 烘一次」比，最坏 diff / 界面格）：
   *     1×1×1 → 0.37（+1.8% 体积）   2×2×2 → 0.40（−20.8%）  3×3×3 → 0.13（−1.3%）
   *     4×4×4 → 0.30（−14.3%）        6×6×6 → 0.13（−1.2%，贵 8 倍，冇著数）
   *
   * ★ 亦都唔係「子取样 min-combine」★ —— min 即係「有一点係固体就当固体」，等于对成件
   *   零件膨胀半格，同重烘比就係系统性多咗一层壳。投票先至係无偏。
   *   （零件【之间】嘅 union 仍然係 min-combine，喺 shader 尾嗰句 min(phiNow, prev)。）
   */
  let acc = 0
  for (let k = 0; k < 27; k++) {
    const ox = (k % 3) / 3 - 1 / 3
    const oy = (((k / 3) | 0) % 3) / 3 - 1 / 3
    const oz = ((k / 9) | 0) / 3 - 1 / 3
    const sx = px + ox, sy = py + oy, sz = pz + oz
    const qx = e[0] * sx + e[4] * sy + e[8] * sz + e[12]
    const qy = e[1] * sx + e[5] * sy + e[9] * sz + e[13]
    const qz = e[2] * sx + e[6] * sy + e[10] * sz + e[14]
    // ★ 一定要 floor 唔可以 truncate ★：ivec3(-0.3) = 0（向零截）会读到 0 号格，
    //   即係域嘅 −x 边界会镜返一层零件出嚟。
    acc += fetch1(S, Math.floor(qx), Math.floor(qy), Math.floor(qz)) < 0 ? -1 : 1
  }
  return acc < 0 ? -1 : 1
}

/**
 * 成个域嘅 solid mask（1 = 固体）。★ 慢 O(cells×8) ★ —— 净係畀测试同诊断用。
 */
export function resampleSolidMask(phi: PhiLike, inv: Mat4Like, opts: PoseSampleOptions = {}): Uint8Array {
  const { DX, DY, DZ } = phi
  const S: Sampler = { e: inv.elements, DX, DY, DZ, data: phi.data, outside: opts.outside ?? defaultOutside(phi) }
  const mode = opts.mode ?? defaultSampleMode(phi)
  const out = new Uint8Array(DX * DY * DZ)
  for (let z = 0; z < DZ; z++) for (let y = 0; y < DY; y++) for (let x = 0; x < DX; x++) {
    out[x + DX * (y + DY * z)] = sampleOne(S, mode, x + 0.5, y + 0.5, z + 0.5) < 0 ? 1 : 0
  }
  return out
}

/* ════════════════════════════════════════════════════════ refill 计数 */

export interface RefillCount {
  /** 由【固体】变返【流体】嘅格数 —— simple refill 会踩到嘅格 */
  refill: number
  /** 由流体变固体嘅格数（对称嗰边，诊断用） */
  newSolid: number
  /** 实际扫过几多格（局部扫描，唔係成个域） */
  scanned: number
}

/**
 * 数今次换位姿有几多格【由固体露返出嚟变流体】。
 *
 * ★ 局部扫描但係精确嘅 ★：两个姿态嘅外接球以外，两边都一定係流体（因为 resample 出嚟嘅
 * 固体格，格心一定喺 m·centre 嘅 radius + 子取样偏移 + 半格 之内），所以嗰啲格对
 * refill / newSolid 嘅贡献【恒等于零】。慳嘅唔係精度，係时间：一个 96×48×48 域
 * 全扫係 22 万格 × 8 点，局部扫通常得 5%。
 */
export function countRefillCells(
  phi: PhiLike, mPrev: Mat4Like, mNow: Mat4Like, sphere: BodySphere, opts: PoseSampleOptions = {},
): RefillCount {
  const { DX, DY, DZ } = phi
  const outside = opts.outside ?? defaultOutside(phi)
  const mode = opts.mode ?? defaultSampleMode(phi)
  const Sp: Sampler = { e: invertRigid(mPrev).elements, DX, DY, DZ, data: phi.data, outside }
  const Sn: Sampler = { e: invertRigid(mNow).elements, DX, DY, DZ, data: phi.data, outside }

  // 两个姿态嘅球心 + 保守半径（子取样最远 0.25√3 ≈ 0.44，再加半格 floor 误差 → +1.5 够松）
  const R = sphere.radius + 1.5
  const lo = [DX, DY, DZ], hi = [-1, -1, -1]
  for (const m of [mPrev, mNow]) {
    const e = m.elements, c = sphere.centre
    const q = [
      e[0] * c[0] + e[4] * c[1] + e[8] * c[2] + e[12],
      e[1] * c[0] + e[5] * c[1] + e[9] * c[2] + e[13],
      e[2] * c[0] + e[6] * c[1] + e[10] * c[2] + e[14],
    ]
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a], Math.floor(q[a] - R))
      hi[a] = Math.max(hi[a], Math.ceil(q[a] + R))
    }
  }
  const D = [DX, DY, DZ]
  for (let a = 0; a < 3; a++) { lo[a] = Math.max(0, lo[a]); hi[a] = Math.min(D[a] - 1, hi[a]) }

  let refill = 0, newSolid = 0, scanned = 0
  for (let z = lo[2]; z <= hi[2]; z++) for (let y = lo[1]; y <= hi[1]; y++) for (let x = lo[0]; x <= hi[0]; x++) {
    scanned++
    const wasSolid = sampleOne(Sp, mode, x + 0.5, y + 0.5, z + 0.5) < 0
    const isSolid = sampleOne(Sn, mode, x + 0.5, y + 0.5, z + 0.5) < 0
    if (wasSolid && !isSolid) refill++
    else if (!wasSolid && isSolid) newSolid++
  }
  return { refill, newSolid, scanned }
}

/* ════════════════════════════════════════════════════════ 小工具 */

/**
 * 刚体嘅仿射逆：R⁻¹ = Rᵀ、t⁻¹ = −Rᵀ·t。★ 唔准餵非刚体 ★（先 assertRigid）——
 * 有缩放嘅话呢条数畀出嚟嘅唔係逆，而係一个睇落好合理但错嘅矩阵。
 *
 * 唔用 Matrix4.invert()（通用余因子）嘅原因：呢条係严格保距嘅，唔会喺 det 接近 0 嗰阵
 * 悄悄退化，而且 Rᵀ 保证出嚟嘅仍然係正交 —— 通用逆会带住数值噪声，令来回变换唔係恒等。
 */
export function invertRigid(m: Mat4Like): Matrix4 {
  const e = m.elements
  const tx = e[12], ty = e[13], tz = e[14]
  const out = new Matrix4()
  // column-major：out 嘅 3×3 = m 3×3 嘅转置
  const o = out.elements
  o[0] = e[0]; o[1] = e[4]; o[2] = e[8]; o[3] = 0
  o[4] = e[1]; o[5] = e[5]; o[6] = e[9]; o[7] = 0
  o[8] = e[2]; o[9] = e[6]; o[10] = e[10]; o[11] = 0
  o[12] = -(e[0] * tx + e[1] * ty + e[2] * tz)
  o[13] = -(e[4] * tx + e[5] * ty + e[6] * tz)
  o[14] = -(e[8] * tx + e[9] * ty + e[10] * tz)
  o[15] = 1
  return out
}
