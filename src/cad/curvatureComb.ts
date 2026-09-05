// curvatureComb.ts — S190：逐顶点【主曲率 + 主方向】（Fusion Inspect ▸ Curvature Comb / 曲率梳）。
//
// 既有 curvatureAnalysis 只出标量 H（平均）/ K（高斯）；曲率梳需要【方向】—— 即每点嘅两个主曲率 κ₁≥κ₂
// 同对应主方向 e₁⊥e₂（喺切平面内）。呢度用标准【法向变化最小二乘】估每点曲率张量（2nd fundamental
// form / 形状算子）—— Taubin / Rusinkiewicz "Estimating Curvatures and Their Derivatives on Triangle
// Meshes" 嘅做法（纯数学，无 deps）：
//   1. 每点估面积加权单位法向 n。
//   2. 切平面基 (u,v) ⊥ n。
//   3. 对每个一环邻 j：边 d=p_j−p_i 投影到切面得方向 t=(cosφ,sinφ)；该方向法曲率
//        κ(t) ≈ −(n_j−n_i)·d / |d|²  （形状算子定义 S·t=−dN/dt）。
//   4. 对 κ(t)=a·cos²+2b·cosφsinφ+c·sin² 做最小二乘解出对称张量 [[a,b],[b,c]]。
//   5. 2×2 对称特征分解 → κ₁,κ₂（特征值）+ 切面特征向量 → 映返 3D 得 e₁,e₂。
//
// 纯函数、零 import、无副作用 —— Node-testable（解析柱面：κ₁=1/R 周向、κ₂≈0 轴向）。

export type PrincipalCurvature = {
  k1: Float64Array            // 大主曲率（|κ₁|≥|κ₂|，带符号）每顶点
  k2: Float64Array            // 细主曲率
  e1: Float64Array            // nVert×3 大主曲率方向（单位，3D）
  e2: Float64Array            // nVert×3 细主曲率方向
  boundary: Uint8Array        // 1 = 边界/退化顶点（方向不可靠 → 置零）
}

const EPS = 1e-12

// 面积加权顶点法向。
function vertexNormals(V: ArrayLike<number>, T: ArrayLike<number>, nv: number): Float64Array {
  const N = new Float64Array(nv * 3)
  for (let i = 0; i < T.length; i += 3) {
    const a = (T[i] as number) * 3, b = (T[i + 1] as number) * 3, c = (T[i + 2] as number) * 3
    const ux = (V[b] as number) - (V[a] as number), uy = (V[b + 1] as number) - (V[a + 1] as number), uz = (V[b + 2] as number) - (V[a + 2] as number)
    const wx = (V[c] as number) - (V[a] as number), wy = (V[c + 1] as number) - (V[a + 1] as number), wz = (V[c + 2] as number) - (V[a + 2] as number)
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx   // 叉积 = 2A·n
    for (const o of [a, b, c]) { N[o] += nx; N[o + 1] += ny; N[o + 2] += nz }
  }
  for (let i = 0; i < nv; i++) { const o = i * 3; const L = Math.hypot(N[o], N[o + 1], N[o + 2]) || 1; N[o] /= L; N[o + 1] /= L; N[o + 2] /= L }
  return N
}

export function principalCurvature(vertices: ArrayLike<number>, triangles: ArrayLike<number>): PrincipalCurvature {
  const nv = Math.floor(vertices.length / 3)
  const V = vertices, T = triangles
  const k1 = new Float64Array(nv), k2 = new Float64Array(nv), e1 = new Float64Array(nv * 3), e2 = new Float64Array(nv * 3)
  const boundary = new Uint8Array(nv)
  // 邻接（顶点 → 一环邻）+ 边界检测（边只属一个三角 = 边界）
  const nbr: Set<number>[] = Array.from({ length: nv }, () => new Set<number>())
  const edgeCnt = new Map<string, number>()
  for (let i = 0; i < T.length; i += 3) {
    const v = [T[i] as number, T[i + 1] as number, T[i + 2] as number]
    for (let k = 0; k < 3; k++) {
      const a = v[k], b = v[(k + 1) % 3]
      nbr[a].add(b); nbr[b].add(a)
      const ek = a < b ? a + '_' + b : b + '_' + a
      edgeCnt.set(ek, (edgeCnt.get(ek) ?? 0) + 1)
    }
  }
  const onBoundary = new Uint8Array(nv)
  for (const [ek, c] of edgeCnt) if (c === 1) { const [a, b] = ek.split('_').map(Number); onBoundary[a] = 1; onBoundary[b] = 1 }
  const N = vertexNormals(V, T, nv)

  for (let i = 0; i < nv; i++) {
    if (onBoundary[i] || nbr[i].size < 2) { boundary[i] = 1; continue }
    const o = i * 3
    const nx = N[o], ny = N[o + 1], nz = N[o + 2]
    // 切平面基 (u,v) ⊥ n
    let ux = 1, uy = 0, uz = 0
    if (Math.abs(nx) > 0.9) { ux = 0; uy = 1; uz = 0 }
    // u = normalize(u − (u·n)n)
    const dot = ux * nx + uy * ny + uz * nz
    ux -= dot * nx; uy -= dot * ny; uz -= dot * nz
    const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul
    const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux   // v = n×u
    // 最小二乘：Σ κ_t = a·c² + 2b·cs + c·s²  → 解 (a,b,c)。法方程 3×3。
    let m00 = 0, m01 = 0, m02 = 0, m11 = 0, m12 = 0, m22 = 0, r0 = 0, r1 = 0, r2 = 0
    let used = 0
    for (const j of nbr[i]) {
      const jo = j * 3
      const dx = (V[jo] as number) - (V[o] as number), dy = (V[jo + 1] as number) - (V[o + 1] as number), dz = (V[jo + 2] as number) - (V[o + 2] as number)
      const du = dx * ux + dy * uy + dz * uz, dv = dx * vx + dy * vy + dz * vz   // 切面坐标
      const dl2 = du * du + dv * dv
      if (dl2 < EPS) continue
      const dl = Math.sqrt(dl2)
      const cphi = du / dl, sphi = dv / dl
      // 法曲率 κ_t = −(n_j−n_i)·d̂ / |d|（沿边方向；d̂ 用 3D 单位边）
      const ndx = N[jo] - nx, ndy = N[jo + 1] - ny, ndz = N[jo + 2] - nz
      const dlen = Math.hypot(dx, dy, dz) || 1
      const kt = -(ndx * dx + ndy * dy + ndz * dz) / (dlen * dlen)
      // 基函数 [c², 2cs, s²]
      const b0 = cphi * cphi, b1 = 2 * cphi * sphi, b2 = sphi * sphi
      m00 += b0 * b0; m01 += b0 * b1; m02 += b0 * b2; m11 += b1 * b1; m12 += b1 * b2; m22 += b2 * b2
      r0 += b0 * kt; r1 += b1 * kt; r2 += b2 * kt
      used++
    }
    if (used < 2) { boundary[i] = 1; continue }
    // 解对称 3×3（Cramer/高斯）→ (a,b,c)
    const sol = solve3(m00, m01, m02, m11, m12, m22, r0, r1, r2)
    if (!sol) { boundary[i] = 1; continue }
    const [aa, bb, cc] = sol
    // 张量 [[aa,bb],[bb,cc]] 2×2 对称特征分解
    const tr = aa + cc, det = aa * cc - bb * bb
    const disc = Math.sqrt(Math.max(0, tr * tr / 4 - det))
    const l1 = tr / 2 + disc, l2 = tr / 2 - disc   // 特征值（曲率）
    // 特征向量（切面 2D）：对 l1
    let evx: number, evy: number
    if (Math.abs(bb) > EPS) { evx = l1 - cc; evy = bb } else { evx = 1; evy = 0 }
    const el = Math.hypot(evx, evy) || 1; evx /= el; evy /= el
    // 按 |曲率| 排：κ₁ = 模较大者
    let K1 = l1, K2 = l2, d1x = evx, d1y = evy
    if (Math.abs(l2) > Math.abs(l1)) { K1 = l2; K2 = l1; d1x = -evy; d1y = evx }   // 换到另一特征向量（⊥）
    k1[i] = K1; k2[i] = K2
    // e1 = d1x·u + d1y·v ; e2 ⊥（切面内旋 90°）
    e1[o] = d1x * ux + d1y * vx; e1[o + 1] = d1x * uy + d1y * vy; e1[o + 2] = d1x * uz + d1y * vz
    const d2x = -d1y, d2y = d1x
    e2[o] = d2x * ux + d2y * vx; e2[o + 1] = d2x * uy + d2y * vy; e2[o + 2] = d2x * uz + d2y * vz
  }
  return { k1, k2, e1, e2, boundary }
}

// 解对称正定/半定 3×3 线性系 M·x=r（M 由上三角 m00,m01,m02,m11,m12,m22 给）。奇异 → null。
function solve3(m00: number, m01: number, m02: number, m11: number, m12: number, m22: number, r0: number, r1: number, r2: number): [number, number, number] | null {
  const det = m00 * (m11 * m22 - m12 * m12) - m01 * (m01 * m22 - m12 * m02) + m02 * (m01 * m12 - m11 * m02)
  if (Math.abs(det) < 1e-14) return null
  const a = (r0 * (m11 * m22 - m12 * m12) - m01 * (r1 * m22 - m12 * r2) + m02 * (r1 * m12 - m11 * r2)) / det
  const b = (m00 * (r1 * m22 - r2 * m12) - r0 * (m01 * m22 - m12 * m02) + m02 * (m01 * r2 - r1 * m02)) / det
  const c = (m00 * (m11 * r2 - r1 * m12) - m01 * (m01 * r2 - r1 * m02) + r0 * (m01 * m12 - m11 * m02)) / det
  return [a, b, c]
}
