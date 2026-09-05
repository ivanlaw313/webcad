// 草图 → DXF（R12 ASCII）真实体导出 — 升级自 store.ts sketchToDxf 嘅「全部压平成 LINE 折线」。
// 输出真 DXF 实体（CIRCLE / ARC / LWPOLYLINE）令下游 AutoCAD / 激光 CAM 可以直接编辑半径，文件更细：
//   rect            → 一个 closed LWPOLYLINE（4 顶点，70 bit1 闭合）
//   circle          → 真 CIRCLE 实体（10/20 圆心，40 半径）
//   poly + arc{a,b,m} → 真 ARC 实体（三点外接圆 → 圆心/半径/起止角度，度数，DXF 规定 CCW）
//   poly（普通折线/多边形/已 tessellate 嘅样条 pts） → closed LWPOLYLINE
//   poly + smooth（样条）→ 暂降级为 LWPOLYLINE（pts 已 tessellate）；真 SPLINE 实体太复杂，留待将来。
//
// Self-contained（零 import，唔 import store 避免循环依赖）：本地 copy 一份 SketchShape / Pt 类型定义。
// 数字格式同 store.ts dxfNum 一致：|x|<1e-9 → 0、6 位定点、去尾零，杜绝「1.2e-15」科学计数法（部分 DXF/激光解析器拒收）。

export type Pt = [number, number]
export type SketchShape =
  | { type: 'rect'; a: Pt; b: Pt }
  | { type: 'circle'; c: Pt; r: number }
  | { type: 'poly'; pts: Pt[]; ctrl?: Pt[]; smooth?: boolean; arc?: { a: Pt; b: Pt; m: Pt }; verts?: Pt[]; bulges?: number[] }

// R12 DXF HEADER 声明 $INSUNITS=4（毫米）— 同 store.ts DXF_HEADER 完全一致，
// 令激光机 / CAD 用正确单位导入（无单位 DXF 可能当英寸 → 大 25.4 倍）。
const DXF_HEADER = '0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n'

// 坐标 / 数字 → 干净定点字符串。
const dxfNum = (x: number): string => `${+(Math.abs(x) < 1e-9 ? 0 : x).toFixed(6)}`

/** 一个 closed LWPOLYLINE 实体（group 90 = 顶点数，70 = 1 闭合，每点 10/20）。 */
function lwpolyline(pts: Pt[]): string {
  let s = `0\nLWPOLYLINE\n8\n0\n90\n${pts.length}\n70\n1\n`
  for (const p of pts) s += `10\n${dxfNum(p[0])}\n20\n${dxfNum(p[1])}\n`
  return s
}

/** 带圆弧段嘅 closed LWPOLYLINE（每顶点 10/20 后跟 42 bulge，0 省略）。
 *  【符号】webcad bulge 正=凸向行进左侧；DXF 正 bulge = 起→止 CCW = 凸向行进右侧 — 啱啱相反，导出取反。 */
function lwpolylineBulge(verts: Pt[], bulges: number[]): string {
  let s = `0\nLWPOLYLINE\n8\n0\n90\n${verts.length}\n70\n1\n`
  for (let i = 0; i < verts.length; i++) {
    s += `10\n${dxfNum(verts[i][0])}\n20\n${dxfNum(verts[i][1])}\n`
    const b = bulges[i] || 0
    if (Math.abs(b) > 1e-12) s += `42\n${dxfNum(-b)}\n`
  }
  return s
}

/** 真 CIRCLE 实体。 */
function circleEntity(c: Pt, r: number): string {
  return `0\nCIRCLE\n8\n0\n10\n${dxfNum(c[0])}\n20\n${dxfNum(c[1])}\n40\n${dxfNum(r)}\n`
}

/**
 * 由三点 a / b / m 求外接圆（圆心 + 半径）。三点共线 → 返回 null（退化，无圆弧）。
 * 公式：两条弦（a→b、a→m）嘅垂直平分线交点即圆心。
 */
function circleFrom3(a: Pt, b: Pt, m: Pt): { c: Pt; r: number } | null {
  const ax = a[0], ay = a[1], bx = b[0], by = b[1], mx = m[0], my = m[1]
  // d = 2 ×（叉积 / 行列式）；共线时 d≈0。
  const d = 2 * (ax * (by - my) + bx * (my - ay) + mx * (ay - by))
  if (Math.abs(d) < 1e-9) return null
  const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, m2 = mx * mx + my * my
  const cx = (a2 * (by - my) + b2 * (my - ay) + m2 * (ay - by)) / d
  const cy = (a2 * (mx - bx) + b2 * (ax - mx) + m2 * (bx - ax)) / d
  const r = Math.hypot(ax - cx, ay - cy)
  return { c: [cx, cy], r }
}

/** 角度（弧度）正规化到 [0, 2π)。 */
function norm2pi(t: number): number {
  let x = t % (2 * Math.PI)
  if (x < 0) x += 2 * Math.PI
  return x
}

/**
 * 真 ARC 实体（由三点 a/b/m）。DXF ARC 一定逆时针（CCW）由 50 起角扫到 51 止角。
 * 关键：要正确判定方向令圆弧途中经过 m 点。
 *   1. 算 a、b、m 三点相对圆心嘅角度。
 *   2. 假设 a→b（CCW，角度递增）；睇 m 嘅角度系咪喺呢段 CCW 扫描区间内。
 *   3. 唔喺 → swap 起止（即用 b→a 段，另一段弧），令弧确实经过 m。
 * 退化（共线）→ 返回 null，由 caller 退回 LWPOLYLINE。
 */
function arcEntity(a: Pt, b: Pt, m: Pt): string | null {
  const cir = circleFrom3(a, b, m)
  if (!cir) return null
  const { c, r } = cir
  const angA = norm2pi(Math.atan2(a[1] - c[1], a[0] - c[0]))
  const angB = norm2pi(Math.atan2(b[1] - c[1], b[0] - c[0]))
  const angM = norm2pi(Math.atan2(m[1] - c[1], m[0] - c[0]))
  // CCW 由 start 扫到某角 t 嘅「行程」（[0,2π)）。
  const sweep = (start: number, t: number) => norm2pi(t - start)
  // 假设 a 起 b 止（CCW）：m 必须落喺呢段内（行程 ≤ a→b 行程）。
  let start = angA, end = angB
  if (sweep(angA, angM) > sweep(angA, angB)) {
    // m 唔喺 a→b CCW 段 → 反过嚟用 b→a CCW 段。
    start = angB
    end = angA
  }
  const startDeg = (start * 180) / Math.PI
  const endDeg = (end * 180) / Math.PI
  return `0\nARC\n8\n0\n10\n${dxfNum(c[0])}\n20\n${dxfNum(c[1])}\n40\n${dxfNum(r)}\n50\n${dxfNum(startDeg)}\n51\n${dxfNum(endDeg)}\n`
}

/** 单个 SketchShape → 一段 DXF entities 文本。 */
function shapeToEntities(sh: SketchShape): string {
  if (sh.type === 'circle') return circleEntity(sh.c, sh.r)
  if (sh.type === 'rect') {
    const [x0, y0] = sh.a, [x1, y1] = sh.b
    return lwpolyline([[x0, y0], [x1, y0], [x1, y1], [x0, y1]])
  }
  // poly
  if (sh.arc) {
    const arc = arcEntity(sh.arc.a, sh.arc.b, sh.arc.m)
    if (arc) return arc
    // 三点退化（共线）→ 退回折线（pts 系显示用 tessellation）。
  }
  // 混合直线/圆弧路径 → 真弧 LWPOLYLINE（42 bulge），AutoCAD / 激光 CAM 见到真圆弧可改半径。
  if (sh.verts && sh.bulges && !sh.smooth) return lwpolylineBulge(sh.verts, sh.bulges)
  // 普通折线 / 多边形 / smooth 样条（pts 已 tessellate，暂降级为折线，唔 emit 真 SPLINE）。
  return lwpolyline(sh.pts)
}

/**
 * 草图轮廓 → DXF R12 ASCII（ENTITIES 段，真 CIRCLE / ARC / LWPOLYLINE 实体）。
 * 带 $INSUNITS=4（毫米）header，同 store.ts sketchToDxf 输出同源同单位，可直接替换。
 */
export function shapesToDxfEntities(shapes: SketchShape[]): string {
  return `${DXF_HEADER}0\nSECTION\n2\nENTITIES\n${shapes.map(shapeToEntities).join('')}0\nENDSEC\n0\nEOF\n`
}
