// S160：Taubin λ|μ 网格平滑 —— shrink-free（唔似纯 Laplacian 会塌缩），保体积。
// 焊接重合顶点取连通邻域跨缝平滑（导入网格喺缝处常有重复顶点，唔焊接缝唔会平滑）；
// 边界顶点（只属 1 个三角形嘅边端点）钉住（开放网格唔缩边）；拓扑（triangles）不变，只移顶点 + 重算法线。
// 纯 JS、零内核。返回与输入同长嘅 vertices（每原顶点取其 canonical 平滑位）+ 不变 triangles + 重算 normals。
export function taubinSmooth(
  vertices: number[],
  triangles: number[],
  passes: number,
  lambda = 0.5,
  mu = -0.53,
): { vertices: number[]; triangles: number[]; normals: number[]; ok: boolean } {
  const nVtx = vertices.length / 3
  if (nVtx < 3 || triangles.length < 3) return { vertices: [...vertices], triangles: [...triangles], normals: recomputeNormals(vertices, triangles), ok: true }
  const P = Math.max(1, Math.min(40, Math.round(passes) || 5))
  // 1) 焊接：量化坐标 → canonical id（跨重复顶点取连通性）
  const canon = new Map<string, number>()
  const cid = new Int32Array(nVtx)
  let nc = 0
  for (let i = 0; i < nVtx; i++) {
    const k = `${Math.round(vertices[i * 3] * 1e4)}_${Math.round(vertices[i * 3 + 1] * 1e4)}_${Math.round(vertices[i * 3 + 2] * 1e4)}`
    let cc = canon.get(k)
    if (cc === undefined) { cc = nc++; canon.set(k, cc) }
    cid[i] = cc
  }
  // canonical 位置（取每组首个原顶点）
  const pos = new Float64Array(nc * 3)
  const seen = new Uint8Array(nc)
  for (let i = 0; i < nVtx; i++) {
    const c = cid[i]
    if (!seen[c]) { seen[c] = 1; pos[c * 3] = vertices[i * 3]; pos[c * 3 + 1] = vertices[i * 3 + 1]; pos[c * 3 + 2] = vertices[i * 3 + 2] }
  }
  // 2) canonical 邻接（去重）+ 边界边检测（边只用 1 次 → 两端点钉住）
  const nbr: Set<number>[] = Array.from({ length: nc }, () => new Set<number>())
  const edgeCount = new Map<number, number>()
  const ekey = (a: number, b: number) => (a < b ? a * nc + b : b * nc + a)
  for (let i = 0; i < triangles.length; i += 3) {
    const a = cid[triangles[i]], b = cid[triangles[i + 1]], c = cid[triangles[i + 2]]
    // S160-2：跳过 welded-sliver 嘅自边（a===b）—— 唔好加入自身 1-ring（偏置 Laplacian）亦唔好当边算（镜 meshCheck）
    if (b !== a) { nbr[a].add(b); nbr[b].add(a) }
    if (c !== a) { nbr[a].add(c); nbr[c].add(a) }
    if (c !== b) { nbr[b].add(c); nbr[c].add(b) }
    const e: [number, number][] = [[a, b], [b, c], [c, a]]
    for (const [x, y] of e) { if (x === y) continue; const k = ekey(x, y); edgeCount.set(k, (edgeCount.get(k) || 0) + 1) }
  }
  const pinned = new Uint8Array(nc)
  let hasBoundary = false, nonManifold = false
  for (const [k, n] of edgeCount) {
    if (n === 1) { hasBoundary = true; pinned[Math.floor(k / nc)] = 1; pinned[k % nc] = 1 }   // 边界边 → 端点钉住
    else if (n > 2) nonManifold = true                                                          // S160-1：>2 用边 = 非流形（共享面/内壁/重叠壳）
  }
  // 3) Taubin 迭代：每趟 = λ（正，平滑）后 μ（负，反塌缩）。一次过 Laplacian（1-ring 平均）。
  const apply = (f: number) => {
    const np = Float64Array.from(pos)
    for (let c = 0; c < nc; c++) {
      if (pinned[c]) continue
      const ns = nbr[c]
      if (ns.size === 0) continue
      let sx = 0, sy = 0, sz = 0
      for (const m of ns) { sx += pos[m * 3]; sy += pos[m * 3 + 1]; sz += pos[m * 3 + 2] }
      const inv = 1 / ns.size
      np[c * 3] = pos[c * 3] + f * (sx * inv - pos[c * 3])
      np[c * 3 + 1] = pos[c * 3 + 1] + f * (sy * inv - pos[c * 3 + 1])
      np[c * 3 + 2] = pos[c * 3 + 2] + f * (sz * inv - pos[c * 3 + 2])
    }
    pos.set(np)
  }
  for (let p = 0; p < P; p++) { apply(lambda); apply(mu) }
  // 4) 写返所有原始顶点（每个原顶点取其 canonical 平滑位 → 拓扑/索引不变）
  const out = new Array<number>(vertices.length)
  for (let i = 0; i < nVtx; i++) { const c = cid[i]; out[i * 3] = pos[c * 3]; out[i * 3 + 1] = pos[c * 3 + 1]; out[i * 3 + 2] = pos[c * 3 + 2] }
  // 5) 体积保持（关键）：Taubin 对【粗网格】仍会塌缩（pass-band 频率分析假设密网格）。闭合网格 →
  //    绕质心缩放还原原体积（真·shrink-free）；若塌得太狠（<35% — 网格太粗 / 趟数太多）→ ok=false，
  //    由调用方 fail-safe 保持唔变（避免把模型搅烂仲报「保体积」= hollow）。开放网格冇明确体积 → 靠边界钉住，唔缩放。
  if (!hasBoundary && !nonManifold) {
    const v0 = absVol(vertices, triangles), v1 = absVol(out, triangles)
    if (v0 > 1e-9 && v1 > 1e-9) {
      if (v1 / v0 < 0.35) return { vertices: [...vertices], triangles: [...triangles], normals: recomputeNormals(vertices, triangles), ok: false }
      const s = Math.cbrt(v0 / v1)
      let cx = 0, cy = 0, cz = 0
      for (let i = 0; i < out.length; i += 3) { cx += out[i]; cy += out[i + 1]; cz += out[i + 2] }
      const inv = 3 / out.length; cx *= inv; cy *= inv; cz *= inv
      for (let i = 0; i < out.length; i += 3) { out[i] = cx + (out[i] - cx) * s; out[i + 1] = cy + (out[i + 1] - cy) * s; out[i + 2] = cz + (out[i + 2] - cz) * s }
    }
  }
  return { vertices: out, triangles: [...triangles], normals: recomputeNormals(out, triangles), ok: true }
}

// 带符号四面体和取绝对值 = 封闭网格体积（开放网格无意义）。
function absVol(v: number[], t: number[]): number {
  let v6 = 0
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3
    v6 += v[a] * (v[b + 1] * v[c + 2] - v[b + 2] * v[c + 1]) - v[a + 1] * (v[b] * v[c + 2] - v[b + 2] * v[c]) + v[a + 2] * (v[b] * v[c + 1] - v[b + 1] * v[c])
  }
  return Math.abs(v6) / 6
}

// 面积加权顶点法线重算（平滑移动顶点后法线要重算，否则着色错）。
function recomputeNormals(v: number[], t: number[]): number[] {
  const n = new Array<number>(v.length).fill(0)
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3
    const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2]
    const wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2]
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx   // 含面积权重（唔归一化面法）
    const idxs = [a, b, c]
    for (const idx of idxs) { n[idx] += nx; n[idx + 1] += ny; n[idx + 2] += nz }
  }
  for (let i = 0; i < n.length; i += 3) { const L = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= L; n[i + 1] /= L; n[i + 2] /= L }
  return n
}
