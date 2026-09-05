// sketchOps.ts — T724 bulge-path 纯几何模块 (零依赖, 零 import)
//
// 约定 (DXF LWPOLYLINE bulge 惯例, 按 T724 规格定案):
//   bulge = tan(θ/4), θ = 弧包角 (0 < θ < 2π)
//   bulge > 0 → 弧凸向行进方向 a→b 嘅左侧; bulge < 0 → 右侧; bulge = 0 → 直线段
//   弧上中点 m = midpoint(a,b) + (-dy, dx)·(bulge/2),  (dx,dy) = b - a
//   半径 R = |chord|·(1+bulge²)/(4·|bulge|)
// 闭合路径: verts[i] → verts[(i+1)%n] 为段 i, bulges[i] 属于该段。
// 全部函数纯函数, 唔修改入参。

export type Pt = [number, number];

const EPS = 1e-9;
const TAU = Math.PI * 2;

// ---------- 内部小工具 ----------

function clonePt(p: Pt): Pt {
  return [p[0], p[1]];
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function bulgeOf(bulges: number[], i: number): number {
  const b = bulges[i];
  return typeof b === 'number' && Number.isFinite(b) ? b : 0;
}

/** 弧包角 θ = 4·atan(|bulge|) ∈ (0, 2π) */
export function bulgeTheta(bulge: number): number {
  return 4 * Math.atan(Math.abs(bulge));
}

/** 有向面积 (CCW 为正): verts shoelace + 弧段圆缺修正 */
function signedPathArea(verts: Pt[], bulges: number[]): number {
  const n = verts.length;
  if (n < 2) return 0;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % n];
    area += (a[0] * b[1] - b[0] * a[1]) / 2;
    const bl = bulgeOf(bulges, i);
    if (Math.abs(bl) > EPS && dist(a, b) > EPS) {
      const R = bulgeRadius(a, b, bl);
      const th = bulgeTheta(bl);
      // 圆缺面积 (R²/2)(θ−sinθ); 凸向左 (bulge>0) 喺有向意义下减面积
      area -= Math.sign(bl) * (R * R / 2) * (th - Math.sin(th));
    }
  }
  return area;
}

// ---------- bulge 基础 ----------

/** 弧上中点: m = midpoint(a,b) + (-dy,dx)·(bulge/2); bulge≈0 时退化为弦中点 */
export function bulgeMid(a: Pt, b: Pt, bulge: number): Pt {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return [
    (a[0] + b[0]) / 2 - dy * (bulge / 2),
    (a[1] + b[1]) / 2 + dx * (bulge / 2),
  ];
}

/** 弧半径 R = |chord|·(1+bulge²)/(4·|bulge|); bulge≈0 → Infinity; 零弦 → 0 */
export function bulgeRadius(a: Pt, b: Pt, bulge: number): number {
  if (Math.abs(bulge) < EPS) return Infinity;
  const c = dist(a, b);
  if (c < EPS) return 0;
  return (c * (1 + bulge * bulge)) / (4 * Math.abs(bulge));
}

/** 圆心: 喺弦垂直平分线上, center = mid + (-dy,dx)·(bulge²−1)/(4·bulge)
 *  (bulge=±1 半圆 → 圆心 = 弦中点; |bulge|>1 包角>180° → 圆心同凸侧同边) */
export function bulgeCenter(a: Pt, b: Pt, bulge: number): Pt {
  if (Math.abs(bulge) < EPS) throw new Error('bulge≈0 (直线段) 无圆心');
  if (dist(a, b) < EPS) throw new Error('零弦弧退化, 无圆心');
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const k = (bulge * bulge - 1) / (4 * bulge);
  return [(a[0] + b[0]) / 2 - dy * k, (a[1] + b[1]) / 2 + dx * k];
}

/** 密铺一段: 返回 a 之后直至并包括 b 嘅点列 (唔含 a; 直线段/退化段 = [b]);
 *  弧按包角每 ~maxStep rad (默认 0.12) 一点, 末点取精确 b */
export function tessellateSeg(a: Pt, b: Pt, bulge: number, maxStep?: number): Pt[] {
  const step = typeof maxStep === 'number' && maxStep > 1e-6 ? maxStep : 0.12;
  if (Math.abs(bulge) < EPS || dist(a, b) < EPS) return [clonePt(b)];
  const th = bulgeTheta(bulge);
  let nSteps = Math.ceil(th / step);
  if (nSteps > 10000) nSteps = 10000; // 守卫: 防止极小 maxStep 爆内存
  if (nSteps < 1) nSteps = 1;
  const c = bulgeCenter(a, b, bulge);
  const R = bulgeRadius(a, b, bulge);
  const phiA = Math.atan2(a[1] - c[1], a[0] - c[0]);
  const dir = bulge > 0 ? -1 : 1; // 正 bulge: 绕圆心顺时针 (角度递减)
  const out: Pt[] = [];
  for (let i = 1; i < nSteps; i++) {
    const phi = phiA + dir * th * (i / nSteps);
    out.push([c[0] + R * Math.cos(phi), c[1] + R * Math.sin(phi)]);
  }
  out.push(clonePt(b));
  return out;
}

// ---------- 路径运算 ----------

/** 闭合路径完整密铺: 起点开头, 含闭合段, 不重复终点 (亦去除相邻重复点) */
export function pathPts(verts: Pt[], bulges: number[], maxStep?: number): Pt[] {
  const n = verts.length;
  if (n === 0) return [];
  const out: Pt[] = [clonePt(verts[0])];
  if (n === 1) return out;
  for (let i = 0; i < n; i++) {
    const seg = tessellateSeg(verts[i], verts[(i + 1) % n], bulgeOf(bulges, i), maxStep);
    for (const p of seg) {
      const last = out[out.length - 1];
      if (Math.abs(p[0] - last[0]) > EPS || Math.abs(p[1] - last[1]) > EPS) out.push(p);
    }
  }
  const last = out[out.length - 1];
  if (out.length > 1 && Math.abs(last[0] - out[0][0]) <= EPS && Math.abs(last[1] - out[0][1]) <= EPS) {
    out.pop();
  }
  return out;
}

/** 闭合 Catmull-Rom 样条密铺（流过控制点）— store 创建样条 + freesolve 求解后重铺共用同一份，保 pts 一致（S103[8]）。 */
export function catmullRomClosed(pts: Pt[], perSeg = 12): Pt[] {
  const n = pts.length;
  if (n < 3) return pts;
  const P = (i: number) => pts[((i % n) + n) % n];
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let t = 0; t < perSeg; t++) {
      const s = t / perSeg, s2 = s * s, s3 = s2 * s;
      const x = 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * s + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * s2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * s3);
      const y = 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * s + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * s2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * s3);
      out.push([x, y]);
    }
  }
  return out;
}

/** 开放 Catmull-Rom 样条密铺（流过控制点，端点夹紧、首尾【唔】相连）— 画单一条开放平滑曲线用（S161）。 */
export function catmullRomOpen(pts: Pt[], perSeg = 12): Pt[] {
  const n = pts.length;
  if (n < 3) return pts.map((p) => [p[0], p[1]] as Pt);
  const P = (i: number) => pts[Math.max(0, Math.min(n - 1, i))];   // 夹紧（唔 wrap）→ 端点唔接埋
  const out: Pt[] = [];
  for (let i = 0; i < n - 1; i++) {                                 // 开放：只密铺相邻点之间嘅段
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let t = 0; t < perSeg; t++) {
      const s = t / perSeg, s2 = s * s, s3 = s2 * s;
      const x = 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * s + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * s2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * s3);
      const y = 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * s + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * s2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * s3);
      out.push([x, y]);
    }
  }
  out.push([pts[n - 1][0], pts[n - 1][1]]);                         // 收尾包含最后一个控制点
  return out;
}

/** 闭合路径面积 (有向面积绝对值): verts shoelace + 弧段圆缺解析修正 — 同密铺密度无关 */
export function pathArea(verts: Pt[], bulges: number[]): number {
  return Math.abs(signedPathArea(verts, bulges));
}

// ---------- 镜像 ----------

/** 点对直线 la-lb 反射 */
export function mirrorPt(p: Pt, la: Pt, lb: Pt): Pt {
  const dx = lb[0] - la[0];
  const dy = lb[1] - la[1];
  const L2 = dx * dx + dy * dy;
  if (L2 < EPS * EPS) throw new Error('镜像轴两点重合');
  const t = ((p[0] - la[0]) * dx + (p[1] - la[1]) * dy) / L2;
  const fx = la[0] + t * dx;
  const fy = la[1] + t * dy;
  return [2 * fx - p[0], 2 * fy - p[1]];
}

/** 路径镜像: 逐点反射 + 反转顶点顺序恢复原绕向。
 *  反射使凸侧左右互换 (bulge 取负), 反转行进方向再互换一次 → bulge 数值不变,
 *  只系重新分配到对应段: bulges'[j] = bulges[(n-1-j) % n]。起点保持为原起点嘅镜像。 */
export function mirrorPath(
  verts: Pt[],
  bulges: number[],
  la: Pt,
  lb: Pt,
): { verts: Pt[]; bulges: number[] } {
  const n = verts.length;
  const w = verts.map((v) => mirrorPt(v, la, lb));
  const vertsOut: Pt[] = [];
  const bulgesOut: number[] = [];
  for (let j = 0; j < n; j++) {
    vertsOut.push(w[(n - j) % n]);
    bulgesOut.push(bulgeOf(bulges, (n - 1 - j + n) % n));
  }
  return { verts: vertsOut, bulges: bulgesOut };
}

// ---------- 偏移 ----------

interface OffSeg {
  line: boolean;
  // line: 偏移后无限直线上两点 + 原方向 (校验反向用)
  px: number; py: number; qx: number; qy: number;
  odx: number; ody: number;
  // arc: 同心圆 (圆心不变, 新半径), 原 bulge (含符号) + 原包角
  cx: number; cy: number; r2: number; sgn: number; theta: number; obl: number;
  // 两端点「天然偏移」(直段沿法线平移 / 弧段沿径向缩放) — 作求交参考点
  aox: number; aoy: number; box: number; boy: number;
}

const SELF_X = '偏移太大, 轮廓会自交';

function lineLine(s1: OffSeg, s2: OffSeg): Pt {
  const d1x = s1.qx - s1.px, d1y = s1.qy - s1.py;
  const d2x = s2.qx - s2.px, d2y = s2.qy - s2.py;
  const cr = d1x * d2y - d1y * d2x;
  const scale = Math.hypot(d1x, d1y) * Math.hypot(d2x, d2y);
  if (Math.abs(cr) < 1e-12 * scale + 1e-300) {
    // 平行: 共线 (相邻共线直段) → 直接用端点; 否则退化
    const gap = Math.abs((s2.px - s1.px) * d1y - (s2.py - s1.py) * d1x) / (Math.hypot(d1x, d1y) + 1e-300);
    if (gap < 1e-7) return [s1.qx, s1.qy];
    throw new Error(SELF_X);
  }
  const t = ((s2.px - s1.px) * d2y - (s2.py - s1.py) * d2x) / cr;
  return [s1.px + t * d1x, s1.py + t * d1y];
}

function lineCircle(ln: OffSeg, ar: OffSeg, refx: number, refy: number): Pt {
  let dx = ln.qx - ln.px, dy = ln.qy - ln.py;
  const len = Math.hypot(dx, dy);
  if (len < EPS) throw new Error(SELF_X);
  dx /= len; dy /= len;
  const fx = ln.px - ar.cx, fy = ln.py - ar.cy;
  const m = dx * fx + dy * fy;
  let disc = m * m - (fx * fx + fy * fy - ar.r2 * ar.r2);
  const tol = 1e-7 * (ar.r2 * ar.r2 + fx * fx + fy * fy + 1);
  if (disc < -tol) throw new Error(SELF_X); // 偏移后唔再相交 (失去相切)
  if (disc < 0) disc = 0;
  const rt = Math.sqrt(disc);
  const t1 = -m + rt, t2 = -m - rt;
  const p1: Pt = [ln.px + t1 * dx, ln.py + t1 * dy];
  const p2: Pt = [ln.px + t2 * dx, ln.py + t2 * dy];
  const ref: Pt = [refx, refy];
  return dist(p1, ref) <= dist(p2, ref) ? p1 : p2;
}

function circleCircle(a1: OffSeg, a2: OffSeg, refx: number, refy: number): Pt {
  const dx = a2.cx - a1.cx, dy = a2.cy - a1.cy;
  const dd = Math.hypot(dx, dy);
  const r1 = a1.r2, r2 = a2.r2;
  if (dd < EPS) {
    // 同心: 只有同半径 (同一圆上相邻两弧, 如双弧全圆) 先有意义 → 投影参考点
    if (Math.abs(r1 - r2) > 1e-7 * (r1 + r2 + 1)) throw new Error(SELF_X);
    const vx = refx - a1.cx, vy = refy - a1.cy;
    const vl = Math.hypot(vx, vy);
    if (vl < EPS) throw new Error(SELF_X);
    return [a1.cx + (vx / vl) * r1, a1.cy + (vy / vl) * r1];
  }
  const tol = 1e-7 * (dd + r1 + r2) * (dd + r1 + r2);
  if (dd > r1 + r2 + tol || dd < Math.abs(r1 - r2) - tol) throw new Error(SELF_X);
  const ux = dx / dd, uy = dy / dd;
  const along = (dd * dd + r1 * r1 - r2 * r2) / (2 * dd);
  let h2 = r1 * r1 - along * along;
  if (h2 < 0) h2 = 0;
  const h = Math.sqrt(h2);
  const bx = a1.cx + along * ux, by = a1.cy + along * uy;
  const p1: Pt = [bx - h * uy, by + h * ux];
  const p2: Pt = [bx + h * uy, by - h * ux];
  const ref: Pt = [refx, refy];
  return dist(p1, ref) <= dist(p2, ref) ? p1 : p2;
}

/** 闭合路径偏移: d>0 向外, d<0 向内 (用有向面积判绕向, 同绕向无关)。
 *  直段沿外法线平移; 弧段同心改半径 (包角理论不变 → bulge 不变, 实现上由新端点重算以保精确);
 *  相邻段重新求交 (直-直 miter / 直-弧 / 弧-弧 解析求交取近参考点者);
 *  相切相邻 (slot/rrect) 自然保持相切。退化 (段反向 / 新半径≤0 / 失交) → throw。 */
export function offsetPath(
  verts: Pt[],
  bulges: number[],
  d: number,
): { verts: Pt[]; bulges: number[] } {
  const n = verts.length;
  if (n < 2) throw new Error('路径至少需 2 个顶点');
  if (Math.abs(d) < EPS) {
    return { verts: verts.map(clonePt), bulges: verts.map((_, i) => bulgeOf(bulges, i)) };
  }
  const sa = signedPathArea(verts, bulges);
  if (Math.abs(sa) < EPS * EPS) throw new Error('路径退化, 无法偏移');
  const ccwSign = sa > 0 ? 1 : -1; // CCW: 外侧 = 行进方向右侧

  const segs: OffSeg[] = [];
  for (let i = 0; i < n; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % n];
    const bl = bulgeOf(bulges, i);
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < EPS) throw new Error('路径含重合点, 无法偏移');
    if (Math.abs(bl) < EPS) {
      const nx = (ccwSign > 0 ? dy : -dy) / len; // 外法线
      const ny = (ccwSign > 0 ? -dx : dx) / len;
      segs.push({
        line: true,
        px: a[0] + nx * d, py: a[1] + ny * d, qx: b[0] + nx * d, qy: b[1] + ny * d,
        odx: dx, ody: dy,
        cx: 0, cy: 0, r2: 0, sgn: 0, theta: 0, obl: 0,
        aox: a[0] + nx * d, aoy: a[1] + ny * d, box: b[0] + nx * d, boy: b[1] + ny * d,
      });
    } else {
      const c = bulgeCenter(a, b, bl);
      const R = bulgeRadius(a, b, bl);
      const sgn = bl > 0 ? 1 : -1;
      // 凸弧 (凸侧=外侧) 外偏 → R+d; 凹弧 → R−d
      const r2 = R - ccwSign * sgn * d;
      if (r2 < EPS) throw new Error(SELF_X);
      const k = r2 / R;
      segs.push({
        line: false,
        px: 0, py: 0, qx: 0, qy: 0, odx: dx, ody: dy,
        cx: c[0], cy: c[1], r2, sgn, theta: bulgeTheta(bl), obl: bl,
        aox: c[0] + (a[0] - c[0]) * k, aoy: c[1] + (a[1] - c[1]) * k,
        box: c[0] + (b[0] - c[0]) * k, boy: c[1] + (b[1] - c[1]) * k,
      });
    }
  }

  // 逐顶点求交: 顶点 j = 段 (j−1) 同段 j 嘅交汇
  const newVerts: Pt[] = new Array<Pt>(n);
  for (let j = 0; j < n; j++) {
    const s1 = segs[(j - 1 + n) % n];
    const s2 = segs[j];
    const refx = (s1.box + s2.aox) / 2;
    const refy = (s1.boy + s2.aoy) / 2;
    let p: Pt;
    if (s1.line && s2.line) p = lineLine(s1, s2);
    else if (s1.line && !s2.line) p = lineCircle(s1, s2, refx, refy);
    else if (!s1.line && s2.line) p = lineCircle(s2, s1, refx, refy);
    else p = circleCircle(s1, s2, refx, refy);
    newVerts[j] = p;
  }

  // 重算 bulge + 退化校验
  const newBulges: number[] = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const s = segs[i];
    const A = newVerts[i];
    const B = newVerts[(i + 1) % n];
    const ndx = B[0] - A[0], ndy = B[1] - A[1];
    if (Math.hypot(ndx, ndy) < EPS) throw new Error(SELF_X); // 段塌缩
    if (s.line) {
      if (ndx * s.odx + ndy * s.ody <= 0) throw new Error(SELF_X); // 段反向
      newBulges[i] = 0;
    } else {
      const phiA = Math.atan2(A[1] - s.cy, A[0] - s.cx);
      const phiB = Math.atan2(B[1] - s.cy, B[0] - s.cx);
      let sweep = (s.sgn > 0 ? phiA - phiB : phiB - phiA) % TAU;
      if (sweep < 0) sweep += TAU;
      // 相切情形包角理论不变 → bulge 不变 (snap 消除求交 √ε 级浮点噪声);
      // 非相切端点沿圆移动 → 按新包角重算; 偏离超 π 即弧被翻转/吞噬
      if (Math.abs(sweep - s.theta) > Math.PI) throw new Error(SELF_X);
      newBulges[i] = Math.abs(sweep - s.theta) < 1e-6 ? s.obl : s.sgn * Math.tan(sweep / 4);
    }
  }
  return { verts: newVerts, bulges: newBulges };
}

// ---------- 倒圆角 ----------

/** 喺角点 i 倒半径 r 圆角 (v1: 两邻段必须均为直线)。
 *  t = r/tan(φ/2) (φ = 内角); 角点换成两切点 + 中间弧段,
 *  bulge = ±tan((π−φ)/4), 符号按转向 (左转 → 负, 即凸向行进方向右侧)。 */
/** Exact offset for an open line/arc path. `d` is left of travel, matching the
 * existing open-line Offset command. Interior joins are analytic intersections;
 * endpoints remain the translated/radially-offset endpoints. */
export function offsetOpenPath(verts: Pt[], bulges: number[], d: number): { verts: Pt[]; bulges: number[] } {
  if (verts.length < 2 || Math.abs(d) < EPS) throw new Error('open path offset requires a non-zero distance')
  const segs: OffSeg[] = []
  for (let i = 0; i + 1 < verts.length; i++) {
    const a = verts[i], b = verts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy)
    if (len < EPS) throw new Error(SELF_X)
    const bl = bulgeOf(bulges, i)
    if (Math.abs(bl) < EPS) {
      const nx = -dy * d / len, ny = dx * d / len
      segs.push({ line: true, px: a[0] + nx, py: a[1] + ny, qx: b[0] + nx, qy: b[1] + ny, odx: dx, ody: dy, cx: 0, cy: 0, r2: 0, sgn: 0, theta: 0, obl: 0, aox: a[0] + nx, aoy: a[1] + ny, box: b[0] + nx, boy: b[1] + ny })
    } else {
      const c = bulgeCenter(a, b, bl), R = bulgeRadius(a, b, bl), sgn = bl > 0 ? 1 : -1
      const r2 = R + sgn * d
      if (r2 < EPS) throw new Error(SELF_X)
      const k = r2 / R
      segs.push({ line: false, px: 0, py: 0, qx: 0, qy: 0, odx: dx, ody: dy, cx: c[0], cy: c[1], r2, sgn, theta: bulgeTheta(bl), obl: bl, aox: c[0] + (a[0] - c[0]) * k, aoy: c[1] + (a[1] - c[1]) * k, box: c[0] + (b[0] - c[0]) * k, boy: c[1] + (b[1] - c[1]) * k })
    }
  }
  const out: Pt[] = [[segs[0].aox, segs[0].aoy]]
  for (let i = 1; i < verts.length - 1; i++) {
    const a = segs[i - 1], b = segs[i], rx = (a.box + b.aox) / 2, ry = (a.boy + b.aoy) / 2
    out.push(a.line ? (b.line ? lineLine(a, b) : lineCircle(a, b, rx, ry)) : (b.line ? lineCircle(b, a, rx, ry) : circleCircle(a, b, rx, ry)))
  }
  const last = segs[segs.length - 1]
  out.push([last.box, last.boy])
  const outBulges: number[] = []
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]
    if (s.line) { outBulges.push(0); continue }
    const A = out[i], B = out[i + 1], pA = Math.atan2(A[1] - s.cy, A[0] - s.cx), pB = Math.atan2(B[1] - s.cy, B[0] - s.cx)
    let sweep = (s.sgn > 0 ? pA - pB : pB - pA) % TAU
    if (sweep < 0) sweep += TAU
    if (Math.abs(sweep - s.theta) > Math.PI) throw new Error(SELF_X)
    outBulges.push(Math.abs(sweep - s.theta) < 1e-6 ? s.obl : s.sgn * Math.tan(sweep / 4))
  }
  return { verts: out, bulges: outBulges }
}

/**
 * Offset a sampled smooth curve along its local normal.  This is deliberately
 * separate from `offsetPath`: an ellipse's parallel curve is not an ellipse,
 * and a spline does not in general have an analytic offset representation.
 * `closed` follows the sketch convention: positive d grows a closed profile;
 * an open curve uses positive d on the left of travel.
 */
export function offsetSampledCurve(pts: Pt[], d: number, closed: boolean): Pt[] | null {
  if (Math.abs(d) < EPS || pts.length < (closed ? 3 : 2)) return null
  const p = pts.filter((q, i) => i === 0 || Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) > EPS)
  const n = p.length
  if (n < (closed ? 3 : 2)) return null
  // Closed contours have a semantic outside; positive Offset must grow it,
  // regardless of the order in which the curve was originally drawn.
  let sign = 1
  if (closed) {
    let twiceArea = 0
    for (let i = 0; i < n; i++) { const a = p[i], b = p[(i + 1) % n]; twiceArea += a[0] * b[1] - b[0] * a[1] }
    if (Math.abs(twiceArea) < EPS) return null
    sign = twiceArea > 0 ? -1 : 1
  }
  const out: Pt[] = []
  for (let i = 0; i < n; i++) {
    const a = p[closed ? (i - 1 + n) % n : Math.max(0, i - 1)]
    const b = p[closed ? (i + 1) % n : Math.min(n - 1, i + 1)]
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy)
    if (l < EPS) return null
    out.push([p[i][0] - dy * d * sign / l, p[i][1] + dx * d * sign / l])
  }
  // A parallel curve can fold back on itself when an inward distance exceeds
  // local curvature radius.  Do not silently create an invalid sketch profile.
  const orient = (a: Pt, b: Pt, c: Pt) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  const hit = (a: Pt, b: Pt, c: Pt, e: Pt) => {
    const o1 = orient(a, b, c), o2 = orient(a, b, e), o3 = orient(c, e, a), o4 = orient(c, e, b)
    return Math.sign(o1) !== Math.sign(o2) && Math.sign(o3) !== Math.sign(o4) && Math.abs(o1) > EPS && Math.abs(o2) > EPS && Math.abs(o3) > EPS && Math.abs(o4) > EPS
  }
  const segN = closed ? n : n - 1
  for (let i = 0; i < segN; i++) for (let j = i + 1; j < segN; j++) {
    if (j === i + 1 || (closed && i === 0 && j === segN - 1)) continue
    if (hit(out[i], out[(i + 1) % n], out[j], out[(j + 1) % n])) return null
  }
  return out
}

export function filletAt(
  verts: Pt[],
  bulges: number[],
  i: number,
  r: number,
): { verts: Pt[]; bulges: number[] } {
  const n = verts.length;
  if (n < 3) throw new Error('路径至少需 3 个顶点先可倒圆角');
  if (!Number.isInteger(i) || i < 0 || i >= n) throw new Error('角点索引越界');
  if (!(r > EPS)) throw new Error('圆角半径须为正');
  const ip = (i - 1 + n) % n;
  if (Math.abs(bulgeOf(bulges, ip)) > EPS || Math.abs(bulgeOf(bulges, i)) > EPS) {
    throw new Error('暂只支持直线角倒圆角');
  }
  const vp = verts[ip];
  const v = verts[i];
  const vn = verts[(i + 1) % n];
  const len1 = dist(vp, v);
  const len2 = dist(v, vn);
  if (len1 < EPS || len2 < EPS) throw new Error('角点邻段退化 (重合点)');
  const u1x = (v[0] - vp[0]) / len1, u1y = (v[1] - vp[1]) / len1; // 入向
  const u2x = (vn[0] - v[0]) / len2, u2y = (vn[1] - v[1]) / len2; // 出向
  let cosPhi = -(u1x * u2x + u1y * u2y); // 内角 φ = ∠(−u1, u2)
  if (cosPhi > 1) cosPhi = 1;
  if (cosPhi < -1) cosPhi = -1;
  const phi = Math.acos(cosPhi);
  if (phi > Math.PI - 1e-9) throw new Error('角点两邻段共线, 无法倒圆角');
  const t = r / Math.tan(phi / 2); // 切点距角点 (φ→0 时 t→∞ 由下面守卫接住)
  if (!(t < len1 - EPS) || !(t < len2 - EPS)) throw new Error('半径太大');
  const p1: Pt = [v[0] - u1x * t, v[1] - u1y * t];
  const p2: Pt = [v[0] + u2x * t, v[1] + u2y * t];
  const cross = u1x * u2y - u1y * u2x; // >0 左转, <0 右转
  const bulgeF = -Math.sign(cross) * Math.tan((Math.PI - phi) / 4);
  const vertsOut = verts.map(clonePt);
  const bulgesOut = verts.map((_, k) => bulgeOf(bulges, k));
  vertsOut.splice(i, 1, p1, p2);
  bulgesOut.splice(i, 0, bulgeF); // 段 p1→p2 = 新弧; 原段 i 顺移为 p2→v[i+1]
  return { verts: vertsOut, bulges: bulgesOut };
}

// ============================================================
// 闭合路径布尔运算 (union / subtract / intersect)
// Weiler-Atherton 风格, 直接喺 bulge 段上做: 求交全解析
// (线-线 / 线-弧 / 弧-弧 圆方程求解), 弧段全程保真 (输出唔密铺);
// 密铺只用于含点测试 (point-in-path) 同 'on-boundary' 段嘅侧向判别。
// ============================================================

export type BoolPathOp = 'union' | 'subtract' | 'intersect';

const BTOL = 1e-7;     // 几何/缝合容差 (坐标)
const PIP_STEP = 0.02; // 含点测试密铺角步长 (弧矢误差 ≈ R·5e-5)

/** 布尔运算内部段表示: 直线或圆弧 (缓存圆心/半径/起角/有向扫角) */
interface BoolSeg {
  a: Pt;
  b: Pt;
  bulge: number;
  arc: boolean;
  cx: number;
  cy: number;
  R: number;
  phiA: number;  // 起点圆心角
  delta: number; // 有向扫角: bulge>0 → −θ (绕圆心顺时针), bulge<0 → +θ
  len: number;   // 线长 / 弧长 (参数容差换算用)
}

/** 段 + 求交记录簿: 内部分割点 (t∈(0,1)) 同 on-boundary 重叠区间 */
interface SegBook {
  seg: BoolSeg;
  splits: { t: number; p: Pt }[];
  onIvs: [number, number][];
}

/** 选段后嘅子段: on = 位于另一路径边界上 (共线/共圆重叠) */
interface SubSeg {
  a: Pt;
  b: Pt;
  bulge: number;
  on: boolean;
}

function mkBoolSeg(a: Pt, b: Pt, bulge: number): BoolSeg {
  const chord = dist(a, b);
  if (Math.abs(bulge) < EPS || chord < EPS) {
    return { a, b, bulge: 0, arc: false, cx: 0, cy: 0, R: 0, phiA: 0, delta: 0, len: chord };
  }
  const c = bulgeCenter(a, b, bulge);
  const R = bulgeRadius(a, b, bulge);
  const th = bulgeTheta(bulge);
  return {
    a, b, bulge, arc: true,
    cx: c[0], cy: c[1], R,
    phiA: Math.atan2(a[1] - c[1], a[0] - c[0]),
    delta: (bulge > 0 ? -1 : 1) * th,
    len: R * th,
  };
}

function segPointAt(s: BoolSeg, t: number): Pt {
  if (!s.arc) return [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t];
  const phi = s.phiA + s.delta * t;
  return [s.cx + s.R * Math.cos(phi), s.cy + s.R * Math.sin(phi)];
}

function norm0(x: number): number {
  return ((x % TAU) + TAU) % TAU;
}

/** 已知 p 喺段 s 所在圆上: 求弧参数 t∈[0,1]; 唔喺弧角度范围内 → null */
function arcParamOf(s: BoolSeg, p: Pt): number | null {
  const phi = Math.atan2(p[1] - s.cy, p[0] - s.cx);
  const th = Math.abs(s.delta);
  const angTol = BTOL / Math.max(s.R, BTOL) + 1e-9;
  const psi = norm0((phi - s.phiA) * Math.sign(s.delta));
  if (psi <= th + angTol) return Math.min(psi / th, 1);
  if (psi >= TAU - angTol) return 0;
  return null;
}

/** p 喺直线段 s 上嘅参数 (投影) */
function lineParamOf(s: BoolSeg, p: Pt): number {
  const dx = s.b[0] - s.a[0];
  const dy = s.b[1] - s.a[1];
  const L2 = Math.max(dx * dx + dy * dy, BTOL * BTOL);
  return ((p[0] - s.a[0]) * dx + (p[1] - s.a[1]) * dy) / L2;
}

function addSplit(bk: SegBook, t: number, p: Pt): void {
  const tol = BTOL / Math.max(bk.seg.len, BTOL);
  for (const s of bk.splits) if (Math.abs(s.t - t) <= tol) return;
  bk.splits.push({ t, p: clonePt(p) });
}

/** 记录一个交点 (双方参数): 近端点 snap 到精确顶点坐标, 内部点先加分割 */
function recPoint(b1: SegBook, b2: SegBook, t1raw: number, t2raw: number, praw: Pt): void {
  const tol1 = BTOL / Math.max(b1.seg.len, BTOL);
  const tol2 = BTOL / Math.max(b2.seg.len, BTOL);
  let t1 = t1raw;
  let t2 = t2raw;
  let p = praw;
  let snapped = false;
  if (t1 <= tol1) { t1 = 0; p = b1.seg.a; snapped = true; }
  else if (t1 >= 1 - tol1) { t1 = 1; p = b1.seg.b; snapped = true; }
  if (t2 <= tol2) { t2 = 0; if (!snapped) p = b2.seg.a; }
  else if (t2 >= 1 - tol2) { t2 = 1; if (!snapped) p = b2.seg.b; }
  if (t1 > 0 && t1 < 1) addSplit(b1, t1, p);
  if (t2 > 0 && t2 < 1) addSplit(b2, t2, p);
}

function xLineLine(b1: SegBook, b2: SegBook): void {
  const s1 = b1.seg;
  const s2 = b2.seg;
  const d1x = s1.b[0] - s1.a[0], d1y = s1.b[1] - s1.a[1];
  const d2x = s2.b[0] - s2.a[0], d2y = s2.b[1] - s2.a[1];
  const cr = d1x * d2y - d1y * d2x;
  const rx = s2.a[0] - s1.a[0], ry = s2.a[1] - s1.a[1];
  if (Math.abs(cr) <= 1e-10 * Math.max(s1.len * s2.len, BTOL)) {
    // 平行 → 共线先可能有正长度重叠
    const off = Math.abs(rx * d1y - ry * d1x) / Math.max(s1.len, BTOL);
    if (off > BTOL) return;
    const inv = 1 / Math.max(s1.len * s1.len, BTOL * BTOL);
    const ta = (rx * d1x + ry * d1y) * inv;
    const tb = ((s2.b[0] - s1.a[0]) * d1x + (s2.b[1] - s1.a[1]) * d1y) * inv;
    const lo = Math.max(0, Math.min(ta, tb));
    const hi = Math.min(1, Math.max(ta, tb));
    if ((hi - lo) * s1.len <= BTOL) return;
    const p0 = segPointAt(s1, lo);
    const p1 = segPointAt(s1, hi);
    const u0 = lineParamOf(s2, p0);
    const u1 = lineParamOf(s2, p1);
    recPoint(b1, b2, lo, u0, p0);
    recPoint(b1, b2, hi, u1, p1);
    b1.onIvs.push([lo, hi]);
    b2.onIvs.push([Math.max(0, Math.min(u0, u1)), Math.min(1, Math.max(u0, u1))]);
    return;
  }
  const t1 = (rx * d2y - ry * d2x) / cr;
  const t2 = (rx * d1y - ry * d1x) / cr;
  const tol1 = BTOL / Math.max(s1.len, BTOL);
  const tol2 = BTOL / Math.max(s2.len, BTOL);
  if (t1 < -tol1 || t1 > 1 + tol1 || t2 < -tol2 || t2 > 1 + tol2) return;
  recPoint(b1, b2, t1, t2, segPointAt(s1, Math.max(0, Math.min(1, t1))));
}

function xLineArc(bl: SegBook, ba: SegBook): void {
  const ln = bl.seg;
  const ar = ba.seg;
  const L = ln.len;
  if (L <= BTOL) return;
  const ux = (ln.b[0] - ln.a[0]) / L;
  const uy = (ln.b[1] - ln.a[1]) / L;
  const fx = ln.a[0] - ar.cx;
  const fy = ln.a[1] - ar.cy;
  const m = ux * fx + uy * fy;
  const q = fx * fx + fy * fy - ar.R * ar.R;
  let disc = m * m - q; // (半弦)², 单位 length²
  if (disc < 0) {
    if (disc < -BTOL * (ar.R + L)) return; // 真唔相交
    disc = 0; // 近切 → 当单点
  }
  const rt = Math.sqrt(disc);
  const roots = rt > BTOL ? [-m - rt, -m + rt] : [-m];
  const tolT = BTOL / L;
  for (const sl of roots) {
    const t = sl / L;
    if (t < -tolT || t > 1 + tolT) continue;
    const tc = Math.max(0, Math.min(1, t));
    const p: Pt = [ln.a[0] + ux * (tc * L), ln.a[1] + uy * (tc * L)];
    const ta = arcParamOf(ar, p);
    if (ta === null) continue;
    recPoint(bl, ba, t, ta, p);
  }
}

/** 共圆两弧: 圆周角区间相交 → 重叠区间 (on-boundary) + 端点分割 */
function xCocircular(b1: SegBook, b2: SegBook): void {
  const a1 = b1.seg;
  const a2 = b2.seg;
  const th1 = Math.abs(a1.delta);
  const th2 = Math.abs(a2.delta);
  // 每条弧表示为 CCW 区间 [lo, lo+θ]
  const lo1 = norm0(a1.delta > 0 ? a1.phiA : a1.phiA + a1.delta);
  const lo2 = norm0(a2.delta > 0 ? a2.phiA : a2.phiA + a2.delta);
  const d = norm0(lo2 - lo1);
  const angTol = BTOL / Math.max(a1.R, BTOL) + 1e-9;
  const cands: [number, number][] = [];
  if (d < th1) cands.push([d, Math.min(th1, d + th2)]);
  if (d + th2 > TAU) cands.push([0, Math.min(th1, d + th2 - TAU)]);
  for (const [u0, u1] of cands) {
    if ((u1 - u0) * a1.R <= BTOL) continue;
    const p0: Pt = [a1.cx + a1.R * Math.cos(lo1 + u0), a1.cy + a1.R * Math.sin(lo1 + u0)];
    const p1: Pt = [a1.cx + a1.R * Math.cos(lo1 + u1), a1.cy + a1.R * Math.sin(lo1 + u1)];
    const t1a = a1.delta > 0 ? u0 / th1 : 1 - u0 / th1;
    const t1b = a1.delta > 0 ? u1 / th1 : 1 - u1 / th1;
    let v0 = norm0(lo1 + u0 - lo2);
    if (v0 > th2 + angTol) v0 = 0; // wrap 浮点修正
    const v1 = v0 + (u1 - u0);
    const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
    const t2a = clamp01(a2.delta > 0 ? v0 / th2 : 1 - v0 / th2);
    const t2b = clamp01(a2.delta > 0 ? v1 / th2 : 1 - v1 / th2);
    recPoint(b1, b2, t1a, t2a, p0);
    recPoint(b1, b2, t1b, t2b, p1);
    b1.onIvs.push([Math.min(t1a, t1b), Math.max(t1a, t1b)]);
    b2.onIvs.push([Math.min(t2a, t2b), Math.max(t2a, t2b)]);
  }
}

function xArcArc(b1: SegBook, b2: SegBook): void {
  const a1 = b1.seg;
  const a2 = b2.seg;
  const dx = a2.cx - a1.cx;
  const dy = a2.cy - a1.cy;
  const dd = Math.hypot(dx, dy);
  if (dd <= BTOL && Math.abs(a1.R - a2.R) <= BTOL) { xCocircular(b1, b2); return; }
  if (dd <= BTOL) return; // 同心异半径: 无交
  if (dd > a1.R + a2.R + BTOL || dd < Math.abs(a1.R - a2.R) - BTOL) return;
  const ux = dx / dd;
  const uy = dy / dd;
  const along = (dd * dd + a1.R * a1.R - a2.R * a2.R) / (2 * dd);
  let h2 = a1.R * a1.R - along * along;
  if (h2 < 0) h2 = 0;
  const h = Math.sqrt(h2);
  const bx = a1.cx + along * ux;
  const by = a1.cy + along * uy;
  const cand: Pt[] = h > BTOL
    ? [[bx - h * uy, by + h * ux], [bx + h * uy, by - h * ux]]
    : [[bx, by]];
  for (const p of cand) {
    const t1 = arcParamOf(a1, p);
    if (t1 === null) continue;
    const t2 = arcParamOf(a2, p);
    if (t2 === null) continue;
    recPoint(b1, b2, t1, t2, p);
  }
}

function xSegs(b1: SegBook, b2: SegBook): void {
  if (!b1.seg.arc && !b2.seg.arc) xLineLine(b1, b2);
  else if (!b1.seg.arc) xLineArc(b1, b2);
  else if (!b2.seg.arc) xLineArc(b2, b1);
  else xArcArc(b1, b2);
}

/** 按记录簿分割成子段; 子弧 bulge = tan(子段扫角/4) (同圆心同半径精确保持) */
function subdivideBook(books: SegBook[]): SubSeg[] {
  const out: SubSeg[] = [];
  for (const bk of books) {
    const seg = bk.seg;
    const recs = [...bk.splits].sort((x, y) => x.t - y.t);
    const ts = [0, ...recs.map((r) => r.t), 1];
    const ps = [seg.a, ...recs.map((r) => r.p), seg.b];
    const tol = BTOL / Math.max(seg.len, BTOL);
    for (let k = 0; k + 1 < ts.length; k++) {
      const t0 = ts[k];
      const t1 = ts[k + 1];
      if ((t1 - t0) * Math.max(seg.len, BTOL) <= BTOL) continue; // 塌缩零长子段
      const a = ps[k];
      const b = ps[k + 1];
      if (!seg.arc && dist(a, b) <= BTOL) continue;
      const bulge = !seg.arc
        ? 0
        : t0 === 0 && t1 === 1
          ? seg.bulge // 未被分割: 保留原 bulge, 零损耗
          : Math.sign(seg.bulge) * Math.tan((Math.abs(seg.delta) * (t1 - t0)) / 4);
      const tm = (t0 + t1) / 2;
      let on = false;
      for (const [lo, hi] of bk.onIvs) {
        if (tm >= lo - tol && tm <= hi + tol) { on = true; break; }
      }
      out.push({ a: clonePt(a), b: clonePt(b), bulge, on });
    }
  }
  return out;
}

/** 偶交点法含点测试 (密铺折线) */
function pipPoly(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = poly[j];
    const b = poly[i];
    if ((a[1] > p[1]) !== (b[1] > p[1])) {
      const xc = a[0] + ((p[1] - a[1]) * (b[0] - a[0])) / (b[1] - a[1]);
      if (p[0] < xc) inside = !inside;
    }
  }
  return inside;
}

/** 密铺折线简单性检查: 任意非相邻边真交叉 / 共线正长度重叠 → false。
 *  偶交点含点测试 (pipPoly) 只对简单环可信 — 自交输入 (违反前置条件)
 *  喺无交点快速通路必须先经此关卡, 决不回显非简单环。 */
function polySimple(poly: Pt[]): boolean {
  const n = poly.length;
  const eps = 1e-9;
  const cr = (o: Pt, a: Pt, b: Pt) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // 闭合环首尾相邻
      const c = poly[j];
      const d = poly[(j + 1) % n];
      const d1 = cr(c, d, a);
      const d2 = cr(c, d, b);
      const d3 = cr(a, b, c);
      const d4 = cr(a, b, d);
      if (
        ((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) &&
        ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps))
      ) return false; // 真横穿
      // 全共线 → 1D 区间正长度重叠检查
      if (Math.abs(d1) <= eps && Math.abs(d2) <= eps && Math.abs(d3) <= eps && Math.abs(d4) <= eps) {
        const ax = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? 0 : 1;
        const lo = Math.max(Math.min(a[ax], b[ax]), Math.min(c[ax], d[ax]));
        const hi = Math.min(Math.max(a[ax], b[ax]), Math.max(c[ax], d[ax]));
        if (hi - lo > BTOL) return false;
      }
    }
  }
  return true;
}

/** 'on' 子段侧向判别: 弧中点沿行进左法线微移后做含点测试。
 *  true = 另一路径内部喺左侧 (同 CCW 本体同侧 = 同向重叠) */
function onLeftInside(ss: SubSeg, otherPoly: Pt[]): boolean {
  const seg = mkBoolSeg(ss.a, ss.b, ss.bulge);
  const m = bulgeMid(ss.a, ss.b, ss.bulge);
  let tx: number;
  let ty: number;
  if (!seg.arc) {
    const L = Math.max(seg.len, BTOL);
    tx = (ss.b[0] - ss.a[0]) / L;
    ty = (ss.b[1] - ss.a[1]) / L;
  } else {
    const phim = seg.phiA + seg.delta / 2;
    const sg = Math.sign(seg.delta);
    tx = -sg * Math.sin(phim);
    ty = sg * Math.cos(phim);
  }
  const dlt = Math.max(1e-6, 1e-3 * dist(ss.a, ss.b));
  return pipPoly([m[0] - ty * dlt, m[1] + tx * dlt], otherPoly);
}

function ptsClose(p: Pt, q: Pt): boolean {
  return Math.abs(p[0] - q[0]) <= BTOL && Math.abs(p[1] - q[1]) <= BTOL;
}

/** 端点匹配缝合 (多环): 全部子段必须恰好缝成一个或多个闭合环。
 *  跟链途中遇分叉 (同一端点多于一个未用后继 = pinch 点) / 断链 /
 *  任何链无法闭合 → null (诚实降级, 决不输出垃圾)。 */
function stitchLoops(parts: SubSeg[]): { verts: Pt[]; bulges: number[] }[] | null {
  const n = parts.length;
  if (n === 0) return null;
  const used: boolean[] = new Array<boolean>(n).fill(false);
  const loops: { verts: Pt[]; bulges: number[] }[] = [];
  let usedCount = 0;
  while (usedCount < n) {
    let start = 0;
    while (start < n && used[start]) start++;
    const chain: SubSeg[] = [parts[start]];
    used[start] = true;
    usedCount++;
    let closed = false;
    for (let guard = 0; guard <= n; guard++) {
      const end = chain[chain.length - 1].b;
      if (ptsClose(end, chain[0].a)) { closed = true; break; }
      let next = -1;
      for (let i = 0; i < n; i++) {
        if (used[i]) continue;
        if (ptsClose(parts[i].a, end)) {
          if (next >= 0) return null; // 分叉点 → 非简单缝合 (pinch)
          next = i;
        }
      }
      if (next < 0) return null; // 断链
      used[next] = true;
      usedCount++;
      chain.push(parts[next]);
    }
    if (!closed) return null;
    loops.push({
      verts: chain.map((s) => clonePt(s.a)),
      bulges: chain.map((s) => s.bulge),
    });
  }
  return loops;
}

/** 规范化: 复制 + 塌缩零长段 + 统一为 CCW; 退化 (面积≈0) / 非有限坐标 → null */
function normPathCCW(path: { verts: Pt[]; bulges: number[] }): { verts: Pt[]; bulges: number[] } | null {
  // 非有限坐标 (NaN/±Infinity) 会令面积/求交全部静默失效 → 必须前置拒绝
  // (bulge 已由 bulgeOf 统一塌缩为 0, 无需另查)
  for (const p of path.verts) {
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
  }
  const n = path.verts.length;
  const verts: Pt[] = [];
  const bulges: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = path.verts[i];
    const b = path.verts[(i + 1) % n];
    if (dist(a, b) <= BTOL) continue;
    verts.push(clonePt(a));
    bulges.push(bulgeOf(path.bulges, i));
  }
  const m = verts.length;
  if (m < 2) return null;
  const sa = signedPathArea(verts, bulges);
  // 天文 bulge (R² 溢出 double) 令 sa = ±Infinity/NaN — Infinity 会穿过 sa>0 分支,
  // NaN 会落入反转分支, 均回显非有限几何 → 一并拒绝
  if (!Number.isFinite(sa) || Math.abs(sa) <= BTOL) return null;
  if (sa > 0) return { verts, bulges };
  const rv: Pt[] = [];
  const rb: number[] = [];
  for (let j = 0; j < m; j++) {
    rv.push(clonePt(verts[(m - j) % m]));
    rb.push(-bulges[(m - 1 - j) % m]);
  }
  return { verts: rv, bulges: rb };
}

/**
 * 闭合 bulge 路径布尔运算 — 多环版 (同 boolPath 一样嘅算法, 但容许多环结果)。
 *
 * 返回全部结果环 (数组), 各环均为简单闭合环:
 *   - subtract B⊂A (挖穿) → [外环 A, 内环 B] (孔环 — 调用方按 even-odd 嵌套
 *     处理; 方向不限定但保证简单; 实现上两环均经 normPathCCW 规范化)
 *   - subtract 横切裂体 → 各碎块环 (每环 CCW)
 *   - intersect 多接触区 → 各区环 (每环 CCW)
 * 单环情形同 boolPath 完全一致 (含 null 情形: 分离 union/intersect、
 * 空 subtract (A⊂B / 全等)、非有限输入、自交输入 GIGO)。
 * subtract 分离语义 (文档化, 同 boolPath): A 同 B 完全不相交 → [A 原样]。
 * 任何环唔简单 / 缝合分叉 (pinch) / 断链 / 零面积 / 缝出 CW 环 → null
 * (诚实降级, 决不输出垃圾)。
 */
export function boolPathAll(
  a: { verts: [number, number][]; bulges: number[] },
  b: { verts: [number, number][]; bulges: number[] },
  op: BoolPathOp,
): { verts: [number, number][]; bulges: number[] }[] | null {
  const A = normPathCCW(a);
  const B = normPathCCW(b);
  if (!A || !B) return null;
  const nA = A.verts.length;
  const nB = B.verts.length;
  const booksA: SegBook[] = A.verts.map((v, i) => ({
    seg: mkBoolSeg(v, A.verts[(i + 1) % nA], A.bulges[i]),
    splits: [],
    onIvs: [],
  }));
  const booksB: SegBook[] = B.verts.map((v, i) => ({
    seg: mkBoolSeg(v, B.verts[(i + 1) % nB], B.bulges[i]),
    splits: [],
    onIvs: [],
  }));
  for (const ba of booksA) for (const bb of booksB) xSegs(ba, bb);

  const polyA = pathPts(A.verts, A.bulges, PIP_STEP);
  const polyB = pathPts(B.verts, B.bulges, PIP_STEP);

  const hasX =
    booksA.some((bk) => bk.splits.length > 0 || bk.onIvs.length > 0) ||
    booksB.some((bk) => bk.splits.length > 0 || bk.onIvs.length > 0);

  if (!hasX) {
    // 边界无任何交叠 → 纯包含/分离。
    // 前置条件守卫: 偶交点含点测试同 "原样回显" 都只对简单环成立 —
    // 自交输入 (GIGO) 喺呢条快速通路必须诚实降级 null, 决不回显非简单环。
    if (!polySimple(polyA) || !polySimple(polyB)) return null;
    const sA = booksA[0].seg;
    const sB = booksB[0].seg;
    const aInB = pipPoly(bulgeMid(sA.a, sA.b, sA.bulge), polyB);
    const bInA = pipPoly(bulgeMid(sB.a, sB.b, sB.bulge), polyA);
    if (op === 'union') return aInB ? [B] : bInA ? [A] : null;
    if (op === 'intersect') return aInB ? [A] : bInA ? [B] : null;
    // subtract
    if (aInB) return null; // A ⊂ B → 空集
    if (bInA) return [A, B]; // B ⊂ A → 挖穿: [外环 A, 孔环 B]
    return [A]; // 分离: A − B = A (文档化语义)
  }

  const subsA = subdivideBook(booksA);
  const subsB = subdivideBook(booksB);
  const sel: SubSeg[] = [];
  for (const ss of subsA) {
    if (ss.on) {
      const same = onLeftInside(ss, polyB); // B 内部喺左 = 同向重叠
      if (op === 'subtract' ? !same : same) sel.push(ss);
    } else {
      const inB = pipPoly(bulgeMid(ss.a, ss.b, ss.bulge), polyB);
      if (op === 'intersect' ? inB : !inB) sel.push(ss);
    }
  }
  for (const ss of subsB) {
    if (ss.on) continue; // 重叠段只由 A 方供给一份
    const inA = pipPoly(bulgeMid(ss.a, ss.b, ss.bulge), polyA);
    if (op === 'union' ? !inA : inA) {
      if (op === 'subtract') sel.push({ a: clonePt(ss.b), b: clonePt(ss.a), bulge: -ss.bulge, on: false });
      else sel.push(ss);
    }
  }

  const loops = stitchLoops(sel);
  if (!loops) return null;
  for (const loop of loops) {
    const sa = signedPathArea(loop.verts, loop.bulges);
    if (!(sa > 1e-9)) return null; // 零面积退化 / 缝出 CW 环 (洞边界) / NaN
    // 缝合分叉检测保证顶点级简单; 再以密铺折线复核 (浮点病态决不输出垃圾)
    if (!polySimple(pathPts(loop.verts, loop.bulges, PIP_STEP))) return null;
  }
  return loops;
}

/**
 * 闭合 bulge 路径布尔运算 (Weiler-Atherton 风格, 弧段保真) — 单环版,
 * 即 boolPathAll 嘅包装: 结果恰好一个环先返回, 否则 null。
 *
 * 返回单一简单闭合环 (CCW); 凡结果唔系恰好一个简单环 → 返回 null (诚实降级):
 *   - union / intersect: 两路径完全不相交 (含只喺单点/共边接触而无公共面积嘅 intersect)
 *   - union: 两路径只共一点接触 (pinch, 非简单环)
 *   - subtract: B 完全喺 A 内部 (会产生带洞环) / A 完全喺 B 内部 (空集) /
 *               A 同 B 全等 (空集) / 结果被切成多块
 * (多环情形 — 挖穿孔环 / 裂体碎块 / 多接触区 — 请用 boolPathAll。)
 * 特殊非 null 包含情形: union 时一方包含另一方 → 返回外层; intersect → 返回内层。
 * subtract 语义 (文档化): A 同 B 完全不相交 (含仅点/边接触) 时返回 A 原样 (A−B=A)。
 * 共线/共圆重叠边界: 同向重叠段保留一份 (union/intersect), 反向重叠段
 * 喺 union/intersect 中剔除、subtract 中保留 — 共边相邻两矩形 union 得到
 * 塌缩共边后嘅外轮廓 (顶点保留于接合处, 不合并共线相邻段)。
 *
 * 输入绕向任意 (内部规范化为 CCW); 输出恒为 CCW, 零长段已塌缩, 弧段 bulge 精确
 * (子弧均位于原圆上, 圆心半径保持)。
 *
 * 输入有效性: 顶点含 NaN/±Infinity → null; 输入路径须为简单环 —
 * 自交输入喺无交点快速通路会被检出并返回 null (决不回显非简单环)。
 */
export function boolPath(
  a: { verts: [number, number][]; bulges: number[] },
  b: { verts: [number, number][]; bulges: number[] },
  op: BoolPathOp,
): { verts: [number, number][]; bulges: number[] } | null {
  const loops = boolPathAll(a, b, op);
  return loops !== null && loops.length === 1 ? loops[0] : null;
}

// ============================================================
// 剪裁 / 延伸 (Trim / Extend) — Fusion 风格单击操作 (几何核心)
// 复用上面布尔机器: BoolSeg 段表 + 解析求交 (xSegs, recPoint 端点 snap)。
// 全局参数 u = 段索引 + 段内 t ∈ [0, m]; 闭合路径 param 空间为模 m 循环。
// 剪裁跨度只由「交点」(cutter 交 + 非相邻自交) 界定 — 普通顶点 (u = 整数)
// 唔系边界, 删除跨度会穿过佢哋 (Fusion 删 intersection→intersection)。
// ============================================================

export interface TrimPath {
  verts: Pt[];
  bulges: number[];
  closed: boolean;
}
// closed=true: 隐式闭合段 verts[n−1]→verts[0], bulge = bulges[n−1]。
// closed=false (开放折线): n 顶点 n−1 段; bulges 长 n−1 (缺项/多项容错, 缺当 0)。

/** 砌段表: 闭合 n 段 (含隐式闭合段) / 开放 n−1 段; bulges 缺项容错当 0 */
function trimSegsOf(path: TrimPath): BoolSeg[] {
  const n = path.verts.length;
  const m = path.closed ? n : n - 1;
  const out: BoolSeg[] = [];
  for (let i = 0; i < m; i++) {
    out.push(mkBoolSeg(path.verts[i], path.verts[(i + 1) % n], bulgeOf(path.bulges, i)));
  }
  return out;
}

/** 点到段最近距离 + 最近点参数。
 *  弧: 点对圆心嘅方位角喺扫角范围内 → 径向距离 |dist−R|, 否则取较近端点。 */
function segNearest(s: BoolSeg, p: Pt): { d: number; t: number } {
  if (!s.arc) {
    if (s.len <= EPS) return { d: dist(p, s.a), t: 0 };
    const t = Math.max(0, Math.min(1, lineParamOf(s, p)));
    return { d: dist(p, segPointAt(s, t)), t };
  }
  const phi = Math.atan2(p[1] - s.cy, p[0] - s.cx);
  const th = Math.abs(s.delta);
  const psi = norm0((phi - s.phiA) * Math.sign(s.delta));
  if (psi <= th) {
    return { d: Math.abs(Math.hypot(p[0] - s.cx, p[1] - s.cy) - s.R), t: th > EPS ? psi / th : 0 };
  }
  const dA = dist(p, s.a);
  const dB = dist(p, s.b);
  return dA <= dB ? { d: dA, t: 0 } : { d: dB, t: 1 };
}

/** 剪裁交点: 全局参数 u + 精确交点坐标 (输出端点直接用佢, 唔再重算) */
interface TrimHit {
  u: number;
  p: Pt;
}

/** 收集 target 上全部交点: (a) 每段 × 每 cutter 段 (解析求交);
 *  (b) 非相邻自交 (跳过 i==j、相邻段、闭合路径首尾段);
 *  (c) 顶点恰好落喺 cutter 上 (recPoint 端点 snap 唔留 split → 喺度补记 u=整数)。
 *  按 u 升序去重 (弧长贴近合并) 输出。 */
function collectTrimHits(tSegs: BoolSeg[], target: TrimPath, cSegs: BoolSeg[]): TrimHit[] {
  const m = tSegs.length;
  const books: SegBook[] = tSegs.map((seg) => ({ seg, splits: [], onIvs: [] }));
  const cBooks: SegBook[] = cSegs.map((seg) => ({ seg, splits: [], onIvs: [] }));
  for (const tb of books) for (const cb of cBooks) xSegs(tb, cb);
  for (let i = 0; i < m; i++) {
    for (let j = i + 2; j < m; j++) {
      if (target.closed && i === 0 && j === m - 1) continue; // 闭合首尾段相邻
      xSegs(books[i], books[j]);
    }
  }
  const hits: TrimHit[] = [];
  for (let i = 0; i < m; i++) {
    for (const sp of books[i].splits) hits.push({ u: i + sp.t, p: clonePt(sp.p) });
  }
  const nV = target.verts.length;
  for (let vi = 0; vi < nV; vi++) {
    const v = target.verts[vi];
    for (const cs of cSegs) {
      if (segNearest(cs, v).d <= BTOL) {
        hits.push({ u: vi, p: clonePt(v) });
        break;
      }
    }
  }
  hits.sort((x, y) => x.u - y.u);
  const out: TrimHit[] = [];
  for (const h of hits) {
    if (out.length > 0) {
      const prev = out[out.length - 1];
      const k = Math.max(0, Math.min(Math.floor(prev.u), m - 1));
      if ((h.u - prev.u) * Math.max(tSegs[k].len, BTOL) <= BTOL) continue; // 同点合并
    }
    out.push(h);
  }
  // 闭合路径: u≈0 同 u≈m 跨 wrap 重复亦合并
  if (target.closed && out.length > 1) {
    const first = out[0];
    const last = out[out.length - 1];
    const k = Math.max(0, Math.min(Math.floor(last.u), m - 1));
    if ((first.u + m - last.u) * Math.max(tSegs[k].len, BTOL) <= BTOL) out.pop();
  }
  return out;
}

/** 抽取全局参数区间 [S, E] (S < E; 闭合路径可跨 wrap, 段索引取模) 为一条开放路径。
 *  端点用调用方提供嘅精确交点坐标 pS/pE; 中途顶点用原顶点 (bit-exact);
 *  未被分割嘅整段 bulge 原样保留 (bit-exact), 子弧 bulge = tan(θ·frac/4)·sign(原)
 *  (子弧端点位于原圆上 — 交点本身解析求得)。
 *  零长子段 (弦 < 1e-9 且扫角 < 1e-9) 丢弃; 剩低 < 2 点 → null (退化件)。 */
function extractSpan(
  tSegs: BoolSeg[],
  verts: Pt[],
  S: number,
  E: number,
  pS: Pt,
  pE: Pt,
): TrimPath | null {
  const m = tSegs.length;
  const n = verts.length;
  const outV: Pt[] = [clonePt(pS)];
  const outB: number[] = [];
  let cur = S;
  let guard = 0;
  while (cur < E - 1e-12 && guard++ < 2 * m + 4) {
    const k = Math.floor(cur + 1e-12);
    const segIdx = ((k % m) + m) % m;
    const s = tSegs[segIdx];
    const stop = Math.min(k + 1, E);
    const t0 = cur - k;
    const t1 = stop - k;
    const atE = stop >= E - 1e-12;
    const pEnd: Pt = atE ? clonePt(pE) : clonePt(verts[(segIdx + 1) % n]);
    let bl = 0;
    let sweep = 0;
    if (s.arc) {
      if (t0 <= 0 && t1 >= 1) {
        bl = s.bulge; // 整段未郁过 → bulge 原样 (bit-exact)
        sweep = Math.abs(s.delta);
      } else {
        sweep = Math.abs(s.delta) * (t1 - t0);
        bl = Math.sign(s.bulge) * Math.tan(sweep / 4);
      }
    }
    const last = outV[outV.length - 1];
    if (dist(last, pEnd) < 1e-9 && sweep < 1e-9) {
      outV[outV.length - 1] = pEnd; // 零长子段: 唔加段, 只以 pEnd 修正端点
    } else {
      outV.push(pEnd);
      outB.push(bl);
    }
    cur = stop;
  }
  if (outV.length < 2) return null;
  return { verts: outV, bulges: outB, closed: false };
}

/**
 * 单击剪裁 (Fusion 风格): 删除 click 所在嘅「交点→交点」跨度 (穿过普通顶点)。
 *   - click 离 target 超过 tol → null (冇击中)
 *   - 完全无交点 → { kind: 'all' } (调用方删成个 shape)
 *   - 闭合路径 → 剪开成一条开放路径 (kind 'parts', 1 条; 单交点全删 → parts: [])
 *   - 开放路径 → 跨度两侧各剩一条 (0/1/2 条; 退化件丢弃, 全部退化 → parts: [])
 * 弧段全程保真: 子弧喺原圆上, 未郁过嘅段 bulge bit-exact 原样。
 */
export function trimPathAt(
  target: TrimPath,
  cutters: TrimPath[],
  click: Pt,
  tol: number,
): { kind: 'parts'; parts: TrimPath[] } | { kind: 'all' } | null {
  const n = target.verts.length;
  if (n < 2) return null;
  const tSegs = trimSegsOf(target);
  const m = tSegs.length;
  if (m < 1) return null;
  // 1) 最近段定位 click
  let hitI = -1;
  let hitT = 0;
  let hitD = Infinity;
  for (let i = 0; i < m; i++) {
    const r = segNearest(tSegs[i], click);
    if (r.d < hitD) {
      hitD = r.d;
      hitI = i;
      hitT = r.t;
    }
  }
  if (hitI < 0 || hitD > tol) return null;
  const uc = hitI + hitT;
  // 2) 全部交点 (cutter 交 + 自交); 退化 cutter 直段剔走
  const cSegs: BoolSeg[] = [];
  for (const c of cutters) {
    for (const s of trimSegsOf(c)) {
      if (!s.arc && s.len <= BTOL) continue;
      cSegs.push(s);
    }
  }
  const hits = collectTrimHits(tSegs, target, cSegs);
  if (hits.length === 0) return { kind: 'all' };
  // 3) 括住 uc 嘅交点对: u1 = 最大 u < uc, u2 = 最小 u > uc
  let h1: TrimHit | null = null;
  let h2: TrimHit | null = null;
  for (const h of hits) {
    if (h.u < uc && (h1 === null || h.u > h1.u)) h1 = h;
    if (h.u > uc && (h2 === null || h.u < h2.u)) h2 = h;
  }
  if (target.closed) {
    // 循环 param: 缺边 wrap 补; 保留跨度 = u2 → (wrap) → u1
    const lo = h1 ?? { u: hits[hits.length - 1].u - m, p: hits[hits.length - 1].p };
    const hi = h2 ?? { u: hits[0].u + m, p: hits[0].p };
    const S = hi.u;
    const E = lo.u + m;
    if (E - S <= 1e-12) return { kind: 'parts', parts: [] }; // 单交点 → 全段被删
    const piece = extractSpan(tSegs, target.verts, S, E, hi.p, lo.p);
    return { kind: 'parts', parts: piece !== null ? [piece] : [] };
  }
  // 开放路径: 冇交点嗰侧 = 删到路径末端
  const parts: TrimPath[] = [];
  if (h1 !== null) {
    const piece = extractSpan(tSegs, target.verts, 0, h1.u, target.verts[0], h1.p);
    if (piece !== null) parts.push(piece);
  }
  if (h2 !== null) {
    const piece = extractSpan(tSegs, target.verts, h2.u, m, h2.p, target.verts[n - 1]);
    if (piece !== null) parts.push(piece);
  }
  return { kind: 'parts', parts };
}

/**
 * 单击打断 (Fusion Break, S179): 喺 click 处把路径一分为二，两段都保留 (唔删)。
 *   - click 离 target 超过 tol → null (冇击中)
 *   - click 近一个交点 (cutter 交 / 自交，tol 内) → 喺该【精确交点】断；否则喺 click 落点【自由断】(Fusion 容许自由点打断)
 *   - 开放路径 → 两段 [0..U] / [U..end]；断喺端点 (无意义) → null
 *   - 闭合路径 → 断开成一条开放路径 (由断点绕返断点)
 * 弧段保真 (extractSpan 子弧 bit-exact)。纯函数，唔改 target。
 */
export function splitPathAt(
  target: TrimPath,
  cutters: TrimPath[],
  click: Pt,
  tol: number,
): { kind: 'parts'; parts: TrimPath[] } | null {
  const n = target.verts.length;
  if (n < 2) return null;
  const tSegs = trimSegsOf(target);
  const m = tSegs.length;
  if (m < 1) return null;
  // 1) 最近段定位 click (同 trimPathAt)
  let hitI = -1, hitT = 0, hitD = Infinity;
  for (let i = 0; i < m; i++) {
    const r = segNearest(tSegs[i], click);
    if (r.d < hitD) { hitD = r.d; hitI = i; hitT = r.t; }
  }
  if (hitI < 0 || hitD > tol) return null;
  let U = hitI + hitT;
  let P: Pt = segPointAt(tSegs[hitI], hitT);
  // 2) 若近一个交点 → 吸到该精确交点断 (否则用自由 click 落点)
  const cSegs: BoolSeg[] = [];
  for (const c of cutters) for (const s of trimSegsOf(c)) { if (!s.arc && s.len <= BTOL) continue; cSegs.push(s); }
  const hits = collectTrimHits(tSegs, target, cSegs);
  let best: TrimHit | null = null, bestD = tol;
  for (const h of hits) {
    const k = Math.max(0, Math.min(Math.floor(h.u), m - 1));
    let du = Math.abs(h.u - U);
    if (target.closed) du = Math.min(du, m - du);   // S179 audit：闭合 param 空间 modulo-m，u≈0/u≈m 接缝两侧要取环绕最短差（否则跨缝交点被当成隔成条路径远，snap 失效）
    const d = du * Math.max(tSegs[k].len, BTOL);
    if (d < bestD) { bestD = d; best = h; }
  }
  if (best) { U = best.u; P = clonePt(best.p); }
  const mk = (piece: TrimPath | null): TrimPath[] => (piece ? [piece] : []);
  if (target.closed) {
    // 断开成一条开放路径：由 U 绕一圈 (U+m) 返 U
    return { kind: 'parts', parts: mk(extractSpan(tSegs, target.verts, U, U + m, P, P)) };
  }
  // 开放：断喺端点无意义
  if (U <= 1e-9 || U >= m - 1e-9) return null;
  const a = extractSpan(tSegs, target.verts, 0, U, target.verts[0], P);
  const b = extractSpan(tSegs, target.verts, U, m, P, target.verts[n - 1]);
  // S179 audit：坐标空间去 sliver —— snap 后 param 守卫(1e-9)可能放过坐标级近零碎片(端点附近交点)，跌包围盒对角 ≤ BTOL 嘅段。
  const tiny = (q: TrimPath): boolean => { let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity; for (const v of q.verts) { if (v[0] < mnx) mnx = v[0]; if (v[1] < mny) mny = v[1]; if (v[0] > mxx) mxx = v[0]; if (v[1] > mxy) mxy = v[1]; } return Math.hypot(mxx - mnx, mxy - mny) <= BTOL };
  const parts = [...mk(a), ...mk(b)].filter((q) => !tiny(q));
  return parts.length >= 1 ? { kind: 'parts', parts } : null;
}

/**
 * 预览专用 (S158): 返回 click 会被【删除】嗰段 (修剪红色 ghost)。镜 trimPathAt 嘅命中/括交点逻辑,
 * 但抽出 REMOVED 跨度而唔系 kept parts。无击中 → null;无交点 / 单交点(闭合) → 成条 target(整条会删)。
 * 纯只读,唔改 target。
 */
export function trimRemovedSpanAt(
  target: TrimPath,
  cutters: TrimPath[],
  click: Pt,
  tol: number,
): TrimPath | null {
  const n = target.verts.length;
  if (n < 2) return null;
  const tSegs = trimSegsOf(target);
  const m = tSegs.length;
  if (m < 1) return null;
  let hitI = -1;
  let hitT = 0;
  let hitD = Infinity;
  for (let i = 0; i < m; i++) {
    const r = segNearest(tSegs[i], click);
    if (r.d < hitD) { hitD = r.d; hitI = i; hitT = r.t; }
  }
  if (hitI < 0 || hitD > tol) return null;
  const uc = hitI + hitT;
  const cSegs: BoolSeg[] = [];
  for (const c of cutters) {
    for (const s of trimSegsOf(c)) {
      if (!s.arc && s.len <= BTOL) continue;
      cSegs.push(s);
    }
  }
  const whole = (): TrimPath => ({ verts: target.verts.map(clonePt), bulges: [...target.bulges], closed: target.closed });
  const hits = collectTrimHits(tSegs, target, cSegs);
  if (hits.length === 0) return whole(); // 无相交 → 整条删
  let h1: TrimHit | null = null;
  let h2: TrimHit | null = null;
  for (const h of hits) {
    if (h.u < uc && (h1 === null || h.u > h1.u)) h1 = h;
    if (h.u > uc && (h2 === null || h.u < h2.u)) h2 = h;
  }
  if (target.closed) {
    // 删除跨度 = lo →(顺,过 uc)→ hi (trimPathAt 嘅 kept 跨度 hi→wrap→lo 嘅补集)
    const lo = h1 ?? { u: hits[hits.length - 1].u - m, p: hits[hits.length - 1].p };
    const hi = h2 ?? { u: hits[0].u + m, p: hits[0].p };
    if (lo.u + m - hi.u <= 1e-12) return whole(); // 单交点 → 整条删
    return extractSpan(tSegs, target.verts, lo.u, hi.u, lo.p, hi.p);
  }
  // 开放路径: 删除 = [h1?起点 .. h2?末端]
  const S = h1 !== null ? h1.u : 0;
  const E = h2 !== null ? h2.u : m;
  const pS = h1 !== null ? h1.p : clonePt(target.verts[0]);
  const pE = h2 !== null ? h2.p : clonePt(target.verts[n - 1]);
  if (E - S <= 1e-9) return null;
  return extractSpan(tSegs, target.verts, S, E, pS, pE);
}

/**
 * 单击延伸: 延长开放路径较近末段嘅自由端, 去到最近 cutter 交点。
 *   - 直线段 → 沿段方向由自由端射出射线 (长 1e5)
 *   - 弧段 → 沿同一个圆同向继续 (互补弧, 最多接近全圆), bulge 按新扫角重算
 * click 必须喺末段 tol 内、且喺自由端嗰半 (t 过中点向自由端) — 否则 null;
 * 闭合路径 / 无交点 → null。
 */
export function extendPathAt(
  target: TrimPath,
  cutters: TrimPath[],
  click: Pt,
  tol: number,
): TrimPath | null {
  if (target.closed) return null;
  const n = target.verts.length;
  if (n < 2) return null;
  const tSegs = trimSegsOf(target);
  const m = tSegs.length;
  // 候选末段: 首段 (自由端 verts[0], 要求 t<0.5) / 末段 (自由端 verts[n−1], t>0.5)
  let atStart = false;
  let found = false;
  let foundD = Infinity;
  const r0 = segNearest(tSegs[0], click);
  if (r0.d <= tol && r0.t < 0.5) {
    found = true;
    atStart = true;
    foundD = r0.d;
  }
  const r1 = segNearest(tSegs[m - 1], click);
  if (r1.d <= tol && r1.t > 0.5 && r1.d < foundD) {
    found = true;
    atStart = false;
  }
  if (!found) return null;
  const segIdx = atStart ? 0 : m - 1;
  // 定向睇段: A (锚点) → F (自由端); 自由端喺头 → 反转方向, bulge 取负
  const A = atStart ? target.verts[1] : target.verts[n - 2];
  const F = atStart ? target.verts[0] : target.verts[n - 1];
  const boRaw = bulgeOf(target.bulges, segIdx);
  const bo = atStart ? -boRaw : boRaw;
  if (dist(A, F) <= EPS) return null; // 末段退化 (零弦)
  // 续延段: 直线 → 射线; 弧 → 互补弧 (同圆心半径, 直接砌 BoolSeg 免重算漂移)
  let cont: BoolSeg;
  let arcSeg: BoolSeg | null = null;
  if (Math.abs(bo) < EPS) {
    const L = dist(A, F);
    const ux = (F[0] - A[0]) / L;
    const uy = (F[1] - A[1]) / L;
    const RAY = 1e5; // 「无限」射线长度
    const tip: Pt = [F[0] + ux * RAY, F[1] + uy * RAY];
    cont = mkBoolSeg(F, tip, 0);
  } else {
    const s = mkBoolSeg(A, F, bo);
    arcSeg = s;
    const rest = TAU - Math.abs(s.delta);
    if (rest * s.R <= BTOL) return null; // 已近全圆, 冇得再延
    cont = {
      a: F,
      b: clonePt(A), // 互补弧终点 = 锚点 (差啲就全圆)
      bulge: Math.sign(bo) * Math.tan(rest / 4),
      arc: true,
      cx: s.cx,
      cy: s.cy,
      R: s.R,
      phiA: Math.atan2(F[1] - s.cy, F[0] - s.cx),
      delta: Math.sign(s.delta) * rest,
      len: s.R * rest,
    };
  }
  // 同全部 cutter 段求交 (recPoint 已 snap 走 t≈0 嘅自由端重合点)
  const book: SegBook = { seg: cont, splits: [], onIvs: [] };
  for (const c of cutters) {
    for (const cs of trimSegsOf(c)) {
      if (!cs.arc && cs.len <= BTOL) continue;
      const cb: SegBook = { seg: cs, splits: [], onIvs: [] };
      xSegs(book, cb);
    }
  }
  if (book.splits.length === 0) return null;
  let best = book.splits[0];
  for (const sp of book.splits) if (sp.t < best.t) best = sp; // 最近交点
  // 替换自由端; 弧段按扩大后扫角重算 bulge
  const outV = target.verts.map(clonePt);
  const outB: number[] = [];
  for (let i = 0; i < m; i++) outB.push(bulgeOf(target.bulges, i));
  let nb = outB[segIdx];
  if (arcSeg !== null) {
    const th = Math.abs(arcSeg.delta);
    const newSweep = th + best.t * (TAU - th);
    const nbo = Math.sign(bo) * Math.tan(newSweep / 4);
    nb = atStart ? -nbo : nbo;
  }
  if (atStart) {
    outV[0] = clonePt(best.p);
    outB[0] = nb;
  } else {
    outV[n - 1] = clonePt(best.p);
    outB[m - 1] = nb;
  }
  return { verts: outV, bulges: outB, closed: false };
}
