// 草图【区域检测 / 平面排布 (planar arrangement)】—— 修核心 CAD 缺口：
// 唔同 2D 图元（直线 / 折线 / 圆 / 弧 / 矩形…）相交时，喺相交位切断 → 搵出佢哋围成嘅【封闭区域 (face)】，
// 每个区域可以独立填充 + 拉伸。对标 Fusion：随便画交叉曲线，凡围埋一圈嘅地方就系一个可拉伸 profile。
//
// 做法（稳健 = 全部 tessellate 成线段再做线段排布；弧/圆细分够密，视觉/拉伸可接受）：
//   1. 每个图形边界 → 线段集（圆/弧细分）
//   2. 全部线段两两求交，喺交点切断
//   3. 量化去重顶点 → 无向图；反复剪走悬边（degree≤1，唔围成环嘅须）
//   4. 半边遍历（顺时针 next）抽取所有最小封闭面；按有向面积分内/外
//   5. 返回封闭面（CCW 环）+ 整体「填充区」外边界（内部共享边消去 = 并集轮廓，畀拉伸用）
//
// 纯函数、零依赖、可喺 Node 验证（同 windtunnel 一样先验数值再接 UI）。
export type Pt = [number, number]

// 宽松草图图形（只读我哋要嘅字段，避免硬绑 store.SketchShape 全形）
export interface RShape {
  type: 'rect' | 'circle' | 'poly'
  a?: Pt; b?: Pt                  // rect 对角
  c?: Pt; r?: number             // circle 圆心/半径
  pts?: Pt[]                     // poly 边界点（弧/样条已 sample 入 pts）
  open?: boolean                 // 开放 poly（唔闭合）
  point?: boolean                // 草图点（r=0）→ 跳过
  construction?: boolean         // 构造线 → 唔参与
}

const CIRCLE_SEG = 96            // 圆细分段数（够密：视觉光滑、拉伸够准）
const QUANT = 1e3                // 顶点量化（1/1000 mm 去重）
const SEG_BUDGET = 1600          // O(n²) 求交预算（1600²/2 ≈ 1.3M 次，~10ms 级）

// Douglas–Peucker 折线简化（用户实战：手绘/样条一条几百点，4 条就爆旧 800 段预算令检测静默熄咗 —
// 先 DP 简化再入排布，视觉容差 0.08mm 起步，仍超预算就逐级放宽）。
export function simplifyDP(pts: Pt[], eps: number): Pt[] {
  const n = pts.length
  if (n <= 8) return pts
  const keep = new Array<boolean>(n).fill(false)
  keep[0] = keep[n - 1] = true
  const stack: [number, number][] = [[0, n - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    if (b - a < 2) continue
    const ax = pts[a][0], ay = pts[a][1], dx = pts[b][0] - ax, dy = pts[b][1] - ay
    const L2 = dx * dx + dy * dy || 1e-12
    let imax = -1, dmax = 0
    for (let i = a + 1; i < b; i++) {
      const t = Math.max(0, Math.min(1, ((pts[i][0] - ax) * dx + (pts[i][1] - ay) * dy) / L2))
      const d = Math.hypot(pts[i][0] - (ax + t * dx), pts[i][1] - (ay + t * dy))
      if (d > dmax) { dmax = d; imax = i }
    }
    if (dmax > eps && imax > 0) { keep[imax] = true; stack.push([a, imax], [imax, b]) }
  }
  return pts.filter((_, i) => keep[i])
}

// 射线法点在多边形内（包含树判定用）
export function pointInPoly(p: Pt, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1]
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi || 1e-12) + xi) inside = !inside
  }
  return inside
}

// 闭合图形 → 外轮廓多边形（开放/构造/点 → null）。畀「精确 profile 代数」做 loop↔face 配对用。
export function shapeOutline(sh: RShape): Pt[] | null {
  if (sh.construction || sh.point || sh.open) return null
  if (sh.type === 'rect' && sh.a && sh.b) { const [a0, a1] = sh.a, [b0, b1] = sh.b; return [[a0, a1], [b0, a1], [b0, b1], [a0, b1]] }
  if (sh.type === 'circle' && sh.c && sh.r != null) {
    if (sh.r < 0.05) return null
    const o: Pt[] = []
    for (let i = 0; i < CIRCLE_SEG; i++) { const a = (i / CIRCLE_SEG) * Math.PI * 2; o.push([sh.c[0] + sh.r * Math.cos(a), sh.c[1] + sh.r * Math.sin(a)]) }
    return o
  }
  if (sh.pts && sh.pts.length >= 3) return sh.pts.map((p) => [p[0], p[1]] as Pt)
  return null
}

// 一个图形 → 边界线段集（端点对）。closed 图形会闭合。
function shapeSegs(sh: RShape): [Pt, Pt][] {
  const segs: [Pt, Pt][] = []
  const chain = (pts: Pt[], closed: boolean) => {
    const n = pts.length
    if (n < 2) return
    const lim = closed ? n : n - 1
    for (let i = 0; i < lim; i++) { const p = pts[i], q = pts[(i + 1) % n]; if (Math.hypot(q[0] - p[0], q[1] - p[1]) > 1e-7) segs.push([p, q]) }
  }
  if (sh.type === 'rect' && sh.a && sh.b) {
    const [a0, a1] = sh.a, [b0, b1] = sh.b
    chain([[a0, a1], [b0, a1], [b0, b1], [a0, b1]], true)
  } else if (sh.type === 'circle' && sh.c && sh.r != null) {
    if (sh.r < 0.05 || sh.point) return segs
    const o: Pt[] = []
    for (let i = 0; i < CIRCLE_SEG; i++) { const a = (i / CIRCLE_SEG) * Math.PI * 2; o.push([sh.c[0] + sh.r * Math.cos(a), sh.c[1] + sh.r * Math.sin(a)]) }
    chain(o, true)
  } else if (sh.pts && sh.pts.length >= 2) {
    chain(sh.pts.map((p) => [p[0], p[1]] as Pt), !sh.open)
  }
  return segs
}

// 线段 [p,q] 同 [r,s] 求交：返回交点参数 t∈段1 + u∈段2（含端点接触）。平行/不交 → null。
function segInt(p: Pt, q: Pt, r: Pt, s: Pt): { t: number; u: number } | null {
  const d1x = q[0] - p[0], d1y = q[1] - p[1], d2x = s[0] - r[0], d2y = s[1] - r[1]
  const den = d1x * d2y - d1y * d2x
  if (Math.abs(den) < 1e-12) return null              // 平行/共线（共线重叠交由端点量化处理）
  const t = ((r[0] - p[0]) * d2y - (r[1] - p[1]) * d2x) / den
  const u = ((r[0] - p[0]) * d1y - (r[1] - p[1]) * d1x) / den
  const E = 1e-9
  if (t < -E || t > 1 + E || u < -E || u > 1 + E) return null
  return { t: Math.max(0, Math.min(1, t)), u: Math.max(0, Math.min(1, u)) }
}

const key = (p: Pt) => `${Math.round(p[0] * QUANT)},${Math.round(p[1] * QUANT)}`

// Fusion Profile：最小封闭面 + 直接内含嘅「岛」变孔（嵌套圆喺矩形内 → 矩形 profile 系环、圆自己系碟）
export interface PFace { outer: Pt[]; holes: Pt[][] }

export interface RegionResult {
  faces: Pt[][]          // 所有封闭最小面（CCW），含内部细分子面（扁平 — 填充 even-odd 用）
  pfaces: PFace[]        // Fusion 式 profile 面（含孔减除）—— 区域点选/拉伸用
  unionLoops: Pt[][]     // 填充区并集外边界环（内部共享边已消去）—— 拉伸/填充用
  split: boolean         // 系咪真有相交切断（用嚟决定拉伸走精确路定区域路）
  overflow?: boolean     // 简化到尽都仍超预算 → 检测放弃（畀 caller 诚实提示，唔好静默）
}

const EMPTY: RegionResult = { faces: [], pfaces: [], unionLoops: [], split: false }

/** 由一组草图图形检测封闭区域（平面排布）。 */
export function detectRegions(shapes: RShape[]): RegionResult {
  // 1) 收集线段 — 密折线（手绘/样条）超预算时 DP 简化，逐级放宽容差；简化到尽都爆先至放弃（诚实上报）
  const collect = (eps: number): [Pt, Pt][] => {
    const out: [Pt, Pt][] = []
    for (const sh of shapes) {
      if (sh.construction) continue
      const s2 = eps > 0 && sh.pts && sh.pts.length > 48 ? { ...sh, pts: simplifyDP(sh.pts.map((p) => [p[0], p[1]] as Pt), eps) } : sh
      for (const sg of shapeSegs(s2)) out.push(sg)
    }
    return out
  }
  let raw = collect(0)
  if (raw.length > SEG_BUDGET) for (const eps of [0.08, 0.3, 1.0]) { raw = collect(eps); if (raw.length <= SEG_BUDGET) break }
  if (raw.length < 3) return EMPTY
  if (raw.length > SEG_BUDGET) return { ...EMPTY, overflow: true }   // 性能守卫：简化后仍太多 → 放弃（caller 提示，填充走旧路、拉伸走精确路）

  // 2) 每条线段收集切断参数（同其余所有线段嘅交点），再切成子段
  const N = raw.length
  const cuts: number[][] = raw.map(() => [0, 1])
  let anyCut = false
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const hit = segInt(raw[i][0], raw[i][1], raw[j][0], raw[j][1])
      if (!hit) continue
      cuts[i].push(hit.t); cuts[j].push(hit.u)
      // 真切断（唔系净喺两段共有端点）才标记
      if ((hit.t > 1e-6 && hit.t < 1 - 1e-6) || (hit.u > 1e-6 && hit.u < 1 - 1e-6)) anyCut = true
    }
  }
  // 3) 量化顶点 + 砌无向图
  const vid = new Map<string, number>()
  const verts: Pt[] = []
  const vof = (p: Pt): number => { const k = key(p); let id = vid.get(k); if (id == null) { id = verts.length; vid.set(k, id); verts.push([p[0], p[1]]) } return id }
  const adj: Set<number>[] = []
  const ensure = (id: number) => { while (adj.length <= id) adj.push(new Set()) }
  const addEdge = (a: number, b: number) => { if (a === b) return; ensure(a); ensure(b); adj[a].add(b); adj[b].add(a) }
  for (let i = 0; i < N; i++) {
    const [p, q] = raw[i]
    const ts = Array.from(new Set(cuts[i].map((t) => Math.max(0, Math.min(1, t))))).sort((x, y) => x - y)
    for (let k = 0; k + 1 < ts.length; k++) {
      const t0 = ts[k], t1 = ts[k + 1]
      if (t1 - t0 < 1e-7) continue
      const A: Pt = [p[0] + (q[0] - p[0]) * t0, p[1] + (q[1] - p[1]) * t0]
      const B: Pt = [p[0] + (q[0] - p[0]) * t1, p[1] + (q[1] - p[1]) * t1]
      addEdge(vof(A), vof(B))
    }
  }
  // 4) 反复剪走悬边（degree ≤ 1 —— 唔围成环嘅须，例如线伸出圈外嗰截）
  let changed = true
  while (changed) {
    changed = false
    for (let v = 0; v < adj.length; v++) {
      if (adj[v].size === 1) { const w = [...adj[v]][0]; adj[v].clear(); adj[w].delete(v); changed = true }
    }
  }
  // 5) 半边遍历抽面
  const ang = (a: number, b: number) => Math.atan2(verts[b][1] - verts[a][1], verts[b][0] - verts[a][0])
  const sorted: number[][] = adj.map((set, v) => [...set].sort((x, y) => ang(v, x) - ang(v, y)))
  // next(u→v)：喺 v 揾返边 (v→u)，取顺时针下一条（升序排列嘅前一个，wrap）
  const nextOf = (u: number, v: number): [number, number] => {
    const arr = sorted[v]; if (!arr.length) return [v, u]
    const a0 = ang(v, u)
    let idx = 0, bestd = Infinity
    for (let i = 0; i < arr.length; i++) { let d = ang(v, arr[i]) - a0; while (d <= -1e-9) d += 2 * Math.PI; while (d > 2 * Math.PI - 1e-9) d -= 2 * Math.PI; if (Math.abs(d) < bestd) { bestd = Math.abs(d); idx = i } }
    const w = arr[(idx - 1 + arr.length) % arr.length]
    return [v, w]
  }
  const visited = new Set<string>()
  const hk = (a: number, b: number) => a + '_' + b
  const faces: Pt[][] = []
  const edgeFaceSign: Map<string, number> = new Map()   // 半边 → 所属面有向面积符号（并集轮廓用）
  for (let v = 0; v < adj.length; v++) {
    for (const w of adj[v]) {
      if (visited.has(hk(v, w))) continue
      const loop: number[] = []
      let cu = v, cv = w, guard = 0
      while (!visited.has(hk(cu, cv)) && guard++ < 100000) {
        visited.add(hk(cu, cv)); loop.push(cu)
        const [nu, nv] = nextOf(cu, cv)
        cu = nu; cv = nv
        if (cu === v && cv === w) break
      }
      if (loop.length < 3) continue
      const poly = loop.map((id) => verts[id])
      let area = 0; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) area += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1])
      area = -area / 2   // CCW 为正
      const sign = area > 0 ? 1 : -1
      for (let i = 0; i < loop.length; i++) edgeFaceSign.set(hk(loop[i], loop[(i + 1) % loop.length]), sign)
      if (area > 0.02) faces.push(poly)   // CCW 内面 = 封闭区域（外边界 traced CW → area<0 丢弃）
    }
  }
  // 6) 并集外边界：一条无向边只属一个内面（另一边系外/无界）→ 在并集轮廓上
  const unionLoops = buildUnionLoops(verts, adj, edgeFaceSign, hk)
  return { faces, pfaces: toPFaces(faces), unionLoops, split: anyCut }
}

// Fusion Profile 化：最小面 + 「完全内含、唔共享顶点」嘅面变孔（嵌套圆→矩形环+圆碟两个 profile）。
// 相交排布嘅面互相共享顶点 → 唔会误判做孔；孔只出现喺不连通嵌套（真 Fusion 语义）。
function toPFaces(faces: Pt[][]): PFace[] {
  const absArea = (p: Pt[]) => { let a = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]); return Math.abs(a / 2) }
  const cenOf = (p: Pt[]): Pt => { let x = 0, y = 0; for (const q of p) { x += q[0]; y += q[1] } return [x / p.length, y / p.length] }
  const info = faces.map((f) => ({ area: absArea(f), cen: cenOf(f), keys: new Set(f.map(key)) }))
  const parent = faces.map((f, i) => {
    let best = -1, bestArea = Infinity
    for (let j = 0; j < faces.length; j++) {
      if (j === i || info[j].area <= info[i].area) continue
      let shared = false
      for (const k of info[i].keys) if (info[j].keys.has(k)) { shared = true; break }
      if (shared) continue
      if (!(pointInPoly(info[i].cen, faces[j]) || pointInPoly(f[0], faces[j]))) continue
      if (info[j].area < bestArea) { bestArea = info[j].area; best = j }
    }
    return best
  })
  return faces.map((f, i) => ({ outer: f, holes: faces.filter((_, j) => parent[j] === i) }))
}

// 【精确 profile 代数】（!split 独立/嵌套闭合图形先用）：拣咗边几个 profile → 应该发射边几个【原始图形】
// 去 even-odd 拉伸路（圆保持真圆、唔变多边形）。原理：一个 loop 系咪要发射 = 佢内侧 profile 同外侧 profile
// 嘅拣择唔同（even-odd 喺 loop 度翻转材料）。例：矩形⊃圆 — 拣环=发射[矩形,圆]（donut）、拣碟=[圆]、两个都拣=[矩形]。
// 返回要发射嘅图形下标；配对唔上（数量/面积/质心对唔上）→ null（caller 回落多边形路）。
export function exactProfileAlgebra(outlines: Pt[][], pfaces: PFace[], sel: boolean[]): number[] | null {
  if (outlines.length !== pfaces.length || sel.length !== pfaces.length) return null
  const absArea = (p: Pt[]) => { let a = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]); return Math.abs(a / 2) }
  const cenOf = (p: Pt[]): Pt => { let x = 0, y = 0; for (const q of p) { x += q[0]; y += q[1] } return [x / p.length, y / p.length] }
  // loop k ↔ pface：面积比 <3% + 质心最近 一一配对
  const used = new Set<number>()
  const faceOf: number[] = []
  for (const o of outlines) {
    const ao = absArea(o), co = cenOf(o)
    let best = -1, bd = Infinity
    pfaces.forEach((f, i) => {
      if (used.has(i)) return
      const af = absArea(f.outer)
      if (Math.abs(af - ao) / Math.max(ao, 1e-6) > 0.03) return
      const d = Math.hypot(cenOf(f.outer)[0] - co[0], cenOf(f.outer)[1] - co[1])
      if (d < bd) { bd = d; best = i }
    })
    if (best < 0) return null
    used.add(best); faceOf.push(best)
  }
  // loop k 嘅直接父 loop = 面积最细且包住佢质心嘅更大 loop（严格嵌套 — !split 保证冇部分重叠）
  const parentOf = outlines.map((o, k) => {
    const ck = cenOf(o), ak = absArea(o)
    let best = -1, bestArea = Infinity
    outlines.forEach((p, j) => {
      if (j === k) return
      const aj = absArea(p)
      if (aj <= ak || !pointInPoly(ck, p)) return
      if (aj < bestArea) { bestArea = aj; best = j }
    })
    return best
  })
  const selOf = (k: number): boolean => (k < 0 ? false : sel[faceOf[k]])
  const emit: number[] = []
  for (let k = 0; k < outlines.length; k++) if (selOf(k) !== selOf(parentOf[k])) emit.push(k)
  return emit.length ? emit : null
}

// 由「单侧属内面」嘅边砌并集外边界环（消去内部共享边）。
function buildUnionLoops(verts: Pt[], adj: Set<number>[], edgeFaceSign: Map<string, number>, hk: (a: number, b: number) => string): Pt[][] {
  // 边界半边 = 该方向半边属某内面(sign>0)、但反方向半边唔属内面（属外界 sign<0 或无）
  const boundary = new Map<number, number[]>()   // u → [v...]（边界有向边）
  for (let u = 0; u < adj.length; u++) {
    for (const v of adj[u]) {
      const f = edgeFaceSign.get(hk(u, v)), b = edgeFaceSign.get(hk(v, u))
      if (f === 1 && b !== 1) { if (!boundary.has(u)) boundary.set(u, []); boundary.get(u)!.push(v) }
    }
  }
  const loops: Pt[][] = []
  const used = new Set<string>()
  for (const [u0, vs] of boundary) {
    for (const v0 of vs) {
      if (used.has(u0 + '_' + v0)) continue
      const loop: number[] = []; let cu = u0, cv = v0, guard = 0
      while (guard++ < 100000) {
        used.add(cu + '_' + cv); loop.push(cu)
        const outs = boundary.get(cv)
        if (!outs || !outs.length) break
        // 喺 cv 揀「最靠左转」延续外边界（保持单一外环）
        let best = outs[0], bestd = Infinity
        const a0 = Math.atan2(verts[cu][1] - verts[cv][1], verts[cu][0] - verts[cv][0])
        for (const w of outs) { if (used.has(cv + '_' + w) && !(cv === u0 && w === v0)) continue; let d = Math.atan2(verts[w][1] - verts[cv][1], verts[w][0] - verts[cv][0]) - a0; while (d <= 1e-9) d += 2 * Math.PI; while (d > 2 * Math.PI) d -= 2 * Math.PI; if (d < bestd) { bestd = d; best = w } }
        cu = cv; cv = best
        if (cu === u0 && cv === v0) break
        if (loop.length > 50000) break
      }
      if (loop.length >= 3) loops.push(loop.map((id) => verts[id]))
    }
  }
  return loops
}
