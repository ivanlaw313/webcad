// 钣金展开映射纯数学模块 — 净系做数：截面中线行走、展开坐标、折叠点 → flat pattern 映射。
// 无 store / 无 worker / 无 UI 依赖，node tsx 直接跑得 → tests/smunfold.test.mjs 全解析验证。
//
// 约定（同 worker cad.worker.ts sheetmetal 分支一致，行走算法照抄）：
//   截面喺 CAD XZ 平面行走（x = 展开方向, z = 向上），沿 Y 拉伸宽度 W。
//   直段 segs[]（mm）由折弯 angles[]（度，正 = 向上弯）连接；弯心半径 Rc = R + T/2。
//   展开长：直段照长度排，每个折弯贡献中性轴弧长 BA = |angle|·(R + K·T)。
//   normal = (−sinθ, cosθ) — 局部左法向，同 worker 偏移 ±T/2 同一约定。

export type SmSpec = {
  thickness: number
  radius: number
  kfactor: number
  width: number
  segs: number[]
  angles: number[]
}

export type SmRun = {
  start: [number, number]    // 直段起点 [x,z]（截面平面）
  dir: [number, number]      // 行走方向 (cosθ, sinθ)
  normal: [number, number]   // 左法向 (−sinθ, cosθ)
  len: number                // 段长（clamp 后）
  flatStart: number          // 展开起点 = Σ前段长 + Σ前弯 BA
  theta: number              // 行走航向（弧度）
}

export type FlatHit = { fx: number; fy: number; run: number }
export type FlatErr = { error: string }

// 折弯弧记录 — 行走时记低，畀 mapPointToFlat 判断「孔喺折弯区」
type SmBend = { cx: number; cz: number; Rc: number; phi0: number; a: number }

// 输入 clamp — 同 worker 一模一样嘅保底
function clampSpec(spec: SmSpec) {
  return {
    T: Math.max(0.2, spec.thickness),
    R: Math.max(0.01, spec.radius),
    K: Math.min(0.5, Math.max(0, spec.kfactor)),
    W: Math.max(1, spec.width),
    segs: spec.segs.map((s) => Math.max(0.1, s)),
    angles: spec.angles,
  }
}

// 中线行走（照抄 worker 算法）：逐段记 run，逐弯记弧心 + 累加展开长。
function walk(spec: SmSpec): { runs: SmRun[]; bends: SmBend[] } {
  const { T, R, K, segs, angles } = clampSpec(spec)
  const Rc = R + T / 2
  const runs: SmRun[] = []
  const bends: SmBend[] = []
  let x = 0, z = 0, th = 0, flat = 0
  for (let i = 0; i < segs.length; i++) {
    runs.push({
      start: [x, z],
      dir: [Math.cos(th), Math.sin(th)],
      normal: [-Math.sin(th), Math.cos(th)],
      len: segs[i],
      flatStart: flat,
      theta: th,
    })
    x += segs[i] * Math.cos(th); z += segs[i] * Math.sin(th)
    flat += segs[i]
    if (i < angles.length) {
      const a = angles[i] * Math.PI / 180
      if (Math.abs(a) > 1e-4) {                       // 同 worker：太细嘅弯唔行弧
        const dir = a >= 0 ? 1 : -1
        const cx = x - Rc * Math.sin(th) * dir        // 弯心（转向嗰边）
        const cz = z + Rc * Math.cos(th) * dir
        const phi0 = Math.atan2(z - cz, x - cx)
        bends.push({ cx, cz, Rc, phi0, a })
        x = cx + Rc * Math.cos(phi0 + a)              // 弧终点
        z = cz + Rc * Math.sin(phi0 + a)
        th += a
      }
      flat += Math.abs(a) * (R + K * T)               // BA：中性轴弧长（同 worker flat 无条件加）
    }
  }
  return { runs, bends }
}

/** 截面直段表 — 每段嘅折叠态位置 + 展开起点。 */
export function smRuns(spec: SmSpec): SmRun[] {
  return walk(spec).runs
}

/** 折叠态 3D 点 (CAD x,y,z) + 孔轴 → 展开图 (fx, fy)。fy = 折叠态 y（宽度方向不变）。
 *  唔上板面 / 喺折弯区 / 斜轴 → 各自错误讯息。 */
export function mapPointToFlat(
  spec: SmSpec,
  p: [number, number, number],
  axis: [number, number, number],
): FlatHit | FlatErr {
  const { T, W } = clampSpec(spec)
  const { runs, bends } = walk(spec)
  const P: [number, number] = [p[0], p[2]]            // XZ 投影
  const v = p[1]                                      // 宽度坐标
  if (v < -0.5 || v > W + 0.5) return { error: '孔超出板宽' }

  // 逐直段搵候选：t 喺段范围内、|d| 喺板厚带内 → 攞 |d| 最细嗰段
  let best = -1, bestD = Infinity, bestT = 0
  for (let k = 0; k < runs.length; k++) {
    const r = runs[k]
    const rx = P[0] - r.start[0], rz = P[1] - r.start[1]
    const t = rx * r.dir[0] + rz * r.dir[1]
    const d = rx * r.normal[0] + rz * r.normal[1]
    if (t >= -0.5 && t <= r.len + 0.5 && Math.abs(d) <= T / 2 + 0.6 && Math.abs(d) < bestD) {
      bestD = Math.abs(d); best = k; bestT = t
    }
  }

  if (best < 0) {
    // 冇候选 → 睇下系咪近折弯弧：径向距离贴 Rc 且角度喺弧扫掠范围内
    const TAU = Math.PI * 2
    for (const b of bends) {
      const dx = P[0] - b.cx, dz = P[1] - b.cz
      if (Math.abs(Math.hypot(dx, dz) - b.Rc) > T / 2 + 0.6) continue
      const phi = Math.atan2(dz, dx)
      // δ = 由 φ0 沿扫掠方向行到 φ 嘅角度（归一到 [0,2π)）
      const delta = b.a >= 0
        ? (((phi - b.phi0) % TAU) + TAU) % TAU
        : (((b.phi0 - phi) % TAU) + TAU) % TAU
      if (delta <= Math.abs(b.a) + 1e-6) {
        return { error: '孔喺折弯区 — 真实折弯会变形，展开图唔标' }
      }
    }
    return { error: '孔唔喺钣金面上' }
  }

  // 轴向检查：要近乎垂直板面（XZ 分量贴段 normal、Y 分量够细）先保形
  const al = Math.hypot(axis[0], axis[1], axis[2])
  if (!(al > 1e-9) || Math.abs(axis[1] / al) >= 0.35) {
    return { error: '孔轴唔垂直于板面 — 斜孔展开唔保形' }
  }
  const xzLen = Math.hypot(axis[0], axis[2])
  const r = runs[best]
  const dot = (axis[0] / xzLen) * r.normal[0] + (axis[2] / xzLen) * r.normal[1]
  if (Math.abs(dot) <= 0.9) {
    return { error: '孔轴唔垂直于板面 — 斜孔展开唔保形' }
  }

  return { fx: r.flatStart + Math.min(Math.max(bestT, 0), r.len), fy: v, run: best }
}
