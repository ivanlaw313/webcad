// sdfBake.ts —— 由体素 mask 整出 solver 要嘅【域】同【phi 场】。纯逻辑，零 GL。
//
// 两件事：
//
//   buildDomain()   把零件体素网格摆入一条有边距嘅流道（同 windtunnel.ts【逐条数式一样】）
//   bakePhi()       流道 → shader 要嘅 phi 场（phi < 0 = 固体）
//
//
// 点解唔 import voxelize()
// ────────────────────────
// voxelfea.ts 用【冇后缀】嘅 import（'./faceFeaSelect'），`node --experimental-strip-types`
// 解唔到 → 一 import 就连累到成个 lbm 目录headless 跑唔到测试。而 voxelfea.ts 唔係我哋嘅嘢，
// 唔可以改。所以呢度收一个【结构相同】嘅 VoxelGridLike，caller 自己 call voxelize() 传入嚟。
// 反正咁样耦合仲少：sdfBake 唔关心啲体素係点嚟嘅。
//
//
// ★ BOUZIDI 维持熄 ★
// ─────────────────
// 二值 mask 之下，q = phi / (phi - ph) = 1 / (1 - (-1)) = 0.5 —— 即係 halfway 反弹，
// 淨係扮到有 sub-cell 精度。呢度就算开咗 trueSdf，预设都仲係唔开 Bouzidi：
// chamfer 距离场喺【曲面】上仍然唔係真正嘅 wall distance（佢係到最近固体【格心】嘅距离），
// 摞去做 sub-cell 壁位置只係换一种自欺。
//
//
// ★ nearBody gate 预设【熄】★
// ──────────────────────────
// shaders.ts 嘅 `phi < 2.5` 优化，前提係 phi 真係 1-Lipschitz。二值 mask 嘅流体格 phi = +1，
// 恒细过 2.5，所以 gate 恒真、无害但都冇著数；但只要有日有人为咗慳位把流体格填 +1e9，
// gate 就会【全部 false】、反弹完全唔发生、阻力静静鸡变零 —— 而且流场睇落完全正常，
// 零件对住条流係【半透明】嘅。
//
// 所以 nearBodyPhi 只有喺 bakePhi({ trueSdf: true }) 而且 band >= 2.5 嘅时候先至係 2.5。
// 呢个 gate 要成立嘅【精确】条件（唔係「1-Lipschitz」咁 hand-wave）：
//
//     对任何流体格 x：如果 x 嘅廿六邻居入面有固体，咁 phi(x) <= sqrt(3)
//
// chamfer sweep 用【真实 offset 长度】(1, √2, √3) 做权重，天生满足：固体格喺 outward pass
// 嘅起点係 0，所以 d(x) <= 0 + √3 = 1.732 < 2.5。★ 上限 clamp（narrow band）唔会破坏佢 ★：
// clamp 只会把【已经 >= band >= 2.5】嘅值拉细，而真正贴住零件嗰啲永远 <= 1.732，clamp 唔到。

/** voxelize() 出嚟嘅嘢（结构相容；见文件头点解唔直接 import）。 */
export interface VoxelGridLike {
  h: number
  nx: number; ny: number; nz: number
  ox: number; oy: number; oz: number
  solid: ArrayLike<number>
}

export interface DomainOptions {
  /** 来流轴（零件包围盒主轴）；缺省 = 最长轴 */
  axis?: 0 | 1 | 2
  /** 沿 +轴 或 -轴；缺省 +1 */
  sign?: 1 | -1
  /**
   * 按零件嘅【外接球】而唔係 AABB 嚟留白。
   *
   * 用嚟做咩：位姿（rigidPose.ts / LbmGpu.setPose）想喺【唔重建个域】嘅前提下随便转朝向。
   * 域按 AABB 留白嘅话，一件 40×8×8 嘅长条转 90° 之后就有 32 格喺域出面 —— 咁就唔止係
   * 「转唔到」，而係各个朝向嘅 Cd 根本【唔喺同一个域度算】，冇得比。
   * 开咗之后零件槽位每轴都係 ceil(√(nFlow²+nA²+nB²))（外接球直径），零件喺槽入面居中，
   * 所以任何朝向都仲喺槽入面 → 域一次建好，全部朝向共用。
   *
   * 代价：域大好多（长条件可以大几倍），即係慢好多、食好多显存。
   *
   * ★ 预设 false ★ —— 唔开就同以前【逐个数一样】（下面 slotOf 喺 rot=false 嗰阵恒等）。
   */
  padForRotation?: boolean
}

/**
 * 域尺寸同零件原点 offset —— buildDomain / predictDomain 【共用同一份】。
 *
 * 呢度每一条数都係由 windtunnel.ts §2 抄过嚟嘅：上游 0.4×截面+4、下游 1.2×截面+6、
 * 逐轴侧边距 0.45×该轴+4。两个求解器要喺同一个域上面比 Cd，域唔同就冇得比。
 *
 * 返回嘅 padUp/padA/padB 係【零件原点格嘅实际 offset】（已经包埋 padForRotation 嘅居中位移），
 * 所以 caller 嗰边嘅 volMatrix / 迎风投影 / obst 摆位一个字都唔使改。
 */
function domainPads(nFlow: number, nA: number, nB: number, opts: DomainOptions) {
  const rot = !!opts.padForRotation
  // 外接球直径（格）。−1e-9 係唔想 sqrt 嘅 fp 噪声令一个整数变大一格。
  const dia = Math.ceil(Math.sqrt(nFlow * nFlow + nA * nA + nB * nB) - 1e-9)
  // 槽位同零件【同奇偶】，咁 (slot − n) / 2 先至係整数 → 零件真係居中，
  // 唔係偏半格（偏半格嘅话外接球会凸出去半格，而「任何朝向都入得晒」呢句就唔成立）。
  const slotOf = (n: number) => {
    if (!rot) return n
    let s = Math.max(n, dia)
    if (((s - n) & 1) !== 0) s += 1
    return s
  }
  const eFlow = slotOf(nFlow), eA = slotOf(nA), eB = slotOf(nB)

  const crossMax = Math.max(eA, eB)
  const upBase = Math.round(0.4 * crossMax) + 4
  const downBase = Math.round(1.2 * crossMax) + 6
  const aBase = Math.round(0.45 * eA) + 4
  const bBase = Math.round(0.45 * eB) + 4

  const DX = upBase + eFlow + downBase
  const DY = eA + 2 * aBase
  const DZ = eB + 2 * bBase

  const padUp = upBase + ((eFlow - nFlow) >> 1)
  const padA = aBase + ((eA - nA) >> 1)
  const padB = bBase + ((eB - nB) >> 1)
  return { DX, DY, DZ, padUp, padDown: DX - padUp - nFlow, padA, padB, slot: [eFlow, eA, eB] as [number, number, number] }
}

export interface WindDomain {
  /** 格子尺寸 = solver 嘅 NX/NY/NZ。来流永远係域嘅 +X。 */
  DX: number; DY: number; DZ: number
  cells: number
  padUp: number; padDown: number; padA: number; padB: number
  /** 来流轴 / 第一横轴 / 第二横轴（CAD 索引），同符号 */
  fa: 0 | 1 | 2; ca: 0 | 1 | 2; cb: 0 | 1 | 2; sign: 1 | -1
  nFlow: number; nA: number; nB: number
  /** 体素边长 mm（= 格距） */
  h: number
  /** DX*DY*DZ，1 = 零件 */
  obst: Uint8Array
  /** 迎风投影格数（CPU 版；GPU 会自己再量一次，两个应该一致） */
  frontalCells: number
  frontalAreaMM2: number
  /** 迎风等效直径（格） */
  dLb: number
  /** 特征长度 m */
  refLenM: number
  /** 零件形心（格子坐标，cell-centre 约定）—— 力矩参考点 */
  bodyCentre: [number, number, number]
  /** 16，row-major：域 lattice cell-centre 坐标 → CAD mm（同 windtunnel.volMatrix 同一约定） */
  volMatrix: number[]
}

/**
 * 把零件体素网格摆入一条有边距嘅流道。
 *
 * ★ 呢度每一条数都係由 windtunnel.ts §2 抄过嚟嘅，唔係重新谂 ★ ——
 * 边距见 domainPads()、sign<0 嘅流向翻转、以及 domToCad 反推出嚟嘅 volMatrix。
 * 两个求解器要喺【同一个域】上面比 Cd，域唔同就冇得比。
 */
export function buildDomain(g: VoxelGridLike, opts: DomainOptions = {}): WindDomain {
  const { nx, ny, nz, h, ox, oy, oz, solid } = g
  if (!(nx >= 1 && ny >= 1 && nz >= 1 && h > 0)) throw new Error('buildDomain: 体素网格无效 ' + nx + 'x' + ny + 'x' + nz)

  const dims = [nx, ny, nz]
  let fa = opts.axis
  if (fa !== 0 && fa !== 1 && fa !== 2) fa = (dims[0] >= dims[1] && dims[0] >= dims[2]) ? 0 : (dims[1] >= dims[2] ? 1 : 2)
  const sign: 1 | -1 = opts.sign === -1 ? -1 : 1
  const ca: 0 | 1 | 2 = fa === 0 ? 1 : 0
  const cb: 0 | 1 | 2 = fa === 2 ? 1 : 2
  const nFlow = dims[fa], nA = dims[ca], nB = dims[cb]

  const { DX, DY, DZ, padUp, padDown, padA, padB } = domainPads(nFlow, nA, nB, opts)
  const DN = DX * DY * DZ

  const obst = new Uint8Array(DN)
  const idxOf = (dx: number, dy: number, dz: number) => dx + DX * (dy + DY * dz)
  const comp = [0, 0, 0]
  let sx = 0, sy = 0, sz = 0, nSolid = 0
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (solid[i + nx * (j + ny * k)] !== 1) continue
    comp[0] = i; comp[1] = j; comp[2] = k
    let flowIdx = comp[fa]
    if (sign < 0) flowIdx = nFlow - 1 - flowIdx
    const dx = padUp + flowIdx, dy = padA + comp[ca], dz = padB + comp[cb]
    obst[idxOf(dx, dy, dz)] = 1
    sx += dx; sy += dy; sz += dz; nSolid++
  }

  // 迎风投影（域 X 投影）：横截面有任意障碍嘅 (y,z) 列数
  let frontalCells = 0
  for (let dz = 0; dz < DZ; dz++) for (let dy = 0; dy < DY; dy++) {
    for (let dx = padUp; dx < padUp + nFlow; dx++) {
      if (obst[idxOf(dx, dy, dz)]) { frontalCells++; break }
    }
  }
  if (frontalCells < 1) frontalCells = 1
  const frontalAreaMM2 = frontalCells * h * h
  const dLb = Math.sqrt(4 * frontalCells / Math.PI)
  const refLenM = Math.sqrt(4 * frontalAreaMM2 * 1e-6 / Math.PI)

  // 域 lattice cell-centre → CAD mm（windtunnel.ts §S1 嘅同一条反推）
  const oArr = [ox, oy, oz]
  const mc0 = [0, 0, 0], mc1 = [0, 0, 0], mc2 = [0, 0, 0], mtr = [0, 0, 0]
  mc0[fa] = sign * h; mc1[ca] = h; mc2[cb] = h
  mtr[fa] = sign > 0 ? oArr[fa] - padUp * h : oArr[fa] + (nFlow + padUp) * h
  mtr[ca] = oArr[ca] - padA * h
  mtr[cb] = oArr[cb] - padB * h
  const volMatrix = [
    mc0[0], mc1[0], mc2[0], mtr[0],
    mc0[1], mc1[1], mc2[1], mtr[1],
    mc0[2], mc1[2], mc2[2], mtr[2],
    0, 0, 0, 1,
  ]

  const bodyCentre: [number, number, number] = nSolid > 0
    ? [sx / nSolid + 0.5, sy / nSolid + 0.5, sz / nSolid + 0.5]
    : [DX * 0.5, DY * 0.5, DZ * 0.5]

  return {
    DX, DY, DZ, cells: DN,
    padUp, padDown, padA, padB,
    fa, ca, cb, sign,
    nFlow, nA, nB, h,
    obst, frontalCells, frontalAreaMM2, dLb, refLenM,
    bodyCentre, volMatrix,
  }
}

/* ─────────────────────────────────────────────────────────── 分辨率规划 */

export interface DomainBudget { nx: number; ny: number; nz: number }

export interface ResolutionPlan {
  /** 传畀 voxelize() 嘅 resolution（最长边体素数） */
  res: number
  /** 预测出嚟嘅零件体素尺寸同域尺寸（voxelize 嘅取整同呢度一样） */
  nx: number; ny: number; nz: number
  DX: number; DY: number; DZ: number
  fits: boolean
}

/**
 * 由包围盒同【tier 预算】倒推出应该用几高嘅体素分辨率。
 *
 * voxelize() 嘅取整规则係 h = longest/res、n = ceil(extent/h)，完全可预测，
 * 所以唔使真係跑一次体素化就估到域几大。呢个係 walk-down 嘅前提：
 * 换 tier = 换 res = 换域，唔换嘅话细 tier 一样装唔落。
 */
export function planResolution(
  extent: [number, number, number],
  budget: DomainBudget,
  opts: DomainOptions & { maxRes?: number; minRes?: number } = {},
): ResolutionPlan {
  const maxRes = Math.max(4, Math.round(opts.maxRes ?? 96))
  const minRes = Math.max(4, Math.round(opts.minRes ?? 8))
  const longest = Math.max(extent[0], extent[1], extent[2])
  let last: ResolutionPlan | null = null
  for (let res = maxRes; res >= minRes; res--) {
    const h = longest / res
    const nx = Math.max(1, Math.ceil(extent[0] / h - 1e-9))
    const ny = Math.max(1, Math.ceil(extent[1] / h - 1e-9))
    const nz = Math.max(1, Math.ceil(extent[2] / h - 1e-9))
    const d = predictDomain(nx, ny, nz, opts)
    const plan: ResolutionPlan = { res, nx, ny, nz, DX: d.DX, DY: d.DY, DZ: d.DZ, fits: false }
    if (d.DX <= budget.nx && d.DY <= budget.ny && d.DZ <= budget.nz) { plan.fits = true; return plan }
    last = plan
  }
  return last ?? { res: minRes, nx: 1, ny: 1, nz: 1, DX: 0, DY: 0, DZ: 0, fits: false }
}

/** 唔使砌 obst 都算到域尺寸（planResolution 内部用；同 buildDomain 【共用 domainPads】）。 */
export function predictDomain(nx: number, ny: number, nz: number, opts: DomainOptions = {}): { DX: number; DY: number; DZ: number } {
  const dims = [nx, ny, nz]
  let fa = opts.axis
  if (fa !== 0 && fa !== 1 && fa !== 2) fa = (dims[0] >= dims[1] && dims[0] >= dims[2]) ? 0 : (dims[1] >= dims[2] ? 1 : 2)
  const ca = fa === 0 ? 1 : 0
  const cb = fa === 2 ? 1 : 2
  const p = domainPads(dims[fa], dims[ca], dims[cb], opts)
  return { DX: p.DX, DY: p.DY, DZ: p.DZ }
}

/* ─────────────────────────────────────────────────────────── phi 场 */

export interface PhiOptions {
  /**
   * 整一个真距离场（chamfer narrow band），唔係淨係 ±1。
   * ★ 预设 false ★ —— v1 用二值 mask，同 CPU 参考解【同一个几何】，两边 Cd 先比得。
   */
  trueSdf?: boolean
  /** narrow band 半宽（格）。要开 nearBody gate 就一定要 >= 2.5。 */
  band?: number
}

export interface PhiField {
  data: Float32Array
  DX: number; DY: number; DZ: number
  trueSdf: boolean
  band: number
  /**
   * 传畀 stepShaderSource({ nearBodyPhi }) 嘅值。
   * Infinity = 无条件 probe（二值 mask 嘅唯一安全选择，见文件头）。
   */
  nearBodyPhi: number
  notes: string[]
}

const W_FACE = 1
const W_EDGE = Math.SQRT2
const W_CORNER = Math.sqrt(3)

/** 廿六邻居 offset + 权重（权重 = 真实 offset 长度，gate 嘅证明就靠呢样）。 */
const NB: { dx: number; dy: number; dz: number; w: number }[] = (() => {
  const out: { dx: number; dy: number; dz: number; w: number }[] = []
  for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy && !dz) continue
    const n = Math.abs(dx) + Math.abs(dy) + Math.abs(dz)
    out.push({ dx, dy, dz, w: n === 1 ? W_FACE : n === 2 ? W_EDGE : W_CORNER })
  }
  return out
})()

/** 前向 sweep 掂嘅一半邻居（字典序细过原点嗰半）。 */
const NB_FWD = NB.filter((o) => o.dz < 0 || (o.dz === 0 && (o.dy < 0 || (o.dy === 0 && o.dx < 0))))
const NB_BWD = NB.filter((o) => !(o.dz < 0 || (o.dz === 0 && (o.dy < 0 || (o.dy === 0 && o.dx < 0)))))

/**
 * 由 seed（0）出发嘅 chamfer 距离变换，两 pass sweep。
 * seedIsZero(i) 真嘅格起点 0，其余 +Infinity。结果 clamp 上限 band。
 */
function chamfer(mask: Uint8Array, seedValue: 0 | 1, DX: number, DY: number, DZ: number, band: number): Float32Array {
  const d = new Float32Array(DX * DY * DZ)
  const BIG = band * 4 + 8
  for (let i = 0; i < d.length; i++) d[i] = mask[i] === seedValue ? 0 : BIG
  const idx = (x: number, y: number, z: number) => x + DX * (y + DY * z)

  const sweep = (list: typeof NB, forward: boolean) => {
    const zs = forward ? 0 : DZ - 1, ze = forward ? DZ : -1, zi = forward ? 1 : -1
    const ys = forward ? 0 : DY - 1, ye = forward ? DY : -1, yi = forward ? 1 : -1
    const xs = forward ? 0 : DX - 1, xe = forward ? DX : -1, xi = forward ? 1 : -1
    for (let z = zs; z !== ze; z += zi) for (let y = ys; y !== ye; y += yi) for (let x = xs; x !== xe; x += xi) {
      const c = idx(x, y, z)
      let v = d[c]
      if (v === 0) continue
      for (let k = 0; k < list.length; k++) {
        const o = list[k]
        const nx2 = x + o.dx, ny2 = y + o.dy, nz2 = z + o.dz
        if (nx2 < 0 || ny2 < 0 || nz2 < 0 || nx2 >= DX || ny2 >= DY || nz2 >= DZ) continue
        const cand = d[idx(nx2, ny2, nz2)] + o.w
        if (cand < v) v = cand
      }
      d[c] = v
    }
  }
  sweep(NB_FWD, true)
  sweep(NB_BWD, false)
  // ★ 只 clamp 上限 ★：真正贴住零件嗰啲值永远 <= sqrt(3) < band，clamp 唔到佢哋，
  //   所以 nearBody gate 嘅证明唔受影响（见文件头）。
  for (let i = 0; i < d.length; i++) if (d[i] > band) d[i] = band
  return d
}

/**
 * 流道 → shader 要嘅 phi 场。
 *
 * 约定（同 shaders.ts 一致）：phi < 0 = 固体。界面位置係【格心之间嘅中点】——
 * 所以贴住零件嘅流体格 phi = +1、零件外皮格 phi = -1，同二值 mask 一模一样。
 * 即係开唔开 trueSdf 都【唔会移动条壁】，只係远场嘅数值变准。
 */
export function bakePhi(dom: WindDomain, opts: PhiOptions = {}): PhiField {
  const { DX, DY, DZ, obst } = dom
  const notes: string[] = []
  const trueSdf = !!opts.trueSdf
  const band = opts.band ?? 4

  const data = new Float32Array(DX * DY * DZ)
  if (!trueSdf) {
    for (let i = 0; i < data.length; i++) data[i] = obst[i] ? -1 : 1
    notes.push('二值 mask（固体 -1 / 流体 +1）：同 CPU 参考解同一个几何')
    return { data, DX, DY, DZ, trueSdf: false, band: 1, nearBodyPhi: Infinity, notes }
  }

  if (!(band >= 2.5)) notes.push('band=' + band + ' < 2.5：nearBody gate 保持无条件（gate 要 band >= 2.5 先证明得到）')
  const dOut = chamfer(obst, 1, DX, DY, DZ, band)   // 到最近【固体】格心嘅距离（流体侧有用）
  const dIn = chamfer(obst, 0, DX, DY, DZ, band)    // 到最近【流体】格心嘅距离（固体侧有用）
  for (let i = 0; i < data.length; i++) data[i] = obst[i] ? -dIn[i] : dOut[i]
  notes.push('chamfer narrow band（权重 1 / √2 / √3 = 真实 offset 长度），半宽 ' + band + ' 格')

  return {
    data, DX, DY, DZ,
    trueSdf: true,
    band,
    nearBodyPhi: band >= 2.5 ? 2.5 : Infinity,
    notes,
  }
}

/**
 * gate 安全性【真正】嘅条件，写成一个可以跑嘅检查（测试同 dev 用）。
 *
 * 唔係「|∇phi| <= 1」—— 跨界面嗰下 phi 由 -1 跳到 +1，差 2 > 1，成个场根本唔係全局
 * 1-Lipschitz，写成咁嘅 assert 一定 fail，然后就会有人把 assert 删走而唔係谂真相。
 * 真正需要嘅係：任何有固体邻居嘅流体格，phi 一定细过 gate。
 */
export function checkNearBodyGate(phi: PhiField, obst: Uint8Array, gate: number): string[] {
  const { DX, DY, DZ, data } = phi
  const bad: string[] = []
  const idx = (x: number, y: number, z: number) => x + DX * (y + DY * z)
  for (let z = 0; z < DZ && bad.length < 8; z++) for (let y = 0; y < DY && bad.length < 8; y++) for (let x = 0; x < DX; x++) {
    const c = idx(x, y, z)
    if (obst[c]) continue
    let touches = false
    for (let k = 0; k < NB.length && !touches; k++) {
      const o = NB[k]
      const nx2 = x + o.dx, ny2 = y + o.dy, nz2 = z + o.dz
      if (nx2 < 0 || ny2 < 0 || nz2 < 0 || nx2 >= DX || ny2 >= DY || nz2 >= DZ) continue
      if (obst[idx(nx2, ny2, nz2)]) touches = true
    }
    if (touches && !(data[c] < gate)) {
      bad.push('cell ' + [x, y, z] + ' 掂住固体但 phi=' + data[c] + ' >= gate ' + gate)
      if (bad.length >= 8) break
    }
  }
  return bad
}
