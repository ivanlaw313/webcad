// 切层预览核心 — 自研纯几何，零依赖（license-safe）。
//
// 目的：喺真正送去切片软件之前，逐层「试切」实体网格，揾出打印会失败嘅模式：
//   · 悬空孤岛 island —— 某层一个实体区，喺下一层（N−1）完全冇嘢承托 → 打印时浮空，必须加支撑。
//     呢种问题悬垂角分析（overhangScan）睇唔到：孤岛嘅墙可以完全垂直，逐面法线全部合格。
//   · 首层接触面积 —— 太细会甩板（bed adhesion）。
//   · 最薄层 —— 截面太细嘅位易断 / 挤出唔稳。
//   · 未闭合轮廓 —— 切出嚟嘅链锁唔埋 = 网格唔水密，切片软件会乱估内部。
//
// 坐标约定（HANDOFF §5）：mesh.vertices 系 CAD 坐标、Z 向上、单位 mm。切平面 = 水平面 z = const，
// 切出嘅 2D 轮廓喺 CAD XY 平面（俯视图）。
//
// 算法：
//   sliceMesh —— 单次扫一遍三角形：每个跨越 z 嘅三角形同平面相交出一条线段（顶点刚好落喺平面上
//   就推 1e-9 当「上方」，保证每个跨越三角形恰好出 0 或 1 条线段，冇退化分支）；线段方向用三角形
//   法线规整（方向 = Z×n，即实体喺线段左手边 → 外轮廓 CCW、孔 CW，前提系法线朝外）；最后按端点
//   哈希（量化到 0.01mm）逐条接龙成闭合 loop；接唔埋嘅链照样返回（open）—— 系唔水密嘅证据。
//
//   analyzeSlices —— 由 zMin+layerH/2 起每 layerH 一层（上限 400 层，再高自动加大层距并注明），
//   三角形按 zlo 排序 + 扫描线维护 active 集（成个分析 ≈ O(T log T + Σactive)，唔使每层扫全表）。
//   每层：闭合 loop 按「包含深度」规整方向（被偶数个其他 loop 包住 = 实体外轮廓，奇数 = 孔 ——
//   唔依赖网格法线方向，反咗法线嘅网格照样啱）；实体区净面积 = Σ(偶深 |A| − 奇深 |A|)。
//   孤岛判定：第 N 层每个实体 loop 取样（质心 + 最多 8 个沿轮廓、向质心内缩嘅点 —— 单靠质心
//   会喺环形截面出假阳性：圆环质心喺孔入面！），只保留落喺本层实体内嘅样本；冇一个样本落喺
//   N−1 层实体内 → 呢个区浮空 = 孤岛。第 0 层贴住打印床，唔算孤岛。
export type MeshLike = { vertices: Float32Array | number[]; triangles: Uint32Array | number[] }
export type Pt2 = [number, number]
export type SliceResult = { loops: Pt2[][]; open: Pt2[][] }
export type LoopClass = { areas: number[]; depth: number[]; solidIdx: number[] }
export type SliceAnalysis = {
  layers: number
  islands: { z: number; count: number }[]   // 净系列出有孤岛嘅层（z = 切面高度，count = 该层孤岛区数）
  firstLayerArea: number                    // 第 0 层净实体面积 mm²（床贴合）
  minArea: { z: number; area: number }      // 最薄（净面积最细、非空）嘅一层
  step: number                              // 实际采用嘅层距（≥ 入参 layerH；超 400 层会加大）
  zMin: number
  zMax: number
  openLayers: number                        // 出现未闭合轮廓嘅层数（>0 = 网格可能唔水密）
  note?: string                             // 层距被加大时嘅说明
}

const HASH = 100 // 端点量化格：1/100 mm = 0.01mm（OCCT 共享边算出嘅交点本身 bit 级一致，呢个系保险）
const keyOf = (x: number, y: number) => Math.round(x * HASH) + ':' + Math.round(y * HASH)

// 平面 z 同三角形集相交 → 有向线段 [x1,y1,x2,y2][]。idx 限定候选三角形（null = 全部）。
function sliceSegs(v: ArrayLike<number>, t: ArrayLike<number>, idx: number[] | null, z: number): number[][] {
  const segs: number[][] = []
  const n = idx ? idx.length : (t.length / 3) | 0
  for (let k = 0; k < n; k++) {
    const f = (idx ? idx[k] : k) * 3
    const a = t[f] * 3, b = t[f + 1] * 3, c = t[f + 2] * 3
    let d0 = v[a + 2] - z, d1 = v[b + 2] - z, d2 = v[c + 2] - z
    // 顶点刚好喺平面上 → 一致推到「上方」1e-9：跨越三角形恰好两条边相交，冇共线退化
    if (d0 === 0) d0 = 1e-9
    if (d1 === 0) d1 = 1e-9
    if (d2 === 0) d2 = 1e-9
    if ((d0 > 0 && d1 > 0 && d2 > 0) || (d0 < 0 && d1 < 0 && d2 < 0)) continue
    const P: number[] = []
    const hit = (ia: number, ib: number, da: number, db: number) => {
      if (da * db >= 0) return
      const s = da / (da - db)
      P.push(v[ia] + s * (v[ib] - v[ia]), v[ia + 1] + s * (v[ib + 1] - v[ia + 1]))
    }
    hit(a, b, d0, d1); hit(b, c, d1, d2); hit(c, a, d2, d0)
    if (P.length !== 4) continue
    let p1x = P[0], p1y = P[1], p2x = P[2], p2y = P[3]
    // 退化（两交点撞同一哈希格）→ 弃
    if (Math.round(p1x * HASH) === Math.round(p2x * HASH) && Math.round(p1y * HASH) === Math.round(p2y * HASH)) continue
    // 方向规整：线段方向 = Z × n（n = 三角形法线）→ 法线朝外时外轮廓 CCW、孔 CW
    const e1x = v[b] - v[a], e1y = v[b + 1] - v[a + 1], e1z = v[b + 2] - v[a + 2]
    const e2x = v[c] - v[a], e2y = v[c + 1] - v[a + 1], e2z = v[c + 2] - v[a + 2]
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z
    if ((p2x - p1x) * -ny + (p2y - p1y) * nx < 0) {
      const tx = p1x, ty = p1y; p1x = p2x; p1y = p2y; p2x = tx; p2y = ty
    }
    segs.push([p1x, p1y, p2x, p2y])
  }
  return segs
}

// 线段接龙：端点哈希 → 顺住链行（优先顺向 start 接 end；容忍个别反咗向嘅三角形，end 对 end 时反转）。
// 闭合（首尾同一哈希格、≥3 点）→ loops；锁唔埋 → open（唔水密证据）。
function chainSegs(segs: number[][]): SliceResult {
  const startMap = new Map<string, number[]>(), endMap = new Map<string, number[]>()
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]
    const ks = keyOf(s[0], s[1]), ke = keyOf(s[2], s[3])
    const ls = startMap.get(ks); if (ls) ls.push(i); else startMap.set(ks, [i])
    const le = endMap.get(ke); if (le) le.push(i); else endMap.set(ke, [i])
  }
  const used = new Uint8Array(segs.length)
  const findUnused = (list?: number[]): number => {
    if (list) for (const j of list) if (!used[j]) return j
    return -1
  }
  const loops: Pt2[][] = [], open: Pt2[][] = []
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue
    used[i] = 1
    const s0 = segs[i]
    const pts: Pt2[] = [[s0[0], s0[1]], [s0[2], s0[3]]]
    for (;;) { // 向前接龙
      const e = pts[pts.length - 1], k = keyOf(e[0], e[1])
      let j = findUnused(startMap.get(k))
      if (j >= 0) { used[j] = 1; pts.push([segs[j][2], segs[j][3]]); continue }
      j = findUnused(endMap.get(k))
      if (j >= 0) { used[j] = 1; pts.push([segs[j][0], segs[j][1]]); continue }
      break
    }
    let closed = pts.length >= 4 && keyOf(pts[0][0], pts[0][1]) === keyOf(pts[pts.length - 1][0], pts[pts.length - 1][1])
    if (!closed) {
      for (;;) { // 起点可能喺链中间 → 再向后接
        const h = pts[0], k = keyOf(h[0], h[1])
        let j = findUnused(endMap.get(k))
        if (j >= 0) { used[j] = 1; pts.unshift([segs[j][0], segs[j][1]]); continue }
        j = findUnused(startMap.get(k))
        if (j >= 0) { used[j] = 1; pts.unshift([segs[j][2], segs[j][3]]); continue }
        break
      }
      closed = pts.length >= 4 && keyOf(pts[0][0], pts[0][1]) === keyOf(pts[pts.length - 1][0], pts[pts.length - 1][1])
    }
    if (closed) { pts.pop(); loops.push(pts) } else open.push(pts)
  }
  return { loops, open }
}

// 单层切片：平面-三角形相交 + 接龙。纯函数，单次扫一遍三角形。
export function sliceMesh(mesh: MeshLike, z: number): SliceResult {
  return chainSegs(sliceSegs(mesh.vertices, mesh.triangles, null, z))
}

// 鞋带公式有符号面积（CCW 为正）。
export function signedArea(loop: Pt2[]): number {
  let s = 0
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) s += loop[j][0] * loop[i][1] - loop[i][0] * loop[j][1]
  return s / 2
}

// 射线法点喺多边形内（边界上唔保证，调用方自己内缩样本）。
export function pointInLoop(x: number, y: number, loop: Pt2[]): boolean {
  let inside = false
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const yi = loop[i][1], yj = loop[j][1]
    if ((yi > y) !== (yj > y) && x < ((loop[j][0] - loop[i][0]) * (y - yi)) / (yj - yi) + loop[i][0]) inside = !inside
  }
  return inside
}

// 偶奇规则：点被奇数个 loop 包住 = 喺实体入面（孔自动抠走，唔使配对外轮廓-孔）。
export function pointInSolid(x: number, y: number, loops: Pt2[][]): boolean {
  let cnt = 0
  for (const lp of loops) if (pointInLoop(x, y, lp)) cnt++
  return (cnt & 1) === 1
}

// 面积质心（A 接近 0 时退化用首点）。
function centroidOf(loop: Pt2[], A: number): Pt2 {
  if (Math.abs(A) < 1e-9) return [loop[0][0], loop[0][1]]
  let cx = 0, cy = 0
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const cr = loop[j][0] * loop[i][1] - loop[i][0] * loop[j][1]
    cx += (loop[j][0] + loop[i][0]) * cr
    cy += (loop[j][1] + loop[i][1]) * cr
  }
  return [cx / (6 * A), cy / (6 * A)]
}

// 方向规整：每个 loop 数自己被几多个其他 loop 包住（取自身一个顶点测试 —— 顶点唔会喺其他
// loop 边界上，除非相切）。偶深 = 实体外轮廓，奇深 = 孔。唔依赖网格法线方向。
export function classifyLoops(loops: Pt2[][]): LoopClass {
  const areas = loops.map(signedArea)
  const depth = loops.map((lp, i) => {
    let d = 0
    for (let j = 0; j < loops.length; j++) if (j !== i && pointInLoop(lp[0][0], lp[0][1], loops[j])) d++
    return d
  })
  const solidIdx: number[] = []
  for (let i = 0; i < loops.length; i++) if (depth[i] % 2 === 0 && Math.abs(areas[i]) > 1e-6) solidIdx.push(i)
  return { areas, depth, solidIdx }
}

// 一层嘅净实体面积：Σ(偶深 +|A|，奇深 −|A|)。
export function netArea(cls: LoopClass): number {
  let s = 0
  for (let i = 0; i < cls.areas.length; i++) s += (cls.depth[i] % 2 === 0 ? 1 : -1) * Math.abs(cls.areas[i])
  return Math.max(0, s)
}

// 本层（cur）相对上一层（prev）嘅孤岛：返回 cur 中浮空实体 loop 嘅索引。
// 取样 = 质心 + 沿轮廓最多 8 个向质心内缩嘅点（内缩距按面积自适应，0.02~0.5mm）；
// 先过滤剩落喺本层实体内嘅样本（环形截面质心喺孔入面 → 被剔走，靠轮廓样本，免假阳性）；
// 全部样本都唔喺 prev 实体内 → 孤岛。prev 为空层 = 下面冇任何嘢 → 全部都系孤岛（啱）。
export function layerIslands(cur: Pt2[][], prev: Pt2[][], cls?: LoopClass): number[] {
  const c = cls ?? classifyLoops(cur)
  const out: number[] = []
  for (const i of c.solidIdx) {
    const lp = cur[i], A = c.areas[i]
    const cen = centroidOf(lp, A)
    const inset = Math.max(0.02, Math.min(0.5, 0.1 * Math.sqrt(Math.abs(A))))
    const cand: Pt2[] = [cen]
    const stride = Math.max(1, Math.floor(lp.length / 8))
    for (let k = 0; k < lp.length; k += stride) {
      const dx = cen[0] - lp[k][0], dy = cen[1] - lp[k][1], L = Math.hypot(dx, dy)
      if (L > inset) cand.push([lp[k][0] + (dx / L) * inset, lp[k][1] + (dy / L) * inset])
    }
    let samples = cand.filter((p) => pointInSolid(p[0], p[1], cur))
    if (!samples.length) samples = [cen]
    if (!samples.some((p) => pointInSolid(p[0], p[1], prev))) out.push(i)
  }
  return out
}

// 全模型逐层分析。层 z = zMin + step/2 + i·step；超 400 层自动加大 step 并喺 note 注明。
export function analyzeSlices(mesh: MeshLike, layerH: number): SliceAnalysis {
  const v = mesh.vertices, t = mesh.triangles
  let zMin = Infinity, zMax = -Infinity
  for (let i = 2; i < v.length; i += 3) {
    const zz = v[i]
    if (zz < zMin) zMin = zz
    if (zz > zMax) zMax = zz
  }
  if (!(zMax > zMin) || t.length < 3 || !(layerH > 0))
    return { layers: 0, islands: [], firstLayerArea: 0, minArea: { z: 0, area: 0 }, step: layerH || 0.2, zMin: 0, zMax: 0, openLayers: 0 }
  const height = zMax - zMin
  let step = layerH
  let layers = Math.max(1, Math.ceil(height / step - 0.5))
  let note: string | undefined
  if (layers > 400) {
    step = height / 400
    layers = Math.max(1, Math.ceil(height / step - 0.5))
    note = `模型高 ${height.toFixed(1)}mm 超 400 层上限，分析层距已加大到 ${step.toFixed(3)}mm`
  }
  // 扫描线：三角形按 zlo 排序，逐层推入 active、剔走 zhi < z 嘅 → 每层只切跨越嗰层嘅三角形
  const nT = (t.length / 3) | 0
  const zlo = new Float64Array(nT), zhi = new Float64Array(nT)
  for (let i = 0; i < nT; i++) {
    const z0 = v[t[i * 3] * 3 + 2], z1 = v[t[i * 3 + 1] * 3 + 2], z2 = v[t[i * 3 + 2] * 3 + 2]
    zlo[i] = Math.min(z0, z1, z2)
    zhi[i] = Math.max(z0, z1, z2)
  }
  const order: number[] = []
  for (let i = 0; i < nT; i++) order.push(i)
  order.sort((a, b) => zlo[a] - zlo[b])
  let ptr = 0
  let active: number[] = []
  let prevLoops: Pt2[][] = []
  const islands: { z: number; count: number }[] = []
  let firstLayerArea = 0
  let minA = Infinity, minZ = zMin + step / 2
  let openLayers = 0
  for (let i = 0; i < layers; i++) {
    const z = zMin + step / 2 + i * step
    while (ptr < nT && zlo[order[ptr]] <= z) active.push(order[ptr++])
    if (active.length) active = active.filter((k) => zhi[k] >= z)
    const { loops, open } = chainSegs(sliceSegs(v, t, active, z))
    if (open.length) openLayers++
    const cls = classifyLoops(loops)
    const area = netArea(cls)
    if (i === 0) firstLayerArea = area
    if (area > 1e-6 && area < minA) { minA = area; minZ = z }
    if (i > 0) {
      const isl = layerIslands(loops, prevLoops, cls)
      if (isl.length) islands.push({ z, count: isl.length })
    }
    prevLoops = loops
  }
  return {
    layers, islands, firstLayerArea,
    minArea: { z: minZ, area: minA === Infinity ? 0 : minA },
    step, zMin, zMax, openLayers, note,
  }
}
