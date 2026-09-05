// draftAnalysis.ts — 「拔模角分析 vs 脱模方向」（对标 Fusion Inspect ▸ Draft Analysis）
//
// 用途：注塑/压铸/锻造件做开模检查 —— 畀一个【脱模方向 pullDir】（动模拉出方向），
//   逐张 B-rep 面算出佢相对【脱模方向】嘅【拔模角 draft angle】，再分类：边啲面顺利脱模、
//   边啲面贴正模壁（垂直 = 要侧抽 side-action）、边啲面系倒扣（undercut，反向拔模，脱唔出）。
//
// ── 拔模角定义（务必睇清，呢个系本模块嘅唯一契约）────────────────────────────────
//   draft angle = 面法向 n̂ 同【垂直于 pullDir 嘅平面】之间嘅【带符号】夹角(度)。
//   等价写法：draftAngle = asin( clamp( n̂ · p̂ , -1, 1 ) )，p̂ = 单位脱模方向。
//     · n̂·p̂ = sin(法向同 pull 之间夹角) 嘅【余角】关系 → asin 直接畀返「面相对脱模平面倾几多」。
//     · n̂ 同 p̂ 完全同向（面朝正脱模方向，如顶面）→ dot=+1 → +90°。
//     · n̂ 同 p̂ 完全反向（面朝返动模，如底面）→ dot=-1 → -90°。
//     · n̂ ⊥ p̂（面平行于脱模方向，如侧壁）→ dot=0 → 0°（垂直面 = 临界，要侧抽）。
//   符号约定（同 Fusion 一致）：
//     · 正拔模 positive（draft ≥ +tol）：面随脱模方向【张开】→ 脱模顺，好。
//     · 负拔模 negative（draft ≤ -tol）：面随脱模方向【收窄】/朝返动模 → 脱模拖拉甚至倒扣。
//       倒扣 undercut 喺「趋势」上同 negative 同类（题目要求 cls 归 'negative'）。
//     · 垂直 vertical（|draft| < tol）：面【平行于脱模方向】→ 0 拔模，理论上贴模壁、要侧抽。
//
// ── 诚实边界 ────────────────────────────────────────────────────────────────
//   1. 呢个系【离散三角网】上嘅【面积加权平均法向】拔模角，唔系 B-rep 解析法向。平面/柱面
//      上准到浮点；自由曲面（一张面内法向变化大）只得返【平均】拔模角，单一数字会掩盖面内
//      最差点 —— 真 Fusion 仲会逐三角着色显示梯度。本模块只做逐面汇总（接线/着色由调用方做）。
//   2. cls 'vertical' 用咗 tol 容差带：|draft|<tol 当垂直。tol 太细 → 噪声面误判；太粗 →
//      细微倒扣畀当垂直放过。默认 1° 系业界常用「最小安全拔模」量级附近嘅保守值。
//   3. 退化面（零面积 / 零长 pullDir）→ 法向/方向取唔到 → draftAngle=0、cls='vertical'（保守
//      当「临界」，唔会错报正拔模畀人以为脱得到）。
//
// 纯函数、零 import、无副作用（无 React / store / worker）。接线（worker 算 faceGroups、
// store 存 pullDir、Viewport 着色）一律由调用方自己做 —— 同 faceFingerprint.ts 一致。

const EPS = 1e-12
const RAD2DEG = 180 / Math.PI

type Vec3 = [number, number, number]

/** OCCT mesh 一张 B-rep 面对应嘅三角 run：start/count 系 triangles【数组下标】(=三角序号×3)。 */
export type FaceGroup = { start: number; count: number; faceId: number }

/** 拔模分类。undercut 喺趋势上并入 negative（题目要求）；vertical = 平行脱模方向 = 要侧抽。 */
export type DraftClass = 'positive' | 'negative' | 'vertical'

/** 逐面拔模结果。draftAngleDeg ∈ [-90, +90]，符号见文件头定义。 */
export type FaceDraft = { faceId: number; draftAngleDeg: number; cls: DraftClass }

export type DraftReport = {
  faces: FaceDraft[]
  min: number   // 全部面最细（最负）拔模角(度) —— 最危险/最深倒扣
  max: number   // 全部面最大（最正）拔模角(度)
}

export type DraftOpts = {
  tolDeg?: number   // 垂直容差带半宽(度)，默认 1°。|draft|<tol → vertical；±tol 为正/负拔模门槛。
}

/**
 * 由一个三角 run 算【面积加权单位法向】。
 * 三角形 cross = 2×面积×单位法向 → 直接累加各三角 cross，本身已带面积权（共面三角同向叠加，
 * 曲面则得返面积加权平均朝向）。绕向决定法向正负 —— 调用方负责畀外向绕向（OCCT mesh 已保证）。
 * 退化（总和零长，如零面积面或法向互相抵消）→ 返回 null，由调用方当退化处理。
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
    // cross(e1, e2) = 2×三角面积×单位法向（长度即权重）
    nx += e1y * e2z - e1z * e2y
    ny += e1z * e2x - e1x * e2z
    nz += e1x * e2y - e1y * e2x
  }
  const len = Math.hypot(nx, ny, nz)
  if (len <= EPS) return null
  return [nx / len, ny / len, nz / len]
}

/**
 * 拔模角分析 vs 脱模方向。
 *
 * @param vertices   扁平顶点数组 [x0,y0,z0, x1,y1,z1, …]
 * @param triangles  扁平三角索引数组（每 3 个一三角，值系顶点【序号】，非数组下标）
 * @param faceGroups 逐 B-rep 面嘅三角 run；start/count 系 triangles 数组下标（3 个/三角）
 * @param pullDir    脱模方向（动模拉出方向），任意非零长度，内部归一化
 * @param opts.tolDeg 垂直容差带半宽(度)，默认 1
 * @returns { faces:[{faceId, draftAngleDeg, cls}], min, max }
 */
export function analyzeDraft(
  vertices: number[],
  triangles: number[],
  faceGroups: FaceGroup[],
  pullDir: [number, number, number],
  opts?: DraftOpts,
): DraftReport {
  const tol = opts?.tolDeg ?? 1

  // 归一化脱模方向；零长（无效输入）→ 全部面当退化（draft=0、vertical）。
  const [px, py, pz] = pullDir
  const pLen = Math.hypot(px, py, pz)
  const pull: Vec3 | null = pLen > EPS ? [px / pLen, py / pLen, pz / pLen] : null

  const faces: FaceDraft[] = []
  let min = Infinity
  let max = -Infinity

  for (const g of faceGroups) {
    let draftAngleDeg = 0   // 退化默认值（保守临界）

    const n = pull ? faceUnitNormal(vertices, triangles, g) : null
    if (n && pull) {
      // dot = n̂ · p̂ = sin(拔模角)；clamp 防浮点越界令 asin 返 NaN。
      let dot = n[0] * pull[0] + n[1] * pull[1] + n[2] * pull[2]
      if (dot > 1) dot = 1
      else if (dot < -1) dot = -1
      draftAngleDeg = Math.asin(dot) * RAD2DEG
    }

    // 分类：±tol 门槛。|draft|<tol → vertical（平行脱模 = 临界 = 要侧抽）。
    // 倒扣 undercut（法向朝返动模，draft 为负）喺趋势上并入 negative（题目要求）。
    let cls: DraftClass
    if (draftAngleDeg >= tol) cls = 'positive'
    else if (draftAngleDeg <= -tol) cls = 'negative'
    else cls = 'vertical'

    faces.push({ faceId: g.faceId, draftAngleDeg, cls })
    if (draftAngleDeg < min) min = draftAngleDeg
    if (draftAngleDeg > max) max = draftAngleDeg
  }

  // 无面 → min/max 退回 0（避免 ±Infinity 漏出契约）。
  if (faces.length === 0) { min = 0; max = 0 }

  return { faces, min, max }
}

// ── #174-4：逐三角拔模梯度着色（对标 Fusion 逐三角连续色 —— 补足逐面平均掩盖面内最差点嘅诚实缺口）──
// analyzeDraft 系逐面【平均】法向 → 单色；曲面一张面内法向变化大时睇唔到面内边缘倒扣。呢度逐三角形
// 各自算 draft = asin(n̂·p̂)，映射连续色阶（绿=正拔模 → 黄=垂直 → 红=倒扣），畀出面内渐变。
//   诚实边界：仲系离散三角网法向（非 B-rep 解析），细网格趋势收敛；颜色系连续插值非分类硬边。
export type DraftGradient = {
  positions: Float32Array   // 去索引（每三角 3 顶点 × xyz = 9 数），配合 colors 直接畀 three vertexColors
  colors: Float32Array      // 每顶点 rgb（同三角三顶点同色 = 逐三角 flat；面内跨三角渐变）
  angles: Float64Array      // 每三角拔模角(度) ∈ [-90,90]，畀测试 / 图例
  min: number
  max: number
}

/** draft 角(度) → 连续 rgb：红(倒扣<0) → 黄(≈0 垂直) → 绿(正拔模>0)。t = clamp(draft/span, -1,1)。 */
export function draftAngleColor(draftDeg: number, spanDeg = 20): [number, number, number] {
  const t = Math.max(-1, Math.min(1, draftDeg / Math.max(1e-6, spanDeg)))
  if (t >= 0) {
    // 黄 (0.88,0.69,0.13) → 绿 (0.18,0.62,0.36)
    const g = t
    return [0.88 + (0.18 - 0.88) * g, 0.69 + (0.62 - 0.69) * g, 0.13 + (0.36 - 0.13) * g]
  }
  // 黄 → 红 (0.82,0.23,0.19)
  const g = -t
  return [0.88 + (0.82 - 0.88) * g, 0.69 + (0.23 - 0.69) * g, 0.13 + (0.19 - 0.13) * g]
}

/** 逐三角拔模角(度)。退化三角(零面积)/零 pullDir → 该三角记 0（保守临界）。纯，零依赖。 */
export function draftPerTriangleAngles(vertices: ArrayLike<number>, triangles: ArrayLike<number>, pullDir: [number, number, number]): Float64Array {
  const F = Math.floor(triangles.length / 3)
  const out = new Float64Array(F)
  const pLen = Math.hypot(pullDir[0], pullDir[1], pullDir[2])
  if (pLen <= EPS) return out
  const px = pullDir[0] / pLen, py = pullDir[1] / pLen, pz = pullDir[2] / pLen
  for (let t = 0; t < F; t++) {
    const a = triangles[t * 3] * 3, b = triangles[t * 3 + 1] * 3, c = triangles[t * 3 + 2] * 3
    const ax = vertices[a], ay = vertices[a + 1], az = vertices[a + 2]
    const e1x = vertices[b] - ax, e1y = vertices[b + 1] - ay, e1z = vertices[b + 2] - az
    const e2x = vertices[c] - ax, e2y = vertices[c + 1] - ay, e2z = vertices[c + 2] - az
    let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x
    const nl = Math.hypot(nx, ny, nz)
    if (nl <= EPS) { out[t] = 0; continue }
    nx /= nl; ny /= nl; nz /= nl
    let dot = nx * px + ny * py + nz * pz
    if (dot > 1) dot = 1; else if (dot < -1) dot = -1
    out[t] = Math.asin(dot) * RAD2DEG
  }
  return out
}

/** 逐三角拔模梯度：去索引 position + 逐三角色。畀 overlay 直接建 BufferGeometry（无索引，flat 逐三角）。 */
export function analyzeDraftGradient(vertices: ArrayLike<number>, triangles: ArrayLike<number>, pullDir: [number, number, number], spanDeg = 20): DraftGradient {
  const angles = draftPerTriangleAngles(vertices, triangles, pullDir)
  const F = angles.length
  const positions = new Float32Array(F * 9)
  const colors = new Float32Array(F * 9)
  let min = Infinity, max = -Infinity
  for (let t = 0; t < F; t++) {
    const ia = triangles[t * 3], ib = triangles[t * 3 + 1], ic = triangles[t * 3 + 2]
    const [r, g, b] = draftAngleColor(angles[t], spanDeg)
    const idx = [ia, ib, ic]
    for (let k = 0; k < 3; k++) {
      const v = idx[k] * 3, o = t * 9 + k * 3
      positions[o] = vertices[v]; positions[o + 1] = vertices[v + 1]; positions[o + 2] = vertices[v + 2]
      colors[o] = r; colors[o + 1] = g; colors[o + 2] = b
    }
    if (angles[t] < min) min = angles[t]
    if (angles[t] > max) max = angles[t]
  }
  if (F === 0) { min = 0; max = 0 }
  return { positions, colors, angles, min, max }
}
