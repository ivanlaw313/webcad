// =====================================================================================
// voxelfea.ts — 体素趋势 FEA（线弹性、小变形、均匀六面体）
// 非商用 FEA 级精度，用于「边度最受力/最可能断」趋势着色。
//
// 全部自写（无第三方/无复制代码），零 import，纯 TypeScript，自包含。
//
// 流程：
//   1. 体素化 — z 列奇偶规则（triangle-driven：逐三角形找其 xy 投影覆盖嘅列，
//      记低竖直射线交点 z；列内排序+去重后按奇偶配对填充体素中心）。
//   2. 单元 — 全部体素共用同一个 8 节点三线性六面体刚度 Ke（24x24，
//      2x2x2 高斯积分，均匀立方体 → 经典 topology-optimization 结构）。
//   3. 求解 — matrix-free Jacobi 预条件共轭梯度（CG）；固定 DOF 用投影法
//      （运算前后清零固定项 + 对角放 1，f[fixed]=0）。
//   4. 应力 — 单元中心 sigma = D * B(0,0,0) * u_e → von Mises。
//
// 单位约定：长度 mm，力 N，E 用 MPa（N/mm^2）→ 位移 mm，应力 MPa。
//
// 局部节点编号（全文件一致，勿改）：
//   a = 0..7，体素角偏移 (ax,ay,az) = (a&1, (a>>1)&1, (a>>2)&1)
//   即 n0=(0,0,0) n1=(1,0,0) n2=(0,1,0) n3=(1,1,0)
//      n4=(0,0,1) n5=(1,0,1) n6=(0,1,1) n7=(1,1,1)
//   自然坐标符号 ξa=2ax-1, ηa=2ay-1, ζa=2az-1；每节点 DOF 顺序 [ux,uy,uz]。
//   B 应变行序 [εxx, εyy, εzz, γxy, γyz, γzx]（工程剪应变）。
// =====================================================================================

// S133：真 B-rep 面 → 节点集合桥（FEA 载荷/约束按有界面贴，唔再无限平面扫）。
// faceFeaSelect 用同一 grid.solid + 同一遍历顺序复算 nodeId，故返回嘅紧凑 nodeId 同本文件 1:1 对齐。
import { faceFeaSelect } from './faceFeaSelect'

export interface PlanePick { point: [number, number, number]; normal: [number, number, number] }

/**
 * 销 / 圆柱约束（pin / cylindrical support）。模拟销轴 / 螺栓孔支承：
 * 落喺该圆柱面 ±band 内嘅实体节点，其「径向 DOF」（节点到轴线的垂直方向）锁死，
 * 轴向 + 切向自由（轴对齐圆柱孔可直接转动 + 沿轴滑）。
 * 注：用罚函数（penalty）实现径向锁——因为径向方向唔系坐标轴对齐，
 * 唔可以直接用 fixedMask 投影；详见 runVoxelFea 内 pin 处理。
 */
export interface PinConstraint {
  axisPoint: [number, number, number]   // 轴线上一点（mm）
  axisDir: [number, number, number]     // 轴向（无需归一）
  radius: number                         // 圆柱半径（mm，孔半径）
  bandTol?: number                       // 径向容差带半厚度，默认用主输入 bandTol（0.6*h）
}

/**
 * S171：轴承载荷（bearing load，Fusion Bearing Load）。模拟销/螺栓推圆柱孔壁：
 * 合力 force 余弦分布喺孔面【受推半边】（节点外向径向与载荷方向相反嗰侧），权 w=max(0,−r̂·f̂)，
 * 每节点力 = force·w/Σw（方向 = 载荷方向，两遍归一令 Σ == 合力）。比均布点载更准嘅孔边峰值应力。
 * ⚠ 限制（同 PinConstraint 一致）：节点用【径向带】(|r−radius|<band) 选取 — 只系一层圆柱壳，唔验内侧系咪空（孔）。
 *   拣实心圆轴/凸台侧面会喺内部生成一层虚拟壳载荷（无意义但仍可解）。请拣真孔面。载荷方向须【垂直孔轴】（轴向分量无效）。
 */
export interface BearingLoad {
  axisPoint: [number, number, number]   // 孔轴线上一点（mm）
  axisDir: [number, number, number]     // 轴向（无需归一）
  radius: number                         // 孔半径（mm）
  force: [number, number, number]        // 合力 N（轴承推力方向；分布到受推半边）
  bandTol?: number                       // 径向容差带半厚度，默认用主输入 bandTol
}

export interface FeaInput {
  vertices: ArrayLike<number>      // CAD mm 坐标，xyz 三元组（水密三角形网格）
  triangles: ArrayLike<number>     // 顶点索引三元组
  fixed: PlanePick                 // 夹持面：带内实体节点全部 DOF 固定
  load: PlanePick                  // 受力面
  force: [number, number, number]  // 合力 N，平均分摊到受力带节点
  // ---- S133：真 B-rep 面三角（flat xyz，每 9 个数 = 1 三角；CAD 坐标，同 vertices/triangles 同一 frame）----
  //   传入即用 faceFeaSelect 按有界面精确拣节点，取代对应嘅 PlanePick band 距离测试（杀无限平面误拣）。
  //   缺省（undefined / 空）= 完全回退到 fixed/load PlanePick band 路径，字节级向后兼容。
  fixedFaceTris?: number[]         // 夹持面三角；present → 固定节点集由该面解算
  loadFaceTris?: number[]          // 受力面三角；present → 受力节点集由该面解算（force 均分到该面节点）
  E: number                        // 杨氏模量 MPa (N/mm^2)
  nu: number                       // 泊松比
  resolution: number               // 最长包围盒轴方向目标体素数（截到 [4,64]）
  bandTol?: number                 // 平面带半厚度，默认 0.6*h
  fixCon?: 'fixed' | 'roller' | 'sym'  // S100：约束类型。fixed=全 DOF 固定(默认/兼容)；roller=只锁法向主轴 DOF(准面内滑)；sym=对称面(轴对齐 voxel 下数学同 roller)
  // ---- 简支梁 / 3 点弯（用户：想睇「中间断」）。present 时两端做支撑、中间施力 → 弯矩最大喺中间。----
  //   两支撑只锁【竖直(load 轴)】DOF（roller，避免夹持应力集中令支座误红）；A 端额外锁横向+轴向做 anchor 去刚体模态、
  //   B 端只锁竖直+横向（轴向自由，准热胀/挠曲）。well-posed。fixed=支撑 A 面、fixed2=支撑 B 面、load=中间。
  fixed2?: PlanePick               // 第二支撑面（简支梁）
  beam3pt?: boolean                // true = 简支梁模式（上述支撑逻辑，取代 fixCon）
  // ---- 仿真增强（全部可选，唔填 = 同原本完全一致；趋势级·非商用精度）----
  gravity?: [number, number, number]  // 重力 / 自重体载，mm/s²（地球 z 向下例：[0,0,-9810]）。
                                       //   每实体素 ρ·V·g 平均分到 8 节点（lumped），叠加到外载 F。
  density?: number                 // 材料密度 g/cm³（= 1e-9 tonne/mm³；钢 7.85）。
                                   //   仅 gravity 非零时用；缺省时若有 gravity 则报错（无密度算唔到自重）。
  pin?: PinConstraint              // 销 / 圆柱约束：径向 DOF 锁死（penalty），轴向+切向自由。
  bearing?: BearingLoad            // S171：轴承载荷 — 圆柱孔上余弦分布径向推力（合力散布到受推半边节点）。可单独做载荷（无平面受力面）。
  // ---- CUT-CELL（部分体积刚度缩放）：减低体素阶梯（staircase）对曲面/斜面嘅刚度高估 ----
  //   边界体素（只部分落喺实体内）按其「占空比 occupancy（实体体积分数 0..1）」缩放单元刚度
  //   Ke_e = max(frac_e, fracMin)·Ke，而唔系全进/全出二值。占空比用体素内 S×S×S 子采样点
  //   对实体做 inside-test（同体素化一致嘅 z 列射线奇偶规则）统计。内部体素 frac≈1 → 不变。
  //   呢个系标准 cut-cell / density 近似：令离散刚度更贴近真实光滑边界，绝对位移/应力更准。
  //   缺省（undefined）= 开启（严格提升精度且向后兼容：store 唔传 = 自动受益）。
  //   传 false = 完全等同旧行为（全进全出，所有 frac=1），用于对照/回归。
  cutCell?: boolean                // 缺省 true（开）；false = 旧二值行为
  cutCellSub?: number              // 子采样每轴点数 S（截到 [2,5]，默认 3 → 3³=27 点/体素）
  cgTol?: number                   // 相对残差目标，默认 1e-6
  maxIter?: number                 // 默认 4000
  onProgress?: (phase: string, frac: number) => void   // 阶段：'voxelize' | 'solve' | 'stress'
}

export interface FeaResult {
  ok: boolean; error?: string; warnings: string[]
  h: number                        // 体素边长 mm
  nVox: number; nDof: number
  centers: Float32Array            // n*3 实体体素中心，CAD 坐标
  vm: Float32Array                 // n 个 von Mises 应力，MPa（单元中心）
  vmMax: number; vmMaxAt: [number, number, number]
  vmMaxE?: number                  // S168：vmMax 所在体素索引（变形显示时红球随该体素 dispVec 偏移用；undefined=旧结果回退到 vmMaxAt）
  dispMax: number                  // 节点最大 |u|，mm
  disp: Float32Array               // S96：n 个体素中心位移幅值（8 节点 u 平均），mm — 位移云图用
  dispVec?: Float32Array           // S168：n*3 体素中心【有符号】位移向量 [ux,uy,uz]（8 节点平均），mm — 变形形态/动画用（disp 系其幅值）
  iters: number; residual: number; converged: boolean
  fixedCount: number; loadCount: number
  reaction?: [number, number, number]   // S163：固定支座反力和 [Rx,Ry,Rz] N（仅静力解；−reaction ≈ 外加载荷）
  reactionMag?: number                   // |reaction| N
  s1?: Float32Array; s3?: Float32Array; shear?: Float32Array   // S164：σ1 最大主应力 / σ3 最小主应力 / τmax 最大剪应力场（单元中心，MPa）
  // S189：`tresca` 系 `shear` 嘅显式别名（同指一个 Float32Array，structured-clone 后仍共享同份数据）。
  //   慣例（查证 Fusion 360）：Fusion「Maximum Shear Stress」结果场 = τmax = (σ1−σ3)/2 —— 即本场嘅值。
  //   注意区分：Tresca **等效应力**（Tresca equivalent，用于降伏准则 σ_Tresca ≥ σ_yield）= σ1−σ3 = 2·tresca（无除 2）。
  //   本场跟 Fusion「Max Shear」慣例采用 /2 版本；要 Tresca 等效应力时乘 2 即得。
  tresca?: Float32Array                  // S189：τmax 最大剪应力场（=shear 别名，(σ1−σ3)/2，MPa）— Fusion Max Shear 慣例
  s1Max?: number                         // σ1 峰值（最拉，可为负 = 全场受压）
  s3Min?: number                         // σ3 谷值（最压，可为正 = 全场受拉）
  shearMax?: number                      // τmax 峰值（=(σ1−σ3)/2 峰值；Tresca 等效应力峰值 = 2·shearMax）
  sed?: Float32Array; sedMax?: number    // S167：应变能密度场 u=½σ:ε（mJ/mm³）+ 峰值
}

// ------------------------------------------------------------------ 基础小工具

/** 分辨率截到 [4,cap]；非法值用 32。cap 缺省 64（FEA 体素预算）；模流可传更高 cap（薄件细孔需要）。 */
function clampResolution(r: number, cap = 64): number {
  const v = Math.round(Number.isFinite(r) ? r : 32)
  return Math.min(cap, Math.max(4, v))
}

function normalize3(v: [number, number, number]): [number, number, number] | null {
  const len = Math.hypot(v[0], v[1], v[2])
  if (!(len > 0) || !Number.isFinite(len)) return null
  return [v[0] / len, v[1] / len, v[2] / len]
}

/** von Mises 等效应力（txy 等为剪应力分量）。 */
function vonMises(sx: number, sy: number, sz: number, txy: number, tyz: number, tzx: number): number {
  const v = sx * sx + sy * sy + sz * sz - sx * sy - sy * sz - sz * sx
    + 3 * (txy * txy + tyz * tyz + tzx * tzx)
  return Math.sqrt(Math.max(0, v))
}

// S164：对称 3×3 应力张量主应力（解析 — Smith/Cardano 三角法，对称阵数值稳定）。
// 矩阵 A = [[sx,txy,tzx],[txy,sy,tyz],[tzx,tyz,sz]]，返回 [λ1≥λ2≥λ3]（σ1 最大主应力=最拉，σ3 最小=最压）。
export function princ3(sx: number, sy: number, sz: number, txy: number, tyz: number, tzx: number): [number, number, number] {
  const p1 = txy * txy + tyz * tyz + tzx * tzx
  if (p1 === 0) {                       // 对角阵：主应力即对角元
    const e = [sx, sy, sz].sort((a, b) => b - a)
    return [e[0], e[1], e[2]]
  }
  const q = (sx + sy + sz) / 3          // 迹/3
  const p2 = (sx - q) * (sx - q) + (sy - q) * (sy - q) + (sz - q) * (sz - q) + 2 * p1
  const p = Math.sqrt(p2 / 6)
  // 数值守卫：p1>0 数学上保证 p>0，但灾难性相消（normal stress 近相等且巨大）/ 上游 NaN 可令 p=0 或非有限 → 后面除以 p 产 NaN/Inf。
  // 退回对角主应力（同 p1===0 分支）避免污染 s1/s3/shear 场。
  if (!(p > 0) || !Number.isFinite(p)) { const e = [sx, sy, sz].sort((a, b) => b - a); return [e[0], e[1], e[2]] }
  // B = (1/p)(A − qI)，det(B)/2 = cos(3φ)
  const bxx = (sx - q) / p, byy = (sy - q) / p, bzz = (sz - q) / p
  const bxy = txy / p, byz = tyz / p, bxz = tzx / p
  const detB = bxx * (byy * bzz - byz * byz) - bxy * (bxy * bzz - byz * bxz) + bxz * (bxy * byz - byy * bxz)
  const r = Math.max(-1, Math.min(1, detB / 2))
  const phi = Math.acos(r) / 3
  const e1 = q + 2 * p * Math.cos(phi)                       // 最大
  const e3 = q + 2 * p * Math.cos(phi + (2 * Math.PI) / 3)   // 最小
  const e2 = 3 * q - e1 - e3                                 // 中（迹守恒）
  return [e1, e2, e3]
}

/** 局部节点 a 的体素角偏移（0/1），a = ax + 2*ay + 4*az。 */
const HEX_OFFSETS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
  [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
]

// ------------------------------------------------------------------ 体素化

interface VoxelGrid {
  h: number
  nx: number; ny: number; nz: number
  ox: number; oy: number; oz: number   // 网格原点 = 包围盒最小角
  solid: Uint8Array                    // nx*ny*nz，i + nx*(j + ny*k)
  nVox: number
  oddColumns: number                   // 奇数命中列（被跳过）条数
}

/**
 * z 列奇偶体素化（triangle-driven）。
 * 列中心加微小无理数抖动避开三角形边/顶点精确命中；
 * 同列相距 < 1e-7 嘅命中视为重复（共边/共点）合并。
 * （named export：moldflow.ts 复用同一体素化；_internals.voxelize 别名保留。）
 */
export function voxelize(
  vertices: ArrayLike<number>,
  triangles: ArrayLike<number>,
  resolution: number,
  onFrac?: (frac: number) => void,
  maxRes = 64,                          // 分辨率硬上限；缺省 64（FEA 体素预算，向后兼容）。模流传更高（薄件细孔需要）。
): VoxelGrid {
  const empty: VoxelGrid = {
    h: 0, nx: 0, ny: 0, nz: 0, ox: 0, oy: 0, oz: 0,
    solid: new Uint8Array(0), nVox: 0, oddColumns: 0,
  }
  const nVert = Math.floor(vertices.length / 3)
  const nTri = Math.floor(triangles.length / 3)
  if (nVert < 3 || nTri < 1) return empty

  // 包围盒
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (let v = 0; v < nVert; v++) {
    const x = vertices[v * 3], y = vertices[v * 3 + 1], z = vertices[v * 3 + 2]
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return empty
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z
  }
  const ex = maxX - minX, ey = maxY - minY, ez = maxZ - minZ
  const longest = Math.max(ex, ey, ez)
  if (!(longest > 0)) return empty

  const res = clampResolution(resolution, maxRes)
  const h = longest / res
  const nx = Math.max(1, Math.ceil(ex / h - 1e-9))
  const ny = Math.max(1, Math.ceil(ey / h - 1e-9))
  const nz = Math.max(1, Math.ceil(ez / h - 1e-9))
  const ox = minX, oy = minY, oz = minZ

  // 抖动（x、y 用唔同嘅无理系数，避免对角边退化）
  const jx = h * 1.37e-4
  const jy = h * 2.43e-4

  const colHits: Array<number[] | null> = new Array<number[] | null>(nx * ny).fill(null)
  const epsArea = 1e-12 * longest * longest

  for (let t = 0; t < nTri; t++) {
    const i0 = triangles[t * 3] * 3, i1 = triangles[t * 3 + 1] * 3, i2 = triangles[t * 3 + 2] * 3
    const x0 = vertices[i0], y0 = vertices[i0 + 1], z0 = vertices[i0 + 2]
    const x1 = vertices[i1], y1 = vertices[i1 + 1], z1 = vertices[i1 + 2]
    const x2 = vertices[i2], y2 = vertices[i2 + 1], z2 = vertices[i2 + 2]
    // xy 投影有向面积 ×2；接近 0 → 垂直/退化三角形，跳过
    const area2 = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
    if (Math.abs(area2) < epsArea) continue
    const s = area2 > 0 ? 1 : -1
    const tolE = Math.abs(area2) * 1e-10

    const txMin = Math.min(x0, x1, x2), txMax = Math.max(x0, x1, x2)
    const tyMin = Math.min(y0, y1, y2), tyMax = Math.max(y0, y1, y2)
    let iLo = Math.ceil((txMin - ox - jx) / h - 0.5); if (iLo < 0) iLo = 0
    let iHi = Math.floor((txMax - ox - jx) / h - 0.5); if (iHi > nx - 1) iHi = nx - 1
    let jLo = Math.ceil((tyMin - oy - jy) / h - 0.5); if (jLo < 0) jLo = 0
    let jHi = Math.floor((tyMax - oy - jy) / h - 0.5); if (jHi > ny - 1) jHi = ny - 1

    for (let jj = jLo; jj <= jHi; jj++) {
      const cy = oy + (jj + 0.5) * h + jy
      for (let ii = iLo; ii <= iHi; ii++) {
        const cx = ox + (ii + 0.5) * h + jx
        // 边函数（含符号 s 统一方向）；e0 对应 λ2，e1→λ0，e2→λ1
        const e0 = (x1 - x0) * (cy - y0) - (y1 - y0) * (cx - x0)
        if (s * e0 < -tolE) continue
        const e1 = (x2 - x1) * (cy - y1) - (y2 - y1) * (cx - x1)
        if (s * e1 < -tolE) continue
        const e2 = (x0 - x2) * (cy - y2) - (y0 - y2) * (cx - x2)
        if (s * e2 < -tolE) continue
        const l0 = e1 / area2, l1 = e2 / area2, l2 = e0 / area2
        const zHit = l0 * z0 + l1 * z1 + l2 * z2
        const c = jj * nx + ii
        let list = colHits[c]
        if (!list) { list = []; colHits[c] = list }
        list.push(zHit)
      }
    }
    if (onFrac && (t & 1023) === 0) onFrac(0.8 * (t / nTri))
  }

  // 奇偶填充
  const solid = new Uint8Array(nx * ny * nz)
  let nVox = 0
  let oddColumns = 0
  for (let c = 0; c < nx * ny; c++) {
    const list = colHits[c]
    if (!list) continue
    list.sort((a, b) => a - b)
    // 去重：相距 < 1e-7 视为同一命中
    let m = 0
    for (let q = 0; q < list.length; q++) {
      if (m === 0 || list[q] - list[m - 1] > 1e-7) { list[m] = list[q]; m++ }
    }
    if (m % 2 === 1) { oddColumns++; continue }
    const ii = c % nx, jj = (c / nx) | 0
    for (let q = 0; q + 1 < m; q += 2) {
      const za = list[q], zb = list[q + 1]
      let kLo = Math.ceil((za - oz) / h - 0.5); if (kLo < 0) kLo = 0
      let kHi = Math.floor((zb - oz) / h - 0.5); if (kHi > nz - 1) kHi = nz - 1
      for (let k = kLo; k <= kHi; k++) {
        const idx = ii + nx * (jj + ny * k)
        if (!solid[idx]) { solid[idx] = 1; nVox++ }
      }
    }
  }
  if (onFrac) onFrac(1)
  return { h, nx, ny, nz, ox, oy, oz, solid, nVox, oddColumns }
}

// ------------------------------------------------------------------ CUT-CELL 占空比（partial-volume occupancy）

/**
 * 计算每个实体体素嘅「占空比 occupancy」= 体素内落喺实体（水密三角网）内嘅体积分数 ∈ (0,1]。
 *
 * 方法（同 voxelize() 嘅 z 列奇偶 inside-test 一脉相承，保证一致）：
 *   - 喺整个网格上铺一套「子列」：每个体素列 (ii,jj) 细分成 sub×sub 条子列，子列中心 (sx,sy)。
 *   - 逐三角形将其 xy 投影覆盖嘅子列记低竖直射线交点 z（同 voxelize 同一套边函数 + 重心 z 插值）。
 *   - 每条子列排序+去重交点后，对体素内 sub 层 z 子采样点用「下方交点数奇偶」判定 inside。
 *   - 体素占空比 = inside 子样本数 / sub³。
 *
 * 内部体素 → frac≈1（全部子样本 inside）；边界体素 → 部分 frac，逼近真实光滑边界体积分数。
 * 仅对 solid[]=1 嘅体素计算（内部全 1 体素亦会算到 ~1，开销可接受：sub=3 → 27 点/体素）。
 * 返回 Float64Array(nVox)，顺序同 runVoxelFea 嘅单元顺序（k→j→i 升序、逐实体素）。
 *
 * 抖动用同 voxelize 嘅无理系数，避免子点精确命中三角形边/顶点。
 */
export function computeOccupancy(
  vertices: ArrayLike<number>,
  triangles: ArrayLike<number>,
  grid: VoxelGrid,
  sub: number,
  onFrac?: (frac: number) => void,
): Float64Array {
  const { h, nx, ny, nz, ox, oy, oz, solid, nVox } = grid
  const S = Math.max(2, Math.min(5, Math.round(Number.isFinite(sub) ? sub : 3)))
  // 实体素紧凑顺序 → 占空比（与单元顺序一致）
  const occ = new Float64Array(nVox)
  if (!(h > 0) || nVox < 1) return occ

  const nVert = Math.floor(vertices.length / 3)
  const nTri = Math.floor(triangles.length / 3)
  if (nVert < 3 || nTri < 1) { occ.fill(1); return occ }

  // 子列网格：每轴 nx*S / ny*S 条；子列中心步长 hs = h/S
  const hs = h / S
  const snx = nx * S, sny = ny * S
  // 抖动（用同 voxelize 嘅无理系数，子格尺度）
  const jx = hs * 1.37e-4
  const jy = hs * 2.43e-4
  const longest = Math.max(nx * h, ny * h, nz * h)
  const epsArea = 1e-12 * longest * longest

  // 每条子列嘅竖直射线交点 z 列表
  const colHits: Array<number[] | null> = new Array<number[] | null>(snx * sny).fill(null)

  for (let t = 0; t < nTri; t++) {
    const i0 = triangles[t * 3] * 3, i1 = triangles[t * 3 + 1] * 3, i2 = triangles[t * 3 + 2] * 3
    const x0 = vertices[i0], y0 = vertices[i0 + 1], z0 = vertices[i0 + 2]
    const x1 = vertices[i1], y1 = vertices[i1 + 1], z1 = vertices[i1 + 2]
    const x2 = vertices[i2], y2 = vertices[i2 + 1], z2 = vertices[i2 + 2]
    const area2 = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
    if (Math.abs(area2) < epsArea) continue
    const s = area2 > 0 ? 1 : -1
    const tolE = Math.abs(area2) * 1e-10

    const txMin = Math.min(x0, x1, x2), txMax = Math.max(x0, x1, x2)
    const tyMin = Math.min(y0, y1, y2), tyMax = Math.max(y0, y1, y2)
    let iLo = Math.ceil((txMin - ox - jx) / hs - 0.5); if (iLo < 0) iLo = 0
    let iHi = Math.floor((txMax - ox - jx) / hs - 0.5); if (iHi > snx - 1) iHi = snx - 1
    let jLo = Math.ceil((tyMin - oy - jy) / hs - 0.5); if (jLo < 0) jLo = 0
    let jHi = Math.floor((tyMax - oy - jy) / hs - 0.5); if (jHi > sny - 1) jHi = sny - 1

    for (let jj = jLo; jj <= jHi; jj++) {
      const cy = oy + (jj + 0.5) * hs + jy
      for (let ii = iLo; ii <= iHi; ii++) {
        const cx = ox + (ii + 0.5) * hs + jx
        const e0 = (x1 - x0) * (cy - y0) - (y1 - y0) * (cx - x0)
        if (s * e0 < -tolE) continue
        const e1 = (x2 - x1) * (cy - y1) - (y2 - y1) * (cx - x1)
        if (s * e1 < -tolE) continue
        const e2 = (x0 - x2) * (cy - y2) - (y0 - y2) * (cx - x2)
        if (s * e2 < -tolE) continue
        const l0 = e1 / area2, l1 = e2 / area2, l2 = e0 / area2
        const zHit = l0 * z0 + l1 * z1 + l2 * z2
        const c = jj * snx + ii
        let list = colHits[c]
        if (!list) { list = []; colHits[c] = list }
        list.push(zHit)
      }
    }
    if (onFrac && (t & 1023) === 0) onFrac(0.7 * (t / nTri))
  }

  // 排序+去重每条子列（同 voxelize 嘅 1e-7 合并规则）
  for (let c = 0; c < snx * sny; c++) {
    const list = colHits[c]
    if (!list) continue
    list.sort((a, b) => a - b)
    let m = 0
    for (let q = 0; q < list.length; q++) {
      if (m === 0 || list[q] - list[m - 1] > 1e-7) { list[m] = list[q]; m++ }
    }
    list.length = (m % 2 === 1) ? 0 : m   // 奇数命中（缝/退化）→ 视该子列全空（保守，唔判 inside）
  }

  const inv = 1 / (S * S * S)
  // 逐实体素（同单元顺序：k→j→i 升序、跳过 solid=0）算占空比
  let e = 0
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!solid[i + nx * (j + ny * k)]) continue
    let inside = 0
    for (let sk = 0; sk < S; sk++) {
      const pz = oz + k * h + (sk + 0.5) * hs
      for (let sj = 0; sj < S; sj++) {
        const cj = j * S + sj
        for (let si = 0; si < S; si++) {
          const ci = i * S + si
          const list = colHits[cj * snx + ci]
          if (!list || list.length === 0) continue
          // inside = 下方交点数为奇数（z 列射线 in/out）
          let below = 0
          for (let q = 0; q < list.length; q++) { if (list[q] <= pz) below++; else break }
          if (below & 1) inside++
        }
      }
    }
    let frac = inside * inv
    // 体素化已判该体素为实体（其中心 inside）；占空比若数值上算到 0（极薄/采样漏）→ 兜底极小正值，
    // 避免后续 clamp 之外再出现真 0（保持与「solid=1」语义一致，唔丢单元）。
    if (!(frac > 0)) frac = inv   // 至少当作 1 个子样本（≥ 1/S³）
    occ[e] = frac
    e++
    if (onFrac && (e & 8191) === 0) onFrac(0.7 + 0.3 * (e / nVox))
  }
  if (onFrac) onFrac(1)
  return occ
}

// ------------------------------------------------------------------ 单元刚度

/** 各向同性线弹性 D（6x6，行优先，工程剪应变约定）。 */
function buildD(E: number, nu: number): Float64Array {
  const lam = (E * nu) / ((1 + nu) * (1 - 2 * nu))
  const mu = E / (2 * (1 + nu))
  const D = new Float64Array(36)
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) D[i * 6 + j] = i === j ? lam + 2 * mu : lam
    D[(i + 3) * 6 + (i + 3)] = mu
  }
  return D
}

/**
 * 在自然坐标 (xi,eta,zeta) 处填 B（6x24，行优先）。
 * 均匀立方体（边长 h）→ 雅可比对角 h/2，dN/dx = (2/h)·dN/dξ。
 */
function fillB(B: Float64Array, xi: number, eta: number, zeta: number, h: number): void {
  B.fill(0)
  const c = 0.25 / h   // (2/h)·(1/8)
  for (let a = 0; a < 8; a++) {
    const sx = (a & 1) ? 1 : -1
    const sy = (a & 2) ? 1 : -1
    const sz = (a & 4) ? 1 : -1
    const dNx = c * sx * (1 + sy * eta) * (1 + sz * zeta)
    const dNy = c * sy * (1 + sx * xi) * (1 + sz * zeta)
    const dNz = c * sz * (1 + sx * xi) * (1 + sy * eta)
    const col = a * 3
    B[col] = dNx                       // 行0 εxx
    B[24 + col + 1] = dNy              // 行1 εyy
    B[48 + col + 2] = dNz              // 行2 εzz
    B[72 + col] = dNy; B[72 + col + 1] = dNx       // 行3 γxy
    B[96 + col + 1] = dNz; B[96 + col + 2] = dNy   // 行4 γyz
    B[120 + col] = dNz; B[120 + col + 2] = dNx     // 行5 γzx
  }
}

/**
 * 在自然坐标处填 G（9x24，行优先）= 位移梯度算子（几何刚度用）。
 * 行序 = [∂ux/∂x,∂ux/∂y,∂ux/∂z, ∂uy/∂x,∂uy/∂y,∂uy/∂z, ∂uz/∂x,∂uz/∂y,∂uz/∂z]；
 * 列 a*3+{0,1,2} = 节点 a 嘅 {ux,uy,uz} DOF。dN/dx 同 fillB 同款。
 */
function fillG(G: Float64Array, xi: number, eta: number, zeta: number, h: number): void {
  G.fill(0)
  const c = 0.25 / h
  for (let a = 0; a < 8; a++) {
    const sx = (a & 1) ? 1 : -1, sy = (a & 2) ? 1 : -1, sz = (a & 4) ? 1 : -1
    const dNx = c * sx * (1 + sy * eta) * (1 + sz * zeta)
    const dNy = c * sy * (1 + sx * xi) * (1 + sz * zeta)
    const dNz = c * sz * (1 + sx * xi) * (1 + sy * eta)
    const col = a * 3
    G[0 * 24 + col] = dNx; G[1 * 24 + col] = dNy; G[2 * 24 + col] = dNz           // ux 梯度
    G[3 * 24 + col + 1] = dNx; G[4 * 24 + col + 1] = dNy; G[5 * 24 + col + 1] = dNz // uy 梯度
    G[6 * 24 + col + 2] = dNx; G[7 * 24 + col + 2] = dNy; G[8 * 24 + col + 2] = dNz // uz 梯度
  }
}

/** 8 节点三线性六面体（边长 h 立方体）刚度 Ke，24x24 行优先，2x2x2 高斯积分。 */
function buildKe(E: number, nu: number, h: number): Float64Array {
  const D = buildD(E, nu)
  const Ke = new Float64Array(576)
  const B = new Float64Array(144)
  const DB = new Float64Array(144)
  const g = 1 / Math.sqrt(3)
  const gp = [-g, g]
  const w = (h / 2) * (h / 2) * (h / 2)   // detJ × 权重(1)
  for (const zeta of gp) for (const eta of gp) for (const xi of gp) {
    fillB(B, xi, eta, zeta, h)
    for (let r = 0; r < 6; r++) {
      for (let cc = 0; cc < 24; cc++) {
        let s = 0
        for (let m = 0; m < 6; m++) s += D[r * 6 + m] * B[m * 24 + cc]
        DB[r * 24 + cc] = s
      }
    }
    for (let i = 0; i < 24; i++) {
      for (let j = 0; j < 24; j++) {
        let s = 0
        for (let k = 0; k < 6; k++) s += B[k * 24 + i] * DB[k * 24 + j]
        Ke[i * 24 + j] += s * w
      }
    }
  }
  return Ke
}

// ------------------------------------------------------------------ CG 求解

interface SolveOut { u: Float64Array; iters: number; residual: number; converged: boolean; reaction?: [number, number, number] }   // S163：reaction = 固定支座反力和（仅 wantReaction 时算）

/**
 * 罚约束（penalty constraint）。用于非坐标轴对齐方向嘅 DOF 锁——典型系销/圆柱约束嘅
 * 径向方向（节点到轴线垂直方向，一般唔同 x/y/z 对齐，所以唔可以用 fixedMask 投影法）。
 * 对每个受约束节点 cId，喺其 3 个平动 DOF 上加一个秩 1 刚度：
 *   K_pen = k · (dir ⊗ dir)   （dir 系单位约束方向）
 * 物理 = 沿 dir 方向接一条极硬弹簧（k 远大于结构刚度对角）→ 该方向位移 ≈ 0，
 * 其余两正交方向自由。k 取「结构对角中位 × penaltyScale」自适应，避免病态。
 */
interface PenaltySpec {
  nodes: Int32Array        // 受约束节点 cId 列表
  dirs: Float64Array       // nodes.length*3，每节点单位约束方向
  k: number                // 罚刚度（同结构对角量级 × 大系数）
}

/**
 * matrix-free Jacobi 预条件 CG。
 * 固定 DOF 投影：f[fixed]=0，diag[fixed]=1，matvec 后清零固定项；
 * 由于 r/z/p 喺固定项恒为 0，迭代全程唔会移动固定 DOF。
 * 可选 penalty：非轴对齐方向嘅秩 1 罚约束（销/圆柱径向锁），叠加入 matvec + Jacobi 对角。
 */
function solveCG(
  nDof: number,
  elemDofs: Int32Array,
  nElem: number,
  Ke: Float64Array,
  f: Float64Array,
  fixedMask: Uint8Array,
  tol: number,
  maxIter: number,
  onFrac?: (frac: number) => void,
  penalty?: PenaltySpec,
  elemScale?: Float64Array,   // CUT-CELL：每单元刚度缩放（占空比）。undefined = 全 1（旧行为）。
  wantReaction?: boolean,     // S163：算固定支座反力（静力解先要；模态/屈曲/热内层迭代唔好开，省一次 K·u）
): SolveOut {
  const n = nDof
  const hasScale = !!elemScale && elemScale.length >= nElem
  // 组装对角（Jacobi 预条件）。cut-cell：单元对角贡献 × 占空比 scale_e。
  const diag = new Float64Array(n)
  for (let e = 0; e < nElem; e++) {
    const base = e * 24
    const sc = hasScale ? elemScale![e] : 1
    for (let d = 0; d < 24; d++) diag[elemDofs[base + d]] += sc * Ke[d * 25]
  }
  // 罚约束对角贡献：K_pen 对角 = k·dir_i²（i=x/y/z）
  if (penalty && penalty.k > 0) {
    const { nodes, dirs, k } = penalty
    for (let q2 = 0; q2 < nodes.length; q2++) {
      const cId = nodes[q2], b = q2 * 3
      const dx = dirs[b], dy = dirs[b + 1], dz = dirs[b + 2]
      diag[cId * 3] += k * dx * dx
      diag[cId * 3 + 1] += k * dy * dy
      diag[cId * 3 + 2] += k * dz * dz
    }
  }
  // S163：算反力前先快照固定 DOF 上嘅原始外载（典型 = 自重 gravity 摊到支承层节点）。下面 f[i]=0 会清掉佢哋，
  //   而真支座反力 = (K·u)_c − f_ext,c（标准约束 DOF 反力恢复式）；唔减返呢部分会少计支承层自重。
  const fFixedOrig = wantReaction ? new Float64Array(n) : null
  if (fFixedOrig) for (let i = 0; i < n; i++) if (fixedMask[i]) fFixedOrig[i] = f[i]
  for (let i = 0; i < n; i++) {
    if (fixedMask[i]) { diag[i] = 1; f[i] = 0 }
    else if (!(diag[i] > 0)) diag[i] = 1   // 防御：理论上唔会出现
  }

  const u = new Float64Array(n)
  const r = new Float64Array(n)
  const z = new Float64Array(n)
  const p = new Float64Array(n)
  const q = new Float64Array(n)
  const ue = new Float64Array(24)

  // matvec：逐单元 gather 24 DOF → Ke 乘 → scatter（内循环零分配）
  const applyK = (xv: Float64Array, out: Float64Array): void => {
    out.fill(0)
    for (let e = 0; e < nElem; e++) {
      const base = e * 24
      const sc = hasScale ? elemScale![e] : 1
      for (let d = 0; d < 24; d++) ue[d] = xv[elemDofs[base + d]]
      for (let d = 0; d < 24; d++) {
        const row = d * 24
        let s = Ke[row] * ue[0]
        for (let m = 1; m < 24; m++) s += Ke[row + m] * ue[m]
        out[elemDofs[base + d]] += sc * s   // CUT-CELL：单元刚度 × 占空比
      }
    }
    // 罚约束 matvec：out_node += k·(dir·u_node)·dir（秩 1，固定项之前加，之后统一清零）
    if (penalty && penalty.k > 0) {
      const { nodes, dirs, k } = penalty
      for (let q2 = 0; q2 < nodes.length; q2++) {
        const cId = nodes[q2], b = q2 * 3, d0 = cId * 3
        const dx = dirs[b], dy = dirs[b + 1], dz = dirs[b + 2]
        const proj = dx * xv[d0] + dy * xv[d0 + 1] + dz * xv[d0 + 2]
        const kp = k * proj
        out[d0] += kp * dx; out[d0 + 1] += kp * dy; out[d0 + 2] += kp * dz
      }
    }
    for (let i = 0; i < n; i++) if (fixedMask[i]) out[i] = 0
  }

  // |f| 极端时 Σf[i]² 会上溢（单分量 >~1.3e154 → fn2=Infinity → fnorm=Infinity →
  // rel = √rn2/fnorm 下溢为 0 ≤ tol → 早期假收敛）或下溢。先搵 max|f|，超出安全范围
  // 就用 2 的幂预缩放 f（乘 2 的幂精确无额外舍入）；线性问题 u(s·f)=s·u(f)，
  // 解出之后缩放返。
  let fMaxAbs = 0
  for (let i = 0; i < n; i++) { const a = Math.abs(f[i]); if (a > fMaxAbs) fMaxAbs = a }
  if (!(fMaxAbs > 0)) return { u, iters: 0, residual: 0, converged: true }
  let fScale = 1
  if (fMaxAbs > 1e100 || fMaxAbs < 1e-100) {
    // 指数截到 ±1023，保证 fScale 自身有限且非零
    const k = Math.max(-1023, Math.min(1023, Math.round(Math.log2(fMaxAbs))))
    fScale = 2 ** -k
    for (let i = 0; i < n; i++) f[i] *= fScale
  }
  let fn2 = 0
  for (let i = 0; i < n; i++) fn2 += f[i] * f[i]
  const fnorm = Math.sqrt(fn2)
  if (!(fnorm > 0)) return { u, iters: 0, residual: 0, converged: true }

  r.set(f)   // u0 = 0
  let rz = 0
  for (let i = 0; i < n; i++) { const zi = r[i] / diag[i]; z[i] = zi; rz += r[i] * zi }
  p.set(z)

  let iters = 0
  let rel = 1
  let converged = false
  const logTol = Math.log(tol)
  for (let it = 1; it <= maxIter; it++) {
    applyK(p, q)
    let pq = 0
    for (let i = 0; i < n; i++) pq += p[i] * q[i]
    if (!(pq > 0)) break   // 数值崩溃保护（非正定方向）
    const alpha = rz / pq
    let rn2 = 0
    for (let i = 0; i < n; i++) {
      u[i] += alpha * p[i]
      const ri = r[i] - alpha * q[i]
      r[i] = ri
      rn2 += ri * ri
    }
    iters = it
    rel = Math.sqrt(rn2) / fnorm
    if (rel <= tol) { converged = true; break }
    let rzn = 0
    for (let i = 0; i < n; i++) { const zi = r[i] / diag[i]; z[i] = zi; rzn += r[i] * zi }
    const beta = rzn / rz
    rz = rzn
    for (let i = 0; i < n; i++) p[i] = z[i] + beta * p[i]
    if (onFrac && (it & 15) === 0) {
      const fr = rel >= 1 ? 0 : Math.log(rel) / logTol
      onFrac(Math.min(0.99, Math.max(it / maxIter, fr)))
    }
  }
  if (onFrac) onFrac(1)
  // 缩放返真实解。真实 |u| 本身超出 f64 范围时呢度会上溢为 Infinity ——
  // 由调用方嘅非有限守卫负责示警，唔可以喺度静默吞掉。
  if (fScale !== 1) for (let i = 0; i < n; i++) u[i] /= fScale
  // S163：总支座反力 — 含 (a) 固定面：R_fix = (K·u)_c − f_ext,c（用真实未缩放 u + 原始 Ke，减返清掉嘅固定 DOF 外载，
  //   令自重摊到支承层都计返）；(b) 销/圆柱罚约束：R_pin = −Σ k·(dir·u)·dir（罚弹簧施于结构嘅约束力，亦系真支座力）。
  //   两者合计 → 静力平衡 −reaction ≈ 外加载荷总和。滚子/对称只锁法向 DOF → R 只含法向分量（物理正确，但≠总载荷）。
  let reaction: [number, number, number] | undefined
  if (wantReaction) {
    const Kf = new Float64Array(n)
    for (let e = 0; e < nElem; e++) {
      const base = e * 24
      const sc = hasScale ? elemScale![e] : 1
      for (let d = 0; d < 24; d++) ue[d] = u[elemDofs[base + d]]
      for (let d = 0; d < 24; d++) {
        const row = d * 24
        let s = Ke[row] * ue[0]
        for (let m = 1; m < 24; m++) s += Ke[row + m] * ue[m]
        Kf[elemDofs[base + d]] += sc * s
      }
    }
    const R: [number, number, number] = [0, 0, 0]
    for (let i = 0; i < n; i++) if (fixedMask[i]) R[i % 3] += Kf[i] - (fFixedOrig ? fFixedOrig[i] : 0)
    // 销/圆柱罚约束支承力：支座沿 dir 拉返节点 = −k·(dir·u)·dir（与 applyK 内加于 LHS 嘅 +K_pen·u 反号）
    if (penalty && penalty.k > 0) {
      const { nodes, dirs, k } = penalty
      for (let q2 = 0; q2 < nodes.length; q2++) {
        const cId = nodes[q2], b = q2 * 3, d0 = cId * 3
        const dx = dirs[b], dy = dirs[b + 1], dz = dirs[b + 2]
        const kp = k * (dx * u[d0] + dy * u[d0 + 1] + dz * u[d0 + 2])
        R[0] -= kp * dx; R[1] -= kp * dy; R[2] -= kp * dz
      }
    }
    // 非有限守卫：u 上溢（极端 E/载荷）→ R 变 Inf/NaN，唔好显示一个假数（由调用方 dispMax 守卫示警）
    if (Number.isFinite(R[0]) && Number.isFinite(R[1]) && Number.isFinite(R[2])) reaction = R
  }
  return { u, iters, residual: rel, converged, reaction }
}

// ------------------------------------------------------------------ 主入口

export function runVoxelFea(inp: FeaInput): FeaResult {
  const warnings: string[] = []
  let h = 0, nVox = 0, nDof = 0, fixedCount = 0, loadCount = 0
  const fail = (error: string): FeaResult => ({
    ok: false, error, warnings, h, nVox, nDof,
    centers: new Float32Array(0), vm: new Float32Array(0),
    vmMax: 0, vmMaxAt: [0, 0, 0], dispMax: 0, disp: new Float32Array(0),
    iters: 0, residual: 0, converged: false, fixedCount, loadCount,
  })
  try {
    // ---- 输入校验
    if (!inp || !inp.vertices || !inp.triangles) return fail('空网格（无顶点/三角形数组）')
    if (inp.vertices.length < 9 || inp.triangles.length < 3) return fail('空网格（顶点/三角形不足）')
    if (!Number.isFinite(inp.E) || !(inp.E > 0)) return fail('E 无效（需 > 0）')
    if (!Number.isFinite(inp.nu) || !(inp.nu > -0.999 && inp.nu < 0.499)) return fail('nu 无效（需 -1 < nu < 0.5）')
    const force = inp.force
    if (!force || !Number.isFinite(force[0]) || !Number.isFinite(force[1]) || !Number.isFinite(force[2])) {
      return fail('force 无效（需 3 个有限分量）')
    }
    if (!inp.fixed || !inp.fixed.point || !inp.fixed.normal) return fail('fixed 平面无效')
    if (!inp.load || !inp.load.point || !inp.load.normal) return fail('load 平面无效')

    const prog = (phase: string, frac: number): void => {
      const cb = inp.onProgress
      if (cb) { try { cb(phase, frac) } catch { /* 进度回调出错唔影响计算 */ } }
    }

    const res = clampResolution(inp.resolution)
    if (Number.isFinite(inp.resolution) && Math.round(inp.resolution) !== res) {
      warnings.push(`分辨率 ${inp.resolution} 超出 [4,64]，已用 ${res}`)
    }

    // ---- 1. 体素化
    const grid = voxelize(inp.vertices, inp.triangles, res, (fr) => prog('voxelize', fr))
    h = grid.h
    nVox = grid.nVox
    if (grid.oddColumns > 0) warnings.push(`奇异列 ${grid.oddColumns} 条（网格边/缝）`)
    if (!(h > 0)) return fail('包围盒退化（网格无体积范围）')
    if (nVox < 8) return fail(`实体体素不足（${nVox} < 8）：请提高 resolution 或检查网格水密性`)
    if (nVox > 80000) return fail(`体素过多（${nVox} > 80000）：请降低 resolution`)

    const { nx, ny, nz, ox, oy, oz, solid } = grid
    const nnx = nx + 1, nny = ny + 1, nnz = nz + 1

    // ---- 2. 节点紧凑映射（净系实体体素嘅角节点先有 DOF）
    const nodeId = new Int32Array(nnx * nny * nnz).fill(-1)
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (!solid[i + nx * (j + ny * k)]) continue
      for (let az = 0; az <= 1; az++) for (let ay = 0; ay <= 1; ay++) for (let ax = 0; ax <= 1; ax++) {
        nodeId[(i + ax) + nnx * ((j + ay) + nny * (k + az))] = 0
      }
    }
    let nNodes = 0
    for (let g = 0; g < nodeId.length; g++) if (nodeId[g] === 0) nodeId[g] = nNodes++
    nDof = nNodes * 3
    const nodeGrid = new Int32Array(nNodes)
    for (let g = 0; g < nodeId.length; g++) { const cId = nodeId[g]; if (cId >= 0) nodeGrid[cId] = g }

    // ---- 3. 边界条件（平面带）
    const bandTol = (inp.bandTol !== undefined && Number.isFinite(inp.bandTol) && inp.bandTol > 0)
      ? inp.bandTol : 0.6 * h
    const nF = normalize3(inp.fixed.normal)
    if (!nF) return fail('固定面法向量为零')
    const nL = normalize3(inp.load.normal)
    if (!nL) return fail('受力面法向量为零')
    const pF = inp.fixed.point, pL = inp.load.point

    // ---- S133：真 B-rep 面 → 节点集合（present 即取代对应 PlanePick band 测试；缺省回退）。
    //   faceFeaSelect 用同一 grid.solid + 同一遍历顺序复算紧凑 nodeId，故 nodes 同上面 nodeId 1:1 对齐
    //   （nNodesTotal === nNodes）。我哋把佢哋摊成「按紧凑 cId 索引嘅 0/1 membership 标志」喂落同一个 BC 循环，
    //   令固定/受力节点集嘅来源切换，但下游 fixedNode/loadList → fixedMask/force 数据结构完全唔变。
    let fixedFaceMask: Uint8Array | null = null
    if (inp.fixedFaceTris && inp.fixedFaceTris.length >= 9) {
      const fsel = faceFeaSelect({ faceTris: inp.fixedFaceTris, grid })
      if (fsel.ok && fsel.nodes.length > 0) {
        fixedFaceMask = new Uint8Array(nNodes)
        for (let i = 0; i < fsel.nodes.length; i++) { const c = fsel.nodes[i]; if (c >= 0 && c < nNodes) fixedFaceMask[c] = 1 }
      } else {
        warnings.push(`固定面三角解算失败（${fsel.error || '空节点'}）：已回退到固定平面 band 拣点`)
      }
    }
    let loadFaceMask: Uint8Array | null = null
    if (inp.loadFaceTris && inp.loadFaceTris.length >= 9) {
      const lsel = faceFeaSelect({ faceTris: inp.loadFaceTris, grid })
      if (lsel.ok && lsel.nodes.length > 0) {
        loadFaceMask = new Uint8Array(nNodes)
        for (let i = 0; i < lsel.nodes.length; i++) { const c = lsel.nodes[i]; if (c >= 0 && c < nNodes) loadFaceMask[c] = 1 }
      } else {
        warnings.push(`受力面三角解算失败（${lsel.error || '空节点'}）：已回退到受力平面 band 拣点`)
      }
    }

    const fixedNode = new Uint8Array(nNodes)
    const supportB = new Uint8Array(nNodes)   // 简支梁：第二支撑（B 端，轴向自由 roller）节点
    const b3 = !!(inp.beam3pt && inp.fixed2)
    const nF2 = b3 ? (normalize3(inp.fixed2!.normal) || [1, 0, 0]) : [1, 0, 0]
    const pF2 = b3 ? inp.fixed2!.point : [0, 0, 0]
    const loadList: number[] = []
    let overlap = 0
    for (let cId = 0; cId < nNodes; cId++) {
      const g = nodeGrid[cId]
      const ix = g % nnx, iy = ((g / nnx) | 0) % nny, iz = (g / (nnx * nny)) | 0
      const px = ox + ix * h, py = oy + iy * h, pz = oz + iz * h
      // 固定：有面 → 用面 membership；否则原平面 band 距离测试（字节级不变）。
      let isFixed = fixedFaceMask
        ? fixedFaceMask[cId] === 1
        : Math.abs((px - pF[0]) * nF[0] + (py - pF[1]) * nF[1] + (pz - pF[2]) * nF[2]) <= bandTol
      // 简支梁：fixed=支撑 A、fixed2=支撑 B（两者都係支撑；B 端轴向自由）。
      if (b3 && !isFixed && Math.abs((px - pF2[0]) * nF2[0] + (py - pF2[1]) * nF2[1] + (pz - pF2[2]) * nF2[2]) <= bandTol) { supportB[cId] = 1; isFixed = true }
      if (isFixed) { fixedNode[cId] = 1; fixedCount++ }
      // 受力：有面 → 用面 membership；否则原平面 band 距离测试（字节级不变）。
      const inLoad = loadFaceMask
        ? loadFaceMask[cId] === 1
        : Math.abs((px - pL[0]) * nL[0] + (py - pL[1]) * nL[1] + (pz - pL[2]) * nL[2]) <= bandTol
      if (inLoad) {
        if (isFixed) overlap++
        else loadList.push(cId)
      }
    }
    if (overlap > 0) warnings.push(`固定带与受力带重叠：已从受力节点移除 ${overlap} 个共享节点`)
    if (fixedCount < 3) return fail(`固定节点不足（${fixedCount} < 3）：fixed 平面可能未接触实体（试调 bandTol）`)
    // ★ 过度约束警告（用户实测：幼杆/曲面件撳侧弧面做固定 → 径向法向令约束带沿成条杆 → 几乎全锁 → 位移失真细到唔合理）。
    if (fixedCount > 0.4 * nNodes) warnings.push(`⚠ 固定面覆盖咗 ${(fixedCount / nNodes * 100).toFixed(0)}% 体素节点（零件几乎全锁）：位移会偏细、结果失真。悬臂/受力测试应净夹【一个端面】、受力撳【另一端面】；细杆/曲面件唔好撳侧弧面（侧面法向系径向，约束会沿成条杆走）。`)
    loadCount = loadList.length
    // ★ 退化（用户实测）：受力区完全喺固定区内（侧面点固定+受力，两带重叠）→ 无意义。唔好用下面就近兜底乱揾节点【掩盖】，明确报错引导。
    if (loadCount < 1 && overlap > 0 && !inp.bearing) {
      return fail('受力面同固定面系同一区域（受力区完全喺固定区内）：约束过度、无法分析 — 请夹【一端】、受力【另一端】（细杆/曲面件撳两端嘅平面，唔好撳侧弧面）')
    }
    // ★ 就近兜底（仅【真‧band 漏空】overlap===0）：薄件/曲面/中段点击拣唔到受力节点 → 自动补，唔好静默 fail。
    //   ① 放宽 band 到 3h 重拣（仍系一带分布载荷）；② 仍 0 → 取离受力点最近(≤6h)嘅单节点。bearing 模式唔行此路。
    if (loadCount < 1 && !inp.bearing) {
      const wide = Math.max(bandTol * 3, 3 * h)
      for (let cId = 0; cId < nNodes; cId++) {
        if (fixedNode[cId]) continue
        const g = nodeGrid[cId]; const ix = g % nnx, iy = ((g / nnx) | 0) % nny, iz = (g / (nnx * nny)) | 0
        const px = ox + ix * h, py = oy + iy * h, pz = oz + iz * h
        if (Math.abs((px - pL[0]) * nL[0] + (py - pL[1]) * nL[1] + (pz - pL[2]) * nL[2]) <= wide) loadList.push(cId)
      }
      if (loadList.length < 1) {   // 曲面/中段点击 → 取最近单节点；但【受力点须够近实体】先兜底（≤6h），
        let best = -1, bestD = Infinity              //   离实体太远 = 真‧选错面 → 照失败（唔好乱揾个节点畀错数）。
        for (let cId = 0; cId < nNodes; cId++) {
          if (fixedNode[cId]) continue
          const g = nodeGrid[cId]; const ix = g % nnx, iy = ((g / nnx) | 0) % nny, iz = (g / (nnx * nny)) | 0
          const px = ox + ix * h, py = oy + iy * h, pz = oz + iz * h
          const dx = px - pL[0], dy = py - pL[1], dz = pz - pL[2]; const d = dx * dx + dy * dy + dz * dz
          if (d < bestD) { bestD = d; best = cId }
        }
        const maxNear = 6 * h
        if (best >= 0 && bestD <= maxNear * maxNear) loadList.push(best)
      }
      loadCount = loadList.length
      if (loadCount > 0) warnings.push(`受力面拣唔到节点（薄件/曲面/中段点击）：已自动就近补 ${loadCount} 个受力节点`)
    }
    if (loadCount < 1 && !inp.bearing) return fail('受力节点为 0：load 平面可能未接触实体（试调 bandTol）')

    const f = new Float64Array(nDof)
    if (loadCount > 0) {   // S171：bearing-only 时 loadCount=0 → 跳过均布散布（免 force/0=Infinity；载荷由 4d 轴承散布）
      const fxN = force[0] / loadCount, fyN = force[1] / loadCount, fzN = force[2] / loadCount
      for (const cId of loadList) {
        f[cId * 3] += fxN; f[cId * 3 + 1] += fyN; f[cId * 3 + 2] += fzN
      }
    }
    // 重力/自重体载预备（校验 + 标志）；实际叠加喺 elemDofs 建好之后（见 §4 之后）。
    const gravity = inp.gravity
    const hasGravity = !!gravity && (gravity[0] !== 0 || gravity[1] !== 0 || gravity[2] !== 0)
    if (gravity && !(Number.isFinite(gravity[0]) && Number.isFinite(gravity[1]) && Number.isFinite(gravity[2]))) {
      return fail('gravity 无效（需 3 个有限分量 mm/s²）')
    }
    let rhoCons = 0   // tonne/mm³
    if (hasGravity) {
      const dens = inp.density
      if (!Number.isFinite(dens as number) || !((dens as number) > 0)) {
        return fail('开启 gravity 但 density 无效（需 > 0 g/cm³）：无密度算唔到自重')
      }
      rhoCons = (dens as number) * 1e-9   // g/cm³ → tonne/mm³（同 runVoxelModal 同款）
    }
    const forceZero = force[0] === 0 && force[1] === 0 && force[2] === 0
    if (forceZero && !hasGravity) warnings.push('合力为零：位移/应力全为 0')
    // S100：约束类型。fixed=全 DOF 锁；roller/sym=只锁固定面法向主轴 DOF（准面内滑；轴对齐 voxel 下 sym=roller）。
    const fixedMask = new Uint8Array(nDof)
    const fixCon = inp.fixCon || 'fixed'
    let na = 0
    if (fixCon !== 'fixed') {
      const ax = Math.abs(nF[0]), ay = Math.abs(nF[1]), az = Math.abs(nF[2])
      na = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2
      const dom = Math.max(ax, ay, az)
      if (dom < 0.94) warnings.push(`滚子/对称约束法向非轴向（主轴 ${(dom * 100).toFixed(0)}%）：已近似为只锁 ${['X', 'Y', 'Z'][na]} 轴`)
    }
    if (b3) {
      // 简支梁 / 3 点弯：真‧铰-滚（pin-roller）。★只锁支撑【接触面那一行】(载荷方向嘅极值边)嘅竖直 DOF
      //   → 容许截面绕支撑线转动（真铰）→ 弯矩峰值落喺【中间】(同悬臂喺夹持端相反，呢个正系用户要嘅物理)。
      //   若锁成个支撑截面嘅竖直 DOF = 变咗固支(clamp)，会喺支撑处生人为应力集中、同中间竞争 → 唔正确。
      //   A 端接触线额外锁轴向(beamAxis) = 防刚体漂移(pin)；B 端轴向自由 = roller。横向锁接触线 = 防侧移/yaw/roll。
      const fa = [Math.abs(force[0]), Math.abs(force[1]), Math.abs(force[2])]
      const loadAxis = fa[0] >= fa[1] && fa[0] >= fa[2] ? 0 : fa[1] >= fa[2] ? 1 : 2
      const an = [Math.abs(nF[0]), Math.abs(nF[1]), Math.abs(nF[2])]
      let beamAxis = an[0] >= an[1] && an[0] >= an[2] ? 0 : an[1] >= an[2] ? 1 : 2
      if (beamAxis === loadAxis) beamAxis = (loadAxis + 1) % 3   // 退化保护（载荷沿梁轴 = 非弯曲，少见）
      const lateralAxis = 3 - loadAxis - beamAxis
      const loadSign = force[loadAxis] < 0 ? -1 : 1   // 载荷指向：接触面喺呢个方向嘅极值边（杆压向支撑嗰边）
      const lcOf = (cId: number) => {
        const g = nodeGrid[cId]; const ix = g % nnx, iy = ((g / nnx) | 0) % nny, iz = (g / (nnx * nny)) | 0
        return loadAxis === 0 ? ox + ix * h : loadAxis === 1 ? oy + iy * h : oz + iz * h
      }
      // ① 揾 A / B 支撑各自喺载荷方向嘅极值坐标（= 接触面所在）
      let restA = -Infinity, restB = -Infinity
      for (let cId = 0; cId < nNodes; cId++) {
        if (!fixedNode[cId]) continue
        const v = loadSign * lcOf(cId)
        if (supportB[cId]) { if (v > restB) restB = v } else if (v > restA) restA = v
      }
      // ② 只锁接触面那一行（1.5h 内）；A 端再锁轴向(pin)，B 端轴向自由(roller)
      const contactTol = 1.5 * h
      let locked = 0
      for (let cId = 0; cId < nNodes; cId++) {
        if (!fixedNode[cId]) continue
        const isB = supportB[cId] === 1
        if (loadSign * lcOf(cId) < (isB ? restB : restA) - contactTol) continue   // 唔係接触面 → 留返自由（截面可绕铰转）
        fixedMask[cId * 3 + loadAxis] = 1
        fixedMask[cId * 3 + lateralAxis] = 1
        if (!isB) fixedMask[cId * 3 + beamAxis] = 1
        locked++
      }
      if (locked < 3) {   // 接触面拣唔够（极幼件/法向唔正）→ 退返锁全截面竖直，保证可解
        for (let cId = 0; cId < nNodes; cId++) {
          if (!fixedNode[cId]) continue
          fixedMask[cId * 3 + loadAxis] = 1
          fixedMask[cId * 3 + lateralAxis] = 1
          if (!supportB[cId]) fixedMask[cId * 3 + beamAxis] = 1
        }
      }
    } else {
      for (let cId = 0; cId < nNodes; cId++) {
        if (!fixedNode[cId]) continue
        if (fixCon === 'fixed') { fixedMask[cId * 3] = 1; fixedMask[cId * 3 + 1] = 1; fixedMask[cId * 3 + 2] = 1 }
        else fixedMask[cId * 3 + na] = 1
      }
    }

    // ---- 4. 单元 DOF 表 + 中心
    const elemDofs = new Int32Array(nVox * 24)
    const centers = new Float32Array(nVox * 3)
    const elemIdx = new Int32Array(nVox * 3)
    let e = 0
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (!solid[i + nx * (j + ny * k)]) continue
      const base = e * 24
      for (let a = 0; a < 8; a++) {
        const ax = a & 1, ay = (a >> 1) & 1, az = (a >> 2) & 1
        const cId = nodeId[(i + ax) + nnx * ((j + ay) + nny * (k + az))]
        elemDofs[base + a * 3] = cId * 3
        elemDofs[base + a * 3 + 1] = cId * 3 + 1
        elemDofs[base + a * 3 + 2] = cId * 3 + 2
      }
      centers[e * 3] = ox + (i + 0.5) * h
      centers[e * 3 + 1] = oy + (j + 0.5) * h
      centers[e * 3 + 2] = oz + (k + 0.5) * h
      elemIdx[e * 3] = i; elemIdx[e * 3 + 1] = j; elemIdx[e * 3 + 2] = k
      e++
    }

    // ---- 4b. 重力 / 自重体载（gravity body load，lumped）
    //   每实体素体积 V=h³，自重 = ρ·V·g（N，ρ=tonne/mm³、g=mm/s² → N）。
    //   集中（lumped）：平均分到该单元 8 个节点（每节点 1/8）。叠加到外载 F。
    //   趋势级：lumped body force 系标准低阶 hex 近似，非一致质量。
    if (hasGravity && gravity) {
      const V = h * h * h
      const fe = rhoCons * V / 8   // 每节点每单元质量贡献 (tonne)
      const fgx = fe * gravity[0], fgy = fe * gravity[1], fgz = fe * gravity[2]   // 每节点力分量 (N)
      for (let el = 0; el < nVox; el++) {
        const base = el * 24
        for (let a = 0; a < 8; a++) {
          const d0 = elemDofs[base + a * 3]
          f[d0] += fgx; f[d0 + 1] += fgy; f[d0 + 2] += fgz
        }
      }
    }

    // ---- 4c. 销 / 圆柱约束（pin / cylindrical support）：径向 DOF 罚锁
    //   落喺圆柱面 ±band 内嘅实体节点，其径向方向（到轴线垂直方向）用 penalty 锁死，
    //   轴向 + 切向自由。径向非轴对齐 → 唔可以用 fixedMask，改用秩 1 penalty（见 solveCG）。
    let penalty: PenaltySpec | undefined
    if (inp.pin) {
      const pin = inp.pin
      const aDir = normalize3(pin.axisDir)
      if (!aDir) return fail('pin 轴向量为零')
      const ap = pin.axisPoint
      if (!ap || !Number.isFinite(ap[0]) || !Number.isFinite(ap[1]) || !Number.isFinite(ap[2])) return fail('pin 轴点无效')
      if (!Number.isFinite(pin.radius) || !(pin.radius > 0)) return fail('pin 半径无效（需 > 0 mm）')
      const pinBand = (pin.bandTol !== undefined && Number.isFinite(pin.bandTol) && pin.bandTol > 0) ? pin.bandTol : bandTol
      const pinNodes: number[] = []
      const pinDirs: number[] = []
      for (let cId = 0; cId < nNodes; cId++) {
        const g = nodeGrid[cId]
        const ix = g % nnx, iy = ((g / nnx) | 0) % nny, iz = (g / (nnx * nny)) | 0
        const px = ox + ix * h, py = oy + iy * h, pz = oz + iz * h
        // 节点到轴线的垂直分量（径向向量 = 相对轴点向量 减去 轴向投影）
        const rx0 = px - ap[0], ry0 = py - ap[1], rz0 = pz - ap[2]
        const axial = rx0 * aDir[0] + ry0 * aDir[1] + rz0 * aDir[2]
        const rx = rx0 - axial * aDir[0], ry = ry0 - axial * aDir[1], rz = rz0 - axial * aDir[2]
        const rr = Math.hypot(rx, ry, rz)
        if (Math.abs(rr - pin.radius) > pinBand) continue   // 唔喺圆柱面带内
        if (!(rr > 1e-12)) continue   // 恰好喺轴线上 → 径向无定义，跳过
        const inv = 1 / rr
        pinNodes.push(cId)
        pinDirs.push(rx * inv, ry * inv, rz * inv)   // 单位径向方向
      }
      if (pinNodes.length < 1) {
        warnings.push('pin 圆柱面带内无实体节点（半径/容差/轴线可能唔啱）：销约束未生效')
      } else {
        // 自适应罚刚度：结构对角中位量级 × 1e6（足以锁径向又唔致病态）。
        // 用 buildKe 对角元素（24 个）嘅最大值做量级估计（同单元对角同阶）。
        const KeProbe = buildKe(inp.E, inp.nu, h)
        let kdMax = 0
        for (let d = 0; d < 24; d++) { const v = KeProbe[d * 25]; if (v > kdMax) kdMax = v }
        const kPen = kdMax * 1e6
        penalty = { nodes: Int32Array.from(pinNodes), dirs: Float64Array.from(pinDirs), k: kPen }
      }
    }

    // ---- 4c-2. 轴承载荷（bearing load，Fusion Bearing Load）：圆柱孔上余弦分布径向推力 → 合力散布到受推半边节点。
    //   复用 pin 嘅孔面节点搜索（径向分量），但散布【力】（入 f[]）而非罚刚度。权 w=max(0,−r̂·f̂)（销推嗰侧），两遍归一令 Σ力==合力。
    if (inp.bearing) {
      const bl = inp.bearing
      const aDir = normalize3(bl.axisDir)
      const fmag = Math.hypot(bl.force[0], bl.force[1], bl.force[2])
      if (!aDir) warnings.push('轴承载荷：轴向量为零，已跳过')
      else if (!Number.isFinite(bl.radius) || !(bl.radius > 0)) warnings.push('轴承载荷：半径无效（需 > 0），已跳过')
      else if (!(fmag > 1e-12)) warnings.push('轴承载荷：合力为零，已跳过')
      else {
        const ap = bl.axisPoint
        const lh: [number, number, number] = [bl.force[0] / fmag, bl.force[1] / fmag, bl.force[2] / fmag]
        const bBand = (bl.bandTol !== undefined && Number.isFinite(bl.bandTol) && bl.bandTol > 0) ? bl.bandTol : bandTol
        // S171 audit（MED）：载荷方向≈孔轴 → r̂⊥轴恒令 r̂·f̂=0、w=0 → 零载荷；记低俾诊断（区分「方向轴向」同「半径/轴线错」）。
        const axialDot = Math.abs(lh[0] * aDir[0] + lh[1] * aDir[1] + lh[2] * aDir[2])
        const bNodes: number[] = [], bW: number[] = []
        let wSum = 0, ovFixed = 0   // S171 audit（MED）：ovFixed = 落喺固定带嘅受推节点（全 DOF 锁 → 该力被 solveCG 清零、唔加载自由结构）
        for (let cId = 0; cId < nNodes; cId++) {
          const g = nodeGrid[cId]
          const ix = g % nnx, iy = ((g / nnx) | 0) % nny, iz = (g / (nnx * nny)) | 0
          const px = ox + ix * h, py = oy + iy * h, pz = oz + iz * h
          const rx0 = px - ap[0], ry0 = py - ap[1], rz0 = pz - ap[2]
          const axial = rx0 * aDir[0] + ry0 * aDir[1] + rz0 * aDir[2]
          const rx = rx0 - axial * aDir[0], ry = ry0 - axial * aDir[1], rz = rz0 - axial * aDir[2]
          const rr = Math.hypot(rx, ry, rz)
          if (Math.abs(rr - bl.radius) > bBand) continue   // 唔喺孔面带内
          if (!(rr > 1e-12)) continue                       // 轴线上 → 径向无定义
          const inv = 1 / rr
          const w = Math.max(0, -((rx * inv) * lh[0] + (ry * inv) * lh[1] + (rz * inv) * lh[2]))   // 受推半边余弦权
          if (w <= 0) continue
          // S171 audit（MED）：全固定带内节点 → 全 DOF 锁，散布俾佢嘅力会被 solveCG 清零（结构实际欠载、位移/应力偏低、但 reaction 仍 == 合力故平衡检查捉唔到）。
          //   fixCon==='fixed' 跳过佢（合力只归一到真正可加载节点，全力到达柔性结构，同均布载荷嘅重叠处理一致）；滚子/对称只锁法向 → 计入但示警。
          if (fixCon === 'fixed' && fixedNode[cId]) { ovFixed++; continue }
          bNodes.push(cId); bW.push(w); wSum += w
        }
        if (!bNodes.length || !(wSum > 1e-12)) {
          warnings.push(axialDot > 0.99
            ? '轴承载荷：载荷方向≈孔轴向，轴承推力须【垂直】孔轴 → 用「自定义」指定径向方向（未生效）'
            : '轴承载荷：孔面带内无受推节点（半径/容差/轴线唔啱？）：未生效')
        } else {
          if (ovFixed > 0) warnings.push(`轴承孔面与固定带重叠：${ovFixed} 个受推节点已固定（跳过；合力归一到余下节点）— 若孔本身被夹紧，结果可能偏保守`)
          for (let k = 0; k < bNodes.length; k++) {
            const cId = bNodes[k], wk = bW[k] / wSum
            f[cId * 3] += bl.force[0] * wk; f[cId * 3 + 1] += bl.force[1] * wk; f[cId * 3 + 2] += bl.force[2] * wk
          }
        }
      }
    }

    // ---- 4d. CUT-CELL：边界体素部分体积刚度缩放（占空比 occupancy）
    //   缺省开启（cutCell !== false）：边界单元 Ke 按其实体体积分数缩放，减低阶梯刚度高估，
    //   令位移/应力更贴近真实光滑边界。clamp 小分数 fracMin 防奇异 K（空悬单元）。
    //   solid=1 内部体素 occ≈1 → 不变；故对轴对齐方块结果几乎无影响（向后兼容）。
    let elemScale: Float64Array | undefined
    const cutCellOn = inp.cutCell !== false   // undefined/true = 开
    if (cutCellOn) {
      const sub = (inp.cutCellSub !== undefined && Number.isFinite(inp.cutCellSub)) ? inp.cutCellSub : 3
      const occ = computeOccupancy(inp.vertices, inp.triangles, grid, sub, (fr) => prog('voxelize', 0.8 + 0.2 * fr))
      const fracMin = 1e-3   // clamp 防奇异（空悬/极薄单元仍保留 0.1% 刚度，维持 K 正定）
      let nBoundary = 0
      for (let el = 0; el < nVox; el++) {
        let fr = occ[el]
        if (!(fr > 0) || !Number.isFinite(fr)) fr = fracMin
        else if (fr < fracMin) fr = fracMin
        else if (fr > 1) fr = 1
        if (fr < 0.999) nBoundary++
        occ[el] = fr
      }
      elemScale = occ
      if (nBoundary === 0) warnings.push('cut-cell：无部分体积边界单元（轴对齐方块？）— 结果同二值一致')
    }

    // ---- 5. 求解
    const Ke = buildKe(inp.E, inp.nu, h)
    const tol = (inp.cgTol !== undefined && Number.isFinite(inp.cgTol) && inp.cgTol > 0) ? inp.cgTol : 1e-6
    const maxIter = (inp.maxIter !== undefined && Number.isFinite(inp.maxIter) && inp.maxIter > 0)
      ? Math.floor(inp.maxIter) : 4000
    prog('solve', 0)
    const sol = solveCG(nDof, elemDofs, nVox, Ke, f, fixedMask, tol, maxIter, (fr) => prog('solve', fr), penalty, elemScale, true)   // S163：静力解要固定支座反力
    if (!sol.converged) warnings.push(`CG 未收敛：${sol.iters} 次后相对残差 ${sol.residual.toExponential(2)}`)

    // ---- 6. 应力（单元中心）
    prog('stress', 0)
    const D = buildD(inp.E, inp.nu)
    const Bc = new Float64Array(144)
    fillB(Bc, 0, 0, 0, h)
    const vm = new Float32Array(nVox)
    const disp = new Float32Array(nVox)   // S96：体素中心位移幅值（8 节点 u 平均）
    const dispVec = new Float32Array(nVox * 3)   // S168：体素中心有符号位移向量 [ux,uy,uz]（变形形态/动画）
    const s1f = new Float32Array(nVox)    // S164：最大主应力 σ1（拉为正）
    const s3f = new Float32Array(nVox)    // S164：最小主应力 σ3（压为负）
    const shf = new Float32Array(nVox)    // S164：最大剪应力 τmax=(σ1−σ3)/2（Tresca）
    const sed = new Float32Array(nVox)    // S167：应变能密度 u=½σ:ε（mJ/mm³=kPa；能量集中位 = 受力关键区/拓扑优化直觉）
    const ue = new Float64Array(24)
    const strain = new Float64Array(6)
    const stress = new Float64Array(6)
    let vmMax = 0
    let vmMaxE = 0
    let vmNonFinite = false
    let s1Max = -Infinity, s3Min = Infinity, shearMax = 0   // S164：σ1 最拉、σ3 最压、τmax 峰值
    let sedMax = 0   // S167：应变能密度峰值
    for (let el = 0; el < nVox; el++) {
      const base = el * 24
      for (let d = 0; d < 24; d++) ue[d] = sol.u[elemDofs[base + d]]
      // S96：体素中心位移 = 8 节点 (ux,uy,uz) 平均 → 幅值（同 runVoxelModal 振型平均同款）
      { let dux = 0, duy = 0, duz = 0; for (let a = 0; a < 8; a++) { dux += ue[a * 3]; duy += ue[a * 3 + 1]; duz += ue[a * 3 + 2] } const ax = dux / 8, ay = duy / 8, az = duz / 8; disp[el] = Math.hypot(ax, ay, az); dispVec[el * 3] = ax; dispVec[el * 3 + 1] = ay; dispVec[el * 3 + 2] = az }
      for (let r2 = 0; r2 < 6; r2++) {
        let s = 0
        const row = r2 * 24
        for (let m = 0; m < 24; m++) s += Bc[row + m] * ue[m]
        strain[r2] = s
      }
      for (let r2 = 0; r2 < 6; r2++) {
        let s = 0
        const row = r2 * 6
        for (let m = 0; m < 6; m++) s += D[row + m] * strain[m]
        stress[r2] = s
      }
      const v = vonMises(stress[0], stress[1], stress[2], stress[3], stress[4], stress[5])
      vm[el] = v
      // S164：主应力（σ1≥σ2≥σ3）+ 最大剪应力 τmax=(σ1−σ3)/2
      const pr = princ3(stress[0], stress[1], stress[2], stress[3], stress[4], stress[5])
      const sh = (pr[0] - pr[2]) / 2
      s1f[el] = pr[0]; s3f[el] = pr[2]; shf[el] = sh
      if (Number.isFinite(pr[0]) && Number.isFinite(pr[2])) {
        if (pr[0] > s1Max) s1Max = pr[0]
        if (pr[2] < s3Min) s3Min = pr[2]
        if (sh > shearMax) shearMax = sh
      }
      // S167：应变能密度 u=½ σ:ε（Voigt 工程剪应变 → ½ Σ σ_i·ε_i）。能量集中位 = 受力关键区。
      let u = 0; for (let i = 0; i < 6; i++) u += stress[i] * strain[i]; u *= 0.5
      sed[el] = u
      if (Number.isFinite(u) && u > sedMax) sedMax = u
      // NaN/Infinity 显式追踪：`v > vmMax` 对 NaN 恒为 false，净靠佢会静默留 0
      if (!Number.isFinite(v)) vmNonFinite = true
      else if (v > vmMax) { vmMax = v; vmMaxE = el }
      if ((el & 4095) === 0) prog('stress', el / nVox)
    }
    prog('stress', 1)
    // 诚实守卫①：应力本身非有限（f64 已溢出/NaN）→ vmMax 故意设 NaN，唔可以静默归零
    if (vmNonFinite) {
      vmMax = NaN
      warnings.push('应力非有限（NaN/Infinity）：E/载荷数值极端，结果不可信')
    } else if (!Number.isFinite(Math.fround(vmMax))) {
      // 诚实守卫②：vm 数组系 Float32，元素 >~3.40e38 写入后变 Infinity。
      // vmMax（f64 全体上界）+ fround 单调 → 检查一次即覆盖所有元素。
      warnings.push(`应力超出 Float32 上限（vmMax=${vmMax.toExponential(3)} MPa）：vm 数组含 Infinity，云图/数值不可信`)
    }
    // S167 诚实守卫：sed 同 vm 一样系 Float32（u≈½σ²/E 可独立溢出）。应力非有限→sedMax 设 NaN；
    // f64 有限但 fround 溢出（>3.4e38）→ sed 数组含 Infinity，示警（对齐 vm 守卫，免 legend 显假数）。
    if (vmNonFinite) sedMax = NaN
    else if (!Number.isFinite(Math.fround(sedMax))) warnings.push(`应变能密度超出 Float32 上限（${sedMax.toExponential(3)} mJ/mm³）：sed 数组含 Infinity，云图/数值不可信`)

    // Math.hypot：平方和喺 |u|>~1.3e154 会上溢（Infinity）、|u|<~1e-162 会下溢（0），
    // hypot 内部缩放避免两者（仅 nNodes 次调用，成本可忽略）。
    // NaN/Infinity 显式追踪：`d > dispMax` 对 NaN 恒为 false，旧写法 NaN 位移会静默报 0
    let dispMax = 0
    let dispNonFinite = false
    for (let cId = 0; cId < nNodes; cId++) {
      const d = Math.hypot(sol.u[cId * 3], sol.u[cId * 3 + 1], sol.u[cId * 3 + 2])
      if (!Number.isFinite(d)) dispNonFinite = true
      else if (d > dispMax) dispMax = d
    }
    // 防御：真实 |u| 本身非有限（E/力极端到解超出 f64）→ dispMax 故意设 NaN，唔可以静默返回
    if (dispNonFinite) {
      dispMax = NaN
      warnings.push('位移非有限（NaN/Infinity）：E/载荷数值极端，结果不可信')
    }
    const vmMaxAt: [number, number, number] = [
      ox + (elemIdx[vmMaxE * 3] + 0.5) * h,
      oy + (elemIdx[vmMaxE * 3 + 1] + 0.5) * h,
      oz + (elemIdx[vmMaxE * 3 + 2] + 0.5) * h,
    ]

    const reaction = sol.reaction
    const reactionMag = reaction ? Math.hypot(reaction[0], reaction[1], reaction[2]) : undefined
    return {
      ok: true, warnings, h, nVox, nDof, centers, vm, vmMax, vmMaxAt, vmMaxE, dispMax, disp, dispVec,
      iters: sol.iters, residual: sol.residual, converged: sol.converged,
      fixedCount, loadCount, reaction, reactionMag,
      s1: s1f, s3: s3f, shear: shf, tresca: shf,   // S189：tresca 别名同指 shf（Comlink structured-clone 各得一份 Float32Array 拷贝，兼容）
      s1Max: Number.isFinite(s1Max) ? s1Max : undefined,
      s3Min: Number.isFinite(s3Min) ? s3Min : undefined,
      shearMax,
      sed, sedMax,
    }
  } catch (err) {
    return fail(`内部错误：${err instanceof Error ? err.message : String(err)}`)
  }
}

// =====================================================================================
// 节点应力平滑（nodal-averaging smoothing）—— 去阶梯失真，对标商用 FEA 嘅节点应力云图。
//
// ⚠ 诚实命名：呢个系「节点平均（nodal averaging / global stress averaging）」，
//   **唔系**真正嘅 SPR（superconvergent patch recovery，Zienkiewicz-Zhu 最小二乘补丁拟合）。
//   做法：单元中心 vm → 平均到角节点（体积加权；等体素 voxel → 等权）→ 再插值返单元中心
//   （三线性，单元中心 = 8 角节点平均）。效果 = 去棋盘/阶梯跳变，令云图连续。
//
// 流程：
//   1. 由 centers + h 还原每单元嘅整数网格索引 (i,j,k)（规则网格，无歧义）。
//   2. 每单元 8 个角节点（共享节点用 (i..i+1, j..j+1, k..k+1) 角点哈希去重）。
//   3. 节点 vm = 相邻单元 vm 嘅体积加权平均（等体素 → 算术平均）。距离加权可选
//      （角到中心距离对立方体 8 角全相等 → 退化成等权，故等体素下体积权=距离权=等权）。
//   4. 单元中心平滑 vm = 8 角节点 vm 平均（三线性形函数喺中心 = 1/8 each）。
//
// 守恒：体积积分 Σ vm_e·V 喺平滑前后守到合理误差（节点平均系线性算子，均匀场严格不变；
//   非均匀场边界单元因邻居少会有细微偏差，故系「合理误差」而非严格守恒）。
// 趋势级·非商用精度（同本文件其余功能一致）。
//
// 输入用 FeaResult（或任何带 centers/vm/h/nVox 嘅对象）；唔修改入参，返回新数组。
// =====================================================================================

export interface SmoothInput {
  centers: ArrayLike<number>   // nVox*3 单元中心（CAD mm）
  vm: ArrayLike<number>        // nVox 单元中心 von Mises（MPa）
  h: number                    // 体素边长 mm
  nVox: number
}

export interface SmoothResult {
  ok: boolean; error?: string
  vmSmooth: Float32Array       // nVox 平滑后单元中心 vm（MPa）
  nodeVm: Float32Array         // nNodes 节点 vm 场（MPa）
  nNodes: number
  spanBefore: number           // 平滑前 max-min（跨度）
  spanAfter: number            // 平滑后 max-min（应 ≤ spanBefore）
  integralBefore: number       // Σ vm_e·V（平滑前，守恒检查用）
  integralAfter: number        // Σ vmSmooth_e·V（平滑后）
  method: 'nodal-averaging'    // 诚实标注：节点平均，非真 SPR
}

/**
 * 节点平均应力平滑。诚实命名 = nodal-averaging（非 SPR）。
 * 纯函数，唔 throw：退化/空输入返 { ok:false, error }（跟 fail() 模式）。
 */
export function smoothVmNodal(inp: SmoothInput): SmoothResult {
  const fail = (error: string): SmoothResult => ({
    ok: false, error,
    vmSmooth: new Float32Array(0), nodeVm: new Float32Array(0), nNodes: 0,
    spanBefore: 0, spanAfter: 0, integralBefore: 0, integralAfter: 0,
    method: 'nodal-averaging',
  })
  try {
    if (!inp || !inp.centers || !inp.vm) return fail('空输入（缺 centers/vm）')
    const nVox = inp.nVox | 0
    if (!(nVox > 0)) return fail('nVox ≤ 0')
    if (inp.centers.length < nVox * 3 || inp.vm.length < nVox) return fail('centers/vm 长度同 nVox 唔一致')
    const h = inp.h
    if (!Number.isFinite(h) || !(h > 0)) return fail('h 无效（需 > 0）')

    // 1. 由 centers 还原网格原点（最小角）+ 每单元整数索引
    let minX = Infinity, minY = Infinity, minZ = Infinity
    for (let el = 0; el < nVox; el++) {
      const cx = inp.centers[el * 3], cy = inp.centers[el * 3 + 1], cz = inp.centers[el * 3 + 2]
      if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(cz)) return fail('centers 含非有限值')
      if (cx < minX) minX = cx; if (cy < minY) minY = cy; if (cz < minZ) minZ = cz
    }
    // 网格原点 = 最小中心 − 0.5h（中心 = 原点 + (idx+0.5)h）
    const ox = minX - 0.5 * h, oy = minY - 0.5 * h, oz = minZ - 0.5 * h
    const eI = new Int32Array(nVox), eJ = new Int32Array(nVox), eK = new Int32Array(nVox)
    let mi = 0, mj = 0, mk = 0
    for (let el = 0; el < nVox; el++) {
      const i = Math.round((inp.centers[el * 3] - ox) / h - 0.5)
      const j = Math.round((inp.centers[el * 3 + 1] - oy) / h - 0.5)
      const k = Math.round((inp.centers[el * 3 + 2] - oz) / h - 0.5)
      if (i < 0 || j < 0 || k < 0) return fail('网格索引还原失败（centers 唔系规则体素网格？）')
      eI[el] = i; eJ[el] = j; eK[el] = k
      if (i > mi) mi = i; if (j > mj) mj = j; if (k > mk) mk = k
    }
    const nnx = mi + 2, nny = mj + 2, nnz = mk + 2   // 角节点网格维度（单元数+1，+1 余量防越界）

    // 2. 节点编号（紧凑）：角点哈希 (i+ax) + nnx*((j+ay) + nny*(k+az))
    const nodeId = new Int32Array(nnx * nny * nnz).fill(-1)
    for (let el = 0; el < nVox; el++) {
      const i = eI[el], j = eJ[el], k = eK[el]
      for (let a = 0; a < 8; a++) {
        const ax = a & 1, ay = (a >> 1) & 1, az = (a >> 2) & 1
        nodeId[(i + ax) + nnx * ((j + ay) + nny * (k + az))] = 0
      }
    }
    let nNodes = 0
    for (let g = 0; g < nodeId.length; g++) if (nodeId[g] === 0) nodeId[g] = nNodes++
    if (nNodes < 1) return fail('无角节点（网格退化）')

    // 3. 节点 vm = 相邻单元 vm 体积加权平均（等体素 → 等权算术平均）
    const nodeSum = new Float64Array(nNodes)
    const nodeW = new Float64Array(nNodes)
    const Vox = h * h * h   // 每单元体积（等体素 → 权重相同）
    let vmHasNonFinite = false
    for (let el = 0; el < nVox; el++) {
      const v = inp.vm[el]
      if (!Number.isFinite(v)) { vmHasNonFinite = true; continue }   // 非有限单元唔参与平均（守卫）
      const i = eI[el], j = eJ[el], k = eK[el]
      for (let a = 0; a < 8; a++) {
        const ax = a & 1, ay = (a >> 1) & 1, az = (a >> 2) & 1
        const nid = nodeId[(i + ax) + nnx * ((j + ay) + nny * (k + az))]
        nodeSum[nid] += Vox * v   // 体积权
        nodeW[nid] += Vox
      }
    }
    const nodeVm = new Float32Array(nNodes)
    for (let nid = 0; nid < nNodes; nid++) {
      nodeVm[nid] = nodeW[nid] > 0 ? nodeSum[nid] / nodeW[nid] : 0
    }

    // 4. 单元中心平滑 vm = 8 角节点平均（三线性形函数喺中心 = 1/8 each）
    const vmSmooth = new Float32Array(nVox)
    for (let el = 0; el < nVox; el++) {
      const i = eI[el], j = eJ[el], k = eK[el]
      let s = 0
      for (let a = 0; a < 8; a++) {
        const ax = a & 1, ay = (a >> 1) & 1, az = (a >> 2) & 1
        s += nodeVm[nodeId[(i + ax) + nnx * ((j + ay) + nny * (k + az))]]
      }
      const sv = s / 8
      // 非有限源单元保留原值（唔被邻居污染成 0），其余用平滑值
      vmSmooth[el] = Number.isFinite(inp.vm[el]) ? sv : inp.vm[el]
    }

    // 5. 统计：跨度 + 体积积分（守恒检查）
    let minB = Infinity, maxB = -Infinity, minA = Infinity, maxA = -Infinity
    let intB = 0, intA = 0
    for (let el = 0; el < nVox; el++) {
      const vb = inp.vm[el], va = vmSmooth[el]
      if (Number.isFinite(vb)) { if (vb < minB) minB = vb; if (vb > maxB) maxB = vb; intB += vb * Vox }
      if (Number.isFinite(va)) { if (va < minA) minA = va; if (va > maxA) maxA = va; intA += va * Vox }
    }
    const spanBefore = (maxB >= minB) ? maxB - minB : 0
    const spanAfter = (maxA >= minA) ? maxA - minA : 0

    return {
      ok: true, vmSmooth, nodeVm, nNodes,
      spanBefore, spanAfter, integralBefore: intB, integralAfter: intA,
      method: 'nodal-averaging',
      ...(vmHasNonFinite ? { error: '部分单元 vm 非有限：已跳过唔参与平均（保留原值）' } : {}),
    }
  } catch (err) {
    return fail(`内部错误：${err instanceof Error ? err.message : String(err)}`)
  }
}

// =====================================================================================
// 模态分析（固有频率 / 振型）— 约束模态（constrained modal）
//
// 复用同一套体素化 + buildKe + solveCG。新增集中（lumped）质量矩阵 M（对角），
// 解广义特征值问题 K φ = ω² M φ 嘅最低 N 阶，用「逆幂迭代 + M-正交去缩」：
//   每阶：解 K x = M φ_k（内层用 solveCG，matrix-free），对已收敛低阶 M-正交去缩，
//   M-范数归一 φ_{k+1}=x/√(xᵀMx)，瑞利商特征值 λ=(xᵀMφ_k)/(xᵀMx)（由 Kx=Mφ_k 化简，
//   唔使额外乘一次 K），收敛判 |Δλ|≤tol·|λ|。λ=ω²(rad/s)²，f=√λ/(2π) Hz。
//
// 单位一致性（N-mm-MPa-s 制 → 频率得 Hz）：
//   质量单位 = N·s²/mm = 1 tonne。密度表用 g/cm³（钢 7.85）→ tonne/mm³ 要 ×1e-9
//   （1 g/cm³ = 1000 kg/m³ = 1e-9 tonne/mm³）。校验：100×10×10 钢悬臂 f1≈815 Hz。
//
// 约束模态：要有足够固定面（约束刚体运动），否则低阶频率失真（接近 0）。
// =====================================================================================

export interface ModalInput {
  vertices: ArrayLike<number>
  triangles: ArrayLike<number>
  fixed: PlanePick                 // 夹持面：带内实体节点全部 DOF 固定（约束模态）
  E: number                        // 杨氏模量 MPa (N/mm²)
  nu: number                       // 泊松比
  rho: number                      // 密度 g/cm³（= 1e-9 tonne/mm³；钢 7.85）
  resolution: number               // 最长包围盒轴方向目标体素数（截到 [4,64]）
  nModes?: number                  // 求最低几阶，默认 6（截到 [1,12]）
  bandTol?: number                 // 固定平面带半厚度，默认 0.6*h
  cgTol?: number                   // 内层 CG 相对残差，默认 1e-6
  maxIter?: number                 // 内层 CG 迭代上限，默认 3000
  modalIter?: number               // 外层逆幂迭代上限（每阶），默认 60
  modalTol?: number                // 特征值相对收敛阈，默认 1e-4
  onProgress?: (phase: string, frac: number) => void
}

export interface ModalResult {
  ok: boolean; error?: string; warnings: string[]
  h: number; nVox: number; nDof: number
  centers: Float32Array            // nVox*3 实体体素中心，CAD 坐标
  freqs: number[]                  // Hz，升序
  shapes: Float32Array[]           // 每阶 nVox*3 体素中心位移向量（CAD，已归一 max|d|=1）
  amps: Float32Array[]             // 每阶 nVox 位移幅值 0..1（着色用）
  modeIters: number[]              // 每阶外层逆幂迭代次数
  modeConverged: boolean[]
  fixedCount: number
}

export function runVoxelModal(inp: ModalInput): ModalResult {
  const warnings: string[] = []
  let h = 0, nVox = 0, nDof = 0, fixedCount = 0
  const fail = (error: string): ModalResult => ({
    ok: false, error, warnings, h, nVox, nDof,
    centers: new Float32Array(0), freqs: [], shapes: [], amps: [],
    modeIters: [], modeConverged: [], fixedCount,
  })
  try {
    if (!inp || !inp.vertices || !inp.triangles) return fail('空网格（无顶点/三角形数组）')
    if (inp.vertices.length < 9 || inp.triangles.length < 3) return fail('空网格（顶点/三角形不足）')
    if (!Number.isFinite(inp.E) || !(inp.E > 0)) return fail('E 无效（需 > 0）')
    if (!Number.isFinite(inp.nu) || !(inp.nu > -0.999 && inp.nu < 0.499)) return fail('nu 无效（需 -1 < nu < 0.5）')
    if (!Number.isFinite(inp.rho) || !(inp.rho > 0)) return fail('密度 rho 无效（需 > 0，g/cm³）')
    if (!inp.fixed || !inp.fixed.point || !inp.fixed.normal) return fail('fixed 平面无效')

    const prog = (phase: string, frac: number): void => {
      const cb = inp.onProgress
      if (cb) { try { cb(phase, frac) } catch { /* 进度回调出错唔影响计算 */ } }
    }

    const res = clampResolution(inp.resolution)
    const nModes = Math.min(12, Math.max(1, Math.round(Number.isFinite(inp.nModes as number) ? (inp.nModes as number) : 6)))

    // ---- 1. 体素化（同 runVoxelFea）
    const grid = voxelize(inp.vertices, inp.triangles, res, (fr) => prog('voxelize', fr))
    h = grid.h
    nVox = grid.nVox
    if (grid.oddColumns > 0) warnings.push(`奇异列 ${grid.oddColumns} 条（网格边/缝）`)
    if (!(h > 0)) return fail('包围盒退化（网格无体积范围）')
    if (nVox < 8) return fail(`实体体素不足（${nVox} < 8）：请提高 resolution 或检查网格水密性`)
    if (nVox > 60000) return fail(`体素过多（${nVox} > 60000）：模态求解请降低 resolution`)

    const { nx, ny, nz, ox, oy, oz, solid } = grid
    const nnx = nx + 1, nny = ny + 1, nnz = nz + 1
    // P5 可信度：最短轴体素跨度 < 4 时低阶 hex 无法表达弯曲曲率 → 固有频率误差非单调可达 30%+（P5 报告 §2.2）。纯诚实警告，不改结果。
    { const _across = Math.min(nx, ny, nz); if (_across < 4) warnings.push(`截面仅 ${_across} 体素跨度（最短轴）：细长/薄壁件模态频率欠解析、误差可能非单调偏大 — 建议提高 resolution 令最短截面跨 ≥4 体素`) }

    // ---- 2. 节点紧凑映射（同 runVoxelFea）
    const nodeId = new Int32Array(nnx * nny * nnz).fill(-1)
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (!solid[i + nx * (j + ny * k)]) continue
      for (let az = 0; az <= 1; az++) for (let ay = 0; ay <= 1; ay++) for (let ax = 0; ax <= 1; ax++) {
        nodeId[(i + ax) + nnx * ((j + ay) + nny * (k + az))] = 0
      }
    }
    let nNodes = 0
    for (let g = 0; g < nodeId.length; g++) if (nodeId[g] === 0) nodeId[g] = nNodes++
    nDof = nNodes * 3
    const nodeGrid = new Int32Array(nNodes)
    for (let g = 0; g < nodeId.length; g++) { const cId = nodeId[g]; if (cId >= 0) nodeGrid[cId] = g }

    // ---- 3. 固定带（约束模态边界）
    const bandTol = (inp.bandTol !== undefined && Number.isFinite(inp.bandTol) && inp.bandTol > 0) ? inp.bandTol : 0.6 * h
    const nF = normalize3(inp.fixed.normal)
    if (!nF) return fail('固定面法向量为零')
    const pF = inp.fixed.point
    const fixedNode = new Uint8Array(nNodes)
    for (let cId = 0; cId < nNodes; cId++) {
      const g = nodeGrid[cId]
      const ix = g % nnx, iy = ((g / nnx) | 0) % nny, iz = (g / (nnx * nny)) | 0
      const px = ox + ix * h, py = oy + iy * h, pz = oz + iz * h
      const dF = Math.abs((px - pF[0]) * nF[0] + (py - pF[1]) * nF[1] + (pz - pF[2]) * nF[2])
      if (dF <= bandTol) { fixedNode[cId] = 1; fixedCount++ }
    }
    if (fixedCount < 3) return fail(`固定节点不足（${fixedCount} < 3）：fixed 平面可能未接触实体（试调 bandTol）`)
    const fixedMask = new Uint8Array(nDof)
    for (let cId = 0; cId < nNodes; cId++) {
      if (fixedNode[cId]) { fixedMask[cId * 3] = 1; fixedMask[cId * 3 + 1] = 1; fixedMask[cId * 3 + 2] = 1 }
    }

    // ---- 4. 单元 DOF 表 + 中心（同 runVoxelFea）
    const elemDofs = new Int32Array(nVox * 24)
    const centers = new Float32Array(nVox * 3)
    let e = 0
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (!solid[i + nx * (j + ny * k)]) continue
      const base = e * 24
      for (let a = 0; a < 8; a++) {
        const ax = a & 1, ay = (a >> 1) & 1, az = (a >> 2) & 1
        const cId = nodeId[(i + ax) + nnx * ((j + ay) + nny * (k + az))]
        elemDofs[base + a * 3] = cId * 3
        elemDofs[base + a * 3 + 1] = cId * 3 + 1
        elemDofs[base + a * 3 + 2] = cId * 3 + 2
      }
      centers[e * 3] = ox + (i + 0.5) * h
      centers[e * 3 + 1] = oy + (j + 0.5) * h
      centers[e * 3 + 2] = oz + (k + 0.5) * h
      e++
    }

    // ---- 5. 集中质量矩阵 M（对角，tonne）。每体素 ρ·h³ 平均分摊 8 节点 × 3 DOF。
    const rhoCons = inp.rho * 1e-9          // g/cm³ → tonne/mm³
    const me = rhoCons * h * h * h / 8       // 每节点每体素质量贡献 (tonne)
    const M = new Float64Array(nDof)
    for (let el = 0; el < nVox; el++) {
      const base = el * 24
      for (let a = 0; a < 8; a++) {
        const d0 = elemDofs[base + a * 3]
        M[d0] += me; M[d0 + 1] += me; M[d0 + 2] += me
      }
    }
    for (let i = 0; i < nDof; i++) if (fixedMask[i]) M[i] = 0   // 固定 DOF 移出广义问题

    // ---- 6. 逆幂迭代 + M-正交去缩
    const Ke = buildKe(inp.E, inp.nu, h)
    const cgTol = (inp.cgTol !== undefined && Number.isFinite(inp.cgTol) && inp.cgTol > 0) ? inp.cgTol : 1e-6
    const cgMax = (inp.maxIter !== undefined && Number.isFinite(inp.maxIter) && inp.maxIter > 0) ? Math.floor(inp.maxIter) : 3000
    const modalIter = (inp.modalIter !== undefined && Number.isFinite(inp.modalIter) && inp.modalIter > 0) ? Math.floor(inp.modalIter) : 100
    const modalTol = (inp.modalTol !== undefined && Number.isFinite(inp.modalTol) && inp.modalTol > 0) ? inp.modalTol : 1e-4

    // v ← v − Σ_j (φ_jᵀ M v) φ_j   （φ_j 已 M-归一）
    const deflate = (v: Float64Array, modes: Float64Array[]): void => {
      for (const phj of modes) {
        let c = 0
        for (let i = 0; i < nDof; i++) c += M[i] * phj[i] * v[i]
        if (c !== 0) for (let i = 0; i < nDof; i++) v[i] -= c * phj[i]
      }
    }
    const mNorm2 = (v: Float64Array): number => { let s = 0; for (let i = 0; i < nDof; i++) s += M[i] * v[i] * v[i]; return s }

    const modeVecs: Float64Array[] = []
    const freqs: number[] = []
    const modeIters: number[] = []
    const modeConverged: boolean[] = []
    const b = new Float64Array(nDof)

    for (let m = 0; m < nModes; m++) {
      // 确定性伪随机起始向量（避开 Math.random — resume 安全）；固定 DOF 置 0
      const phi = new Float64Array(nDof)
      for (let i = 0; i < nDof; i++) {
        if (fixedMask[i]) continue
        phi[i] = (((i * 2654435761) >>> 0) / 4294967296) - 0.5 + ((m + 1) * 0.013)
      }
      deflate(phi, modeVecs)
      let s0 = mNorm2(phi)
      if (!(s0 > 0)) { phi[(m % Math.max(1, nDof))] = 1; deflate(phi, modeVecs); s0 = mNorm2(phi) }
      if (s0 > 0) { const inv = 1 / Math.sqrt(s0); for (let i = 0; i < nDof; i++) phi[i] *= inv }

      let lambda = 0, prev = 0, conv = false, used = 0
      for (let it = 1; it <= modalIter; it++) {
        for (let i = 0; i < nDof; i++) b[i] = M[i] * phi[i]   // RHS = M φ（固定项 M=0 → 0）
        const sol = solveCG(nDof, elemDofs, nVox, Ke, b, fixedMask, cgTol, cgMax)
        const x = sol.u
        deflate(x, modeVecs)                                  // 留喺低阶补空间
        let mMx = 0, mPhiX = 0
        for (let i = 0; i < nDof; i++) { const mx = M[i] * x[i]; mMx += mx * x[i]; mPhiX += mx * phi[i] }
        if (!(mMx > 0) || !Number.isFinite(mMx)) { break }
        lambda = mPhiX / mMx                                  // 瑞利商 λ=ω²
        const inv = 1 / Math.sqrt(mMx)
        for (let i = 0; i < nDof; i++) phi[i] = x[i] * inv     // M-归一
        used = it
        if (it > 1 && Math.abs(lambda - prev) <= modalTol * Math.abs(lambda)) { conv = true; break }
        prev = lambda
      }
      const freq = (lambda > 0 && Number.isFinite(lambda)) ? Math.sqrt(lambda) / (2 * Math.PI) : 0
      modeVecs.push(phi)
      freqs.push(freq)
      modeIters.push(used)
      modeConverged.push(conv)
      prog('modal', (m + 1) / nModes)
    }

    // ---- 7. 按频率升序排（去缩通常已升序，degenerate/收敛差时排稳）
    const order = freqs.map((_, i) => i).sort((a, bb) => freqs[a] - freqs[bb])

    // ---- 8. 每阶 → 体素中心位移 + 幅值（着色），归一 max|d|=1
    const shapes: Float32Array[] = []
    const amps: Float32Array[] = []
    const outFreqs: number[] = []
    const outIters: number[] = []
    const outConv: boolean[] = []
    for (const oi of order) {
      const vec = modeVecs[oi]
      const disp = new Float32Array(nVox * 3)
      const amp = new Float32Array(nVox)
      let maxMag = 0
      for (let el = 0; el < nVox; el++) {
        const base = el * 24
        let dx = 0, dy = 0, dz = 0
        for (let a = 0; a < 8; a++) {
          dx += vec[elemDofs[base + a * 3]]
          dy += vec[elemDofs[base + a * 3 + 1]]
          dz += vec[elemDofs[base + a * 3 + 2]]
        }
        dx /= 8; dy /= 8; dz /= 8
        disp[el * 3] = dx; disp[el * 3 + 1] = dy; disp[el * 3 + 2] = dz
        const mag = Math.hypot(dx, dy, dz)
        if (mag > maxMag) maxMag = mag
      }
      const inv = maxMag > 0 ? 1 / maxMag : 0
      for (let el = 0; el < nVox; el++) {
        disp[el * 3] *= inv; disp[el * 3 + 1] *= inv; disp[el * 3 + 2] *= inv
        amp[el] = Math.hypot(disp[el * 3], disp[el * 3 + 1], disp[el * 3 + 2])
      }
      shapes.push(disp); amps.push(amp)
      outFreqs.push(freqs[oi]); outIters.push(modeIters[oi]); outConv.push(modeConverged[oi])
    }

    if (outFreqs.length && outFreqs[0] < 1) warnings.push('最低阶频率接近 0：固定面可能约束不足（刚体模态），结果失真')
    if (outConv.some((c) => !c)) warnings.push('部分阶未在迭代上限内收敛（频率为近似值）')

    return {
      ok: true, warnings, h, nVox, nDof, centers,
      freqs: outFreqs, shapes, amps, modeIters: outIters, modeConverged: outConv, fixedCount,
    }
  } catch (err) {
    return fail(`内部错误：${err instanceof Error ? err.message : String(err)}`)
  }
}

// =====================================================================================
// 线性屈曲分析（linear buckling / eigenvalue buckling）— 完成 FEA study 三联：静力 / 模态 / 屈曲。
//
// 先静力解 K u = f 得预应力（单元应力 σ），组几何刚度 Kg（应力软化/硬化）。屈曲问题：
//   (K + λ Kg) φ = 0  ⟺  K φ = λ (−Kg) φ —— 同模态一样系广义特征值，净系「质量」换成 (−Kg)。
//   所以复用模态嘅逆幂迭代（M → −Kg 算子）求最低屈曲载荷因子 λ1。
//   临界载荷 Pcr = λ1 · |施加载荷|（λ1>0 = 该方向会屈曲；≤0 = 受拉/该方向唔屈曲）。
//
// Kg_e（24×24）= ∫_V Gᵀ S G dV，G = 位移梯度算子（9×24，fillG），
//   S（9×9）= blockdiag(σ,σ,σ)，σ = 单元中心 Cauchy 应力 3×3（[[s0,s3,s5],[s3,s1,s4],[s5,s4,s2]]）。
//   2×2×2 高斯、单元中心常应力（低阶 hex 标准近似）。
//
// 校验：Euler 柱 Pcr = π²EI/(KL)²（固定-自由 K=2）。体素屈曲对网格敏感（粗体素偏刚 → Pcr 偏高），
//   故定位「趋势级」，非商用 FEA 精度（同静力/模态一致）。
// =====================================================================================

export interface BucklingInput {
  vertices: ArrayLike<number>
  triangles: ArrayLike<number>
  fixed: PlanePick                 // 夹持面
  load: PlanePick                  // 受力面
  force: [number, number, number]  // 合力 N（屈曲诱发载荷，一般压向）
  E: number; nu: number
  resolution: number
  bandTol?: number; cgTol?: number; maxIter?: number
  bIter?: number                   // 逆幂迭代上限，默认 80
  bTol?: number                    // 载荷因子相对收敛，默认 1e-4
  onProgress?: (phase: string, frac: number) => void
}

export interface BucklingResult {
  ok: boolean; error?: string; warnings: string[]
  h: number; nVox: number; nDof: number
  centers: Float32Array
  lambda1: number                  // 最低屈曲载荷因子
  Pcr: number                      // 临界载荷 N = lambda1 · |force|
  forceN: number
  shape: Float32Array              // nVox*3 屈曲振型（归一 max|d|=1）
  amp: Float32Array                // nVox 幅值 0..1
  iters: number; converged: boolean
  fixedCount: number; loadCount: number
}

export function runVoxelBuckling(inp: BucklingInput): BucklingResult {
  const warnings: string[] = []
  let h = 0, nVox = 0, nDof = 0, fixedCount = 0, loadCount = 0
  const fail = (error: string): BucklingResult => ({
    ok: false, error, warnings, h, nVox, nDof, centers: new Float32Array(0),
    lambda1: 0, Pcr: 0, forceN: 0, shape: new Float32Array(0), amp: new Float32Array(0),
    iters: 0, converged: false, fixedCount, loadCount,
  })
  try {
    if (!inp || !inp.vertices || !inp.triangles) return fail('空网格（无顶点/三角形数组）')
    if (inp.vertices.length < 9 || inp.triangles.length < 3) return fail('空网格（顶点/三角形不足）')
    if (!Number.isFinite(inp.E) || !(inp.E > 0)) return fail('E 无效（需 > 0）')
    if (!Number.isFinite(inp.nu) || !(inp.nu > -0.999 && inp.nu < 0.499)) return fail('nu 无效')
    const force = inp.force
    if (!force || !Number.isFinite(force[0]) || !Number.isFinite(force[1]) || !Number.isFinite(force[2])) return fail('force 无效')
    if (!inp.fixed || !inp.fixed.point || !inp.fixed.normal) return fail('fixed 平面无效')
    if (!inp.load || !inp.load.point || !inp.load.normal) return fail('load 平面无效')
    const forceN = Math.hypot(force[0], force[1], force[2])
    if (!(forceN > 0)) return fail('合力为零：屈曲分析需要施加载荷')

    const prog = (phase: string, frac: number): void => {
      const cb = inp.onProgress
      if (cb) { try { cb(phase, frac) } catch { /* ignore */ } }
    }
    const res = clampResolution(inp.resolution)

    // ---- 1. 体素化 + 节点映射（同 runVoxelFea）
    const grid = voxelize(inp.vertices, inp.triangles, res, (fr) => prog('voxelize', fr))
    h = grid.h; nVox = grid.nVox
    if (!(h > 0)) return fail('包围盒退化')
    if (nVox < 8) return fail(`实体体素不足（${nVox} < 8）`)
    if (nVox > 12000) return fail(`体素过多（${nVox} > 12000）：屈曲（存逐单元 Kg）请降低 resolution`)
    const { nx, ny, nz, ox, oy, oz, solid } = grid
    const nnx = nx + 1, nny = ny + 1, nnz = nz + 1
    // P5 可信度：屈曲对网格极敏感，最短轴截面 < 4 体素时 Pcr 随 res 非单调跳 −43%…+100%（P5 报告 §2.3）。纯诚实警告，不改结果。
    { const _across = Math.min(nx, ny, nz); if (_across < 4) warnings.push(`截面仅 ${_across} 体素跨度（最短轴）：屈曲临界载荷 Pcr 在欠解析截面上非单调跳变、不可信 — 建议提高 resolution 令最短截面跨 ≥4~6 体素`) }
    const nodeId = new Int32Array(nnx * nny * nnz).fill(-1)
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (!solid[i + nx * (j + ny * k)]) continue
      for (let az = 0; az <= 1; az++) for (let ay = 0; ay <= 1; ay++) for (let ax = 0; ax <= 1; ax++) {
        nodeId[(i + ax) + nnx * ((j + ay) + nny * (k + az))] = 0
      }
    }
    let nNodes = 0
    for (let g = 0; g < nodeId.length; g++) if (nodeId[g] === 0) nodeId[g] = nNodes++
    nDof = nNodes * 3
    const nodeGrid = new Int32Array(nNodes)
    for (let g = 0; g < nodeId.length; g++) { const cId = nodeId[g]; if (cId >= 0) nodeGrid[cId] = g }

    // ---- 2. 边界（同 runVoxelFea）
    const bandTol = (inp.bandTol !== undefined && Number.isFinite(inp.bandTol) && inp.bandTol > 0) ? inp.bandTol : 0.6 * h
    const nF = normalize3(inp.fixed.normal); if (!nF) return fail('固定面法向量为零')
    const nL = normalize3(inp.load.normal); if (!nL) return fail('受力面法向量为零')
    const pF = inp.fixed.point, pL = inp.load.point
    const fixedNode = new Uint8Array(nNodes); const loadList: number[] = []
    for (let cId = 0; cId < nNodes; cId++) {
      const g = nodeGrid[cId]
      const ix = g % nnx, iy = ((g / nnx) | 0) % nny, iz = (g / (nnx * nny)) | 0
      const px = ox + ix * h, py = oy + iy * h, pz = oz + iz * h
      const dF = Math.abs((px - pF[0]) * nF[0] + (py - pF[1]) * nF[1] + (pz - pF[2]) * nF[2])
      const isFixed = dF <= bandTol
      if (isFixed) { fixedNode[cId] = 1; fixedCount++ }
      const dL = Math.abs((px - pL[0]) * nL[0] + (py - pL[1]) * nL[1] + (pz - pL[2]) * nL[2])
      if (dL <= bandTol && !isFixed) loadList.push(cId)
    }
    if (fixedCount < 3) return fail(`固定节点不足（${fixedCount} < 3）`)
    loadCount = loadList.length
    if (loadCount < 1) return fail('受力节点为 0')
    const fixedMask = new Uint8Array(nDof)
    for (let cId = 0; cId < nNodes; cId++) if (fixedNode[cId]) { fixedMask[cId * 3] = 1; fixedMask[cId * 3 + 1] = 1; fixedMask[cId * 3 + 2] = 1 }
    const f = new Float64Array(nDof)
    const fxN = force[0] / loadCount, fyN = force[1] / loadCount, fzN = force[2] / loadCount
    for (const cId of loadList) { f[cId * 3] += fxN; f[cId * 3 + 1] += fyN; f[cId * 3 + 2] += fzN }

    // ---- 3. 单元表 + 中心
    const elemDofs = new Int32Array(nVox * 24)
    const centers = new Float32Array(nVox * 3)
    let e = 0
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (!solid[i + nx * (j + ny * k)]) continue
      const base = e * 24
      for (let a = 0; a < 8; a++) {
        const ax = a & 1, ay = (a >> 1) & 1, az = (a >> 2) & 1
        const cId = nodeId[(i + ax) + nnx * ((j + ay) + nny * (k + az))]
        elemDofs[base + a * 3] = cId * 3; elemDofs[base + a * 3 + 1] = cId * 3 + 1; elemDofs[base + a * 3 + 2] = cId * 3 + 2
      }
      centers[e * 3] = ox + (i + 0.5) * h; centers[e * 3 + 1] = oy + (j + 0.5) * h; centers[e * 3 + 2] = oz + (k + 0.5) * h
      e++
    }

    // ---- 4. 静力解（预应力）
    const Ke = buildKe(inp.E, inp.nu, h)
    const cgTol = (inp.cgTol !== undefined && Number.isFinite(inp.cgTol) && inp.cgTol > 0) ? inp.cgTol : 1e-6
    const cgMax = (inp.maxIter !== undefined && Number.isFinite(inp.maxIter) && inp.maxIter > 0) ? Math.floor(inp.maxIter) : 4000
    prog('solve', 0)
    const stat = solveCG(nDof, elemDofs, nVox, Ke, f.slice(), fixedMask, cgTol, cgMax, (fr) => prog('solve', fr))
    if (!stat.converged) warnings.push(`静力 CG 未收敛（残差 ${stat.residual.toExponential(2)}）：预应力近似`)
    const u = stat.u

    // ---- 5. 单元中心应力 → 几何刚度 −Kg（逐单元存）
    prog('kg', 0)
    const D = buildD(inp.E, inp.nu)
    const Bc = new Float64Array(144); fillB(Bc, 0, 0, 0, h)
    const ue = new Float64Array(24), strain = new Float64Array(6), stress = new Float64Array(6)
    const negKg = new Float64Array(nVox * 576)
    const Gm = new Float64Array(216), SG = new Float64Array(216)
    const gg = 1 / Math.sqrt(3), gp = [-gg, gg], wq = (h / 2) * (h / 2) * (h / 2)
    for (let el = 0; el < nVox; el++) {
      const base = el * 24
      for (let d = 0; d < 24; d++) ue[d] = u[elemDofs[base + d]]
      for (let r2 = 0; r2 < 6; r2++) { let s = 0; const row = r2 * 24; for (let m = 0; m < 24; m++) s += Bc[row + m] * ue[m]; strain[r2] = s }
      for (let r2 = 0; r2 < 6; r2++) { let s = 0; const row = r2 * 6; for (let m = 0; m < 6; m++) s += D[row + m] * strain[m]; stress[r2] = s }
      const s0 = stress[0], s1 = stress[1], s2 = stress[2], s3 = stress[3], s4 = stress[4], s5 = stress[5]
      const Kg = new Float64Array(576)
      for (const zeta of gp) for (const eta of gp) for (const xi of gp) {
        fillG(Gm, xi, eta, zeta, h)
        for (let kk = 0; kk < 3; kk++) {
          const bse = 3 * kk
          for (let c = 0; c < 24; c++) {
            const g0 = Gm[(bse) * 24 + c], g1 = Gm[(bse + 1) * 24 + c], g2 = Gm[(bse + 2) * 24 + c]
            SG[(bse) * 24 + c] = s0 * g0 + s3 * g1 + s5 * g2
            SG[(bse + 1) * 24 + c] = s3 * g0 + s1 * g1 + s4 * g2
            SG[(bse + 2) * 24 + c] = s5 * g0 + s4 * g1 + s2 * g2
          }
        }
        for (let i = 0; i < 24; i++) for (let j = 0; j < 24; j++) {
          let acc = 0
          for (let rr = 0; rr < 9; rr++) acc += Gm[rr * 24 + i] * SG[rr * 24 + j]
          Kg[i * 24 + j] += wq * acc
        }
      }
      for (let q = 0; q < 576; q++) negKg[base * 24 + q] = -Kg[q]   // base*24 = el*576
      if ((el & 1023) === 0) prog('kg', el / nVox)
    }
    prog('kg', 1)

    // −Kg 矩阵-向量积（逐单元 gather/scatter；固定 DOF 清零）
    const tmp = new Float64Array(24)
    const applyNegKg = (xv: Float64Array, out: Float64Array): void => {
      out.fill(0)
      for (let el = 0; el < nVox; el++) {
        const base = el * 24, kb = el * 576
        for (let d = 0; d < 24; d++) tmp[d] = xv[elemDofs[base + d]]
        for (let d = 0; d < 24; d++) {
          const row = kb + d * 24
          let s = negKg[row] * tmp[0]
          for (let m = 1; m < 24; m++) s += negKg[row + m] * tmp[m]
          out[elemDofs[base + d]] += s
        }
      }
      for (let i = 0; i < nDof; i++) if (fixedMask[i]) out[i] = 0
    }

    // ---- 6. 逆幂迭代（M = −Kg）求最低屈曲因子 λ1
    const bIter = (inp.bIter !== undefined && Number.isFinite(inp.bIter) && inp.bIter > 0) ? Math.floor(inp.bIter) : 80
    const bTol = (inp.bTol !== undefined && Number.isFinite(inp.bTol) && inp.bTol > 0) ? inp.bTol : 1e-4
    const phi = new Float64Array(nDof)
    for (let i = 0; i < nDof; i++) if (!fixedMask[i]) phi[i] = (((i * 2654435761) >>> 0) / 4294967296) - 0.5
    // L2 归一
    const l2norm = (v: Float64Array): number => { let s = 0; for (let i = 0; i < nDof; i++) s += v[i] * v[i]; return Math.sqrt(s) }
    { const n0 = l2norm(phi); if (n0 > 0) for (let i = 0; i < nDof; i++) phi[i] /= n0 }
    let lambda = 0, prev = 0, conv = false, used = 0
    const b0 = new Float64Array(nDof), Mx = new Float64Array(nDof)
    for (let it = 1; it <= bIter; it++) {
      applyNegKg(phi, b0)                           // b0 = M φ
      const x = solveCG(nDof, elemDofs, nVox, Ke, b0.slice(), fixedMask, cgTol, cgMax)  // x = K⁻¹ M φ
      applyNegKg(x.u, Mx)                            // M x
      let num = 0, den = 0
      for (let i = 0; i < nDof; i++) { num += x.u[i] * b0[i]; den += x.u[i] * Mx[i] }   // num=xᵀKx, den=xᵀMx
      if (!Number.isFinite(den) || Math.abs(den) < 1e-300) break
      lambda = num / den                             // 瑞利商：屈曲载荷因子
      const xn = l2norm(x.u); if (!(xn > 0)) break
      for (let i = 0; i < nDof; i++) phi[i] = x.u[i] / xn
      used = it
      if (it > 1 && Math.abs(lambda - prev) <= bTol * Math.abs(lambda)) { conv = true; break }
      prev = lambda
      if ((it & 3) === 0) prog('buckle', it / bIter)
    }
    prog('buckle', 1)

    // ---- 7. 振型 → 体素中心位移 + 幅值
    const shape = new Float32Array(nVox * 3), amp = new Float32Array(nVox)
    let maxMag = 0
    for (let el = 0; el < nVox; el++) {
      const base = el * 24
      let dx = 0, dy = 0, dz = 0
      for (let a = 0; a < 8; a++) { dx += phi[elemDofs[base + a * 3]]; dy += phi[elemDofs[base + a * 3 + 1]]; dz += phi[elemDofs[base + a * 3 + 2]] }
      dx /= 8; dy /= 8; dz /= 8
      shape[el * 3] = dx; shape[el * 3 + 1] = dy; shape[el * 3 + 2] = dz
      const mag = Math.hypot(dx, dy, dz); if (mag > maxMag) maxMag = mag
    }
    const inv = maxMag > 0 ? 1 / maxMag : 0
    for (let el = 0; el < nVox; el++) { shape[el * 3] *= inv; shape[el * 3 + 1] *= inv; shape[el * 3 + 2] *= inv; amp[el] = Math.hypot(shape[el * 3], shape[el * 3 + 1], shape[el * 3 + 2]) }

    const lambda1 = lambda
    const Pcr = lambda1 * forceN
    if (!conv) warnings.push('屈曲逆幂迭代未在上限内收敛（载荷因子为近似值）')
    if (lambda1 <= 0) warnings.push('最低屈曲因子 ≤ 0：该载荷方向唔会屈曲（受拉或方向相反）— 试反向施力或检查约束')

    return {
      ok: true, warnings, h, nVox, nDof, centers,
      lambda1, Pcr, forceN, shape, amp, iters: used, converged: conv, fixedCount, loadCount,
    }
  } catch (err) {
    return fail(`内部错误：${err instanceof Error ? err.message : String(err)}`)
  }
}

// =====================================================================================
// 预应力（应力刚化）模态分析 — Prestressed / stress-stiffened Modal（Fusion「Modal Frequencies」带预载）。
//
// 先静力解 K u = f 得预应力 → 组几何刚度 Kg（同屈曲嗰个，应力软化/硬化）→ 切线刚度 (K+Kg)。
// 模态广义特征值改用切线刚度：(K + Kg) φ = ω² M φ。物理：
//   · 受【拉】预载 → Kg 令结构变硬 → 固有频率【升】（吉他弦越紧音越高 = 同一现象）。
//   · 受【压】预载 → Kg 令结构变软 → 固有频率【降】；当压载 → 屈曲临界载荷时 (K+Kg) 趋奇异 → f₁ → 0。
//     ↑ 呢个系【免费正确性校验】：同 runVoxelBuckling 共用同一 Kg，f₁→0 嗰点 == 屈曲载荷 Pcr。
//
// 实现 = 克隆 runVoxelModal 嘅逆幂迭代，只系内层 solveCG 换成 solveCGWithKg（算子 K → K+Kg）；
//   Kg 组装逐字节复用 runVoxelBuckling 嘅积分回路，但存【未取负】Kg（屈曲存 −Kg；预应力模态要 +Kg 加落 K）。
//   ⚠ 符号系唯一陷阱：用错 −Kg 会令受压升频（物理颠倒）。
// =====================================================================================

export interface PrestressedModalInput extends ModalInput {
  load: PlanePick                  // 预载受力面
  force: [number, number, number]  // 预载合力 N（拉 = 沿外法向 / 压 = 反向）
}

/** S183：matrix-free Jacobi-PCG，算子 = (K + Kg)（切线刚度）。kgPerElem = 逐单元几何刚度（nElem*576 行优先，【未取负】）。
 *  克隆 solveCG 核心（diag / applyK / CG 回路 / fScale 上溢防护），只系 diag + matvec 各加 Kg 项。
 *  注：接近屈曲时 (K+Kg) 转非正定 → CG pq 守卫触发提早停（物理 = 失稳，调用方按近临界处理，唔系数值 bug）。 */
function solveCGWithKg(
  nDof: number, elemDofs: Int32Array, nElem: number,
  Ke: Float64Array, kgPerElem: Float64Array,
  f: Float64Array, fixedMask: Uint8Array, tol: number, maxIter: number,
): SolveOut {
  const n = nDof
  const diag = new Float64Array(n)
  for (let e = 0; e < nElem; e++) {
    const base = e * 24, kb = e * 576
    for (let d = 0; d < 24; d++) diag[elemDofs[base + d]] += Ke[d * 25] + kgPerElem[kb + d * 25]
  }
  for (let i = 0; i < n; i++) {
    if (fixedMask[i]) { diag[i] = 1; f[i] = 0 }
    else if (!(diag[i] > 0)) diag[i] = 1   // (K+Kg) 对角受 Kg 影响可能转非正（接近屈曲）→ 退回 1（Jacobi 仅预条件，唔影响解只影响收敛速度）
  }
  const u = new Float64Array(n), r = new Float64Array(n), z = new Float64Array(n), p = new Float64Array(n), q = new Float64Array(n)
  const ue = new Float64Array(24)
  const applyK = (xv: Float64Array, out: Float64Array): void => {
    out.fill(0)
    for (let e = 0; e < nElem; e++) {
      const base = e * 24, kb = e * 576
      for (let d = 0; d < 24; d++) ue[d] = xv[elemDofs[base + d]]
      for (let d = 0; d < 24; d++) {
        const row = d * 24, krow = kb + d * 24
        let s = (Ke[row] + kgPerElem[krow]) * ue[0]
        for (let m = 1; m < 24; m++) s += (Ke[row + m] + kgPerElem[krow + m]) * ue[m]
        out[elemDofs[base + d]] += s
      }
    }
    for (let i = 0; i < n; i++) if (fixedMask[i]) out[i] = 0
  }
  let fMaxAbs = 0
  for (let i = 0; i < n; i++) { const a = Math.abs(f[i]); if (a > fMaxAbs) fMaxAbs = a }
  if (!(fMaxAbs > 0)) return { u, iters: 0, residual: 0, converged: true }
  let fScale = 1
  if (fMaxAbs > 1e100 || fMaxAbs < 1e-100) {
    const k = Math.max(-1023, Math.min(1023, Math.round(Math.log2(fMaxAbs))))
    fScale = 2 ** -k
    for (let i = 0; i < n; i++) f[i] *= fScale
  }
  let fn2 = 0; for (let i = 0; i < n; i++) fn2 += f[i] * f[i]
  const fnorm = Math.sqrt(fn2)
  if (!(fnorm > 0)) return { u, iters: 0, residual: 0, converged: true }
  r.set(f)
  let rz = 0
  for (let i = 0; i < n; i++) { const zi = r[i] / diag[i]; z[i] = zi; rz += r[i] * zi }
  p.set(z)
  let iters = 0, rel = 1, converged = false
  for (let it = 1; it <= maxIter; it++) {
    applyK(p, q)
    let pq = 0; for (let i = 0; i < n; i++) pq += p[i] * q[i]
    if (!(pq > 0)) break   // (K+Kg) 非正定方向（接近/越过屈曲）→ 提早停
    const alpha = rz / pq
    let rn2 = 0
    for (let i = 0; i < n; i++) { u[i] += alpha * p[i]; const ri = r[i] - alpha * q[i]; r[i] = ri; rn2 += ri * ri }
    iters = it; rel = Math.sqrt(rn2) / fnorm
    if (rel <= tol) { converged = true; break }
    let rzn = 0; for (let i = 0; i < n; i++) { const zi = r[i] / diag[i]; z[i] = zi; rzn += r[i] * zi }
    const beta = rzn / rz; rz = rzn
    for (let i = 0; i < n; i++) p[i] = z[i] + beta * p[i]
  }
  if (fScale !== 1) for (let i = 0; i < n; i++) u[i] /= fScale
  return { u, iters, residual: rel, converged }
}

export function runVoxelPrestressedModal(inp: PrestressedModalInput): ModalResult {
  const warnings: string[] = []
  let h = 0, nVox = 0, nDof = 0, fixedCount = 0
  const fail = (error: string): ModalResult => ({
    ok: false, error, warnings, h, nVox, nDof,
    centers: new Float32Array(0), freqs: [], shapes: [], amps: [],
    modeIters: [], modeConverged: [], fixedCount,
  })
  try {
    if (!inp || !inp.vertices || !inp.triangles) return fail('空网格（无顶点/三角形数组）')
    if (inp.vertices.length < 9 || inp.triangles.length < 3) return fail('空网格（顶点/三角形不足）')
    if (!Number.isFinite(inp.E) || !(inp.E > 0)) return fail('E 无效（需 > 0）')
    if (!Number.isFinite(inp.nu) || !(inp.nu > -0.999 && inp.nu < 0.499)) return fail('nu 无效（需 -1 < nu < 0.5）')
    if (!Number.isFinite(inp.rho) || !(inp.rho > 0)) return fail('密度 rho 无效（需 > 0，g/cm³）')
    if (!inp.fixed || !inp.fixed.point || !inp.fixed.normal) return fail('fixed 平面无效')
    if (!inp.load || !inp.load.point || !inp.load.normal) return fail('预载 load 平面无效')
    const force = inp.force
    if (!force || !Number.isFinite(force[0]) || !Number.isFinite(force[1]) || !Number.isFinite(force[2])) return fail('预载 force 无效')
    const forceN = Math.hypot(force[0], force[1], force[2])
    if (!(forceN > 0)) return fail('预载合力为零：预应力模态需要施加预载（拉/压）')

    const prog = (phase: string, frac: number): void => {
      const cb = inp.onProgress
      if (cb) { try { cb(phase, frac) } catch { /* 进度回调出错唔影响计算 */ } }
    }
    const res = clampResolution(inp.resolution)
    const nModes = Math.min(12, Math.max(1, Math.round(Number.isFinite(inp.nModes as number) ? (inp.nModes as number) : 6)))

    // ---- 1. 体素化（同 modal/buckling）；预应力存逐单元 Kg → 用屈曲嘅 12000 上限（非 modal 60000）
    const grid = voxelize(inp.vertices, inp.triangles, res, (fr) => prog('voxelize', fr))
    h = grid.h; nVox = grid.nVox
    if (grid.oddColumns > 0) warnings.push(`奇异列 ${grid.oddColumns} 条（网格边/缝）`)
    if (!(h > 0)) return fail('包围盒退化（网格无体积范围）')
    if (nVox < 8) return fail(`实体体素不足（${nVox} < 8）：请提高 resolution 或检查网格水密性`)
    if (nVox > 12000) return fail(`体素过多（${nVox} > 12000）：预应力模态（存逐单元 Kg）请降低 resolution`)

    const { nx, ny, nz, ox, oy, oz, solid } = grid
    const nnx = nx + 1, nny = ny + 1, nnz = nz + 1

    // ---- 2. 节点紧凑映射（同 modal）
    const nodeId = new Int32Array(nnx * nny * nnz).fill(-1)
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (!solid[i + nx * (j + ny * k)]) continue
      for (let az = 0; az <= 1; az++) for (let ay = 0; ay <= 1; ay++) for (let ax = 0; ax <= 1; ax++) {
        nodeId[(i + ax) + nnx * ((j + ay) + nny * (k + az))] = 0
      }
    }
    let nNodes = 0
    for (let g = 0; g < nodeId.length; g++) if (nodeId[g] === 0) nodeId[g] = nNodes++
    nDof = nNodes * 3
    const nodeGrid = new Int32Array(nNodes)
    for (let g = 0; g < nodeId.length; g++) { const cId = nodeId[g]; if (cId >= 0) nodeGrid[cId] = g }

    // ---- 3. 固定带 + 预载面（固定镜 modal，受力镜 buckling）
    const bandTol = (inp.bandTol !== undefined && Number.isFinite(inp.bandTol) && inp.bandTol > 0) ? inp.bandTol : 0.6 * h
    const nF = normalize3(inp.fixed.normal); if (!nF) return fail('固定面法向量为零')
    const nL = normalize3(inp.load.normal); if (!nL) return fail('预载面法向量为零')
    const pF = inp.fixed.point, pL = inp.load.point
    const fixedNode = new Uint8Array(nNodes); const loadList: number[] = []
    for (let cId = 0; cId < nNodes; cId++) {
      const g = nodeGrid[cId]
      const ix = g % nnx, iy = ((g / nnx) | 0) % nny, iz = (g / (nnx * nny)) | 0
      const px = ox + ix * h, py = oy + iy * h, pz = oz + iz * h
      const dF = Math.abs((px - pF[0]) * nF[0] + (py - pF[1]) * nF[1] + (pz - pF[2]) * nF[2])
      const isFixed = dF <= bandTol
      if (isFixed) { fixedNode[cId] = 1; fixedCount++ }
      const dL = Math.abs((px - pL[0]) * nL[0] + (py - pL[1]) * nL[1] + (pz - pL[2]) * nL[2])
      if (dL <= bandTol && !isFixed) loadList.push(cId)
    }
    if (fixedCount < 3) return fail(`固定节点不足（${fixedCount} < 3）：fixed 平面可能未接触实体（试调 bandTol）`)
    if (loadList.length < 1) return fail('预载受力节点为 0：load 平面可能未接触实体')
    const fixedMask = new Uint8Array(nDof)
    for (let cId = 0; cId < nNodes; cId++) if (fixedNode[cId]) { fixedMask[cId * 3] = 1; fixedMask[cId * 3 + 1] = 1; fixedMask[cId * 3 + 2] = 1 }
    const fLoad = new Float64Array(nDof)
    const fxN = force[0] / loadList.length, fyN = force[1] / loadList.length, fzN = force[2] / loadList.length
    for (const cId of loadList) { fLoad[cId * 3] += fxN; fLoad[cId * 3 + 1] += fyN; fLoad[cId * 3 + 2] += fzN }

    // ---- 4. 单元 DOF 表 + 中心
    const elemDofs = new Int32Array(nVox * 24)
    const centers = new Float32Array(nVox * 3)
    {
      let e = 0
      for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        if (!solid[i + nx * (j + ny * k)]) continue
        const base = e * 24
        for (let a = 0; a < 8; a++) {
          const ax = a & 1, ay = (a >> 1) & 1, az = (a >> 2) & 1
          const cId = nodeId[(i + ax) + nnx * ((j + ay) + nny * (k + az))]
          elemDofs[base + a * 3] = cId * 3; elemDofs[base + a * 3 + 1] = cId * 3 + 1; elemDofs[base + a * 3 + 2] = cId * 3 + 2
        }
        centers[e * 3] = ox + (i + 0.5) * h; centers[e * 3 + 1] = oy + (j + 0.5) * h; centers[e * 3 + 2] = oz + (k + 0.5) * h
        e++
      }
    }

    // ---- 5. 静力预载解 K u = f（同 buckling）
    const Ke = buildKe(inp.E, inp.nu, h)
    const cgTol = (inp.cgTol !== undefined && Number.isFinite(inp.cgTol) && inp.cgTol > 0) ? inp.cgTol : 1e-6
    const cgMax = (inp.maxIter !== undefined && Number.isFinite(inp.maxIter) && inp.maxIter > 0) ? Math.floor(inp.maxIter) : 4000
    prog('preload', 0)
    const stat = solveCG(nDof, elemDofs, nVox, Ke, fLoad.slice(), fixedMask, cgTol, cgMax, (fr) => prog('preload', fr))
    if (!stat.converged) warnings.push(`预载静力 CG 未收敛（残差 ${stat.residual.toExponential(2)}）：预应力近似`)
    const u0 = stat.u

    // ---- 6. 单元中心应力 → 几何刚度 Kg（逐单元存，【未取负】，镜 buckling 但 kgPerElem = +Kg）
    prog('kg', 0)
    const D = buildD(inp.E, inp.nu)
    const Bc = new Float64Array(144); fillB(Bc, 0, 0, 0, h)
    const ue = new Float64Array(24), strain = new Float64Array(6), stress = new Float64Array(6)
    const kgPerElem = new Float64Array(nVox * 576)
    const Gm = new Float64Array(216), SG = new Float64Array(216)
    const gg = 1 / Math.sqrt(3), gp = [-gg, gg], wq = (h / 2) * (h / 2) * (h / 2)
    for (let el = 0; el < nVox; el++) {
      const base = el * 24
      for (let d = 0; d < 24; d++) ue[d] = u0[elemDofs[base + d]]
      for (let r2 = 0; r2 < 6; r2++) { let s = 0; const row = r2 * 24; for (let m = 0; m < 24; m++) s += Bc[row + m] * ue[m]; strain[r2] = s }
      for (let r2 = 0; r2 < 6; r2++) { let s = 0; const row = r2 * 6; for (let m = 0; m < 6; m++) s += D[row + m] * strain[m]; stress[r2] = s }
      const s0 = stress[0], s1 = stress[1], s2 = stress[2], s3 = stress[3], s4 = stress[4], s5 = stress[5]
      const kb = el * 576
      for (const zeta of gp) for (const eta of gp) for (const xi of gp) {
        fillG(Gm, xi, eta, zeta, h)
        for (let kk = 0; kk < 3; kk++) {
          const bse = 3 * kk
          for (let c = 0; c < 24; c++) {
            const g0 = Gm[(bse) * 24 + c], g1 = Gm[(bse + 1) * 24 + c], g2 = Gm[(bse + 2) * 24 + c]
            SG[(bse) * 24 + c] = s0 * g0 + s3 * g1 + s5 * g2
            SG[(bse + 1) * 24 + c] = s3 * g0 + s1 * g1 + s4 * g2
            SG[(bse + 2) * 24 + c] = s5 * g0 + s4 * g1 + s2 * g2
          }
        }
        for (let i = 0; i < 24; i++) for (let j = 0; j < 24; j++) {
          let acc = 0
          for (let rr = 0; rr < 9; rr++) acc += Gm[rr * 24 + i] * SG[rr * 24 + j]
          kgPerElem[kb + i * 24 + j] += wq * acc   // +Kg（屈曲存 −Kg；预应力模态切线刚度 K+Kg 要 +）
        }
      }
      if ((el & 1023) === 0) prog('kg', el / nVox)
    }
    prog('kg', 1)

    // ---- 7. 集中质量 M（对角，tonne）（同 modal）
    const rhoCons = inp.rho * 1e-9
    const me = rhoCons * h * h * h / 8
    const M = new Float64Array(nDof)
    for (let el = 0; el < nVox; el++) {
      const base = el * 24
      for (let a = 0; a < 8; a++) { const d0 = elemDofs[base + a * 3]; M[d0] += me; M[d0 + 1] += me; M[d0 + 2] += me }
    }
    for (let i = 0; i < nDof; i++) if (fixedMask[i]) M[i] = 0

    // ---- 8. 逆幂迭代 + M-正交去缩（同 modal，但内层 solveCG → solveCGWithKg，算子 K+Kg）
    const modalIter = (inp.modalIter !== undefined && Number.isFinite(inp.modalIter) && inp.modalIter > 0) ? Math.floor(inp.modalIter) : 100
    const modalTol = (inp.modalTol !== undefined && Number.isFinite(inp.modalTol) && inp.modalTol > 0) ? inp.modalTol : 1e-4
    const deflate = (v: Float64Array, modes: Float64Array[]): void => {
      for (const phj of modes) {
        let c = 0
        for (let i = 0; i < nDof; i++) c += M[i] * phj[i] * v[i]
        if (c !== 0) for (let i = 0; i < nDof; i++) v[i] -= c * phj[i]
      }
    }
    const mNorm2 = (v: Float64Array): number => { let s = 0; for (let i = 0; i < nDof; i++) s += M[i] * v[i] * v[i]; return s }
    const modeVecs: Float64Array[] = []
    const freqs: number[] = []
    const modeIters: number[] = []
    const modeConverged: boolean[] = []
    const b = new Float64Array(nDof)
    let nonPosDef = false
    for (let m = 0; m < nModes; m++) {
      const phi = new Float64Array(nDof)
      for (let i = 0; i < nDof; i++) {
        if (fixedMask[i]) continue
        phi[i] = (((i * 2654435761) >>> 0) / 4294967296) - 0.5 + ((m + 1) * 0.013)
      }
      deflate(phi, modeVecs)
      let s0 = mNorm2(phi)
      if (!(s0 > 0)) { phi[(m % Math.max(1, nDof))] = 1; deflate(phi, modeVecs); s0 = mNorm2(phi) }
      if (s0 > 0) { const inv = 1 / Math.sqrt(s0); for (let i = 0; i < nDof; i++) phi[i] *= inv }
      let lambda = 0, prev = 0, conv = false, used = 0
      for (let it = 1; it <= modalIter; it++) {
        for (let i = 0; i < nDof; i++) b[i] = M[i] * phi[i]
        const sol = solveCGWithKg(nDof, elemDofs, nVox, Ke, kgPerElem, b, fixedMask, cgTol, cgMax)
        if (!sol.converged) nonPosDef = true   // 接近屈曲 → (K+Kg) 病态/非正定
        const x = sol.u
        deflate(x, modeVecs)
        let mMx = 0, mPhiX = 0
        for (let i = 0; i < nDof; i++) { const mx = M[i] * x[i]; mMx += mx * x[i]; mPhiX += mx * phi[i] }
        if (!(mMx > 0) || !Number.isFinite(mMx)) { break }
        lambda = mPhiX / mMx
        const inv = 1 / Math.sqrt(mMx)
        for (let i = 0; i < nDof; i++) phi[i] = x[i] * inv
        used = it
        if (it > 1 && Math.abs(lambda - prev) <= modalTol * Math.abs(lambda)) { conv = true; break }
        prev = lambda
      }
      // λ=ω² 可能因强压预载转负（切线刚度失去正定）→ freq 截 0（物理 = 该预载下已屈曲/临界）
      const freq = (lambda > 0 && Number.isFinite(lambda)) ? Math.sqrt(lambda) / (2 * Math.PI) : 0
      modeVecs.push(phi); freqs.push(freq); modeIters.push(used); modeConverged.push(conv)
      prog('modal', (m + 1) / nModes)
    }

    const order = freqs.map((_, i) => i).sort((a, bb) => freqs[a] - freqs[bb])
    const shapes: Float32Array[] = []
    const amps: Float32Array[] = []
    const outFreqs: number[] = []
    const outIters: number[] = []
    const outConv: boolean[] = []
    for (const oi of order) {
      const vec = modeVecs[oi]
      const disp = new Float32Array(nVox * 3)
      const amp = new Float32Array(nVox)
      let maxMag = 0
      for (let el = 0; el < nVox; el++) {
        const base = el * 24
        let dx = 0, dy = 0, dz = 0
        for (let a = 0; a < 8; a++) { dx += vec[elemDofs[base + a * 3]]; dy += vec[elemDofs[base + a * 3 + 1]]; dz += vec[elemDofs[base + a * 3 + 2]] }
        dx /= 8; dy /= 8; dz /= 8
        disp[el * 3] = dx; disp[el * 3 + 1] = dy; disp[el * 3 + 2] = dz
        const mag = Math.hypot(dx, dy, dz); if (mag > maxMag) maxMag = mag
      }
      const inv = maxMag > 0 ? 1 / maxMag : 0
      for (let el = 0; el < nVox; el++) {
        disp[el * 3] *= inv; disp[el * 3 + 1] *= inv; disp[el * 3 + 2] *= inv
        amp[el] = Math.hypot(disp[el * 3], disp[el * 3 + 1], disp[el * 3 + 2])
      }
      shapes.push(disp); amps.push(amp)
      outFreqs.push(freqs[oi]); outIters.push(modeIters[oi]); outConv.push(modeConverged[oi])
    }

    if (outFreqs.length && outFreqs[0] < 1e-6) warnings.push('最低阶频率 ≈ 0：预载接近/超过屈曲临界载荷（切线刚度失稳）— 减小压载或检查约束')
    else if (nonPosDef) warnings.push('预载接近屈曲临界：内层 (K+Kg) 求解病态，频率为近似值（趋势级）')
    if (outConv.some((c) => !c)) warnings.push('部分阶未在迭代上限内收敛（频率为近似值）')

    return {
      ok: true, warnings, h, nVox, nDof, centers,
      freqs: outFreqs, shapes, amps, modeIters: outIters, modeConverged: outConv, fixedCount,
    }
  } catch (err) {
    return fail(`内部错误：${err instanceof Error ? err.message : String(err)}`)
  }
}

// =====================================================================================
// 生成式设计 / 拓扑优化（SIMP 密度法）— 复用同一套体素化 + buildKe。
// 对标 Fusion「生成式设计 / 形状优化」：喺设计域内分配材料，最小化柔度（最大化刚度）
// 受体积比约束 —— 自动长出「最省料又最硬」嘅承力结构（桁架/拱）。
//
// 经典 SIMP（Bendsøe/Sigmund，clean-room 自写，零依赖）：
//   · 设计变量 = 每体素密度 x_e∈[xmin,1]；材料插值 E_e = Emin + x_e^p·(E0−Emin)（p=3 惩罚中间密度）
//   · 静力解 K(x)u=f（每单元 Ke 乘 E_e/E0 因子，matrix-free Jacobi-PCG）
//   · 柔度 c = uᵀKu = Σ E_e·(ueᵀKe0 ue)；灵敏度 dc_e = −p·x_e^(p−1)(1−Emin/E0)·(ueᵀKe0 ue)
//   · 敏度过滤（半径 rmin，去棋盘格）+ 最优准则(OC)更新密度，二分 λ 打体积比
//   · 迭代至密度变化 < tol。输出密度场（>0.5 = 保留材料）。
//
// 校验：悬臂/MBB 柔度单调下降 + 收敛体积比命中 + 长出合理承力结构。趋势级（体素分辨率所限）。
// =====================================================================================

/** SIMP 专用：每单元密度因子缩放嘅 matrix-free Jacobi-PCG（K(x)u=f）。 */
function solveCGScaled(
  nDof: number, elemDofs: Int32Array, nElem: number, Ke: Float64Array,
  factor: Float64Array, f: Float64Array, fixedMask: Uint8Array, tol: number, maxIter: number,
): { u: Float64Array; converged: boolean } {
  const n = nDof
  const diag = new Float64Array(n)
  for (let e = 0; e < nElem; e++) { const base = e * 24, fe = factor[e]; for (let d = 0; d < 24; d++) diag[elemDofs[base + d]] += fe * Ke[d * 25] }
  for (let i = 0; i < n; i++) { if (fixedMask[i]) { diag[i] = 1; f[i] = 0 } else if (!(diag[i] > 0)) diag[i] = 1 }
  const u = new Float64Array(n), r = new Float64Array(n), z = new Float64Array(n), p = new Float64Array(n), q = new Float64Array(n), ue = new Float64Array(24)
  const applyK = (xv: Float64Array, out: Float64Array): void => {
    out.fill(0)
    for (let e = 0; e < nElem; e++) {
      const base = e * 24, fe = factor[e]
      for (let d = 0; d < 24; d++) ue[d] = xv[elemDofs[base + d]]
      for (let d = 0; d < 24; d++) { const row = d * 24; let s = Ke[row] * ue[0]; for (let m = 1; m < 24; m++) s += Ke[row + m] * ue[m]; out[elemDofs[base + d]] += fe * s }
    }
    for (let i = 0; i < n; i++) if (fixedMask[i]) out[i] = 0
  }
  let fn2 = 0; for (let i = 0; i < n; i++) fn2 += f[i] * f[i]
  const fnorm = Math.sqrt(fn2); if (!(fnorm > 0)) return { u, converged: true }
  r.set(f); let rz = 0
  for (let i = 0; i < n; i++) { const zi = r[i] / diag[i]; z[i] = zi; rz += r[i] * zi }
  p.set(z)
  let converged = false
  for (let it = 1; it <= maxIter; it++) {
    applyK(p, q)
    let pq = 0; for (let i = 0; i < n; i++) pq += p[i] * q[i]
    if (!(pq > 0)) break
    const alpha = rz / pq; let rn2 = 0
    for (let i = 0; i < n; i++) { u[i] += alpha * p[i]; const ri = r[i] - alpha * q[i]; r[i] = ri; rn2 += ri * ri }
    if (Math.sqrt(rn2) / fnorm <= tol) { converged = true; break }
    let rzn = 0; for (let i = 0; i < n; i++) { const zi = r[i] / diag[i]; z[i] = zi; rzn += r[i] * zi }
    const beta = rzn / rz; rz = rzn
    for (let i = 0; i < n; i++) p[i] = z[i] + beta * p[i]
  }
  return { u, converged }
}

export interface TopoptInput {
  vertices: ArrayLike<number>; triangles: ArrayLike<number>
  fixed: PlanePick; load: PlanePick; force: [number, number, number]
  E: number; nu: number; resolution: number
  volfrac?: number   // 目标体积比 0..1，默认 0.4
  penal?: number     // SIMP 惩罚指数，默认 3
  rmin?: number      // 敏度过滤半径（体素数），默认 1.5
  iters?: number     // 优化迭代上限，默认 40
  cgTol?: number; maxIter?: number; bandTol?: number
  onProgress?: (phase: string, frac: number) => void
}
export interface TopoptResult {
  ok: boolean; error?: string; warnings: string[]
  h: number; nVox: number; nDof: number
  centers: Float32Array            // nVox*3 CAD
  density: Float32Array            // nVox 最终密度 0..1
  complianceHistory: number[]      // 每迭代柔度
  volfrac: number; finalVol: number
  iters: number; fixedCount: number; loadCount: number
}

export function runTopologyOpt(inp: TopoptInput): TopoptResult {
  const warnings: string[] = []
  let h = 0, nVox = 0, nDof = 0, fixedCount = 0, loadCount = 0
  const fail = (error: string): TopoptResult => ({
    ok: false, error, warnings, h, nVox, nDof, centers: new Float32Array(0), density: new Float32Array(0),
    complianceHistory: [], volfrac: 0, finalVol: 0, iters: 0, fixedCount, loadCount,
  })
  try {
    if (!inp || !inp.vertices || !inp.triangles || inp.vertices.length < 9 || inp.triangles.length < 3) return fail('空网格')
    if (!Number.isFinite(inp.E) || !(inp.E > 0)) return fail('E 无效')
    if (!Number.isFinite(inp.nu) || !(inp.nu > -0.999 && inp.nu < 0.499)) return fail('nu 无效')
    if (!inp.fixed?.point || !inp.fixed?.normal || !inp.load?.point || !inp.load?.normal) return fail('fixed/load 平面无效')
    const force = inp.force
    if (!force || !Number.isFinite(force[0] + force[1] + force[2]) || Math.hypot(force[0], force[1], force[2]) === 0) return fail('force 无效或为零')
    const volfrac = Math.min(0.9, Math.max(0.05, Number.isFinite(inp.volfrac as number) ? (inp.volfrac as number) : 0.4))
    const penal = Math.min(5, Math.max(1, Number.isFinite(inp.penal as number) ? (inp.penal as number) : 3))
    const rmin = Math.min(6, Math.max(1.1, Number.isFinite(inp.rmin as number) ? (inp.rmin as number) : 1.5))
    const maxLoop = Math.min(120, Math.max(5, Math.floor(Number.isFinite(inp.iters as number) ? (inp.iters as number) : 40)))
    const prog = (phase: string, frac: number): void => { const cb = inp.onProgress; if (cb) { try { cb(phase, frac) } catch { /* ignore */ } } }
    const res = clampResolution(inp.resolution)

    // 体素化 + 节点映射（同 runVoxelFea）
    const grid = voxelize(inp.vertices, inp.triangles, res, (fr) => prog('voxelize', fr))
    h = grid.h; nVox = grid.nVox
    if (!(h > 0)) return fail('包围盒退化')
    if (nVox < 8) return fail(`实体体素不足（${nVox} < 8）`)
    if (nVox > 30000) return fail(`体素过多（${nVox} > 30000）：拓扑优化请降低 resolution`)
    const { nx, ny, nz, ox, oy, oz, solid } = grid
    const nnx = nx + 1, nny = ny + 1, nnz = nz + 1
    const nodeId = new Int32Array(nnx * nny * nnz).fill(-1)
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (!solid[i + nx * (j + ny * k)]) continue
      for (let az = 0; az <= 1; az++) for (let ay = 0; ay <= 1; ay++) for (let ax = 0; ax <= 1; ax++) nodeId[(i + ax) + nnx * ((j + ay) + nny * (k + az))] = 0
    }
    let nNodes = 0
    for (let g = 0; g < nodeId.length; g++) if (nodeId[g] === 0) nodeId[g] = nNodes++
    nDof = nNodes * 3
    const nodeGrid = new Int32Array(nNodes)
    for (let g = 0; g < nodeId.length; g++) { const cId = nodeId[g]; if (cId >= 0) nodeGrid[cId] = g }

    // 边界 + 载荷（同 runVoxelFea）
    const bandTol = (inp.bandTol !== undefined && Number.isFinite(inp.bandTol) && inp.bandTol > 0) ? inp.bandTol : 0.6 * h
    const nF = normalize3(inp.fixed.normal); if (!nF) return fail('固定面法向量为零')
    const nL = normalize3(inp.load.normal); if (!nL) return fail('受力面法向量为零')
    const pF = inp.fixed.point, pL = inp.load.point
    const fixedNode = new Uint8Array(nNodes); const loadList: number[] = []
    for (let cId = 0; cId < nNodes; cId++) {
      const g = nodeGrid[cId]
      const ix = g % nnx, iy = ((g / nnx) | 0) % nny, iz = (g / (nnx * nny)) | 0
      const px = ox + ix * h, py = oy + iy * h, pz = oz + iz * h
      const dF = Math.abs((px - pF[0]) * nF[0] + (py - pF[1]) * nF[1] + (pz - pF[2]) * nF[2])
      const isFixed = dF <= bandTol
      if (isFixed) { fixedNode[cId] = 1; fixedCount++ }
      const dL = Math.abs((px - pL[0]) * nL[0] + (py - pL[1]) * nL[1] + (pz - pL[2]) * nL[2])
      if (dL <= bandTol && !isFixed) loadList.push(cId)
    }
    if (fixedCount < 3) return fail(`固定节点不足（${fixedCount} < 3）`)
    loadCount = loadList.length
    if (loadCount < 1) return fail('受力节点为 0')
    const fixedMask = new Uint8Array(nDof)
    for (let cId = 0; cId < nNodes; cId++) if (fixedNode[cId]) { fixedMask[cId * 3] = 1; fixedMask[cId * 3 + 1] = 1; fixedMask[cId * 3 + 2] = 1 }
    const f = new Float64Array(nDof)
    const fxN = force[0] / loadCount, fyN = force[1] / loadCount, fzN = force[2] / loadCount
    for (const cId of loadList) { f[cId * 3] += fxN; f[cId * 3 + 1] += fyN; f[cId * 3 + 2] += fzN }

    // 单元表 + 中心 + 网格索引
    const elemDofs = new Int32Array(nVox * 24)
    const centers = new Float32Array(nVox * 3)
    const eI = new Int32Array(nVox), eJ = new Int32Array(nVox), eK = new Int32Array(nVox)
    const eAt = new Int32Array(nx * ny * nz).fill(-1)
    let e = 0
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (!solid[i + nx * (j + ny * k)]) continue
      const base = e * 24
      for (let a = 0; a < 8; a++) {
        const ax = a & 1, ay = (a >> 1) & 1, az = (a >> 2) & 1
        const cId = nodeId[(i + ax) + nnx * ((j + ay) + nny * (k + az))]
        elemDofs[base + a * 3] = cId * 3; elemDofs[base + a * 3 + 1] = cId * 3 + 1; elemDofs[base + a * 3 + 2] = cId * 3 + 2
      }
      centers[e * 3] = ox + (i + 0.5) * h; centers[e * 3 + 1] = oy + (j + 0.5) * h; centers[e * 3 + 2] = oz + (k + 0.5) * h
      eI[e] = i; eJ[e] = j; eK[e] = k; eAt[i + nx * (j + ny * k)] = e
      e++
    }

    // 敏度过滤邻居（半径 rmin，权重 = rmin − dist）
    const rCeil = Math.floor(rmin)
    const nbStart = new Int32Array(nVox + 1)
    const nbIdxArr: number[] = [], nbWArr: number[] = []
    for (let el = 0; el < nVox; el++) {
      nbStart[el] = nbIdxArr.length
      const ci = eI[el], cj = eJ[el], ck = eK[el]
      for (let dk = -rCeil; dk <= rCeil; dk++) for (let dj = -rCeil; dj <= rCeil; dj++) for (let di = -rCeil; di <= rCeil; di++) {
        const ni = ci + di, nj = cj + dj, nk = ck + dk
        if (ni < 0 || nj < 0 || nk < 0 || ni >= nx || nj >= ny || nk >= nz) continue
        const ne = eAt[ni + nx * (nj + ny * nk)]
        if (ne < 0) continue
        const dist = Math.sqrt(di * di + dj * dj + dk * dk)
        const w = rmin - dist
        if (w <= 0) continue
        nbIdxArr.push(ne); nbWArr.push(w)
      }
    }
    nbStart[nVox] = nbIdxArr.length
    const nbIdx = Int32Array.from(nbIdxArr), nbW = Float64Array.from(nbWArr)

    // SIMP 迭代
    const Ke0 = buildKe(inp.E, inp.nu, h)
    const xmin = 1e-3, EminRatio = 1e-9
    const x = new Float64Array(nVox).fill(volfrac)
    const dc = new Float64Array(nVox), dcn = new Float64Array(nVox), se = new Float64Array(nVox)
    const factor = new Float64Array(nVox)
    const cgTol = (inp.cgTol && inp.cgTol > 0) ? inp.cgTol : 1e-4
    const cgMax = (inp.maxIter && inp.maxIter > 0) ? Math.floor(inp.maxIter) : 2000
    const ue = new Float64Array(24), Kue = new Float64Array(24)
    const complianceHistory: number[] = []
    let loop = 0, change = 1
    for (loop = 0; loop < maxLoop && change > 0.01; loop++) {
      for (let el = 0; el < nVox; el++) factor[el] = EminRatio + Math.pow(x[el], penal) * (1 - EminRatio)
      const sol = solveCGScaled(nDof, elemDofs, nVox, Ke0, factor, f.slice(), fixedMask, cgTol, cgMax)
      const u = sol.u
      // 单元应变能 se = ueᵀ Ke0 ue + 柔度 + 灵敏度
      let c = 0
      for (let el = 0; el < nVox; el++) {
        const base = el * 24
        for (let d = 0; d < 24; d++) ue[d] = u[elemDofs[base + d]]
        for (let d = 0; d < 24; d++) { const row = d * 24; let s = Ke0[row] * ue[0]; for (let m = 1; m < 24; m++) s += Ke0[row + m] * ue[m]; Kue[d] = s }
        let en = 0; for (let d = 0; d < 24; d++) en += ue[d] * Kue[d]
        se[el] = en
        c += factor[el] * en
        dc[el] = -penal * Math.pow(x[el], penal - 1) * (1 - EminRatio) * en
      }
      complianceHistory.push(c)
      // 敏度过滤
      for (let el = 0; el < nVox; el++) {
        let num = 0, den = 0
        for (let p2 = nbStart[el]; p2 < nbStart[el + 1]; p2++) { const j = nbIdx[p2], w = nbW[p2]; num += w * x[j] * dc[j]; den += w }
        dcn[el] = num / (Math.max(1e-3, x[el]) * den)
      }
      // OC 更新（二分 λ 打体积比）
      let l1 = 1e-9, l2 = 1e9; const move = 0.2; const target = volfrac * nVox
      const xnew = new Float64Array(nVox)
      while ((l2 - l1) / (l1 + l2) > 1e-4) {
        const lmid = 0.5 * (l1 + l2)
        let sum = 0
        for (let el = 0; el < nVox; el++) {
          const be = Math.sqrt(-dcn[el] / lmid)
          let xn = x[el] * be
          xn = Math.min(x[el] + move, Math.min(1, xn))
          xn = Math.max(x[el] - move, Math.max(xmin, xn))
          xnew[el] = xn; sum += xn
        }
        if (sum > target) l1 = lmid; else l2 = lmid
      }
      let ch = 0
      for (let el = 0; el < nVox; el++) { const d = Math.abs(xnew[el] - x[el]); if (d > ch) ch = d; x[el] = xnew[el] }
      change = ch
      prog('topopt', (loop + 1) / maxLoop)
    }

    let finalVol = 0; for (let el = 0; el < nVox; el++) finalVol += x[el]
    finalVol /= nVox
    if (loop >= maxLoop && change > 0.01) warnings.push(`未在 ${maxLoop} 迭代内收敛（密度变化 ${change.toFixed(3)}）`)
    return {
      ok: true, warnings, h, nVox, nDof, centers,
      density: Float32Array.from(x), complianceHistory, volfrac, finalVol,
      iters: loop, fixedCount, loadCount,
    }
  } catch (err) {
    return fail(`内部错误：${err instanceof Error ? err.message : String(err)}`)
  }
}

// =====================================================================================
// 热分析 FEA（稳态导热 steady-state heat conduction）— 标量场体素 FEM。
// 对标 Fusion「热分析（Thermal）」：两个面定温（热/冷），求稳态温度场 + 总热流 Q。
//
// 标量泊松/拉普拉斯：∇·(k∇T)=0，Dirichlet 边界（定温）。8 节点三线性六面体，
// 单元导热矩阵 Kth_e = ∫_V Bθᵀ k Bθ dV（Bθ 3×8 = 温度梯度算子，同 fillB 嘅 dN/dx）。
// 纯 Dirichlet → 提升法（lifting）：T = Tp(定温) + t'，解 K t' = −K·Tp（自由 DOF），
//   matrix-free Jacobi-PCG。总热流 Q = Σ_{热节点}(K·T)（反作用热流，单位 W）。
//
// 单位：长度 mm、k 用 W/(m·K)（内部转 W/(mm·K) ×1e-3）→ Q 得 W。稳态温度场本身同 k 无关
//   （拉普拉斯解只睇几何 + 边界），k 只定热流大小。
// 校验：1D 导热棒（两端定温）→ 温度线性梯度（中点 = 均值）+ Q = k·A·ΔT/L。
// =====================================================================================

/** 标量温度梯度算子 Bθ（3×8，行优先）= [∂N/∂x; ∂N/∂y; ∂N/∂z]。dN 同 fillB。 */
function fillBth(B: Float64Array, xi: number, eta: number, zeta: number, h: number): void {
  B.fill(0)
  const c = 0.25 / h
  for (let a = 0; a < 8; a++) {
    const sx = (a & 1) ? 1 : -1, sy = (a & 2) ? 1 : -1, sz = (a & 4) ? 1 : -1
    B[a] = c * sx * (1 + sy * eta) * (1 + sz * zeta)
    B[8 + a] = c * sy * (1 + sx * xi) * (1 + sz * zeta)
    B[16 + a] = c * sz * (1 + sx * xi) * (1 + sy * eta)
  }
}

/** 8 节点导热单元矩阵 Kth（8×8）= ∫ Bθᵀ k Bθ dV，2×2×2 高斯，均匀立方体边长 h。 */
function buildKth(kmm: number, h: number): Float64Array {
  const Kth = new Float64Array(64)
  const B = new Float64Array(24)
  const g = 1 / Math.sqrt(3), gp = [-g, g], w = (h / 2) * (h / 2) * (h / 2)
  for (const zeta of gp) for (const eta of gp) for (const xi of gp) {
    fillBth(B, xi, eta, zeta, h)
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      let s = 0; for (let r = 0; r < 3; r++) s += B[r * 8 + i] * B[r * 8 + j]
      Kth[i * 8 + j] += kmm * s * w
    }
  }
  return Kth
}

export interface ThermalInput {
  vertices: ArrayLike<number>; triangles: ArrayLike<number>
  hot: PlanePick; cold: PlanePick   // 两个定温面
  Thot: number; Tcold: number       // 温度（°C 或 K，导热只睇差）
  k: number                         // 导热系数 W/(m·K)
  resolution: number
  bandTol?: number; cgTol?: number; maxIter?: number
  onProgress?: (phase: string, frac: number) => void
}
export interface ThermalResult {
  ok: boolean; error?: string; warnings: string[]
  h: number; nVox: number; nNodes: number
  centers: Float32Array            // nVox*3 CAD
  temp: Float32Array               // nVox 体素中心温度
  tMin: number; tMax: number
  heatFlowW: number                // 总热流 Q（W）
  hotCount: number; coldCount: number
  converged: boolean
}

export function runVoxelThermal(inp: ThermalInput): ThermalResult {
  const warnings: string[] = []
  let h = 0, nVox = 0, nNodes = 0, hotCount = 0, coldCount = 0
  const fail = (error: string): ThermalResult => ({
    ok: false, error, warnings, h, nVox, nNodes, centers: new Float32Array(0), temp: new Float32Array(0),
    tMin: 0, tMax: 0, heatFlowW: 0, hotCount, coldCount, converged: false,
  })
  try {
    if (!inp || !inp.vertices || !inp.triangles || inp.vertices.length < 9 || inp.triangles.length < 3) return fail('空网格')
    if (!inp.hot?.point || !inp.hot?.normal || !inp.cold?.point || !inp.cold?.normal) return fail('热/冷面无效')
    if (!Number.isFinite(inp.Thot) || !Number.isFinite(inp.Tcold)) return fail('温度无效')
    if (!Number.isFinite(inp.k) || !(inp.k > 0)) return fail('导热系数 k 无效（需 > 0 W/mK）')
    const prog = (phase: string, frac: number): void => { const cb = inp.onProgress; if (cb) { try { cb(phase, frac) } catch { /* ignore */ } } }
    const res = clampResolution(inp.resolution)

    const grid = voxelize(inp.vertices, inp.triangles, res, (fr) => prog('voxelize', fr))
    h = grid.h; nVox = grid.nVox
    if (!(h > 0)) return fail('包围盒退化')
    if (nVox < 8) return fail(`实体体素不足（${nVox} < 8）`)
    if (nVox > 200000) return fail(`体素过多（${nVox} > 200000）`)
    const { nx, ny, nz, ox, oy, oz, solid } = grid
    const nnx = nx + 1, nny = ny + 1, nnz = nz + 1
    const nodeId = new Int32Array(nnx * nny * nnz).fill(-1)
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (!solid[i + nx * (j + ny * k)]) continue
      for (let az = 0; az <= 1; az++) for (let ay = 0; ay <= 1; ay++) for (let ax = 0; ax <= 1; ax++) nodeId[(i + ax) + nnx * ((j + ay) + nny * (k + az))] = 0
    }
    nNodes = 0
    for (let g = 0; g < nodeId.length; g++) if (nodeId[g] === 0) nodeId[g] = nNodes++
    const nodeGrid = new Int32Array(nNodes)
    for (let g = 0; g < nodeId.length; g++) { const cId = nodeId[g]; if (cId >= 0) nodeGrid[cId] = g }

    // 两温度面带（Dirichlet）
    const bandTol = (inp.bandTol !== undefined && Number.isFinite(inp.bandTol) && inp.bandTol > 0) ? inp.bandTol : 0.6 * h
    const nH = normalize3(inp.hot.normal); if (!nH) return fail('热面法向量为零')
    const nC = normalize3(inp.cold.normal); if (!nC) return fail('冷面法向量为零')
    const pH = inp.hot.point, pC = inp.cold.point
    const Tp = new Float64Array(nNodes)
    const fixedMask = new Uint8Array(nNodes)
    let overlap = 0
    for (let cId = 0; cId < nNodes; cId++) {
      const g = nodeGrid[cId]
      const ix = g % nnx, iy = ((g / nnx) | 0) % nny, iz = (g / (nnx * nny)) | 0
      const px = ox + ix * h, py = oy + iy * h, pz = oz + iz * h
      const dH = Math.abs((px - pH[0]) * nH[0] + (py - pH[1]) * nH[1] + (pz - pH[2]) * nH[2])
      const dC = Math.abs((px - pC[0]) * nC[0] + (py - pC[1]) * nC[1] + (pz - pC[2]) * nC[2])
      const isHot = dH <= bandTol, isCold = dC <= bandTol
      if (isHot && isCold) { overlap++; continue }
      if (isHot) { Tp[cId] = inp.Thot; fixedMask[cId] = 1; hotCount++ }
      else if (isCold) { Tp[cId] = inp.Tcold; fixedMask[cId] = 1; coldCount++ }
    }
    if (overlap > 0) warnings.push(`热/冷带重叠 ${overlap} 节点（已跳过）`)
    if (hotCount < 1 || coldCount < 1) return fail(`定温节点不足（热 ${hotCount} / 冷 ${coldCount}）：面可能未接触实体`)

    // 单元节点表（标量：每节点 1 DOF）
    const elemNodes = new Int32Array(nVox * 8)
    const centers = new Float32Array(nVox * 3)
    let e = 0
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (!solid[i + nx * (j + ny * k)]) continue
      const base = e * 8
      for (let a = 0; a < 8; a++) {
        const ax = a & 1, ay = (a >> 1) & 1, az = (a >> 2) & 1
        elemNodes[base + a] = nodeId[(i + ax) + nnx * ((j + ay) + nny * (k + az))]
      }
      centers[e * 3] = ox + (i + 0.5) * h; centers[e * 3 + 1] = oy + (j + 0.5) * h; centers[e * 3 + 2] = oz + (k + 0.5) * h
      e++
    }

    const kmm = inp.k * 1e-3   // W/(m·K) → W/(mm·K)
    const Kth = buildKth(kmm, h)
    const te = new Float64Array(8)
    const applyKth = (xv: Float64Array, out: Float64Array): void => {
      out.fill(0)
      for (let el = 0; el < nVox; el++) {
        const base = el * 8
        for (let a = 0; a < 8; a++) te[a] = xv[elemNodes[base + a]]
        for (let a = 0; a < 8; a++) { const row = a * 8; let s = Kth[row] * te[0]; for (let m = 1; m < 8; m++) s += Kth[row + m] * te[m]; out[elemNodes[base + a]] += s }
      }
    }

    // 提升：b = −K·Tp（自由项），fixed 清零
    const KTp = new Float64Array(nNodes); applyKth(Tp, KTp)
    const b = new Float64Array(nNodes)
    for (let i = 0; i < nNodes; i++) b[i] = fixedMask[i] ? 0 : -KTp[i]

    // Jacobi 对角
    const diag = new Float64Array(nNodes)
    for (let el = 0; el < nVox; el++) { const base = el * 8; for (let a = 0; a < 8; a++) diag[elemNodes[base + a]] += Kth[a * 9] }
    for (let i = 0; i < nNodes; i++) { if (fixedMask[i] || !(diag[i] > 0)) diag[i] = 1 }

    // 标量 Jacobi-PCG（fixed DOF 全程清零 → t' 喺 fixed 恒 0）
    const cgTol = (inp.cgTol && inp.cgTol > 0) ? inp.cgTol : 1e-7
    const cgMax = (inp.maxIter && inp.maxIter > 0) ? Math.floor(inp.maxIter) : 5000
    const tp = new Float64Array(nNodes), r = new Float64Array(nNodes), z = new Float64Array(nNodes), p = new Float64Array(nNodes), q = new Float64Array(nNodes)
    const applyFree = (xv: Float64Array, out: Float64Array): void => { applyKth(xv, out); for (let i = 0; i < nNodes; i++) if (fixedMask[i]) out[i] = 0 }
    let bn2 = 0; for (let i = 0; i < nNodes; i++) bn2 += b[i] * b[i]
    const bnorm = Math.sqrt(bn2)
    let converged = false
    if (!(bnorm > 0)) { converged = true } else {
      r.set(b); let rz = 0
      for (let i = 0; i < nNodes; i++) { const zi = r[i] / diag[i]; z[i] = zi; rz += r[i] * zi }
      p.set(z)
      for (let it = 1; it <= cgMax; it++) {
        applyFree(p, q)
        let pq = 0; for (let i = 0; i < nNodes; i++) pq += p[i] * q[i]
        if (!(pq > 0)) break
        const alpha = rz / pq; let rn2 = 0
        for (let i = 0; i < nNodes; i++) { tp[i] += alpha * p[i]; const ri = r[i] - alpha * q[i]; r[i] = ri; rn2 += ri * ri }
        if (Math.sqrt(rn2) / bnorm <= cgTol) { converged = true; break }
        let rzn = 0; for (let i = 0; i < nNodes; i++) { const zi = r[i] / diag[i]; z[i] = zi; rzn += r[i] * zi }
        const beta = rzn / rz; rz = rzn
        for (let i = 0; i < nNodes; i++) p[i] = z[i] + beta * p[i]
        if ((it & 63) === 0) prog('solve', it / cgMax)
      }
    }
    if (!converged) warnings.push('热传导 CG 未完全收敛（温度场近似）')

    // T = Tp + t'
    const T = new Float64Array(nNodes)
    for (let i = 0; i < nNodes; i++) T[i] = Tp[i] + tp[i]

    // 总热流 Q = Σ_{热节点}(K·T)（反作用热流，单位 W）
    const KT = new Float64Array(nNodes); applyKth(T, KT)
    let Q = 0
    for (let cId = 0; cId < nNodes; cId++) { const g = nodeGrid[cId]; void g; if (Tp[cId] === inp.Thot && fixedMask[cId]) Q += KT[cId] }
    const heatFlowW = Math.abs(Q)

    // 体素中心温度 + min/max
    const temp = new Float32Array(nVox)
    let tMin = Infinity, tMax = -Infinity
    for (let el = 0; el < nVox; el++) {
      const base = el * 8; let s = 0; for (let a = 0; a < 8; a++) s += T[elemNodes[base + a]]
      const tc = s / 8; temp[el] = tc; if (tc < tMin) tMin = tc; if (tc > tMax) tMax = tc
    }
    prog('solve', 1)
    return { ok: true, warnings, h, nVox, nNodes, centers, temp, tMin, tMax, heatFlowW, hotCount, coldCount, converged }
  } catch (err) {
    return fail(`内部错误：${err instanceof Error ? err.message : String(err)}`)
  }
}

// =====================================================================================
// 耦合热-应力 FEA（thermal stress / 热应力）— 对标 Fusion「Thermal Stress」study。
//
// 两步耦合（单向，弱耦合）：
//   阶段 1：稳态导热求温度场 T[node]（复用 runVoxelThermal 嘅标量 Jacobi-PCG）。
//   阶段 2：温度差产生热膨胀初应变 ε₀=αΔT（各向同性），转等效节点力 f_th，结构 FEM 求 u，
//           应力 σ = D·(B·u_e − ε₀)。
//
// 物理（标准热弹性，各向同性）：
//   · 热初应变 ε₀ = [αΔT, αΔT, αΔT, 0, 0, 0]ᵀ，α = cte×1e-6（cte 系 ×10⁻⁶/°C），
//     ΔT = 单元平均节点温度 − Tref。
//   · 热等效节点力 f_th_e = ∫_V Bᵀ D ε₀ dV（2×2×2 高斯，复用 fillB/buildD），scatter 入全局 f。
//   · 解 K u = f_th（复用 solveCG，力=0，净系热载荷）。
//   · 单元应力 σ = D·(B·u_e − ε₀)。**−ε₀ 减项系关键**：唔减嘅话自由膨胀区会假报满应力、
//     全约束区报得太低。
//
// 关键陷阱：体素化只做一次，标量热节点映射同结构 3-DOF 节点映射用同一个 nodeId 网格
//   （节点编号一致）；cte 记得 ×1e-6（漏咗就差 1e6 倍）。
//
// 校验：100×10×10 钢条两端全固定、均匀 ΔT=50（钢 E=200000、α=12e-6）→ σ=E·α·ΔT≈120 MPa；
//   自由膨胀（净约束刚体）同一 ΔT → σ≈0。
// =====================================================================================

export interface ThermalStressInput {
  vertices: ArrayLike<number>
  triangles: ArrayLike<number>
  fixed: PlanePick                 // 结构夹持面：带内实体节点（默认）全部 DOF 固定
  fixed2?: PlanePick               // 可选第二夹持面（如「双端全约束条」嘅另一端）
  fixed3?: PlanePick               // 可选第三夹持面（自由膨胀用三正交滚子时嘅第三面）
  fixCon?: 'fixed' | 'roller'      // 约束类型：fixed=各夹持面全 DOF 锁（默认）；
                                   //   roller=各面只锁自身法向主轴 DOF（准面内滑）。
                                   //   自由热膨胀校验：三正交滚子面（x/y/z）→ 静定支承 → σ≈0。
  hot: PlanePick                   // 热面（定温）
  cold: PlanePick                  // 冷面（定温）
  Thot: number                     // 热面温度（°C）
  Tcold: number                    // 冷面温度（°C）
  Tref: number                     // 参考（无应力）温度（°C）
  E: number                        // 杨氏模量 MPa (N/mm²)
  nu: number                       // 泊松比
  cte: number                      // 热膨胀系数 ×10⁻⁶/°C（钢 12 → 内部 12e-6）
  k: number                        // 导热系数 W/(m·K)（>0，定温度场拓扑）
  resolution: number               // 最长包围盒轴方向目标体素数（截到 [4,64]）
  bandTol?: number                 // 平面带半厚度，默认 0.6*h
  cgTol?: number                   // 相对残差目标，默认 1e-6
  maxIter?: number                 // 默认 4000
  onProgress?: (phase: string, frac: number) => void   // 'voxelize' | 'thermal' | 'solve' | 'stress'
}

export function runVoxelThermalStress(inp: ThermalStressInput): FeaResult {
  const warnings: string[] = []
  let h = 0, nVox = 0, nDof = 0, fixedCount = 0, loadCount = 0
  const fail = (error: string): FeaResult => ({
    ok: false, error, warnings, h, nVox, nDof,
    centers: new Float32Array(0), vm: new Float32Array(0),
    vmMax: 0, vmMaxAt: [0, 0, 0], dispMax: 0, disp: new Float32Array(0),
    iters: 0, residual: 0, converged: false, fixedCount, loadCount,
  })
  try {
    // ---- 输入校验
    if (!inp || !inp.vertices || !inp.triangles) return fail('空网格（无顶点/三角形数组）')
    if (inp.vertices.length < 9 || inp.triangles.length < 3) return fail('空网格（顶点/三角形不足）')
    if (!Number.isFinite(inp.E) || !(inp.E > 0)) return fail('E 无效（需 > 0）')
    if (!Number.isFinite(inp.nu) || !(inp.nu > -0.999 && inp.nu < 0.499)) return fail('nu 无效（需 -1 < nu < 0.5）')
    if (!Number.isFinite(inp.cte)) return fail('cte 无效（需有限值，×10⁻⁶/°C）')
    if (!Number.isFinite(inp.k) || !(inp.k > 0)) return fail('导热系数 k 无效（需 > 0 W/mK）')
    if (!Number.isFinite(inp.Thot) || !Number.isFinite(inp.Tcold) || !Number.isFinite(inp.Tref)) return fail('温度无效（Thot/Tcold/Tref 需有限）')
    if (!inp.fixed || !inp.fixed.point || !inp.fixed.normal) return fail('fixed 平面无效')
    if (!inp.hot || !inp.hot.point || !inp.hot.normal) return fail('hot 平面无效')
    if (!inp.cold || !inp.cold.point || !inp.cold.normal) return fail('cold 平面无效')

    const prog = (phase: string, frac: number): void => {
      const cb = inp.onProgress
      if (cb) { try { cb(phase, frac) } catch { /* 进度回调出错唔影响计算 */ } }
    }

    const res = clampResolution(inp.resolution)
    if (Number.isFinite(inp.resolution) && Math.round(inp.resolution) !== res) {
      warnings.push(`分辨率 ${inp.resolution} 超出 [4,64]，已用 ${res}`)
    }

    // ---- 1. 体素化（只做一次！标量热 + 结构 3-DOF 共用同一 nodeId 网格 → 节点编号一致）
    const grid = voxelize(inp.vertices, inp.triangles, res, (fr) => prog('voxelize', fr))
    h = grid.h
    nVox = grid.nVox
    if (grid.oddColumns > 0) warnings.push(`奇异列 ${grid.oddColumns} 条（网格边/缝）`)
    if (!(h > 0)) return fail('包围盒退化（网格无体积范围）')
    if (nVox < 8) return fail(`实体体素不足（${nVox} < 8）：请提高 resolution 或检查网格水密性`)
    if (nVox > 80000) return fail(`体素过多（${nVox} > 80000）：请降低 resolution`)

    const { nx, ny, nz, ox, oy, oz, solid } = grid
    const nnx = nx + 1, nny = ny + 1, nnz = nz + 1

    // ---- 2. 节点紧凑映射（同 runVoxelFea；标量热 + 结构两套自由度都由呢个 nodeId 派生）
    const nodeId = new Int32Array(nnx * nny * nnz).fill(-1)
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (!solid[i + nx * (j + ny * k)]) continue
      for (let az = 0; az <= 1; az++) for (let ay = 0; ay <= 1; ay++) for (let ax = 0; ax <= 1; ax++) {
        nodeId[(i + ax) + nnx * ((j + ay) + nny * (k + az))] = 0
      }
    }
    let nNodes = 0
    for (let g = 0; g < nodeId.length; g++) if (nodeId[g] === 0) nodeId[g] = nNodes++
    nDof = nNodes * 3
    const nodeGrid = new Int32Array(nNodes)
    for (let g = 0; g < nodeId.length; g++) { const cId = nodeId[g]; if (cId >= 0) nodeGrid[cId] = g }

    const bandTol = (inp.bandTol !== undefined && Number.isFinite(inp.bandTol) && inp.bandTol > 0)
      ? inp.bandTol : 0.6 * h

    // ---- 3. 单元节点表 + 单元 3-DOF 表 + 中心（同一遍）
    const elemNodes = new Int32Array(nVox * 8)
    const elemDofs = new Int32Array(nVox * 24)
    const centers = new Float32Array(nVox * 3)
    const elemIdx = new Int32Array(nVox * 3)
    {
      let e = 0
      for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        if (!solid[i + nx * (j + ny * k)]) continue
        const nbase = e * 8, dbase = e * 24
        for (let a = 0; a < 8; a++) {
          const ax = a & 1, ay = (a >> 1) & 1, az = (a >> 2) & 1
          const cId = nodeId[(i + ax) + nnx * ((j + ay) + nny * (k + az))]
          elemNodes[nbase + a] = cId
          elemDofs[dbase + a * 3] = cId * 3
          elemDofs[dbase + a * 3 + 1] = cId * 3 + 1
          elemDofs[dbase + a * 3 + 2] = cId * 3 + 2
        }
        centers[e * 3] = ox + (i + 0.5) * h
        centers[e * 3 + 1] = oy + (j + 0.5) * h
        centers[e * 3 + 2] = oz + (k + 0.5) * h
        elemIdx[e * 3] = i; elemIdx[e * 3 + 1] = j; elemIdx[e * 3 + 2] = k
        e++
      }
    }

    // ---- 4. 阶段 1：稳态温度场 T[node]（标量 Dirichlet 提升 + Jacobi-PCG，同 runVoxelThermal）
    const nH = normalize3(inp.hot.normal); if (!nH) return fail('热面法向量为零')
    const nC = normalize3(inp.cold.normal); if (!nC) return fail('冷面法向量为零')
    const pH = inp.hot.point, pC = inp.cold.point
    const Tp = new Float64Array(nNodes)
    const tFixed = new Uint8Array(nNodes)
    let hotCount = 0, coldCount = 0, tOverlap = 0
    for (let cId = 0; cId < nNodes; cId++) {
      const g = nodeGrid[cId]
      const ix = g % nnx, iy = ((g / nnx) | 0) % nny, iz = (g / (nnx * nny)) | 0
      const px = ox + ix * h, py = oy + iy * h, pz = oz + iz * h
      const dH = Math.abs((px - pH[0]) * nH[0] + (py - pH[1]) * nH[1] + (pz - pH[2]) * nH[2])
      const dC = Math.abs((px - pC[0]) * nC[0] + (py - pC[1]) * nC[1] + (pz - pC[2]) * nC[2])
      const isHot = dH <= bandTol, isCold = dC <= bandTol
      if (isHot && isCold) { tOverlap++; continue }
      if (isHot) { Tp[cId] = inp.Thot; tFixed[cId] = 1; hotCount++ }
      else if (isCold) { Tp[cId] = inp.Tcold; tFixed[cId] = 1; coldCount++ }
    }
    if (tOverlap > 0) warnings.push(`热/冷带重叠 ${tOverlap} 节点（已跳过）`)
    if (hotCount < 1 || coldCount < 1) return fail(`定温节点不足（热 ${hotCount} / 冷 ${coldCount}）：热/冷面可能未接触实体（试调 bandTol）`)

    const kmm = inp.k * 1e-3   // W/(m·K) → W/(mm·K)
    const Kth = buildKth(kmm, h)
    const te = new Float64Array(8)
    const applyKth = (xv: Float64Array, out: Float64Array): void => {
      out.fill(0)
      for (let el = 0; el < nVox; el++) {
        const base = el * 8
        for (let a = 0; a < 8; a++) te[a] = xv[elemNodes[base + a]]
        for (let a = 0; a < 8; a++) { const row = a * 8; let s = Kth[row] * te[0]; for (let m = 1; m < 8; m++) s += Kth[row + m] * te[m]; out[elemNodes[base + a]] += s }
      }
    }
    const KTp = new Float64Array(nNodes); applyKth(Tp, KTp)
    const bth = new Float64Array(nNodes)
    for (let i = 0; i < nNodes; i++) bth[i] = tFixed[i] ? 0 : -KTp[i]
    const tdiag = new Float64Array(nNodes)
    for (let el = 0; el < nVox; el++) { const base = el * 8; for (let a = 0; a < 8; a++) tdiag[elemNodes[base + a]] += Kth[a * 9] }
    for (let i = 0; i < nNodes; i++) { if (tFixed[i] || !(tdiag[i] > 0)) tdiag[i] = 1 }
    const thCgTol = (inp.cgTol !== undefined && Number.isFinite(inp.cgTol) && inp.cgTol > 0) ? inp.cgTol : 1e-7
    const thCgMax = (inp.maxIter !== undefined && Number.isFinite(inp.maxIter) && inp.maxIter > 0) ? Math.floor(inp.maxIter) : 5000
    const tpv = new Float64Array(nNodes), tr = new Float64Array(nNodes), tz = new Float64Array(nNodes), tpp = new Float64Array(nNodes), tq = new Float64Array(nNodes)
    const applyTFree = (xv: Float64Array, out: Float64Array): void => { applyKth(xv, out); for (let i = 0; i < nNodes; i++) if (tFixed[i]) out[i] = 0 }
    let thConverged = false
    prog('thermal', 0)
    let bn2 = 0; for (let i = 0; i < nNodes; i++) bn2 += bth[i] * bth[i]
    const bnorm = Math.sqrt(bn2)
    if (!(bnorm > 0)) { thConverged = true } else {
      tr.set(bth); let rz = 0
      for (let i = 0; i < nNodes; i++) { const zi = tr[i] / tdiag[i]; tz[i] = zi; rz += tr[i] * zi }
      tpp.set(tz)
      for (let it = 1; it <= thCgMax; it++) {
        applyTFree(tpp, tq)
        let pq = 0; for (let i = 0; i < nNodes; i++) pq += tpp[i] * tq[i]
        if (!(pq > 0)) break
        const alpha = rz / pq; let rn2 = 0
        for (let i = 0; i < nNodes; i++) { tpv[i] += alpha * tpp[i]; const ri = tr[i] - alpha * tq[i]; tr[i] = ri; rn2 += ri * ri }
        if (Math.sqrt(rn2) / bnorm <= thCgTol) { thConverged = true; break }
        let rzn = 0; for (let i = 0; i < nNodes; i++) { const zi = tr[i] / tdiag[i]; tz[i] = zi; rzn += tr[i] * zi }
        const beta = rzn / rz; rz = rzn
        for (let i = 0; i < nNodes; i++) tpp[i] = tz[i] + beta * tpp[i]
        if ((it & 63) === 0) prog('thermal', it / thCgMax)
      }
    }
    if (!thConverged) warnings.push('热传导 CG 未完全收敛（温度场近似）')
    const T = new Float64Array(nNodes)
    for (let i = 0; i < nNodes; i++) T[i] = Tp[i] + tpv[i]
    prog('thermal', 1)

    // ---- 5. 阶段 2：热膨胀初应变 ε₀ = αΔT；组热等效节点力 f_th = ∫ Bᵀ D ε₀ dV
    const alpha = inp.cte * 1e-6   // ×10⁻⁶/°C → /°C（钢 cte=12 → 12e-6）
    const D = buildD(inp.E, inp.nu)
    const f = new Float64Array(nDof)
    const Bg = new Float64Array(144)
    const ue = new Float64Array(24)
    const g = 1 / Math.sqrt(3), gp = [-g, g]
    const wq = (h / 2) * (h / 2) * (h / 2)
    // ε₀ 体积分量（各向同性），偏量为 0；D·ε₀ 嘅常应力 → Bᵀ(D ε₀)。
    // D ε₀ = [(3λ+2μ)·εv, (3λ+2μ)·εv, (3λ+2μ)·εv, 0,0,0]，εv=αΔT；用 buildD 直接乘最稳。
    const dEps0 = new Float64Array(6)   // D·ε₀
    const eps0 = new Float64Array(6)
    // 单元平均温度 → ΔTe（每单元一个常量；ε₀ 单元内常数 → 高斯各点同值）
    const dTe = new Float64Array(nVox)
    for (let el = 0; el < nVox; el++) {
      const base = el * 8; let s = 0; for (let a = 0; a < 8; a++) s += T[elemNodes[base + a]]
      dTe[el] = s / 8 - inp.Tref
    }
    for (let el = 0; el < nVox; el++) {
      const ev = alpha * dTe[el]
      eps0[0] = ev; eps0[1] = ev; eps0[2] = ev; eps0[3] = 0; eps0[4] = 0; eps0[5] = 0
      for (let r2 = 0; r2 < 6; r2++) { let s = 0; const row = r2 * 6; for (let m = 0; m < 6; m++) s += D[row + m] * eps0[m]; dEps0[r2] = s }
      // f_th_e = ∫ Bᵀ (D ε₀) dV；ε₀ 单元常数 → Σ_gauss wq · Bᵀ dEps0
      ue.fill(0)
      for (const zeta of gp) for (const eta of gp) for (const xi of gp) {
        fillB(Bg, xi, eta, zeta, h)
        for (let c = 0; c < 24; c++) {
          let s = 0
          for (let r2 = 0; r2 < 6; r2++) s += Bg[r2 * 24 + c] * dEps0[r2]
          ue[c] += wq * s
        }
      }
      const base = el * 24
      for (let d = 0; d < 24; d++) f[elemDofs[base + d]] += ue[d]
    }

    // ---- 6. 结构边界（固定带），同 runVoxelFea。支持最多 3 个夹持面 + roller/fixed 模式。
    //   fixed（默认）：每面带内节点全 DOF 锁。
    //   roller：每面净锁自身法向主轴 DOF（轴对齐 voxel → 准面内滑）。三正交滚子 = 静定 → σ≈0。
    const fixCon = inp.fixCon || 'fixed'
    type Band = { n: [number, number, number]; p: [number, number, number]; axis: number }
    const bands: Band[] = []
    const makeBand = (pick: PlanePick | undefined, label: string): true | string => {
      if (!pick || !pick.point || !pick.normal) return true   // 缺省面：跳过
      const nv = normalize3(pick.normal); if (!nv) return `${label} 法向量为零`
      const ax = Math.abs(nv[0]), ay = Math.abs(nv[1]), az = Math.abs(nv[2])
      const axis = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2
      if (fixCon === 'roller' && Math.max(ax, ay, az) < 0.94) {
        warnings.push(`滚子约束法向非轴向（主轴 ${(Math.max(ax, ay, az) * 100).toFixed(0)}%）：已近似为只锁 ${['X', 'Y', 'Z'][axis]} 轴`)
      }
      bands.push({ n: nv, p: pick.point, axis })
      return true
    }
    { const r = makeBand(inp.fixed, '固定面'); if (r !== true) return fail(r) }
    if (inp.fixed2) { const r = makeBand(inp.fixed2, '第二固定面'); if (r !== true) return fail(r) }
    if (inp.fixed3) { const r = makeBand(inp.fixed3, '第三固定面'); if (r !== true) return fail(r) }

    const fixedMask = new Uint8Array(nDof)
    for (let cId = 0; cId < nNodes; cId++) {
      const gg = nodeGrid[cId]
      const ix = gg % nnx, iy = ((gg / nnx) | 0) % nny, iz = (gg / (nnx * nny)) | 0
      const px = ox + ix * h, py = oy + iy * h, pz = oz + iz * h
      let touched = false
      for (const bd of bands) {
        const d = Math.abs((px - bd.p[0]) * bd.n[0] + (py - bd.p[1]) * bd.n[1] + (pz - bd.p[2]) * bd.n[2])
        if (d > bandTol) continue
        touched = true
        if (fixCon === 'fixed') { fixedMask[cId * 3] = 1; fixedMask[cId * 3 + 1] = 1; fixedMask[cId * 3 + 2] = 1 }
        else fixedMask[cId * 3 + bd.axis] = 1   // roller：只锁法向主轴 DOF
      }
      if (touched) fixedCount++
    }
    if (fixedCount < 3) return fail(`固定节点不足（${fixedCount} < 3）：fixed 平面可能未接触实体（试调 bandTol）`)
    // loadCount 记热载荷带节点数（热/冷定温节点）— 同结构 load 概念对应。
    loadCount = hotCount + coldCount

    // ---- 7. 阶段 2 结构求解 K u = f_th
    const Ke = buildKe(inp.E, inp.nu, h)
    const tol = (inp.cgTol !== undefined && Number.isFinite(inp.cgTol) && inp.cgTol > 0) ? inp.cgTol : 1e-6
    const maxIter = (inp.maxIter !== undefined && Number.isFinite(inp.maxIter) && inp.maxIter > 0)
      ? Math.floor(inp.maxIter) : 4000
    prog('solve', 0)
    const sol = solveCG(nDof, elemDofs, nVox, Ke, f, fixedMask, tol, maxIter, (fr) => prog('solve', fr))
    if (!sol.converged) warnings.push(`CG 未收敛：${sol.iters} 次后相对残差 ${sol.residual.toExponential(2)}`)

    // ---- 8. 应力 σ = D·(B·u_e − ε₀)（−ε₀ 减项系关键），von Mises
    prog('stress', 0)
    const Bc = new Float64Array(144); fillB(Bc, 0, 0, 0, h)
    const vm = new Float32Array(nVox)
    const disp = new Float32Array(nVox)
    const dispVec = new Float32Array(nVox * 3)   // S168：热膨胀有符号位移向量（变形形态/动画）
    const uel = new Float64Array(24)
    const strain = new Float64Array(6)
    const stress = new Float64Array(6)
    let vmMax = 0, vmMaxE = 0, vmNonFinite = false
    for (let el = 0; el < nVox; el++) {
      const base = el * 24
      for (let d = 0; d < 24; d++) uel[d] = sol.u[elemDofs[base + d]]
      { let dux = 0, duy = 0, duz = 0; for (let a = 0; a < 8; a++) { dux += uel[a * 3]; duy += uel[a * 3 + 1]; duz += uel[a * 3 + 2] } const ax = dux / 8, ay = duy / 8, az = duz / 8; disp[el] = Math.hypot(ax, ay, az); dispVec[el * 3] = ax; dispVec[el * 3 + 1] = ay; dispVec[el * 3 + 2] = az }
      const ev = alpha * dTe[el]
      for (let r2 = 0; r2 < 6; r2++) {
        let s = 0; const row = r2 * 24
        for (let m = 0; m < 24; m++) s += Bc[row + m] * uel[m]
        // ε_mech = B·u − ε₀（ε₀ 净系前三个法向分量 = αΔT）
        strain[r2] = s - (r2 < 3 ? ev : 0)
      }
      for (let r2 = 0; r2 < 6; r2++) {
        let s = 0; const row = r2 * 6
        for (let m = 0; m < 6; m++) s += D[row + m] * strain[m]
        stress[r2] = s
      }
      const v = vonMises(stress[0], stress[1], stress[2], stress[3], stress[4], stress[5])
      vm[el] = v
      if (!Number.isFinite(v)) vmNonFinite = true
      else if (v > vmMax) { vmMax = v; vmMaxE = el }
      if ((el & 4095) === 0) prog('stress', el / nVox)
    }
    prog('stress', 1)
    if (vmNonFinite) {
      vmMax = NaN
      warnings.push('应力非有限（NaN/Infinity）：数值极端，结果不可信')
    } else if (!Number.isFinite(Math.fround(vmMax))) {
      warnings.push(`应力超出 Float32 上限（vmMax=${vmMax.toExponential(3)} MPa）：vm 数组含 Infinity，云图/数值不可信`)
    }

    let dispMax = 0, dispNonFinite = false
    for (let cId = 0; cId < nNodes; cId++) {
      const d = Math.hypot(sol.u[cId * 3], sol.u[cId * 3 + 1], sol.u[cId * 3 + 2])
      if (!Number.isFinite(d)) dispNonFinite = true
      else if (d > dispMax) dispMax = d
    }
    if (dispNonFinite) {
      dispMax = NaN
      warnings.push('位移非有限（NaN/Infinity）：数值极端，结果不可信')
    }
    const vmMaxAt: [number, number, number] = [
      ox + (elemIdx[vmMaxE * 3] + 0.5) * h,
      oy + (elemIdx[vmMaxE * 3 + 1] + 0.5) * h,
      oz + (elemIdx[vmMaxE * 3 + 2] + 0.5) * h,
    ]

    // 热应力解唔传 wantReaction（热应变 ε₀ 系驱动，K·u 喺固定 DOF 唔等于外加机械载荷）→ 不报支座反力。
    return {
      ok: true, warnings, h, nVox, nDof, centers, vm, vmMax, vmMaxAt, vmMaxE, dispMax, disp, dispVec,
      iters: sol.iters, residual: sol.residual, converged: sol.converged,
      fixedCount, loadCount,
    }
  } catch (err) {
    return fail(`内部错误：${err instanceof Error ? err.message : String(err)}`)
  }
}

// ------------------------------------------------------------------ 测试钩子

export const _internals = {
  runVoxelFea,
  runVoxelModal,
  runVoxelBuckling,
  runTopologyOpt,
  runVoxelThermal,
  runVoxelThermalStress,
  smoothVmNodal,
  voxelize,
  computeOccupancy,
  buildKe,
  buildD,
  fillB,
  vonMises,
  clampResolution,
  hexNodeOffsets: HEX_OFFSETS,
}
