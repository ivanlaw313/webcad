// 风洞 / 水洞趋势模拟器 —— 把 STL 体素化放入虚拟流道，用【格子玻尔兹曼法 (LBM, D3Q19, BGK)】
// 真係解流场（唔系查表 Cd），再由【动量交换法 (Momentum-Exchange)】算出零件受到嘅阻力 → 风阻系数 Cd + 阻力 N。
//
// 诚实声明（同 FEA/模流一脉相承）：呢个系【趋势级】CFD，唔系商用验证级。
//  · 真实高雷诺数（Re>1e4）湍流分离 + 边界层喺低分辨率体素 + 层流 BGK 上解唔到。我哋将「格子雷诺数」
//    钳喺一个【稳定层流带】(reLb)，所以【相对比较】(钝体 vs 流线型、迎风面 vs 背风)同【量级】可信，
//    但高 Re 嘅【绝对 Cd】唔会同风洞实测逐位吻合。报告会列明假设。
//  · 只支持沿包围盒主轴 (X/Y/Z) 嘅来流（覆盖大多数「正面/侧面吹」工况）；任意攻角留待下版。
//
// 复用 voxelfea 嘅 voxelize（水密三角网 → 体素 solid 网格），唔另造轮子；纯 JS / 无新依赖；喺独立 worker 跑。
import { voxelize } from './voxelfea'

export type FluidKind = 'air' | 'water'

export interface FluidProps { name: string; rho: number; mu: number }   // SI: kg/m³, Pa·s
export const WIND_FLUIDS: Record<FluidKind, FluidProps> = {
  air: { name: '空气 (20°C)', rho: 1.204, mu: 1.81e-5 },
  water: { name: '水 (20°C)', rho: 998, mu: 1.0e-3 },
}

export interface WindInput {
  vertices: ArrayLike<number>      // CAD mm 水密三角网
  triangles: ArrayLike<number>
  speed: number                    // 来流速度 m/s
  fluid: FluidKind
  axis?: 0 | 1 | 2                 // 来流轴（包围盒主轴）；缺省 = 最长轴（「鼻尖迎风」）
  sign?: 1 | -1                    // 沿 +轴 或 -轴；缺省 +1
  resolution?: number              // 零件最长边体素数（默认 24，cap 48）；越高越准但越慢
  maxRes?: number                  // 薄件自动加密上限（弱机/手机传低值，免域爆大卡机；缺省 64）
  onProgress?: (pct: number, note: string) => void
}

export interface WindResult {
  h: number                        // 体素边长 mm
  nSurf: number                    // 表面体素数（着色用）
  centers: Float32Array            // nSurf×3 CAD 表面体素中心
  cp: Float32Array                 // nSurf 压力系数 Cp（迎风滞点>0 红 / 背风吸力<0 蓝）
  surfSpeed: Float32Array          // nSurf 表面流速 m/s
  flowPts: Float32Array            // nSamp×3 CAD 流场采样点（零件周围流体）
  flowVel: Float32Array            // nSamp×3 速度向量 m/s（画流线/箭头）
  flowSpeedMax: number             // 流场最大速度 m/s（着色归一化）
  dragN: number                    // 阻力 N（沿来流方向）
  cd: number                       // 阻力系数（无量纲）
  re: number                       // 真实雷诺数 ρVD/μ
  reLb: number                     // 实际模拟用嘅格子雷诺数（稳定层流带）
  frontalAreaMM2: number           // 迎风投影面积 mm²
  refLenM: number                  // 特征长度 m（迎风等效直径）
  speed: number                    // 输入 m/s
  fluidName: string; rho: number; mu: number
  steps: number; converged: boolean
  cpMin: number; cpMax: number
  res: number                      // 实际用嘅体素分辨率（最长边）
  bumped: boolean                  // 系咪因薄件自动加密咗（res > 用户设定）
  warnings: string[]
  // ── GM-W3 3.1：真流线（RK2 中点积分穿过 LBM 速度场）。全部 optional → 旧存档/字节兼容 ──
  streamPts?: Float32Array         // 流线顶点 CAD 坐标（Nverts×3），同 flowPts 同一坐标系
  streamSpeed?: Float32Array       // 每顶点速度 m/s（着色用）
  streamLineOffsets?: Uint32Array  // CSR 每条线起点顶点索引（nLines+1；线 i = [off[i],off[i+1]) ）
  streamSpeedMax?: number          // 流线速度上限 m/s（着色归一化）
  // ── GM-W3 3.2：Maskell 钝体堵塞修正（optional，兼容旧存档）──
  cdCorr?: number                  // 堵塞修正后 Cd（面板 headline；cd 仍系未修正原值）
  blockage?: number                // 堵塞率 B = 迎风面积 / 流道截面（0..1）
  // ── GM-W3 3.3：诚实度透明字段（optional）──
  reClamped?: boolean              // reLb 是否真的被钳入稳定带 [6,800]（面板据此提示）
  cdOsc?: number                   // 末段窗口 Cd 振荡幅值 ±(max−min)/2（涡脱落诚实化）
  // ── S1 GPU 烟流：成个速度场打包俾 client 上 GPU advect 几十万粒 tracer（真风洞烟流质感）。
  //    全部 optional → 旧存档/旧渲染字节兼容；纯加法，唔参与任何物理计算 ──
  volData?: Uint8Array             // DX·DY·DZ·4：RGB=速度(bias 128，格子单位) / A=255 固体·0 流体
  volDims?: [number, number, number]              // [DX, DY, DZ]
  volUMax?: number                 // 解码：u = (rgb/255·2−1) · volUMax · (255/254)
  volMatrix?: number[]             // 16，row-major：域 lattice cell-centre 坐标 → CAD mm
  latInletU?: number               // 入口格子速度 U_LB（做「粒子卡住」判断嘅参考尺度）
  latToMs?: number                 // 格子速度 × 呢个 = m/s
  rake?: { x: number; y0: number; y1: number; z0: number; z1: number }   // 烟耙（粒子出生平面，域坐标）
}

// D3Q19 速度集（0 静止；1-6 面邻；7-18 棱邻）
const EX = [0, 1, -1, 0, 0, 0, 0, 1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0]
const EY = [0, 0, 0, 1, -1, 0, 0, 1, -1, -1, 1, 0, 0, 0, 0, 1, -1, 1, -1]
const EZ = [0, 0, 0, 0, 0, 1, -1, 0, 0, 0, 0, 1, -1, -1, 1, 1, -1, -1, 1]
const W = [1 / 3, 1 / 18, 1 / 18, 1 / 18, 1 / 18, 1 / 18, 1 / 18, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36]
const OPP = [0, 2, 1, 4, 3, 6, 5, 8, 7, 10, 9, 12, 11, 14, 13, 16, 15, 18, 17]
const Q = 19
const U_LB = 0.1                // 来流格子速度（Ma≈0.17，稳定且够快）

function clampRes(r: number | undefined): number {
  const v = Math.round(r !== undefined && Number.isFinite(r) ? r : 24)
  return Math.min(48, Math.max(8, v))
}

/**
 * 跑风洞/水洞趋势模拟。返回流场 + 阻力/Cd/Re。同步长计算（应喺 worker 调用）。
 */
export function runWindTunnel(inp: WindInput): WindResult {
  const warnings: string[] = []
  const prog = inp.onProgress || (() => { })
  const fluid = WIND_FLUIDS[inp.fluid] || WIND_FLUIDS.air
  const V = Number.isFinite(inp.speed) && inp.speed > 0 ? inp.speed : 10
  const baseRes = clampRes(inp.resolution)
  // 薄件【自动加密】：令最薄方向至少 ~6 个体素 —— 薄板/薄壁喺低分辨率净得 1-2 格，绕流解唔准（用户报：扁板 Cd 唔可信）。
  // 由包围盒长宽比推：res = 6·longest/thinnest（res = 最长边体素数）。cap 64 防爆。
  let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity
  for (let i = 0; i + 2 < inp.vertices.length; i += 3) { const x = inp.vertices[i], y = inp.vertices[i + 1], z = inp.vertices[i + 2]; if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y; if (z < mnz) mnz = z; if (z > mxz) mxz = z }
  const longest = Math.max(mxx - mnx, mxy - mny, mxz - mnz), thinnest = Math.min(mxx - mnx, mxy - mny, mxz - mnz)
  const capRes = inp.maxRes && inp.maxRes >= 16 ? Math.round(inp.maxRes) : 64   // 薄件加密上限（弱机传低值）
  let res = baseRes, bumped = false
  if (thinnest > 1e-6 && longest > 0) { const need = Math.ceil(6 * longest / thinnest); if (need > baseRes) { res = Math.min(capRes, need); bumped = res > baseRes } }

  // 1) 体素化零件（CAD mm）
  prog(2, bumped ? `体素化（薄件自动加密到 ${res}）` : '体素化')
  const g = voxelize(inp.vertices, inp.triangles, res, (fr) => prog(2 + fr * 6, '体素化'), Math.max(64, capRes))
  if (!g.nVox || g.nx < 1 || g.ny < 1 || g.nz < 1) throw new Error('风洞：体素化失败（网格可能唔水密或太细）')
  const { nx, ny, nz, h, ox, oy, oz, solid } = g

  // 来流轴：缺省最长轴
  const dims = [nx, ny, nz]
  let fa = inp.axis
  if (fa !== 0 && fa !== 1 && fa !== 2) fa = (dims[0] >= dims[1] && dims[0] >= dims[2]) ? 0 : (dims[1] >= dims[2] ? 1 : 2)
  const sign = inp.sign === -1 ? -1 : 1
  const ca = fa === 0 ? 1 : 0                  // 第一横轴
  const cb = fa === 2 ? 1 : 2                  // 第二横轴
  const nFlow = dims[fa], nA = dims[ca], nB = dims[cb]

  // 2) 砌带边距嘅流道域（来流→ +X）。上游短、下游长（畀尾流发展）、四壁留边距。
  const crossMax = Math.max(nA, nB)
  const padUp = Math.round(0.4 * crossMax) + 4
  const padDown = Math.round(1.2 * crossMax) + 6
  // 逐轴侧壁边距：按【该轴自身】大细（唔再一律用 crossMax）—— 薄板嘅薄轴唔会再被过度 padding 撑爆个域（快 + 慳内存）
  const padA = Math.round(0.45 * nA) + 4
  const padB = Math.round(0.45 * nB) + 4
  const DX = padUp + nFlow + padDown
  const DY = nA + 2 * padA
  const DZ = nB + 2 * padB
  const DN = DX * DY * DZ
  if (DN > 2_600_000) warnings.push(`流道域 ${DX}×${DY}×${DZ}=${(DN / 1e6).toFixed(1)}M 体素偏大，计算较慢；可调低精细度`)

  const obst = new Uint8Array(DN)
  const idxOf = (dx: number, dy: number, dz: number) => dx + DX * (dy + DY * dz)
  const partSolid = (i: number, j: number, k: number) => solid[i + nx * (j + ny * k)] === 1
  const comp = [0, 0, 0]
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!partSolid(i, j, k)) continue
    comp[0] = i; comp[1] = j; comp[2] = k
    let flowIdx = comp[fa]
    if (sign < 0) flowIdx = nFlow - 1 - flowIdx
    obst[idxOf(padUp + flowIdx, padA + comp[ca], padB + comp[cb])] = 1
  }

  // 域(dx,dy,dz) → CAD 坐标（流体/障碍通用；横轴用零件 origin，流轴可超出包围盒）
  const oArr = [ox, oy, oz]
  const domToCad = (dx: number, dy: number, dz: number, out: number[]) => {
    let flowIdx = dx - padUp
    if (sign < 0) flowIdx = nFlow - 1 - flowIdx
    out[fa] = oArr[fa] + (flowIdx + 0.5) * h
    out[ca] = oArr[ca] + (dy - padA + 0.5) * h
    out[cb] = oArr[cb] + (dz - padB + 0.5) * h
  }

  // 3) 物理 → 格子标定。迎风投影面积（域 X 投影：横截面有任意障碍嘅 cell 数）
  const frontMask = new Uint8Array(DY * DZ)
  for (let dz = 0; dz < DZ; dz++) for (let dy = 0; dy < DY; dy++) {
    for (let dx = padUp; dx < padUp + nFlow; dx++) { if (obst[idxOf(dx, dy, dz)]) { frontMask[dy + DY * dz] = 1; break } }
  }
  let aLb = 0
  for (let q = 0; q < frontMask.length; q++) aLb += frontMask[q]
  if (aLb < 1) aLb = 1
  const frontalAreaMM2 = aLb * h * h
  const frontalAreaM2 = frontalAreaMM2 * 1e-6
  const Dlb = Math.sqrt(4 * aLb / Math.PI)
  const refLenM = Math.sqrt(4 * frontalAreaM2 / Math.PI)
  const reReal = fluid.rho * V * refLenM / fluid.mu
  // 钳到稳定带 [6, 800]（Smagorinsky LES 涡黏稳定高端 + 令尾流/分离物理浮现 → 奖励流线化）
  let reLb = reReal
  const reBad = !Number.isFinite(reLb) || reLb <= 0          // GM-W3 3.3(a)：非法/零 Re 亦当已钳（用替代值）
  if (reBad) reLb = 100
  const rePre = reLb
  reLb = Math.min(800, Math.max(6, reLb))
  const reClamped = reBad || reLb !== rePre                  // GM-W3 3.3(a)：钳制是否真的发生 → 面板只喺呢时提示
  let nuLb = U_LB * Dlb / reLb
  let tau = 3 * nuLb + 0.5
  if (tau < 0.503) { tau = 0.503; nuLb = (tau - 0.5) / 3 }
  if (tau > 1.2) { tau = 1.2; nuLb = (tau - 0.5) / 3 }

  // 4) LBM 场分配 + 自由流初始化（f / fnew 双缓冲，靠指针交换免每步 memcpy）
  let f = new Float32Array(DN * Q)
  let fnew = new Float32Array(DN * Q)
  const feqFree = new Float32Array(Q)
  {
    const usq = U_LB * U_LB
    for (let q = 0; q < Q; q++) { const eu = EX[q] * U_LB; feqFree[q] = W[q] * (1 + 3 * eu + 4.5 * eu * eu - 1.5 * usq) }
  }
  for (let n = 0; n < DN; n++) { const b = n * Q; for (let q = 0; q < Q; q++) { f[b + q] = feqFree[q]; fnew[b + q] = feqFree[q] } }

  const off = new Int32Array(Q)
  for (let q = 0; q < Q; q++) off[q] = EX[q] + DX * (EY[q] + DY * EZ[q])

  // 表面外向面（障碍体素 → 流体面邻居）；形阻 = 压力沿表面法向积分（外向 n=+e_q，面积 = 1 格²）。
  // 形阻系真係由解出嘅压力场积分（钝体尾流低压 → 高阻；流线型尾压恢复 → 低阻）—— robust 奖励流线化。
  const faceNode: number[] = [], faceDir: number[] = []
  for (let dz = 1; dz < DZ - 1; dz++) for (let dy = 1; dy < DY - 1; dy++) for (let dx = 1; dx < DX - 1; dx++) {
    const n = idxOf(dx, dy, dz)
    if (!obst[n]) continue
    for (let q = 1; q <= 6; q++) if (!obst[n + off[q]]) { faceNode.push(n); faceDir.push(q) }
  }
  const nFace = faceNode.length
  const fN = Int32Array.from(faceNode), fD = Int32Array.from(faceDir)
  const wettedFaces = nFace                       // 湿表面面数（摩擦阻经验项用）
  const rhoAt = (m: number): number => { const b = m * Q; let r = 0; for (let q = 0; q < Q; q++) r += f[b + q]; return r }
  // F_x = -Σ_面 p·n_x，p=(ρ_流体-1)/3（gauge），外向 n=+e_q → 形阻（沿来流 +X）
  const measureDrag = (): number => {
    let fx = 0
    for (let l = 0; l < nFace; l++) { const q = fD[l]; if (!EX[q]) continue; fx += -((rhoAt(fN[l] + off[q]) - 1) / 3) * EX[q] }
    return fx
  }

  // 一步：碰撞(BGK + Smagorinsky LES in-place) → 流(pull + 半步反弹 → fnew) → 边界 → 指针交换
  const feqB = new Float32Array(Q)
  const feqL = new Float32Array(Q)
  const CS2 = 0.14 * 0.14                         // Smagorinsky 常数²
  const advance = (uIn: number) => {
    const usqF = uIn * uIn
    for (let q = 0; q < Q; q++) { const eu = EX[q] * uIn; feqB[q] = W[q] * (1 + 3 * eu + 4.5 * eu * eu - 1.5 * usqF) }
    for (let n = 0; n < DN; n++) {
      if (obst[n]) continue
      const b = n * Q
      let rho = 0, mx = 0, my = 0, mz = 0
      for (let q = 0; q < Q; q++) { const fq = f[b + q]; rho += fq; mx += EX[q] * fq; my += EY[q] * fq; mz += EZ[q] * fq }
      if (!(rho > 1e-6) || !Number.isFinite(rho)) { for (let q = 0; q < Q; q++) f[b + q] = feqB[q]; continue }  // 守卫：发散 → 复位自由流
      const ux = mx / rho, uy = my / rho, uz = mz / rho
      const usq = ux * ux + uy * uy + uz * uz
      // feq + 非平衡应力张量（Smagorinsky 涡黏）
      let Pxx = 0, Pyy = 0, Pzz = 0, Pxy = 0, Pxz = 0, Pyz = 0
      for (let q = 0; q < Q; q++) {
        const eu = EX[q] * ux + EY[q] * uy + EZ[q] * uz
        const feq = W[q] * rho * (1 + 3 * eu + 4.5 * eu * eu - 1.5 * usq)
        feqL[q] = feq
        const fneq = f[b + q] - feq
        Pxx += EX[q] * EX[q] * fneq; Pyy += EY[q] * EY[q] * fneq; Pzz += EZ[q] * EZ[q] * fneq
        Pxy += EX[q] * EY[q] * fneq; Pxz += EX[q] * EZ[q] * fneq; Pyz += EY[q] * EZ[q] * fneq
      }
      const Pmag = Math.sqrt(2 * (Pxx * Pxx + Pyy * Pyy + Pzz * Pzz) + 4 * (Pxy * Pxy + Pxz * Pxz + Pyz * Pyz))
      const tauT = 0.5 * (Math.sqrt(tau * tau + 18 * 1.41421356 * CS2 * Pmag / rho) - tau)
      const invT = 1 / (tau + tauT)
      for (let q = 0; q < Q; q++) f[b + q] += invT * (feqL[q] - f[b + q])
    }
    for (let dz = 1; dz < DZ - 1; dz++) for (let dy = 1; dy < DY - 1; dy++) for (let dx = 1; dx < DX - 1; dx++) {
      const n = idxOf(dx, dy, dz); if (obst[n]) continue
      const b = n * Q; fnew[b] = f[b]
      for (let q = 1; q < Q; q++) { const src = n - off[q]; fnew[b + q] = obst[src] ? f[b + OPP[q]] : f[src * Q + q] }
    }
    // 边界：入口 + 四侧壁 = 自由流；出口 = 零梯度（copy 内层）
    for (let dz = 0; dz < DZ; dz++) for (let dy = 0; dy < DY; dy++) {
      const bi = idxOf(0, dy, dz) * Q; for (let q = 0; q < Q; q++) fnew[bi + q] = feqB[q]
      const bo = idxOf(DX - 1, dy, dz) * Q, bin = idxOf(DX - 2, dy, dz) * Q
      for (let q = 0; q < Q; q++) fnew[bo + q] = fnew[bin + q]
    }
    for (let dx = 0; dx < DX; dx++) for (let dz = 0; dz < DZ; dz++) {
      let nn = idxOf(dx, 0, dz) * Q; for (let q = 0; q < Q; q++) fnew[nn + q] = feqB[q]
      nn = idxOf(dx, DY - 1, dz) * Q; for (let q = 0; q < Q; q++) fnew[nn + q] = feqB[q]
    }
    for (let dx = 0; dx < DX; dx++) for (let dy = 0; dy < DY; dy++) {
      let nn = idxOf(dx, dy, 0) * Q; for (let q = 0; q < Q; q++) fnew[nn + q] = feqB[q]
      nn = idxOf(dx, dy, DZ - 1) * Q; for (let q = 0; q < Q; q++) fnew[nn + q] = feqB[q]
    }
    const t = f; f = fnew; fnew = t
  }

  // 5) 主循环（带余弦速度渐升避免冲击启动；收敛只喺 ramp 后判）
  const rampSteps = Math.max(150, Math.round(0.6 * DX / U_LB))
  const maxSteps = rampSteps + Math.min(6000, Math.max(1500, Math.round(4.5 * DX / U_LB)))
  const minSteps = rampSteps + Math.round(1.8 * DX / U_LB)
  const debug = !!(inp as { _debug?: boolean })._debug
  const cdNorm = 1 / (0.5 * U_LB * U_LB * aLb)
  const samples: number[] = []
  let converged = false, step = 0
  for (; step < maxSteps; step++) {
    const r = step < rampSteps ? 0.5 * (1 - Math.cos(Math.PI * step / rampSteps)) : 1
    advance(U_LB * r)
    if (step >= rampSteps && step % 20 === 0) {
      const cdNow = measureDrag() * cdNorm
      samples.push(cdNow)
      if (debug && step % 200 === 0) console.log(`  step ${step} Cd=${cdNow.toFixed(3)}`)
      if (!debug && step > minSteps && samples.length >= 12) {
        const w = samples.slice(-10)
        let mn = Infinity, mx = -Infinity, sum = 0
        for (const x of w) { if (x < mn) mn = x; if (x > mx) mx = x; sum += x }
        if ((mx - mn) / (Math.abs(sum / w.length) + 1e-9) < 0.012) { converged = true; step++; break }
      }
      prog(8 + 86 * Math.min(1, step / maxSteps), `求解流场 ${(100 * Math.min(1, step / maxSteps)).toFixed(0)}%`)
    }
  }
  // GM-W3 3.3(c)：末段【窗口】时均（ramp 后样本的最后 25%，最少 6 个）抑制残余波动 = 形阻系数（模拟解出），
  // 同时量化涡脱落振荡幅值 → 面板显示 Cd = X ± Y，令周期性分离（钝体尾涡）诚实化，唔再净读末一步。
  const tailN = Math.max(6, Math.round(samples.length * 0.25))
  const tailW = samples.slice(-tailN)
  let tSum = 0, tMn = Infinity, tMx = -Infinity
  for (const x of tailW) { tSum += x; if (x < tMn) tMn = x; if (x > tMx) tMx = x }
  const cdForm = Math.abs(tailW.length ? tSum / tailW.length : measureDrag() * cdNorm)
  const cdOsc = tailW.length > 1 ? (tMx - tMn) / 2 : 0        // 振荡幅值 ±(max−min)/2（形阻窗口内）
  // 摩擦(表面)阻经验补全：平板 Cf 按真实 Re（层流 Blasius / 湍流 1/7 次方）—— 形阻系真解，摩擦系趋势项
  const cf = reReal < 5e5 ? 1.328 / Math.sqrt(Math.max(reReal, 1)) : 0.074 / Math.pow(reReal, 0.2)
  // GM-W3 3.3(b)：体素【楼梯效应】令湿表面面积比光滑三角网高 ~1.5×（斜面被切成台阶），会高估摩擦阻。
  // 用真实网格面积 / 体素暴露面积 做缩放（钳 [0.4,1.0]，只向下修正，唔会放大）。诚实：几何级近似，非壁面积分。
  let meshArea = 0
  {
    const vs = inp.vertices, ts = inp.triangles
    for (let t = 0; t + 2 < ts.length; t += 3) {
      const a = ts[t] * 3, b = ts[t + 1] * 3, c = ts[t + 2] * 3
      const ux = vs[b] - vs[a], uy = vs[b + 1] - vs[a + 1], uz = vs[b + 2] - vs[a + 2]
      const vx = vs[c] - vs[a], vy = vs[c + 1] - vs[a + 1], vz = vs[c + 2] - vs[a + 2]
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx
      meshArea += 0.5 * Math.hypot(cx, cy, cz)               // mm²
    }
  }
  const voxelArea = wettedFaces * h * h                       // mm²（每暴露面 = 1 格²）
  let fricScale = voxelArea > 1e-9 && meshArea > 0 ? meshArea / voxelArea : 1
  fricScale = Math.min(1, Math.max(0.4, fricScale))
  const cdFric = cf * wettedFaces / aLb * fricScale
  const cd = cdForm + cdFric                                  // 原始（未修正）Cd
  const dragN = cd * 0.5 * fluid.rho * V * V * frontalAreaM2  // Cd 无量纲 → 换返真实工况 SI（用原始 Cd）
  // GM-W3 3.2：Maskell 钝体堵塞修正 —— 迎风投影/流道截面愈大，风洞壁令实测 Cd 偏高。
  // Cd_corr = Cd / (1 + εM·Cd·B)，εM≈0.96（Maskell 1963 钝体形式），B = 迎风面积/流道截面。诚实：趋势级经验修正。
  const blockage = aLb / (DY * DZ)                            // 堵塞率 B（格子面积比 = 物理面积比）
  const EPS_MASKELL = 0.96
  const cdCorr = cd / (1 + EPS_MASKELL * cd * blockage)

  // 6) 采表面场（Cp + 表面流速）+ 流场样本（箭头）
  prog(96, '取场')
  const cadT = [0, 0, 0]
  const halfU2 = 0.5 * U_LB * U_LB
  const Vscale = V / U_LB
  const surfCenters: number[] = [], surfCp: number[] = [], surfSpd: number[] = []
  const macro = (n: number) => {
    const b = n * Q; let rho = 0, mx = 0, my = 0, mz = 0
    for (let q = 0; q < Q; q++) { const fq = f[b + q]; rho += fq; mx += EX[q] * fq; my += EY[q] * fq; mz += EZ[q] * fq }
    if (rho < 1e-6) rho = 1e-6
    return { rho, ux: mx / rho, uy: my / rho, uz: mz / rho }
  }
  let cpMin = Infinity, cpMax = -Infinity
  for (let dz = 1; dz < DZ - 1; dz++) for (let dy = 1; dy < DY - 1; dy++) for (let dx = 1; dx < DX - 1; dx++) {
    const n = idxOf(dx, dy, dz)
    if (!obst[n]) continue
    let rhoS = 0, spdS = 0, cnt = 0
    for (let q = 1; q <= 6; q++) {
      const m = n + off[q]
      if (m < 0 || m >= DN || obst[m]) continue
      const mm = macro(m); rhoS += mm.rho; spdS += Math.sqrt(mm.ux * mm.ux + mm.uy * mm.uy + mm.uz * mm.uz); cnt++
    }
    if (!cnt) continue   // 内部体素 → 唔输出（只着色表面壳）
    const cp = (rhoS / cnt - 1) / (3 * halfU2)    // Cp=(p-p∞)/(½ρV²)=(ρ-1)/(3·½u_lb²)
    domToCad(dx, dy, dz, cadT)
    surfCenters.push(cadT[0], cadT[1], cadT[2]); surfCp.push(cp); surfSpd.push((spdS / cnt) * Vscale)
    if (cp < cpMin) cpMin = cp; if (cp > cpMax) cpMax = cp
  }
  if (!surfCenters.length) { cpMin = 0; cpMax = 0 }

  // 流场采样（每 stride 取一个非障碍 cell；cap ~5000）
  const flowPts: number[] = [], flowVel: number[] = []
  let flowSpeedMax = 0
  const stride = Math.max(2, Math.round(Math.cbrt(DN / 5000)))
  for (let dz = 1; dz < DZ - 1; dz += stride) for (let dy = 1; dy < DY - 1; dy += stride) for (let dx = 1; dx < DX - 1; dx += stride) {
    const n = idxOf(dx, dy, dz)
    if (obst[n]) continue
    const mm = macro(n)
    const vel = [0, 0, 0]
    vel[fa] = sign * mm.ux * Vscale; vel[ca] = mm.uy * Vscale; vel[cb] = mm.uz * Vscale
    const spd = Math.hypot(vel[0], vel[1], vel[2])
    if (spd > flowSpeedMax) flowSpeedMax = spd
    domToCad(dx, dy, dz, cadT)
    flowPts.push(cadT[0], cadT[1], cadT[2]); flowVel.push(vel[0], vel[1], vel[2])
  }

  // GM-W3 3.1：真流线 —— 像商用 CFD 咁显示【流动】而非「简单箭头」。
  // 由入口面播种网格 + 环绕零件迎风轮廓加密带，用 RK2 中点 + 三线性插值沿解出嘅速度场向下游积分。
  prog(97, '追踪流线')
  // 域速度场缓存（格子单位）；障碍/固体节点 = 0 → 流线到壁面自然减速停下（无滑移，唔会穿入零件）。
  const vfield = new Float32Array(DN * 3)
  for (let n = 0; n < DN; n++) {
    if (obst[n]) continue
    const b = n * Q; let rho = 0, mx = 0, my = 0, mz = 0
    for (let q = 0; q < Q; q++) { const fq = f[b + q]; rho += fq; mx += EX[q] * fq; my += EY[q] * fq; mz += EZ[q] * fq }
    if (rho < 1e-6) continue
    vfield[n * 3] = mx / rho; vfield[n * 3 + 1] = my / rho; vfield[n * 3 + 2] = mz / rho
  }
  // 三线性插值域速度（返回格子单位；域外 = false）
  const sampleV = (px: number, py: number, pz: number, out: number[]): boolean => {
    if (px < 0 || py < 0 || pz < 0 || px > DX - 1 || py > DY - 1 || pz > DZ - 1) return false
    let x0 = Math.floor(px), y0 = Math.floor(py), z0 = Math.floor(pz)
    if (x0 > DX - 2) x0 = DX - 2; if (y0 > DY - 2) y0 = DY - 2; if (z0 > DZ - 2) z0 = DZ - 2
    const fx = px - x0, fy = py - y0, fz = pz - z0
    let vx = 0, vy = 0, vz = 0
    for (let c = 0; c < 8; c++) {
      const ix = x0 + (c & 1), iy = y0 + ((c >> 1) & 1), iz = z0 + ((c >> 2) & 1)
      const wgt = ((c & 1) ? fx : 1 - fx) * (((c >> 1) & 1) ? fy : 1 - fy) * (((c >> 2) & 1) ? fz : 1 - fz)
      const m = (ix + DX * (iy + DY * iz)) * 3
      vx += wgt * vfield[m]; vy += wgt * vfield[m + 1]; vz += wgt * vfield[m + 2]
    }
    out[0] = vx; out[1] = vy; out[2] = vz
    return true
  }
  // 播种：入口附近平面（dx≈2）横跨测试段 7×7 网格 + 沿迎风轮廓加密带（总条数 ≤ ~64）
  const seeds: number[][] = []
  const seedDx = Math.min(DX * 0.15, padUp * 0.5 + 2)
  const NA = 7, NB = 7
  const y0s = Math.max(1, padA - 0.35 * nA), y1s = Math.min(DY - 2, padA + nA + 0.35 * nA)
  const z0s = Math.max(1, padB - 0.35 * nB), z1s = Math.min(DZ - 2, padB + nB + 0.35 * nB)
  for (let a = 0; a < NA; a++) for (let bb = 0; bb < NB; bb++) {
    seeds.push([seedDx, y0s + (y1s - y0s) * (NA > 1 ? a / (NA - 1) : 0.5), z0s + (z1s - z0s) * (NB > 1 ? bb / (NB - 1) : 0.5)])
  }
  const silh: number[] = []
  for (let dz = 0; dz < DZ; dz++) for (let dy = 0; dy < DY; dy++) if (frontMask[dy + DY * dz]) silh.push(dy, dz)
  const nSil = silh.length / 2, wantSil = Math.max(0, Math.min(24, 64 - seeds.length))
  if (nSil > 0 && wantSil > 0) {
    const st = Math.max(1, Math.floor(nSil / wantSil))
    for (let s = 0; s < nSil; s += st) seeds.push([seedDx, silh[s * 2] + 0.5, silh[s * 2 + 1] + 0.5])
  }
  // RK2 中点积分（单位速度参数化，步长 ~0.4 格；每线最多 500 步；|v|<tiny → 停滞/入体 → 停）
  const H_STEP = 0.4, MAX_STEP = 500, V_TINY = 1e-4
  // ★穿模修★：三线性插值喺壁面附近会把【流体+固体】节点撈埋一齐 → 得出一个仲有大细、而且指入墙嘅速度，
  //   令流线行入零件先至因为 |v|→0 停低（用户报「风穿得过个模型」）。加一个硬固体闸：踩到障碍体素即刻停线。
  //   纯后处理 —— 唔掂任何 LBM 求解，Cd / 阻力 / Re / steps 逐位不变。
  const inObst = (px: number, py: number, pz: number): boolean => {
    const i = Math.round(px), j = Math.round(py), k = Math.round(pz)
    if (i < 0 || j < 0 || k < 0 || i >= DX || j >= DY || k >= DZ) return false
    return obst[idxOf(i, j, k)] === 1
  }
  const streamPtsArr: number[] = [], streamSpeedArr: number[] = [], lineOff: number[] = [0]
  const sp = [0, 0, 0], sv1 = [0, 0, 0], sv2 = [0, 0, 0], scad = [0, 0, 0]
  let streamSpeedMax = 1e-9
  for (const sd of seeds) {
    sp[0] = sd[0]; sp[1] = sd[1]; sp[2] = sd[2]
    if (!sampleV(sp[0], sp[1], sp[2], sv1) || Math.hypot(sv1[0], sv1[1], sv1[2]) < V_TINY) continue
    const base = streamPtsArr.length, baseS = streamSpeedArr.length
    let cnt = 0
    for (let it = 0; it < MAX_STEP; it++) {
      if (inObst(sp[0], sp[1], sp[2])) break                                        // ★穿模修★：踩到零件 → 停线（唔好画入去）
      if (!sampleV(sp[0], sp[1], sp[2], sv1)) break
      const s1 = Math.hypot(sv1[0], sv1[1], sv1[2]); if (s1 < V_TINY) break
      domToCad(sp[0], sp[1], sp[2], scad)
      streamPtsArr.push(scad[0], scad[1], scad[2])
      const spd = s1 * Vscale; streamSpeedArr.push(spd); if (spd > streamSpeedMax) streamSpeedMax = spd
      cnt++
      const inv1 = 1 / s1
      const mx = sp[0] + 0.5 * H_STEP * sv1[0] * inv1, my = sp[1] + 0.5 * H_STEP * sv1[1] * inv1, mz = sp[2] + 0.5 * H_STEP * sv1[2] * inv1
      if (!sampleV(mx, my, mz, sv2)) break
      const s2 = Math.hypot(sv2[0], sv2[1], sv2[2]); if (s2 < V_TINY) break
      const inv2 = 1 / s2
      sp[0] += H_STEP * sv2[0] * inv2; sp[1] += H_STEP * sv2[1] * inv2; sp[2] += H_STEP * sv2[2] * inv2
    }
    if (cnt >= 2) lineOff.push(streamPtsArr.length / 3)
    else { streamPtsArr.length = base; streamSpeedArr.length = baseS }   // 撤销唔够长嘅线
  }
  const streamPts = Float32Array.from(streamPtsArr)
  const streamSpeed = Float32Array.from(streamSpeedArr)
  const streamLineOffsets = Uint32Array.from(lineOff)

  // ── S1 GPU 烟流：把【已经解好】嘅速度场 vfield 打包成 RGBA8 3D texture + 域→CAD 变换矩阵 + 烟耙矩形。
  //    纯加法 —— 唔掂任何物理计算，Cd / 阻力 / Re / steps 逐位不变（vfield 本身就系上面流线用嗰个）。
  //    点解 RGBA8 唔用 Float32：① 4 bytes/voxel 而唔系 12（传输 + VRAM 细 3 倍）② RGBA8 嘅 linear filtering
  //    喺 WebGL2 系保证支援，Float32 3D linear 要 OES_texture_float_linear（好多手机冇）③ 精度 1/255·uMax
  //    做视觉化绰绰有余。最大 res=48 都只系 ~7 MB，唔使降采样。
  prog(98, '打包流场')
  let volUMax = 1e-6
  for (let n = 0; n < DN; n++) {
    if (obst[n]) continue
    const s = Math.hypot(vfield[n * 3], vfield[n * 3 + 1], vfield[n * 3 + 2])
    if (s > volUMax) volUMax = s
  }
  volUMax = Math.max(volUMax, 1.5 * U_LB)                 // 保底：至少覆盖入口速度，免除零/极静场爆量化
  const volData = new Uint8Array(DN * 4)
  const volQ = 127 / volUMax
  for (let n = 0; n < DN; n++) {
    const o = n * 4
    if (obst[n]) { volData[o] = 128; volData[o + 1] = 128; volData[o + 2] = 128; volData[o + 3] = 255; continue }  // A=1 → 固体（粒子撞到即重生）
    volData[o] = 128 + Math.max(-127, Math.min(127, Math.round(vfield[n * 3] * volQ)))
    volData[o + 1] = 128 + Math.max(-127, Math.min(127, Math.round(vfield[n * 3 + 1] * volQ)))
    volData[o + 2] = 128 + Math.max(-127, Math.min(127, Math.round(vfield[n * 3 + 2] * volQ)))
    volData[o + 3] = 0                                    // A=0 → 流体
  }
  // 域 lattice cell-centre 坐标（cell i 中心 = i+0.5）→ CAD mm。由 domToCad 逐项反推（代入 dx = px−0.5）：
  //   sign>0: world[fa] =  h·px + (o[fa] − padUp·h)        sign<0: world[fa] = −h·px + (o[fa] + (nFlow+padUp)·h)
  //           world[ca] =  h·py + (o[ca] − padA·h)                 world[cb] =  h·pz + (o[cb] − padB·h)
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
  // 烟耙 = 粒子出生平面。直接重用【流线播种嗰个矩形】（seedDx / y0s..z1s），唔另外估 —— 保证两种视觉化同源。
  // ⚠ +0.5：seedDx/y0s… 系【求解器 index 约定】（sampleV 里 整数 i = cell i 嘅取样点）；GPU 侧统一用
  //   【cell-centre 约定】（cell i 中心 = i+0.5，配合 volMatrix + texcoord = p/N）。喺出口一次过转，client 唔使再谂。
  const rake = { x: seedDx + 0.5, y0: y0s + 0.5, y1: y1s + 0.5, z0: z0s + 0.5, z1: z1s + 0.5 }

  prog(100, '完成')
  if (reReal > 1e4) warnings.push(`真实 Re≈${reReal.toExponential(1)}（湍流区）— 趋势模拟用稳定层流带 reLb=${reLb.toFixed(0)}，绝对 Cd 偏趋势值，相对比较仍可信`)
  if (g.oddColumns > g.nVox * 0.02) warnings.push('网格可能唔完全水密（部分射线奇数交点），阻力含少量误差')
  if (bumped) warnings.push(`薄件自动加密：分辨率 ${baseRes}→${res}（令最薄方向够体素，绝对 Cd 较可信）`)
  const thinVox = thinnest > 1e-6 ? Math.round(thinnest / h) : 0
  if (thinVox > 0 && thinVox < 4) warnings.push(`零件最薄方向仅 ${thinVox} 个体素 — 仍偏薄，Cd 准度有限；如重要可手动再调高精细度或换吹向`)

  return {
    h, nSurf: surfCp.length,
    centers: Float32Array.from(surfCenters), cp: Float32Array.from(surfCp), surfSpeed: Float32Array.from(surfSpd),
    flowPts: Float32Array.from(flowPts), flowVel: Float32Array.from(flowVel), flowSpeedMax,
    dragN: Math.abs(dragN), cd, re: reReal, reLb,
    frontalAreaMM2, refLenM, speed: V,
    fluidName: fluid.name, rho: fluid.rho, mu: fluid.mu,
    steps: step, converged, cpMin, cpMax, res, bumped, warnings,
    // GM-W3 3.2 / 3.3：修正 Cd + 堵塞率 + 钳制/振荡透明度（全部 optional，兼容旧存档）
    cdCorr, blockage, reClamped, cdOsc,
    // GM-W3 3.1：真流线（有解到先带；否则唔加字段 → 旧渲染/字节兼容）
    ...(streamLineOffsets.length > 1 ? { streamPts, streamSpeed, streamLineOffsets, streamSpeedMax } : {}),
    // S1 GPU 烟流：速度场 3D texture + 域→CAD 矩阵 + 烟耙（optional；旧渲染完全唔受影响）
    volData, volDims: [DX, DY, DZ] as [number, number, number], volUMax, volMatrix,
    latInletU: U_LB, latToMs: Vscale, rake,
  }
}
