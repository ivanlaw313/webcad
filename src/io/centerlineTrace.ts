// M9b — 中线追踪（手绘单线稿 → 可编辑折线/圆弧路径）。Self-written, 零依赖, 无 DOM。
//
// 管线：
//   1. 二值化（同 imageTrace 一样：Otsu + 极性自判 + 去麻点）
//   2. Zhang-Suen 细化 → 1 像素骨架（8 连通、保拓扑）
//   3. 骨架图：交叉数 A(P)=1 → 端点、≥3 → 交点；8 相邻嘅交点像素并成一个节点（cross 细化后常散成 2~4 粒）
//   4. 剪毛刺：长度 < spur（缺省 1.5×笔宽）嘅悬枝删走；删完变 degree-2 嘅节点把两条边接返一条
//   5. 交点修复：用各入边【末端切线】嘅最小二乘交点还原真 T/X 位置（细化会把交叉「抹圆」，
//      直接用骨架像素质心会偏一个笔宽）；偏移超过 2.5 笔宽就诚实退回质心
//   6. 逐边 直线/圆弧 拟合（复用 imageTrace 嘅 segmentChain）
//
// ★ 诚实边界（写喺 result.limits，UI 应该照抄畀用户睇）★
//   · 只做【单线稿】：线宽大致一致嘅笔画图。实心色块请用 imageTrace（轮廓向量化）。
//   · 相交/相贴嘅笔画会并成一个节点 —— 两笔「叠住」同「真交叉」喺位图入面本质上分唔到。
//   · 交点位置精度 ≈ ±0.5~1 个笔宽（细化本身嘅固有误差，已用切线交点修复，但唔系无损）。
//   · 唔做文字/尺寸线/箭头/剖面线识别，唔做图层分离 → 【工程图纸唔喺范围内】（连字连尺唔承诺）。
//   · 输出系【开放路径】为主：可做扫掠路径 / 加厚 / 偏移封闭，唔可以直接当拉伸轮廓（只有闭合环先可以）。
//   · 虚线/点线会断成多条独立笔画（唔做 dash 合并推断）。
import {
  binarize, segmentChain, openPathPts, signedArea,
  type Pt, type GrayImage, type SegmentOptions, type TraceSeg, type TraceConstraint, type TraceSketchShape,
} from './imageTrace.ts'
import type { ImpProfile } from './dxfImport.ts'
import { pathPts } from '../sketch/sketchOps.ts'

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
// p2..p9 = N, NE, E, SE, S, SW, W, NW（顺时针）—— Zhang-Suen 原文次序
const RING: [number, number][] = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]]
// 走链时优先 4 邻域（避免喺阶梯位抄对角捷径），再对角
const WALK: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]]

// ─────────────────────────────────────────────────────────── 1. Zhang-Suen 细化

/** Zhang-Suen 并行细化 → 1 像素骨架（1 = 骨架）。越界当背景 = 等价于 pad 一圈，触边笔画一样细化得到。 */
export function zhangSuenThin(mask: Uint8Array, w: number, h: number): Uint8Array {
  const m = Uint8Array.from(mask)
  const g = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : m[y * w + x])
  const del: number[] = []
  for (let iter = 0; iter < 512; iter++) {
    let changed = false
    for (let step = 0; step < 2; step++) {
      del.length = 0
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (!m[y * w + x]) continue
        const p: number[] = RING.map(([dx, dy]) => g(x + dx, y + dy))
        const B = p.reduce((s, v) => s + v, 0)
        if (B < 2 || B > 6) continue
        let A = 0
        for (let k = 0; k < 8; k++) if (p[k] === 0 && p[(k + 1) % 8] === 1) A++
        if (A !== 1) continue
        const [P2, , P4, , P6, , P8] = p   // N, E, S, W
        if (step === 0) { if (P2 * P4 * P6 !== 0 || P4 * P6 * P8 !== 0) continue }
        else { if (P2 * P4 * P8 !== 0 || P2 * P6 * P8 !== 0) continue }
        del.push(y * w + x)
      }
      if (del.length) { for (const i of del) m[i] = 0; changed = true }
    }
    if (!changed) break
  }
  return m
}

// ───────────────────────────────────────────────────────────── 2. 骨架图

export type SkelNode = { p: Pt; pix: number[]; kind: 'end' | 'junction'; alive: boolean }
export type SkelEdge = { a: number; b: number; pts: Pt[]; closed: boolean; alive: boolean }
export type SkeletonGraph = { nodes: SkelNode[]; edges: SkelEdge[] }

const degreeOf = (g: SkeletonGraph, id: number): number => {
  let d = 0
  for (const e of g.edges) { if (!e.alive) continue; if (e.a === id) d++; if (e.b === id) d++ }
  return d
}

/** 骨架像素 → 节点（端点 / 交点簇）+ 边（degree-2 像素链）。孤立环（无端点无交点）单独成闭合边。 */
export function skeletonGraph(skel: Uint8Array, w: number, h: number): SkeletonGraph {
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : skel[y * w + x])
  const isNode = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!skel[y * w + x]) continue
    const p = RING.map(([dx, dy]) => at(x + dx, y + dy))
    const B = p.reduce((s, v) => s + v, 0)
    let A = 0
    for (let k = 0; k < 8; k++) if (p[k] === 0 && p[(k + 1) % 8] === 1) A++
    if (B === 0) isNode[y * w + x] = 2          // 孤点 → 直接丢
    else if (B === 1 || A <= 1) isNode[y * w + x] = 1
    else if (A >= 3) isNode[y * w + x] = 1
  }
  // 交点簇（8 连通）→ 一个节点
  const nodeId = new Int32Array(w * h).fill(-1)
  const nodes: SkelNode[] = []
  for (let s = 0; s < skel.length; s++) {
    if (isNode[s] !== 1 || nodeId[s] >= 0) continue
    const stack = [s]
    const pix: number[] = []
    nodeId[s] = nodes.length
    while (stack.length) {
      const q = stack.pop() as number
      pix.push(q)
      const x = q % w, y = (q / w) | 0
      for (const [dx, dy] of RING) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const r = ny * w + nx
        if (isNode[r] !== 1 || nodeId[r] >= 0) continue
        nodeId[r] = nodes.length; stack.push(r)
      }
    }
    let sx = 0, sy = 0
    for (const q of pix) { sx += q % w; sy += (q / w) | 0 }
    const single = pix.length === 1
    nodes.push({ p: [sx / pix.length, sy / pix.length], pix, kind: single && countNb(skel, w, h, pix[0]) === 1 ? 'end' : 'junction', alive: true })
  }
  const edges: SkelEdge[] = []
  const used = new Uint8Array(w * h)     // 路径像素只可属于一条边
  const px = (i: number): Pt => [i % w, (i / w) | 0]
  for (let nid = 0; nid < nodes.length; nid++) {
    for (const start of nodes[nid].pix) {
      const sx = start % w, sy = (start / w) | 0
      for (const [dx, dy] of WALK) {
        const nx = sx + dx, ny = sy + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const first = ny * w + nx
        if (!skel[first]) continue
        if (nodeId[first] >= 0) {
          if (nodeId[first] === nid) continue
          if (edges.some((e) => e.alive && ((e.a === nid && e.b === nodeId[first]) || (e.a === nodeId[first] && e.b === nid)) && e.pts.length === 2)) continue
          edges.push({ a: nid, b: nodeId[first], pts: [nodes[nid].p, nodes[nodeId[first]].p], closed: false, alive: true })
          continue
        }
        if (used[first]) continue
        // 沿 degree-2 链走到下一个节点
        const pts: Pt[] = [nodes[nid].p, px(first)]
        used[first] = 1
        let cur = first, prev = start, end = nid
        for (let guard = 0; guard < skel.length; guard++) {
          const cx = cur % w, cy = (cur / w) | 0
          let nxt = -1
          for (const [ex, ey] of WALK) {
            const qx = cx + ex, qy = cy + ey
            if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue
            const q = qy * w + qx
            if (!skel[q] || q === prev || q === cur) continue
            if (nodeId[q] >= 0) { nxt = q; break }
            if (!used[q]) { nxt = q; break }
          }
          if (nxt < 0) { end = -1; break }
          if (nodeId[nxt] >= 0) { end = nodeId[nxt]; pts.push(nodes[nodeId[nxt]].p); break }
          used[nxt] = 1; pts.push(px(nxt)); prev = cur; cur = nxt
        }
        if (end < 0) { edges.push({ a: nid, b: -1, pts, closed: false, alive: true }) }   // 断头（唔应该发生，保守收货）
        else edges.push({ a: nid, b: end, pts, closed: false, alive: true })
      }
    }
  }
  // 无端点无交点嘅孤立闭环（例：一个圆）
  for (let s = 0; s < skel.length; s++) {
    if (!skel[s] || used[s] || nodeId[s] >= 0) continue
    const pts: Pt[] = [px(s)]
    used[s] = 1
    let cur = s, prev = -1
    for (let guard = 0; guard < skel.length; guard++) {
      const cx = cur % w, cy = (cur / w) | 0
      let nxt = -1
      for (const [ex, ey] of WALK) {
        const qx = cx + ex, qy = cy + ey
        if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue
        const q = qy * w + qx
        if (!skel[q] || q === prev || used[q]) continue
        nxt = q; break
      }
      if (nxt < 0) break
      used[nxt] = 1; pts.push(px(nxt)); prev = cur; cur = nxt
    }
    if (pts.length >= 6) edges.push({ a: -1, b: -1, pts, closed: true, alive: true })
  }
  return { nodes, edges }
}

function countNb(skel: Uint8Array, w: number, h: number, i: number): number {
  const x = i % w, y = (i / w) | 0
  let n = 0
  for (const [dx, dy] of RING) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < w && ny < h && skel[ny * w + nx]) n++ }
  return n
}

export function polyLength(pts: Pt[], closed = false): number {
  let s = 0
  for (let i = 0; i + 1 < pts.length; i++) s += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
  if (closed && pts.length > 1) s += Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1])
  return s
}

// ─────────────────────────────────────────────────── 3. 剪毛刺 + degree-2 接合

/** 剪走短悬枝（细化喺线头/角位嘅固有伪影），再把因此变 degree-2 嘅节点两边接返一条。 */
export function pruneSpurs(g: SkeletonGraph, spur: number): number {
  let removed = 0
  for (let pass = 0; pass < 16; pass++) {
    let changed = false
    for (const e of g.edges) {
      if (!e.alive || e.closed) continue
      const da = e.a >= 0 ? degreeOf(g, e.a) : 0
      const db = e.b >= 0 ? degreeOf(g, e.b) : 0
      const dangling = (e.a < 0 || da === 1) || (e.b < 0 || db === 1)
      const bothFree = (e.a < 0 || da === 1) && (e.b < 0 || db === 1)
      if (!dangling || bothFree) continue        // 两头都自由 = 独立笔画，唔剪
      if (polyLength(e.pts) >= spur) continue
      e.alive = false; removed++; changed = true
    }
    // degree-2 节点 → 合并两边
    for (let nid = 0; nid < g.nodes.length; nid++) {
      if (!g.nodes[nid].alive) continue
      const inc = g.edges.filter((e) => e.alive && (e.a === nid || e.b === nid))
      if (inc.length === 1 && inc[0].a === nid && inc[0].b === nid && !inc[0].closed) { inc[0].closed = true; inc[0].a = -1; inc[0].b = -1; g.nodes[nid].alive = false; changed = true; continue }
      if (inc.length !== 2) continue
      const [e1, e2] = inc
      const p1 = e1.a === nid ? e1.pts.slice().reverse() : e1.pts.slice()   // 令 e1 以 nid 结尾
      const p2 = e2.a === nid ? e2.pts.slice() : e2.pts.slice().reverse()   // 令 e2 由 nid 起
      const merged = [...p1, ...p2.slice(1)]
      const a = e1.a === nid ? e1.b : e1.a
      const b = e2.a === nid ? e2.b : e2.a
      e1.alive = false; e2.alive = false
      g.nodes[nid].alive = false
      g.edges.push({ a, b, pts: merged, closed: a >= 0 && a === b, alive: true })
      changed = true
    }
    for (let nid = 0; nid < g.nodes.length; nid++) {
      if (g.nodes[nid].alive && !g.edges.some((e) => e.alive && (e.a === nid || e.b === nid))) g.nodes[nid].alive = false
    }
    if (!changed) break
  }
  return removed
}

/**
 * 交点修复：细化会把 T/X 交叉「抹圆」，骨架像素质心通常偏离真交点约半个笔宽。
 * 用每条入边末端（约 2 个笔宽长）嘅最小二乘直线，解【到各直线距离平方和最小】嘅点做真交点。
 * 解唔出（近平行）或者偏移 > 2.5 笔宽 → 诚实退回质心。返回被移动嘅节点数。
 */
export function repairJunctions(g: SkeletonGraph, strokeWidth: number): number {
  let moved = 0
  const span = Math.max(4, strokeWidth * 2)
  for (let nid = 0; nid < g.nodes.length; nid++) {
    const nd = g.nodes[nid]
    if (!nd.alive) continue
    const inc = g.edges.filter((e) => e.alive && (e.a === nid || e.b === nid))
    if (inc.length < 3) continue
    let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0
    let used = 0
    for (const e of inc) {
      const pts = e.a === nid ? e.pts : e.pts.slice().reverse()   // 由节点向外
      const arm: Pt[] = [pts[0]]
      for (let i = 1; i < pts.length; i++) { arm.push(pts[i]); if (polyLength(arm) >= span) break }
      if (arm.length < 3) continue
      let mx = 0, my = 0
      for (const q of arm) { mx += q[0]; my += q[1] }
      mx /= arm.length; my /= arm.length
      let sxx = 0, sxy = 0, syy = 0
      for (const q of arm) { const dx = q[0] - mx, dy = q[1] - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy }
      const th = 0.5 * Math.atan2(2 * sxy, sxx - syy)
      const nx = -Math.sin(th), ny = Math.cos(th)      // 法向
      const c = nx * mx + ny * my
      a11 += nx * nx; a12 += nx * ny; a22 += ny * ny; b1 += nx * c; b2 += ny * c
      used++
    }
    if (used < 2) continue
    const det = a11 * a22 - a12 * a12
    if (Math.abs(det) < 1e-6) continue
    const x = (b1 * a22 - b2 * a12) / det, y = (a11 * b2 - a12 * b1) / det
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    if (Math.hypot(x - nd.p[0], y - nd.p[1]) > 2.5 * Math.max(1, strokeWidth)) continue
    nd.p = [x, y]
    moved++
  }
  // 入边端点同步到（可能已修复嘅）节点位置
  for (const e of g.edges) {
    if (!e.alive || e.closed) continue
    if (e.a >= 0 && g.nodes[e.a].alive) e.pts[0] = [g.nodes[e.a].p[0], g.nodes[e.a].p[1]]
    if (e.b >= 0 && g.nodes[e.b].alive) e.pts[e.pts.length - 1] = [g.nodes[e.b].p[0], g.nodes[e.b].p[1]]
  }
  return moved
}

/** 滑动平均（首尾固定）：磨走细化阶梯抖动，唔改端点/交点。 */
export function smoothChain(pts: Pt[], passes: number, closed: boolean): Pt[] {
  let cur = pts.map((p) => [p[0], p[1]] as Pt)
  for (let k = 0; k < passes; k++) {
    const n = cur.length
    if (n < 3) break
    const out: Pt[] = cur.map((p) => [p[0], p[1]] as Pt)
    for (let i = 0; i < n; i++) {
      if (!closed && (i === 0 || i === n - 1)) continue
      const a = cur[(i - 1 + n) % n], b = cur[i], c = cur[(i + 1) % n]
      out[i] = [(a[0] + 2 * b[0] + c[0]) / 4, (a[1] + 2 * b[1] + c[1]) / 4]
    }
    cur = out
  }
  return cur
}

// ───────────────────────────────────────────────────────────── 4. 主入口

export type CenterlineOptions = SegmentOptions & {
  threshold?: number
  foreground?: 'auto' | 'dark' | 'light'
  blur?: number
  minArea?: number
  spur?: number            // 毛刺长度门限（像素），缺省 max(3, 1.5×笔宽)
  smooth?: number          // 骨架滑动平均次数，缺省 1
  minLength?: number       // 丢弃总长细过此值嘅笔画（像素），缺省 max(4, 2×笔宽)
  scale?: number           // mm / 像素
  flipY?: boolean          // 缺省 true
  origin?: 'center' | 'topLeft'
}

export type CenterlineStroke = {
  segs: TraceSeg[]
  verts: Pt[]
  bulges: number[]
  pts: Pt[]
  closed: boolean
  a: number                // 起点节点 id（-1 = 自由端 / 闭环）
  b: number
  length: number
  constraints: TraceConstraint[]
  maxDev: number
}

export type CenterlineResult = {
  strokes: CenterlineStroke[]
  nodes: { p: Pt; degree: number; kind: 'end' | 'junction' }[]
  shapes: TraceSketchShape[]     // 开放路径 open:true；闭环 open 唔设
  profiles: ImpProfile[]         // 只有【闭合】中线先会出 profile（开放路径唔可以拉伸）
  strokeWidth: number            // 估算笔宽（像素 × scale）
  threshold: number
  note: string
  warnings: string[]
  limits: string[]
}

const LIMITS = [
  '只适用【单线稿】（线宽大致一致嘅笔画）；实心色块请用轮廓向量化（imageTrace）',
  '相交/相贴嘅笔画会并成一个节点 —— 位图入面「叠住」同「真交叉」本质分唔到',
  '交点位置精度约 ±0.5~1 个笔宽（细化固有误差，已用切线交点修复但唔系无损）',
  '唔做文字 / 尺寸线 / 箭头 / 剖面线识别，唔做图层分离 → 工程图纸唔喺范围内',
  '输出以【开放路径】为主：可做扫掠路径 / 加厚 / 偏移封闭；只有闭合环先可以直接拉伸',
  '虚线 / 点线会断成多条独立笔画（唔做 dash 合并推断）',
]

const EMPTY = (note: string): CenterlineResult => ({ strokes: [], nodes: [], shapes: [], profiles: [], strokeWidth: 0, threshold: 0, note, warnings: [], limits: LIMITS })

/** 位图（灰度，手绘单线稿）→ 中线路径。所有 tol 单位 = 像素；输出坐标 = 像素 × scale。 */
export function traceCenterlines(img: GrayImage, opt: CenterlineOptions = {}): CenterlineResult {
  const w = Math.floor(img.width), h = Math.floor(img.height)
  if (!(w >= 3 && h >= 3)) return EMPTY('图太细（至少 3×3 像素）')
  if (!img.data || img.data.length < w * h) return EMPTY('灰度数据长度唔够 width×height')

  const bin = binarize(img, { threshold: opt.threshold, foreground: opt.foreground, blur: opt.blur, minArea: opt.minArea })
  let ink = 0
  for (let i = 0; i < bin.mask.length; i++) ink += bin.mask[i]
  if (ink === 0 || ink === w * h) return { ...EMPTY('阈值化后冇笔画（整张全背景或全前景）'), threshold: bin.threshold }

  const skel = zhangSuenThin(bin.mask, w, h)
  const g = skeletonGraph(skel, w, h)
  let skelLen = 0
  for (const e of g.edges) if (e.alive) skelLen += polyLength(e.pts, e.closed)
  const strokeWidth = clamp(ink / Math.max(1, skelLen), 0.5, Math.max(w, h))
  const warnings: string[] = []
  if (bin.removed > 0) warnings.push(`去麻点 ${bin.removed} 像素`)

  const cut = pruneSpurs(g, opt.spur ?? Math.max(3, 1.5 * strokeWidth))
  if (cut) warnings.push(`剪走 ${cut} 条毛刺（细化伪影）`)
  const fixed = repairJunctions(g, strokeWidth)

  const scale = opt.scale ?? 1
  const flipY = opt.flipY !== false
  const ox = opt.origin === 'topLeft' ? 0 : (w - 1) / 2
  const oy = opt.origin === 'topLeft' ? 0 : (h - 1) / 2
  const out = (p: Pt): Pt => [(p[0] - ox) * scale, ((flipY ? h - 1 - p[1] : p[1]) - oy) * scale]

  const minLen = opt.minLength ?? Math.max(4, 2 * strokeWidth)
  const smoothN = Math.max(0, Math.floor(opt.smooth ?? 1))
  const fitTol = opt.fitTol ?? Math.max(1, 0.5 * strokeWidth)   // 中线精度本身受笔宽限制 → 容差跟笔宽走
  const strokes: CenterlineStroke[] = []
  const shapes: TraceSketchShape[] = []
  const profiles: ImpProfile[] = []
  for (const e of g.edges) {
    if (!e.alive) continue
    if (e.pts.length < 2) continue
    if (polyLength(e.pts, e.closed) < minLen) continue
    const chain = smoothChain(e.pts, smoothN, e.closed)
    const seg = segmentChain(chain, e.closed, { ...opt, fitTol })
    if (!seg.segs.length) continue
    const verts = seg.verts.map(out)
    const segs: TraceSeg[] = seg.segs.map((s) => s.kind === 'line'
      ? { kind: 'line', a: out(s.a), b: out(s.b) }
      : { kind: 'arc', a: out(s.a), b: out(s.b), c: out(s.c), r: s.r * scale, ccw: s.ccw, bulge: s.bulge, sweep: s.sweep })
    const pts = e.closed
      ? (verts.length >= 2 ? pathPts(verts as [number, number][], seg.bulges, 0.12) as Pt[] : verts)
      : openPathPts(verts, seg.bulges, 0.12)
    strokes.push({ segs, verts, bulges: seg.bulges.slice(), pts, closed: e.closed, a: e.a, b: e.b, length: polyLength(pts, e.closed), constraints: seg.constraints, maxDev: seg.maxDev })
    if (e.closed) {
      shapes.push({ type: 'poly', pts, verts, bulges: seg.bulges.slice() })
      if (pts.length >= 3 && Math.abs(signedArea(pts)) > 1e-6) profiles.push({ kind: 'poly', pts })
    } else {
      shapes.push({ type: 'poly', pts, verts, bulges: seg.bulges.slice(), open: true })
    }
  }
  const nodes = g.nodes.map((n, i) => ({ p: out(n.p), degree: n.alive ? degreeOf(g, i) : 0, kind: n.kind })).filter((n) => n.degree > 0)
  const nLine = strokes.reduce((s, st) => s + st.segs.filter((x) => x.kind === 'line').length, 0)
  const nArc = strokes.reduce((s, st) => s + st.segs.filter((x) => x.kind === 'arc').length, 0)
  if (fixed) warnings.push(`修复 ${fixed} 个交点位置（切线交点法）`)
  if (!strokes.length) warnings.push('细化后冇够长嘅笔画 —— 线可能太幼（<2px）或者图系实心色块（应改用轮廓向量化）')
  const note = `识别 ${strokes.length} 条中线（${nLine} 直线 / ${nArc} 圆弧 · ${nodes.length} 个节点 · 估算笔宽 ${(strokeWidth * scale).toFixed(2)}${scale === 1 ? 'px' : 'mm'}）`
  return { strokes, nodes, shapes, profiles, strokeWidth: strokeWidth * scale, threshold: bin.threshold, note, warnings, limits: LIMITS }
}
