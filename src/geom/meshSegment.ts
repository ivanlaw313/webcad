// 网格平面区识别（参数化推断基石）—— region-growing 把三角按【共面】聚成平面区。
// Fusion「Recognize / Mesh→B-rep 特征识别」前置：识别到嘅平面区 = 可转【精确平面】(替 faceted)。
// 纯函数零 import → Node 可测（项目第一道防线）。距离/角度容差按模型尺度自适应由调用方传。
export interface PlanarRegion {
  normal: [number, number, number]   // 区平面单位法向（面积加权平均）
  d: number                          // 平面方程 n·x = d 嘅 d（用区代表点算）
  area: number                       // 区总面积 mm²
  triCount: number
  triIndices: number[]               // 组成三角喺 triangles 入面嘅【三角序号】(i/3)
}

const sub = (a: number[], b: number[]): [number, number, number] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: number[], b: number[]): [number, number, number] => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a: number[], b: number[]): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/**
 * 把三角网格分割成共面区（region growing）。
 * @param vertices 扁平 [x,y,z,...]
 * @param triangles 扁平索引 [i0,i1,i2,...]
 * @param angleTolDeg 邻接三角法向夹角容差（°）—— 区内法向偏差上限
 * @param distTol     候选三角中心到种子平面距离容差（mm）—— 共面性
 * @returns 平面区数组，按面积降序
 */
export function segmentPlanarRegions(
  vertices: ArrayLike<number>,
  triangles: ArrayLike<number>,
  angleTolDeg = 8,
  distTol = 0.5,
): PlanarRegion[] {
  const nT = Math.floor(triangles.length / 3)
  if (nT === 0) return []
  const cosTol = Math.cos((Math.max(0, angleTolDeg) * Math.PI) / 180)

  // 每三角：法向（单位）、面积、中心
  const triN: [number, number, number][] = new Array(nT)
  const triC: [number, number, number][] = new Array(nT)
  const triA: number[] = new Array(nT)
  const vAt = (vi: number): [number, number, number] => [vertices[vi * 3] as number, vertices[vi * 3 + 1] as number, vertices[vi * 3 + 2] as number]
  for (let t = 0; t < nT; t++) {
    const a = vAt(triangles[t * 3] as number), b = vAt(triangles[t * 3 + 1] as number), c = vAt(triangles[t * 3 + 2] as number)
    const cr = cross(sub(b, a), sub(c, a))
    const len = Math.hypot(cr[0], cr[1], cr[2])
    triA[t] = len / 2
    triN[t] = len > 1e-12 ? [cr[0] / len, cr[1] / len, cr[2] / len] : [0, 0, 0]
    triC[t] = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]
  }

  // 焊接顶点（量化位置）→ 边邻接（共边即相邻），稳健对付未焊接 STL
  const q = Math.max(1e-6, distTol * 0.05)
  const keyOf = (p: number[]): string => `${Math.round(p[0] / q)},${Math.round(p[1] / q)},${Math.round(p[2] / q)}`
  const vKey: number[] = new Array(Math.floor(vertices.length / 3))
  const keyMap = new Map<string, number>()
  for (let i = 0; i < vKey.length; i++) { const k = keyOf(vAt(i)); let id = keyMap.get(k); if (id == null) { id = keyMap.size; keyMap.set(k, id) } vKey[i] = id }
  const edgeKey = (a: number, b: number): string => (a < b ? a + '_' + b : b + '_' + a)
  const edgeTris = new Map<string, number[]>()
  for (let t = 0; t < nT; t++) {
    const w = [vKey[triangles[t * 3] as number], vKey[triangles[t * 3 + 1] as number], vKey[triangles[t * 3 + 2] as number]]
    for (let e = 0; e < 3; e++) { const k = edgeKey(w[e], w[(e + 1) % 3]); const arr = edgeTris.get(k); if (arr) arr.push(t); else edgeTris.set(k, [t]) }
  }
  const neighbors = (t: number): number[] => {
    const out: number[] = []
    const w = [vKey[triangles[t * 3] as number], vKey[triangles[t * 3 + 1] as number], vKey[triangles[t * 3 + 2] as number]]
    for (let e = 0; e < 3; e++) { const arr = edgeTris.get(edgeKey(w[e], w[(e + 1) % 3])); if (arr) for (const o of arr) if (o !== t) out.push(o) }
    return out
  }

  // region grow：种子未访问三角 → BFS 收【法向夹角 ≤ 容差 且 中心落种子平面距离 ≤ 容差】嘅邻接三角
  const seen = new Uint8Array(nT)
  const regions: PlanarRegion[] = []
  for (let s = 0; s < nT; s++) {
    if (seen[s] || triA[s] <= 0) continue
    const sn = triN[s], sd = dot(sn, triC[s])   // 种子平面 n·x = d
    const idx: number[] = []
    const stack = [s]; seen[s] = 1
    while (stack.length) {
      const t = stack.pop() as number
      idx.push(t)
      for (const o of neighbors(t)) {
        if (seen[o] || triA[o] <= 0) continue
        if (dot(sn, triN[o]) < cosTol) continue                 // 法向偏太多
        if (Math.abs(dot(sn, triC[o]) - sd) > distTol) continue // 离种子平面太远（非共面 → 曲面/台阶）
        seen[o] = 1; stack.push(o)
      }
    }
    // 区面积加权法向 + 代表点 d
    let nx = 0, ny = 0, nz = 0, area = 0, px = 0, py = 0, pz = 0
    for (const t of idx) { const w = triA[t]; const n = triN[t]; const sgn = dot(n, sn) < 0 ? -1 : 1; nx += sgn * n[0] * w; ny += sgn * n[1] * w; nz += sgn * n[2] * w; area += w; px += triC[t][0] * w; py += triC[t][1] * w; pz += triC[t][2] * w }
    const nl = Math.hypot(nx, ny, nz) || 1
    const normal: [number, number, number] = [nx / nl, ny / nl, nz / nl]
    const rep: [number, number, number] = [px / (area || 1), py / (area || 1), pz / (area || 1)]
    regions.push({ normal, d: dot(normal, rep), area, triCount: idx.length, triIndices: idx })
  }
  regions.sort((a, b) => b.area - a.area)
  return regions
}

/** 概要：识别到嘅显著平面区（面积 ≥ 总面积 minFrac）数目 + 占比，俾 inspect 读数用。 */
export function planarRegionSummary(regions: PlanarRegion[], minFrac = 0.01): { total: number; significant: number; coveredFrac: number; top: PlanarRegion[] } {
  const totalArea = regions.reduce((s, r) => s + r.area, 0) || 1
  const sig = regions.filter((r) => r.area / totalArea >= minFrac)
  const covered = sig.reduce((s, r) => s + r.area, 0) / totalArea
  return { total: regions.length, significant: sig.length, coveredFrac: covered, top: sig.slice(0, 12) }
}

// ── GM-W4 4.4(a)：网格量度助手（趋势级 / 近似）───────────────────────────────────────
// 导入网格件冇 B-rep 身份（worker 版量边/量面靠 OCCT 边/面拓扑），呢度用纯几何近似俾网格件量度。
// 坐标 = 网格自身局部系；组件摆位/旋转系刚体变换（保长度/面积），故局部量度 = 世界量度。纯函数零依赖，Node 可测。
const _vec = (v: ArrayLike<number>, i: number): [number, number, number] => [v[i * 3] as number, v[i * 3 + 1] as number, v[i * 3 + 2] as number]
const _triNorm = (v: ArrayLike<number>, t: ArrayLike<number>, ti: number): [number, number, number] => {
  const a = _vec(v, t[ti * 3] as number), b = _vec(v, t[ti * 3 + 1] as number), c = _vec(v, t[ti * 3 + 2] as number)
  const cr = cross(sub(b, a), sub(c, a)); const len = Math.hypot(cr[0], cr[1], cr[2])
  return len > 1e-12 ? [cr[0] / len, cr[1] / len, cr[2] / len] : [0, 0, 0]
}
const _triAreaC = (v: ArrayLike<number>, t: ArrayLike<number>, ti: number): { area: number; c: [number, number, number] } => {
  const a = _vec(v, t[ti * 3] as number), b = _vec(v, t[ti * 3 + 1] as number), c = _vec(v, t[ti * 3 + 2] as number)
  const cr = cross(sub(b, a), sub(c, a))
  return { area: Math.hypot(cr[0], cr[1], cr[2]) / 2, c: [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3] }
}
// 焊接顶点（量化位置，跨重复 / 未焊接 STL）→ 每原顶点→焊接 id + 焊接 id→代表坐标。
function weldVerts(vertices: ArrayLike<number>, q: number): { vKey: number[]; pos: [number, number, number][] } {
  const nV = Math.floor(vertices.length / 3)
  const vKey = new Array<number>(nV)
  const pos: [number, number, number][] = []
  const map = new Map<string, number>()
  for (let i = 0; i < nV; i++) {
    const p = _vec(vertices, i)
    const k = `${Math.round(p[0] / q)},${Math.round(p[1] / q)},${Math.round(p[2] / q)}`
    let id = map.get(k)
    if (id == null) { id = pos.length; map.set(k, id); pos.push(p) }
    vKey[i] = id
  }
  return { vKey, pos }
}
function bboxDiag(vertices: ArrayLike<number>): number {
  let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity
  for (let i = 0; i < vertices.length; i += 3) { const x = vertices[i] as number, y = vertices[i + 1] as number, z = vertices[i + 2] as number; if (x < mnx) mnx = x; if (y < mny) mny = y; if (z < mnz) mnz = z; if (x > mxx) mxx = x; if (y > mxy) mxy = y; if (z > mxz) mxz = z }
  return Math.hypot(mxx - mnx, mxy - mny, mxz - mnz) || 1
}
function distPtSeg(p: [number, number, number], a: [number, number, number], b: [number, number, number]): number {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2]
  const apx = p[0] - a[0], apy = p[1] - a[1], apz = p[2] - a[2]
  const L2 = abx * abx + aby * aby + abz * abz || 1e-12
  let s = (apx * abx + apy * aby + apz * abz) / L2; s = Math.max(0, Math.min(1, s))
  return Math.hypot(apx - abx * s, apy - aby * s, apz - abz * s)
}

export interface MeshFaceMeasure { area: number; triCount: number; planar: boolean; normal: [number, number, number] }
/**
 * 量面（近似）：由拾中三角 region-grow 收【共面区】（同 segmentPlanarRegions 准则：邻接三角法向夹角 ≤ angleTolDeg 且落种子平面 ≤ distTol），
 * 返区总面积 + 面积加权法向。planar = 区含多三角（真平面），否则孤立三角（自由曲面 → 只报单三角面积）。
 */
export function measureMeshFaceRegion(vertices: ArrayLike<number>, triangles: ArrayLike<number>, faceIndex: number, angleTolDeg = 8, distTol?: number): MeshFaceMeasure {
  const nT = Math.floor(triangles.length / 3)
  const empty: MeshFaceMeasure = { area: 0, triCount: 0, planar: false, normal: [0, 0, 0] }
  if (faceIndex < 0 || faceIndex >= nT) return empty
  const dt = distTol ?? Math.max(0.05, bboxDiag(vertices) * 0.003)
  const q = Math.max(1e-6, dt * 0.05)
  const { vKey } = weldVerts(vertices, q)
  const ek = (a: number, b: number) => (a < b ? a + '_' + b : b + '_' + a)
  const edgeTris = new Map<string, number[]>()
  for (let t = 0; t < nT; t++) {
    const w = [vKey[triangles[t * 3] as number], vKey[triangles[t * 3 + 1] as number], vKey[triangles[t * 3 + 2] as number]]
    for (let e = 0; e < 3; e++) { const k = ek(w[e], w[(e + 1) % 3]); const arr = edgeTris.get(k); if (arr) arr.push(t); else edgeTris.set(k, [t]) }
  }
  const neighbors = (t: number): number[] => {
    const out: number[] = []
    const w = [vKey[triangles[t * 3] as number], vKey[triangles[t * 3 + 1] as number], vKey[triangles[t * 3 + 2] as number]]
    for (let e = 0; e < 3; e++) { const arr = edgeTris.get(ek(w[e], w[(e + 1) % 3])); if (arr) for (const o of arr) if (o !== t) out.push(o) }
    return out
  }
  const cosTol = Math.cos((Math.max(0, angleTolDeg) * Math.PI) / 180)
  const sn = _triNorm(vertices, triangles, faceIndex)
  const seed = _triAreaC(vertices, triangles, faceIndex); const sd = dot(sn, seed.c)
  const seen = new Uint8Array(nT); const idx: number[] = []; const stack = [faceIndex]; seen[faceIndex] = 1
  while (stack.length) {
    const cur = stack.pop() as number; idx.push(cur)
    for (const o of neighbors(cur)) {
      if (seen[o]) continue
      const no = _triNorm(vertices, triangles, o)
      if (dot(sn, no) < cosTol) continue
      if (Math.abs(dot(sn, _triAreaC(vertices, triangles, o).c) - sd) > dt) continue
      seen[o] = 1; stack.push(o)
    }
  }
  let area = 0, nx = 0, ny = 0, nz = 0
  for (const ti of idx) { const ac = _triAreaC(vertices, triangles, ti); const no = _triNorm(vertices, triangles, ti); const sgn = dot(no, sn) < 0 ? -1 : 1; nx += sgn * no[0] * ac.area; ny += sgn * no[1] * ac.area; nz += sgn * no[2] * ac.area; area += ac.area }
  const nl = Math.hypot(nx, ny, nz) || 1
  return { area, triCount: idx.length, planar: idx.length > 1, normal: [nx / nl, ny / nl, nz / nl] }
}

export interface MeshEdgeMeasure { length: number; closed: boolean; feature: boolean; radius: number | null; segCount: number }
/**
 * 量边（近似）：拾中三角 3 条边取【最近 localPt 嗰条特征边】（特征边 = 边界边 / 二面角 > sharpDeg），
 * 再沿特征边链行（焊接顶点度 = 2 处续接，遇角 / 分叉即停），累加长度。闭合环 + 半径方差细 → 报圆棱 Ø。
 * 拾中位置附近冇特征边（点喺平面中间）→ 报最近三角边长（feature=false，诚实标近似非特征棱）。
 */
export function measureMeshEdgeChain(vertices: ArrayLike<number>, triangles: ArrayLike<number>, faceIndex: number, localPt: [number, number, number], sharpDeg = 25, weldTol?: number): MeshEdgeMeasure {
  const nT = Math.floor(triangles.length / 3)
  const empty: MeshEdgeMeasure = { length: 0, closed: false, feature: false, radius: null, segCount: 0 }
  if (faceIndex < 0 || faceIndex >= nT) return empty
  const q = Math.max(1e-6, weldTol ?? bboxDiag(vertices) * 5e-4)
  const { vKey, pos } = weldVerts(vertices, q)
  interface E { a: number; b: number; tris: number[] }
  const edges = new Map<string, E>()
  const ek = (a: number, b: number) => (a < b ? a + '_' + b : b + '_' + a)
  for (let t = 0; t < nT; t++) {
    const w = [vKey[triangles[t * 3] as number], vKey[triangles[t * 3 + 1] as number], vKey[triangles[t * 3 + 2] as number]]
    for (let e = 0; e < 3; e++) { const a = w[e], b = w[(e + 1) % 3]; if (a === b) continue; const k = ek(a, b); let it = edges.get(k); if (!it) { it = { a: Math.min(a, b), b: Math.max(a, b), tris: [] }; edges.set(k, it) } it.tris.push(t) }
  }
  const eLen = (it: E) => { const pa = pos[it.a], pb = pos[it.b]; return Math.hypot(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]) }
  const cosSharp = Math.cos((sharpDeg * Math.PI) / 180)
  const isFeature = (it: E): boolean => {
    if (it.tris.length !== 2) return true   // 边界边（1）/ 非流形（≥3）→ 当特征棱
    const n0 = _triNorm(vertices, triangles, it.tris[0]), n1 = _triNorm(vertices, triangles, it.tris[1])
    return dot(n0, n1) < cosSharp             // 二面角 > sharpDeg
  }
  const pw = [vKey[triangles[faceIndex * 3] as number], vKey[triangles[faceIndex * 3 + 1] as number], vKey[triangles[faceIndex * 3 + 2] as number]]
  let best: E | null = null, bestD = Infinity, bestFeat: E | null = null, bestFeatD = Infinity
  for (let e = 0; e < 3; e++) { const a = pw[e], b = pw[(e + 1) % 3]; if (a === b) continue; const it = edges.get(ek(a, b)); if (!it) continue; const d = distPtSeg(localPt, pos[it.a], pos[it.b]); if (d < bestD) { bestD = d; best = it } if (isFeature(it) && d < bestFeatD) { bestFeatD = d; bestFeat = it } }
  const chosen = bestFeat || best
  if (!chosen) return empty
  if (!isFeature(chosen)) return { length: eLen(chosen), closed: false, feature: false, radius: null, segCount: 1 }
  // 特征边邻接（焊接顶点 → 相连特征边 key）
  const featInc = new Map<number, string[]>()
  for (const [k, it] of edges) { if (!isFeature(it)) continue; for (const vid of [it.a, it.b]) { const arr = featInc.get(vid); if (arr) arr.push(k); else featInc.set(vid, [k]) } }
  const startKey = ek(chosen.a, chosen.b)
  const chain = new Set<string>([startKey])
  let total = eLen(chosen)
  const walk = (fromV: number): number => {
    let atV = fromV, prev = startKey
    for (;;) {
      const inc = featInc.get(atV) || []
      if (inc.length !== 2) return atV       // 角 / 端点 / 分叉 → 停
      const nextK = inc[0] === prev ? inc[1] : inc[0]
      if (chain.has(nextK)) return atV       // 绕返（闭环）
      const ne = edges.get(nextK) as E
      chain.add(nextK); total += eLen(ne)
      atV = ne.a === atV ? ne.b : ne.a; prev = nextK
    }
  }
  const endA = walk(chosen.a)
  walk(chosen.b)
  const closed = endA === chosen.b && chain.size > 2
  if (closed) {
    const vids = new Set<number>(); for (const k of chain) { const it = edges.get(k) as E; vids.add(it.a); vids.add(it.b) }
    const ids = [...vids]; let cx = 0, cy = 0, cz = 0; for (const id of ids) { cx += pos[id][0]; cy += pos[id][1]; cz += pos[id][2] } cx /= ids.length; cy /= ids.length; cz /= ids.length
    let sr = 0, sr2 = 0; for (const id of ids) { const dr = Math.hypot(pos[id][0] - cx, pos[id][1] - cy, pos[id][2] - cz); sr += dr; sr2 += dr * dr }
    const mr = sr / ids.length; const sd = Math.sqrt(Math.max(0, sr2 / ids.length - mr * mr))
    return { length: total, closed: true, feature: true, radius: mr > 1e-6 && sd / mr < 0.12 ? mr : null, segCount: chain.size }
  }
  return { length: total, closed: false, feature: true, radius: null, segCount: chain.size }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// M1 分割前端（Mesh→B-rep 逆向工程，_mesh2brep_plan.md Phase A / M1）—— 2026-07-25
// ══════════════════════════════════════════════════════════════════════════════════════════════
// 上面 segmentPlanarRegions / measureMesh* 系 S46 窄版（净平面 + 字串 Map 拓扑），继续服务旧路径，
// 【一行都唔改】（零回歸律）。下面呢段系【新管線】，同旧段完全独立：
//   焊接（27 格空间 hash）→ 半边拓扑（整数 hash，Int32Array，零 per-face object）→ 每三角曲率
//   → 【法向折痕 + 曲率跳变】双判据 region growing → 区边界环（半边绕点行）+ 区邻接图。
//
// ★ 点解一定要曲率判据（M1 最易做错嘅位）★
//   圆角(fillet)→平面、圆角→圆柱 嘅过渡系【切线连续 G1】：二面角 ≈ 0，纯法向 region growing 唔会
//   喺嗰度停 → 圆角带被隔离面食埋 → 之后擬合变成「一个唔平嘅平面」，成个逆向工程全盘皆输。
//   圆角带嘅特征 = 【一个主曲率恒定非零】；平面两个都 ~0；圆柱一个恒定 = 1/r。
//   所以第二条停止准则系曲率【不连续】（唔系「曲率超标」—— 锥面曲率沿轴连续变化，一刀切会切烂锥面）。
//
// 性能目标：100–200k 三角喺 worker 入面互动级。全程 typed array，内层循环零分配。

/** 3 分量向量（可变元组，同 meshFit.ts 惯例）。 */
export type Vec3 = [number, number, number]

/** 焊接后网格：位置升精度做 Float64（擬合精度关键），三角索引 Uint32，附原始映射方便回溯。 */
export interface WeldedMesh {
  pos: Float64Array      // 焊接后顶点 [x,y,z,...]，长度 3*nv
  nv: number
  tri: Uint32Array       // 焊接后三角（已剔退化），长度 3*nt
  nt: number
  triSrc: Uint32Array    // 焊接后三角序号 → 原三角序号（M2/M3 回溯原网格用）
  vmap: Int32Array       // 原顶点 → 焊接 id
  bboxMin: Vec3
  bboxMax: Vec3
  diag: number           // 包围盒对角（全部容差嘅尺度基准）
  weldEps: number
  droppedTris: number    // 剔咗嘅退化三角数（诚实读数）
}

/** 半边拓扑 + 每三角几何/曲率。半边 h = 3*t+e，由 tri[h] 去 tri[3t+(e+1)%3]。 */
export interface MeshTopology {
  twin: Int32Array       // 半边 → 对边（-1 = 边界 / 非流形第三片）
  triN: Float64Array     // 3*nt 单位法向（按输入缠绕，闭合外向网格 = 外法向）
  triC: Float64Array     // 3*nt 重心
  triA: Float64Array     // nt 面积
  crease: Uint8Array     // 3*nt 半边级折痕标记（边界一律当折痕）
  kMin: Float64Array     // nt 每三角【有符号】主曲率估计下界（+ = 向法向弯 = 凹）
  kMax: Float64Array     // nt 上界
  curvKnown: Uint8Array  // nt 曲率有冇采到样（三条边全折痕 → 0，判据自动跳过）
  boundaryHe: number     // 边界半边数
  nonManifoldHe: number  // 非流形半边数（同一条边 ≥3 片）
}

/** 一个分割区（未擬合，纯拓扑/统计）。 */
export interface MeshRegion {
  index: number
  triIndices: Uint32Array
  area: number
  meanNormal: Vec3          // 面积加权平均法向（擬合定向 hint）
  kMinMean: number          // 区平均主曲率（圆角带侦测用）
  kMaxMean: number
  boundaryLoops: Uint32Array[]  // 边界环 = 焊接顶点 id 链（首尾唔重复，隐式闭合）
  openLoops: number         // 未能闭合嘅链数（正常网格应为 0）
}

/** 分割选项。全部尺度自适应默认；调用方一般乜都唔使传。 */
export interface SegmentOptions {
  weldEps?: number          // 焊接容差（mm）。默认 diag*1e-5（STL float32 精度绰绰有余）
  creaseAngleDeg?: number   // 二面角折痕门槛。默认 20（spec 10–30）
  curvRelTol?: number       // 曲率跳变【相对】容差。默认 0.6
  curvAbsTol?: number       // 曲率跳变【绝对】容差（1/mm）。默认 2/diag（半径 > diag/2 当平）
  curvSmoothIters?: number  // 曲率双边平滑次数（保跳变、杀噪声）。默认 2
  minRegionTris?: number    // 细过此值嘅区照留（分割唔掉料）；仅作统计门槛。默认 1
}

export interface ResolvedSegOptions {
  weldEps: number
  creaseCos: number
  creaseAngleDeg: number
  curvRelTol: number
  curvAbsTol: number
  curvSmoothIters: number
  minRegionTris: number
}

/** 分割结果（primitiveFit.ts 嘅输入）。 */
export interface SegmentationRaw {
  mesh: WeldedMesh
  topo: MeshTopology
  labels: Int32Array          // nt → 区序号
  regions: MeshRegion[]
  adjacency: [number, number][]
  opts: ResolvedSegOptions
  msWeld: number
  msTopo: number
  msGrow: number
}

// ───────────────────────── 向量/数值小工具（v3 前缀，避开上面旧段嘅 sub/cross/dot）─────────────────────────

const v3dot = (ax: number, ay: number, az: number, bx: number, by: number, bz: number): number => ax * bx + ay * by + az * bz

/** 拣一个 ⊥ 给定单位轴嘅单位向量（避开与轴平行嘅基轴，数值稳健）。 */
export function perpAxis(a: Vec3): Vec3 {
  const ax = Math.abs(a[0]), ay = Math.abs(a[1]), az = Math.abs(a[2])
  const bx = ax <= ay && ax <= az ? 1 : 0
  const by = bx === 0 && ay <= az ? 1 : 0
  const bz = bx === 0 && by === 0 ? 1 : 0
  const cx = a[1] * bz - a[2] * by, cy = a[2] * bx - a[0] * bz, cz = a[0] * by - a[1] * bx
  const L = Math.hypot(cx, cy, cz) || 1
  return [cx / L, cy / L, cz / L]
}

/**
 * 3×3 对称矩阵特征分解（循环 Jacobi，零依赖）。返回【升序】特征值 + 对应单位特征向量。
 * 平面擬合 = 取最小特征值嘅特征向量（协方差最扁方向 = 法向）；圆柱轴 = 法向协方差最小方向。
 */
export function symEig3(m00: number, m01: number, m02: number, m11: number, m12: number, m22: number): { values: [number, number, number]; vectors: [Vec3, Vec3, Vec3] } {
  const a = [m00, m01, m02, m01, m11, m12, m02, m12, m22]
  const v = [1, 0, 0, 0, 1, 0, 0, 0, 1]
  for (let sweep = 0; sweep < 60; sweep++) {
    let p = 0, q = 1, mx = Math.abs(a[1])
    if (Math.abs(a[2]) > mx) { mx = Math.abs(a[2]); p = 0; q = 2 }
    if (Math.abs(a[5]) > mx) { mx = Math.abs(a[5]); p = 1; q = 2 }
    if (mx < 1e-18) break
    const app = a[p * 3 + p], aqq = a[q * 3 + q], apq = a[p * 3 + q]
    const phi = 0.5 * Math.atan2(2 * apq, aqq - app)
    const c = Math.cos(phi), s = Math.sin(phi)
    for (let k = 0; k < 3; k++) {   // A = Jᵀ A J（先右乘）
      const akp = a[k * 3 + p], akq = a[k * 3 + q]
      a[k * 3 + p] = c * akp - s * akq
      a[k * 3 + q] = s * akp + c * akq
    }
    for (let k = 0; k < 3; k++) {   // 再左乘
      const apk = a[p * 3 + k], aqk = a[q * 3 + k]
      a[p * 3 + k] = c * apk - s * aqk
      a[q * 3 + k] = s * apk + c * aqk
    }
    for (let k = 0; k < 3; k++) {   // 累积特征向量
      const vkp = v[k * 3 + p], vkq = v[k * 3 + q]
      v[k * 3 + p] = c * vkp - s * vkq
      v[k * 3 + q] = s * vkp + c * vkq
    }
  }
  const idx = [0, 1, 2].sort((i, j) => a[i * 3 + i] - a[j * 3 + j])
  const col = (k: number): Vec3 => {
    const x = v[k], y = v[3 + k], z = v[6 + k]
    const L = Math.hypot(x, y, z) || 1
    return [x / L, y / L, z / L]
  }
  return {
    values: [a[idx[0] * 3 + idx[0]], a[idx[1] * 3 + idx[1]], a[idx[2] * 3 + idx[2]]],
    vectors: [col(idx[0]), col(idx[1]), col(idx[2])],
  }
}

const nextPow2 = (n: number): number => { let p = 16; while (p < n) p *= 2; return p }
const hash3i = (a: number, b: number, c: number): number => (Math.imul(a, 0x8da6b343) ^ Math.imul(b, 0xd8163841) ^ Math.imul(c, 0xcb1ab31f)) >>> 0
const hash2i = (a: number, b: number): number => (Math.imul(a, 0x9e3779b1) ^ Math.imul(b, 0x85ebca77)) >>> 0

// ───────────────────────── ① 顶点焊接 ─────────────────────────

/**
 * epsilon 顶点焊接。STL 逐三角重复顶点（每个顶点出现 ~6 次）→ 唔焊接就完全冇邻接可言。
 * 用空间 hash（格边长 = eps）：先查本格（重复点距离 = 0，一撞即中，慳晒 27 格），
 * 唔中先扫 27 邻格 —— 纯量化会将【跨格边界嘅重合点】当两点，网格出裂缝 → 假边界边 → 假折痕，
 * 呢个系逆向工程最阴湿嘅 bug 源，所以宁愿蚀啲时间做 27 格。
 */
export function weldMesh(vertices: ArrayLike<number>, triangles: ArrayLike<number>, weldEps?: number): WeldedMesh {
  const nvIn = Math.floor(vertices.length / 3)
  const ntIn = Math.floor(triangles.length / 3)
  let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity
  for (let i = 0; i < nvIn; i++) {
    const x = vertices[i * 3] as number, y = vertices[i * 3 + 1] as number, z = vertices[i * 3 + 2] as number
    if (x < mnx) mnx = x
    if (y < mny) mny = y
    if (z < mnz) mnz = z
    if (x > mxx) mxx = x
    if (y > mxy) mxy = y
    if (z > mxz) mxz = z
  }
  if (!isFinite(mnx)) { mnx = 0; mny = 0; mnz = 0; mxx = 0; mxy = 0; mxz = 0 }
  const diag = Math.hypot(mxx - mnx, mxy - mny, mxz - mnz) || 1
  const eps = weldEps != null && weldEps > 0 ? weldEps : diag * 1e-5
  const eps2 = eps * eps
  const inv = 1 / eps

  const cap = nextPow2(Math.max(64, nvIn * 2))
  const mask = cap - 1
  const head = new Int32Array(cap).fill(-1)
  const chain = new Int32Array(Math.max(1, nvIn)).fill(-1)
  const pos = new Float64Array(Math.max(3, nvIn * 3))
  const cellIx = new Int32Array(Math.max(3, nvIn * 3))
  const vmap = new Int32Array(Math.max(1, nvIn)).fill(-1)
  let nv = 0

  for (let i = 0; i < nvIn; i++) {
    const x = vertices[i * 3] as number, y = vertices[i * 3 + 1] as number, z = vertices[i * 3 + 2] as number
    const ix = Math.floor(x * inv), iy = Math.floor(y * inv), iz = Math.floor(z * inv)
    let found = -1
    for (let c = head[hash3i(ix, iy, iz) & mask]; c >= 0; c = chain[c]) {
      if (cellIx[c * 3] !== ix || cellIx[c * 3 + 1] !== iy || cellIx[c * 3 + 2] !== iz) continue
      const dx = pos[c * 3] - x, dy = pos[c * 3 + 1] - y, dz = pos[c * 3 + 2] - z
      if (dx * dx + dy * dy + dz * dz <= eps2 * 0.25) { found = c; break }
    }
    if (found < 0) {
      let bestD = eps2
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) for (let oz = -1; oz <= 1; oz++) {
        const gx = ix + ox, gy = iy + oy, gz = iz + oz
        for (let c = head[hash3i(gx, gy, gz) & mask]; c >= 0; c = chain[c]) {
          if (cellIx[c * 3] !== gx || cellIx[c * 3 + 1] !== gy || cellIx[c * 3 + 2] !== gz) continue
          const dx = pos[c * 3] - x, dy = pos[c * 3 + 1] - y, dz = pos[c * 3 + 2] - z
          const d2 = dx * dx + dy * dy + dz * dz
          if (d2 <= bestD) { bestD = d2; found = c }
        }
      }
    }
    if (found < 0) {
      found = nv++
      pos[found * 3] = x; pos[found * 3 + 1] = y; pos[found * 3 + 2] = z
      cellIx[found * 3] = ix; cellIx[found * 3 + 1] = iy; cellIx[found * 3 + 2] = iz
      const b = hash3i(ix, iy, iz) & mask
      chain[found] = head[b]; head[b] = found
    }
    vmap[i] = found
  }

  // 三角重映射 + 剔退化（两顶点焊埋一齐 / 零面积 → 法向未定义，留住会毒害成条链）
  const triOut = new Uint32Array(ntIn * 3)
  const triSrc = new Uint32Array(ntIn)
  const areaEps = diag * diag * 1e-14
  let nt = 0
  for (let t = 0; t < ntIn; t++) {
    const i0 = triangles[t * 3] as number, i1 = triangles[t * 3 + 1] as number, i2 = triangles[t * 3 + 2] as number
    if (i0 < 0 || i1 < 0 || i2 < 0 || i0 >= nvIn || i1 >= nvIn || i2 >= nvIn) continue
    const a = vmap[i0], b = vmap[i1], c = vmap[i2]
    if (a === b || b === c || a === c) continue
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2]
    const wx = pos[c * 3] - pos[a * 3], wy = pos[c * 3 + 1] - pos[a * 3 + 1], wz = pos[c * 3 + 2] - pos[a * 3 + 2]
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx
    if (Math.hypot(nx, ny, nz) <= areaEps) continue
    triOut[nt * 3] = a; triOut[nt * 3 + 1] = b; triOut[nt * 3 + 2] = c
    triSrc[nt] = t
    nt++
  }

  return {
    pos: pos.slice(0, Math.max(3, nv * 3)),
    nv,
    tri: triOut.slice(0, nt * 3),
    nt,
    triSrc: triSrc.slice(0, nt),
    vmap,
    bboxMin: [mnx, mny, mnz],
    bboxMax: [mxx, mxy, mxz],
    diag,
    weldEps: eps,
    droppedTris: ntIn - nt,
  }
}

/** 解析分割选项（尺度自适应默认全部喺呢度一处定义）。 */
export function resolveSegOptions(diag: number, o: SegmentOptions = {}): ResolvedSegOptions {
  const creaseAngleDeg = o.creaseAngleDeg ?? 20
  return {
    weldEps: o.weldEps != null && o.weldEps > 0 ? o.weldEps : diag * 1e-5,
    creaseAngleDeg,
    creaseCos: Math.cos((creaseAngleDeg * Math.PI) / 180),
    curvRelTol: o.curvRelTol ?? 0.6,
    curvAbsTol: o.curvAbsTol ?? 2 / diag,
    curvSmoothIters: o.curvSmoothIters ?? 2,
    minRegionTris: o.minRegionTris ?? 1,
  }
}

// ───────────────────────── ② 半边拓扑 + 曲率 ─────────────────────────

/** 曲率跳变容差：绝对底线（区分平面 vs 圆角）+ 相对上限（容许锥面沿轴平滑变化）。 */
const curvTol = (a: number, b: number, o: ResolvedSegOptions): number => Math.max(o.curvAbsTol, o.curvRelTol * Math.max(Math.abs(a), Math.abs(b)))

/**
 * 建半边拓扑（整数 hash，零 per-face object）+ 折痕标记 + 每三角有符号主曲率估计。
 *
 * 曲率估计（法向旋转版）：对每条【非折痕】邻边 e，
 *     k_e = ±θ_e / L⊥      θ_e = 两片法向夹角；L⊥ = 两重心距离【垂直於 e】嘅分量
 *     符号：邻居重心喺切平面【下面】(n_t·Δc < 0) = 凸 → 负；上面 = 凹 → 正
 * 点解唔用课本嗰条 k = 2·n·Δc/|Δc|²：CAD 镶嵌嘅圆角/圆柱带三角【极度狭长】（沿母线好长、
 * 跨曲率方向好短），Δc 会被【平坦嗰个方向】主导，估出嚟嘅曲率细成十倍 → 圆角完全侦测唔到。
 * 法向旋转版天生【方向选择】：法向只会绕住共享边转，所以量度长度一定要 ⊥ 边 —— 各向异性免疫。
 * 取邻居样本嘅 min/max 当两个主曲率代理：
 *   平面 → (0,0)；圆柱 r（凸）→ (−c/r, 0)；球 r（凸）→ (−c/r, −c/r)；圆角带 → 一个恒定非零。
 *   （c ≈ 1..1.5 系镶嵌 pattern 造成嘅系统性系数；判据睇【跳变】唔睇绝对值，故唔影响。）
 * 【只用非折痕边】= 天然唔会被隔离面污染（呢点系估计可用嘅关键）。
 */
export function buildTopology(m: WeldedMesh, opt: ResolvedSegOptions): MeshTopology {
  const nt = m.nt, nh = nt * 3
  const tri = m.tri, pos = m.pos
  const triN = new Float64Array(nh), triC = new Float64Array(nh), triA = new Float64Array(nt)
  for (let t = 0; t < nt; t++) {
    const a = tri[t * 3], b = tri[t * 3 + 1], c = tri[t * 3 + 2]
    const axv = pos[a * 3], ayv = pos[a * 3 + 1], azv = pos[a * 3 + 2]
    const ux = pos[b * 3] - axv, uy = pos[b * 3 + 1] - ayv, uz = pos[b * 3 + 2] - azv
    const wx = pos[c * 3] - axv, wy = pos[c * 3 + 1] - ayv, wz = pos[c * 3 + 2] - azv
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx
    const L = Math.hypot(nx, ny, nz) || 1
    triA[t] = L / 2
    triN[t * 3] = nx / L; triN[t * 3 + 1] = ny / L; triN[t * 3 + 2] = nz / L
    triC[t * 3] = (axv + pos[b * 3] + pos[c * 3]) / 3
    triC[t * 3 + 1] = (ayv + pos[b * 3 + 1] + pos[c * 3 + 1]) / 3
    triC[t * 3 + 2] = (azv + pos[b * 3 + 2] + pos[c * 3 + 2]) / 3
  }

  // 对边配对：无向边 (min,max) 整数 hash → 桶链；同一条边 ≥3 片时只配头两片，其余当边界（诚实退让）
  const cap = nextPow2(Math.max(64, nh * 2))
  const mask = cap - 1
  const head = new Int32Array(cap).fill(-1)
  const nxt = new Int32Array(Math.max(1, nh)).fill(-1)
  const twin = new Int32Array(Math.max(1, nh)).fill(-1)
  const heA = (h: number): number => tri[h]
  const heB = (h: number): number => tri[((h / 3) | 0) * 3 + ((h % 3) + 1) % 3]
  for (let h = 0; h < nh; h++) {
    const a = heA(h), b = heB(h)
    const k = hash2i(Math.min(a, b), Math.max(a, b)) & mask
    nxt[h] = head[k]; head[k] = h
  }
  let nonManifoldHe = 0
  for (let h = 0; h < nh; h++) {
    if (twin[h] >= 0) continue
    const a0 = heA(h), b0 = heB(h)
    const lo = Math.min(a0, b0), hi = Math.max(a0, b0)
    let paired = -1, sameEdge = 0
    for (let g = head[hash2i(lo, hi) & mask]; g >= 0; g = nxt[g]) {
      if (g === h) continue
      const a1 = heA(g), b1 = heB(g)
      if (Math.min(a1, b1) !== lo || Math.max(a1, b1) !== hi) continue
      sameEdge++
      if (paired < 0 && twin[g] < 0) paired = g
    }
    if (sameEdge >= 2) nonManifoldHe++
    if (paired >= 0) { twin[h] = paired; twin[paired] = h }
  }

  // 折痕（含边界）
  const crease = new Uint8Array(nh)
  let boundaryHe = 0
  for (let h = 0; h < nh; h++) {
    const g = twin[h]
    if (g < 0) { crease[h] = 1; boundaryHe++; continue }
    const t = (h / 3) | 0, o = (g / 3) | 0
    const c = v3dot(triN[t * 3], triN[t * 3 + 1], triN[t * 3 + 2], triN[o * 3], triN[o * 3 + 1], triN[o * 3 + 2])
    crease[h] = c < opt.creaseCos ? 1 : 0
  }

  // 每三角曲率（只用非折痕邻居）
  let kMin = new Float64Array(nt), kMax = new Float64Array(nt)
  const curvKnown = new Uint8Array(nt)
  for (let t = 0; t < nt; t++) {
    let lo = Infinity, hi = -Infinity, cnt = 0
    for (let e = 0; e < 3; e++) {
      const h = t * 3 + e
      if (crease[h]) continue
      const g = twin[h]
      if (g < 0) continue
      const o = (g / 3) | 0
      const dx = triC[o * 3] - triC[t * 3], dy = triC[o * 3 + 1] - triC[t * 3 + 1], dz = triC[o * 3 + 2] - triC[t * 3 + 2]
      const L2 = dx * dx + dy * dy + dz * dz
      if (L2 <= 1e-24) continue
      // 共享边方向 ê（半边 h：tri[h] → tri[3t+(e+1)%3]）
      const va = tri[h], vb = tri[t * 3 + (e + 1) % 3]
      let ex = pos[vb * 3] - pos[va * 3], ey = pos[vb * 3 + 1] - pos[va * 3 + 1], ez = pos[vb * 3 + 2] - pos[va * 3 + 2]
      const eL = Math.hypot(ex, ey, ez)
      if (!(eL > 1e-12)) continue
      ex /= eL; ey /= eL; ez /= eL
      const proj = dx * ex + dy * ey + dz * ez
      const px = dx - proj * ex, py = dy - proj * ey, pz = dz - proj * ez
      const Lp = Math.hypot(px, py, pz)
      if (!(Lp > 1e-12)) continue
      const c = v3dot(triN[t * 3], triN[t * 3 + 1], triN[t * 3 + 2], triN[o * 3], triN[o * 3 + 1], triN[o * 3 + 2])
      const theta = Math.acos(c < -1 ? -1 : c > 1 ? 1 : c)
      const sgn = v3dot(triN[t * 3], triN[t * 3 + 1], triN[t * 3 + 2], dx, dy, dz) < 0 ? -1 : 1
      const k = sgn * theta / Lp
      if (k < lo) lo = k
      if (k > hi) hi = k
      cnt++
    }
    if (cnt > 0) { kMin[t] = lo; kMax[t] = hi; curvKnown[t] = 1 }
  }

  // 双边平滑：只同【已经喺容差内】嘅邻居平均 → 噪声被平均掉，平面↔圆角嘅真跳变原封不动保留。
  // （普通平滑会将跳变糊到隔离，正正毁掉我哋唯一嘅圆角线索，所以一定要双边。）
  let bufMin = new Float64Array(nt), bufMax = new Float64Array(nt)
  for (let it = 0; it < opt.curvSmoothIters; it++) {
    for (let t = 0; t < nt; t++) {
      if (!curvKnown[t]) { bufMin[t] = kMin[t]; bufMax[t] = kMax[t]; continue }
      let sMin = kMin[t], sMax = kMax[t], w = 1
      for (let e = 0; e < 3; e++) {
        const h = t * 3 + e
        if (crease[h]) continue
        const g = twin[h]
        if (g < 0) continue
        const o = (g / 3) | 0
        if (!curvKnown[o]) continue
        if (Math.abs(kMin[o] - kMin[t]) > curvTol(kMin[o], kMin[t], opt)) continue
        if (Math.abs(kMax[o] - kMax[t]) > curvTol(kMax[o], kMax[t], opt)) continue
        sMin += kMin[o]; sMax += kMax[o]; w++
      }
      bufMin[t] = sMin / w; bufMax[t] = sMax / w
    }
    const tm = kMin; kMin = bufMin; bufMin = tm
    const tx = kMax; kMax = bufMax; bufMax = tx
  }

  return { twin, triN, triC, triA, crease, kMin, kMax, curvKnown, boundaryHe, nonManifoldHe }
}

// ───────────────────────── ③ 双判据 region growing ─────────────────────────

/**
 * region growing：由【最平嘅三角】起种（平面最易擬合、最唔怕误吞，先霸位），BFS 收邻居。
 * 停止准则两条（缺一不可）：
 *   ① 法向折痕：二面角 ≥ creaseAngleDeg → 唔过（利边）
 *   ② 曲率跳变：|Δk| > tol → 唔过（G1 相切过渡：圆角↔平面/圆柱，法向判据完全睇唔到）
 * 曲率比较系【局部】（同当前三角比），唔系同区平均比 —— 锥面曲率沿轴连续变化，同区平均比会切烂锥面。
 */
export function growRegions(m: WeldedMesh, topo: MeshTopology, opt: ResolvedSegOptions): { labels: Int32Array; nRegions: number } {
  const nt = m.nt
  const labels = new Int32Array(Math.max(1, nt)).fill(-1)
  if (nt === 0) return { labels, nRegions: 0 }
  const { twin, crease, kMin, kMax, curvKnown, triA } = topo

  // 种子次序：曲率绝对值细者先（平面 → 圆柱 → 圆角），同级大三角先。冇曲率样本（三边全折痕）排最尾。
  const key = new Float64Array(nt)
  for (let t = 0; t < nt; t++) key[t] = curvKnown[t] ? Math.max(Math.abs(kMin[t]), Math.abs(kMax[t])) : Number.MAX_VALUE
  const order = new Int32Array(nt)
  for (let t = 0; t < nt; t++) order[t] = t
  order.sort((a, b) => (key[a] - key[b]) || (triA[b] - triA[a]))

  const stack = new Int32Array(nt)
  let nRegions = 0
  for (let s = 0; s < nt; s++) {
    const seed = order[s]
    if (labels[seed] >= 0) continue
    const r = nRegions++
    labels[seed] = r
    let sp = 0
    stack[sp++] = seed
    while (sp > 0) {
      const t = stack[--sp]
      for (let e = 0; e < 3; e++) {
        const h = t * 3 + e
        if (crease[h]) continue                 // ① 利边
        const g = twin[h]
        if (g < 0) continue
        const o = (g / 3) | 0
        if (labels[o] >= 0) continue
        if (curvKnown[t] && curvKnown[o]) {     // ② 曲率不连续
          if (Math.abs(kMin[o] - kMin[t]) > curvTol(kMin[o], kMin[t], opt)) continue
          if (Math.abs(kMax[o] - kMax[t]) > curvTol(kMax[o], kMax[t], opt)) continue
        }
        labels[o] = r
        stack[sp++] = o
      }
    }
  }
  return { labels, nRegions }
}

// ───────────────────────── ④ 区边界环 + 邻接图 ─────────────────────────

/**
 * 由 labels 砌每区嘅三角表、统计量、边界环、区邻接图。分割后同【合并后】都会 call（所以独立成函数）。
 *
 * 边界环走法（半边绕点行）：前沿半边 h（a→b，t 属区 r，对面唔属 r 或者冇对面）嘅【唯一后继】=
 * 由 next(h) 起绕住 b 转（e = next(twin(e))）直到再遇前沿半边。呢个走法系双射，前沿半边必然分解成
 * 【互不相交嘅有向闭环】—— 所以环一定闭合，绕向同三角缠绕一致（外环 CCW / 孔 CW 相对区法向）。
 * 掐点（pinch vertex，一个顶点被区用两次）都行得通，正正系「贪心配对」会出错嘅位。
 */
export function buildRegionTopology(m: WeldedMesh, topo: MeshTopology, labels: Int32Array, nRegions: number): { regions: MeshRegion[]; adjacency: [number, number][] } {
  const nt = m.nt
  const { twin, triN, triA, kMin, kMax, curvKnown } = topo
  const counts = new Int32Array(nRegions)
  for (let t = 0; t < nt; t++) counts[labels[t]]++
  const regions: MeshRegion[] = []
  const fill = new Int32Array(nRegions)
  const triLists: Uint32Array[] = []
  for (let r = 0; r < nRegions; r++) triLists.push(new Uint32Array(counts[r]))
  for (let t = 0; t < nt; t++) { const r = labels[t]; triLists[r][fill[r]++] = t }

  const nh = nt * 3
  const visited = new Uint8Array(Math.max(1, nh))
  const nextHe = (h: number): number => ((h / 3) | 0) * 3 + ((h % 3) + 1) % 3

  // 区邻接图（独立一趟扫全部半边 —— 唔可以塞入下面嘅环走法，因为环走法会「食走」半边）
  const adjSet = new Set<number>()
  for (let h = 0; h < nh; h++) {
    const g = twin[h]
    if (g < 0) continue
    const a = labels[(h / 3) | 0], b = labels[(g / 3) | 0]
    if (a === b) continue
    adjSet.add(a < b ? a * nRegions + b : b * nRegions + a)
  }

  for (let r = 0; r < nRegions; r++) {
    const tris = triLists[r]
    let area = 0, nx = 0, ny = 0, nz = 0, km = 0, kx = 0, kc = 0
    for (let i = 0; i < tris.length; i++) {
      const t = tris[i], w = triA[t]
      area += w
      nx += triN[t * 3] * w; ny += triN[t * 3 + 1] * w; nz += triN[t * 3 + 2] * w
      if (curvKnown[t]) { km += kMin[t]; kx += kMax[t]; kc++ }
    }
    const nl = Math.hypot(nx, ny, nz) || 1
    const loops: Uint32Array[] = []
    let openLoops = 0
    for (let i = 0; i < tris.length; i++) {
      const t = tris[i]
      for (let e = 0; e < 3; e++) {
        const h = t * 3 + e
        if (visited[h]) continue
        const g = twin[h]
        const other = g < 0 ? -1 : labels[(g / 3) | 0]
        if (other === r) continue                       // 区内边，唔系前沿
        // 由 h 起串环
        const chainIds: number[] = []
        let cur = h, guard = 0
        let closed = false
        while (guard++ <= nh) {
          visited[cur] = 1
          chainIds.push(m.tri[cur])
          let e2 = nextHe(cur)
          let spin = 0
          for (;;) {
            const g2 = twin[e2]
            if (g2 < 0 || labels[(g2 / 3) | 0] !== r) break   // 到达下一条前沿半边
            e2 = nextHe(g2)
            if (++spin > 4096) break
          }
          if (e2 === h) { closed = true; break }
          if (visited[e2]) break
          cur = e2
        }
        if (closed && chainIds.length >= 3) loops.push(Uint32Array.from(chainIds))
        else openLoops++
      }
    }
    regions.push({
      index: r,
      triIndices: tris,
      area,
      meanNormal: [nx / nl, ny / nl, nz / nl],
      kMinMean: kc ? km / kc : 0,
      kMaxMean: kc ? kx / kc : 0,
      boundaryLoops: loops,
      openLoops,
    })
  }

  const adjacency: [number, number][] = []
  for (const code of adjSet) adjacency.push([Math.floor(code / nRegions), code % nRegions])
  adjacency.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  return { regions, adjacency }
}

/** 收一个区嘅【去重焊接顶点 id】。stamp 由调用方复用（避免每区扫一次全网格分配）。 */
export function collectRegionVerts(m: WeldedMesh, tris: Uint32Array, stamp: Int32Array, mark: number): Uint32Array {
  const out = new Uint32Array(tris.length * 3)
  let n = 0
  for (let i = 0; i < tris.length; i++) {
    const t = tris[i]
    for (let e = 0; e < 3; e++) {
      const v = m.tri[t * 3 + e]
      if (stamp[v] === mark) continue
      stamp[v] = mark
      out[n++] = v
    }
  }
  return out.slice(0, n)
}

// ───────────────────────── ⑤ 一站式入口 ─────────────────────────

/** 三角网格 → 分割（焊接 + 拓扑 + 双判据 growing + 边界环 + 邻接图）。纯计算，worker 可用，Node 可测。 */
export function segmentMesh(input: { v: ArrayLike<number>; t: ArrayLike<number> }, options: SegmentOptions = {}): SegmentationRaw {
  const t0 = performance.now()
  const pre = weldMesh(input.v, input.t, options.weldEps)
  const opts = resolveSegOptions(pre.diag, options)
  const t1 = performance.now()
  const topo = buildTopology(pre, opts)
  const t2 = performance.now()
  const { labels, nRegions } = growRegions(pre, topo, opts)
  const { regions, adjacency } = buildRegionTopology(pre, topo, labels, nRegions)
  const t3 = performance.now()
  return { mesh: pre, topo, labels, regions, adjacency, opts, msWeld: t1 - t0, msTopo: t2 - t1, msGrow: t3 - t2 }
}
