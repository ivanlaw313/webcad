// 定向最小包围盒 (Oriented Minimum Bounding Box, OBB) — Fusion "Oriented Bounding Box" 嘅数学内核, 服务
// 排样 (nesting) / 包装 (packaging) / 备料 (stock) 嘅最省料定向。纯函数, 零依赖 (唔 import three / 唔掂
// React / store / worker), 净系食一坨顶点云:
//   vertices: 扁平 [x,y,z, x,y,z, ...]  顶点坐标 (mm)
// 返回一个定向盒: 中心 / 三条正交轴 / 半边长 / 尺寸 / 体积。
//
// ⚠ 方法 = PCA-OBB (主成分分析定向盒), 系 *近似* 最小体积, **唔保证全局最优**。真·最小体积定向盒系
// NP-难度边界以下嘅难题; 精确解 (O'Rourke 1985 旋转卡壳三维版) 系 O(n³), 实现复杂且对退化输入脆。工业
// CAD (含 Fusion 嘅快算) 通常都用 PCA 或其变体做 *快而够好* 嘅近似 —— 对自然零件 (有明确长/宽/厚趋势)
// 出嘅盒同最优盒好接近; 对刻意构造嘅病态云 (e.g. 顶点集中喺角落令协方差偏) 可能偏大几个百分点。本模块
// 老实承认呢点: 要 *证明* 最优请另寻精确算法, 呢度求嘅系 nesting/stock 够用嘅快近似。
//
// 算法 (标准 PCA-OBB):
//   1. 算质心 (顶点均值) μ, 中心化。
//   2. 砌 3×3 协方差矩阵 C = (1/N) Σ (v−μ)(v−μ)ᵀ  (对称半正定)。
//   3. C 嘅特征向量 = 点云三条主方向 (方差最大→最细)。取做盒嘅候选正交轴 (单位正交基)。
//   4. 把所有顶点投影落呢三条轴, 各轴量度 [min,max] → 半边长 + 沿轴中心偏移。
//   5. 盒中心 = μ + Σ axis_i · (mid_i)  (因为投影区间未必对称于 μ, 要补返中点偏移)。
//
// 退化 (degenerate) 输入 graceful 处理:
//   - 0 / 1 个点          → 零盒 (中心喺该点或原点, 轴=世界基, 半边=0)。
//   - 共线 (collinear)    → 协方差秩 1, 一条特征值主导, 另两条≈0; 特征向量退化 → 用正交补凑足正交基。
//   - 共面 (coplanar)     → 协方差秩 2, 一条特征值≈0; 法向用另两轴叉积补返。
//   退化时盒会有 0 厚度 (half=0 沿退化轴), 体积=0, 但轴照样输出一组正交基, 唔会 NaN / 唔崩。
//
// 单位: 坐标 mm; 体积 mm³。无依赖, 自带细个 3×3 对称特征求解器 (特征值闭式 + 特征向量由零空间/叉积构造)。

export interface OrientedBox {
  center: [number, number, number]                                            // 盒几何中心 (mm)
  axes: [[number, number, number], [number, number, number], [number, number, number]]
  // ↑ 三条正交单位轴, **按列**: axes[k] = 第 k 条轴 (xk,yk,zk)。即 axes[0]/axes[1]/axes[2] 各系一个单位
  //   向量, 三者两两正交、右手系。盒嘅角点 = center ± Σ axes[k]·half[k]。
  half: [number, number, number]                                              // 沿三轴半边长 (mm, ≥0)
  size: [number, number, number]                                              // 沿三轴全长 = 2·half (mm)
  volume: number                                                              // 盒体积 = size.x·size.y·size.z
}

// 主入口: 顶点云 → 定向最小 (近似) 包围盒。vertices 系扁平 [x,y,z,...]。
// 非有限坐标 (NaN/Inf) 会被跳过, 唔污染统计。
export function orientedBBox(vertices: number[]): OrientedBox {
  // ── 收集有效顶点 + 算质心 ──────────────────────────────────────────────
  const n = Math.floor(vertices.length / 3)
  let cx = 0, cy = 0, cz = 0
  let count = 0
  for (let i = 0; i < n; i++) {
    const x = vertices[3 * i], y = vertices[3 * i + 1], z = vertices[3 * i + 2]
    if (!isFinite(x) || !isFinite(y) || !isFinite(z)) continue
    cx += x; cy += y; cz += z; count++
  }

  // 空 / 全无效 → 退化零盒 (世界基)。
  if (count === 0) return identityBox(0, 0, 0)
  cx /= count; cy /= count; cz /= count

  // 单点 → 零盒喺该点。
  if (count === 1) return identityBox(cx, cy, cz)

  // ── 协方差矩阵 (对称) ──────────────────────────────────────────────────
  // C = (1/N) Σ (v−μ)(v−μ)ᵀ。只需上三角: xx,yy,zz,xy,yz,zx。
  let xx = 0, yy = 0, zz = 0, xy = 0, yz = 0, zx = 0
  for (let i = 0; i < n; i++) {
    const x = vertices[3 * i], y = vertices[3 * i + 1], z = vertices[3 * i + 2]
    if (!isFinite(x) || !isFinite(y) || !isFinite(z)) continue
    const dx = x - cx, dy = y - cy, dz = z - cz
    xx += dx * dx; yy += dy * dy; zz += dz * dz
    xy += dx * dy; yz += dy * dz; zx += dz * dx
  }
  const inv = 1 / count
  xx *= inv; yy *= inv; zz *= inv; xy *= inv; yz *= inv; zx *= inv

  // ── 特征分解 → 三条主轴 (正交单位基) ──────────────────────────────────
  // 协方差全零 (所有有效点重合) → 退化零盒。
  const traceMag = Math.abs(xx) + Math.abs(yy) + Math.abs(zz)
  if (traceMag < 1e-30) return identityBox(cx, cy, cz)

  const axes = symmetricEigenvectors(xx, yy, zz, xy, yz, zx)

  // ── 沿每条轴投影所有顶点, 量度 [min,max] ──────────────────────────────
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < n; i++) {
    const x = vertices[3 * i], y = vertices[3 * i + 1], z = vertices[3 * i + 2]
    if (!isFinite(x) || !isFinite(y) || !isFinite(z)) continue
    // 用相对质心嘅坐标投影 (数值更稳), 中心偏移之后补返。
    const dx = x - cx, dy = y - cy, dz = z - cz
    for (let k = 0; k < 3; k++) {
      const a = axes[k]
      const p = dx * a[0] + dy * a[1] + dz * a[2]
      if (p < min[k]) min[k] = p
      if (p > max[k]) max[k] = p
    }
  }

  // ── 砌盒: 半边长 = 区间一半; 中心 = μ + Σ axis_k·mid_k ────────────────
  const half: [number, number, number] = [0, 0, 0]
  const mid = [0, 0, 0]
  for (let k = 0; k < 3; k++) {
    half[k] = Math.max(0, (max[k] - min[k]) / 2)
    mid[k] = (max[k] + min[k]) / 2   // 投影区间中点 (相对质心), 通常非零 → 要补返中心
  }
  const center: [number, number, number] = [
    cx + axes[0][0] * mid[0] + axes[1][0] * mid[1] + axes[2][0] * mid[2],
    cy + axes[0][1] * mid[0] + axes[1][1] * mid[1] + axes[2][1] * mid[2],
    cz + axes[0][2] * mid[0] + axes[1][2] * mid[1] + axes[2][2] * mid[2],
  ]
  const size: [number, number, number] = [2 * half[0], 2 * half[1], 2 * half[2]]
  const volume = size[0] * size[1] * size[2]

  return { center, axes, half, size, volume }
}

// 退化零盒 helper: 中心喺 (x,y,z), 轴=世界单位基, 半边/尺寸/体积全 0。
function identityBox(x: number, y: number, z: number): OrientedBox {
  return {
    center: [x, y, z],
    axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    half: [0, 0, 0],
    size: [0, 0, 0],
    volume: 0,
  }
}

// ── 3×3 对称矩阵特征向量 ───────────────────────────────────────────────
// 输入对称阵 (上三角): 对角 a=M00,b=M11,c=M22; 非对角 d=M01,e=M12,f=M02。
// 返回三条正交单位特征向量 (按列 [v0,v1,v2]), 按特征值 *降序* 排 (方差最大→最细) — 即 v0 系点云最长方向。
// 做法: 先闭式解特征值 (Smith 1961 三角法, 同 massProps 一致), 再逐个由 (M − λI) 嘅零空间取特征向量;
// 对重根 / 退化用叉积补足正交基。全程 graceful, 唔会出 NaN。
function symmetricEigenvectors(
  a: number, b: number, c: number,   // M00, M11, M22
  d: number, e: number, f: number,   // M01, M12, M02
): [[number, number, number], [number, number, number], [number, number, number]] {
  const evals = symmetricEigenvalues(a, b, c, d, e, f)   // 升序 [λ1,λ2,λ3]
  // 降序处理 (盒第一轴=最大方差方向)。
  const lambdas = [evals[2], evals[1], evals[0]]

  const M: number[][] = [
    [a, d, f],
    [d, b, e],
    [f, e, c],
  ]

  const vecs: [number, number, number][] = []
  for (let k = 0; k < 3; k++) {
    const v = eigenvectorFor(M, lambdas[k])
    vecs.push(v)
  }

  // ── 正交化 + 退化补全 ──
  // 病态 / 重根时, 单纯逐个解出嘅向量未必两两正交 (重特征值嘅特征空间任意基)。用 Gram–Schmidt 强制正交,
  // 遇到退化 (某向量≈0 或同前者共线) 就用前两轴叉积 / 任意正交补凑返合法右手正交基。
  const o0 = normalizeOr(vecs[0], [1, 0, 0])
  let o1 = sub(vecs[1], scale(o0, dot(vecs[1], o0)))   // 去掉 o0 分量
  o1 = normalizeOr(o1, anyPerp(o0))
  // 第三轴直接由前两轴叉积保证右手正交。
  let o2 = cross(o0, o1)
  o2 = normalizeOr(o2, anyPerp(o0))
  // 再叉一次令 o1 严格正交于 o0/o2 (修浮点漂移), 保持右手。
  o1 = cross(o2, o0)

  return [o0, o1, o2]
}

// 解 (M − λI)x = 0 嘅单位特征向量。做法: 取 (M − λI) 三行嘅两两叉积, 边个最长边个就系零空间方向
// (因为 M−λI 秩 ≤ 2, 行向量张成嘅平面法向 = 零空间)。重根 → 行接近共线, 叉积细 → 回退由调用方补全。
function eigenvectorFor(M: number[][], lambda: number): [number, number, number] {
  const r0: [number, number, number] = [M[0][0] - lambda, M[0][1], M[0][2]]
  const r1: [number, number, number] = [M[1][0], M[1][1] - lambda, M[1][2]]
  const r2: [number, number, number] = [M[2][0], M[2][1], M[2][2] - lambda]
  const c01 = cross(r0, r1)
  const c02 = cross(r0, r2)
  const c12 = cross(r1, r2)
  const n01 = len2(c01), n02 = len2(c02), n12 = len2(c12)
  let best = c01, bn = n01
  if (n02 > bn) { best = c02; bn = n02 }
  if (n12 > bn) { best = c12; bn = n12 }
  if (bn < 1e-24) return [0, 0, 0]   // 退化 → 交畀调用方补全
  return best
}

// 对称 3×3 矩阵特征值嘅闭式解 (Smith 1961 / Wikipedia "Eigenvalue algorithm" 三角法)。同 massProps.ts
// 嗰个一致 (此模块要零依赖、自洽, 故内联唔 import)。输入对角 a,b,c + 非对角 d=M01,e=M12,f=M02。
// 返回升序 [λ1,λ2,λ3]。对称阵特征值必实。
function symmetricEigenvalues(
  a: number, b: number, c: number,
  d: number, e: number, f: number,
): [number, number, number] {
  const off = Math.abs(d) + Math.abs(e) + Math.abs(f)
  const scaleN = Math.abs(a) + Math.abs(b) + Math.abs(c) + 1
  if (off < 1e-14 * scaleN) {
    return [a, b, c].sort((x, y) => x - y) as [number, number, number]
  }
  const p1 = d * d + e * e + f * f
  const q = (a + b + c) / 3
  const p2 = (a - q) ** 2 + (b - q) ** 2 + (c - q) ** 2 + 2 * p1
  const p = Math.sqrt(p2 / 6)
  const invp = 1 / p
  const b00 = (a - q) * invp, b11 = (b - q) * invp, b22 = (c - q) * invp
  const b01 = d * invp, b12 = e * invp, b02 = f * invp
  const det =
    b00 * (b11 * b22 - b12 * b12) -
    b01 * (b01 * b22 - b12 * b02) +
    b02 * (b01 * b12 - b11 * b02)
  let r = det / 2
  if (r <= -1) r = -1
  else if (r >= 1) r = 1
  const phi = Math.acos(r) / 3
  const eig1 = q + 2 * p * Math.cos(phi)
  const eig3 = q + 2 * p * Math.cos(phi + (2 * Math.PI) / 3)
  const eig2 = 3 * q - eig1 - eig3
  return [eig3, eig2, eig1]   // 升序
}

// ── 细个向量 helper (内联, 零依赖) ────────────────────────────────────
function dot(u: [number, number, number], v: [number, number, number]): number {
  return u[0] * v[0] + u[1] * v[1] + u[2] * v[2]
}
function cross(u: [number, number, number], v: [number, number, number]): [number, number, number] {
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
}
function sub(u: [number, number, number], v: [number, number, number]): [number, number, number] {
  return [u[0] - v[0], u[1] - v[1], u[2] - v[2]]
}
function scale(u: [number, number, number], s: number): [number, number, number] {
  return [u[0] * s, u[1] * s, u[2] * s]
}
function len2(u: [number, number, number]): number {
  return u[0] * u[0] + u[1] * u[1] + u[2] * u[2]
}
// 归一化; 若长度≈0 (退化) 则返回 fallback (已假设为单位向量)。
function normalizeOr(u: [number, number, number], fallback: [number, number, number]): [number, number, number] {
  const L = Math.sqrt(len2(u))
  if (L < 1e-12) return fallback
  return [u[0] / L, u[1] / L, u[2] / L]
}
// 返回一条同 u 正交嘅单位向量 (用唔同坐标轴叉积, 取较稳嗰个)。
function anyPerp(u: [number, number, number]): [number, number, number] {
  // 拣同 u 最唔平行嘅世界轴做叉积, 避免叉出零向量。
  const ax = Math.abs(u[0]), ay = Math.abs(u[1]), az = Math.abs(u[2])
  let axis: [number, number, number]
  if (ax <= ay && ax <= az) axis = [1, 0, 0]
  else if (ay <= az) axis = [0, 1, 0]
  else axis = [0, 0, 1]
  const p = cross(u, axis)
  return normalizeOr(p, [1, 0, 0])
}
