// accessibilityAnalysis.ts — #174-7 脱模可达性 / 刀具可达性（对标 Fusion Inspect ▸ Accessibility / undercut 检测）
//
// 用途：畀一个【脱模方向 pullDir】，逐三角形判断佢能否沿【自己朝向嗰半空间】被拉出模具 / 被刀具够到 —
//   由三角形心沿脱模方向射一条线，若被【自身网格其它三角】挡住 → 呢块料喺该方向【不可达 = 倒扣 undercut】→ 红；
//   射得出（无遮挡）→ 可达 → 绿。呢个补足拔模角分析（拔模只睇单面角度，唔知面前有无嘢挡）。
//
// ── 方向约定 ────────────────────────────────────────────────────────────────
//   面法向 n̂·p̂ ≥ 0（面朝脱模方向）→ 该面由 +pull 侧脱模，射线方向 = +pull；
//   面法向 n̂·p̂ < 0（面朝返动模）→ 由 −pull 侧脱模，射线方向 = −pull。
//   即每面都朝【自己所属半模嘅开模方向】射线检查 —— 双模腔各自可达先算真可脱。
//
// ── 诚实边界 ────────────────────────────────────────────────────────────────
//   1. 三角网离散近似（非 B-rep 解析），细网格趋势收敛。
//   2. 暴力 O(F²) 射线-三角相交（Möller–Trumbore）。为免大网格卡死，超过 maxTris（默认 20000 三角，
//      即 ~4e8 次相交）→ 返回 { tooLarge:true } 由调用方诚实降级（唔硬算）。
//   3. 只测【自身遮挡】（单体倒扣）；唔含模具滑块 / 多体互挡。
//   4. 射线由三角形心 + 微沿方向偏移（避免自身命中）；命中判据 t > eps。
//
// 纯函数、零 import、无副作用。接线（着色 / 状态）由调用方做。

const EPS = 1e-9

export type AccessibilityReport = {
  reachable: Uint8Array       // 每三角：1=可达(绿) / 0=被挡(红)
  positions: Float32Array     // 去索引 position（每三角 9 数）— 直接畀 three vertexColors overlay
  colors: Float32Array        // 每顶点 rgb（逐三角同色）
  nBlocked: number            // 被挡（倒扣）三角数
  nTotal: number
  tooLarge: boolean           // true = 三角太多，已跳过（诚实降级）
}

const GREEN: [number, number, number] = [0.18, 0.62, 0.36]
const RED: [number, number, number] = [0.82, 0.23, 0.19]

// Möller–Trumbore：ray(o,d) 命中三角 (v0,v1,v2) 返回 t（>0 前方距离），无命中返 -1。skipCull=双面。
function rayTri(
  ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
  ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number,
): number {
  const e1x = bx - ax, e1y = by - ay, e1z = bz - az
  const e2x = cx - ax, e2y = cy - ay, e2z = cz - az
  const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x
  const det = e1x * px + e1y * py + e1z * pz
  if (Math.abs(det) < EPS) return -1
  const inv = 1 / det
  const tx = ox - ax, ty = oy - ay, tz = oz - az
  const u = (tx * px + ty * py + tz * pz) * inv
  if (u < -1e-7 || u > 1 + 1e-7) return -1
  const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x
  const v = (dx * qx + dy * qy + dz * qz) * inv
  if (v < -1e-7 || u + v > 1 + 1e-7) return -1
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv
  return t
}

export function analyzeAccessibility(
  vertices: ArrayLike<number>,
  triangles: ArrayLike<number>,
  pullDir: [number, number, number],
  opts?: { maxTris?: number },
): AccessibilityReport {
  const F = Math.floor(triangles.length / 3)
  const maxTris = opts?.maxTris ?? 20000
  const reachable = new Uint8Array(F)
  const positions = new Float32Array(F * 9)
  const colors = new Float32Array(F * 9)
  const pLen = Math.hypot(pullDir[0], pullDir[1], pullDir[2])
  if (F === 0 || pLen <= EPS) return { reachable, positions, colors, nBlocked: 0, nTotal: F, tooLarge: false }
  if (F > maxTris) return { reachable, positions, colors, nBlocked: 0, nTotal: F, tooLarge: true }
  const px = pullDir[0] / pLen, py = pullDir[1] / pLen, pz = pullDir[2] / pLen

  // 预取三角顶点（扁平）+ 形心 + 法向
  const V = new Float64Array(F * 9)
  for (let t = 0; t < F; t++) {
    const ia = triangles[t * 3] * 3, ib = triangles[t * 3 + 1] * 3, ic = triangles[t * 3 + 2] * 3
    const o = t * 9
    V[o] = vertices[ia]; V[o + 1] = vertices[ia + 1]; V[o + 2] = vertices[ia + 2]
    V[o + 3] = vertices[ib]; V[o + 4] = vertices[ib + 1]; V[o + 5] = vertices[ib + 2]
    V[o + 6] = vertices[ic]; V[o + 7] = vertices[ic + 1]; V[o + 8] = vertices[ic + 2]
  }

  // 包围盒对角 → 偏移量 eps + 射线足够长
  let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity
  for (let i = 0; i < F * 9; i += 3) {
    if (V[i] < mnx) mnx = V[i]; if (V[i] > mxx) mxx = V[i]
    if (V[i + 1] < mny) mny = V[i + 1]; if (V[i + 1] > mxy) mxy = V[i + 1]
    if (V[i + 2] < mnz) mnz = V[i + 2]; if (V[i + 2] > mxz) mxz = V[i + 2]
  }
  const diag = Math.hypot(mxx - mnx, mxy - mny, mxz - mnz) || 1
  const off = diag * 1e-4

  let nBlocked = 0
  for (let t = 0; t < F; t++) {
    const o = t * 9
    const ax = V[o], ay = V[o + 1], az = V[o + 2]
    const bx = V[o + 3], by = V[o + 4], bz = V[o + 5]
    const cx = V[o + 6], cy = V[o + 7], cz = V[o + 8]
    // 形心 + 法向
    const gx = (ax + bx + cx) / 3, gy = (ay + by + cy) / 3, gz = (az + bz + cz) / 3
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay)
    let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az)
    let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
    const nl = Math.hypot(nx, ny, nz)
    if (nl <= EPS) { reachable[t] = 1; nx = px; ny = py; nz = pz } else { nx /= nl; ny /= nl; nz /= nl }
    // 射线方向 = 朝该面所属半模开模方向
    const sgn = (nx * px + ny * py + nz * pz) >= 0 ? 1 : -1
    const dx = px * sgn, dy = py * sgn, dz = pz * sgn
    const rx = gx + dx * off, ry = gy + dy * off, rz = gz + dz * off
    // 对其余三角射线；命中 t>off → 被挡
    let blocked = false
    for (let s = 0; s < F && !blocked; s++) {
      if (s === t) continue
      const so = s * 9
      const th = rayTri(rx, ry, rz, dx, dy, dz,
        V[so], V[so + 1], V[so + 2], V[so + 3], V[so + 4], V[so + 5], V[so + 6], V[so + 7], V[so + 8])
      if (th > off) blocked = true
    }
    reachable[t] = blocked ? 0 : 1
    if (blocked) nBlocked++
    const col = blocked ? RED : GREEN
    for (let k = 0; k < 3; k++) {
      const po = o + k * 3
      positions[po] = V[po]; positions[po + 1] = V[po + 1]; positions[po + 2] = V[po + 2]
      colors[po] = col[0]; colors[po + 1] = col[1]; colors[po + 2] = col[2]
    }
  }
  return { reachable, positions, colors, nBlocked, nTotal: F, tooLarge: false }
}
