// 3D 物理属性 (Physical Properties) — Fusion "Properties" 面板嘅数学内核。纯函数, 零依赖 (净系
// 可选 three 类型都唔 import), 唔掂 React / store / worker。畀一坨三角形汤 (triangle soup):
//   vertices: 扁平 [x,y,z, x,y,z, ...]  顶点坐标 (mm)
//   triangles: 扁平索引 [i0,i1,i2, ...] 每 3 个一块三角形, 索引 → vertices 嘅顶点
// 算出 体积 / 表面积 / 质心 / 关于质心同原点嘅惯性张量 / 主惯性矩 (+ 畀咗密度就出质量)。
//
// 方法: 散度定理 / 有符号四面体 (Mirtich 1996 "Fast and Accurate Computation of Polyhedral Mass
// Properties" + Eberly "Polyhedral Mass Properties (Revisited)")。核心思想: 体积积分 ∫∫∫ f dV 用散度
// 定理化成面积分 ∮∮ F·n dA, 再逐块三角形精确积分。等价噉讲, 每块三角形同原点 O 围成一个有符号四面体
// (O, A, B, C), 体积/各阶矩 = Σ 单四面体嘅贡献, 符号由三角形绕向 (面法线朝外为正) 决定 —— 内部嗰啲
// 四面体会正负抵消, 净低就系实心多面体嘅积分。要求网格 watertight + 绕向一致朝外先准 (Fusion 实体网格
// 满足); 唔 watertight 嘅汤会有误差但唔会崩。
//
// 各阶矩 (关于原点):
//   V        = (1/6) Σ  a·(b×c)                                   ← 0 阶, 散度定理体积
//   ∫x dV    = (1/24) Σ (a·(b×c)) (ax+bx+cx)                      ← 1 阶 → 质心 = (∫x, ∫y, ∫z)/V
//   ∫x² dV   = (1/60) Σ (a·(b×c)) (ax²+bx²+cx² + ax·bx+bx·cx+cx·ax)  ← 2 阶对角项
//   ∫xy dV   = (1/120) Σ (a·(b×c)) ( 2(ax·ay+bx·by+cx·cy)
//                                   + ax·by+ax·cy + bx·ay+bx·cy + cx·ay+cx·by )  ← 2 阶交叉项
// 呢啲系标准多项式立体积分公式 (对 simplex 精确), Σ 嘅 a·(b×c) (= 6×单四面体体积) 系公因子。
//
// 惯性张量 (固体, 单位密度先, 关于原点 O):
//   Ixx = ∫(y²+z²) dV,  Iyy = ∫(z²+x²) dV,  Izz = ∫(x²+y²) dV
//   Ixy = −∫xy dV, Ixz = −∫xz dV, Iyz = −∫yz dV   (惯性积取负号 — 物理惯例)
// 关于质心嘅张量用平行轴定理由关于原点嘅平移返去:
//   I_c = I_O − m·( |g|²·E₃ − g⊗g )      g = 质心,  m = 质量,  E₃ = 单位阵
// 主惯性矩 = I_c 嘅特征值 (对称 3×3 → 闭式特征值, 升序排), 即关于主轴嘅 3 个转动惯量。
//
// 单位: 坐标 mm。密度 density 单位 g/cm³ (=吨/mm³ 嘅 1e-9 倍, 因为 1 g/cm³ = 1000 kg/m³ = 1e-9
// tonne/mm³)。质量 = ρ·V (tonne, 同 mm/tonne/s 一致单位制), 净系畀咗 density 先返 mass / 惯性带质量。
// 唔畀 density 时惯性张量系 "单位密度固体" 嘅 (即 ∫r²dV, 量纲 mm⁵), 乘返 ρ 就系真惯性。

export type Mat3 = [[number, number, number], [number, number, number], [number, number, number]]

export interface MassProps {
  volume: number          // 体积 (mm³); 退化/空输入 → 0
  area: number            // 表面积 (mm²)
  centroid: [number, number, number]   // 质心 (mm); 体积 0 时 → [0,0,0]
  inertia: Mat3           // 关于质心嘅惯性张量 (3×3, 对称)
  inertiaOrigin: Mat3     // 关于坐标原点嘅惯性张量 (3×3, 对称)
  principalMoments: [number, number, number]  // 主惯性矩 I1≤I2≤I3 (I_c 特征值, 升序)
  mass?: number           // 质量 (tonne) — 净系畀咗 density 先有
}

// g/cm³ → tonne/mm³。1 g/cm³ = 1000 kg/m³, 而 1 tonne/mm³ = 1e12 kg/m³ → 因子 1e-9。
export const GPCM3_TO_TONNE_PER_MM3 = 1e-9

// 全零结果 (退化 / 空输入嘅安全返回)。
function zeroResult(withMass: boolean): MassProps {
  const z3: Mat3 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  const r: MassProps = {
    volume: 0, area: 0, centroid: [0, 0, 0],
    inertia: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
    inertiaOrigin: z3,
    principalMoments: [0, 0, 0],
  }
  if (withMass) r.mass = 0
  return r
}

/**
 * 计算三角形汤嘅物理属性 (体积/面积/质心/惯性/主惯性矩, 可选质量)。
 * @param vertices 扁平顶点 [x,y,z,...] (mm)
 * @param triangles 扁平三角形索引 [i0,i1,i2,...] (每 3 个一块面)
 * @param density  密度 g/cm³ — 畀咗先算质量 + 带质量惯性; 唔畀 → 单位密度惯性, 无 mass 字段
 */
export function computeMassProps(
  vertices: ArrayLike<number>,
  triangles: ArrayLike<number>,
  density?: number,
): MassProps {
  const wantMass = density !== undefined && Number.isFinite(density)

  // —— 守卫: 空 / 唔够一块面 / 索引数唔系 3 嘅倍数 → 安全返零 ——
  if (!vertices || !triangles || triangles.length < 3) return zeroResult(wantMass)
  const nTri = Math.floor(triangles.length / 3)
  const nV = Math.floor(vertices.length / 3)
  if (nTri === 0 || nV === 0) return zeroResult(wantMass)

  // 各阶矩累加器 (关于原点)。用「乘咗常数前」嘅原始 Σ, 最后先除归一化常数 → 减少中间舍入。
  let sixV = 0                                  // Σ a·(b×c)  = 6V
  let mx = 0, my = 0, mz = 0                     // Σ (a·(b×c))·(Σ坐标)  → /24 = ∫x dV ...
  let xx = 0, yy = 0, zz = 0                     // /60 = ∫x²dV ...
  let xy = 0, yz = 0, zx = 0                     // /120 = ∫xy dV ...
  let area2 = 0                                  // Σ |（b−a)×(c−a)|  = 2·总面积

  for (let t = 0; t < nTri; t++) {
    const i0 = triangles[t * 3] | 0
    const i1 = triangles[t * 3 + 1] | 0
    const i2 = triangles[t * 3 + 2] | 0
    // 索引越界 / 负 → 跳过呢块面 (容错, 唔崩)
    if (i0 < 0 || i1 < 0 || i2 < 0 || i0 >= nV || i1 >= nV || i2 >= nV) continue

    const ax = +vertices[i0 * 3], ay = +vertices[i0 * 3 + 1], az = +vertices[i0 * 3 + 2]
    const bx = +vertices[i1 * 3], by = +vertices[i1 * 3 + 1], bz = +vertices[i1 * 3 + 2]
    const cx = +vertices[i2 * 3], cy = +vertices[i2 * 3 + 1], cz = +vertices[i2 * 3 + 2]
    // NaN/Inf 顶点 → 跳过
    if (!Number.isFinite(ax + ay + az + bx + by + bz + cx + cy + cz)) continue

    // 面法线 (未归一) = (b−a)×(c−a); 其模 = 2×三角形面积。
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az
    const nx = e1y * e2z - e1z * e2y
    const ny = e1z * e2x - e1x * e2z
    const nz = e1x * e2y - e1y * e2x
    area2 += Math.hypot(nx, ny, nz)

    // 有符号六倍四面体体积 a·(b×c) = det[a b c]。等同 (a·n') 但呢度直接展开三重积。
    const d = ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)
    sixV += d

    // 1 阶: (Σ坐标)。质心积分公因子。
    mx += d * (ax + bx + cx)
    my += d * (ay + by + cy)
    mz += d * (az + bz + cz)

    // 2 阶对角: Σ p² + Σ_{对} p·q  (即 ax²+bx²+cx² + ax·bx+bx·cx+cx·ax)
    xx += d * (ax * ax + bx * bx + cx * cx + ax * bx + bx * cx + cx * ax)
    yy += d * (ay * ay + by * by + cy * cy + ay * by + by * cy + cy * ay)
    zz += d * (az * az + bz * bz + cz * cz + az * bz + bz * cz + cz * az)

    // 2 阶交叉: 2(ax·ay+bx·by+cx·cy) + (ax·by+ax·cy + bx·ay+bx·cy + cx·ay+cx·by)
    xy += d * (2 * (ax * ay + bx * by + cx * cy)
             + ax * by + ax * cy + bx * ay + bx * cy + cx * ay + cx * by)
    yz += d * (2 * (ay * az + by * bz + cy * cz)
             + ay * bz + ay * cz + by * az + by * cz + cy * az + cy * bz)
    zx += d * (2 * (az * ax + bz * bx + cz * cx)
             + az * bx + az * cx + bz * ax + bz * cx + cz * ax + cz * bx)
  }

  const area = area2 * 0.5
  const volume = sixV / 6

  // 退化 (近零体积 — 平面汤 / 自抵消) → 体积/惯性几乎无意义, 返零但仍报面积。
  if (!Number.isFinite(volume) || Math.abs(volume) < 1e-12) {
    const r = zeroResult(wantMass)
    r.area = Number.isFinite(area) ? area : 0
    return r
  }

  // 1 阶 → 质心。∫x dV = mx/24, 质心 gx = ∫x dV / V = (mx/24)/(sixV/6) = mx/(4·sixV)。
  const gx = mx / (4 * sixV)
  const gy = my / (4 * sixV)
  const gz = mz / (4 * sixV)

  // 2 阶积分 (单位密度, 关于原点)。
  const ixx2 = xx / 60, iyy2 = yy / 60, izz2 = zz / 60   // ∫x²dV, ∫y²dV, ∫z²dV
  const ixy = xy / 120, iyz = yz / 120, izx = zx / 120   // ∫xy dV, ∫yz dV, ∫zx dV

  // 惯性张量分量 (单位密度, 关于原点)。Ixx=∫(y²+z²), 惯性积取负。
  let Oxx = iyy2 + izz2
  let Oyy = izz2 + ixx2
  let Ozz = ixx2 + iyy2
  let Oxy = -ixy, Oyz = -iyz, Ozx = -izx

  // 体积/质量 (用绝对值 — 绕向若整体反咗会令 sixV 负, 物理量取正)。
  const absV = Math.abs(volume)
  // ρ 因子: 畀咗 density 就乘 (tonne/mm³); 否则单位密度 (=1)。
  const rho = wantMass ? (density as number) * GPCM3_TO_TONNE_PER_MM3 : 1
  const mass = rho * absV

  // 关于原点嘅惯性乘返密度 (+ 若 sixV<0 即绕向反, 各阶矩都带咗负号 → 乘 sign 修正)。
  const sign = sixV < 0 ? -1 : 1
  Oxx *= rho * sign; Oyy *= rho * sign; Ozz *= rho * sign
  Oxy *= rho * sign; Oyz *= rho * sign; Ozx *= rho * sign

  const inertiaOrigin: Mat3 = [
    [Oxx, Oxy, Ozx],
    [Oxy, Oyy, Oyz],
    [Ozx, Oyz, Ozz],
  ]

  // 平行轴定理: 由原点平移到质心。I_c = I_O − m( |g|²E − g⊗g )。
  //   对角: Cxx = Oxx − m(gy²+gz²); 交叉: Cxy = Oxy + m·gx·gy (注意符号 — 惯性积已取负号惯例)。
  const gx2 = gx * gx, gy2 = gy * gy, gz2 = gz * gz
  const Cxx = Oxx - mass * (gy2 + gz2)
  const Cyy = Oyy - mass * (gz2 + gx2)
  const Czz = Ozz - mass * (gx2 + gy2)
  const Cxy = Oxy + mass * gx * gy
  const Cyz = Oyz + mass * gy * gz
  const Czx = Ozx + mass * gz * gx

  const inertia: Mat3 = [
    [Cxx, Cxy, Czx],
    [Cxy, Cyy, Cyz],
    [Czx, Cyz, Czz],
  ]

  // 主惯性矩 = 关于质心张量嘅特征值 (升序)。
  const principalMoments = symmetricEigenvalues(Cxx, Cyy, Czz, Cxy, Cyz, Czx)

  const result: MassProps = {
    volume: absV,
    area,
    centroid: [gx, gy, gz],
    inertia,
    inertiaOrigin,
    principalMoments,
  }
  if (wantMass) result.mass = mass
  return result
}

// 对称 3×3 矩阵特征值嘅闭式解 (Smith 1961 / Wikipedia "Eigenvalue algorithm" 三角法)。比通用迭代法
// 快又稳, 对称阵特征值必实。输入: 对角 a,b,c + 非对角 d=M01, e=M12, f=M02。返回升序 [λ1,λ2,λ3]。
function symmetricEigenvalues(
  a: number, b: number, c: number,  // M00, M11, M22
  d: number, e: number, f: number,  // M01, M12, M02
): [number, number, number] {
  // 非对角近零 → 直接系对角元 (避开三角法喺各向同性时嘅 0/0)。
  const off = Math.abs(d) + Math.abs(e) + Math.abs(f)
  const scale = Math.abs(a) + Math.abs(b) + Math.abs(c) + 1
  if (off < 1e-14 * scale) {
    return [a, b, c].sort((x, y) => x - y) as [number, number, number]
  }
  // p1 = 非对角平方和; q = trace/3 (均值)。
  const p1 = d * d + e * e + f * f
  const q = (a + b + c) / 3
  const p2 = (a - q) ** 2 + (b - q) ** 2 + (c - q) ** 2 + 2 * p1
  const p = Math.sqrt(p2 / 6)
  // B = (M − qI)/p, 计 det(B)/2 = r ∈ [−1,1] → 角度 φ。
  const invp = 1 / p
  const b00 = (a - q) * invp, b11 = (b - q) * invp, b22 = (c - q) * invp
  const b01 = d * invp, b12 = e * invp, b02 = f * invp
  // det 对称阵: b00(b11·b22 − b12²) − b01(b01·b22 − b12·b02) + b02(b01·b12 − b11·b02)
  const det =
    b00 * (b11 * b22 - b12 * b12) -
    b01 * (b01 * b22 - b12 * b02) +
    b02 * (b01 * b12 - b11 * b02)
  let r = det / 2
  if (r <= -1) r = -1
  else if (r >= 1) r = 1
  const phi = Math.acos(r) / 3
  // 三个特征值 (eig1 ≥ eig2 ≥ eig3)。
  const eig1 = q + 2 * p * Math.cos(phi)
  const eig3 = q + 2 * p * Math.cos(phi + (2 * Math.PI) / 3)
  const eig2 = 3 * q - eig1 - eig3   // trace 守恒 → 第二个由和反推 (数值更稳)
  return [eig3, eig2, eig1]          // 升序
}
