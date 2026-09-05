// =====================================================================================
// meshRepair.ts — 网格修复（补洞 v1）+ 快速简化（顶点聚类）
// 纯函数模块：MeshData 平数组入，新 MeshData 出。全部自写（无第三方/无复制代码），
// 零 import，纯 TypeScript，自包含。store/UI 由另一位工程师并行接线 — API 形状勿改。
//
// 诚实范围（明码标价，唔扮全能）：
//
// repairMesh — 只闭合「简单边界环」嘅洞：
//   1. 顶点按 1e-4 网格量化焊接（OCCT/STL 成日逐面重复顶点 → 假开边；
//      焊接思路同 faceDetect.ts 一致，呢度本地重新实现，保持本模块零依赖）。
//   2. 边界边 = 焊接 id 上恰好得一个三角形引用嘅边。顺住有向方向链成闭合环；
//      链唔埋口（悬挂/非流形 pinch）→ 警告 + 跳过，唔靠估。
//   3. 环 ≤ 64 边：Newell 法线定最佳拟合平面 → 投影 2D → 耳切（ear clipping）。
//      补片绕向直接由边界边方向推导：边界边 (a,b) 喺其所属三角形入面系 a→b，
//      补片必须行 b→a → 成个环反转再耳切 → 补片同周边表面绕向一致（外向）。
//      环 > 64 边 → 警告跳过（诚实上限：大洞乱补容易出垃圾，不如唔补）。
//   4. 输出 = 原三角形（原索引，一个唔郁）+ 补片三角形（用焊接代表顶点，唔加新点）；
//      法线全部重算：逐顶点累加（面积加权）面法线再归一 — app 其余 mesh 同一约定。
//   5. 平面薄片（开放条带）嘅边界环照填 → 零体积闭合壳：边界边清零，但唔系实体
//      （内部可能非流形）。行为一致好过特判 — 文档讲明，测试锁定呢个行为。
//
// simplifyMesh — 顶点聚类（vertex clustering）快速简化。诚实讲：系近似法，唔系 QEM，
//   落点只能近似目标比例。格仔尺寸由 tris ∝ 1/h²（表面网格）反推初猜，
//   最多迭代 3 次（初猜 + 2 次调整）争取落喺目标 ×1.5 内；最终离目标 >×2 → 警告。
//   簇代表点 = 簇内顶点平均位置。重映射后剔除：退化（两 id 相同）、
//   零面积（叉积长 < 1e-12）、完全重复（同一 id 三元组任意旋转；反向绕向唔算重复）。
//
// 约定：MeshData { vertices, triangles, normals } 平数组，三角形 CCW 朝外。
// =====================================================================================

export interface RepairResult {
  mesh: { vertices: number[]; triangles: number[]; normals: number[] }
  holesFilled: number
  boundaryEdgesBefore: number
  boundaryEdgesAfter: number
  warnings: string[]
}

export interface SimplifyResult {
  mesh: { vertices: number[]; triangles: number[]; normals: number[] }
  trisBefore: number
  trisAfter: number
  warnings: string[]
}

// ------------------------------------------------------------------ 向量小工具
type V3 = [number, number, number]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const vlen = (a: V3): number => Math.hypot(a[0], a[1], a[2])

// ------------------------------------------------------------------ 顶点焊接
/**
 * 顶点按量化网格焊接（默认格 1e-4）。
 * 返回 canon[i] = 第 i 个原始顶点嘅焊接 id；rep[id] = 该焊接 id 嘅代表原始顶点下标；
 * nWelded = 焊接后顶点数。只做 id 归并，唔郁顶点坐标。
 */
function weldVertices(vertices: ArrayLike<number>, quant = 1e-4): { canon: number[]; rep: number[]; nWelded: number } {
  const inv = 1 / quant
  const nV = Math.floor(vertices.length / 3)
  const idOf = new Map<string, number>()
  const canon = new Array<number>(nV)
  const rep: number[] = []
  for (let i = 0; i < nV; i++) {
    const k = `${Math.round(vertices[3 * i] * inv)},${Math.round(vertices[3 * i + 1] * inv)},${Math.round(vertices[3 * i + 2] * inv)}`
    let id = idOf.get(k)
    if (id === undefined) { id = rep.length; idOf.set(k, id); rep.push(i) }
    canon[i] = id
  }
  return { canon, rep, nWelded: rep.length }
}

// ------------------------------------------------------------------ 边统计
/** 无向边记录：n = 引用三角形数；(a,b) = 首次出现嘅有向方向（n===1 时即边界边方向）。 */
interface EdgeRec { n: number; a: number; b: number }

/** 喺焊接 id 三角形上建无向边表（key = min*nWelded + max，nWelded 实际唔会爆 2^53）。 */
function buildEdges(canonTris: number[], nWelded: number): Map<number, EdgeRec> {
  const m = new Map<number, EdgeRec>()
  for (let t = 0; t < canonTris.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = canonTris[t + e], b = canonTris[t + ((e + 1) % 3)]
      const key = a < b ? a * nWelded + b : b * nWelded + a
      const r = m.get(key)
      if (r) r.n++
      else m.set(key, { n: 1, a, b })
    }
  }
  return m
}

/**
 * 将边界有向边（n===1，方向 = 所属三角形内 a→b）链成闭合环。
 * 每步消耗一条边 → 必定终止。链唔埋口（悬挂/非流形）→ openChains 计数，唔出环。
 * 非流形 pinch（一个顶点多条出边）贪心拣先插入嗰条 — 诚实讲：极端 pinch 情况
 * 可能链出复合环，补出嚟唔靓，但唔会死循环、唔会掟错。
 */
function chainLoops(edges: Map<number, EdgeRec>): { loops: number[][]; openChains: number; boundaryEdges: number } {
  const outE = new Map<number, number[]>()
  let boundaryEdges = 0
  for (const r of edges.values()) {
    if (r.n !== 1) continue
    boundaryEdges++
    const arr = outE.get(r.a)
    if (arr) arr.push(r.b)
    else outE.set(r.a, [r.b])
  }
  const loops: number[][] = []
  let openChains = 0
  for (const start of outE.keys()) {
    let lst = outE.get(start)
    while (lst !== undefined && lst.length > 0) {
      const loop: number[] = [start]
      let cur = start
      let closed = false
      for (;;) {
        const es = outE.get(cur)
        if (es === undefined || es.length === 0) break // 悬挂 — 链断
        const nxt = es.shift() as number
        if (nxt === start) { closed = true; break }
        loop.push(nxt)
        cur = nxt
      }
      if (closed) loops.push(loop)
      else openChains++
      lst = outE.get(start)
    }
  }
  return { loops, openChains, boundaryEdges }
}

// ------------------------------------------------------------------ 边界分析（焊接 + 边表 + 链环）
interface BoundaryInfo {
  canon: number[]; rep: number[]; nWelded: number
  canonTris: number[]       // 焊接 id 三元组（已剔除焊接后退化/索引非法嘅三角形 — 唔参与边界统计）
  degenerate: number        // 被剔出图嘅三角形数
  boundaryEdges: number
  loops: number[][]         // 闭合边界环（焊接 id，正向 = 边界边自身方向）
  openChains: number
}

function analyzeBoundary(vertices: ArrayLike<number>, triangles: ArrayLike<number>): BoundaryInfo {
  const { canon, rep, nWelded } = weldVertices(vertices)
  const nV = canon.length
  const nT = Math.floor(triangles.length / 3)
  const canonTris: number[] = []
  let degenerate = 0
  for (let t = 0; t < nT; t++) {
    const i0 = triangles[3 * t], i1 = triangles[3 * t + 1], i2 = triangles[3 * t + 2]
    if (!(i0 >= 0 && i0 < nV && i1 >= 0 && i1 < nV && i2 >= 0 && i2 < nV)) { degenerate++; continue }
    const a = canon[i0], b = canon[i1], c = canon[i2]
    if (a === b || b === c || c === a) { degenerate++; continue }
    canonTris.push(a, b, c)
  }
  const edges = buildEdges(canonTris, nWelded)
  const { loops, openChains, boundaryEdges } = chainLoops(edges)
  return { canon, rep, nWelded, canonTris, degenerate, boundaryEdges, loops, openChains }
}

/** （测试钩用）搵闭合边界环 — 环以「原始顶点下标」（焊接代表）返回。 */
function findBoundaryLoops(vertices: ArrayLike<number>, triangles: ArrayLike<number>): { loops: number[][]; boundaryEdges: number; openChains: number } {
  const info = analyzeBoundary(vertices, triangles)
  return {
    loops: info.loops.map((l) => l.map((id) => info.rep[id])),
    boundaryEdges: info.boundaryEdges,
    openChains: info.openChains,
  }
}

// ------------------------------------------------------------------ 耳切补洞
/**
 * 耳切填充一个闭合边界环（焊接 id，正向）。成功 → 补片三角形焊接 id 三元组；
 * 退化（共线/零投影面积/点全部重合）→ null，调用方出警告。
 *
 * 绕向：环正向 = 边界边喺所属三角形入面嘅方向（a→b），补片要行 b→a 先至同
 * 周边表面绕向一致 → 成个环反转再耳切，耳切顺住多边形遍历方向出三角形。
 *
 * 投影：Newell 法线（对非平面环系最佳拟合平面）。投影后如果环自相交（严重非平面），
 * 标准耳搵唔到就逐步放宽（先弃包含测试，再硬切）— 保证终止，补丁可能唔靓但唔会挂。
 */
function fillLoop(loop: number[], pos: (id: number) => V3): number[] | null {
  const n = loop.length
  if (n < 3) return null
  const poly = loop.slice().reverse() // 反转 → 每条边界边行 b→a
  // 环 bbox 对角线 → 相对 eps（2D 叉积量纲系长度²）
  let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity
  for (let i = 0; i < n; i++) {
    const p = pos(poly[i])
    if (p[0] < mnx) mnx = p[0]; if (p[0] > mxx) mxx = p[0]
    if (p[1] < mny) mny = p[1]; if (p[1] > mxy) mxy = p[1]
    if (p[2] < mnz) mnz = p[2]; if (p[2] > mxz) mxz = p[2]
  }
  const diag = Math.hypot(mxx - mnx, mxy - mny, mxz - mnz)
  if (!(diag > 0)) return null // 环上点全部重合
  const eps2 = diag * diag * 1e-9
  // Newell 法线（按 poly 遍历顺序 — 符号由有向面积自洽处理，唔使理方向）
  let nwx = 0, nwy = 0, nwz = 0
  for (let i = 0; i < n; i++) {
    const p = pos(poly[i]), q = pos(poly[(i + 1) % n])
    nwx += (p[1] - q[1]) * (p[2] + q[2])
    nwy += (p[2] - q[2]) * (p[0] + q[0])
    nwz += (p[0] - q[0]) * (p[1] + q[1])
  }
  const nl = Math.hypot(nwx, nwy, nwz)
  if (nl < eps2) return null // 共线/零面积环 — 冇得投影
  const N: V3 = [nwx / nl, nwy / nl, nwz / nl]
  // 平面基底：拣同 N 最唔平行嘅坐标轴 → u ⊥ N 保证非零
  const ax = Math.abs(N[0]), ay = Math.abs(N[1]), az = Math.abs(N[2])
  const e: V3 = ax <= ay && ax <= az ? [1, 0, 0] : ay <= az ? [0, 1, 0] : [0, 0, 1]
  const u0 = cross(N, e)
  const ul = vlen(u0)
  const u: V3 = [u0[0] / ul, u0[1] / ul, u0[2] / ul]
  const v = cross(N, u)
  // 投影 2D
  const px = new Array<number>(n), py = new Array<number>(n)
  for (let i = 0; i < n; i++) { const p = pos(poly[i]); px[i] = dot(p, u); py[i] = dot(p, v) }
  // 总有向面积 → 凸性符号（唔反转点序，绕向系输出嘅一部分）
  let A2 = 0
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; A2 += px[i] * py[j] - px[j] * py[i] }
  if (Math.abs(A2) < eps2) return null // 投影面积≈0（狭缝环）— 诚实跳过
  const s = A2 > 0 ? 1 : -1
  const cr2 = (i0: number, i1: number, i2: number): number =>
    (px[i1] - px[i0]) * (py[i2] - py[i1]) - (py[i1] - py[i0]) * (px[i2] - px[i1])
  /** p 严格喺三角形 (a,b,c) 内部（边上唔算阻挡，容差 eps2）。三角形凸性已对齐 s。 */
  const inTri = (a: number, b: number, c: number, p: number): boolean =>
    cr2(a, b, p) * s > eps2 && cr2(b, c, p) * s > eps2 && cr2(c, a, p) * s > eps2
  const idx: number[] = []
  for (let i = 0; i < n; i++) idx.push(i)
  const out: number[] = []
  const emit = (a: number, b: number, c: number): void => {
    // 复合环（非流形 pinch 链出嚟）可能重复顶点 → 退化耳唔输出
    if (poly[a] !== poly[b] && poly[b] !== poly[c] && poly[c] !== poly[a]) out.push(poly[a], poly[b], poly[c])
  }
  while (idx.length > 3) {
    let pick = -1
    // 第一轮：标准耳 = 凸 + 冇其他环点严格喺耳内部
    for (let k = 0; k < idx.length && pick < 0; k++) {
      const ip = idx[(k + idx.length - 1) % idx.length], ic = idx[k], inx = idx[(k + 1) % idx.length]
      if (cr2(ip, ic, inx) * s <= eps2) continue
      let blocked = false
      for (const m of idx) {
        if (m === ip || m === ic || m === inx) continue
        if (inTri(ip, ic, inx, m)) { blocked = true; break }
      }
      if (!blocked) pick = k
    }
    // 第二轮（退化保底）：放宽包含测试，凸就切
    if (pick < 0) {
      for (let k = 0; k < idx.length; k++) {
        const ip = idx[(k + idx.length - 1) % idx.length], ic = idx[k], inx = idx[(k + 1) % idx.length]
        if (cr2(ip, ic, inx) * s > eps2) { pick = k; break }
      }
    }
    // 最后保底：硬切第 0 个 — 高度退化/自相交投影环都保证终止
    if (pick < 0) pick = 0
    const ip = idx[(pick + idx.length - 1) % idx.length], ic = idx[pick], inx = idx[(pick + 1) % idx.length]
    emit(ip, ic, inx)
    idx.splice(pick, 1)
  }
  emit(idx[0], idx[1], idx[2])
  return out
}

// ------------------------------------------------------------------ 法线重算
/**
 * 平法线重算：逐顶点累加面法线（原始叉积，即面积加权）再归一；
 * 孤立/退化顶点 → (0,0,1)。按「原始顶点下标」累加 — OCCT 逐面重复顶点
 * 嘅平直着色得以保留（焊接只用嚟做边界统计，唔郁输出顶点）。
 */
function recomputeNormals(vertices: number[], triangles: number[]): number[] {
  const out = new Array<number>(vertices.length).fill(0)
  for (let t = 0; t < triangles.length; t += 3) {
    const o0 = triangles[t] * 3, o1 = triangles[t + 1] * 3, o2 = triangles[t + 2] * 3
    const ax = vertices[o0], ay = vertices[o0 + 1], az = vertices[o0 + 2]
    const e1x = vertices[o1] - ax, e1y = vertices[o1 + 1] - ay, e1z = vertices[o1 + 2] - az
    const e2x = vertices[o2] - ax, e2y = vertices[o2 + 1] - ay, e2z = vertices[o2 + 2] - az
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x
    out[o0] += nx; out[o0 + 1] += ny; out[o0 + 2] += nz
    out[o1] += nx; out[o1 + 1] += ny; out[o1 + 2] += nz
    out[o2] += nx; out[o2 + 1] += ny; out[o2 + 2] += nz
  }
  for (let i = 0; i < out.length; i += 3) {
    const L = Math.hypot(out[i], out[i + 1], out[i + 2])
    if (L > 1e-20) { out[i] /= L; out[i + 1] /= L; out[i + 2] /= L }
    else { out[i] = 0; out[i + 1] = 0; out[i + 2] = 1 }
  }
  return out
}

// ------------------------------------------------------------------ repairMesh
/**
 * 修复网格：焊接 → 搵闭合边界环 → 耳切补洞（环 ≤ 64 边）。
 * 输出顶点 = 输入顶点（一个唔加唔减）；三角形 = 原三角形 + 补片；法线全部重算。
 * boundaryEdgesBefore/After 都喺焊接 id 上计。
 */
export function repairMesh(vertices: ArrayLike<number>, triangles: ArrayLike<number>): RepairResult {
  const warnings: string[] = []
  const nV = Math.floor(vertices.length / 3)
  const nT = Math.floor(triangles.length / 3)
  const outVerts = new Array<number>(nV * 3)
  for (let i = 0; i < nV * 3; i++) outVerts[i] = vertices[i]
  const outTris = new Array<number>(nT * 3)
  for (let i = 0; i < nT * 3; i++) outTris[i] = triangles[i]
  if (nV === 0 || nT === 0) {
    warnings.push('空网格 — 无嘢可修')
    return {
      mesh: { vertices: outVerts, triangles: outTris, normals: new Array<number>(outVerts.length).fill(0) },
      holesFilled: 0, boundaryEdgesBefore: 0, boundaryEdgesAfter: 0, warnings,
    }
  }
  const info = analyzeBoundary(vertices, triangles)
  if (info.degenerate > 0) warnings.push(`焊接后跳过 ${info.degenerate} 个退化/非法三角形（唔参与边界统计）`)
  if (info.openChains > 0) warnings.push(`${info.openChains} 条边界链无法闭合（悬挂/非流形边界）— 跳过`)
  const posOf = (id: number): V3 => {
    const o = info.rep[id] * 3
    return [vertices[o], vertices[o + 1], vertices[o + 2]]
  }
  let holesFilled = 0
  const fillCanon: number[] = []
  for (const loop of info.loops) {
    if (loop.length > 64) { warnings.push('大洞（>64 边）未填 — 简化后再试'); continue }
    const patch = fillLoop(loop, posOf)
    if (patch === null) { warnings.push(`边界环退化（共线/零投影面积，${loop.length} 边）— 未填`); continue }
    holesFilled++
    for (let i = 0; i < patch.length; i++) fillCanon.push(patch[i])
  }
  // 补片用焊接代表嘅「原始顶点下标」写入输出 — 唔加新顶点
  for (let i = 0; i < fillCanon.length; i++) outTris.push(info.rep[fillCanon[i]])
  // 修复后边界边重计：原图（已剔退化）+ 补片，同一焊接 id 空间
  let boundaryEdgesAfter = 0
  for (const r of buildEdges(info.canonTris.concat(fillCanon), info.nWelded).values()) if (r.n === 1) boundaryEdgesAfter++
  return {
    mesh: { vertices: outVerts, triangles: outTris, normals: recomputeNormals(outVerts, outTris) },
    holesFilled,
    boundaryEdgesBefore: info.boundaryEdges,
    boundaryEdgesAfter,
    warnings,
  }
}

// ------------------------------------------------------------------ simplifyMesh
/** 一轮顶点聚类：格仔尺寸 h → 簇 id + 簇平均位置 + 重映射兼过滤后嘅三角形（簇 id 三元组）。 */
function clusterPass(
  vertices: ArrayLike<number>, nV: number,
  triangles: ArrayLike<number>, nT: number,
  h: number, mnx: number, mny: number, mnz: number,
): { tris: number[]; cx: number[]; cy: number[]; cz: number[] } {
  const inv = 1 / h
  const cellOf = new Map<string, number>()
  const cid = new Array<number>(nV)
  const sx: number[] = [], sy: number[] = [], sz: number[] = [], cnt: number[] = []
  for (let i = 0; i < nV; i++) {
    const x = vertices[3 * i], y = vertices[3 * i + 1], z = vertices[3 * i + 2]
    const key = `${Math.floor((x - mnx) * inv)},${Math.floor((y - mny) * inv)},${Math.floor((z - mnz) * inv)}`
    let c = cellOf.get(key)
    if (c === undefined) { c = cnt.length; cellOf.set(key, c); sx.push(0); sy.push(0); sz.push(0); cnt.push(0) }
    cid[i] = c
    sx[c] += x; sy[c] += y; sz[c] += z; cnt[c]++
  }
  const nC = cnt.length
  const cx = new Array<number>(nC), cy = new Array<number>(nC), cz = new Array<number>(nC)
  for (let c = 0; c < nC; c++) { cx[c] = sx[c] / cnt[c]; cy[c] = sy[c] / cnt[c]; cz[c] = sz[c] / cnt[c] }
  // 重映射 + 三重过滤：退化（两 id 同）、零面积（叉积长 < 1e-12）、完全重复（任意旋转；反向绕向唔算）
  const seen = new Set<string>()
  const tris: number[] = []
  for (let t = 0; t < nT; t++) {
    const i0 = triangles[3 * t], i1 = triangles[3 * t + 1], i2 = triangles[3 * t + 2]
    if (!(i0 >= 0 && i0 < nV && i1 >= 0 && i1 < nV && i2 >= 0 && i2 < nV)) continue
    const a = cid[i0], b = cid[i1], c = cid[i2]
    if (a === b || b === c || c === a) continue
    const e1x = cx[b] - cx[a], e1y = cy[b] - cy[a], e1z = cz[b] - cz[a]
    const e2x = cx[c] - cx[a], e2y = cy[c] - cy[a], e2z = cz[c] - cz[a]
    const crl = Math.hypot(e1y * e2z - e1z * e2y, e1z * e2x - e1x * e2z, e1x * e2y - e1y * e2x)
    if (crl < 1e-12) continue
    const key = a < b && a < c ? `${a},${b},${c}` : b < a && b < c ? `${b},${c},${a}` : `${c},${a},${b}`
    if (seen.has(key)) continue
    seen.add(key)
    tris.push(a, b, c)
  }
  return { tris, cx, cy, cz }
}

/**
 * 快速简化（顶点聚类）。targetRatio = 目标三角形比例（0.05..0.9，出界会截+警告）。
 * 诚实讲：顶点聚类系近似法 — 初猜 h = bboxDiag/√targetTris（表面网格 tris ∝ 1/h²），
 * 最多 3 轮（初猜 + 2 次 h ×= √(实际/目标) 调整）取最近目标嗰轮；
 * 最终离目标 >×2 → 警告「简化比例偏离目标」。空网格/全退化 → 空输出 + 警告，唔掟错。
 */
export function simplifyMesh(vertices: ArrayLike<number>, triangles: ArrayLike<number>, targetRatio: number): SimplifyResult {
  const warnings: string[] = []
  const nV = Math.floor(vertices.length / 3)
  const trisBefore = Math.floor(triangles.length / 3)
  const empty = (): SimplifyResult => ({ mesh: { vertices: [], triangles: [], normals: [] }, trisBefore, trisAfter: 0, warnings })
  if (nV === 0 || trisBefore === 0) { warnings.push('空网格输入 — 无嘢可简化'); return empty() }
  let ratio = targetRatio
  if (!Number.isFinite(ratio)) { ratio = 0.5; warnings.push('targetRatio 非法 — 改用 0.5') }
  if (ratio < 0.05 || ratio > 0.9) { ratio = Math.min(0.9, Math.max(0.05, ratio)); warnings.push('targetRatio 截到 [0.05, 0.9]') }
  // bbox
  let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity
  for (let i = 0; i < nV; i++) {
    const x = vertices[3 * i], y = vertices[3 * i + 1], z = vertices[3 * i + 2]
    if (x < mnx) mnx = x; if (x > mxx) mxx = x
    if (y < mny) mny = y; if (y > mxy) mxy = y
    if (z < mnz) mnz = z; if (z > mxz) mxz = z
  }
  const diag = Math.hypot(mxx - mnx, mxy - mny, mxz - mnz)
  if (!(diag > 0)) { warnings.push('所有顶点重合 — 输出空网格'); return empty() }
  const targetTris = Math.max(1, Math.round(trisBefore * ratio))
  let h = diag / Math.sqrt(targetTris) // 初猜：表面网格 tris ∝ 1/h²
  let best: { tris: number[]; cx: number[]; cy: number[]; cz: number[] } | null = null
  let bestErr = Infinity
  for (let attempt = 0; attempt < 3; attempt++) {
    const pass = clusterPass(vertices, nV, triangles, trisBefore, h, mnx, mny, mnz)
    const got = pass.tris.length / 3
    const err = got === 0 ? Infinity : Math.abs(Math.log(got / targetTris))
    if (err < bestErr) { bestErr = err; best = pass }
    if (got >= targetTris / 1.5 && got <= targetTris * 1.5) break // 落咗喺 ×1.5 内 — 收工
    h = got === 0 ? h / 2 : h * Math.sqrt(got / targetTris)
    h = Math.min(diag, Math.max(diag / 1e6, h))
  }
  if (best === null || best.tris.length === 0) { warnings.push('简化后全部三角形退化 — 输出空网格'); return empty() }
  // 压实：只输出被引用嘅簇（代表点 = 簇平均位置）
  const remap = new Map<number, number>()
  const outVerts: number[] = []
  const outTris: number[] = []
  for (let i = 0; i < best.tris.length; i++) {
    const c = best.tris[i]
    let m = remap.get(c)
    if (m === undefined) { m = remap.size; remap.set(c, m); outVerts.push(best.cx[c], best.cy[c], best.cz[c]) }
    outTris.push(m)
  }
  const trisAfter = outTris.length / 3
  if (trisAfter > targetTris * 2 || trisAfter * 2 < targetTris) warnings.push('简化比例偏离目标（顶点聚类系近似法）')
  return {
    mesh: { vertices: outVerts, triangles: outTris, normals: recomputeNormals(outVerts, outTris) },
    trisBefore,
    trisAfter,
    warnings,
  }
}

// ------------------------------------------------------------------ QEM 简化（Garland-Heckbert 二次误差度量 / 边塌缩）
// 诚实讲：呢个系真 QEM —— 焊接后建半边邻接，逐顶点累加二次误差矩阵 Q，
// 边塌缩落点解 ∂error/∂v=0（奇异 → 端点/中点取最小误差兜底），最小堆按误差排序，
// 带翻面守卫（wouldFlip：任何相邻面法线翻向就拒绝）保持水密 + 流形。
// 比顶点聚类准好多，但慢啲 —— 大网格请配合 worker。
// Quad 长度 10: [a², ab, ac, ad, b², bc, bd, c², cd, d²]（对称 4×4 误差矩阵嘅上三角）
type Quad = Float64Array
const qZero = (): Quad => new Float64Array(10)
const qAddPlane = (q: Quad, a: number, b: number, c: number, d: number): void => {
  q[0] += a * a; q[1] += a * b; q[2] += a * c; q[3] += a * d
  q[4] += b * b; q[5] += b * c; q[6] += b * d
  q[7] += c * c; q[8] += c * d; q[9] += d * d
}
const qErr = (q: Quad, x: number, y: number, z: number): number =>
  q[0] * x * x + 2 * q[1] * x * y + 2 * q[2] * x * z + 2 * q[3] * x +
  q[4] * y * y + 2 * q[5] * y * z + 2 * q[6] * y +
  q[7] * z * z + 2 * q[8] * z + q[9]
// 解 3×3 线性系统（误差矩阵左上角块）搵最优落点；行列式≈0（共面/退化）→ null
function qOptimum(q: Quad): [number, number, number] | null {
  const m00 = q[0], m01 = q[1], m02 = q[2], m11 = q[4], m12 = q[5], m22 = q[7]
  const det = m00 * (m11 * m22 - m12 * m12) - m01 * (m01 * m22 - m12 * m02) + m02 * (m01 * m12 - m11 * m02)
  if (Math.abs(det) < 1e-12) return null
  const bx = -q[3], by = -q[6], bz = -q[8], id = 1 / det
  const x = id * (bx * (m11 * m22 - m12 * m12) - m01 * (by * m22 - m12 * bz) + m02 * (by * m12 - m11 * bz))
  const y = id * (m00 * (by * m22 - m12 * bz) - bx * (m01 * m22 - m12 * m02) + m02 * (m01 * bz - by * m02))
  const z = id * (m00 * (m11 * bz - by * m12) - m01 * (m01 * bz - by * m02) + bx * (m01 * m12 - m11 * m02))
  return [x, y, z]
}

// ------------------------------------------------------------------ 共享塌缩守卫（单一实现，QEM + 等向重网格共用）
// 诚实讲：呢两个函数喺 qemSimplify 同 isotropicRemesh 之间共用 —— 单一实现，无漂移。
// 全部参数显式传入（活动三角形数组 tA/tB/tC + 坐标 px/py/pz + 邻接 faces + 存活掩码 alive），
// 唔靠闭包捕获状态。adjacency 由调用方传入（qemSimplify 增量维护；重网格每轮重建）。

/** 单位面法线（活动三角形 f，焊接 id 坐标）；退化（叉积长≈0）→ [0,0,0]。重映射可选：a/b→P。 */
function triNormalAt(
  fa: number, fb: number, fc: number,
  px: ArrayLike<number>, py: ArrayLike<number>, pz: ArrayLike<number>,
): V3 {
  const e1: V3 = [px[fb] - px[fa], py[fb] - py[fa], pz[fb] - pz[fa]]
  const e2: V3 = [px[fc] - px[fa], py[fc] - py[fa], pz[fc] - pz[fa]]
  const n = cross(e1, e2)
  const L = vlen(n)
  if (L < 1e-20) return [0, 0, 0]
  return [n[0] / L, n[1] / L, n[2] / L]
}

/**
 * wouldFlipCollapse — 塌缩 (b→a，a/b 都移到 newPos) 后，a 或 b 任一相邻活动面嘅法线
 * 相对原法线翻向（dot<0）→ 返回 true（拒绝塌缩）。塌缩后退化消失嘅面（同含 a 又含 b）跳过；
 * 原本就退化嘅面（法线 0）唔守卫。
 *
 * 显式参数：活动三角形数组 tA/tB/tC、坐标 px/py/pz、邻接 faces（顶点→面列表）、存活掩码 alive、
 * 边端点 a/b、新落点 newPos。邻接由调用方传入（NOT 闭包捕获）。
 */
export function wouldFlipCollapse(
  tA: number[], tB: number[], tC: number[],
  px: ArrayLike<number>, py: ArrayLike<number>, pz: ArrayLike<number>,
  faces: number[][], alive: ArrayLike<number>,
  a: number, b: number, newPos: V3,
): boolean {
  const [Px, Py, Pz] = newPos
  for (const v of [a, b]) {
    const fl = faces[v]
    if (fl === undefined) continue
    for (const f of fl) {
      if (!alive[f]) continue
      const fa = tA[f], fb = tB[f], fc = tC[f]
      const hasA = fa === a || fb === a || fc === a
      const hasB = fa === b || fb === b || fc === b
      if (hasA && hasB) continue // 塌缩后退化消失 → 跳过
      const ax = fa === a || fa === b ? Px : px[fa]
      const ay = fa === a || fa === b ? Py : py[fa]
      const az = fa === a || fa === b ? Pz : pz[fa]
      const bx = fb === a || fb === b ? Px : px[fb]
      const by = fb === a || fb === b ? Py : py[fb]
      const bz = fb === a || fb === b ? Pz : pz[fb]
      const cx = fc === a || fc === b ? Px : px[fc]
      const cy = fc === a || fc === b ? Py : py[fc]
      const cz = fc === a || fc === b ? Pz : pz[fc]
      // 原法线（用未重映射坐标）
      const origN = triNormalAt(fa, fb, fc, px, py, pz)
      if (origN[0] === 0 && origN[1] === 0 && origN[2] === 0) continue // 原本就退化 → 唔守卫
      const e1: V3 = [bx - ax, by - ay, bz - az]
      const e2: V3 = [cx - ax, cy - ay, cz - az]
      const nn = cross(e1, e2)
      if (dot(nn, origN) < 0) return true
    }
  }
  return false
}

/**
 * linkConditionOk — 流形「链接条件」(Dey et al.)：边 (a,b) 可塌缩而唔折出非流形
 * ⇔ a、b 嘅公共邻居顶点集恰好等于含边 (a,b) 嘅三角形对面顶点集。
 * 内部流形边：恰好 2 个公共邻居（=2 个对面顶点）；边界边：1 个；任何额外公共邻居 → false。
 *
 * 显式参数：活动三角形数组 tA/tB/tC、邻接 faces、存活掩码 alive、边端点 a/b。
 * 返回 true ⇔ 可塌缩（边合法 + 公共邻居全部喺对面集内）。
 */
export function linkConditionOk(
  tA: number[], tB: number[], tC: number[],
  faces: number[][], alive: ArrayLike<number>,
  a: number, b: number,
): boolean {
  const facesA = faces[a], facesB = faces[b]
  if (facesA === undefined || facesB === undefined) return false
  // 含边 (a,b) 嘅三角形对面顶点集
  const opp = new Set<number>()
  for (const f of facesA) {
    if (!alive[f]) continue
    const fa = tA[f], fb = tB[f], fc = tC[f]
    if (fa !== b && fb !== b && fc !== b) continue
    const o = fa !== a && fa !== b ? fa : fb !== a && fb !== b ? fb : fc
    opp.add(o)
  }
  if (opp.size === 0) return false // 非边（a、b 唔共面）→ 唔塌缩
  // a 嘅邻居顶点集
  const nbrA = new Set<number>()
  for (const f of facesA) {
    if (!alive[f]) continue
    for (const v of [tA[f], tB[f], tC[f]]) if (v !== a) nbrA.add(v)
  }
  // b 嘅每个公共邻居（≠a）必须喺 opp 内
  for (const f of facesB) {
    if (!alive[f]) continue
    for (const v of [tA[f], tB[f], tC[f]]) {
      if (v === a || v === b) continue
      if (nbrA.has(v) && !opp.has(v)) return false
    }
  }
  return true
}

/**
 * QEM 边塌缩简化。targetRatio = 目标三角形比例，截到 [0.02, 0.9]。
 * 焊接 → 压实顶点 → 顶点↔面邻接 → 逐顶点 Q → 候选边（无向去重）→ 误差最小堆 →
 * 主循环：弹出最低误差边，懒惰更新（陈旧 cost 就重推），翻面守卫通过先塌缩，
 * 直到 curT ≤ target=max(4, round(trisBefore*ratio)) 或堆空 → 压实存活顶点/三角形 → 重算法线。
 * 返回裸对象 { vertices, triangles, normals }（唔包 {mesh:...}）；空输入 → 全空。
 * 翻面/链接守卫调用共享嘅 wouldFlipCollapse / linkConditionOk（单一实现）。
 */
export function qemSimplify(
  vertices: ArrayLike<number>,
  triangles: ArrayLike<number>,
  targetRatio: number,
): { vertices: number[]; triangles: number[]; normals: number[] } {
  const empty = (): { vertices: number[]; triangles: number[]; normals: number[] } =>
    ({ vertices: [], triangles: [], normals: [] })
  const nVin = Math.floor(vertices.length / 3)
  const trisBefore = Math.floor(triangles.length / 3)
  if (nVin === 0 || trisBefore === 0) return empty()
  let ratio = targetRatio
  if (!Number.isFinite(ratio)) ratio = 0.5
  ratio = Math.min(0.9, Math.max(0.02, ratio))

  // 焊接 → 压实顶点坐标（用焊接代表点坐标）
  const { canon, rep, nWelded } = weldVertices(vertices)
  const px = new Float64Array(nWelded), py = new Float64Array(nWelded), pz = new Float64Array(nWelded)
  for (let id = 0; id < nWelded; id++) {
    const o = rep[id] * 3
    px[id] = vertices[o]; py[id] = vertices[o + 1]; pz[id] = vertices[o + 2]
  }

  // 活动三角形数组（焊接 id；剔除退化）
  const tA: number[] = [], tB: number[] = [], tC: number[] = []
  for (let t = 0; t < trisBefore; t++) {
    const i0 = triangles[3 * t], i1 = triangles[3 * t + 1], i2 = triangles[3 * t + 2]
    if (!(i0 >= 0 && i0 < nVin && i1 >= 0 && i1 < nVin && i2 >= 0 && i2 < nVin)) continue
    const a = canon[i0], b = canon[i1], c = canon[i2]
    if (a === b || b === c || c === a) continue
    tA.push(a); tB.push(b); tC.push(c)
  }
  let curT = tA.length
  if (curT === 0) return empty()
  const alive = new Uint8Array(curT).fill(1)

  // 顶点 → 面邻接 + 顶点存活标记
  const faces: number[][] = Array.from({ length: nWelded }, () => [])
  const vAlive = new Uint8Array(nWelded)
  for (let f = 0; f < curT; f++) {
    faces[tA[f]].push(f); faces[tB[f]].push(f); faces[tC[f]].push(f)
    vAlive[tA[f]] = 1; vAlive[tB[f]] = 1; vAlive[tC[f]] = 1
  }

  // 面平面（单位法线 + d）；退化面长度≈0 → 法线 0（贡献 0 误差）。共用 triNormalAt。
  const faceNormal = (f: number): V3 => triNormalAt(tA[f], tB[f], tC[f], px, py, pz)

  // 逐顶点 Q：每个面嘅平面（单位法线，过顶点 a）累加到该面三个顶点
  const Q: Quad[] = Array.from({ length: nWelded }, () => qZero())
  for (let f = 0; f < curT; f++) {
    const N = faceNormal(f)
    if (N[0] === 0 && N[1] === 0 && N[2] === 0) continue
    const a = tA[f]
    const d = -(N[0] * px[a] + N[1] * py[a] + N[2] * pz[a])
    qAddPlane(Q[tA[f]], N[0], N[1], N[2], d)
    qAddPlane(Q[tB[f]], N[0], N[1], N[2], d)
    qAddPlane(Q[tC[f]], N[0], N[1], N[2], d)
  }

  // collapseCost(a,b)：Q 求和后解最优落点（奇异 → 端点/中点取最小误差），返回 [cost, x, y, z]
  const sumQ = qZero()
  const collapseCost = (a: number, b: number): [number, number, number, number] => {
    for (let i = 0; i < 10; i++) sumQ[i] = Q[a][i] + Q[b][i]
    const opt = qOptimum(sumQ)
    if (opt !== null) {
      const c = qErr(sumQ, opt[0], opt[1], opt[2])
      return [c, opt[0], opt[1], opt[2]]
    }
    // 兜底：端点 a、端点 b、中点 三选最小误差（避免奇异系统 NaN 毒化）
    const cands: V3[] = [
      [px[a], py[a], pz[a]],
      [px[b], py[b], pz[b]],
      [(px[a] + px[b]) / 2, (py[a] + py[b]) / 2, (pz[a] + pz[b]) / 2],
    ]
    let bc = Infinity, bx = px[a], by = py[a], bz = pz[a]
    for (const p of cands) {
      const e = qErr(sumQ, p[0], p[1], p[2])
      if (e < bc) { bc = e; bx = p[0]; by = p[1]; bz = p[2] }
    }
    return [bc, bx, by, bz]
  }

  // wouldFlip / linkOk 守卫已抽取为共享导出函数（wouldFlipCollapse / linkConditionOk），
  // 显式传入活动三角形数组 + 坐标 + 邻接 faces + 存活掩码 alive —— 单一实现，与重网格共用。

  // 候选边（无向去重，key = min*nWelded + max）
  interface HeapItem { cost: number; a: number; b: number; x: number; y: number; z: number }
  const edgeKey = (a: number, b: number): number => (a < b ? a * nWelded + b : b * nWelded + a)
  const seenEdge = new Set<number>()
  // ---- 二叉最小堆（数组实现） ----
  const heap: HeapItem[] = []
  const siftUp = (i: number): void => {
    const item = heap[i]
    while (i > 0) {
      const p = (i - 1) >> 1
      if (heap[p].cost <= item.cost) break
      heap[i] = heap[p]; i = p
    }
    heap[i] = item
  }
  const siftDown = (i: number): void => {
    const n = heap.length, item = heap[i]
    for (;;) {
      let l = 2 * i + 1
      if (l >= n) break
      const r = l + 1
      if (r < n && heap[r].cost < heap[l].cost) l = r
      if (heap[l].cost >= item.cost) break
      heap[i] = heap[l]; i = l
    }
    heap[i] = item
  }
  const heapPush = (it: HeapItem): void => { heap.push(it); siftUp(heap.length - 1) }
  const heapPop = (): HeapItem | undefined => {
    const n = heap.length
    if (n === 0) return undefined
    const top = heap[0], last = heap.pop() as HeapItem
    if (n > 1) { heap[0] = last; siftDown(0) }
    return top
  }
  const pushEdge = (a: number, b: number): void => {
    if (a === b || !vAlive[a] || !vAlive[b]) return
    const [cost, x, y, z] = collapseCost(a, b)
    heapPush({ cost, a, b, x, y, z })
  }

  // 由活动面收集所有候选边
  for (let f = 0; f < curT; f++) {
    const a = tA[f], b = tB[f], c = tC[f]
    for (const [u, v] of [[a, b], [b, c], [c, a]] as [number, number][]) {
      const k = edgeKey(u, v)
      if (seenEdge.has(k)) continue
      seenEdge.add(k)
      pushEdge(u, v)
    }
  }

  const target = Math.max(4, Math.round(trisBefore * ratio))

  // ---- 主循环 ----
  while (curT > target) {
    const top = heapPop()
    if (top === undefined) break
    const { a, b } = top
    if (!vAlive[a] || !vAlive[b]) continue
    // 懒惰更新：重算 cost，若同存储值差 >1e-9 → 重推新鲜值，continue
    const [cost, x, y, z] = collapseCost(a, b)
    if (Math.abs(cost - top.cost) > 1e-9) {
      heapPush({ cost, a, b, x, y, z })
      continue
    }
    // 流形链接条件守卫（防非流形折叠）+ 翻面守卫（共享导出函数）
    if (!linkConditionOk(tA, tB, tC, faces, alive, a, b)) continue
    if (wouldFlipCollapse(tA, tB, tC, px, py, pz, faces, alive, a, b, [x, y, z])) continue

    // ---- 执行塌缩：b → a，a 移到最优落点 ----
    px[a] = x; py[a] = y; pz[a] = z
    for (let i = 0; i < 10; i++) Q[a][i] += Q[b][i]
    vAlive[b] = 0

    // b 嘅面：重映射 b→a，杀死退化面，存活面并入 a 邻接
    for (const f of faces[b]) {
      if (!alive[f]) continue
      if (tA[f] === b) tA[f] = a
      if (tB[f] === b) tB[f] = a
      if (tC[f] === b) tC[f] = a
      if (tA[f] === tB[f] || tB[f] === tC[f] || tC[f] === tA[f]) {
        alive[f] = 0; curT--
      } else {
        faces[a].push(f)
      }
    }
    // 清掉 a 邻接里已死嘅面
    faces[a] = faces[a].filter((f) => alive[f])

    // 重算 a 周边（一环邻居）边嘅误差：以 a 为端点嘅每条边重推
    const nbrs = new Set<number>()
    for (const f of faces[a]) {
      if (!alive[f]) continue
      for (const v of [tA[f], tB[f], tC[f]]) if (v !== a && vAlive[v]) nbrs.add(v)
    }
    for (const v of nbrs) pushEdge(a, v)
  }

  // ---- 压实存活顶点/三角形 → 重算法线 ----
  const remap = new Int32Array(nWelded).fill(-1)
  const outVerts: number[] = []
  const outTris: number[] = []
  for (let f = 0; f < tA.length; f++) {
    if (!alive[f]) continue
    const ids = [tA[f], tB[f], tC[f]]
    const m = [0, 0, 0]
    for (let k = 0; k < 3; k++) {
      const id = ids[k]
      let r = remap[id]
      if (r < 0) { r = outVerts.length / 3; remap[id] = r; outVerts.push(px[id], py[id], pz[id]) }
      m[k] = r
    }
    if (m[0] === m[1] || m[1] === m[2] || m[2] === m[0]) continue
    outTris.push(m[0], m[1], m[2])
  }
  return { vertices: outVerts, triangles: outTris, normals: recomputeNormals(outVerts, outTris) }
}

// ------------------------------------------------------------------ 等向重网格（Botsch–Kobbelt）
// 诚实讲：呢个系真 Botsch–Kobbelt 等向重网格 —— 焊接共拓扑 → 标记 pinned（边界 + 特征边）→
// 建原始表面均匀网格做最近点重投影 → 每轮 split/collapse/flip/tangential-relax + reproject，
// 每轮重建邻接（split/collapse/flip 改拓扑，唔重用一次性邻接）。塌缩/翻面守卫调用共享
// wouldFlipCollapse / linkConditionOk（与 QEM 同一实现，无漂移）。
// 重投影系形状保持嘅关键：relax 后将非 pinned 顶点投返原始表面最近三角形最近点 →
// 曲面唔会缩。pinned 顶点（边界/特征）唔郁，结构保留。

export interface RemeshResult {
  vertices: number[]
  triangles: number[]
  normals: number[]
  edgeLenMean: number
  edgeLenStd: number
  trisOut: number
}

// 点到三角形最近点（Ericson, Real-Time Collision Detection 嘅经典重心坐标分支法，自写）。
function closestPointOnTri(
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
): V3 {
  const abx = bx - ax, aby = by - ay, abz = bz - az
  const acx = cx - ax, acy = cy - ay, acz = cz - az
  const apx = px - ax, apy = py - ay, apz = pz - az
  const d1 = abx * apx + aby * apy + abz * apz
  const d2 = acx * apx + acy * apy + acz * apz
  if (d1 <= 0 && d2 <= 0) return [ax, ay, az] // 顶点 A 区
  const bpx = px - bx, bpy = py - by, bpz = pz - bz
  const d3 = abx * bpx + aby * bpy + abz * bpz
  const d4 = acx * bpx + acy * bpy + acz * bpz
  if (d3 >= 0 && d4 <= d3) return [bx, by, bz] // 顶点 B 区
  const vc = d1 * d4 - d3 * d2
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3) // 边 AB 区
    return [ax + v * abx, ay + v * aby, az + v * abz]
  }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz
  const d5 = abx * cpx + aby * cpy + abz * cpz
  const d6 = acx * cpx + acy * cpy + acz * cpz
  if (d6 >= 0 && d5 <= d6) return [cx, cy, cz] // 顶点 C 区
  const vb = d5 * d2 - d1 * d6
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6) // 边 AC 区
    return [ax + w * acx, ay + w * acy, az + w * acz]
  }
  const va = d3 * d6 - d5 * d4
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6)) // 边 BC 区
    return [bx + w * (cx - bx), by + w * (cy - by), bz + w * (cz - bz)]
  }
  // 面内部：重心坐标
  const denom = 1 / (va + vb + vc)
  const v = vb * denom, w = vc * denom
  return [ax + abx * v + acx * w, ay + aby * v + acy * w, az + abz * v + acz * w]
}

/**
 * 原始表面均匀网格：将每个原始三角形按 AABB 入格 → reproject 时只查附近格仔嘅三角形。
 * 自包含（无 BVH 库依赖），格仔尺寸 ≈ 平均边长，单元上限防爆内存。
 */
function buildSurfaceGrid(
  oVX: ArrayLike<number>, oVY: ArrayLike<number>, oVZ: ArrayLike<number>,
  oTA: number[], oTB: number[], oTC: number[],
): {
  closest: (px: number, py: number, pz: number) => V3
} {
  const nT = oTA.length
  // bbox
  let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity
  let edgeAcc = 0, edgeN = 0
  for (let f = 0; f < nT; f++) {
    const a = oTA[f], b = oTB[f], c = oTC[f]
    for (const id of [a, b, c]) {
      if (oVX[id] < mnx) mnx = oVX[id]; if (oVX[id] > mxx) mxx = oVX[id]
      if (oVY[id] < mny) mny = oVY[id]; if (oVY[id] > mxy) mxy = oVY[id]
      if (oVZ[id] < mnz) mnz = oVZ[id]; if (oVZ[id] > mxz) mxz = oVZ[id]
    }
    edgeAcc += Math.hypot(oVX[b] - oVX[a], oVY[b] - oVY[a], oVZ[b] - oVZ[a]); edgeN++
  }
  const diag = Math.hypot(mxx - mnx, mxy - mny, mxz - mnz) || 1
  let cell = edgeN > 0 ? edgeAcc / edgeN : diag / 16
  if (!(cell > 0)) cell = diag / 16
  // 防爆：限制每轴格仔数 ≤ 64
  const clampDim = (lo: number, hi: number): number => Math.max(1, Math.min(64, Math.ceil((hi - lo) / cell) || 1))
  const nx = clampDim(mnx, mxx), ny = clampDim(mny, mxy), nz = clampDim(mnz, mxz)
  const hx = (mxx - mnx) / nx || 1, hy = (mxy - mny) / ny || 1, hz = (mxz - mnz) / nz || 1
  const cellIdx = (ix: number, iy: number, iz: number): number => (ix * ny + iy) * nz + iz
  const clampI = (v: number, n: number): number => (v < 0 ? 0 : v >= n ? n - 1 : v)
  const grid: number[][] = Array.from({ length: nx * ny * nz }, () => [])
  for (let f = 0; f < nT; f++) {
    const a = oTA[f], b = oTB[f], c = oTC[f]
    const lx = Math.min(oVX[a], oVX[b], oVX[c]), ux = Math.max(oVX[a], oVX[b], oVX[c])
    const ly = Math.min(oVY[a], oVY[b], oVY[c]), uy = Math.max(oVY[a], oVY[b], oVY[c])
    const lz = Math.min(oVZ[a], oVZ[b], oVZ[c]), uz = Math.max(oVZ[a], oVZ[b], oVZ[c])
    const ix0 = clampI(Math.floor((lx - mnx) / hx), nx), ix1 = clampI(Math.floor((ux - mnx) / hx), nx)
    const iy0 = clampI(Math.floor((ly - mny) / hy), ny), iy1 = clampI(Math.floor((uy - mny) / hy), ny)
    const iz0 = clampI(Math.floor((lz - mnz) / hz), nz), iz1 = clampI(Math.floor((uz - mnz) / hz), nz)
    for (let ix = ix0; ix <= ix1; ix++) for (let iy = iy0; iy <= iy1; iy++) for (let iz = iz0; iz <= iz1; iz++) {
      grid[cellIdx(ix, iy, iz)].push(f)
    }
  }
  const evalTri = (px: number, py: number, pz: number, f: number): { d2: number; p: V3 } => {
    const a = oTA[f], b = oTB[f], c = oTC[f]
    const q = closestPointOnTri(px, py, pz, oVX[a], oVY[a], oVZ[a], oVX[b], oVY[b], oVZ[b], oVX[c], oVY[c], oVZ[c])
    const dx = q[0] - px, dy = q[1] - py, dz = q[2] - pz
    return { d2: dx * dx + dy * dy + dz * dz, p: q }
  }
  const closest = (px: number, py: number, pz: number): V3 => {
    const cx = clampI(Math.floor((px - mnx) / hx), nx)
    const cy = clampI(Math.floor((py - mny) / hy), ny)
    const cz = clampI(Math.floor((pz - mnz) / hz), nz)
    let best: V3 = [px, py, pz]
    let bestD2 = Infinity
    // 由 ring=0 起逐圈扩，直到搵到候选且半径足够覆盖当前最近距离
    for (let ring = 0; ring < Math.max(nx, ny, nz); ring++) {
      let found = false
      const x0 = cx - ring, x1 = cx + ring, y0 = cy - ring, y1 = cy + ring, z0 = cz - ring, z1 = cz + ring
      for (let ix = Math.max(0, x0); ix <= Math.min(nx - 1, x1); ix++) {
        for (let iy = Math.max(0, y0); iy <= Math.min(ny - 1, y1); iy++) {
          for (let iz = Math.max(0, z0); iz <= Math.min(nz - 1, z1); iz++) {
            // 只扫呢圈嘅外壳（避免重复内层格仔）
            if (ring > 0 && ix > x0 && ix < x1 && iy > y0 && iy < y1 && iz > z0 && iz < z1) continue
            for (const f of grid[cellIdx(ix, iy, iz)]) {
              found = true
              const r = evalTri(px, py, pz, f)
              if (r.d2 < bestD2) { bestD2 = r.d2; best = r.p }
            }
          }
        }
      }
      // 已搵到候选 + 当前最近距离细过 ring 已覆盖嘅最小盒半径 → 收工
      if (bestD2 < Infinity) {
        const safe = ring * Math.min(hx, hy, hz)
        if (Math.sqrt(bestD2) <= safe || (!found && ring > 0)) break
      }
    }
    // 极端兜底：网格全空匹配（理论唔会）→ 线性扫
    if (bestD2 === Infinity) {
      for (let f = 0; f < nT; f++) {
        const r = evalTri(px, py, pz, f)
        if (r.d2 < bestD2) { bestD2 = r.d2; best = r.p }
      }
    }
    return best
  }
  return { closest }
}

/**
 * 等向重网格（Botsch–Kobbelt）。targetLen = 目标边长；iters = 迭代轮数（默认 5）。
 * 算法：
 *   1. weldVertices(1e-4) → 共拓扑压实顶点（可变 X/Y/Z；split 推新点）；剔退化三角形。
 *   2. pinned 顶点 = 边界边端点（边只属 1 面）+ 特征边端点（二面角 > 30°，相邻面法线 dot < cos30°）。
 *   3. 建原始表面均匀网格做最近点重投影（形状保持关键）。
 *   4. 每轮：split(>4/3·L) → collapse(<4/5·L，守卫) → flip(向 valence-6/4，严格改善 + 非共面 + 唔翻面) →
 *      tangential Laplacian relax（移向 1-ring 形心嘅切向分量，pinned 唔郁）→ reproject 返原始表面。
 *      每轮重建邻接。
 *   5. 返回 verts/tris/normals（recomputeNormals）+ edgeLenMean/edgeLenStd/trisOut。
 */
export function isotropicRemesh(
  vertices: ArrayLike<number>,
  triangles: ArrayLike<number>,
  targetLen: number,
  iters = 5,
): RemeshResult {
  const empty = (): RemeshResult =>
    ({ vertices: [], triangles: [], normals: [], edgeLenMean: 0, edgeLenStd: 0, trisOut: 0 })
  const nVin = Math.floor(vertices.length / 3)
  const nTin = Math.floor(triangles.length / 3)
  if (nVin === 0 || nTin === 0 || !(targetLen > 0)) return empty()
  const L = targetLen
  const Lhi = (4 / 3) * L          // split 阈值
  const Llo = (4 / 5) * L          // collapse 阈值
  const Lhi2 = Lhi * Lhi, Llo2 = Llo * Llo
  const COS30 = Math.cos((30 * Math.PI) / 180) // 特征边/flip 共面阈值

  // ---- 1. 焊接 → 共拓扑压实（可变坐标数组，split 推新点） ----
  const { canon } = weldVertices(vertices, 1e-4)
  // 压实焊接 id → 连续，坐标用代表点
  const X: number[] = [], Y: number[] = [], Z: number[] = []
  // tris（焊接 id），剔退化
  let tA: number[] = [], tB: number[] = [], tC: number[] = []
  for (let t = 0; t < nTin; t++) {
    const i0 = triangles[3 * t], i1 = triangles[3 * t + 1], i2 = triangles[3 * t + 2]
    if (!(i0 >= 0 && i0 < nVin && i1 >= 0 && i1 < nVin && i2 >= 0 && i2 < nVin)) continue
    const a = canon[i0], b = canon[i1], c = canon[i2]
    if (a === b || b === c || c === a) continue
    tA.push(a); tB.push(b); tC.push(c)
  }
  if (tA.length === 0) return empty()
  // 压实焊接 id 到 0..nV-1（只保留被引用嘅），坐标用焊接代表点（canon 第一个出现嘅原始顶点）
  const firstOf = new Map<number, number>()
  for (let i = 0; i < canon.length; i++) if (!firstOf.has(canon[i])) firstOf.set(canon[i], i)
  const remap2 = new Map<number, number>()
  const remapId2 = (id: number): number => {
    let m = remap2.get(id)
    if (m === undefined) {
      m = X.length
      remap2.set(id, m)
      const o = 3 * (firstOf.get(id) as number)
      X.push(vertices[o]); Y.push(vertices[o + 1]); Z.push(vertices[o + 2])
    }
    return m
  }
  for (let f = 0; f < tA.length; f++) { tA[f] = remapId2(tA[f]); tB[f] = remapId2(tB[f]); tC[f] = remapId2(tC[f]) }

  // ---- 原始表面快照（reproject 目标，永不改变） ----
  const oVX = X.slice(), oVY = Y.slice(), oVZ = Z.slice()
  const oTA = tA.slice(), oTB = tB.slice(), oTC = tC.slice()
  const grid = buildSurfaceGrid(oVX, oVY, oVZ, oTA, oTB, oTC)

  // ---- 邻接重建（每轮调用：split/collapse/flip 改拓扑） ----
  // 返回 faces[v] = 顶点 v 嘅活动面列表；alive 全 1（重建后无死面）
  interface Adj { faces: number[][]; alive: Uint8Array; nV: number }
  const buildAdj = (): Adj => {
    const nV = X.length
    const faces: number[][] = Array.from({ length: nV }, () => [])
    const alive = new Uint8Array(tA.length).fill(1)
    for (let f = 0; f < tA.length; f++) {
      faces[tA[f]].push(f); faces[tB[f]].push(f); faces[tC[f]].push(f)
    }
    return { faces, alive, nV }
  }

  // 面单位法线
  const fN = (f: number): V3 => triNormalAt(tA[f], tB[f], tC[f], X, Y, Z)
  // 顶点间距²
  const dist2 = (u: number, v: number): number => {
    const dx = X[u] - X[v], dy = Y[u] - Y[v], dz = Z[u] - Z[v]
    return dx * dx + dy * dy + dz * dz
  }

  // ---- 标记 pinned：边界边（1 面）+ 特征边（二面角 > 30°） ----
  // 每轮可能新增 split 点喺特征/边界线上 → pinned 计算放每轮开头（拓扑变咗要重算）。
  const computePinned = (alive: Uint8Array, nV: number): Uint8Array => {
    const pinned = new Uint8Array(nV)
    // 无向边 → 邻接面列表（最多记两个 + 计数）
    const edgeFaces = new Map<number, { n: number; f0: number; f1: number; a: number; b: number }>()
    const key = (a: number, b: number): number => (a < b ? a * nV + b : b * nV + a)
    for (let f = 0; f < tA.length; f++) {
      if (!alive[f]) continue
      const vs = [tA[f], tB[f], tC[f]]
      for (let e = 0; e < 3; e++) {
        const a = vs[e], b = vs[(e + 1) % 3]
        const k = key(a, b)
        const r = edgeFaces.get(k)
        if (r) { r.n++; if (r.n === 2) r.f1 = f }
        else edgeFaces.set(k, { n: 1, f0: f, f1: -1, a, b })
      }
    }
    for (const r of edgeFaces.values()) {
      if (r.n === 1) { pinned[r.a] = 1; pinned[r.b] = 1; continue } // 边界边
      if (r.n === 2) {
        const n0 = fN(r.f0), n1 = fN(r.f1)
        const dotn = dot(n0, n1)
        // 退化面法线 0 → dot 0 → 当特征处理（保守）；真特征 dot < cos30
        if (!(n0[0] === 0 && n0[1] === 0 && n0[2] === 0) && !(n1[0] === 0 && n1[1] === 0 && n1[2] === 0)) {
          if (dotn < COS30) { pinned[r.a] = 1; pinned[r.b] = 1 }
        }
      } else { // 非流形边 (>2 面) → pin 端点
        pinned[r.a] = 1; pinned[r.b] = 1
      }
    }
    return pinned
  }

  // ---- 工具：将活动三角形压实（去死面）→ 新 tA/tB/tC（保 X/Y/Z 不变；之后顶点压实独立做） ----
  const compactFaces = (alive: Uint8Array): void => {
    const nA: number[] = [], nB: number[] = [], nC: number[] = []
    for (let f = 0; f < tA.length; f++) {
      if (!alive[f]) continue
      nA.push(tA[f]); nB.push(tB[f]); nC.push(tC[f])
    }
    tA = nA; tB = nB; tC = nC
  }

  // ============ 主迭代 ============
  for (let iter = 0; iter < iters; iter++) {
    // ---- (1) SPLIT：长边 (>Lhi) 喺中点裂开 ----
    // 稳妥做法：先收集所有要裂嘅边 + 各自中点（无向，每边一个共享中点 → 保持共拓扑/水密），
    // 然后逐面重建：每个面睇佢三条边有几多条要裂，按 1/2/3 条裂边模式重切。
    // 避免「边逐个裂改面但 edgeFaces 指向陈旧面」嘅水密破坏。
    // 中点重投影：两端都非 pinned 嘅边（内部边）→ 中点喺曲面内 → 投返原始表面（防缩）；
    //   含 pinned 端嘅边（特征/边界边）→ 中点留喺弦中点（落喺原始折线段上，保特征/边界）。
    {
      const adjS = buildAdj()
      const pinnedS = computePinned(adjS.alive, adjS.nV)
      const nV0 = X.length
      const key = (a: number, b: number): number => (a < b ? a * nV0 + b : b * nV0 + a)
      const midOf = new Map<number, number>() // 边 key → 共享中点 id（按需建立）
      const getMid = (a: number, b: number): number => {
        const k = key(a, b)
        let m = midOf.get(k)
        if (m === undefined) {
          m = X.length
          let cx = (X[a] + X[b]) / 2, cy = (Y[a] + Y[b]) / 2, cz = (Z[a] + Z[b]) / 2
          if (!(pinnedS[a] && pinnedS[b])) { const p = grid.closest(cx, cy, cz); cx = p[0]; cy = p[1]; cz = p[2] }
          X.push(cx); Y.push(cy); Z.push(cz)
          midOf.set(k, m)
        }
        return m
      }
      const longEdge = (a: number, b: number): boolean => dist2(a, b) > Lhi2
      const nFaces = tA.length
      const nA: number[] = [], nB: number[] = [], nC: number[] = []
      const push3 = (a: number, b: number, c: number): void => { nA.push(a); nB.push(b); nC.push(c) }
      for (let f = 0; f < nFaces; f++) {
        const a = tA[f], b = tB[f], c = tC[f] // 绕向 a→b→c
        const sab = longEdge(a, b), sbc = longEdge(b, c), sca = longEdge(c, a)
        const n = (sab ? 1 : 0) + (sbc ? 1 : 0) + (sca ? 1 : 0)
        if (n === 0) { push3(a, b, c); continue }
        if (n === 1) {
          // 1 条长边 → 1 分 2
          if (sab) { const m = getMid(a, b); push3(a, m, c); push3(m, b, c) }
          else if (sbc) { const m = getMid(b, c); push3(b, m, a); push3(m, c, a) }
          else { const m = getMid(c, a); push3(c, m, b); push3(m, a, b) }
          continue
        }
        if (n === 2) {
          // 2 条长边 → 1 分 3（拣个角连两条裂边）
          if (sab && sbc) { // 角 b
            const m1 = getMid(a, b), m2 = getMid(b, c)
            push3(m1, b, m2); push3(a, m1, m2); push3(a, m2, c)
          } else if (sbc && sca) { // 角 c
            const m1 = getMid(b, c), m2 = getMid(c, a)
            push3(m1, c, m2); push3(b, m1, m2); push3(b, m2, a)
          } else { // sca && sab，角 a
            const m1 = getMid(c, a), m2 = getMid(a, b)
            push3(m1, a, m2); push3(c, m1, m2); push3(c, m2, b)
          }
          continue
        }
        // n === 3 → 1 分 4（标准 1-to-4 细分）
        const mab = getMid(a, b), mbc = getMid(b, c), mca = getMid(c, a)
        push3(a, mab, mca); push3(mab, b, mbc); push3(mca, mbc, c); push3(mab, mbc, mca)
      }
      tA = nA; tB = nB; tC = nC
    }

    // ---- (2) COLLAPSE：短边 (<Llo) 塌缩（守卫 + skip pinned） ----
    {
      const adj = buildAdj()
      const pinned = computePinned(adj.alive, adj.nV)
      const alive = adj.alive
      const faces = adj.faces
      // 候选短边（无向去重）
      const key = (a: number, b: number): number => (a < b ? a * adj.nV + b : b * adj.nV + a)
      const seen = new Set<number>()
      const collapsed = new Uint8Array(adj.nV) // 已被塌缩掉嘅顶点（vAlive=0）
      for (let f = 0; f < tA.length; f++) {
        if (!alive[f]) continue
        const vs = [tA[f], tB[f], tC[f]]
        for (let e = 0; e < 3; e++) {
          const a = vs[e], b = vs[(e + 1) % 3]
          const k = key(a, b)
          if (seen.has(k)) continue
          seen.add(k)
          if (collapsed[a] || collapsed[b]) continue
          if (dist2(a, b) >= Llo2) continue
          // 塌缩方向：b→a。pinned 处理：
          //  - 两端都 pinned → 唔塌（保特征/边界结构）
          //  - 一端 pinned → 塌向 pinned 端（移动嘅系非 pinned 端，落点 = pinned 端坐标）
          //  - 都唔 pinned → 落点 = 中点
          if (pinned[a] && pinned[b]) continue
          let keep = a, drop = b
          let nx: number, ny: number, nz: number
          if (pinned[a] && !pinned[b]) { keep = a; drop = b; nx = X[a]; ny = Y[a]; nz = Z[a] }
          else if (pinned[b] && !pinned[a]) { keep = b; drop = a; nx = X[b]; ny = Y[b]; nz = Z[b] }
          else {
            // 两端都非 pinned → 落点 = 中点重投影返原始表面（中点喺曲面内 → 唔投影会缩）
            keep = a; drop = b
            const mp = grid.closest((X[a] + X[b]) / 2, (Y[a] + Y[b]) / 2, (Z[a] + Z[b]) / 2)
            nx = mp[0]; ny = mp[1]; nz = mp[2]
          }
          // 守卫：链接条件（流形）+ 翻面（共享函数）。注意方向 drop→keep。
          if (!linkConditionOk(tA, tB, tC, faces, alive, keep, drop)) continue
          if (wouldFlipCollapse(tA, tB, tC, X, Y, Z, faces, alive, keep, drop, [nx, ny, nz])) continue
          // 执行塌缩 drop→keep
          X[keep] = nx; Y[keep] = ny; Z[keep] = nz
          collapsed[drop] = 1
          for (const ff of faces[drop]) {
            if (!alive[ff]) continue
            if (tA[ff] === drop) tA[ff] = keep
            if (tB[ff] === drop) tB[ff] = keep
            if (tC[ff] === drop) tC[ff] = keep
            if (tA[ff] === tB[ff] || tB[ff] === tC[ff] || tC[ff] === tA[ff]) alive[ff] = 0
            else faces[keep].push(ff)
          }
          faces[keep] = faces[keep].filter((x) => alive[x])
          break // 一个面最多塌一条边／轮，避免邻接乱套
        }
      }
      compactFaces(alive)
    }

    // ---- (3) FLIP：对角线翻向 valence-6（内部）/4（边界）；严格改善 + 非共面 + 唔翻面 ----
    {
      const adj = buildAdj()
      const pinned = computePinned(adj.alive, adj.nV)
      const alive = adj.alive
      const faces = adj.faces
      const nV = adj.nV
      // 顶点 valence（活动面贡献）
      const valence = new Int32Array(nV)
      const incident = (v: number): number => {
        const nb = new Set<number>()
        for (const f of faces[v]) {
          if (!alive[f]) continue
          for (const w of [tA[f], tB[f], tC[f]]) if (w !== v) nb.add(w)
        }
        return nb.size
      }
      for (let v = 0; v < nV; v++) valence[v] = incident(v)
      // 边界顶点集（边只属 1 面）→ 目标 valence 4，否则 6
      const boundaryV = new Uint8Array(nV)
      {
        const key = (a: number, b: number): number => (a < b ? a * nV + b : b * nV + a)
        const ec = new Map<number, number>()
        for (let f = 0; f < tA.length; f++) {
          if (!alive[f]) continue
          const vs = [tA[f], tB[f], tC[f]]
          for (let e = 0; e < 3; e++) { const k = key(vs[e], vs[(e + 1) % 3]); ec.set(k, (ec.get(k) || 0) + 1) }
        }
        for (const [k, c] of ec) if (c === 1) { boundaryV[Math.floor(k / nV)] = 1; boundaryV[k % nV] = 1 }
      }
      const tgt = (v: number): number => (boundaryV[v] ? 4 : 6)
      const dev = (v: number): number => Math.abs(valence[v] - tgt(v))
      // 无向边 → 邻接面列表（内部边恰好 2 面先可翻）。同时维护「现存边集」防翻出重边。
      const key = (a: number, b: number): number => (a < b ? a * nV + b : b * nV + a)
      const edgeFaces = new Map<number, number[]>()
      const edgeSet = new Set<number>() // 现存无向边（防翻出已存在嘅 c-d → 非流形）
      for (let f = 0; f < tA.length; f++) {
        if (!alive[f]) continue
        const vs = [tA[f], tB[f], tC[f]]
        for (let e = 0; e < 3; e++) {
          const kk = key(vs[e], vs[(e + 1) % 3]); edgeSet.add(kk)
          const arr = edgeFaces.get(kk); if (arr) arr.push(f); else edgeFaces.set(kk, [f])
        }
      }
      // 关键：每个面每轮最多参与一次翻边。参与过即标 touched，跳过任何含 touched 面嘅边
      // → 杜绝读到陈旧面成员关系而折出非流形（min<2 / max>2）。
      const touched = new Uint8Array(tA.length)
      const triN = (p: number, q: number, r: number): V3 => triNormalAt(p, q, r, X, Y, Z)
      for (const [k, fl] of edgeFaces) {
        if (fl.length !== 2) continue
        const f0 = fl[0], f1 = fl[1]
        if (!alive[f0] || !alive[f1]) continue
        if (touched[f0] || touched[f1]) continue // 已参与过翻边 → 成员关系可能变 → 跳过
        const a = Math.floor(k / nV), b = k % nV
        // 确认两面当前仍真係共享边 (a,b)（edgeFaces 可能因之前翻边而陈旧）
        const hasEdge = (f: number): boolean => {
          const u = tA[f], v = tB[f], w = tC[f]
          return (u === a || v === a || w === a) && (u === b || v === b || w === b)
        }
        if (!hasEdge(f0) || !hasEdge(f1)) continue
        const oppOf = (f: number): number => {
          const v0 = tA[f], v1 = tB[f], v2 = tC[f]
          return v0 !== a && v0 !== b ? v0 : v1 !== a && v1 !== b ? v1 : v2
        }
        const c = oppOf(f0), d = oppOf(f1)
        if (c === d) continue
        if (edgeSet.has(key(c, d))) continue // 翻后新边 c-d 已存在 → 非流形 → 唔翻
        // 非共面：两面法线夹角 > epsilon（避免平区震荡）。近共面 → 唔翻。
        const n0 = fN(f0), n1 = fN(f1)
        if (n0[0] === 0 && n0[1] === 0 && n0[2] === 0) continue
        if (n1[0] === 0 && n1[1] === 0 && n1[2] === 0) continue
        if (dot(n0, n1) > 0.999) continue // 近共面 → 唔翻（平区唔郁）
        // 唔翻边界边（保边界）同特征边（pinned 两端 → 保特征线）
        if (boundaryV[a] && boundaryV[b]) continue
        if (pinned[a] && pinned[b]) continue
        // valence 改善：翻前 a,b 各 -1；c,d 各 +1
        const before = dev(a) + dev(b) + dev(c) + dev(d)
        const after = Math.abs(valence[a] - 1 - tgt(a)) + Math.abs(valence[b] - 1 - tgt(b)) +
          Math.abs(valence[c] + 1 - tgt(c)) + Math.abs(valence[d] + 1 - tgt(d))
        if (!(after < before)) continue // 严格改善先翻
        // 翻后两面：一个含 a（替 f0）一个含 b（替 f1），绕向使法线分别 ≈ n0/n1。
        const cand1a = triN(c, d, a), cand1b = triN(c, d, b)
        let fa0: [number, number, number], fa1: [number, number, number]
        if (dot(cand1a, n0) > 0 && dot(cand1b, n1) > 0) { fa0 = [c, d, a]; fa1 = [d, c, b] }
        else { fa0 = [d, c, a]; fa1 = [c, d, b] }
        const nn0 = triN(fa0[0], fa0[1], fa0[2]), nn1 = triN(fa1[0], fa1[1], fa1[2])
        if (dot(nn0, n0) <= 0 || dot(nn1, n1) <= 0) continue // 翻面 → 唔翻
        // 执行翻边
        tA[f0] = fa0[0]; tB[f0] = fa0[1]; tC[f0] = fa0[2]
        tA[f1] = fa1[0]; tB[f1] = fa1[1]; tC[f1] = fa1[2]
        touched[f0] = 1; touched[f1] = 1
        valence[a]--; valence[b]--; valence[c]++; valence[d]++
        edgeSet.delete(k); edgeSet.add(key(c, d))
      }
      compactFaces(alive)
    }

    // ---- (4) TANGENTIAL RELAX：移向 1-ring 形心嘅切向分量 → reproject 返原始表面 ----
    {
      const adj = buildAdj()
      const pinned = computePinned(adj.alive, adj.nV)
      const faces = adj.faces
      const alive = adj.alive
      const nV = adj.nV
      // 顶点法线（面积加权面法线累加）
      const vnx = new Float64Array(nV), vny = new Float64Array(nV), vnz = new Float64Array(nV)
      for (let f = 0; f < tA.length; f++) {
        if (!alive[f]) continue
        const a = tA[f], b = tB[f], c = tC[f]
        const e1x = X[b] - X[a], e1y = Y[b] - Y[a], e1z = Z[b] - Z[a]
        const e2x = X[c] - X[a], e2y = Y[c] - Y[a], e2z = Z[c] - Z[a]
        const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x
        for (const v of [a, b, c]) { vnx[v] += nx; vny[v] += ny; vnz[v] += nz }
      }
      const newX = X.slice(), newY = Y.slice(), newZ = Z.slice()
      for (let v = 0; v < nV; v++) {
        if (pinned[v]) continue
        // 1-ring 形心
        const nb = new Set<number>()
        for (const f of faces[v]) { if (!alive[f]) continue; for (const w of [tA[f], tB[f], tC[f]]) if (w !== v) nb.add(w) }
        if (nb.size === 0) continue
        let cx = 0, cy = 0, cz = 0
        for (const w of nb) { cx += X[w]; cy += Y[w]; cz += Z[w] }
        cx /= nb.size; cy /= nb.size; cz /= nb.size
        // 位移 = 形心 − v；去除法向分量 → 切向
        let dx = cx - X[v], dy = cy - Y[v], dz = cz - Z[v]
        const nl = Math.hypot(vnx[v], vny[v], vnz[v])
        if (nl > 1e-20) {
          const ux = vnx[v] / nl, uy = vny[v] / nl, uz = vnz[v] / nl
          const dn = dx * ux + dy * uy + dz * uz
          dx -= dn * ux; dy -= dn * uy; dz -= dn * uz
        }
        const mx = X[v] + dx, my = Y[v] + dy, mz = Z[v] + dz
        // reproject 返原始表面最近点（形状保持）
        const p = grid.closest(mx, my, mz)
        newX[v] = p[0]; newY[v] = p[1]; newZ[v] = p[2]
      }
      for (let v = 0; v < nV; v++) { X[v] = newX[v]; Y[v] = newY[v]; Z[v] = newZ[v] }
    }
  }

  // ============ 输出：压实存活顶点（去孤立）+ 重算法线 + 边长统计 ============
  // tA/tB/tC 已 compact（无死面）；压实被引用顶点
  const used = new Map<number, number>()
  const outVerts: number[] = []
  const outTris: number[] = []
  for (let f = 0; f < tA.length; f++) {
    const ids = [tA[f], tB[f], tC[f]]
    const m = [0, 0, 0]
    for (let k = 0; k < 3; k++) {
      const id = ids[k]
      let r = used.get(id)
      if (r === undefined) { r = outVerts.length / 3; used.set(id, r); outVerts.push(X[id], Y[id], Z[id]) }
      m[k] = r
    }
    if (m[0] === m[1] || m[1] === m[2] || m[2] === m[0]) continue
    outTris.push(m[0], m[1], m[2])
  }
  // 边长统计（无向边）
  const nVo = outVerts.length / 3
  const ekey = (a: number, b: number): number => (a < b ? a * nVo + b : b * nVo + a)
  const seenE = new Set<number>()
  const lens: number[] = []
  for (let t = 0; t < outTris.length; t += 3) {
    const v = [outTris[t], outTris[t + 1], outTris[t + 2]]
    for (let e = 0; e < 3; e++) {
      const a = v[e], b = v[(e + 1) % 3]
      const k = ekey(a, b)
      if (seenE.has(k)) continue
      seenE.add(k)
      lens.push(Math.hypot(
        outVerts[3 * a] - outVerts[3 * b],
        outVerts[3 * a + 1] - outVerts[3 * b + 1],
        outVerts[3 * a + 2] - outVerts[3 * b + 2],
      ))
    }
  }
  let mean = 0
  for (const l of lens) mean += l
  mean = lens.length ? mean / lens.length : 0
  let varAcc = 0
  for (const l of lens) varAcc += (l - mean) * (l - mean)
  const std = lens.length ? Math.sqrt(varAcc / lens.length) : 0
  return {
    vertices: outVerts,
    triangles: outTris,
    normals: recomputeNormals(outVerts, outTris),
    edgeLenMean: mean,
    edgeLenStd: std,
    trisOut: outTris.length / 3,
  }
}

// ------------------------------------------------------------------ 测试钩（同 voxelfea 一样嘅 _internals 模式）
export const _internals: { findBoundaryLoops: Function; weldVertices: Function } = { findBoundaryLoops, weldVertices }
