// slopeAnalysis.ts — 「面斜度分析」（面相对参考平面/水平 嘅倾角）。对标 Fusion 设计检查里嘅
//   斜度/角度着色：睇边啲面平（地板/顶面）、边啲面陡（竖直壁）、边啲面系过渡斜面 —— CNC 选粗/精
//   加工区、3D 打印朝向、产品脱模辅助 都用得。同 draftAnalysis 互补：
//     · draftAnalysis = 面法向相对【脱模方向】嘅【带符号】拔模角（正脱/倒扣，注塑专用）。
//     · slopeAnalysis = 面相对【参考平面（默认水平 Z）】嘅【无符号】倾角 ∈ [0°,90°]（平↔竖直）。
//
// ── 斜度角定义（本模块唯一契约）─────────────────────────────────────────────────
//   slope angle = 面【表面】相对参考平面（法向 = refDir）嘅倾角(度)，∈ [0,90]。
//   等价：slopeDeg = acos( |n̂ · r̂| )，n̂ = 面单位法向，r̂ = 单位参考方向（默认 +Z）。
//     · 面法向 ∥ refDir（水平地板/顶面，法向竖直）→ |dot|=1 → acos(1)=0° → 【平 flat】。
//     · 面法向 ⊥ refDir（竖直墙壁，法向水平）   → |dot|=0 → acos(0)=90° → 【竖直 steep】。
//     · 斜面                                  → 0<slope<90 → 【过渡 transition】。
//   用【绝对值】|dot| 折叠：朝上/朝下嘅平面都当「平」、墙朝边都当「竖直」—— 斜度系几何倾角，
//   唔分正反（要分正反请用拔模分析）。范围天然落 [0,90]，悬垂面（>90 几何）折返其镜像角。
//
// 分类（默认门槛，调用方可改）：flat ≤ flatDeg(默认30°) · steep ≥ steepDeg(默认60°) · 之间 = transition。
//
// ── 诚实边界 ────────────────────────────────────────────────────────────────
//   1. 离散三角网【面积加权平均法向】嘅倾角，唔系 B-rep 解析法向；平面/柱面准到浮点，自由曲面
//      （一张面内法向变化大）只得【平均】倾角，单一数字掩盖面内极值（同 draftAnalysis 一样）。
//   2. 退化面（零面积 / 零长 refDir）→ 法向取唔到 → slopeDeg=0、cls='flat'（保守当平）。
//
// 纯函数、零 import、无副作用（无 React / store / worker）。接线（worker 算 faceGroups、store 存
// refDir、Viewport 着色）由调用方做 —— 同 draftAnalysis.ts / faceFingerprint.ts 一致。

const EPS = 1e-12
const RAD2DEG = 180 / Math.PI

type Vec3 = [number, number, number]

/** OCCT mesh 一张 B-rep 面对应嘅三角 run：start/count 系 triangles【数组下标】(=三角序号×3)。 */
export type FaceGroup = { start: number; count: number; faceId: number }

/** 斜度分类：flat=平(可俯视加工/底面) · transition=斜过渡 · steep=陡/竖直壁。 */
export type SlopeClass = 'flat' | 'transition' | 'steep'

/** 逐面斜度结果。slopeDeg ∈ [0,90]，定义见文件头。 */
export type FaceSlope = { faceId: number; slopeDeg: number; cls: SlopeClass }

export type SlopeReport = {
  faces: FaceSlope[]
  min: number   // 全部面最细倾角(度)（最平）
  max: number   // 全部面最大倾角(度)（最陡）
}

export type SlopeOpts = {
  flatDeg?: number    // ≤ 此值 = flat，默认 30
  steepDeg?: number   // ≥ 此值 = steep，默认 60
}

/**
 * 由一个三角 run 算【面积加权单位法向】（同 draftAnalysis.faceUnitNormal 同款；本模块自带一份保持零 import）。
 * 三角 cross = 2×面积×单位法向 → 直接累加各三角 cross（本身带面积权）。退化（零长）→ null。
 */
function faceUnitNormal(vertices: ArrayLike<number>, triangles: ArrayLike<number>, group: FaceGroup): Vec3 | null {
  let nx = 0, ny = 0, nz = 0
  const end = group.start + group.count
  for (let i = group.start; i + 2 < end; i += 3) {
    const a = triangles[i] * 3, b = triangles[i + 1] * 3, c = triangles[i + 2] * 3
    const ax = vertices[a], ay = vertices[a + 1], az = vertices[a + 2]
    const bx = vertices[b], by = vertices[b + 1], bz = vertices[b + 2]
    const cx = vertices[c], cy = vertices[c + 1], cz = vertices[c + 2]
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az
    nx += e1y * e2z - e1z * e2y
    ny += e1z * e2x - e1x * e2z
    nz += e1x * e2y - e1y * e2x
  }
  const len = Math.hypot(nx, ny, nz)
  if (len <= EPS) return null
  return [nx / len, ny / len, nz / len]
}

/**
 * 斜度分析 vs 参考方向。
 *
 * @param vertices   扁平顶点数组 [x0,y0,z0, …]
 * @param triangles  扁平三角索引数组（每 3 个一三角，值系顶点【序号】）
 * @param faceGroups 逐 B-rep 面嘅三角 run；start/count 系 triangles 数组下标
 * @param refDir     参考方向（默认 +Z 水平基准），任意非零长度，内部归一化
 * @param opts       flat/steep 门槛(度)
 * @returns { faces:[{faceId, slopeDeg, cls}], min, max }
 */
export function analyzeSlope(
  vertices: number[],
  triangles: number[],
  faceGroups: FaceGroup[],
  refDir: [number, number, number],
  opts?: SlopeOpts,
): SlopeReport {
  const flat = opts?.flatDeg ?? 30
  const steep = opts?.steepDeg ?? 60

  const [rx, ry, rz] = refDir
  const rLen = Math.hypot(rx, ry, rz)
  const ref: Vec3 | null = rLen > EPS ? [rx / rLen, ry / rLen, rz / rLen] : null

  const faces: FaceSlope[] = []
  let min = Infinity
  let max = -Infinity

  for (const g of faceGroups) {
    let slopeDeg = 0   // 退化默认（保守当平）

    const n = ref ? faceUnitNormal(vertices, triangles, g) : null
    if (n && ref) {
      let d = Math.abs(n[0] * ref[0] + n[1] * ref[1] + n[2] * ref[2])
      if (d > 1) d = 1   // clamp 防浮点越界令 acos 返 NaN
      slopeDeg = Math.acos(d) * RAD2DEG   // [0,90]：0=平(法向∥ref) 90=竖直壁(法向⊥ref)
    }

    const cls: SlopeClass = slopeDeg <= flat ? 'flat' : slopeDeg >= steep ? 'steep' : 'transition'
    faces.push({ faceId: g.faceId, slopeDeg, cls })
    if (slopeDeg < min) min = slopeDeg
    if (slopeDeg > max) max = slopeDeg
  }

  if (faces.length === 0) { min = 0; max = 0 }

  return { faces, min, max }
}
