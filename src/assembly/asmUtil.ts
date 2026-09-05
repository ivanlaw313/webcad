// GM-3DV4 装配纯几何工具（node 可单测 — 无 three / 无 DOM 依赖）。
//   A10：as-built 关节共享几何推轴（inferAsBuiltAxis）。
//   A12：有序爆炸步 offset 解算（explodeStepOffsets）。

type Vec3 = [number, number, number]

function bbox(v: number[]): { mn: Vec3; mx: Vec3 } {
  const mn: Vec3 = [Infinity, Infinity, Infinity], mx: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < v.length; i += 3) for (let k = 0; k < 3; k++) { const x = v[i + k]; if (x < mn[k]) mn[k] = x; if (x > mx[k]) mx[k] = x }
  return { mn, mx }
}
const diag = (b: { mn: Vec3; mx: Vec3 }) => Math.hypot(b.mx[0] - b.mn[0], b.mx[1] - b.mn[1], b.mx[2] - b.mn[2])
const inside = (p: Vec3, mn: Vec3, mx: Vec3, m: number) =>
  p[0] >= mn[0] - m && p[0] <= mx[0] + m && p[1] >= mn[1] - m && p[1] <= mx[1] + m && p[2] >= mn[2] - m && p[2] <= mx[2] + m

// 3×3 对称协方差最大特征向量（幂迭代）= 点集嘅【伸长方向】。
function dominantAxis(pts: Vec3[]): Vec3 | null {
  if (pts.length < 3) return null
  let cx = 0, cy = 0, cz = 0
  for (const p of pts) { cx += p[0]; cy += p[1]; cz += p[2] }
  cx /= pts.length; cy /= pts.length; cz /= pts.length
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0
  for (const p of pts) { const dx = p[0] - cx, dy = p[1] - cy, dz = p[2] - cz; xx += dx * dx; xy += dx * dy; xz += dx * dz; yy += dy * dy; yz += dy * dz; zz += dz * dz }
  const n = pts.length
  const C = [[xx / n, xy / n, xz / n], [xy / n, yy / n, yz / n], [xz / n, yz / n, zz / n]]
  const trace = C[0][0] + C[1][1] + C[2][2]
  if (!(trace > 1e-12)) return null   // 退化（点重合）
  // 幂迭代（32 轮足够收敛到主特征向量）
  let v: Vec3 = [1, 0.3, 0.17]
  for (let it = 0; it < 32; it++) {
    const w: Vec3 = [
      C[0][0] * v[0] + C[0][1] * v[1] + C[0][2] * v[2],
      C[1][0] * v[0] + C[1][1] * v[1] + C[1][2] * v[2],
      C[2][0] * v[0] + C[2][1] * v[1] + C[2][2] * v[2],
    ]
    const len = Math.hypot(w[0], w[1], w[2])
    if (len < 1e-12) return null
    v = [w[0] / len, w[1] / len, w[2] / len]
  }
  // 确定性符号：令最大分量为正（同 seed 无关，可复现）
  const am = Math.abs(v[0]) >= Math.abs(v[1]) && Math.abs(v[0]) >= Math.abs(v[2]) ? 0 : Math.abs(v[1]) >= Math.abs(v[2]) ? 1 : 2
  if (v[am] < 0) v = [-v[0], -v[1], -v[2]]
  return v
}

// A10：由两组件共享几何推断 as-built 关节轴（取代粗糙嘅「竖直过件心」）。
//   接触带（A 落喺 B 扩张 bbox + B 落喺 A 扩张 bbox 嘅点）系铰链/轴孔嘅细圆柱环 → 其伸长方向 = 销轴。
//   接触带唔够点 → 退回子件（B）整体主轴 → 再退回世界竖直 [0,1,0]。返回单位向量。
export function inferAsBuiltAxis(vertsA: number[], vertsB: number[], fallback: Vec3 = [0, 1, 0]): Vec3 {
  if (!vertsA.length || !vertsB.length) return fallback
  const ba = bbox(vertsA), bb = bbox(vertsB)
  const m = 0.06 * Math.min(diag(ba), diag(bb)) + 0.5   // 接触容差（相对 + 绝对底）
  const band: Vec3[] = []
  for (let i = 0; i < vertsA.length; i += 3) { const p: Vec3 = [vertsA[i], vertsA[i + 1], vertsA[i + 2]]; if (inside(p, bb.mn, bb.mx, m)) band.push(p) }
  for (let i = 0; i < vertsB.length; i += 3) { const p: Vec3 = [vertsB[i], vertsB[i + 1], vertsB[i + 2]]; if (inside(p, ba.mn, ba.mx, m)) band.push(p) }
  const axBand = band.length >= 8 ? dominantAxis(band) : null
  if (axBand) return axBand
  // 退回子件整体主轴（长轴 = 转轴嘅合理近似）
  const bChild: Vec3[] = []
  for (let i = 0; i < vertsB.length; i += 3) bChild.push([vertsB[i], vertsB[i + 1], vertsB[i + 2]])
  const axB = dominantAxis(bChild)
  return axB ?? fallback
}

// A12：有序爆炸步 —— 每步一组组件，沿各自方向按 step 距离偏移，逐步【累积】叠加。
//   t (0..1) 系全序进度：t 覆盖到第 k 步即施加该步全额 offset，部分覆盖线性插值（似 Fusion 爆炸动画 scrub）。
//   step-0 / 空 steps → 全零（保留简单径向滑杆做缺省，唔影响旧行为）。
export type ExplodeStep = { ids: string[]; dir: Vec3; dist: number }
export function explodeStepOffsets(steps: ExplodeStep[], t: number): Map<string, Vec3> {
  const out = new Map<string, Vec3>()
  if (!steps.length) return out
  const tt = Math.max(0, Math.min(1, t))
  const per = 1 / steps.length
  steps.forEach((st, k) => {
    const lo = k * per
    const frac = Math.max(0, Math.min(1, (tt - lo) / per))   // 呢步嘅完成度（0..1）
    if (frac <= 0) return
    const len = Math.hypot(st.dir[0], st.dir[1], st.dir[2]) || 1
    const d: Vec3 = [st.dir[0] / len * st.dist * frac, st.dir[1] / len * st.dist * frac, st.dir[2] / len * st.dist * frac]
    for (const id of st.ids) {
      const prev = out.get(id) ?? [0, 0, 0]
      out.set(id, [prev[0] + d[0], prev[1] + d[1], prev[2] + d[2]])   // 累积（一件可入多步）
    }
  })
  return out
}
