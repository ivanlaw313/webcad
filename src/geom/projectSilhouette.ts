// projectSilhouette.ts — S189：实体网格【特征边】投影到草图平面（Fusion「投影实体 / Project Body」）。
//
// 当实体离草图平面（唔共面、平面又冇切穿佢）—— computeRefGeo 嘅 pass1(共面轮廓)/pass2(剖切)都唔触发
// —— 就把实体嘅【特征边】（相邻两面二面角 > 阈值，即 B-rep 棱）+ 开放边界边，【沿平面法向投影】落
// 平面 2D [s,t] 坐标做参考几何。沿法向塌成点嘅边（垂直边）滤走；投影后重合嘅边（如盒顶底边）自动去重。
//
// 坐标映射同 freesolve.computeRefGeo 一致（CAD Z-up → 草图 [s,t,n]，n=沿平面法向距离）：
//   XY → [x,-y,z]（n=z） · XZ → [x,z,y]（n=y） · YZ → [-y,z,x]（n=x）
// 二面角用【映射后】三角法向算 —— map 系正交变换（旋转/反射），保角，dot 不变。
//
// 纯函数、零 import、无副作用 —— Node-testable（npx tsx）。

export type Pt2 = [number, number]

export function projectFeatureEdges(
  mesh: { vertices: ArrayLike<number>; triangles: ArrayLike<number> },
  plane: 'XY' | 'XZ' | 'YZ',
  sharpDot = 0.94,   // 相邻面法向 dot < 此值 = 特征边（默认 cos20°≈0.94）
  minLen = 0.2,      // 投影后短过此长度（沿法向塌点）→ 跳
  cap = 400,
): [Pt2, Pt2][] {
  const V = mesh.vertices, T = mesh.triangles
  if (!V || !T || !T.length) return []
  const map = (x: number, y: number, z: number): Pt2 =>
    plane === 'XY' ? [x, -y] : plane === 'XZ' ? [x, z] : [-y, z]   // 投影：丢 n 分量
  // 关键：先用【3D 边邻接】判特征边（boundary / 二面角 > 阈值），再投影 —— 唔可以喺 2D 投影键合并先判，
  // 否则顶/底面内部对角线投影重合后会把上(+n)下(−n)法向撞埋一齐 → 误判成特征边（S189 Node 测揪到）。
  const key3 = (vi: number) => `${Math.round((V[vi] as number) * 50)},${Math.round((V[vi + 1] as number) * 50)},${Math.round((V[vi + 2] as number) * 50)}`
  const triNrm3 = (i: number): [number, number, number] => {
    const a = (T[i] as number) * 3, b = (T[i + 1] as number) * 3, c = (T[i + 2] as number) * 3
    const ux = (V[b] as number) - (V[a] as number), uy = (V[b + 1] as number) - (V[a + 1] as number), uz = (V[b + 2] as number) - (V[a + 2] as number)
    const wx = (V[c] as number) - (V[a] as number), wy = (V[c + 1] as number) - (V[a + 1] as number), wz = (V[c + 2] as number) - (V[a + 2] as number)
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx
    const L = Math.hypot(nx, ny, nz) || 1
    return [nx / L, ny / L, nz / L]
  }
  // 3D 边 → 相邻三角法向们 + 两端 3D 顶点下标
  const e3 = new Map<string, { va: number; vb: number; n: [number, number, number][] }>()
  for (let i = 0; i < T.length; i += 3) {
    const nrm = triNrm3(i)
    for (let k = 0; k < 3; k++) {
      const viA = (T[i + k] as number) * 3, viB = (T[i + (k + 1) % 3] as number) * 3
      const ka = key3(viA), kb = key3(viB), ek = ka < kb ? ka + '|' + kb : kb + '|' + ka
      const e = e3.get(ek)
      if (e) e.n.push(nrm); else e3.set(ek, { va: viA, vb: viB, n: [nrm] })
    }
  }
  const segs: [Pt2, Pt2][] = []
  const seen = new Set<string>()   // 投影后 2D 去重（顶底重合边只留一条）
  const k2 = (p: Pt2) => `${Math.round(p[0] * 50)},${Math.round(p[1] * 50)}`
  for (const e of e3.values()) {
    if (segs.length >= cap) break
    let sharp = e.n.length === 1   // 开放边界边
    for (let i = 0; !sharp && i < e.n.length; i++) {
      const ni = e.n[i]
      if (ni[0] === 0 && ni[1] === 0 && ni[2] === 0) continue   // 退化（零面积）三角法向 → 跳，唔好当 dot=0 误判特征边（OCCT sliver/极点/缝边）
      for (let j = i + 1; j < e.n.length; j++) {
        const nj = e.n[j]
        if (nj[0] === 0 && nj[1] === 0 && nj[2] === 0) continue
        if (ni[0] * nj[0] + ni[1] * nj[1] + ni[2] * nj[2] < sharpDot) sharp = true   // 二面角 >~阈值 = 特征边
      }
    }
    if (!sharp) continue
    const a = map(V[e.va] as number, V[e.va + 1] as number, V[e.va + 2] as number)
    const b = map(V[e.vb] as number, V[e.vb + 1] as number, V[e.vb + 2] as number)
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) <= minLen) continue   // 投影塌点（沿法向边）
    const ek = k2(a) < k2(b) ? k2(a) + '|' + k2(b) : k2(b) + '|' + k2(a)
    if (seen.has(ek)) continue
    seen.add(ek)
    segs.push([a, b])
  }
  return segs
}

/**
 * Return the *view* silhouette of a triangulated body projected onto one of
 * the standard construction planes.  This is deliberately different from
 * projectFeatureEdges(): a sharp internal edge is useful for Project, but it
 * is not a silhouette.  An edge belongs to a silhouette only when its two
 * adjacent faces face opposite sides of the view direction, or when a
 * front/back-facing face meets a view-parallel face.  Boundary edges are kept
 * as well, which makes open sheets usable.
 *
 * The result is a set of 2D segments rather than a closed wire.  Joining,
 * resolving self-intersections and making an OCCT splitting surface must stay
 * in the B-rep layer; returning raw projected segments here keeps the view
 * classification deterministic and independently testable.
 */
export function projectViewSilhouette(
  mesh: { vertices: ArrayLike<number>; triangles: ArrayLike<number> },
  plane: 'XY' | 'XZ' | 'YZ',
  minLen = 0.2,
  cap = 400,
): [Pt2, Pt2][] {
  const V = mesh.vertices, T = mesh.triangles
  if (!V || !T || !T.length) return []
  const map = (x: number, y: number, z: number): Pt2 =>
    plane === 'XY' ? [x, -y] : plane === 'XZ' ? [x, z] : [-y, z]
  const view: [number, number, number] = plane === 'XY' ? [0, 0, 1] : plane === 'XZ' ? [0, 1, 0] : [1, 0, 0]
  const key3 = (vi: number) => `${Math.round((V[vi] as number) * 50)},${Math.round((V[vi + 1] as number) * 50)},${Math.round((V[vi + 2] as number) * 50)}`
  type Edge = { va: number; vb: number; facing: number[] }
  const edges = new Map<string, Edge>()
  for (let i = 0; i < T.length; i += 3) {
    const ia = (T[i] as number) * 3, ib = (T[i + 1] as number) * 3, ic = (T[i + 2] as number) * 3
    const ux = (V[ib] as number) - (V[ia] as number), uy = (V[ib + 1] as number) - (V[ia + 1] as number), uz = (V[ib + 2] as number) - (V[ia + 2] as number)
    const wx = (V[ic] as number) - (V[ia] as number), wy = (V[ic + 1] as number) - (V[ia + 1] as number), wz = (V[ic + 2] as number) - (V[ia + 2] as number)
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx
    const L = Math.hypot(nx, ny, nz)
    if (L < 1e-12) continue
    const facing = (nx * view[0] + ny * view[1] + nz * view[2]) / L
    for (const [a, b] of [[ia, ib], [ib, ic], [ic, ia]] as [number, number][]) {
      const ka = key3(a), kb = key3(b), key = ka < kb ? ka + '|' + kb : kb + '|' + ka
      const e = edges.get(key)
      if (e) e.facing.push(facing); else edges.set(key, { va: a, vb: b, facing: [facing] })
    }
  }
  const segs: [Pt2, Pt2][] = []
  const seen = new Set<string>()
  const k2 = (p: Pt2) => `${Math.round(p[0] * 50)},${Math.round(p[1] * 50)}`
  const eps = 1e-7
  for (const e of edges.values()) {
    if (segs.length >= cap) break
    const f = e.facing
    let silhouette = f.length === 1
    for (let i = 0; !silhouette && i < f.length; i++) for (let j = i + 1; j < f.length; j++) {
      const a = f[i], b = f[j]
      // Opposite sides of the view, or a visible/invisible face meeting a
      // tangent face.  Two tangent faces (a box's vertical corner in top view)
      // are intentionally excluded.
      if (a * b < -eps || ((Math.abs(a) <= eps) !== (Math.abs(b) <= eps))) silhouette = true
    }
    if (!silhouette) continue
    const a = map(V[e.va] as number, V[e.va + 1] as number, V[e.va + 2] as number)
    const b = map(V[e.vb] as number, V[e.vb + 1] as number, V[e.vb + 2] as number)
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) <= minLen) continue
    const key = k2(a) < k2(b) ? k2(a) + '|' + k2(b) : k2(b) + '|' + k2(a)
    if (seen.has(key)) continue
    seen.add(key)
    segs.push([a, b])
  }
  return segs
}
