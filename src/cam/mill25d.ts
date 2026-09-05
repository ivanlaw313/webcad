// mill25d.ts — 2.5D CNC 铣削刀路纯数学模块（GRBL 业余机：3018 / Shapeoko 级）
//
// 目标机器限制（同 laserGcode.ts 同一系 GRBL 方言，但系铣刀唔系激光）：
//   · 单刀、无刀库 — 成个 program 一把刀做晒，唔出 T 字 / M6
//   · 无 canned cycles — G81/G83 GRBL 唔识，钻孔要手动展开成 G0/G1 序列
//   · G17 XY 平面 G2/G3 真圆弧（I,J 圆心字）控制器识插补
//
// 同 laserGcode.ts 共用嘅套路（佢系已验证嘅同类模块，照抄）：
//   · 偶奇深度分类 outer vs hole：取 loop 上一点（顶点）做 containment 测试，
//     唔好用质心 — 环形件（中间有孔嘅板）外框质心跌入自己个孔度，会分类错。
//     轮廓互不相交，loop 上任意一点都分类正确。
//   · 刀径补偿用 sketchOps.offsetPath（带符号：d>0 向外 / d<0 向内，绕向无关）；
//     塌陷会 throw（「偏移太大」）— 必须 try/catch，捕到就出 warning + 跳过。
//   · G2/G3 真弧输出：bulge 凸度惯例 正 = 凸向行进左侧 = 绕心顺时针 = G2。
//   · 数字格式 fmt：3 位小数剪尾零，|x|<1e-9 → 0（GRBL 唔食 "1e-15"）。
//   · 先孔后外框 — 外框切甩咗件，工件郁咗剩低嘅刀路就全废。
//
// 点解外框向外偏移唔用 offsetPath？—— 佢凸角出 miter 尖角（直-直求交延长），
// 激光 kerf 半宽好细（~0.1mm）miter 误差冇所谓；但铣刀半径成 2-3mm，
// 物理圆刀绕凸角外侧扫出嚟嘅刀心轨迹系【以角点为心、半径 = 刀半径嘅圆弧】，
// miter 会过切角位外侧大段料。所以本模块自带 offsetOutward：
// 凸角（左转）插圆角弧、凹角（右转）解析求交修剪、弧段同心改半径。
//
// 三种操作：
//   contour — 轮廓切穿：孔向内偏 toolD/2、外框向外偏 toolD/2（刀心路径 —
//             切出嚟先系图纸尺寸）。孔先切晒全部层，再切外框。
//             tabs>0：净系外框最后一层做留料桥（桥高 1mm 桥长 6mm），
//             该层用 pathPts 密铺成纯直线折线先至好计等弧长桥位。
//   pocket  — 挖槽：净支持顶层（depth 0）无岛轮廓；环 = 边界向内偏 toolD/2
//             再逐次向内偏 stepover。直插下刀喺最内环起点，由内环切到外环。
//             停环规则（v1 简化）：环再向内 toolD/2（刀内缘）都仲喺料内先收 —
//             即系话最内环嘅刀内缘唔会越过槽中心；极端情况中心可能留
//             少过 stepover 嘅微残料，用家收细 stepover 解决。
//   drill   — 啄钻（G83 手动展开）：净处理圆形 profile（verts 2 个 + 两段
//             半圆 bulge ±1 同号；圆心 = 两 vert 中点，直径 = 距离）。
//             净啱直径 ≤ toolD×1.05 嘅孔（位置钻）；大过嘅应该改 op:'contour'。
//
// 深度层序列：z = −stepdown, −2·stepdown, …，最尾一层准确 = −depth（唔好过切）。

import { type Profile2D } from '../io/laserGcode'
import { offsetPath, pathPts, bulgeCenter, bulgeRadius, bulgeTheta, type Pt } from '../sketch/sketchOps'

export interface MillOpts {
  toolD: number      // 刀径 mm
  depth: number      // 总切深 mm（正数，向下切到 z=-depth）
  stepdown: number   // 每层切深 mm
  feedXY: number     // 切削进给 mm/min
  feedZ: number      // 下刀进给 mm/min
  rpm: number        // 主轴 S 字（M3 S<rpm>）
  safeZ: number      // 安全高度 mm（正）
  op: 'contour' | 'pocket' | 'drill' | 'face'   // S94：face = 面铣（raster 清轮廓内顶面）
  stepover?: number  // pocket/face 相邻行/环距，默认 toolD*0.45
  tabs?: number      // contour 留料桥数，默认 0；桥高 1mm 桥长 6mm
  drillMaxD?: number // drill：只钻 ≤ 此直径嘅圆，默认 Infinity
  post?: 'grbl' | 'canned'   // S94：后处理方言 — grbl（默认，啄钻手动展开）/ canned（G81/G83 标准循环，兼容工业机）
}

const EPS = 1e-9
const TAU = Math.PI * 2
const TAB_H = 1    // 桥高 mm
const TAB_LEN = 6  // 桥长 mm

// 数字格式（照抄 laserGcode）：|x|<1e-9 → 0，3 位小数剪尾零
const fmt = (x: number): string => String(+(Math.abs(x) < 1e-9 ? 0 : x).toFixed(3))

function dist(a: Pt, b: Pt): number { return Math.hypot(b[0] - a[0], b[1] - a[1]) }

/** Shoelace 有向面积：>0 = CCW（照抄 laserGcode）。 */
function shoelace(pts: Pt[]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length]
    a += p[0] * q[1] - q[0] * p[1]
  }
  return a / 2
}

/** 偶奇射线含点测试（照抄 laserGcode / store.ts pointInPoly）。 */
function pointInPoly(pt: Pt, pts: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1]
    if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi)) inside = !inside
  }
  return inside
}

/** 去连续重复点 + 重复闭合点（照抄 laserGcode）。 */
function cleanLoop(pts: [number, number][]): Pt[] {
  const out: Pt[] = []
  for (const p of pts) {
    const last = out[out.length - 1]
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-9) out.push([p[0], p[1]])
  }
  while (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= 1e-9) out.pop()
  return out
}

type Loop = { verts: Pt[]; bulges: number[] }

/** 圆形 profile 判定：verts 2 个 + 两段半圆 bulge（±1 同号）。
 *  圆心 = 两 vert 中点，直径 = 两 vert 距离（钻孔判定用呢个）。 */
function circleOf(p: Profile2D): { c: Pt; dia: number } | null {
  const v = p.verts, b = p.bulges
  if (!v || !b || v.length !== 2 || b.length < 2) return null
  const b0 = b[0] ?? 0, b1 = b[1] ?? 0
  if (Math.abs(Math.abs(b0) - 1) > 1e-6 || Math.abs(Math.abs(b1) - 1) > 1e-6) return null
  if (b0 * b1 <= 0) return null // 异号 = 两段弧凸埋同一边，唔系圆
  const dia = Math.hypot(v[1][0] - v[0][0], v[1][1] - v[0][1])
  if (dia < EPS) return null
  return { c: [(v[0][0] + v[1][0]) / 2, (v[0][1] + v[1][1]) / 2], dia }
}

/** 统一做 CCW Loop：verts+bulges 路径用 laserGcode 嘅 reverse 公式
 *  （顶点倒序 + bulge 重排取负），纯 pts 路径就直接倒序补零 bulge。 */
function toCCWLoop(p: Profile2D, cleaned: Pt[]): Loop {
  const pv = p.verts, pb = p.bulges
  if (pv && pb && pv.length >= 2) {
    let v = pv.map((q) => [q[0], q[1]] as Pt)
    let b = pv.map((_, i) => pb[i] ?? 0)
    if (shoelace(cleaned) < 0) {
      const n = v.length
      const rv = [...v].reverse()
      const rb = rv.map((_, j) => -(b[(n - 2 - j + n) % n] ?? 0))
      v = rv; b = rb
    }
    return { verts: v, bulges: b }
  }
  const pts = shoelace(cleaned) < 0 ? [...cleaned].reverse() : cleaned
  return { verts: pts.map((q) => [q[0], q[1]] as Pt), bulges: pts.map(() => 0) }
}

/** 外框向外偏移 d（输入必须 CCW，d>0）—— 真刀心轨迹版：
 *  · 直段沿外法线（CCW 行进方向右手边）平移
 *  · 弧段同心改半径：凸弧（bulge<0，凸向外）R+d / 凹弧（bulge>0）R−d；
 *    凹圆角细过刀半径 → throw（物理上刀根本入唔到去）
 *  · 凸角（左转）接缝有隙 → 以原顶点为心、半径 d 插入圆角弧
 *    （e→s 绕顶点逆时针 = bulge 负 = G3；呢个先系圆刀绕角扫出嚟嘅真轨迹）
 *  · 凹角（右转）接缝重叠 → 直-直解析求交修剪（v1 凹角连弧未支持 → throw，
 *    由 caller try/catch 接住出 warning）
 *  · 相切接缝（slot / 圆角矩形 / 双弧全圆）天然重合 → 直接焊埋
 *  退化（段反向 / 段塌缩）→ throw。 */
function offsetOutward(verts: Pt[], bulges: number[], d: number): Loop {
  const n = verts.length
  if (n < 2) throw new Error('路径至少需 2 个顶点')
  // 每段「天然偏移」：新端点 + 原切向（接缝判向用）
  type NSeg = {
    line: boolean
    a: Pt; b: Pt        // 偏移后天然端点
    dIn: Pt; dOut: Pt   // 原段起点/终点单位切向
    cx: number; cy: number; sgn: number; theta: number; obl: number
  }
  const segs: NSeg[] = []
  for (let i = 0; i < n; i++) {
    const a = verts[i], b = verts[(i + 1) % n], bu = bulges[i] ?? 0
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const len = Math.hypot(dx, dy)
    if (len < EPS) throw new Error('路径含重合点, 无法偏移')
    if (Math.abs(bu) < EPS) {
      const ux = dx / len, uy = dy / len
      const nx = uy, ny = -ux // CCW 外法线 = 行进右手边
      segs.push({
        line: true,
        a: [a[0] + nx * d, a[1] + ny * d], b: [b[0] + nx * d, b[1] + ny * d],
        dIn: [ux, uy], dOut: [ux, uy], cx: 0, cy: 0, sgn: 0, theta: 0, obl: 0,
      })
    } else {
      const c = bulgeCenter(a, b, bu), R = bulgeRadius(a, b, bu), sgn = bu > 0 ? 1 : -1
      const r2 = bu < 0 ? R + d : R - d // CCW：bulge<0 凸向外 → 半径加；bulge>0 凹 → 减
      if (r2 < EPS) throw new Error('凹位圆弧细过刀半径')
      const k = r2 / R
      // 切向 = 半径向量转 90°，方向睇绕心走向（bulge>0 = 绕心顺时针）
      const tang = (p: Pt): Pt => {
        const rx = p[0] - c[0], ry = p[1] - c[1], rl = Math.hypot(rx, ry) || 1
        return sgn > 0 ? [ry / rl, -rx / rl] : [-ry / rl, rx / rl]
      }
      segs.push({
        line: false,
        a: [c[0] + (a[0] - c[0]) * k, c[1] + (a[1] - c[1]) * k],
        b: [c[0] + (b[0] - c[0]) * k, c[1] + (b[1] - c[1]) * k],
        dIn: tang(a), dOut: tang(b), cx: c[0], cy: c[1], sgn, theta: bulgeTheta(bu), obl: bu,
      })
    }
  }
  // 逐顶点接驳：span[k] = outV[k]→outV[k+1] 属边幾多号原段（−1 = 插入嘅角弧）
  const outV: Pt[] = []
  const spanSeg: number[] = []
  const spanArc: number[] = []
  const push = (p: Pt, seg: number, cb = 0): void => { outV.push(p); spanSeg.push(seg); spanArc.push(cb) }
  for (let j = 0; j < n; j++) {
    const sp = segs[(j + n - 1) % n], sq = segs[j]
    const v = verts[j]
    const e = sp.b, s = sq.a // 上段偏移终点 / 下段偏移起点（两点都喺以 v 为心半径 d 圆上）
    if (dist(e, s) < 1e-7) { push([(e[0] + s[0]) / 2, (e[1] + s[1]) / 2], j); continue } // 相切 → 焊
    const cross = sp.dOut[0] * sq.dIn[1] - sp.dOut[1] * sq.dIn[0]
    if (cross > -1e-9) {
      // 凸角（左转）→ 隙 → 圆角弧：e→s 绕 v 逆时针，包角 = 外角
      const aE = Math.atan2(e[1] - v[1], e[0] - v[0])
      const aS = Math.atan2(s[1] - v[1], s[0] - v[0])
      let th = (aS - aE) % TAU
      if (th < 0) th += TAU
      push(e, -1, -Math.tan(th / 4)) // 逆时针 = bulge 负 = G3
      push(s, j)
    } else {
      // 凹角（右转）→ 重叠 → 修剪。v1 净支持直-直求交（凹角连弧好少见，
      // 圆角矩形/slot 全部系相切接缝行唔到呢度）。
      if (!(sp.line && sq.line)) throw new Error('凹角连弧段 v1 偏移未支持')
      const d1x = sp.b[0] - sp.a[0], d1y = sp.b[1] - sp.a[1]
      const d2x = sq.b[0] - sq.a[0], d2y = sq.b[1] - sq.a[1]
      const cr = d1x * d2y - d1y * d2x
      if (Math.abs(cr) < 1e-12) throw new Error('凹角平行段, 偏移退化')
      const t = ((sq.a[0] - sp.a[0]) * d2y - (sq.a[1] - sp.a[1]) * d2x) / cr
      push([sp.a[0] + t * d1x, sp.a[1] + t * d1y], j)
    }
  }
  // 重算各 span bulge：角弧用预先计好嘅；直线 0（校验冇反向）；弧由新端点重算包角
  const m = outV.length
  const outB: number[] = []
  for (let k = 0; k < m; k++) {
    const A = outV[k], B = outV[(k + 1) % m]
    const si = spanSeg[k]
    if (si < 0) { outB.push(spanArc[k]); continue }
    const sg = segs[si]
    if (dist(A, B) < EPS) throw new Error('偏移后段塌缩')
    if (sg.line) {
      if ((B[0] - A[0]) * sg.dIn[0] + (B[1] - A[1]) * sg.dIn[1] <= 0) throw new Error('偏移后段反向')
      outB.push(0)
    } else {
      const phiA = Math.atan2(A[1] - sg.cy, A[0] - sg.cx)
      const phiB = Math.atan2(B[1] - sg.cy, B[0] - sg.cx)
      let sweep = (sg.sgn > 0 ? phiA - phiB : phiB - phiA) % TAU
      if (sweep < 0) sweep += TAU
      // 包角冇变（相切接缝）→ 保留原 bulge 消浮点噪声；变咗就重算
      outB.push(Math.abs(sweep - sg.theta) < 1e-6 ? sg.obl : sg.sgn * Math.tan(sweep / 4))
    }
  }
  return { verts: outV, bulges: outB }
}

// ---------- G-code 发射 ----------

type Emit = { L: string[]; f: number } // f = modal 进给（变咗先出 F 字）

function fw(st: Emit, f: number): string {
  if (Math.abs(st.f - f) < 1e-9) return ''
  st.f = f
  return ` F${fmt(f)}`
}
function xy(p: Pt): string { return `X${fmt(p[0])} Y${fmt(p[1])}` }

/** 行一圈（假设刀已经喺 verts[0]、Z 已落）：直段 G1、弧段 G2（bulge>0 凸左
 *  = 绕心顺时针）/ G3，I,J = 圆心 − 段起点（照抄 laserGcode 发射逻辑）。 */
function emitRing(st: Emit, lp: Loop, feedXY: number): void {
  const n = lp.verts.length
  for (let k = 0; k < n; k++) {
    const a = lp.verts[k], b = lp.verts[(k + 1) % n], bu = lp.bulges[k] ?? 0
    if (Math.abs(bu) < EPS || dist(a, b) < EPS) {
      st.L.push(`G1 ${xy(b)}${fw(st, feedXY)}`)
    } else {
      const c = bulgeCenter(a, b, bu)
      st.L.push(`${bu > 0 ? 'G2' : 'G3'} ${xy(b)} I${fmt(c[0] - a[0])} J${fmt(c[1] - a[1])}${fw(st, feedXY)}`)
    }
  }
}

/** 一条闭合路径喺一层嘅标准流程：升安全高 → 飞去起点 → 慢插落深 → 走环。 */
function emitLoopLayer(st: Emit, lp: Loop, z: number, o: MillOpts, label: string): void {
  st.L.push(`(${label})`)
  st.L.push(`G0 Z${fmt(o.safeZ)}`)
  st.L.push(`G0 ${xy(lp.verts[0])}`)
  st.L.push(`G1 Z${fmt(z)}${fw(st, o.feedZ)}`)
  emitRing(st, lp, o.feedXY)
}

/** 外框最后一层留料桥版：路径先用 pathPts 密铺成纯直线折线（等弧长桥位先计得准），
 *  N 条桥等距分布（中心喺 (k+0.5)·L/N，避开起点）：切到桥头升 Z 到 −(depth−1)，
 *  喺桥高行 6mm，落返 −depth 继续。 */
function emitTabLayer(st: Emit, lp: Loop, o: MillOpts, nTabs: number, label: string): void {
  const pts = pathPts(lp.verts, lp.bulges)
  const m = pts.length
  const segL: number[] = []
  let L = 0
  for (let i = 0; i < m; i++) { const sl = dist(pts[i] as Pt, pts[(i + 1) % m] as Pt); segL.push(sl); L += sl }
  const zCut = -o.depth, zTab = -(o.depth - TAB_H)
  st.L.push(`(${label})`)
  st.L.push(`G0 Z${fmt(o.safeZ)}`)
  st.L.push(`G0 ${xy(pts[0] as Pt)}`)
  st.L.push(`G1 Z${fmt(zCut)}${fw(st, o.feedZ)}`)
  // 桥位事件表（进桥/出桥边界，按弧长排好序；L > 6N 由 caller 保证 → 冇 wrap）
  const evts: { s: number; enter: boolean }[] = []
  for (let k = 0; k < nTabs; k++) {
    const ck = ((k + 0.5) * L) / nTabs
    evts.push({ s: ck - TAB_LEN / 2, enter: true }, { s: ck + TAB_LEN / 2, enter: false })
  }
  let s0 = 0
  let ei = 0
  let last: Pt = pts[0] as Pt
  const moveTo = (p: Pt): void => {
    if (dist(p, last) > 1e-9) { st.L.push(`G1 ${xy(p)}${fw(st, o.feedXY)}`); last = p }
  }
  for (let i = 0; i < m; i++) {
    const a = pts[i] as Pt, b = pts[(i + 1) % m] as Pt, sl = segL[i]
    while (ei < evts.length && evts[ei].s <= s0 + sl + 1e-9) {
      const t = Math.min(1, Math.max(0, (evts[ei].s - s0) / (sl || 1)))
      moveTo([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
      st.L.push(`G1 Z${fmt(evts[ei].enter ? zTab : zCut)}${fw(st, o.feedZ)}`)
      ei++
    }
    moveTo(b)
    s0 += sl
  }
}

/** 啄钻展开（GRBL 冇 G83 要手写）：每啄 = G1 落（上次深 − stepdown）→
 *  G0 升 safeZ 排屑 → G0 落返上次深 + 0.5（留 0.5 空程缓冲）→ 继续到 −depth。
 *  最尾一啄之后嘅 G0 升 safeZ 顺便做埋退刀。 */
function emitDrill(st: Emit, c: Pt, zs: number[], o: MillOpts, label: string): void {
  st.L.push(`(${label})`)
  st.L.push(`G0 Z${fmt(o.safeZ)}`)
  st.L.push(`G0 ${xy(c)}`)
  for (let i = 0; i < zs.length; i++) {
    if (i > 0) st.L.push(`G0 Z${fmt(Math.min(zs[i - 1] + 0.5, 0))}`)
    st.L.push(`G1 Z${fmt(zs[i])}${fw(st, o.feedZ)}`)
    st.L.push(`G0 Z${fmt(o.safeZ)}`)
  }
}

/** S94：标准 canned-cycle 钻孔（工业机 Fanuc/Haas 等）— 深孔 G83 啄钻（Q=每啄）/ 浅孔 G81，
 *  R 退刀面 = 工件面上 1mm，G98 每孔退回起始高，G80 取消。比 GRBL 手动展开行数少得多。 */
function emitDrillCanned(st: Emit, holes: Pt[], o: MillOpts): void {
  if (!holes.length) return
  const peck = o.stepdown < o.depth - 1e-9   // 要啄钻先用 G83 + Q，否则 G81 一钻到底
  const R = 1                                 // 退刀面：工件面（z=0）上 1mm
  st.L.push(`(canned drill ×${holes.length} ${peck ? 'G83 peck Q' + fmt(o.stepdown) : 'G81'} Z${fmt(-o.depth)} R${fmt(R)})`)
  st.L.push(`G0 Z${fmt(o.safeZ)}`)
  st.L.push(`G0 ${xy(holes[0])}`)
  const cyc = peck ? `G98 G83 Q${fmt(o.stepdown)}` : 'G98 G81'
  st.L.push(`${cyc} ${xy(holes[0])} Z${fmt(-o.depth)} R${fmt(R)}${fw(st, o.feedZ)}`)
  for (let i = 1; i < holes.length; i++) st.L.push(xy(holes[i]))   // 模态：后续孔净 X Y
  st.L.push('G80', `G0 Z${fmt(o.safeZ)}`)
}

/** S94：水平线 y 同闭合多边形 pts 嘅 x 交点（升序）— 面铣 scan-line 用。 */
function scanlineX(pts: Pt[], y: number): number[] {
  const xs: number[] = []
  for (let i = 0, n = pts.length; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n]
    const y0 = a[1], y1 = b[1]
    if ((y0 > y) === (y1 > y)) continue   // 唔跨 y
    const t = (y - y0) / (y1 - y0)
    xs.push(a[0] + t * (b[0] - a[0]))
  }
  return xs.sort((p, q) => p - q)
}

// ---------- 主入口 ----------

/**
 * 闭合 2D 轮廓（mm，外框 + 孔混埋）→ GRBL 2.5D 铣削 G-code。
 * 返回 { gcode, warnings }；warnings 系俾 UI 显示嘅中文提示（跳过咗乜、
 * 安全建议等），唔会写入 G-code 本身。参数唔啱即刻 throw。
 */
export function profilesToMillGcode(profiles: Profile2D[], opts: MillOpts): { gcode: string; warnings: string[] } {
  // ── 参数 guard：七个必须为正嘅数 ──
  const checks: [string, number][] = [
    ['toolD', opts.toolD], ['depth', opts.depth], ['stepdown', opts.stepdown],
    ['feedXY', opts.feedXY], ['feedZ', opts.feedZ], ['rpm', opts.rpm], ['safeZ', opts.safeZ],
  ]
  for (const [k, v] of checks) {
    if (!(Number.isFinite(v) && v > 0)) throw new Error(`参数 ${k} 必须为正数（而家系 ${v}）`)
  }
  // stepover clamp 到 [toolD*0.2, toolD*0.9]：太细嘥时间，太大留脊
  const stepover = Math.min(opts.toolD * 0.9, Math.max(opts.toolD * 0.2, opts.stepover ?? opts.toolD * 0.45))
  const nTabs = Math.max(0, Math.floor(opts.tabs ?? 0))
  const drillMaxD = opts.drillMaxD ?? Infinity
  const r = opts.toolD / 2
  const warnings: string[] = []
  const warn = (s: string): void => { if (!warnings.includes(s)) warnings.push(s) }

  // ── 深度层序列：−stepdown, −2·stepdown, … 最尾准确 = −depth ──
  const zs: number[] = []
  for (let z = opts.stepdown; z < opts.depth - 1e-9; z += opts.stepdown) zs.push(-z)
  zs.push(-opts.depth)

  // ── 清洗 + 偶奇深度分类（照抄 laserGcode：代表点用 loop 顶点唔用质心）──
  const loops = profiles.map((p) => cleanLoop(p.pts))
  const valid = loops.map((l) => l.length >= 3)
  const depthOf = loops.map((l, i) => {
    if (!valid[i]) return 0
    const c = l[0]
    let dep = 0
    for (let j = 0; j < loops.length; j++) if (j !== i && valid[j] && pointInPoly(c, loops[j])) dep++
    return dep
  })
  const isHole = depthOf.map((dep, i) => valid[i] && dep % 2 === 1)
  const idxs = profiles.map((_, i) => i).filter((i) => valid[i])

  const st: Emit = { L: [], f: NaN }
  // 头：单位/绝对坐标/平面 → 升安全高 → 开主轴（M3 必须喺第一条 G1 之前）
  st.L.push('G21', 'G90', 'G17', `G0 Z${fmt(opts.safeZ)}`, `M3 S${fmt(opts.rpm)}`)

  if (opts.op === 'contour') {
    // ── 轮廓切穿：先孔（切晒全部层）后外框 ──
    const order = [...idxs.filter((i) => isHole[i]), ...idxs.filter((i) => !isHole[i])]
    let nh = 0, no = 0
    const totH = order.filter((i) => isHole[i]).length
    const totO = order.length - totH
    for (const i of order) {
      const lp = toCCWLoop(profiles[i], loops[i])
      const circ = circleOf(profiles[i])
      if (isHole[i]) {
        nh++
        let ring: Loop
        try {
          const o2 = offsetPath(lp.verts, lp.bulges, -r) // 孔向内偏 → 切出嚟先系图纸孔径
          ring = { verts: o2.verts as Pt[], bulges: o2.bulges }
        } catch {
          warn(`孔${circ ? ` Ø${fmt(circ.dia)}` : ` ${nh}`} 细过刀径 Ø${fmt(opts.toolD)} — 已跳过`)
          continue
        }
        zs.forEach((z, li) => {
          emitLoopLayer(st, ring, z, opts, `contour 孔 ${nh}/${totH} 第 ${li + 1}/${zs.length} 层 Z${fmt(z)}`)
        })
      } else {
        no++
        let ring: Loop
        try {
          ring = offsetOutward(lp.verts, lp.bulges, r) // 外框向外偏（凸角出圆角弧）
        } catch (e) {
          warn(`外框 ${no} 向外偏移失败（${e instanceof Error ? e.message : String(e)}）— 已跳过`)
          continue
        }
        // 留料桥可行性：桥高 1mm，depth 太浅（<1.5）桥同底冇分别 → 唔做
        let doTabs = nTabs > 0
        if (doTabs && opts.depth < 1.5) {
          warn(`深度 ${fmt(opts.depth)}mm < 1.5mm 唔够位做留料桥 — tabs 已略过`)
          doTabs = false
        }
        zs.forEach((z, li) => {
          const lab = `contour 外框 ${no}/${totO} 第 ${li + 1}/${zs.length} 层 Z${fmt(z)}`
          if (doTabs && li === zs.length - 1) {
            // 桥位等弧长分布要喺折线上行先准 → 密铺（弧改直线逼近，损失 <0.1mm）
            warn('桥层直线密铺（留料桥层弧段改用折线逼近）')
            emitTabLayer(st, ring, opts, nTabs, `${lab} 留料桥 ×${nTabs}`)
          } else {
            emitLoopLayer(st, ring, z, opts, lab)
          }
        })
      }
    }
  } else if (opts.op === 'pocket') {
    // ── 挖槽：净做顶层（depth 0）轮廓 ──
    const tops = idxs.filter((i) => depthOf[i] === 0)
    let pn = 0
    for (const i of tops) {
      pn++
      // 岛检测：有其他轮廓匿喺入面 → v1 唔识避，照挖但提醒
      if (idxs.some((j) => j !== i && pointInPoly(loops[j][0], loops[i]))) {
        warn(`挖槽 ${pn}: 岛屿未避让 — v1 挖槽净支持无岛轮廓`)
      }
      const lp = toCCWLoop(profiles[i], loops[i])
      const rings: Loop[] = []
      try {
        const o2 = offsetPath(lp.verts, lp.bulges, -r) // 边界环 = 向内偏 toolD/2
        rings.push({ verts: o2.verts as Pt[], bulges: o2.bulges })
      } catch {
        warn(`挖槽 ${pn} 细过刀径 Ø${fmt(opts.toolD)} — 已跳过`)
        continue
      }
      // 逐次再向内偏 stepover 直到塌陷。停环规则（v1）：环嘅刀内缘
      // （inset + toolD/2）都仲偏得郁先收呢个环 — 即最内环刀内缘唔越过槽中心。
      // （边界环本身唔受呢条规管：窄 slot 净得一条边界环都要出。）
      for (let k = 1; ; k++) {
        const din = r + k * stepover
        let ring: Loop
        try {
          const o2 = offsetPath(lp.verts, lp.bulges, -din)
          ring = { verts: o2.verts as Pt[], bulges: o2.bulges }
        } catch { break }
        try { offsetPath(lp.verts, lp.bulges, -(din + r)) } catch { break }
        rings.push(ring)
      }
      warn('直插下刀 — 铝/亚克力建议细 stepdown')
      const inner = rings[rings.length - 1]
      zs.forEach((z, li) => {
        st.L.push(`(挖槽 ${pn}/${tops.length} 第 ${li + 1}/${zs.length} 层 Z${fmt(z)} 环×${rings.length})`)
        st.L.push(`G0 Z${fmt(opts.safeZ)}`)
        st.L.push(`G0 ${xy(inner.verts[0])}`)
        st.L.push(`G1 Z${fmt(z)}${fw(st, opts.feedZ)}`) // 直插下刀喺最内环起点
        for (let q = rings.length - 1; q >= 0; q--) {   // 由内环切到外环
          st.L.push(`(环 ${rings.length - q}/${rings.length})`)
          if (q < rings.length - 1) st.L.push(`G1 ${xy(rings[q].verts[0])}${fw(st, opts.feedXY)}`) // 环间切深平移
          emitRing(st, rings[q], opts.feedXY)
        }
      })
    }
  } else if (opts.op === 'face') {
    // ── S94 面铣：raster 清【顶层轮廓内部】顶面（平端刀；scan-line 逐行，行内偏 r 留刀半径，zigzag 来回）──
    const tops = idxs.filter((i) => depthOf[i] === 0)
    let fn = 0
    for (const i of tops) {
      fn++
      const poly = loops[i]   // 用清洗后顶点（线性化；面铣对弧不敏感）
      let ymn = Infinity, ymx = -Infinity
      for (const p of poly) { if (p[1] < ymn) ymn = p[1]; if (p[1] > ymx) ymx = p[1] }
      if (!(ymx - ymn > 2 * r)) { warn(`面铣 ${fn}: 轮廓太窄（< 刀径）— 已跳过`); continue }
      // 行 y：由 ymn+r 到 ymx-r，步距 stepover
      const rows: number[] = []
      for (let y = ymn + r; y < ymx - r + 1e-9; y += stepover) rows.push(y)
      if (!rows.length || rows[rows.length - 1] < ymx - r - 1e-9) rows.push(ymx - r)
      zs.forEach((z, li) => {
        st.L.push(`(面铣 ${fn}/${tops.length} 第 ${li + 1}/${zs.length} 层 Z${fmt(z)} ${rows.length}行)`)
        rows.forEach((y, ri) => {
          const xs = scanlineX(poly, y)
          // 配对成内部 span，行内两端各缩 r（留刀半径）；zigzag：奇数行反向
          const spans: [number, number][] = []
          for (let k = 0; k + 1 < xs.length; k += 2) { const a = xs[k] + r, b = xs[k + 1] - r; if (b > a) spans.push([a, b]) }
          const ordered = (ri % 2 === 0) ? spans : spans.slice().reverse()
          for (const [a, b] of ordered) {
            const [x0, x1] = (ri % 2 === 0) ? [a, b] : [b, a]
            st.L.push(`G0 Z${fmt(opts.safeZ)}`, `G0 ${xy([x0, y])}`, `G1 Z${fmt(z)}${fw(st, opts.feedZ)}`, `G1 ${xy([x1, y])}${fw(st, opts.feedXY)}`)
          }
        })
      })
    }
  } else {
    // ── drill 啄钻：净处理圆形 profile 且 Ø ≤ drillMaxD 且 Ø ≤ toolD×1.05（位置钻）──
    const canned = opts.post === 'canned'
    const holes: Pt[] = []
    let dn = 0
    profiles.forEach((p, i) => {
      if (!valid[i]) return
      const circ = circleOf(p)
      if (!circ) { warn(`轮廓 ${i + 1} 非圆形 — drill 净支持圆, 已跳过`); return }
      if (circ.dia > drillMaxD + 1e-9) { warn(`Ø${fmt(circ.dia)} 大过 drillMaxD Ø${fmt(drillMaxD)} — 已跳过`); return }
      if (circ.dia > opts.toolD * 1.05 + 1e-9) {
        warn(`Ø${fmt(circ.dia)} 大过刀径 Ø${fmt(opts.toolD)}（位置钻净啱 ≤ ×1.05）— 请改 op:'contour' 当孔铣`)
        return
      }
      dn++
      if (canned) holes.push(circ.c)
      else emitDrill(st, circ.c, zs, opts, `钻 ${dn} Ø${fmt(circ.dia)} X${fmt(circ.c[0])} Y${fmt(circ.c[1])} 啄×${zs.length}`)
    })
    if (canned && holes.length) { emitDrillCanned(st, holes, opts); warn('canned 模式输出 G81/G83 — GRBL 唔识，要 Fanuc/Haas 等工业控制器') }
  }

  // 尾：升安全高 → 熄主轴 → 完
  st.L.push(`G0 Z${fmt(opts.safeZ)}`, 'M5', 'M2')
  return { gcode: st.L.join('\n') + '\n', warnings }
}
