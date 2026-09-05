// M9a — 2D 位图轮廓向量化（logo / 印刷图 / 剪影 → 可编辑 CAD 草图）。Self-written, 零依赖, 无 DOM。
//
// 管线（每级都可单独 import 做单元测试）：
//   1. 灰度（caller 由 canvas ImageData → Uint8Array；rgbaToGray 提供纯函数版）
//   2. 可选 3×3 二项模糊（抗噪；对称核唔会平移边界 50% 位置 → 唔影响尺寸）
//   3. Otsu 阈值 + 极性自判（边框像素多数者 = 背景）
//   4. 去麻点：连通域面积过滤（墨点 8 连通 / 内部细孔 4 连通）
//   5. 亚像素 marching-squares 等值线（沿格边线性插值 → 抗锯齿图天然亚像素；二值图亦取半像素中点，
//      最小二乘一平均，圆半径误差 ≪ 1 像素）。场四周 pad 一圈背景 → 触边图形亦保证闭合环。
//   6. Douglas-Peucker → 候选角点集
//   7. 双尺度转角判据分真角/圆弧：真角 turn(2d) ≈ turn(d)，圆弧 turn(2d) ≈ 2·turn(d)
//   8. 直线/圆弧 递归分裂拟合（TLS 直线 + Kåsa→Landau 几何圆）+ 断点合并（含闭环接缝）
//   9. 约束推断：近轴直线 snap 水平/竖直、相邻段相切、等半径
//  10. 接点精修：相邻支撑几何求交（线×线 / 线×圆 切点 / 圆×圆）→ 真 CAD 角点与切点
//  11. 输出【两路】：profiles（ImpProfile[]，直落现有 DXF/SVG 拉伸落地路径）
//                  + contours/shapes（verts+bulges 真圆弧，可直落 sketchSources → 内核真 ARC 边）
//
// 诚实边界：本模块做「剪影/实心图形 → 轮廓」。灰度照片、带渐变/阴影嘅图、扫描工程图纸（线框+文字+尺寸线）
// 唔喺范围内 —— 前者阈值化后噪声成片，后者需要中线追踪（见 centerlineTrace.ts）同埋文字/标注分离（未做）。
import { pathPts, tessellateSeg } from '../sketch/sketchOps.ts'
import type { ImpProfile } from './dxfImport.ts'

export type Pt = [number, number]
export type GrayImage = { data: ArrayLike<number>; width: number; height: number }

const TAU = Math.PI * 2
const DEG = Math.PI / 180
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
// 被去麻点翻转嘅像素喺插值场入面用呢个幅值（原灰度已经唔可信，只保留符号）
const SNAP_MAG = 128

// ───────────────────────────────────────────────────────────── 1. 灰度 / 阈值

/** RGBA（canvas ImageData.data）→ 灰度。半透明按【白底合成】（透明 PNG logo 嘅常见情况）。纯函数，无 DOM。 */
export function rgbaToGray(rgba: ArrayLike<number>, width: number, height: number, overWhite = true): Uint8Array {
  const n = Math.max(0, Math.floor(width) * Math.floor(height))
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const o = i * 4
    let v = 0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2]
    const a = rgba[o + 3]
    if (overWhite && typeof a === 'number' && a < 255) { const k = clamp(a, 0, 255) / 255; v = v * k + 255 * (1 - k) }
    out[i] = clamp(Math.round(v), 0, 255)
  }
  return out
}

/** Otsu 类间方差最大化阈值（0..255）。返回值语义：灰度 ≤ t 归暗类，> t 归亮类。 */
export function otsuThreshold(gray: ArrayLike<number>, count?: number): number {
  const n = count ?? gray.length
  if (n <= 0) return 127
  const hist = new Float64Array(256)
  for (let i = 0; i < n; i++) hist[clamp(Math.round(gray[i]), 0, 255)]++
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]
  let wB = 0, sumB = 0, best = -1, thr = 127
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (wB === 0) continue
    const wF = n - wB
    if (wF === 0) break
    sumB += t * hist[t]
    const mB = sumB / wB, mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) * (mB - mF)
    if (between > best) { best = between; thr = t }
  }
  return thr
}

function toFloat(img: GrayImage): Float64Array {
  const n = img.width * img.height
  const out = new Float64Array(n)
  for (let i = 0; i < n; i++) { const v = img.data[i]; out[i] = typeof v === 'number' && Number.isFinite(v) ? v : 0 }
  return out
}

/** 可分离 3×3 二项模糊 [1 2 1]/4，边界钳位。对称核 → 直边 50% 位置零漂移。 */
function blurPass(src: Float64Array, w: number, h: number): Float64Array {
  const tmp = new Float64Array(src.length), out = new Float64Array(src.length)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x
    tmp[i] = (src[y * w + Math.max(0, x - 1)] + 2 * src[i] + src[y * w + Math.min(w - 1, x + 1)]) / 4
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x
    out[i] = (tmp[Math.max(0, y - 1) * w + x] + 2 * tmp[i] + tmp[Math.min(h - 1, y + 1) * w + x]) / 4
  }
  return out
}

export type BinarizeResult = { mask: Uint8Array; gray: Float64Array; threshold: number; iso: number; inkIsDark: boolean; removed: number }

/**
 * 灰度 → 二值墨迹掩码（1 = 图形）。极性 auto 时按边框像素多数者判背景。
 * ★ threshold（Otsu）同 iso（等值线电平）系两样嘢 ★：Otsu 只求「分得开两类」，喺纯 0/255 图上
 * 佢可以停喺任何一个分得开嘅值（例如 5）；若果直接攞佢做亚像素插值电平，半覆盖边缘像素就会被
 * 当成几乎全背景 → 边界系统性内缩接近一个像素。所以插值电平另计：iso = (墨迹均值 + 背景均值)/2
 * = 「50% 覆盖率」嗰个灰度 → 抗锯齿边缘落喺真几何边上（正片/负片亦对称，结果完全一致）。
 */
export function binarize(img: GrayImage, opt: { threshold?: number; foreground?: 'auto' | 'dark' | 'light'; blur?: number; minArea?: number } = {}): BinarizeResult {
  const w = img.width, h = img.height
  let gray = toFloat(img)
  const passes = Math.max(0, Math.min(8, Math.floor(opt.blur ?? 0)))
  for (let k = 0; k < passes; k++) gray = blurPass(gray, w, h)
  const thr = opt.threshold ?? otsuThreshold(gray, w * h)
  let inkIsDark = opt.foreground !== 'light'
  if (!opt.foreground || opt.foreground === 'auto') {
    let dark = 0, tot = 0
    for (let x = 0; x < w; x++) { for (const y of [0, h - 1]) { if (gray[y * w + x] <= thr) dark++; tot++ } }
    for (let y = 1; y + 1 < h; y++) { for (const x of [0, w - 1]) { if (gray[y * w + x] <= thr) dark++; tot++ } }
    inkIsDark = tot === 0 || dark * 2 <= tot   // 边框多数暗 → 背景系暗 → 墨迹系亮
  }
  // 亚像素等值线电平
  let sA = 0, nA = 0, sB = 0, nB = 0
  for (let i = 0; i < gray.length; i++) { if (gray[i] <= thr) { sA += gray[i]; nA++ } else { sB += gray[i]; nB++ } }
  let iso = opt.threshold ?? (nA && nB ? (sA / nA + sB / nB) / 2 : thr)
  if (!Number.isFinite(iso) || iso <= 0 || iso >= 255) iso = thr
  const mask = new Uint8Array(w * h)
  for (let i = 0; i < mask.length; i++) mask[i] = (inkIsDark ? gray[i] <= iso : gray[i] > iso) ? 1 : 0
  const removed = despeckle(mask, w, h, Math.max(0, Math.floor(opt.minArea ?? 9)))
  return { mask, gray, threshold: thr, iso, inkIsDark, removed }
}

/** 去麻点：删细墨块（8 连通）+ 填细内孔（4 连通、唔掂图边）。返回被改写嘅像素数。 */
export function despeckle(mask: Uint8Array, w: number, h: number, minArea: number): number {
  if (minArea <= 1) return 0
  let changed = 0
  const stack = new Int32Array(w * h)
  const seen = new Uint8Array(w * h)
  const run = (target: 0 | 1, diag: boolean, action: (comp: number[], touchesBorder: boolean) => boolean) => {
    seen.fill(0)
    for (let s = 0; s < mask.length; s++) {
      if (seen[s] || mask[s] !== target) continue
      let top = 0
      stack[top++] = s; seen[s] = 1
      const comp: number[] = []
      let border = false
      while (top > 0) {
        const p = stack[--top]
        comp.push(p)
        const x = p % w, y = (p / w) | 0
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if ((dx === 0 && dy === 0) || (!diag && dx !== 0 && dy !== 0)) continue
          const nx = x + dx, ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          const q = ny * w + nx
          if (seen[q] || mask[q] !== target) continue
          seen[q] = 1; stack[top++] = q
        }
      }
      if (action(comp, border)) { for (const p of comp) { mask[p] = target ? 0 : 1; changed++ } }
    }
  }
  run(1, true, (comp) => comp.length < minArea)                       // 细墨块 → 抹走
  run(0, false, (comp, border) => !border && comp.length < minArea)   // 细内孔 → 填实
  return changed
}

// ───────────────────────────────────────────── 2. 亚像素 marching-squares 等值线

/** 等值线追踪：场 f（>0 = 图形内）→ 闭合环点列（场坐标，亚像素）。每条环唔重复首尾点。 */
export function marchingSquares(f: Float64Array, W: number, H: number): Pt[][] {
  const nE = 2 * W * H
  const adjA = new Int32Array(nE).fill(-1), adjB = new Int32Array(nE).fill(-1)
  const link = (e1: number, e2: number) => {
    if (adjA[e1] < 0) adjA[e1] = e2; else if (adjB[e1] < 0) adjB[e1] = e2
    if (adjA[e2] < 0) adjA[e2] = e1; else if (adjB[e2] < 0) adjB[e2] = e1
  }
  for (let y = 0; y + 1 < H; y++) for (let x = 0; x + 1 < W; x++) {
    const i = y * W + x
    const v00 = f[i], v10 = f[i + 1], v11 = f[i + W + 1], v01 = f[i + W]
    const b = (v00 > 0 ? 1 : 0) | (v10 > 0 ? 2 : 0) | (v11 > 0 ? 4 : 0) | (v01 > 0 ? 8 : 0)
    if (b === 0 || b === 15) continue
    const eAB = 2 * i, eBC = 2 * (i + 1) + 1, eCD = 2 * (i + W), eDA = 2 * i + 1
    switch (b) {
      case 1: link(eDA, eAB); break
      case 2: link(eAB, eBC); break
      case 3: link(eDA, eBC); break
      case 4: link(eBC, eCD); break
      case 6: link(eAB, eCD); break
      case 7: link(eDA, eCD); break
      case 8: link(eCD, eDA); break
      case 9: link(eAB, eCD); break
      case 11: link(eBC, eCD); break
      case 12: link(eBC, eDA); break
      case 13: link(eAB, eBC); break
      case 14: link(eDA, eAB); break
      // 鞍点：用四角均值定中心归属，令两个「口袋」各自闭合（保证每个交点度数恒为 2）
      case 5: if ((v00 + v10 + v11 + v01) / 4 > 0) { link(eAB, eBC); link(eCD, eDA) } else { link(eDA, eAB); link(eBC, eCD) } break
      case 10: if ((v00 + v10 + v11 + v01) / 4 > 0) { link(eDA, eAB); link(eBC, eCD) } else { link(eAB, eBC); link(eCD, eDA) } break
    }
  }
  const pos = (e: number): Pt => {
    const k = e >> 1, vert = e & 1
    const x = k % W, y = (k / W) | 0
    const a = f[k], c = vert ? f[k + W] : f[k + 1]
    let t = a / (a - c)
    if (!Number.isFinite(t)) t = 0.5
    t = clamp(t, 0, 1)
    return vert ? [x, y + t] : [x + t, y]
  }
  const seen = new Uint8Array(nE)
  const loops: Pt[][] = []
  for (let e0 = 0; e0 < nE; e0++) {
    if (seen[e0] || adjA[e0] < 0) continue
    const loop: Pt[] = []
    let cur = e0, prev = -1
    for (let guard = 0; guard < nE + 4; guard++) {
      seen[cur] = 1
      loop.push(pos(cur))
      const a = adjA[cur], b2 = adjB[cur]
      const next = a !== prev && a >= 0 ? a : b2
      if (next < 0 || seen[next]) break
      prev = cur; cur = next
    }
    if (loop.length >= 4) loops.push(loop)
  }
  return loops
}

// ───────────────────────────────────────────────────── 3. 多边形工具 / DP 简化

export function signedArea(pts: Pt[]): number {
  let a = 0
  for (let i = 0, n = pts.length; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1] }
  return a / 2
}

export function pointInPoly(pt: Pt, pts: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1]
    if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi)) inside = !inside
  }
  return inside
}

/** Douglas-Peucker：返回保留点【下标】（含首尾）。开链语义；闭环传入首点重复与否都可以。 */
export function douglasPeucker(pts: Pt[], tol: number): number[] {
  const n = pts.length
  if (n <= 2) return pts.map((_, i) => i)
  const keep = new Uint8Array(n)
  keep[0] = 1; keep[n - 1] = 1
  const stack: [number, number][] = [[0, n - 1]]
  while (stack.length) {
    const [i0, i1] = stack.pop() as [number, number]
    if (i1 <= i0 + 1) continue
    const a = pts[i0], b = pts[i1]
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const len = Math.hypot(dx, dy)
    let best = -1, bi = -1
    for (let i = i0 + 1; i < i1; i++) {
      const p = pts[i]
      const d = len < 1e-12 ? Math.hypot(p[0] - a[0], p[1] - a[1]) : Math.abs(dy * (p[0] - a[0]) - dx * (p[1] - a[1])) / len
      if (d > best) { best = d; bi = i }
    }
    if (best > tol && bi > i0) { keep[bi] = 1; stack.push([i0, bi], [bi, i1]) }
  }
  const out: number[] = []
  for (let i = 0; i < n; i++) if (keep[i]) out.push(i)
  return out
}

// ───────────────────────────────────────────────────────── 4. 最小二乘 直线/圆

export type LineFit = { dir: Pt; c: Pt; maxDev: number; sse: number; worst: number }
export type CircleFit = { c: Pt; r: number; maxDev: number; sse: number; worst: number; sweep: number; monotonic: boolean }

/** 全最小二乘（PCA）直线：返回单位方向 + 质心 + 最大垂距 + 残差平方和 + 最差点下标。 */
export function fitLine(p: Pt[]): LineFit {
  const n = p.length
  let mx = 0, my = 0
  for (const q of p) { mx += q[0]; my += q[1] }
  mx /= n; my /= n
  let sxx = 0, sxy = 0, syy = 0
  for (const q of p) { const dx = q[0] - mx, dy = q[1] - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  const dir: Pt = [Math.cos(th), Math.sin(th)]
  let maxDev = 0, worst = 0, sse = 0
  for (let i = 0; i < n; i++) {
    const d = Math.abs(-dir[1] * (p[i][0] - mx) + dir[0] * (p[i][1] - my))
    sse += d * d
    if (d > maxDev) { maxDev = d; worst = i }
  }
  return { dir, c: [mx, my], maxDev, sse, worst }
}

/** 几何最小二乘圆：Kåsa 代数解起手 + Landau 定点迭代收敛到真几何残差最小。附带扫角/单调性判据。 */
export function fitCircle(p: Pt[]): CircleFit | null {
  const n = p.length
  if (n < 3) return null
  let mx = 0, my = 0
  for (const q of p) { mx += q[0]; my += q[1] }
  mx /= n; my /= n
  // Kåsa: 解 (u,v) 中心偏移 —— 正规方程 [Suu Suv; Suv Svv][cx;cy] = [ (Suuu+Suvv)/2 ; (Svvv+Svuu)/2 ]
  let Suu = 0, Suv = 0, Svv = 0, Suuu = 0, Svvv = 0, Suvv = 0, Svuu = 0
  for (const q of p) {
    const u = q[0] - mx, v = q[1] - my
    Suu += u * u; Suv += u * v; Svv += v * v
    Suuu += u * u * u; Svvv += v * v * v; Suvv += u * v * v; Svuu += v * u * u
  }
  const det = Suu * Svv - Suv * Suv
  if (Math.abs(det) < 1e-12) return null
  const b1 = (Suuu + Suvv) / 2, b2 = (Svvv + Svuu) / 2
  let cx = mx + (b1 * Svv - b2 * Suv) / det
  let cy = my + (Suu * b2 - Suv * b1) / det
  let r = 0
  for (let it = 0; it < 40; it++) {
    let sd = 0, su = 0, sv = 0
    for (const q of p) {
      const dx = q[0] - cx, dy = q[1] - cy
      const d = Math.hypot(dx, dy)
      if (d < 1e-12) return null
      sd += d; su += dx / d; sv += dy / d
    }
    r = sd / n
    const ncx = mx - r * (su / n), ncy = my - r * (sv / n)
    const step = Math.hypot(ncx - cx, ncy - cy)
    cx = ncx; cy = ncy
    if (step < 1e-10) break
  }
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || !(r > 0)) return null
  let maxDev = 0, worst = 0, sse = 0
  for (let i = 0; i < n; i++) {
    const d = Math.abs(Math.hypot(p[i][0] - cx, p[i][1] - cy) - r)
    sse += d * d
    if (d > maxDev) { maxDev = d; worst = i }
  }
  // 沿点序累加角增量 → 有向扫角（>0 = 逆时针）+ 单调性（S 形/回头路 → 唔系单一圆弧）
  let sweep = 0, pos = 0, neg = 0
  let prev = Math.atan2(p[0][1] - cy, p[0][0] - cx)
  for (let i = 1; i < n; i++) {
    const a = Math.atan2(p[i][1] - cy, p[i][0] - cx)
    let d = a - prev
    while (d > Math.PI) d -= TAU
    while (d < -Math.PI) d += TAU
    sweep += d
    if (d > 0) pos += d; else neg -= d
    prev = a
  }
  const monotonic = Math.min(pos, neg) <= 0.2 * Math.max(pos, neg, 1e-9)
  return { c: [cx, cy], r, maxDev, sse, worst, sweep, monotonic }
}

// ───────────────────────────────────────────────────────────── 5. 角点检测

type Chain = { pts: Pt[]; closed: boolean }
const chAt = (ch: Chain, i: number): Pt => {
  const n = ch.pts.length
  return ch.closed ? ch.pts[((i % n) + n) % n] : ch.pts[clamp(i, 0, n - 1)]
}
const chSub = (ch: Chain, i0: number, i1: number): Pt[] => {
  const out: Pt[] = []
  for (let i = i0; i <= i1; i++) out.push(chAt(ch, i))
  return out
}

/** 由 i 沿 dir 走到弦长 ≥ d 嘅点（开链撞头就停）。返回下标，冇效返 null。 */
function armIdx(ch: Chain, i: number, dir: 1 | -1, d: number): number | null {
  const n = ch.pts.length
  const p = chAt(ch, i)
  for (let k = 1; k <= n; k++) {
    const j = i + dir * k
    if (!ch.closed && (j < 0 || j > n - 1)) return null
    const q = chAt(ch, j)
    if (Math.hypot(q[0] - p[0], q[1] - p[1]) >= d) return j
  }
  return null
}

function turnAt(ch: Chain, i: number, d: number): number | null {
  const jb = armIdx(ch, i, -1, d), jf = armIdx(ch, i, 1, d)
  if (jb == null || jf == null) return null
  const p = chAt(ch, i), a = chAt(ch, jb), b = chAt(ch, jf)
  const a1 = Math.atan2(a[1] - p[1], a[0] - p[0]), a2 = Math.atan2(b[1] - p[1], b[0] - p[0])
  let open = Math.abs(a2 - a1)
  while (open > TAU) open -= TAU
  if (open > Math.PI) open = TAU - open
  return Math.PI - open   // 转角：0 = 笔直，π = 折返
}

/**
 * 角点检测（双尺度）。真角嘅转角同支撑半径无关；圆弧嘅转角约同支撑半径成正比 —— 用 turn(2d) < 1.5·turn(d)
 * 区分，令圆角矩形嘅 R 角唔会被误判成尖角（呢个系「4 直线 + 4 圆弧」拎得返嘅关键）。
 */
export function detectCorners(pts: Pt[], closed: boolean, opt: { candidates?: number[]; support?: number; minTurn?: number } = {}): number[] {
  const ch: Chain = { pts, closed }
  const n = pts.length
  if (n < 5) return []
  let peri = 0
  for (let i = 0; i < (closed ? n : n - 1); i++) { const a = pts[i], b = pts[(i + 1) % n]; peri += Math.hypot(b[0] - a[0], b[1] - a[1]) }
  const d = opt.support ?? clamp(peri * 0.02, 3, 10)
  const minTurn = (opt.minTurn ?? 30) * DEG
  const cand = opt.candidates ?? pts.map((_, i) => i)
  const hits: { i: number; turn: number }[] = []
  for (const i of cand) {
    if (!closed && (i <= 0 || i >= n - 1)) continue
    const t1 = turnAt(ch, i, d)
    if (t1 == null || t1 < minTurn) continue
    const t2 = turnAt(ch, i, d * 2)
    if (t2 != null && t2 > 1.5 * t1 + 8 * DEG) continue   // 转角随尺度线性增长 = 圆弧，唔系角
    hits.push({ i, turn: t1 })
  }
  hits.sort((a, b) => b.turn - a.turn)
  const taken: number[] = []
  for (const hgt of hits) {
    let near = false
    for (const t of taken) {
      const dd = Math.abs(t - hgt.i)
      if (Math.min(dd, closed ? n - dd : dd) <= d) { near = true; break }
    }
    if (!near) taken.push(hgt.i)
  }
  return taken.sort((a, b) => a - b)
}

// ─────────────────────────────────────────────── 6. 直线/圆弧 分裂 + 合并 分段

export type SegmentOptions = {
  fitTol?: number        // 直线/圆弧最大允许偏差（像素）
  simplifyTol?: number   // Douglas-Peucker 容差（像素），供角点候选
  cornerTurn?: number    // 最小转角（度）
  cornerSupport?: number // 角点支撑半径（像素），缺省按周长自适应
  axisSnap?: number      // 近轴直线 snap 水平/竖直嘅角度门限（度），0 = 唔 snap
  maxArcSweep?: number   // 单段圆弧最大扫角（度）
}

export type TraceSeg =
  | { kind: 'line'; a: Pt; b: Pt }
  | { kind: 'arc'; a: Pt; b: Pt; c: Pt; r: number; ccw: boolean; bulge: number; sweep: number }

export type TraceConstraint =
  | { type: 'horizontal' | 'vertical'; seg: number }
  | { type: 'tangent' | 'equalRadius'; seg: number; seg2: number }

export type SegmentResult = {
  segs: TraceSeg[]
  verts: Pt[]
  bulges: number[]
  corners: number[]
  constraints: TraceConstraint[]
  maxDev: number
}

type Prim =
  | { kind: 'line'; dir: Pt; c: Pt; maxDev: number }
  | { kind: 'arc'; c: Pt; r: number; sweep: number; maxDev: number }

function tryPrim(p: Pt[], tol: number, maxSweep: number): Prim | null {
  if (p.length < 2) return null
  const L = fitLine(p)
  if (L.maxDev <= tol) return { kind: 'line', dir: L.dir, c: L.c, maxDev: L.maxDev }
  if (p.length >= 6) {
    const C = fitCircle(p)
    if (C && C.maxDev <= tol && C.monotonic && C.r < 1e4 && Math.abs(C.sweep) <= maxSweep && Math.abs(C.sweep) > 1 * DEG) {
      return { kind: 'arc', c: C.c, r: C.r, sweep: C.sweep, maxDev: C.maxDev }
    }
  }
  return null
}

// 接点两侧各让开 1 点先做拟合：光栅化嘅尖角会被抗锯齿「切一刀」，个交界点本身对两边嚟讲都偏离
// 半个像素以上（实测 0.98px），照收就会逼到直边都拟合唔到而无谓分裂。真正嘅角点／切点由后面
// 嘅「支撑几何求交」还原，所以呢两点丢得起。
const guardOf = (i0: number, i1: number) => (i1 - i0 >= 6 ? 1 : 0)

function fitRange(ch: Chain, i0: number, i1: number, tol: number, maxSweep: number): Prim | null {
  const g = guardOf(i0, i1)
  return tryPrim(chSub(ch, i0 + g, i1 - g), tol, maxSweep)
}

function splitRange(ch: Chain, i0: number, i1: number, tol: number, maxSweep: number, depth: number, out: number[]): void {
  if (i1 - i0 <= 4 || depth > 32) return
  if (fitRange(ch, i0, i1, tol, maxSweep)) return
  // 断点只喺【区间中段】拣：拟合直线嘅最大偏差好多时就喺两端（长区间尤甚），照用就变成「每次啄走一点」
  // → O(n) 次分裂、段段得一两点，之后点合都合唔返。留 15% 边距 → 每次至少几何式缩短，收敛得返。
  const mrg = Math.max(2, Math.round((i1 - i0) * 0.15))
  const L = fitLine(chSub(ch, i0, i1))
  const nx = -L.dir[1], ny = L.dir[0]
  let best = -1, k = (i0 + i1) >> 1
  for (let i = i0 + mrg; i <= i1 - mrg; i++) {
    const p = chAt(ch, i)
    const d = Math.abs(nx * (p[0] - L.c[0]) + ny * (p[1] - L.c[1]))
    if (d > best) { best = d; k = i }
  }
  out.push(k)
  splitRange(ch, i0, k, tol, maxSweep, depth + 1, out)
  splitRange(ch, k, i1, tol, maxSweep, depth + 1, out)
}

/**
 * 一条点链 → 直线/圆弧段。断点表示法：闭环 = 环状断点集（删一个断点 = 合并相邻两段，接缝亦然）；
 * 开链 = 首尾固定嘅断点表。分裂后行合并 pass 令「起点落喺一段中间」唔会永久切开一条直线/圆弧。
 */
export function segmentChain(ptsIn: Pt[], closed: boolean, opt: SegmentOptions = {}): SegmentResult {
  const pts = dedupe(ptsIn, closed)
  const n = pts.length
  const tol = opt.fitTol ?? 0.9
  const maxSweep = (opt.maxArcSweep ?? 300) * DEG
  const empty: SegmentResult = { segs: [], verts: pts.slice(), bulges: pts.map(() => 0), corners: [], constraints: [], maxDev: 0 }
  if (n < 2) return empty
  if (n < 5) {
    const verts = pts.slice()
    return { ...empty, verts, bulges: new Array(closed ? verts.length : Math.max(0, verts.length - 1)).fill(0), segs: linesFrom(verts, closed) }
  }
  const ch: Chain = { pts, closed }
  const dpIdx = douglasPeucker(closed ? [...pts, pts[0]] : pts, opt.simplifyTol ?? 0.6).map((i) => i % n)
  const corners = detectCorners(pts, closed, { candidates: [...new Set(dpIdx)], support: opt.cornerSupport, minTurn: opt.cornerTurn })

  // ── 断点：角点（或闭环种子）→ 逐段递归分裂
  let bs: number[]
  if (closed) bs = corners.length ? corners.slice() : [0]
  else bs = [...new Set([0, ...corners.filter((c) => c > 0 && c < n - 1), n - 1])].sort((a, b) => a - b)
  const extra: number[] = []
  const spans = closed ? bs.length : bs.length - 1
  for (let k = 0; k < spans; k++) {
    const i0 = bs[k]
    const i1 = closed ? (k + 1 < bs.length ? bs[k + 1] : bs[0] + n) : bs[k + 1]
    splitRange(ch, i0, i1, tol, maxSweep, 0, extra)
  }
  bs = [...new Set([...bs, ...extra.map((i) => ((i % n) + n) % n)])].sort((a, b) => a - b)
  if (!closed) bs = [...new Set([0, ...bs.filter((i) => i > 0 && i < n - 1), n - 1])].sort((a, b) => a - b)

  // ── 合并：删断点 = 合并相邻两段（闭环最少保留 2 个断点，开链首尾固定）
  //   ★ 只有「合并后拟合质量冇实质变差」先算数 ★：单靠「合并后仍喺容差内」会贪心吞并 —— 一条 130px
  //   直线食埋隔篱圆弧头几点都仍然喺 0.9px 内，跟住剩返嘅弧就再拼唔返，结果 4 弧变 6 弧。用相对判据
  //   （merged ≤ max(devA,devB)×1.5 + 0.12，且唔超过 tol）可以收齐同一条线/弧嘅碎片，又唔会越界食隔篱。
  const rangeOf = (k: number): [number, number] => {
    if (closed) { const a = bs[k], b = bs[(k + 1) % bs.length]; return [a, b > a ? b : b + n] }
    return [bs[k], bs[k + 1]]
  }
  // phase 1 = 质量判据（任何种类）；phase 2 = 只合并【同种】原语但用足容差 —— 用嚟收返被过度分裂
  // 嘅同一条弧/线嘅碎片，而「直线 + 圆弧碎片」因为种类唔同唔会喺 phase 2 越界食隔篱。
  for (let phase = 0; phase < 2; phase++) {
    let changed = true
    while (changed) {
      changed = false
      const lo = closed ? 0 : 1
      const hi = closed ? bs.length : bs.length - 1
      for (let k = lo; k < hi; k++) {
        if (bs.length <= 2) break
        const prev = closed ? bs[(k - 1 + bs.length) % bs.length] : bs[k - 1]
        const next = closed ? bs[(k + 1) % bs.length] : bs[k + 1]
        const i0 = prev
        let iC = bs[k], i1 = next
        if (closed) { while (iC <= i0) iC += n; while (i1 <= iC) i1 += n }
        if (i1 - i0 > n) continue
        const a = fitRange(ch, i0, iC, tol, maxSweep), b = fitRange(ch, iC, i1, tol, maxSweep)
        let m: Prim | null
        if (phase === 0) {
          const lim = Math.min(tol, Math.max(a ? a.maxDev : tol, b ? b.maxDev : tol, 0.08) * 1.5 + 0.12)
          m = fitRange(ch, i0, i1, lim, maxSweep)
        } else {
          if (!a || !b || a.kind !== b.kind) continue
          m = fitRange(ch, i0, i1, tol, maxSweep)
          if (m && m.kind !== a.kind) m = null
        }
        if (m) { bs.splice(k, 1); changed = true; break }
      }
    }
  }

  // ── 断点微调（boundary adjustment）：分裂/合并只保证「拟合得入容差」，唔保证断点啱啱落喺真切点。
  //   逐个断点喺 ±m 点内搵令两边拟合残差和最细嘅位置 → 切点归位，直边唔再被弧尾拉斜、弧半径唔再被直边拉大。
  //   目标函数用【残差平方和】而唔系最大偏差：maxDev 会系统性偏爱「缩短区间」（点少自然 maxDev 细），
  //   会把断点推到极端（试过令闭合圆变成 325°+35°）。SSE 系逐点计，点由呢边搬去嗰边总量守恒 → 无偏。
  //   同时圆弧要过同 tryPrim 一样嘅可采纳门槛（单调、半径、扫角上限），refine 先唔会踩入拟合唔到嘅配置。
  const cost = (i0: number, i1: number): number => {
    if (i1 - i0 < 3) return 1e12
    const g = guardOf(i0, i1)
    const p = chSub(ch, i0 + g, i1 - g)
    if (p.length < 2) return 1e12
    const L = fitLine(p)
    let best = L.sse
    if (p.length >= 6) {
      const C = fitCircle(p)
      if (C && C.monotonic && C.r < 1e4 && Math.abs(C.sweep) <= maxSweep && C.sse < best) best = C.sse
    }
    return best
  }
  for (let round = 0; round < 4 && bs.length > 1; round++) {
    let moved = false
    const lo = closed ? 0 : 1, hi = closed ? bs.length : bs.length - 1
    for (let k = lo; k < hi; k++) {
      const prev = closed ? bs[(k - 1 + bs.length) % bs.length] : bs[k - 1]
      const next = closed ? bs[(k + 1) % bs.length] : bs[k + 1]
      const i0 = prev
      let iC = bs[k], i1 = next
      if (closed) { while (iC <= i0) iC += n; while (i1 <= iC) i1 += n }
      if (i1 - i0 > n) continue
      const m = clamp(Math.round(Math.min(iC - i0, i1 - iC) * 0.3), 1, 8)
      let bestS = 0, bestC = cost(i0, iC) + cost(iC, i1)
      for (let s = -m; s <= m; s++) {
        if (!s) continue
        const c = cost(i0, iC + s) + cost(iC + s, i1)
        if (c < bestC - 1e-9) { bestC = c; bestS = s }
      }
      if (bestS) { bs[k] = (((iC + bestS) % n) + n) % n; moved = true }
    }
    if (!moved) break
    bs = [...new Set(bs)].sort((a, b) => a - b)
  }

  // ── 逐段定型
  const nSeg = closed ? bs.length : bs.length - 1
  const prims: Prim[] = []
  const ranges: [number, number][] = []
  let maxDev = 0
  for (let k = 0; k < nSeg; k++) {
    const [i0, i1] = rangeOf(k)
    ranges.push([i0, i1])
    let pr = fitRange(ch, i0, i1, tol, maxSweep)
    if (!pr) { const L = fitLine(chSub(ch, i0, i1)); pr = { kind: 'line', dir: L.dir, c: L.c, maxDev: L.maxDev } }   // 诚实降级：拟合唔到就当直线
    maxDev = Math.max(maxDev, pr.maxDev)
    prims.push(pr)
  }

  // ── 约束推断：近轴直线 snap（同时记低 水平/竖直 约束）；再把方向定向到行进方向（相切判据用）
  const snapDeg = opt.axisSnap ?? 2
  const constraints: TraceConstraint[] = []
  prims.forEach((pr, k) => {
    if (pr.kind !== 'line') return
    if (snapDeg > 0) {
      let ang = Math.atan2(pr.dir[1], pr.dir[0])
      while (ang < 0) ang += Math.PI
      if (Math.abs(ang) <= snapDeg * DEG || Math.abs(ang - Math.PI) <= snapDeg * DEG) { pr.dir = [1, 0]; constraints.push({ type: 'horizontal', seg: k }) }
      else if (Math.abs(ang - Math.PI / 2) <= snapDeg * DEG) { pr.dir = [0, 1]; constraints.push({ type: 'vertical', seg: k }) }
    }
    const s = chAt(ch, ranges[k][0]), e = chAt(ch, ranges[k][1])
    if (pr.dir[0] * (e[0] - s[0]) + pr.dir[1] * (e[1] - s[1]) < 0) pr.dir = [-pr.dir[0], -pr.dir[1]]
  })

  // ── 接点精修：相邻支撑几何求交（线×线 / 线×圆 切点 / 圆×圆），越界就保留原始点
  const verts: Pt[] = []
  for (let k = 0; k < nSeg; k++) {
    const raw = chAt(ch, ranges[k][0])
    const kp = closed ? (k - 1 + nSeg) % nSeg : k - 1
    if (kp < 0 || kp === k) { verts.push(raw); continue }
    verts.push(refineJoint(prims[kp], prims[k], raw, 2 * tol + 1.5))
  }
  if (!closed) verts.push(chAt(ch, ranges[nSeg - 1][1]))

  // ── verts/bulges + segs
  const bulges: number[] = []
  const segs: TraceSeg[] = []
  for (let k = 0; k < nSeg; k++) {
    const a = verts[k], b = verts[(k + 1) % verts.length]
    const pr = prims[k]
    if (pr.kind === 'line') { bulges.push(0); segs.push({ kind: 'line', a, b }) }
    else {
      const ccw = pr.sweep > 0
      let th = angleBetween(pr.c, a, b, ccw)
      if (!(th > 1e-6)) th = Math.min(Math.abs(pr.sweep), maxSweep)
      const bulge = -(ccw ? 1 : -1) * Math.tan(th / 4)
      bulges.push(bulge)
      segs.push({ kind: 'arc', a, b, c: pr.c, r: pr.r, ccw, bulge, sweep: ccw ? th : -th })
    }
  }

  // ── 相切 / 等半径 推断（供 store 落真约束）
  for (let k = 0; k + (closed ? 0 : 1) < nSeg; k++) {
    const k2 = (k + 1) % nSeg
    const t1 = tangentDir(prims[k], verts[k2]), t2 = tangentDir(prims[k2], verts[k2])
    if (t1 && t2) {
      const d = Math.abs(Math.atan2(t1[0] * t2[1] - t1[1] * t2[0], t1[0] * t2[0] + t1[1] * t2[1]))
      if (d < 3 * DEG) constraints.push({ type: 'tangent', seg: k, seg2: k2 })
    }
    const p1 = prims[k], p2 = prims[k2]
    if (p1.kind === 'arc' && p2.kind === 'arc' && Math.abs(p1.r - p2.r) < Math.max(0.02 * p1.r, tol)) constraints.push({ type: 'equalRadius', seg: k, seg2: k2 })
  }
  return { segs, verts, bulges, corners, constraints, maxDev }
}

function dedupe(pts: Pt[], closed: boolean): Pt[] {
  const out: Pt[] = []
  for (const p of pts) { const l = out[out.length - 1]; if (!l || Math.hypot(p[0] - l[0], p[1] - l[1]) > 1e-9) out.push([p[0], p[1]]) }
  while (closed && out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < 1e-9) out.pop()
  return out
}

function linesFrom(verts: Pt[], closed: boolean): TraceSeg[] {
  const segs: TraceSeg[] = []
  for (let i = 0; i + (closed ? 0 : 1) < verts.length; i++) segs.push({ kind: 'line', a: verts[i], b: verts[(i + 1) % verts.length] })
  return segs
}

/** a→b 绕圆心 c 沿指定转向嘅扫角 ∈ (0, 2π)。 */
function angleBetween(c: Pt, a: Pt, b: Pt, ccw: boolean): number {
  const a0 = Math.atan2(a[1] - c[1], a[0] - c[0]), a1 = Math.atan2(b[1] - c[1], b[0] - c[0])
  let d = ccw ? a1 - a0 : a0 - a1
  while (d <= 0) d += TAU
  while (d > TAU) d -= TAU
  return d
}

/** 段喺指定点嘅【行进方向】切向。直线 = 已定向嘅 dir；圆弧 = 半径向量转 90°（按扫向）。 */
function tangentDir(pr: Prim, at: Pt): Pt | null {
  if (pr.kind === 'line') return pr.dir
  const dx = at[0] - pr.c[0], dy = at[1] - pr.c[1]
  const l = Math.hypot(dx, dy)
  if (l < 1e-9) return null
  const s = pr.sweep > 0 ? 1 : -1
  return [(-dy / l) * s, (dx / l) * s]
}

function refineJoint(a: Prim, b: Prim, raw: Pt, maxSnap: number): Pt {
  const cand = intersectPrims(a, b, raw)
  if (cand && Math.hypot(cand[0] - raw[0], cand[1] - raw[1]) <= maxSnap) return cand
  return [raw[0], raw[1]]
}

function intersectPrims(a: Prim, b: Prim, near: Pt): Pt | null {
  if (a.kind === 'line' && b.kind === 'line') {
    const den = a.dir[0] * b.dir[1] - a.dir[1] * b.dir[0]
    if (Math.abs(den) < 0.02) return null   // 近平行 → 交点唔可信
    const dx = b.c[0] - a.c[0], dy = b.c[1] - a.c[1]
    const t = (dx * b.dir[1] - dy * b.dir[0]) / den
    return [a.c[0] + a.dir[0] * t, a.c[1] + a.dir[1] * t]
  }
  if (a.kind === 'line' && b.kind === 'arc') return lineCircle(a, b, near)
  if (a.kind === 'arc' && b.kind === 'line') return lineCircle(b, a, near)
  if (a.kind === 'arc' && b.kind === 'arc') return circleCircle(a, b, near)
  return null
}

function lineCircle(L: Extract<Prim, { kind: 'line' }>, C: Extract<Prim, { kind: 'arc' }>, near: Pt): Pt | null {
  const fx = L.c[0] - C.c[0], fy = L.c[1] - C.c[1]
  const bq = 2 * (fx * L.dir[0] + fy * L.dir[1])
  const cq = fx * fx + fy * fy - C.r * C.r
  const disc = bq * bq - 4 * cq
  // 近相切要当【相切】处理：拟合半径同「圆心到直线距离」差零点几个像素，就足以令交点由切点跳开一两个
  // 像素（两个交点相距 2√(r²−d²)），弧就唔够 90°。差距细过 max(0.35px, 2%r) 一律取垂足 = 真切点。
  const t0 = -bq / 2
  const fpx = L.c[0] + L.dir[0] * t0, fpy = L.c[1] + L.dir[1] * t0
  const dist = Math.hypot(fpx - C.c[0], fpy - C.c[1])
  if (disc < 0 || Math.abs(dist - C.r) <= Math.max(0.35, 0.02 * C.r)) {
    if (dist < 1e-9) return null
    return [fpx, fpy]
  }
  const s = Math.sqrt(disc)
  const t1 = (-bq + s) / 2, t2 = (-bq - s) / 2
  const p1: Pt = [L.c[0] + L.dir[0] * t1, L.c[1] + L.dir[1] * t1]
  const p2: Pt = [L.c[0] + L.dir[0] * t2, L.c[1] + L.dir[1] * t2]
  return Math.hypot(p1[0] - near[0], p1[1] - near[1]) <= Math.hypot(p2[0] - near[0], p2[1] - near[1]) ? p1 : p2
}

function circleCircle(A: Extract<Prim, { kind: 'arc' }>, B: Extract<Prim, { kind: 'arc' }>, near: Pt): Pt | null {
  const dx = B.c[0] - A.c[0], dy = B.c[1] - A.c[1]
  const d = Math.hypot(dx, dy)
  if (d < 1e-9) return null
  if (d > A.r + B.r || d < Math.abs(A.r - B.r)) {   // 相离/内含 → 取连心线上外切点（弧接弧相切嘅正路）
    const k = d > A.r + B.r ? A.r / d : (A.r > B.r ? A.r / d : -A.r / d)
    return [A.c[0] + dx * k, A.c[1] + dy * k]
  }
  const a = (A.r * A.r - B.r * B.r + d * d) / (2 * d)
  const h2 = A.r * A.r - a * a
  const h = h2 > 0 ? Math.sqrt(h2) : 0
  const mx = A.c[0] + (dx * a) / d, my = A.c[1] + (dy * a) / d
  const p1: Pt = [mx + (h * dy) / d, my - (h * dx) / d]
  const p2: Pt = [mx - (h * dy) / d, my + (h * dx) / d]
  return Math.hypot(p1[0] - near[0], p1[1] - near[1]) <= Math.hypot(p2[0] - near[0], p2[1] - near[1]) ? p1 : p2
}

// ─────────────────────────────────────────────────────────────── 7. 主入口

export type TraceOptions = SegmentOptions & {
  threshold?: number                   // 0..255；缺省用 Otsu
  foreground?: 'auto' | 'dark' | 'light'
  blur?: number                        // 3×3 二项模糊次数（抗噪），缺省 0
  minArea?: number                     // 去麻点面积门限（像素），缺省 9
  circleTol?: number                   // 整圆判据最大偏差（像素），缺省 = fitTol
  scale?: number                       // mm / 像素，缺省 1
  flipY?: boolean                      // 图像 y 向下 → CAD y 向上，缺省 true
  origin?: 'center' | 'topLeft'        // 缺省 center（图像中心 = 原点）
  maxContours?: number                 // 缺省 400（超出按面积保留最大者）
  minPerimeter?: number                // 丢弃周长细过此值嘅环（像素），缺省 6
}

export type TracedContour = {
  segs: TraceSeg[]
  verts: Pt[]
  bulges: number[]
  pts: Pt[]                            // 由拟合几何密铺（唔系原始像素点）→ 直接可做 profile
  poly: Pt[]                           // Douglas-Peucker 多边形（降级 / 预览）
  raw: Pt[]                            // 亚像素等值线原始点
  circle: { c: Pt; r: number } | null  // 成条环系一个整圆时有值
  area: number                         // 有向面积（外环 > 0，孔 < 0）
  depth: number                        // 嵌套深度（0 = 最外）
  isHole: boolean
  corners: number
  constraints: TraceConstraint[]
  maxDev: number                       // 拟合最大偏差（像素）
}

export type TraceSketchShape =
  | { type: 'circle'; c: Pt; r: number }
  | { type: 'poly'; pts: Pt[]; verts: Pt[]; bulges: number[]; open?: boolean }

export type TraceResult = {
  profiles: ImpProfile[]                          // → classifyProfiles() → importProfiles2D()（现有落地路径）
  shapes: TraceSketchShape[]                      // → sketchSources[skId].shapes（真圆弧，可重开编辑）
  contours: TracedContour[]
  geometry: { lines: { a: Pt; b: Pt }[]; arcs: { a: Pt; b: Pt; c: Pt; r: number; ccw: boolean }[] }
  threshold: number
  inkIsDark: boolean
  note: string
  warnings: string[]
}

const EMPTY = (note: string): TraceResult => ({ profiles: [], shapes: [], contours: [], geometry: { lines: [], arcs: [] }, threshold: 0, inkIsDark: true, note, warnings: [] })

/** 位图（灰度）→ 轮廓向量。所有 tol 单位 = 像素；输出坐标 = 像素 × scale。 */
export function traceBitmap(img: GrayImage, opt: TraceOptions = {}): TraceResult {
  const w = Math.floor(img.width), h = Math.floor(img.height)
  if (!(w >= 3 && h >= 3)) return EMPTY('图太细（至少 3×3 像素）')
  if (!img.data || img.data.length < w * h) return EMPTY('灰度数据长度唔够 width×height')

  const bin = binarize(img, { threshold: opt.threshold, foreground: opt.foreground, blur: opt.blur, minArea: opt.minArea })
  const warnings: string[] = []
  let ink = 0
  for (let i = 0; i < bin.mask.length; i++) ink += bin.mask[i]
  if (ink === 0 || ink === w * h) return EMPTY('阈值化后冇图形（整张全背景或全前景）— 试下手动 threshold 或 foreground')
  if (bin.removed > 0) warnings.push(`去麻点 ${bin.removed} 像素`)

  // ── 场（pad 一圈背景保证闭环）
  const W = w + 2, H = h + 2
  const f = new Float64Array(W * H).fill(-SNAP_MAG)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x
    let v = bin.inkIsDark ? bin.iso - bin.gray[i] : bin.gray[i] - bin.iso
    if ((v > 0 ? 1 : 0) !== bin.mask[i]) v = bin.mask[i] ? SNAP_MAG : -SNAP_MAG
    if (v === 0) v = bin.mask[i] ? 1e-6 : -1e-6
    f[(y + 1) * W + (x + 1)] = v
  }

  const scale = opt.scale ?? 1
  const flipY = opt.flipY !== false
  const ox = opt.origin === 'topLeft' ? 0 : (w - 1) / 2
  const oy = opt.origin === 'topLeft' ? 0 : (h - 1) / 2
  // 场坐标 → 工作坐标（像素、y 已翻）：先解 pad，再翻 Y
  const work = (p: Pt): Pt => [p[0] - 1, flipY ? h - 1 - (p[1] - 1) : p[1] - 1]
  const out = (p: Pt): Pt => [(p[0] - ox) * scale, (p[1] - oy) * scale]

  let loops = marchingSquares(f, W, H).map((l) => dedupe(l.map(work), true))
  const minPeri = opt.minPerimeter ?? 6
  loops = loops.filter((l) => l.length >= 6 && perimeter(l) >= minPeri && Math.abs(signedArea(l)) >= 1)
  if (!loops.length) return { ...EMPTY('未找到闭合轮廓（图形太细或全是噪点）'), threshold: bin.threshold, inkIsDark: bin.inkIsDark, warnings }
  const maxC = opt.maxContours ?? 400
  if (loops.length > maxC) {
    warnings.push(`轮廓 ${loops.length} 条超上限 ${maxC}，只保留面积最大嘅 ${maxC} 条（图可能系照片/带网点，建议先做清理）`)
    loops = loops.map((l) => ({ l, a: Math.abs(signedArea(l)) })).sort((p, q) => q.a - p.a).slice(0, maxC).map((x) => x.l)
  }

  // ── 嵌套深度（用环上一个顶点做测试点：等值线互不相交 → 判定明确）
  const areas = loops.map((l) => Math.abs(signedArea(l)))
  const depths = loops.map((l, i) => {
    let d = 0
    for (let k = 0; k < loops.length; k++) if (k !== i && areas[k] > areas[i] && pointInPoly(l[0], loops[k])) d++
    return d
  })

  const tol = opt.fitTol ?? 0.9
  const circleTol = opt.circleTol ?? tol
  const contours: TracedContour[] = []
  for (let i = 0; i < loops.length; i++) {
    const isHole = depths[i] % 2 === 1
    // 定向：外环 CCW（面积 > 0），孔 CW —— 令 bulge 号同「凸向行进左侧」语义一致，落 sketch 唔使再猜
    const raw = (signedArea(loops[i]) > 0) === !isHole ? loops[i] : loops[i].slice().reverse()
    const dpIdx = douglasPeucker([...raw, raw[0]], opt.simplifyTol ?? 0.6)
    const poly = dpIdx.map((k) => raw[k % raw.length])

    // 整圆判据：无强角点 + 全环单圆残差达标 + 扫角接近 2π
    let circle: { c: Pt; r: number } | null = null
    const cf = raw.length >= 12 ? fitCircle(raw) : null
    if (cf && cf.maxDev <= circleTol && cf.r >= 1.5 && Math.abs(Math.abs(cf.sweep) - TAU) < 0.35) circle = { c: cf.c, r: cf.r }

    const seg = circle
      ? { segs: [] as TraceSeg[], verts: [] as Pt[], bulges: [] as number[], corners: [] as number[], constraints: [] as TraceConstraint[], maxDev: cf ? cf.maxDev : 0 }
      : segmentChain(raw, true, opt)

    const vertsO = seg.verts.map(out)
    const segsO: TraceSeg[] = seg.segs.map((s) => s.kind === 'line'
      ? { kind: 'line', a: out(s.a), b: out(s.b) }
      : { kind: 'arc', a: out(s.a), b: out(s.b), c: out(s.c), r: s.r * scale, ccw: s.ccw, bulge: s.bulge, sweep: s.sweep })
    const ptsO = circle
      ? circlePts(out(circle.c), circle.r * scale, 64, !isHole)
      : (vertsO.length >= 2 ? pathPts(vertsO as [number, number][], seg.bulges, 0.12) as Pt[] : vertsO)
    contours.push({
      segs: segsO,
      verts: vertsO,
      bulges: seg.bulges.slice(),
      pts: ptsO,
      poly: poly.map(out),
      raw: raw.map(out),
      circle: circle ? { c: out(circle.c), r: circle.r * scale } : null,
      area: signedArea(ptsO),
      depth: depths[i],
      isHole,
      corners: seg.corners.length,
      constraints: seg.constraints,
      maxDev: seg.maxDev,
    })
  }

  const profiles: ImpProfile[] = []
  const shapes: TraceSketchShape[] = []
  const lines: { a: Pt; b: Pt }[] = []
  const arcs: { a: Pt; b: Pt; c: Pt; r: number; ccw: boolean }[] = []
  for (const c of contours) {
    if (c.circle) {
      profiles.push({ kind: 'circle', c: c.circle.c, r: c.circle.r })
      shapes.push({ type: 'circle', c: c.circle.c, r: c.circle.r })
    } else if (c.pts.length >= 3) {
      profiles.push({ kind: 'poly', pts: c.pts })
      shapes.push({ type: 'poly', pts: c.pts, verts: c.verts, bulges: c.bulges })
    }
    for (const s of c.segs) { if (s.kind === 'line') lines.push({ a: s.a, b: s.b }); else arcs.push({ a: s.a, b: s.b, c: s.c, r: s.r, ccw: s.ccw }) }
  }
  const nCircle = contours.filter((c) => c.circle).length
  const worst = contours.reduce((m, c) => Math.max(m, c.maxDev), 0)
  if (worst > tol * 2) warnings.push(`部分轮廓拟合偏差 ${worst.toFixed(2)}px 超容差（形状可能有自由曲线，已用多段直线逼近）`)
  const note = `识别 ${contours.length} 个轮廓（${nCircle} 整圆 + ${contours.length - nCircle} 线弧轮廓 · ${lines.length} 直线 / ${arcs.length} 圆弧${contours.some((c) => c.isHole) ? ` · ${contours.filter((c) => c.isHole).length} 孔` : ''}）`
  return { profiles, shapes, contours, geometry: { lines, arcs }, threshold: bin.threshold, inkIsDark: bin.inkIsDark, note, warnings }
}

function perimeter(pts: Pt[]): number {
  let s = 0
  for (let i = 0, n = pts.length; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; s += Math.hypot(b[0] - a[0], b[1] - a[1]) }
  return s
}

function circlePts(c: Pt, r: number, n = 64, ccw = true): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < n; i++) { const a = ((ccw ? i : n - i) * TAU) / n; out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]) }
  return out
}

/** 开放路径（中线用）密铺：verts + bulges → 点列（含首尾，唔闭合）。 */
export function openPathPts(verts: Pt[], bulges: number[], maxStep = 0.12): Pt[] {
  if (!verts.length) return []
  const out: Pt[] = [[verts[0][0], verts[0][1]]]
  for (let i = 0; i + 1 < verts.length; i++) {
    for (const p of tessellateSeg(verts[i] as [number, number], verts[i + 1] as [number, number], bulges[i] || 0, maxStep)) {
      const l = out[out.length - 1]
      if (Math.hypot(p[0] - l[0], p[1] - l[1]) > 1e-9) out.push([p[0], p[1]])
    }
  }
  return out
}
