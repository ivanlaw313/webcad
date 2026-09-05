// minDistance.ts — 两个三角网格之间的【最小间隙 / 净空 clearance】（对标 Fusion「检查 Inspect →
// 测量 Measure」的「间隙 clearance」与「干涉 interference gap」最近距离读数）。
//
// 给两堆三角汤（triangle soup，不要求闭合/连通），返回它们的【最近接近】：最短欧氏距离 dist，
// 以及实现该距离的一对最近点 pA（在网格 A 上）、pB（在网格 B 上）。重叠/相切 → dist = 0。
//
// 数学（精确、闭式，非采样）：两个实心/壳体三角网格之间的最小距离 = 所有三角形对之间最小距离的最小值。
// 而【两个三角形之间】的最小距离，由以下两类情形覆盖（这是凸多面体最近点的标准事实）：
//   (a) 一个三角形的某【顶点】到另一个三角形【内部/边/角】最近 —— 点到三角形 closestPointOnTri；
//   (b) 两个三角形各取一条【边】，两线段最近（边-边斜交）—— segSegDist。
// 取 6 个「顶点↔三角形」距离 + 9 个「边↔边」距离 的最小者，即两三角形最小距离。对【不相交】的两个
// 三角形这是充分且必要的；若它们【相交】（穿插），最近距离应为 0 —— 我哋用 triTriIntersect 单独判，
// 命中即 dist=0（避免「最近点」逻辑在穿插时给出非零的边界-边界距离）。
//
// 性能：朴素是 O(nA·nB) 个三角形对。我哋用【每三角形 AABB + 全局下界剪枝】把它压下来 —— 先算 A、B
// 各自所有三角的 AABB；维护一个「当前已知最优距离 best」；对每个 A 三角，先用「A三角AABB ↔ B三角AABB
// 的轴向间隙下界」快速否决：若该下界 ≥ best 就跳过整对（AABB 间隙是真实最小距离的【下界】，所以剪枝
// 安全，绝不漏掉更近的对）。再叠一层：每个 A 三角先与 B 的【整体包围盒】比一次，B 整体都比 best 远就跳过
// 该 A 三角的全部 B 对。这令分离较远的网格远快于 O(nA·nB)；正确性不依赖剪枝（剪枝只是跳过不可能更优者）。
//
// 纯函数、零 import、无副作用、唔掂 React/store/worker —— 任何模块（页面 / worker / Node 校验脚本）
// 都可安全引用。无 GPL/AGPL 来源；全部自写标准向量几何。
//
// 单位：跟随输入坐标（webcad 内部 mm）。顶点是扁平 [x,y,z, x,y,z, ...]；三角是扁平索引（每 3 个为一个
// 三角，指向顶点编号，非浮点偏移）。

export type Vec3 = [number, number, number]

export interface MinDistResult {
  dist: number      // 最小欧氏距离（≥0；重叠/相切为 0）
  pA: Vec3          // 网格 A 上实现该距离的最近点
  pB: Vec3          // 网格 B 上实现该距离的最近点
}

// ───────────────────────────────────────────────────────────── 基础向量小工具（内联以省 GC）

// 点 P 到三角形 (a,b,c) 的最近点（Ericson《Real-Time Collision Detection》经典 voronoi-region 解法，
// 全部代数、无开方分支）。写入 out=[x,y,z]，返回平方距离（开方留给调用方，省 sqrt）。
function closestPtTriSq(
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
  out: Vec3,
): number {
  // 边向量
  const abx = bx - ax, aby = by - ay, abz = bz - az
  const acx = cx - ax, acy = cy - ay, acz = cz - az
  const apx = px - ax, apy = py - ay, apz = pz - az

  const d1 = abx * apx + aby * apy + abz * apz
  const d2 = acx * apx + acy * apy + acz * apz
  // 顶点 A 的 voronoi 区
  if (d1 <= 0 && d2 <= 0) { out[0] = ax; out[1] = ay; out[2] = az; return dist2(px, py, pz, ax, ay, az) }

  const bpx = px - bx, bpy = py - by, bpz = pz - bz
  const d3 = abx * bpx + aby * bpy + abz * bpz
  const d4 = acx * bpx + acy * bpy + acz * bpz
  // 顶点 B 的 voronoi 区
  if (d3 >= 0 && d4 <= d3) { out[0] = bx; out[1] = by; out[2] = bz; return dist2(px, py, pz, bx, by, bz) }

  // 边 AB 的 voronoi 区
  const vc = d1 * d4 - d3 * d2
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3)
    out[0] = ax + v * abx; out[1] = ay + v * aby; out[2] = az + v * abz
    return dist2(px, py, pz, out[0], out[1], out[2])
  }

  const cpx = px - cx, cpy = py - cy, cpz = pz - cz
  const d5 = abx * cpx + aby * cpy + abz * cpz
  const d6 = acx * cpx + acy * cpy + acz * cpz
  // 顶点 C 的 voronoi 区
  if (d6 >= 0 && d5 <= d6) { out[0] = cx; out[1] = cy; out[2] = cz; return dist2(px, py, pz, cx, cy, cz) }

  // 边 AC 的 voronoi 区
  const vb = d5 * d2 - d1 * d6
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6)
    out[0] = ax + w * acx; out[1] = ay + w * acy; out[2] = az + w * acz
    return dist2(px, py, pz, out[0], out[1], out[2])
  }

  // 边 BC 的 voronoi 区
  const va = d3 * d6 - d5 * d4
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6))
    out[0] = bx + w * (cx - bx); out[1] = by + w * (cy - by); out[2] = bz + w * (cz - bz)
    return dist2(px, py, pz, out[0], out[1], out[2])
  }

  // 面内部（重心坐标）
  const sden = va + vb + vc
  if (!(Math.abs(sden) > 1e-12)) { out[0] = (ax + bx + cx) / 3; out[1] = (ay + by + cy) / 3; out[2] = (az + bz + cz) / 3; return dist2(px, py, pz, out[0], out[1], out[2]) }   // bt4: 退化三角(共线/重合)→ denom 0 → NaN;退回质心
  const denom = 1 / sden
  const v = vb * denom
  const w = vc * denom
  out[0] = ax + abx * v + acx * w
  out[1] = ay + aby * v + acy * w
  out[2] = az + abz * v + acz * w
  return dist2(px, py, pz, out[0], out[1], out[2])
}

function dist2(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const dx = ax - bx, dy = ay - by, dz = az - bz
  return dx * dx + dy * dy + dz * dz
}

// 两线段 P=[p1,p2], Q=[q1,q2] 之间的最小【平方距离】，并把各自最近点写到 cP / cQ。
// 标准 Ericson clamped-parametric 解法：处理平行、退化、端点钳制等全部情形。
function segSegSq(
  p1x: number, p1y: number, p1z: number, p2x: number, p2y: number, p2z: number,
  q1x: number, q1y: number, q1z: number, q2x: number, q2y: number, q2z: number,
  cP: Vec3, cQ: Vec3,
): number {
  const dx1 = p2x - p1x, dy1 = p2y - p1y, dz1 = p2z - p1z   // 段 P 方向 d1
  const dx2 = q2x - q1x, dy2 = q2y - q1y, dz2 = q2z - q1z   // 段 Q 方向 d2
  const rx = p1x - q1x, ry = p1y - q1y, rz = p1z - q1z
  const a = dx1 * dx1 + dy1 * dy1 + dz1 * dz1   // |d1|²
  const e = dx2 * dx2 + dy2 * dy2 + dz2 * dz2   // |d2|²
  const f = dx2 * rx + dy2 * ry + dz2 * rz

  let s: number, t: number
  const EPS = 1e-12
  if (a <= EPS && e <= EPS) {
    // 两段都退化成点
    s = 0; t = 0
  } else if (a <= EPS) {
    // 段 P 退化成点
    s = 0
    t = clamp01(f / e)
  } else {
    const c = dx1 * rx + dy1 * ry + dz1 * rz
    if (e <= EPS) {
      // 段 Q 退化成点
      t = 0
      s = clamp01(-c / a)
    } else {
      // 一般情形：两条非退化线段
      const b = dx1 * dx2 + dy1 * dy2 + dz1 * dz2
      const denom = a * e - b * b   // ≥0；=0 表示平行
      if (denom > EPS) {
        s = clamp01((b * f - c * e) / denom)
      } else {
        s = 0   // 平行：任取 s=0，下面靠 t 钳制求出最近
      }
      t = (b * s + f) / e
      if (t < 0) { t = 0; s = clamp01(-c / a) }
      else if (t > 1) { t = 1; s = clamp01((b - c) / a) }
    }
  }
  cP[0] = p1x + dx1 * s; cP[1] = p1y + dy1 * s; cP[2] = p1z + dz1 * s
  cQ[0] = q1x + dx2 * t; cQ[1] = q1y + dy2 * t; cQ[2] = q1z + dz2 * t
  return dist2(cP[0], cP[1], cP[2], cQ[0], cQ[1], cQ[2])
}

function clamp01(x: number): number { return x < 0 ? 0 : x > 1 ? 1 : x }

// ───────────────────────────────────────────────────────────── 三角-三角 相交判定（用于穿插→dist 0）

// 三角形 (a,b,c) 与 (d,e,f) 是否相交？Möller 区间重叠法的精简实现：先用各自所在平面把对方三角的
// 三个顶点做符号距离测试，若一方三顶点全在另一方平面同侧（且非共面）→ 必不相交，直接 false。否则落到
// 共面/交线区间检测。对我哋的用途（穿插即返 0）足够稳健；纯分离的对早被这层「同侧」快速否掉。
function triTriIntersect(
  ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number,
  dx: number, dy: number, dz: number, ex: number, ey: number, ez: number, fx: number, fy: number, fz: number,
): boolean {
  // 三角 2 所在平面 N2·X + d2 = 0
  const n2x = (ex - dx), n2y = (ey - dy), n2z = (ez - dz)
  const m2x = (fx - dx), m2y = (fy - dy), m2z = (fz - dz)
  const N2x = n2y * m2z - n2z * m2y, N2y = n2z * m2x - n2x * m2z, N2z = n2x * m2y - n2y * m2x
  const d2 = -(N2x * dx + N2y * dy + N2z * dz)
  let da = N2x * ax + N2y * ay + N2z * az + d2
  let db = N2x * bx + N2y * by + N2z * bz + d2
  let dc = N2x * cx + N2y * cy + N2z * cz + d2
  const EPS = 1e-9
  if (Math.abs(da) < EPS) da = 0
  if (Math.abs(db) < EPS) db = 0
  if (Math.abs(dc) < EPS) dc = 0
  if ((da > 0 && db > 0 && dc > 0) || (da < 0 && db < 0 && dc < 0)) return false  // T1 全在 T2 平面一侧

  // 三角 1 所在平面 N1·X + d1 = 0
  const n1x = (bx - ax), n1y = (by - ay), n1z = (bz - az)
  const m1x = (cx - ax), m1y = (cy - ay), m1z = (cz - az)
  const N1x = n1y * m1z - n1z * m1y, N1y = n1z * m1x - n1x * m1z, N1z = n1x * m1y - n1y * m1x
  const d1 = -(N1x * ax + N1y * ay + N1z * az)
  let dd = N1x * dx + N1y * dy + N1z * dz + d1
  let de = N1x * ex + N1y * ey + N1z * ez + d1
  let df = N1x * fx + N1y * fy + N1z * fz + d1
  if (Math.abs(dd) < EPS) dd = 0
  if (Math.abs(de) < EPS) de = 0
  if (Math.abs(df) < EPS) df = 0
  if ((dd > 0 && de > 0 && df > 0) || (dd < 0 && de < 0 && df < 0)) return false  // T2 全在 T1 平面一侧

  // 共面情形（两平面法向平行且都贴合）：保守地交给「最近点」逻辑——共面相交时最近点距离本就 ~0，
  // 不会误报正间隙；这里只需对【真正穿插】返回 true，故继续做交线区间检测。
  // 交线方向 D = N1 × N2
  const Dx = N1y * N2z - N1z * N2y, Dy = N1z * N2x - N1x * N2z, Dz = N1x * N2y - N1y * N2x
  const dLen2 = Dx * Dx + Dy * Dy + Dz * Dz
  if (dLen2 < EPS) return false   // 平面平行（含共面）：留给最近点逻辑，不在此判 true

  // 把每个三角的三顶点投影到交线方向 D 上，求各自与交线的相交【区间】，看两区间是否重叠。
  // 投影标量 = D·X（沿交线的一维坐标）。
  const pa = Dx * ax + Dy * ay + Dz * az
  const pb = Dx * bx + Dy * by + Dz * bz
  const pc = Dx * cx + Dy * cy + Dz * cz
  const pd = Dx * dx + Dy * dy + Dz * dz
  const pe = Dx * ex + Dy * ey + Dz * ez
  const pf = Dx * fx + Dy * fy + Dz * fz

  const i1 = triLineInterval(pa, pb, pc, da, db, dc)
  const i2 = triLineInterval(pd, pe, pf, dd, de, df)
  if (!i1 || !i2) return false
  // 两区间 [i1lo,i1hi] 与 [i2lo,i2hi] 是否重叠
  return i1[0] <= i2[1] + EPS && i2[0] <= i1[1] + EPS
}

// 给三角的三顶点沿交线的投影标量 (p0,p1,p2) 与它们到另一平面的符号距离 (s0,s1,s2)，求该三角与交线相交
// 的标量区间 [lo,hi]。两条「异号顶点对」的边各贡献一个交点。返回 null 表示三顶点同号（不与交线相交）。
function triLineInterval(
  p0: number, p1: number, p2: number, s0: number, s1: number, s2: number,
): [number, number] | null {
  const xs: number[] = []
  edgeCross(p0, p1, s0, s1, xs)
  edgeCross(p1, p2, s1, s2, xs)
  edgeCross(p2, p0, s2, s0, xs)
  if (xs.length < 2) return null
  let lo = xs[0], hi = xs[0]
  for (let i = 1; i < xs.length; i++) { if (xs[i] < lo) lo = xs[i]; if (xs[i] > hi) hi = xs[i] }
  return [lo, hi]
}

// 若边 (pa,pb) 的两端符号距离 (sa,sb) 异号（跨平面），按线性插值求其与交线的投影标量并 push。
function edgeCross(pa: number, pb: number, sa: number, sb: number, out: number[]): void {
  if ((sa > 0 && sb > 0) || (sa < 0 && sb < 0)) return  // 同号：此边不跨平面
  if (sa === sb) return                                  // 都为 0 的退化边：跳过（共面情形已另处理）
  const t = sa / (sa - sb)
  out.push(pa + t * (pb - pa))
}

// ───────────────────────────────────────────────────────────── 每三角 AABB（剪枝用）

interface TriAABB {
  minx: number; miny: number; minz: number
  maxx: number; maxy: number; maxz: number
}

// 沿每轴的「AABB 间隙」平方下界：若两盒在某轴上分离 g，则真实最小距离 ≥ g（其余轴只会更大）。
// 取各轴间隙的平方和即为两 AABB 之间最近点的平方距离 —— 它是【真实三角-三角距离的下界】，故可安全剪枝。
function aabbGapSq(p: TriAABB, q: TriAABB): number {
  let g = 0
  let d = p.minx - q.maxx; if (d > 0) g += d * d; else { d = q.minx - p.maxx; if (d > 0) g += d * d }
  d = p.miny - q.maxy; if (d > 0) g += d * d; else { d = q.miny - p.maxy; if (d > 0) g += d * d }
  d = p.minz - q.maxz; if (d > 0) g += d * d; else { d = q.minz - p.maxz; if (d > 0) g += d * d }
  return g
}

// 点 (x,y,z) 到一个 AABB 的平方距离下界（用于「单个 A 三角 ↔ B 整体盒」的快速否决）。
function pointAabbGapSq(
  minx: number, miny: number, minz: number, maxx: number, maxy: number, maxz: number,
  q: TriAABB,
): number {
  let g = 0
  let d = minx - q.maxx; if (d > 0) g += d * d; else { d = q.minx - maxx; if (d > 0) g += d * d }
  d = miny - q.maxy; if (d > 0) g += d * d; else { d = q.miny - maxy; if (d > 0) g += d * d }
  d = minz - q.maxz; if (d > 0) g += d * d; else { d = q.minz - maxz; if (d > 0) g += d * d }
  return g
}

// 预算所有三角的 AABB，并顺带得到整堆的总包围盒。
function buildTriAABBs(v: ArrayLike<number>, t: ArrayLike<number>): { boxes: TriAABB[]; whole: TriAABB } {
  const boxes: TriAABB[] = []
  const whole: TriAABB = {
    minx: Infinity, miny: Infinity, minz: Infinity,
    maxx: -Infinity, maxy: -Infinity, maxz: -Infinity,
  }
  for (let i = 0; i < t.length; i += 3) {
    const ia = t[i] * 3, ib = t[i + 1] * 3, ic = t[i + 2] * 3
    const ax = v[ia], ay = v[ia + 1], az = v[ia + 2]
    const bx = v[ib], by = v[ib + 1], bz = v[ib + 2]
    const cx = v[ic], cy = v[ic + 1], cz = v[ic + 2]
    const box: TriAABB = {
      minx: Math.min(ax, bx, cx), miny: Math.min(ay, by, cy), minz: Math.min(az, bz, cz),
      maxx: Math.max(ax, bx, cx), maxy: Math.max(ay, by, cy), maxz: Math.max(az, bz, cz),
    }
    boxes.push(box)
    if (box.minx < whole.minx) whole.minx = box.minx
    if (box.miny < whole.miny) whole.miny = box.miny
    if (box.minz < whole.minz) whole.minz = box.minz
    if (box.maxx > whole.maxx) whole.maxx = box.maxx
    if (box.maxy > whole.maxy) whole.maxy = box.maxy
    if (box.maxz > whole.maxz) whole.maxz = box.maxz
  }
  return { boxes, whole }
}

// ───────────────────────────────────────────────────────────── 两三角形最小距离（平方）

const _tmp1: Vec3 = [0, 0, 0]
const _tmp2: Vec3 = [0, 0, 0]
const _cp: Vec3 = [0, 0, 0]
const _cq: Vec3 = [0, 0, 0]

// 两个三角形之间的最小【平方】距离，并把最近点对写入 outA / outB。
// 先判相交（穿插→0，最近点取交线上一对，这里简单取两形心连线钳制不重要，距离 0 才是关键），
// 否则取 6 个「顶点↔三角形」+ 9 个「边↔边」中的最小者。
function triTriMinSq(
  ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number,
  dx: number, dy: number, dz: number, ex: number, ey: number, ez: number, fx: number, fy: number, fz: number,
  outA: Vec3, outB: Vec3,
): number {
  let best = Infinity

  // (a) A 的 3 顶点 → 三角 B
  let s = closestPtTriSq(ax, ay, az, dx, dy, dz, ex, ey, ez, fx, fy, fz, _tmp1)
  if (s < best) { best = s; outA[0] = ax; outA[1] = ay; outA[2] = az; outB[0] = _tmp1[0]; outB[1] = _tmp1[1]; outB[2] = _tmp1[2] }
  s = closestPtTriSq(bx, by, bz, dx, dy, dz, ex, ey, ez, fx, fy, fz, _tmp1)
  if (s < best) { best = s; outA[0] = bx; outA[1] = by; outA[2] = bz; outB[0] = _tmp1[0]; outB[1] = _tmp1[1]; outB[2] = _tmp1[2] }
  s = closestPtTriSq(cx, cy, cz, dx, dy, dz, ex, ey, ez, fx, fy, fz, _tmp1)
  if (s < best) { best = s; outA[0] = cx; outA[1] = cy; outA[2] = cz; outB[0] = _tmp1[0]; outB[1] = _tmp1[1]; outB[2] = _tmp1[2] }

  // (b) B 的 3 顶点 → 三角 A
  s = closestPtTriSq(dx, dy, dz, ax, ay, az, bx, by, bz, cx, cy, cz, _tmp2)
  if (s < best) { best = s; outB[0] = dx; outB[1] = dy; outB[2] = dz; outA[0] = _tmp2[0]; outA[1] = _tmp2[1]; outA[2] = _tmp2[2] }
  s = closestPtTriSq(ex, ey, ez, ax, ay, az, bx, by, bz, cx, cy, cz, _tmp2)
  if (s < best) { best = s; outB[0] = ex; outB[1] = ey; outB[2] = ez; outA[0] = _tmp2[0]; outA[1] = _tmp2[1]; outA[2] = _tmp2[2] }
  s = closestPtTriSq(fx, fy, fz, ax, ay, az, bx, by, bz, cx, cy, cz, _tmp2)
  if (s < best) { best = s; outB[0] = fx; outB[1] = fy; outB[2] = fz; outA[0] = _tmp2[0]; outA[1] = _tmp2[1]; outA[2] = _tmp2[2] }

  // (c) A 的 3 条边 × B 的 3 条边 = 9 个边-边
  const ea: number[][] = [[ax, ay, az, bx, by, bz], [bx, by, bz, cx, cy, cz], [cx, cy, cz, ax, ay, az]]
  const eb: number[][] = [[dx, dy, dz, ex, ey, ez], [ex, ey, ez, fx, fy, fz], [fx, fy, fz, dx, dy, dz]]
  for (let i = 0; i < 3; i++) {
    const A = ea[i]
    for (let j = 0; j < 3; j++) {
      const B = eb[j]
      s = segSegSq(A[0], A[1], A[2], A[3], A[4], A[5], B[0], B[1], B[2], B[3], B[4], B[5], _cp, _cq)
      if (s < best) {
        best = s
        outA[0] = _cp[0]; outA[1] = _cp[1]; outA[2] = _cp[2]
        outB[0] = _cq[0]; outB[1] = _cq[1]; outB[2] = _cq[2]
      }
    }
  }

  // (d) 穿插判定：若两三角真相交，最小距离应为 0（上面的边界-边界最近点会给一个非零的「擦边」值，
  // 不能用来代表穿插）。命中即把距离压到 0，最近点取两三角形心连线中点附近（距离 0 时具体点不重要）。
  if (best > 0 && triTriIntersect(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, ex, ey, ez, fx, fy, fz)) {
    const mx = (ax + bx + cx) / 3, my = (ay + by + cy) / 3, mz = (az + bz + cz) / 3
    outA[0] = mx; outA[1] = my; outA[2] = mz
    outB[0] = mx; outB[1] = my; outB[2] = mz
    return 0
  }
  return best
}

// ───────────────────────────────────────────────────────────── 主入口

// 两个三角网格之间的最小距离 / 净空。
//   vA/vB  顶点扁平数组 [x,y,z, ...]
//   tA/tB  三角扁平索引 [i0,i1,i2, ...]（指向顶点编号）
// 返回 { dist, pA, pB }：dist 为最短欧氏距离（重叠/相切=0），pA∈A、pB∈B 为实现该距离的最近点对。
// 空网格（任一无三角）→ dist=Infinity（无可测对），最近点退化为原点。
export function minDistanceMeshMesh(
  vA: ArrayLike<number>, tA: ArrayLike<number>,
  vB: ArrayLike<number>, tB: ArrayLike<number>,
): MinDistResult {
  const pA: Vec3 = [0, 0, 0]
  const pB: Vec3 = [0, 0, 0]
  if (tA.length < 3 || tB.length < 3) return { dist: Infinity, pA, pB }

  const A = buildTriAABBs(vA, tA)
  const B = buildTriAABBs(vB, tB)

  let bestSq = Infinity
  const tmpA: Vec3 = [0, 0, 0]
  const tmpB: Vec3 = [0, 0, 0]

  for (let i = 0; i < tA.length; i += 3) {
    const boxA = A.boxes[i / 3]
    // 第一层剪枝：这个 A 三角 vs B 的【整体】包围盒。整体都比已知最优远 → 跳过该 A 三角全部 B 对。
    if (pointAabbGapSq(boxA.minx, boxA.miny, boxA.minz, boxA.maxx, boxA.maxy, boxA.maxz, B.whole) >= bestSq) continue

    const ia = tA[i] * 3, ib = tA[i + 1] * 3, ic = tA[i + 2] * 3
    const ax = vA[ia], ay = vA[ia + 1], az = vA[ia + 2]
    const bx = vA[ib], by = vA[ib + 1], bz = vA[ib + 2]
    const cx = vA[ic], cy = vA[ic + 1], cz = vA[ic + 2]

    for (let j = 0; j < tB.length; j += 3) {
      const boxB = B.boxes[j / 3]
      // 第二层剪枝：A 三角盒 vs B 三角盒 的轴向间隙下界 ≥ 已知最优 → 这对不可能更近，跳过。
      if (aabbGapSq(boxA, boxB) >= bestSq) continue

      const id = tB[j] * 3, ie = tB[j + 1] * 3, iff = tB[j + 2] * 3
      const dx = vB[id], dy = vB[id + 1], dz = vB[id + 2]
      const ex = vB[ie], ey = vB[ie + 1], ez = vB[ie + 2]
      const fx = vB[iff], fy = vB[iff + 1], fz = vB[iff + 2]

      const s = triTriMinSq(
        ax, ay, az, bx, by, bz, cx, cy, cz,
        dx, dy, dz, ex, ey, ez, fx, fy, fz,
        tmpA, tmpB,
      )
      if (s < bestSq) {
        bestSq = s
        pA[0] = tmpA[0]; pA[1] = tmpA[1]; pA[2] = tmpA[2]
        pB[0] = tmpB[0]; pB[1] = tmpB[1]; pB[2] = tmpB[2]
        if (bestSq <= 0) {
          // 已穿插/相切：距离 0 是全局下界，无可能更小，提前收工。
          return { dist: 0, pA, pB }
        }
      }
    }
  }

  return { dist: Math.sqrt(bestSq), pA, pB }
}
