// 激光切割 G-code 导出 — GRBL 方言（M3/M5 激光开关 + S 功率字 0–1000，G21 mm，G90 绝对坐标）。
// Imports only the pure sketchOps module (bulge math) — store / worker / node(tsx) tests all fine.
//
// T737 真圆弧输出：profile 带 verts/bulges（T724 bulge 路径）时——kerf 用解析 offsetPath（直段平移、
// 弧 R±kerf、相切保持，唔再系折线 miter 近似），输出 G2（bulge>0 凸左=绕心顺时针）/ G3（bulge<0）
// 带 I,J 圆心字 —— slot/圆角/圆切出嚟系真弧（控制器插补），文件细、边缘滑。
//
// Pipeline:
//   1. clean every closed profile (drop consecutive-duplicate points + a duplicated closing point)
//   2. classify outer-vs-hole: even-odd containment depth — a representative point of the
//      profile tested (point-in-polygon, even-odd ray cast) against every OTHER profile;
//      odd depth → hole. (Island inside a hole inside an outer = depth 2 → outer again.)
//      The representative point is a VERTEX of the loop, not the centroid: for an annular
//      part (20mm plate with a centred hole) the outer's centroid falls inside its own hole
//      and a centroid test would misclassify the outer as a hole. Profiles never cross, so
//      any point on the loop itself classifies containment correctly.
//   3. normalise each loop CCW (shoelace sign), then kerf-compensate: kerf = beam HALF-width.
//      The beam removes `kerf` mm of material each side of the path, so OUTERS are offset
//      OUTWARD by kerf and HOLES INWARD — the finished part keeps its nominal dimensions.
//      Offset is a per-vertex angle-bisector move with the miter length clamped to 4×kerf
//      (sharp spikes would otherwise shoot the vertex out to kerf/sin(θ/2) → ∞).
//      A hole whose inward offset collapses it is dropped and replaced by a comment line so
//      nothing burns a wrong path. Collapse detection: signed area ≤ ~0 (loop turned into a
//      bowtie / inside-out) OR any offset edge REVERSING direction vs its original edge —
//      the latter is required because a symmetric hole over-offset everts by point
//      reflection, which preserves orientation and keeps the area positive.
//   4. emit HOLES FIRST, outers last — inner cuts must happen before the outer cut frees the
//      part from the sheet (after that it can tilt/shift and ruin remaining cuts).
//
// Number format mirrors the DXF exporter's rationale (store.ts dxfNum): clamp |x|<1e-9 → 0 and
// fixed 3 decimals with trailing zeros trimmed — GRBL parses plain decimals, never "1e-15".

import { offsetPath, bulgeCenter, pathPts } from '../sketch/sketchOps'

export type Profile2D = { pts: [number, number][]; verts?: [number, number][]; bulges?: number[] }  // verts+bulges = 真弧路径（T724 凸度惯例：正=凸向行进左侧）；pts 仍用于 分类/绕向

export interface LaserGcodeOpts {
  feed?: number // 切割进给 mm/min（default 600）
  power?: number // 激光功率 S 字 0–1000（default 800，对应 GRBL $30=1000）
  passes?: number // 每个轮廓重复切几道（default 1，厚料多道）
  kerf?: number // 光束半宽 mm（default 0 = 不补偿）
}

type Pt = [number, number]

const fmt = (x: number): string => String(+(Math.abs(x) < 1e-9 ? 0 : x).toFixed(3))

/** Signed area ×1 (shoelace): >0 = CCW, <0 = CW. */
function shoelace(pts: Pt[]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length]
    a += p[0] * q[1] - q[0] * p[1]
  }
  return a / 2
}

/** Even-odd ray-cast point-in-polygon (same algorithm as store.ts pointInPoly). */
function pointInPoly(pt: Pt, pts: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1]
    if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi)) inside = !inside
  }
  return inside
}

/** Drop consecutive duplicate points and a duplicated closing point (loop is implicitly closed). */
function cleanLoop(pts: Pt[]): Pt[] {
  const out: Pt[] = []
  for (const p of pts) {
    const last = out[out.length - 1]
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-9) out.push([p[0], p[1]])
  }
  while (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= 1e-9) out.pop()
  return out
}

/**
 * Polygon offset for a CCW loop: +d moves every vertex OUTWARD, −d inward.
 * Per-vertex angle-bisector move: with unit edge dirs a (in) / b (out) and their outward
 * normals na=(ay,−ax), nb=(by,−bx), the mitered move is m·(2d/|m|²) where m = na+nb
 * (equivalent to the classic d/cos(θ/2) along the unit bisector). Miter clamped to 4|d|.
 */
function offsetLoop(pts: Pt[], d: number): Pt[] {
  const n = pts.length
  const clamp = 4 * Math.abs(d)
  const out: Pt[] = []
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n]
    let ax = p1[0] - p0[0], ay = p1[1] - p0[1]
    const al = Math.hypot(ax, ay) || 1; ax /= al; ay /= al
    let bx = p2[0] - p1[0], by = p2[1] - p1[1]
    const bl = Math.hypot(bx, by) || 1; bx /= bl; by /= bl
    const nax = ay, nay = -ax, nbx = by, nby = -bx // outward normals (CCW keeps interior on the left)
    const mx = nax + nbx, my = nay + nby
    const m2 = mx * mx + my * my
    let vx: number, vy: number
    if (m2 < 1e-12) { vx = nax * d; vy = nay * d } // 180° reversal spike → fall back to edge normal
    else { const k = (2 * d) / m2; vx = mx * k; vy = my * k }
    const vl = Math.hypot(vx, vy)
    if (vl > clamp && vl > 1e-12) { vx = (vx / vl) * clamp; vy = (vy / vl) * clamp } // miter clamp 4×kerf
    out.push([p1[0] + vx, p1[1] + vy])
  }
  return out
}

/**
 * Closed 2D profiles (mm, outers + holes mixed; circles pre-tessellated by the caller)
 * → GRBL laser G-code string. See the module header for kerf / ordering semantics.
 */
export function profilesToGcode(profiles: Profile2D[], opts: LaserGcodeOpts = {}): string {
  const feed = Math.max(1, opts.feed ?? 600)
  const power = Math.round(Math.min(1000, Math.max(0, opts.power ?? 800)))
  const passes = Math.max(1, Math.floor(opts.passes ?? 1))
  const kerf = Math.max(0, opts.kerf ?? 0)

  // 1) clean; loops with <3 points carry no cuttable area → skipped (kept in `loops` so
  //    classification indices still line up with the caller's profile order).
  const loops = profiles.map((p) => cleanLoop(p.pts))
  const valid = loops.map((l) => l.length >= 3)

  // 2) classify by even-odd containment depth of a representative point against every OTHER
  //    loop. The point is the loop's first VERTEX (see module header: an annular outer's
  //    centroid sits inside its own hole and would misclassify).
  const isHole = loops.map((l, i) => {
    if (!valid[i]) return false
    const c = l[0]
    let depth = 0
    for (let j = 0; j < loops.length; j++) if (j !== i && valid[j] && pointInPoly(c, loops[j])) depth++
    return depth % 2 === 1
  })

  // 3) normalise CCW + kerf offset; detect collapsed holes.
  type Item = { pts: Pt[]; hole: boolean; dropped: boolean; verts?: Pt[]; bulges?: number[] }
  const items: Item[] = []
  for (let i = 0; i < loops.length; i++) {
    if (!valid[i]) continue
    // ── 真弧路径（T737）：kerf 用解析 offsetPath（弧 R±kerf 精确、相切保持），输出段级 G2/G3 ──
    const tp = profiles[i]
    if (tp.verts && tp.bulges && tp.verts.length >= 2) {
      let v = tp.verts.map((p) => [p[0], p[1]] as Pt), b = [...tp.bulges]
      // 绕向统一 CCW（密铺 shoelace 判定；reverse 闭环 = 顶点倒序 + bulge 重排取负）
      if (shoelace(loops[i]) < 0) {
        const n = v.length
        const rv = [...v].reverse()
        const rb = rv.map((_, j) => -(b[(n - 2 - j + n) % n] || 0))
        v = rv; b = rb
      }
      let dropped = false
      if (kerf > 0) {
        try { const o = offsetPath(v, b, isHole[i] ? -kerf : kerf); v = o.verts as Pt[]; b = o.bulges } catch { dropped = true }  // 内偏移塌缩 → 诚实跳过
      }
      items.push({ pts: dropped ? loops[i] : (pathPts(v, b) as Pt[]), hole: isHole[i], dropped, verts: v, bulges: b })
      continue
    }
    let pts = shoelace(loops[i]) < 0 ? [...loops[i]].reverse() : loops[i]
    let dropped = false
    if (kerf > 0) {
      const off = offsetLoop(pts, isHole[i] ? -kerf : kerf)
      // Collapsed-hole check (outward offsets only grow — no check needed):
      //  a) area ≤ ~0: loop crossed itself into a bowtie / flipped orientation;
      //  b) edge reversal: a valid inward offset keeps every edge pointing the same way —
      //     a hole narrower than 2×kerf everts (point reflection keeps area POSITIVE, so
      //     the area test alone misses it) and its edges reverse direction.
      // A partially-too-narrow hole (e.g. one thin limb of an L-slot) also trips (b) and
      // drops whole — resolving partial collapses needs a real polygon clipper (out of scope).
      if (isHole[i]) {
        if (shoelace(off) < 1e-6) dropped = true
        else for (let k = 0; k < pts.length && !dropped; k++) {
          const k2 = (k + 1) % pts.length
          const ex = pts[k2][0] - pts[k][0], ey = pts[k2][1] - pts[k][1]
          const fx = off[k2][0] - off[k][0], fy = off[k2][1] - off[k][1]
          if (ex * fx + ey * fy < 0) dropped = true
        }
      }
      if (!dropped) pts = off
    }
    items.push({ pts, hole: isHole[i], dropped })
  }

  // 4) holes first, then outers (stable within each group = caller order).
  const ordered = [...items.filter((it) => it.hole), ...items.filter((it) => !it.hole)]

  // 5) emit.
  const L: string[] = []
  L.push(
    '; webcad laser',
    `; GRBL · 单位 mm (G21) · 绝对坐标 (G90) · F${fmt(feed)} mm/min · S${power}/1000 · ${passes} 道 · kerf ${fmt(kerf)} mm（光束半宽）`,
    '; 先切孔后切外轮廓（避免工件先脱落）',
    'G21',
    'G90',
  )
  if (!ordered.length) L.push('; 无有效轮廓')
  ordered.forEach((it, idx) => {
    if (it.dropped) { L.push('; 孔太细 kerf 后消失，已跳过'); return }
    const label = it.hole ? '孔' : '外轮廓'
    for (let pass = 1; pass <= passes; pass++) {
      L.push(`; ${label} ${idx + 1}/${ordered.length}${passes > 1 ? ` · 第 ${pass}/${passes} 道` : ''}`)
      if (it.verts && it.bulges) {
        // 真弧发射（T737）：直段 G1；弧段 G2（bulge>0 凸左=绕心 CW）/ G3（凸右），I,J = 圆心 − 段起点
        const vs = it.verts, bs = it.bulges, n = vs.length
        L.push(`G0 X${fmt(vs[0][0])} Y${fmt(vs[0][1])}`)
        L.push(`M3 S${power}`)
        for (let k = 0; k < n; k++) {
          const a = vs[k], bpt = vs[(k + 1) % n], bu = bs[k] || 0
          const fWord = k === 0 ? ` F${fmt(feed)}` : ''
          if (Math.abs(bu) < 1e-9 || Math.hypot(bpt[0] - a[0], bpt[1] - a[1]) < 1e-9) {
            L.push(`G1 X${fmt(bpt[0])} Y${fmt(bpt[1])}${fWord}`)
          } else {
            const c = bulgeCenter(a, bpt, bu)
            L.push(`${bu > 0 ? 'G2' : 'G3'} X${fmt(bpt[0])} Y${fmt(bpt[1])} I${fmt(c[0] - a[0])} J${fmt(c[1] - a[1])}${fWord}`)
          }
        }
        L.push('M5')
        continue
      }
      const p0 = it.pts[0]
      L.push(`G0 X${fmt(p0[0])} Y${fmt(p0[1])}`)
      L.push(`M3 S${power}`)
      for (let k = 1; k < it.pts.length; k++) {
        const p = it.pts[k]
        L.push(`G1 X${fmt(p[0])} Y${fmt(p[1])}${k === 1 ? ` F${fmt(feed)}` : ''}`)
      }
      L.push(`G1 X${fmt(p0[0])} Y${fmt(p0[1])}`) // close the loop back to the start point
      L.push('M5')
    }
  })
  L.push('G0 X0 Y0', 'M5', 'M2') // park at origin; trailing M5 is a safety re-assert before M2
  return L.join('\n') + '\n'
}

/**
 * Parse a G-code string back into quick stats (verification + UI readout):
 * `lines` = non-empty lines (comments included) · `cutLen` = total G1 path length in mm
 * (modal X/Y carry over, G90 absolute, start assumed at origin) · `rapids` = G0 count.
 */
export function gcodeStats(g: string): { lines: number; cutLen: number; rapids: number; arcs: number } {
  let lines = 0, cutLen = 0, rapids = 0, arcs = 0, x = 0, y = 0
  const TAU = Math.PI * 2
  for (const raw of g.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    lines++
    if (line.startsWith(';')) continue
    const g0 = /^G0?0(?:\s|$)/i.test(line), g1 = /^G0?1(?:\s|$)/i.test(line)
    const g2 = /^G0?2(?:\s|$)/i.test(line), g3 = /^G0?3(?:\s|$)/i.test(line)
    if (!g0 && !g1 && !g2 && !g3) continue
    const mx = /(?:^|\s)X(-?\d*\.?\d+)/i.exec(line), my = /(?:^|\s)Y(-?\d*\.?\d+)/i.exec(line)
    const nx = mx ? parseFloat(mx[1]) : x
    const ny = my ? parseFloat(my[1]) : y
    if (g0) rapids++
    else if (g2 || g3) {
      // 弧长 = R·θ（I,J 圆心相对段起点；G2 顺时针 / G3 逆时针；起终重合 → 整圆）
      const mi = /(?:^|\s)I(-?\d*\.?\d+)/i.exec(line), mj = /(?:^|\s)J(-?\d*\.?\d+)/i.exec(line)
      const cx = x + (mi ? parseFloat(mi[1]) : 0), cy = y + (mj ? parseFloat(mj[1]) : 0)
      const R = Math.hypot(x - cx, y - cy)
      if (R > 1e-9) {
        const a0 = Math.atan2(y - cy, x - cx), a1 = Math.atan2(ny - cy, nx - cx)
        let th = g2 ? (a0 - a1 + TAU) % TAU : (a1 - a0 + TAU) % TAU
        if (th < 1e-9) th = TAU  // 起终同点 = 整圆
        cutLen += R * th
        arcs++
      }
    }
    else cutLen += Math.hypot(nx - x, ny - y)
    x = nx; y = ny
  }
  return { lines, cutLen, rapids, arcs }
}
