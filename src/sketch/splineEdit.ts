// splineEdit.ts — #174-8 样条编辑纯逻辑：插/删拟合(控制)点 + 端点切向手柄。
//
// webcad 样条系 poly + smooth + ctrl[]（控制/拟合点）；ctrl 拖动已 work。呢度补：
//   • 在两 ctrl 之间点一下 → 喺该段中点插一个新拟合点（Fusion「Insert Fit Point」）。
//   • 删除一个拟合点（保留 ≥2）。
//   • 首尾切向手柄：方向 = 端点指向相邻内点（可拖以调端点切向；几何由 de Boor 重采样，此处只畀手柄几何）。
// 全部喺 ctrl[] 上纯操作；重采样(pathPts/sampleBSpline)由调用方做。纯函数、零依赖。

export type Pt = [number, number]

function dist2(a: Pt, b: Pt): number { return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 }

/** 点到线段最近距离²（用于揾最近段）。 */
function segDist2(p: Pt, a: Pt, b: Pt): number {
  const abx = b[0] - a[0], aby = b[1] - a[1]
  const apx = p[0] - a[0], apy = p[1] - a[1]
  const len2 = abx * abx + aby * aby
  let t = len2 > 1e-12 ? (apx * abx + apy * aby) / len2 : 0
  if (t < 0) t = 0; else if (t > 1) t = 1
  const cx = a[0] + t * abx, cy = a[1] + t * aby
  return (p[0] - cx) ** 2 + (p[1] - cy) ** 2
}

/** 控制多边形段数：开放 = n-1，闭合 = n（含收口段）。 */
export function ctrlSegCount(ctrl: Pt[], open: boolean): number {
  return open ? Math.max(0, ctrl.length - 1) : ctrl.length
}

/**
 * 揾点 p 最近嘅控制多边形段（index j 表示段 ctrl[j]→ctrl[(j+1)%n]）。
 * @returns { seg, dist } — 无有效段返 { seg:-1, dist:Infinity }
 */
export function nearestCtrlSegment(ctrl: Pt[], p: Pt, open: boolean): { seg: number; dist: number } {
  const n = ctrl.length
  if (n < 2) return { seg: -1, dist: Infinity }
  const segN = ctrlSegCount(ctrl, open)
  let best = Infinity, bi = -1
  for (let j = 0; j < segN; j++) {
    const a = ctrl[j], b = ctrl[(j + 1) % n]
    const d = segDist2(p, a, b)
    if (d < best) { best = d; bi = j }
  }
  return { seg: bi, dist: Math.sqrt(best) }
}

/** 喺段 seg（ctrl[seg]→ctrl[seg+1]）中点插入一个新拟合点。返回新 ctrl（唔改入参）。 */
export function insertFitPoint(ctrl: Pt[], seg: number, open: boolean): Pt[] {
  const n = ctrl.length
  if (n < 2 || seg < 0 || seg >= ctrlSegCount(ctrl, open)) return ctrl.slice()
  const a = ctrl[seg], b = ctrl[(seg + 1) % n]
  const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  const out = ctrl.slice()
  out.splice(seg + 1, 0, mid)   // 插喺 seg 之后
  return out
}

/** 删除第 idx 个拟合点（保留 ≥2，否则原样返）。返回新 ctrl。 */
export function deleteFitPoint(ctrl: Pt[], idx: number): Pt[] {
  if (ctrl.length <= 2 || idx < 0 || idx >= ctrl.length) return ctrl.slice()
  const out = ctrl.slice()
  out.splice(idx, 1)
  return out
}

/**
 * 端点切向手柄：返回首/尾端切向单位向量（指向【外】，即端点朝相邻内点嘅反向 = 曲线离开方向）。
 * 首端切向 = norm(ctrl[0] - ctrl[1])，尾端 = norm(ctrl[n-1] - ctrl[n-2])。退化返 [1,0]。
 */
export function endpointTangents(ctrl: Pt[]): { start: Pt; end: Pt } {
  const n = ctrl.length
  const unit = (a: Pt, b: Pt): Pt => {
    const dx = a[0] - b[0], dy = a[1] - b[1]
    const l = Math.hypot(dx, dy)
    return l > 1e-9 ? [dx / l, dy / l] : [1, 0]
  }
  if (n < 2) return { start: [1, 0], end: [1, 0] }
  return { start: unit(ctrl[0], ctrl[1]), end: unit(ctrl[n - 1], ctrl[n - 2]) }
}

/**
 * 端点切向手柄位置（端点 ± 切向×len）。畀 SketchLayer 画可拖手柄。
 * @returns { startHandle, endHandle } 手柄末端 2D 坐标
 */
export function endpointTangentHandles(ctrl: Pt[], len: number): { startHandle: Pt; endHandle: Pt } {
  const n = ctrl.length
  const t = endpointTangents(ctrl)
  if (n < 2) return { startHandle: [len, 0], endHandle: [len, 0] }
  return {
    startHandle: [ctrl[0][0] + t.start[0] * len, ctrl[0][1] + t.start[1] * len],
    endHandle: [ctrl[n - 1][0] + t.end[0] * len, ctrl[n - 1][1] + t.end[1] * len],
  }
}

export { dist2 }
