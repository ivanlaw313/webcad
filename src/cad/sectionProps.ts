// sectionProps.ts — 2D 截面几何属性（Fusion「草图 → 截面属性 Section Properties」对标）
//
// 输入：一组【闭合多边形】loops（每个是一串 [x,y] 顶点；首尾隐式闭合，唔需重复首点）。
//   loops[0] 系外轮廓，之后任何 loop 当【孔】处理（同 Fusion 的 profile 一致：第一个是实体，
//   其余挖空）。孔以【符号面积】自动减去 —— 我哋唔强求调用方畀正确绕向，而系用每个 loop 的
//   有符号面积的【绝对值】，再按「index 0 = 加、其余 = 减」叠加，所以孔嘅点序点都得。
//
// 输出（全部是【几何】量，未乘密度/厚度；面积 mm²、二阶矩 mm⁴）：
//   area               净面积（外轮廓 − 各孔）
//   centroid [x,y]     形心（面积加权）
//   Ixx, Iyy, Ixy      关于【形心】的二阶面积矩（截面惯性矩 / 惯性积）
//   Ixx0, Iyy0, Ixy0   关于【原点】的二阶面积矩
//   principal {I1,I2,angleDeg}  主惯性矩（I1≥I2）及主轴相对 x 轴的角度（度，−45..45）
//   perimeter          所有 loop 周长之和（外轮廓 + 孔边界）
//
// 全部用标准【鞋带（shoelace / Green 定理）】公式 —— 对任意简单多边形精确（非数值积分）：
//   有符号面积   A  = ½ Σ (xᵢ·yᵢ₊₁ − xᵢ₊₁·yᵢ)
//   一阶矩       (∫x dA, ∫y dA) → 形心 Cx = (1/6A) Σ (xᵢ+xᵢ₊₁)(xᵢ·yᵢ₊₁ − xᵢ₊₁·yᵢ) 等
//   二阶矩（关于原点）
//     ∫x² dA = (1/12) Σ (xᵢ² + xᵢ·xᵢ₊₁ + xᵢ₊₁²)·cr        → Iyy0（绕 y 轴 = ∫x²dA）
//     ∫y² dA = (1/12) Σ (yᵢ² + yᵢ·yᵢ₊₁ + yᵢ₊₁²)·cr        → Ixx0（绕 x 轴 = ∫y²dA）
//     ∫xy dA = (1/24) Σ (xᵢ·yᵢ₊₁ + 2xᵢyᵢ + 2xᵢ₊₁yᵢ₊₁ + xᵢ₊₁·yᵢ)·cr   → Ixy0
//   其中 cr = (xᵢ·yᵢ₊₁ − xᵢ₊₁·yᵢ)。以上公式对【逆时针（A>0）】给正值；我哋逐 loop 用
//   |signed| 再按 加/减 叠加，等价于「面积、矩 都对孔取负」（孔即从实体扣除其全部贡献）。
//   形心移轴用平行轴定理：Ixx = Ixx0 − A·Cy²，Iyy = Iyy0 − A·Cx²，Ixy = Ixy0 − A·Cx·Cy。
//   主惯性矩（Mohr 圆）：I1,2 = (Ixx+Iyy)/2 ± √(((Ixx−Iyy)/2)² + Ixy²)，
//                       角度 θ = ½·atan2(−2·Ixy, Ixx−Iyy)。
//
// ⚠ 诚实边界：
//   • 假设各 loop 系【简单多边形】（边唔自交）且孔【完全落喺】外轮廓内、彼此唔重叠 —— 同
//     Fusion profile 一致。重叠/自交几何会畀错值（鞋带对此本就无定义）。
//   • 圆弧/样条要先离散成折线再传入（呢个模块只做多边形；离散越密越准）。
//   • 纯几何：唔含厚度/密度。要质量属性自行乘 (厚度·密度)；要惯性张量再乘对应量纲。
//
// 纯函数、零 import、无副作用、唔掂 React/store/worker —— 任何模块可安全引用。

export type Pt2 = [number, number]

export interface SectionProps {
  area: number                 // 净面积 mm²（>0；外轮廓 − 孔）
  centroid: Pt2                // 形心 [x,y]
  Ixx: number                  // 关于形心、绕 x 轴：∫(y−Cy)² dA
  Iyy: number                  // 关于形心、绕 y 轴：∫(x−Cx)² dA
  Ixy: number                  // 关于形心 惯性积：∫(x−Cx)(y−Cy) dA
  Ixx0: number                 // 关于原点：∫y² dA
  Iyy0: number                 // 关于原点：∫x² dA
  Ixy0: number                 // 关于原点：∫xy dA
  principal: { I1: number; I2: number; angleDeg: number }  // 主惯性矩（I1≥I2）+ 主轴角(度)
  perimeter: number            // 各 loop 周长之和（外轮廓 + 孔）
}

// 单个 loop 的鞋带累加量（全部关于【原点】，按【逆时针为正】的符号）。
// 返回 { A, Mx, My, Ixx0, Iyy0, Ixy0, peri }，其中 A>0 表逆时针。
// 调用方按需对 |A| 取加/减；本函数只忠实算该 loop 的有符号几何量。
interface LoopAccum { A: number; Mx: number; My: number; Ixx0: number; Iyy0: number; Ixy0: number; peri: number }
function loopAccum(loop: Pt2[]): LoopAccum {
  const n = loop.length
  let A = 0, Mx = 0, My = 0, Ixx0 = 0, Iyy0 = 0, Ixy0 = 0, peri = 0
  if (n < 3) return { A, Mx, My, Ixx0, Iyy0, Ixy0, peri: 0 }  // 退化（点/线段）：无面积，周长亦无意义
  for (let i = 0; i < n; i++) {
    const [xi, yi] = loop[i]
    const [xj, yj] = loop[(i + 1) % n]       // 下一点（末点接回首点 → 隐式闭合）
    const cr = xi * yj - xj * yi             // 叉积项 = 2× 该边对三角面积的贡献
    A += cr
    // 一阶矩：∫x dA、∫y dA（最终 /6A 得形心；这里先累加 6× 的分子）
    Mx += (xi + xj) * cr                     // → ∫x dA = Mx/6（注意此为 ∫x dA 的 6 倍）
    My += (yi + yj) * cr                     // → ∫y dA = My/6
    // 二阶矩（关于原点），系数见文件头；这里累加 cr 加权的二次项
    Iyy0 += (xi * xi + xi * xj + xj * xj) * cr            // ∫x² dA = Iyy0/12 → 绕 y 轴
    Ixx0 += (yi * yi + yi * yj + yj * yj) * cr            // ∫y² dA = Ixx0/12 → 绕 x 轴
    Ixy0 += (xi * yj + 2 * xi * yi + 2 * xj * yj + xj * yi) * cr  // ∫xy dA = Ixy0/24
    // 周长：边长之和
    peri += Math.hypot(xj - xi, yj - yi)
  }
  // 归一化到真正的积分值（除掉上面省下的常数因子）
  return {
    A: A / 2,
    Mx: Mx / 6,          // = ∫x dA（有符号，逆时针为正）
    My: My / 6,          // = ∫y dA
    Ixx0: Ixx0 / 12,     // = ∫y² dA
    Iyy0: Iyy0 / 12,     // = ∫x² dA
    Ixy0: Ixy0 / 24,     // = ∫xy dA
    peri,
  }
}

// 主入口：见文件头。loops[0]=外轮廓，其余=孔（自动扣除）。
// S186：可选 signs[k]（+1=实体 / −1=孔）—— 由调用方按【嵌套深度奇偶】算（多体/嵌套岛正确）；缺省回落「index 0 = 实体，其余 = 孔」（旧行为，逐字节兼容）。
export function sectionProps(loops: Pt2[][], signs?: number[]): SectionProps {
  // 逐 loop 算几何量并按「实体=+、孔=−」叠加。我哋统一把每个 loop 的有符号量【转成逆时针
  // 正向】（乘 sign(A)），再用 signs[k]（缺省 index-0 规则）决定加减。咁样无论调用方传嘅孔系顺/逆时针都正确。
  let A = 0, Mx = 0, My = 0, Ixx0 = 0, Iyy0 = 0, Ixy0 = 0, perimeter = 0
  for (let k = 0; k < loops.length; k++) {
    const a = loopAccum(loops[k])
    if (Number.isFinite(a.peri)) perimeter += a.peri   // 审计修复：NaN 顶点 → a.peri=NaN，无守卫会令周长读数变「NaN mm」（area/Ixx 已有 isFinite 守卫，周长漏咗）
    if (!Number.isFinite(a.A) || Math.abs(a.A) < 1e-12) continue   // 退化 loop（面积≈0）或【非有限】（NaN/Inf 点 → NaN 面积；NaN<1e-12 系 false 唔会跳，要显式 isFinite 否则污染全部矩）：除周长外无贡献
    const ccw = a.A > 0 ? 1 : -1              // 把该 loop 量翻到「逆时针正」标架
    const sign = (signs ? signs[k] : (k === 0 ? 1 : -1)) * ccw     // 实体 +，孔 −；再消去原始绕向
    A += sign * a.A
    Mx += sign * a.Mx
    My += sign * a.My
    Ixx0 += sign * a.Ixx0
    Iyy0 += sign * a.Iyy0
    Ixy0 += sign * a.Ixy0
  }

  // 形心（面积加权）。A≈0（空/自抵消）时退回原点，避免除零。
  const Cx = Math.abs(A) > 1e-12 ? Mx / A : 0
  const Cy = Math.abs(A) > 1e-12 ? My / A : 0

  // 平行轴定理：把关于原点的二阶矩搬到形心。
  //   Ixx = ∫(y−Cy)² dA = Ixx0 − A·Cy²
  //   Iyy = ∫(x−Cx)² dA = Iyy0 − A·Cx²
  //   Ixy = ∫(x−Cx)(y−Cy) dA = Ixy0 − A·Cx·Cy
  const Ixx = Ixx0 - A * Cy * Cy
  const Iyy = Iyy0 - A * Cx * Cx
  const Ixy = Ixy0 - A * Cx * Cy

  // 主惯性矩（Mohr 圆）。avg ± R，R = √(((Ixx−Iyy)/2)² + Ixy²)。I1≥I2。
  const avg = (Ixx + Iyy) / 2
  const diff = (Ixx - Iyy) / 2
  const R = Math.hypot(diff, Ixy)
  const I1 = avg + R
  const I2 = avg - R
  // 主轴角 = 【I1（最大主惯性矩）轴】相对 x 轴的角度（度，−90..90），同 Fusion 报告方向一致。
  // 关键：主轴方向系【物理惯性张量】M = [[Ixx, −Ixy],[−Ixy, Iyy]] 的特征向量（注意 off-diagonal
  // 系 −Ixy，因 Ixy 这里存的系 +∫xy；物理惯性张量惯例用 −∫xy）。用 +Ixy 会令角度【符号翻转】
  // —— 任何 Ixy≠0 的截面（如旋转过的宽扁矩形）报错方向。最大特征值 I1 对应特征向量满足
  // (Ixx−I1)·vx − Ixy·vy = 0 → 方向 (−Ixy, I1−Ixx)（亦等价 (I1−Iyy, −Ixy)）。
  // 取两式中模较大者，避免各向同性时 0/0。归一化到 (−90,90]（主轴 ±180° 同一条线）。
  let angleDeg: number
  const ev1x = -Ixy, ev1y = I1 - Ixx      // 特征向量候选 A（物理张量 off-diag = −Ixy）
  const ev2x = I1 - Iyy, ev2y = -Ixy      // 特征向量候选 B（数值上互补，取模大者更稳）
  if (Math.hypot(ev1x, ev1y) >= Math.hypot(ev2x, ev2y)) {
    angleDeg = Math.atan2(ev1y, ev1x) * (180 / Math.PI)
  } else {
    angleDeg = Math.atan2(ev2y, ev2x) * (180 / Math.PI)
  }
  // 各向同性（Ixx≈Iyy 且 Ixy≈0，如正方形/圆）→ 两候选都≈0 → atan2(0,0)=0：主轴退化，
  // 任意方向皆主轴，返回 0° 系合理约定。规整到 (−90,90]（主轴 ±180° 同一条线）。
  if (angleDeg > 90) angleDeg -= 180
  else if (angleDeg <= -90) angleDeg += 180

  return {
    area: Math.abs(A),                        // 面积对外永远取正（净实体）
    centroid: [Cx, Cy],
    Ixx, Iyy, Ixy,
    Ixx0, Iyy0, Ixy0,
    principal: { I1, I2, angleDeg },
    perimeter,
  }
}
