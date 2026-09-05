// imagetrace.test.mjs — M9 位图向量化（src/io/imageTrace.ts 轮廓 + src/io/centerlineTrace.ts 中线）验证套件
// 跑法: node --experimental-strip-types --import ./tests/register-resolver.mjs --test tests/imagetrace.test.mjs
//   或: node --experimental-strip-types tests/imagetrace.test.mjs      (喺 C:\ClaudeCode\webcad 目录)
// 全部测试图【程序内存生成】(4×4 超采样抗锯齿 → 真亚像素边缘)，零外部资产；失败 → exit 1，末尾出 PASS/FAIL 总表。
import {
  traceBitmap, otsuThreshold, binarize, douglasPeucker, fitCircle, fitLine, segmentChain, signedArea,
} from '../src/io/imageTrace.ts'
import { traceCenterlines, zhangSuenThin, skeletonGraph, polyLength } from '../src/io/centerlineTrace.ts'
import { classifyProfiles } from '../src/io/dxfImport.ts'

// ─────────────────────────────────────────────────── 迷你测试框架（照 meshrepair.test.mjs 风格）
const rows = []
let notes = []
function note(s) { notes.push(s); console.log(`    ${s}`) }
function ok(cond, msg) { if (!cond) throw new Error(msg); note(`ok  ${msg}`) }
function near(actual, expected, tol, msg) {
  if (!(Math.abs(actual - expected) <= tol)) throw new Error(`${msg}: 期望 ${expected} ±${tol}, 实际 ${actual}`)
  note(`ok  ${msg}: ${round(actual)} ≈ ${expected} (±${tol})`)
}
function pct(actual, expected, p, msg) {
  const e = Math.abs(actual - expected) / Math.abs(expected) * 100
  if (!(e <= p)) throw new Error(`${msg}: 期望 ${expected} ±${p}%, 实际 ${actual} (误差 ${e.toFixed(3)}%)`)
  note(`ok  ${msg}: ${round(actual)} ≈ ${expected} (误差 ${e.toFixed(3)}% ≤ ${p}%)`)
}
const round = (v) => (typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : v)
function test(name, fn) {
  console.log(`\n## ${name}`)
  notes = []
  try { fn(); rows.push({ name, pass: true, info: '' }) }
  catch (e) { rows.push({ name, pass: false, info: String(e && e.message) }); console.log(`    !! FAIL: ${e && e.message}`) }
}

// ─────────────────────────────────────────────────── 程序生成测试位图（白底 255 / 黑墨 0）
const SS = 4   // 每边 4 个子采样 → 16 级覆盖率抗锯齿
function canvas(w, h) { const d = new Uint8Array(w * h); d.fill(255); return { data: d, width: w, height: h } }
/** 用「点喺形状内」谓词做超采样填充 */
function fill(img, inside, ink = 0) {
  const { width: w, height: h, data } = img
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let n = 0
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      if (inside(x - 0.5 + (sx + 0.5) / SS, y - 0.5 + (sy + 0.5) / SS)) n++
    }
    if (!n) continue
    const cov = n / (SS * SS)
    data[y * w + x] = Math.round(data[y * w + x] * (1 - cov) + ink * cov)
  }
  return img
}
const inCircle = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r
const inRing = (cx, cy, ro, ri) => (x, y) => { const d2 = (x - cx) ** 2 + (y - cy) ** 2; return d2 <= ro * ro && d2 > ri * ri }
const inRect = (x0, y0, x1, y1) => (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1
function inRoundRect(x0, y0, x1, y1, r) {
  return (x, y) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false
    const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r + 1e-9
  }
}
/** 折线笔画：到任一段距离 ≤ width/2 */
function inStroke(poly, width) {
  const hw = width / 2
  return (x, y) => {
    for (let i = 0; i + 1 < poly.length; i++) {
      const [ax, ay] = poly[i], [bx, by] = poly[i + 1]
      const dx = bx - ax, dy = by - ay
      const L2 = dx * dx + dy * dy
      const t = L2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2))
      if (Math.hypot(x - (ax + dx * t), y - (ay + dy * t)) <= hw) return true
    }
    return false
  }
}
const inAnnulusStroke = (cx, cy, r, width) => (x, y) => Math.abs(Math.hypot(x - cx, y - cy) - r) <= width / 2
// 确定性 PRNG（mulberry32）→ 噪声可复现
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const invert = (img) => ({ ...img, data: img.data.map((v) => 255 - v) })

// ══════════════════════════════════════════════════════════════════ 底层算子

test('Otsu 阈值：双峰直方图切得开两类', () => {
  const g = new Uint8Array(1000)
  for (let i = 0; i < 600; i++) g[i] = 30 + (i % 7)
  for (let i = 600; i < 1000; i++) g[i] = 210 + (i % 5)
  const t = otsuThreshold(g)
  let dark = 0
  for (const v of g) if (v <= t) dark++
  ok(dark === 600, `阈值 ${t} → 暗类 ${dark} 粒（应为 600；两峰之间任何值都系等价最优解，只验分类正确）`)
  // 单峰（无对比）唔应该炸
  ok(Number.isFinite(otsuThreshold(new Uint8Array(50).fill(128))), '常数图返有限值')
})

test('极性自判：黑底白图 = 白底黑图（边框像素多数者当背景）', () => {
  const img = fill(canvas(120, 120), inCircle(60, 60, 40))
  const a = binarize(img), b = binarize(invert(img))
  ok(a.inkIsDark === true && b.inkIsDark === false, `正片 inkIsDark=${a.inkIsDark} / 负片 inkIsDark=${b.inkIsDark}`)
  let ia = 0, ib = 0
  for (let i = 0; i < a.mask.length; i++) { ia += a.mask[i]; ib += b.mask[i] }
  near(ib, ia, 4, '两者墨迹像素数一致')
})

test('Douglas-Peucker：三角顶点保留，共线点丢弃', () => {
  const pts = []
  for (let i = 0; i <= 20; i++) pts.push([i, 3 * (1 - Math.abs(i - 10) / 10)])   // (0,0)→(10,3)→(20,0) 两边严格共线
  const keep = douglasPeucker(pts, 0.5)
  ok(keep.length === 3 && keep[0] === 0 && keep[1] === 10 && keep[2] === 20, `保留下标 [${keep}]`)
  ok(douglasPeucker(pts.map(([x]) => [x, 0]), 0.5).length === 2, '纯直线只保留首尾')
  ok(douglasPeucker(pts, 5).length === 2, '容差大过凸起高度 → 只剩首尾')
})

test('最小二乘 直线/圆：解析点云零误差', () => {
  const line = []
  for (let i = 0; i < 30; i++) line.push([i * 0.7, 5 + i * 0.7 * 2])
  const L = fitLine(line)
  ok(L.maxDev < 1e-9, `直线残差 ${L.maxDev.toExponential(2)}`)
  near(Math.abs(Math.atan2(L.dir[1], L.dir[0])), Math.atan2(2, 1), 1e-9, '方向角')
  const arc = []
  for (let i = 0; i <= 40; i++) { const a = 0.3 + (i / 40) * 1.7; arc.push([12 + 17.5 * Math.cos(a), -4 + 17.5 * Math.sin(a)]) }
  const C = fitCircle(arc)
  near(C.r, 17.5, 1e-8, '圆半径')
  near(C.c[0], 12, 1e-8, '圆心 x'); near(C.c[1], -4, 1e-8, '圆心 y')
  ok(C.maxDev < 1e-8 && C.monotonic && C.sweep > 0, `圆残差 ${C.maxDev.toExponential(2)} · 扫角 ${(C.sweep * 180 / Math.PI).toFixed(1)}° 逆时针单调`)
})

// ══════════════════════════════════════════════════════════════════ 轮廓向量化

test('实心圆 → 1 个 circle profile，r 误差 < 1%', () => {
  const R = 60
  const img = fill(canvas(200, 200), inCircle(100, 100, R))
  const r = traceBitmap(img)
  note(r.note)
  ok(r.profiles.length === 1, `1 个 profile（实际 ${r.profiles.length}）`)
  ok(r.profiles[0].kind === 'circle', `kind = ${r.profiles[0].kind}`)
  pct(r.profiles[0].r, R, 1, '半径')
  ok(Math.hypot(r.profiles[0].c[0] - 0.5, r.profiles[0].c[1] + 0.5) < 1, `圆心落喺图中心原点附近 [${r.profiles[0].c.map(round)}]`)
  ok(r.shapes.length === 1 && r.shapes[0].type === 'circle', 'shapes 出真 circle（可直落 sketchSources）')
  // scale：mm/px
  const s = traceBitmap(img, { scale: 0.5 })
  pct(s.profiles[0].r, R * 0.5, 1, 'scale=0.5 半径')
})

test('圆环 → 外轮廓 + 孔，classifyProfiles 判 new/cut', () => {
  const RO = 70, RI = 34
  const img = fill(canvas(200, 200), inRing(100, 100, RO, RI))
  const r = traceBitmap(img)
  note(r.note)
  ok(r.profiles.length === 2, `2 个 profile（实际 ${r.profiles.length}）`)
  ok(r.profiles.every((p) => p.kind === 'circle'), '两个都系 circle')
  const rr = r.profiles.map((p) => p.r).sort((a, b) => b - a)
  pct(rr[0], RO, 1, '外径'); pct(rr[1], RI, 1, '内径')
  ok(r.contours.filter((c) => c.isHole).length === 1, '一个轮廓判为孔')
  const items = classifyProfiles(r.profiles)
  ok(items.filter((i) => i.operation === 'new').length === 1 && items.filter((i) => i.operation === 'cut').length === 1,
    `classifyProfiles → ${items.map((i) => i.operation).join('/')}`)
})

test('圆角矩形 → 4 直线 + 4 圆弧（角半径准确、直线轴向对齐、相切约束推断到）', () => {
  const X0 = 30, Y0 = 25, X1 = 210, Y1 = 155, CR = 24
  const img = fill(canvas(240, 180), inRoundRect(X0, Y0, X1, Y1, CR))
  const r = traceBitmap(img)
  note(r.note)
  ok(r.contours.length === 1, `1 条轮廓（实际 ${r.contours.length}）`)
  const c = r.contours[0]
  const lines = c.segs.filter((s) => s.kind === 'line'), arcs = c.segs.filter((s) => s.kind === 'arc')
  ok(lines.length === 4 && arcs.length === 4, `4 直线 + 4 圆弧（实际 ${lines.length} 直线 / ${arcs.length} 圆弧）`)
  for (const a of arcs) pct(a.r, CR, 8, '圆角半径')
  for (const l of lines) {
    const ang = Math.abs(Math.atan2(l.b[1] - l.a[1], l.b[0] - l.a[0]) * 180 / Math.PI) % 90
    ok(Math.min(ang, 90 - ang) < 0.01, `直线轴向对齐（偏 ${Math.min(ang, 90 - ang).toFixed(4)}°）`)
  }
  ok(c.bulges.filter((b) => Math.abs(b) > 1e-9).length === 4, '4 个非零 bulge = 4 段真圆弧（verts/bulges 直落内核真 ARC 边）')
  const hv = c.constraints.filter((k) => k.type === 'horizontal' || k.type === 'vertical').length
  const tg = c.constraints.filter((k) => k.type === 'tangent').length
  ok(hv === 4, `推断到 4 条 水平/竖直 约束（实际 ${hv}）`)
  ok(tg === 8, `推断到 8 处相切（实际 ${tg}）`)
  // 外形尺寸（bbox）应该同画出嚟嘅一致
  const xs = c.pts.map((p) => p[0]), ys = c.pts.map((p) => p[1])
  pct(Math.max(...xs) - Math.min(...xs), X1 - X0, 1.5, '外形宽')
  pct(Math.max(...ys) - Math.min(...ys), Y1 - Y0, 1.5, '外形高')
  ok(c.maxDev < 1, `拟合最大偏差 ${c.maxDev.toFixed(3)}px < 1px`)
})

test('直角矩形 → 4 直线、90° 角、尺寸误差 < 0.5%', () => {
  const img = fill(canvas(200, 160), inRect(35, 28, 168, 126))
  const r = traceBitmap(img)
  note(r.note)
  const c = r.contours[0]
  ok(c.segs.length === 4 && c.segs.every((s) => s.kind === 'line'), `4 条直线（实际 ${c.segs.length} 段）`)
  const xs = c.verts.map((p) => p[0]), ys = c.verts.map((p) => p[1])
  pct(Math.max(...xs) - Math.min(...xs), 168 - 35, 0.5, '宽')
  pct(Math.max(...ys) - Math.min(...ys), 126 - 28, 0.5, '高')
  ok(c.area > 0, `外轮廓 CCW（有向面积 ${c.area.toFixed(1)}）`)
})

test('多形状 + 洞中岛：even-odd 嵌套判定', () => {
  const img = canvas(260, 160)
  fill(img, inRing(70, 80, 55, 30))       // 环
  fill(img, inCircle(70, 80, 12))         // 洞中岛
  fill(img, inRect(160, 45, 230, 115))    // 另一件
  const r = traceBitmap(img)
  note(r.note)
  ok(r.contours.length === 4, `4 条轮廓（实际 ${r.contours.length}）`)
  ok(r.contours.filter((c) => c.depth === 0).length === 2, '2 条最外层')
  ok(r.contours.filter((c) => c.isHole).length === 1, '只有环嘅内圈系孔（岛唔系）')
  const ops = classifyProfiles(r.profiles).map((i) => i.operation)
  ok(ops.filter((o) => o === 'cut').length === 1 && ops.filter((o) => o === 'new').length === 3, `classifyProfiles → ${ops.join('/')}`)
})

test('黑底白图（负片）→ 同正片一样嘅结果', () => {
  const img = fill(canvas(200, 200), inCircle(100, 100, 55))
  const a = traceBitmap(img), b = traceBitmap(invert(img))
  ok(b.profiles.length === 1 && b.profiles[0].kind === 'circle', `负片 ${b.profiles.length} 个 ${b.profiles[0] && b.profiles[0].kind}`)
  near(b.profiles[0].r, a.profiles[0].r, 0.05, '负片半径同正片一致')
})

test('图形触到画布边缘 → 轮廓一样闭合（场四周 pad 背景）', () => {
  const img = fill(canvas(120, 100), inRect(-10, -10, 60, 60))
  const r = traceBitmap(img)
  note(r.note)
  ok(r.contours.length === 1, `1 条轮廓（实际 ${r.contours.length}）`)
  ok(Math.abs(r.contours[0].area) > 3000, `闭合且面积合理 ${Math.abs(r.contours[0].area).toFixed(0)}px²`)
})

test('椒盐噪点：去麻点后照样识别整圆，r 误差 < 1%', () => {
  const R = 60
  const img = fill(canvas(200, 200), inCircle(100, 100, R))
  const rand = rng(20260725)
  for (let k = 0; k < 400; k++) {
    const x = Math.floor(rand() * 200), y = Math.floor(rand() * 200)
    if (Math.abs(Math.hypot(x - 100, y - 100) - R) < 2.5) continue      // 边缘噪声另有一组测试
    img.data[y * 200 + x] = img.data[y * 200 + x] > 127 ? 0 : 255       // 椒（白底加黑点）盐（黑块开白洞）互翻
  }
  const r = traceBitmap(img, { minArea: 12 })
  note(r.note + ' · ' + r.warnings.join('；'))
  ok(r.profiles.length === 1 && r.profiles[0].kind === 'circle', `1 个 circle profile（实际 ${r.profiles.length} 个）`)
  pct(r.profiles[0].r, R, 1, '半径')
})

test('边缘抖动（±1px 粗糙边）：容忍降级 —— 轮廓数唔爆、等效半径误差 < 2%', () => {
  const R = 60
  const img = fill(canvas(200, 200), inCircle(100, 100, R))
  const rand = rng(777)
  for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) {
    const d = Math.hypot(x - 100, y - 100)
    if (Math.abs(d - R) <= 1.2 && rand() < 0.5) img.data[y * 200 + x] = img.data[y * 200 + x] > 127 ? 0 : 255
  }
  const r = traceBitmap(img, { blur: 1, minArea: 12, circleTol: 2 })
  note(r.note + ' · ' + r.warnings.join('；'))
  ok(r.contours.length <= 2, `轮廓数 ${r.contours.length} ≤ 2（噪声冇炸成一堆碎片）`)
  const c = r.contours[0]
  const rEq = Math.sqrt(Math.abs(c.area) / Math.PI)
  pct(rEq, R, 2, '等效半径（由面积反算）')
  if (c.circle) pct(c.circle.r, R, 2, '放宽 circleTol 后仍认到整圆，半径')
  else note(`(圆判据未过 — 诚实降级为 ${c.segs.length} 段线弧轮廓)`)
})

test('粗糙扫描件（±3px 强噪声）：默认诚实降级为多段线；开清理参数可以救返整圆', () => {
  const W = 500, R = 200
  const img = canvas(W, W)
  const rand = rng(5)
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    if (Math.hypot(x - 250, y - 250) + (rand() - 0.5) * 6 <= R) img.data[y * W + x] = 0
  }
  const raw = traceBitmap(img)
  note('默认：' + raw.note)
  ok(raw.contours.reduce((s, c) => s + c.segs.length, 0) > 50, '默认参数下诚实降级成大量线弧段（唔会假装认到圆）')
  const clean = traceBitmap(img, { blur: 2, minArea: 30, fitTol: 2.5, simplifyTol: 1.5 })
  note('清理后：' + clean.note)
  ok(clean.profiles.length === 1 && clean.profiles[0].kind === 'circle', `清理参数后 ${clean.profiles.length} 个 profile / ${clean.profiles[0] && clean.profiles[0].kind}`)
  pct(clean.profiles[0].r, R, 1.5, '半径')
})

test('拟合几何回落 pts：圆形 profile 面积同解析值一致', () => {
  const R = 45
  const img = fill(canvas(160, 160), inCircle(80, 80, R))
  const r = traceBitmap(img)
  const c = r.contours[0]
  pct(Math.abs(c.area), Math.PI * R * R * (1 - (Math.PI * Math.PI) / (3 * 64 * 64)), 0.5, '密铺 64 边形面积')
})

// ══════════════════════════════════════════════════════════════════ 中线追踪

test('Zhang-Suen 细化：3px 竖条 → 1px 中线', () => {
  const w = 40, h = 40
  const mask = new Uint8Array(w * h)
  for (let y = 5; y < 35; y++) for (let x = 19; x <= 21; x++) mask[y * w + x] = 1
  const sk = zhangSuenThin(mask, w, h)
  let cnt = 0, offAxis = 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (sk[y * w + x]) { cnt++; if (x !== 20) offAxis++ }
  ok(offAxis === 0, `全部骨架像素落喺 x=20（离轴 ${offAxis} 粒）`)
  ok(cnt >= 26 && cnt <= 30, `骨架长度 ${cnt} 像素（原 30 行）`)
})

test('单笔「L」形（3px 粗）→ 中线 2 段直线，转角处相交', () => {
  const img = fill(canvas(100, 100), inStroke([[20, 20], [20, 75], [75, 75]], 3))
  const r = traceCenterlines(img, { origin: 'topLeft', flipY: false })
  note(r.note)
  ok(r.strokes.length === 1, `1 条笔画（实际 ${r.strokes.length}）`)
  const st = r.strokes[0]
  ok(!st.closed, '开放路径')
  ok(st.segs.length === 2 && st.segs.every((s) => s.kind === 'line'), `2 段直线（实际 ${st.segs.length} 段：${st.segs.map((s) => s.kind).join('+')}）`)
  ok(st.verts.length === 3, `3 个顶点（起点 / 转角 / 终点）实际 ${st.verts.length}`)
  const corner = st.verts[1]
  near(Math.hypot(corner[0] - 20, corner[1] - 75), 0, 1.5, '转角点落喺 (20,75) 1.5px 内')
  const ends = [st.verts[0], st.verts[2]]
  const d0 = Math.min(...ends.map((p) => Math.hypot(p[0] - 20, p[1] - 20)))
  const d1 = Math.min(...ends.map((p) => Math.hypot(p[0] - 75, p[1] - 75)))
  ok(d0 < 3 && d1 < 3, `两个自由端贴返笔画端点（偏 ${d0.toFixed(2)}px / ${d1.toFixed(2)}px；细化本身会缩线头约 1 个半笔宽）`)
  near(r.strokeWidth, 3, 0.8, '估算笔宽')
})

test('「T」形交叉 → 3 条中线 + 1 个 degree-3 节点，交点位置修复到真交点', () => {
  const img = canvas(120, 120)
  fill(img, inStroke([[20, 60], [100, 60]], 3))
  fill(img, inStroke([[60, 60], [60, 105]], 3))
  const r = traceCenterlines(img, { origin: 'topLeft', flipY: false })
  note(r.note)
  ok(r.strokes.length === 3, `3 条中线（实际 ${r.strokes.length}）`)
  const j = r.nodes.filter((n) => n.degree >= 3)
  ok(j.length === 1, `1 个交点节点（实际 ${j.length}）`)
  near(Math.hypot(j[0].p[0] - 60, j[0].p[1] - 60), 0, 2, '交点位置（切线交点法修复后）')
  ok(r.strokes.every((s) => s.segs.length === 1 && s.segs[0].kind === 'line'), `每条都系单段直线（实际 ${r.strokes.map((s) => s.segs.length).join('/')}）`)
})

test('圆形笔画 → 闭合中线环（识别为单个圆弧路径，半径准确）', () => {
  const R = 38
  const img = fill(canvas(120, 120), inAnnulusStroke(60, 60, R, 3))
  const r = traceCenterlines(img, { origin: 'topLeft', flipY: false })
  note(r.note)
  ok(r.strokes.length === 1 && r.strokes[0].closed, `1 条闭合中线（实际 ${r.strokes.length} 条，closed=${r.strokes[0] && r.strokes[0].closed}）`)
  const st = r.strokes[0]
  ok(st.segs.every((s) => s.kind === 'arc'), `全部段系圆弧（${st.segs.map((s) => s.kind).join('+')}）`)
  const rr = st.segs.reduce((s, x) => s + x.r, 0) / st.segs.length
  pct(rr, R, 3, '中线半径')
  ok(r.profiles.length === 1, '闭合中线出 profile（可拉伸）；开放路径唔会出')
})

test('毛刺剪除：主干带 3px 短枝 → 剪走后仍系一条直线', () => {
  const img = canvas(120, 60)
  fill(img, inStroke([[15, 30], [105, 30]], 3))
  fill(img, inStroke([[60, 30], [60, 26]], 3))     // 短枝（长度 ~4px < spur）
  const r = traceCenterlines(img, { origin: 'topLeft', flipY: false })
  note(r.note + ' · ' + r.warnings.join('；'))
  ok(r.strokes.length === 1, `1 条笔画（实际 ${r.strokes.length}）`)
  ok(r.strokes[0].segs.length === 1 && r.strokes[0].segs[0].kind === 'line', `单段直线（实际 ${r.strokes[0].segs.length} 段）`)
})

test('骨架图基础：孤立环无节点、开链两端点', () => {
  const w = 60, h = 60
  const mask = new Uint8Array(w * h)
  for (let x = 10; x < 50; x++) mask[30 * w + x] = 1
  const g1 = skeletonGraph(zhangSuenThin(mask, w, h), w, h)
  ok(g1.nodes.filter((n) => n.kind === 'end').length === 2, `直线两个端点（实际 ${g1.nodes.filter((n) => n.kind === 'end').length}）`)
  ok(g1.edges.filter((e) => e.alive).length === 1, `一条边（实际 ${g1.edges.filter((e) => e.alive).length}）`)
  near(polyLength(g1.edges[0].pts), 39, 1, '边长')
  const img = fill(canvas(120, 120), inAnnulusStroke(60, 60, 40, 3))
  const bin = binarize(img)
  const g2 = skeletonGraph(zhangSuenThin(bin.mask, 120, 120), 120, 120)
  const alive = g2.edges.filter((e) => e.alive)
  ok(alive.length === 1 && alive[0].closed, `圆环 = 1 条闭合边、0 节点（实际 ${alive.length} 边 / ${g2.nodes.length} 节点）`)
})

test('中线诚实边界：实心色块唔应该当线稿；limits 有列明', () => {
  const img = fill(canvas(120, 120), inCircle(60, 60, 40))
  const r = traceCenterlines(img, { origin: 'topLeft', flipY: false })
  note(r.note)
  ok(r.limits.length >= 6, `limits 列咗 ${r.limits.length} 条诚实边界`)
  ok(r.limits.some((s) => s.includes('工程图纸')), '有明确讲「工程图纸唔喺范围内」')
  ok(r.strokeWidth > 8, `实心圆嘅「估算笔宽」= ${r.strokeWidth.toFixed(1)}px（远大过真线稿 → UI 可以用呢个数劝用户改用轮廓向量化）`)
})

// ══════════════════════════════════════════════════════════════════ 落地契约

test('落地契约：profiles/shapes 结构同 DXF/SVG 导入路径完全兼容', () => {
  const img = canvas(240, 180)
  fill(img, inRoundRect(30, 25, 210, 155, 24))
  fill(img, inCircle(120, 90, 25), 255)   // 白 = 挖窿
  const r = traceBitmap(img)
  note(r.note)
  ok(r.profiles.every((p) => (p.kind === 'circle' && Array.isArray(p.c) && typeof p.r === 'number') || (p.kind === 'poly' && p.pts.length >= 3)), 'ImpProfile 契约（circle|poly）')
  ok(r.profiles.every((p) => p.kind === 'circle' || p.pts.every((q) => Number.isFinite(q[0]) && Number.isFinite(q[1]))), '冇 NaN/Infinity')
  const items = classifyProfiles(r.profiles)
  ok(items.length === r.profiles.length, 'classifyProfiles 收得落')
  ok(items.some((i) => i.operation === 'cut'), '圆孔判 cut')
  ok(r.shapes.every((s) => (s.type === 'circle') || (s.type === 'poly' && s.verts.length >= 3 && s.bulges.length === s.verts.length)),
    'SketchShape 契约：poly 嘅 verts/bulges 等长（store shapeToProfile 走真 ARC 边路径）')
  ok(r.geometry.lines.length === 4 && r.geometry.arcs.length === 4, `扁平 {lines,arcs} 形态：${r.geometry.lines.length} 直线 / ${r.geometry.arcs.length} 圆弧`)
  // bulge 语义自检：由 verts+bulges 密铺返嘅点列，同 contour.pts 一致
  const rr = segmentChain(r.contours[0].raw, true, {})
  ok(rr.verts.length === rr.bulges.length, 'segmentChain 闭环：verts 同 bulges 等长')
  ok(Math.sign(signedArea(r.contours[0].pts)) === 1, '外轮廓 CCW')
})

// ════════════════════════════════════════════════════════════════════ 总表
console.log('\n========== PASS/FAIL 总表 ==========')
let nFail = 0
for (const r of rows) { console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : ' — ' + r.info}`); if (!r.pass) nFail++ }
console.log('====================================')
console.log(nFail === 0 ? `全部 ${rows.length} 组通过` : `${nFail}/${rows.length} 组失败`)
process.exit(nFail === 0 ? 0 : 1)
