// Mesh→B-rep 参数化推断 fitPrimitives 验证（spec B3，§5 全 8 case）。跑法：npx tsx tests/meshfit.test.mjs
import { fitPrimitives, detectExactAxisBox, detectExactZCylinder, detectExactSphere } from '../src/geom/meshFit.ts'
let pass = 0, fail = 0
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m) } }
const eq = (a, b, t, m) => ok(Math.abs(a - b) <= t, `${m}: 期望 ${b}±${t}, 实际 ${a}`)

// ───────────────────────── 合成网格工具 ─────────────────────────

// 沿任意轴 axis、圆心 center、半径 R、高 H，生成 NS 段圆柱侧壁（可 partial：spanFrac<1 只画一段弧）。
// 返回 { v, t }（扁平顶点/三角）。外向缠绕（法向朝外）。
function makeCylinder(center, axis, R, H, NS, spanFrac = 1) {
  // 建 ⊥axis 正交基 (u,w)
  const a = norm(axis)
  const base = Math.abs(a[0]) <= Math.abs(a[1]) && Math.abs(a[0]) <= Math.abs(a[2]) ? [1, 0, 0] : Math.abs(a[1]) <= Math.abs(a[2]) ? [0, 1, 0] : [0, 0, 1]
  const u = norm(cross(a, base))
  const w = norm(cross(a, u))
  const v = [], t = []
  const span = 2 * Math.PI * spanFrac
  const ringCount = NS + 1  // 顶点环数（partial 也 NS+1，端点不闭合）
  for (let i = 0; i < ringCount; i++) {
    const ang = span * (i / NS)  // partial: 0..span；full: 0..2π（i=NS 与 i=0 重合，靠焊接合并）
    const rx = R * (Math.cos(ang) * u[0] + Math.sin(ang) * w[0])
    const ry = R * (Math.cos(ang) * u[1] + Math.sin(ang) * w[1])
    const rz = R * (Math.cos(ang) * u[2] + Math.sin(ang) * w[2])
    // 底环 (h=0)
    v.push(center[0] + rx, center[1] + ry, center[2] + rz)
    // 顶环 (h=H)
    v.push(center[0] + rx + a[0] * H, center[1] + ry + a[1] * H, center[2] + rz + a[2] * H)
  }
  for (let i = 0; i < NS; i++) {
    const b = i * 2
    // 每段 quad = 2 三角（外向：法向指离轴）
    t.push(b, b + 2, b + 1, b + 1, b + 2, b + 3)
  }
  return { v, t }
}

function makeClosedCylinderZ(cx, cy, z0, R, H, N = 32) {
  const v = [], t = []
  for (let i = 0; i < N; i++) {
    const a = 2 * Math.PI * i / N, x = cx + R * Math.cos(a), y = cy + R * Math.sin(a)
    v.push(x, y, z0, x, y, z0 + H)
  }
  const bottomCenter = v.length / 3; v.push(cx, cy, z0)
  const topCenter = v.length / 3; v.push(cx, cy, z0 + H)
  for (let i = 0; i < N; i++) {
    const b = i * 2, n = ((i + 1) % N) * 2
    t.push(b, n, b + 1, b + 1, n, n + 1)       // side, outward
    t.push(bottomCenter, n, b, topCenter, b + 1, n + 1) // bottom −Z, top +Z
  }
  return { v, t }
}

// 单位球细分（icosphere 简化：经纬网格），返回 { v, t }。用于「纯球负向」case（唔应误认圆柱/平面）。
function makeSphere(center, R, nLat, nLon) {
  const v = [], t = []
  for (let i = 0; i <= nLat; i++) {
    const lat = Math.PI * (i / nLat) - Math.PI / 2
    for (let j = 0; j <= nLon; j++) {
      const lon = 2 * Math.PI * (j / nLon)
      v.push(
        center[0] + R * Math.cos(lat) * Math.cos(lon),
        center[1] + R * Math.cos(lat) * Math.sin(lon),
        center[2] + R * Math.sin(lat),
      )
    }
  }
  const idx = (i, j) => i * (nLon + 1) + j
  for (let i = 0; i < nLat; i++) for (let j = 0; j < nLon; j++) {
    const a = idx(i, j), b = idx(i + 1, j), c = idx(i + 1, j + 1), d = idx(i, j + 1)
    t.push(a, b, c, a, c, d)
  }
  return { v, t }
}

// Closed UV sphere with one vertex at each pole, avoiding duplicated seam and
// pole vertices so the strict closed-shell detector has a valid manifold.
function makeClosedSphere(center, R, nLat = 32, nLon = 48) {
  const v = [], t = []
  v.push(center[0], center[1], center[2] + R)
  const ring = (i, j) => 1 + (i - 1) * nLon + (j % nLon)
  for (let i = 1; i < nLat; i++) {
    const theta = Math.PI * i / nLat
    const z = center[2] + R * Math.cos(theta)
    const rr = R * Math.sin(theta)
    for (let j = 0; j < nLon; j++) {
      const phi = 2 * Math.PI * j / nLon
      v.push(center[0] + rr * Math.cos(phi), center[1] + rr * Math.sin(phi), z)
    }
  }
  const bottom = v.length / 3
  v.push(center[0], center[1], center[2] - R)
  for (let j = 0; j < nLon; j++) t.push(0, ring(1, j + 1), ring(1, j))
  for (let i = 1; i < nLat - 1; i++) for (let j = 0; j < nLon; j++) {
    const a = ring(i, j), b = ring(i, j + 1), c = ring(i + 1, j), d = ring(i + 1, j + 1)
    t.push(a, b, c, b, d, c)
  }
  for (let j = 0; j < nLon; j++) t.push(ring(nLat - 1, j), ring(nLat - 1, j + 1), bottom)
  return { v, t }
}

// 带圆孔平板（z=0 面）：规则 N×N 网格平板 [0,W]×[0,L]，中心挖半径 R 圆孔（移除圆内 quad）。
// 绕向全一致（法向 +Z），孔边缘 = 阶梯状但仍构成一个闭合内环。造【顶面 z=0】一个面，
// 验证平面区双 loop（外框 + 内圆孔）。真实 CAD 带孔面即此拓扑（一个面 2 边界环）。
function makePlateWithHole(W, L, R, N) {
  const cx = W / 2, cy = L / 2
  const v = []
  const idx = (i, j) => i * (N + 1) + j
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    v.push((j / N) * W, (i / N) * L, 0)
  }
  const inHole = (i, j) => {
    // quad (i,j)-(i+1,j+1) 嘅中心落喺圆内 → 挖走
    const x = ((j + 0.5) / N) * W, y = ((i + 0.5) / N) * L
    return Math.hypot(x - cx, y - cy) < R
  }
  const t = []
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    if (inHole(i, j)) continue
    const a = idx(i, j), b = idx(i, j + 1), c = idx(i + 1, j + 1), d = idx(i + 1, j)
    // 法向 +Z，CCW 从上看
    t.push(a, b, c, a, c, d)
  }
  return { v, t }
}

// 盒 6 面（10³）
function makeBox(S) {
  const v = [0, 0, 0, S, 0, 0, S, S, 0, 0, S, 0, 0, 0, S, S, 0, S, S, S, S, 0, S, S]
  const t = [
    0, 2, 1, 0, 3, 2,   // z=0
    4, 5, 6, 4, 6, 7,   // z=S
    0, 1, 5, 0, 5, 4,   // y=0
    2, 3, 7, 2, 7, 6,   // y=S
    1, 2, 6, 1, 6, 5,   // x=S
    0, 4, 7, 0, 7, 3,   // x=0
  ]
  return { v, t }
}

console.log('严格基本体替换门槛：只接受真正无孔的六面轴对齐盒：')
{
  const { v, t } = makeBox(10)
  const exact = detectExactAxisBox(fitPrimitives(v, t, { diag: 18 }), 18)
  ok(!!exact, '干净六面盒可作无损基本体替换')
  if (exact) { eq(exact.dims[0], 10, 1e-6, '盒 X 尺寸'); eq(exact.dims[1], 10, 1e-6, '盒 Y 尺寸'); eq(exact.dims[2], 10, 1e-6, '盒 Z 尺寸') }
  const plate = makePlateWithHole(10, 10, 2, 16)
  ok(detectExactAxisBox(fitPrimitives(plate.v, plate.t, { diag: 18 }), 18) === null, '带孔或非闭合平面绝不误替换为盒')
}

console.log('严格圆柱替换门槛：只接受完整侧面加两个无孔端盖的 Z 轴圆柱：')
{
  const closed = makeClosedCylinderZ(4, -3, 7, 5, 12)
  const cyl = detectExactZCylinder(fitPrimitives(closed.v, closed.t, { diag: 24 }), 24)
  ok(!!cyl, '完整 Z 轴圆柱可作无损基本体替换')
  if (cyl) { eq(cyl.center[0], 4, 1e-4, '圆柱中心 X'); eq(cyl.center[1], -3, 1e-4, '圆柱中心 Y'); eq(cyl.z0, 7, 1e-4, '圆柱底 Z'); eq(cyl.h, 12, 1e-4, '圆柱高度'); eq(cyl.r, 5, 1e-4, '圆柱半径') }
  const open = makeCylinder([4, -3, 7], [0, 0, 1], 5, 12, 32)
  ok(detectExactZCylinder(fitPrimitives(open.v, open.t, { diag: 24 }), 24) === null, '开放圆柱侧面绝不误替换为实体圆柱')
}

console.log('strict full sphere replacement guard:')
{
  const closed = makeClosedSphere([3, -4, 8], 6)
  const sphere = detectExactSphere(closed.v, closed.t, 24)
  ok(!!sphere, 'closed sphere is accepted for exact replacement')
  if (sphere) { eq(sphere.center[0], 3, 1e-5, 'sphere center X'); eq(sphere.center[1], -4, 1e-5, 'sphere center Y'); eq(sphere.center[2], 8, 1e-5, 'sphere center Z'); eq(sphere.r, 6, 1e-5, 'sphere radius') }
  const { v, t } = makeBox(10)
  ok(detectExactSphere(v, t, 18) === null, 'box is never replaced as a sphere')
  ok(detectExactSphere(closed.v, closed.t.slice(0, -3), 24) === null, 'open sphere is never replaced as a solid sphere')
}

function norm(a) { const L = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / L, a[1] / L, a[2] / L] }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]] }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] }

// ───────────────────────── Case ① 闭合圆柱（轴/半径误差断言）─────────────────────────
console.log('① 闭合圆柱 (Z 轴, R=5, H=8, 32 段) → 识别 1 圆柱, 轴≈Z, 半径≈5, full:')
{
  const { v, t } = makeCylinder([0, 0, 0], [0, 0, 1], 5, 8, 32)
  const res = fitPrimitives(v, t, { diag: 20 })
  const cyls = res.primitives.filter((p) => p.kind === 'cyl')
  ok(cyls.length >= 1, `识别到圆柱（${cyls.length} 个）`)
  const c = cyls[0]
  if (c) {
    ok(Math.abs(Math.abs(dot(c.axis, [0, 0, 1])) - 1) < 0.02, `轴≈Z（实 [${c.axis.map((x) => x.toFixed(3))}]）`)
    eq(c.r, 5, 0.15, '半径')
    ok(c.full, `判为 full 闭合圆柱（实 full=${c.full}, t1-t0=${(c.t1 - c.t0).toFixed(2)}）`)
    eq(c.h1 - c.h0, 8, 0.2, '高度 h1-h0')
  }
}

// ───────────────────────── Case ② 斜轴 [1,1,1] 圆柱 ─────────────────────────
console.log('② 斜轴 [1,1,1] 圆柱 → 轴≈normalize([1,1,1]):')
{
  const A = norm([1, 1, 1])
  const { v, t } = makeCylinder([2, 3, 1], A, 4, 10, 40)
  const res = fitPrimitives(v, t, { diag: 25 })
  const cyls = res.primitives.filter((p) => p.kind === 'cyl')
  ok(cyls.length >= 1, `识别到斜轴圆柱（${cyls.length} 个）`)
  const c = cyls[0]
  if (c) {
    ok(Math.abs(Math.abs(dot(c.axis, A)) - 1) < 0.03, `轴≈[1,1,1]/√3（实 [${c.axis.map((x) => x.toFixed(3))}]）`)
    eq(c.r, 4, 0.15, '斜轴半径')
  }
}

// ───────────────────────── Case ③ 半圆柱 partial ─────────────────────────
console.log('③ 半圆柱 (spanFrac=0.5) → partial, 弧≈π:')
{
  const { v, t } = makeCylinder([0, 0, 0], [0, 0, 1], 6, 8, 24, 0.5)
  const res = fitPrimitives(v, t, { diag: 20 })
  const cyls = res.primitives.filter((p) => p.kind === 'cyl')
  ok(cyls.length >= 1, `识别到半圆柱（${cyls.length} 个）`)
  const c = cyls[0]
  if (c) {
    ok(!c.full, `判为 partial（实 full=${c.full}）`)
    eq(c.r, 6, 0.2, '半圆柱半径')
    ok(Math.abs((c.t1 - c.t0) - Math.PI) < 0.5, `弧长≈π（实 ${(c.t1 - c.t0).toFixed(2)}）`)
  }
}

// ───────────────────────── Case ④ 带圆孔平板（双 loop）─────────────────────────
console.log('④ 带圆孔平板 → 顶面平面区含 2 边界环（外框 + 内圆孔）:')
{
  const { v, t } = makePlateWithHole(40, 30, 6, 20)
  const res = fitPrimitives(v, t, { diag: 50 })
  const planes = res.primitives.filter((p) => p.kind === 'plane')
  ok(planes.length >= 1, `识别到平面区（${planes.length} 个）`)
  // 揾 z=0 顶面（normal≈±Z）
  const top = planes.find((p) => Math.abs(Math.abs(p.normal[2]) - 1) < 0.05)
  ok(!!top, '揾到 Z 法向顶面')
  if (top) {
    eq(top.boundaryLoops.length, 2, 0, `边界环数=2（外框+孔，实 ${top.boundaryLoops.length}）`)
    const perim = (loop) => { let s = 0; for (let i = 0; i < loop.length; i++) { const a = loop[i], b = loop[(i + 1) % loop.length]; s += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) } return s }
    if (top.boundaryLoops.length === 2) {
      const pOuter = perim(top.boundaryLoops[0]), pInner = perim(top.boundaryLoops[1])
      // 外环 = 方框周长 2×(40+30)=140
      eq(pOuter, 140, 1, `外环周长≈2×(W+L)=140（实 ${pOuter.toFixed(1)}）`)
      ok(pOuter > pInner, `外环周长 > 内环（${pOuter.toFixed(1)} > ${pInner.toFixed(1)}）`)
      // 内环 = 阶梯状孔边界，逼近 2πR=37.7 但阶梯恒大（介乎 2πR 与外接方 8R=48 间）
      ok(pInner > 2 * Math.PI * 6 - 1 && pInner < 8 * 6 + 1, `内孔环周长∈(2πR, 8R]（实 ${pInner.toFixed(1)}，2πR=${(2 * Math.PI * 6).toFixed(1)}）`)
    }
  }
}

// ───────────────────────── Case ⑤ 纯球负向（零误认）─────────────────────────
console.log('⑤ 纯球 → 唔应误认为圆柱（球唔系圆柱；RMS 守衛拒）:')
{
  const { v, t } = makeSphere([0, 0, 0], 10, 24, 32)
  const res = fitPrimitives(v, t, { diag: 25 })
  const cyls = res.primitives.filter((p) => p.kind === 'cyl')
  // 球面局部似圆柱，但整体 RMS 守衛 + 轴不一致应拒绝大部分。断言：唔应有覆盖大片嘅假圆柱。
  const bigCyl = cyls.find((c) => c.triIndices.length > t.length / 3 * 0.3)
  ok(!bigCyl, `无覆盖 >30% 三角嘅假圆柱（圆柱数 ${cyls.length}，最大占 ${cyls.length ? (Math.max(...cyls.map((c) => c.triIndices.length)) / (t.length / 3) * 100).toFixed(0) : 0}%）`)
}

// ───────────────────────── Case ⑥ 盒 6 面 ─────────────────────────
console.log('⑥ 盒 (10³) → 6 平面区, 0 圆柱, 覆盖 100%:')
{
  const { v, t } = makeBox(10)
  const res = fitPrimitives(v, t, { diag: 17 })
  const planes = res.primitives.filter((p) => p.kind === 'plane')
  eq(planes.length, 6, 0, `盒 6 平面区（实 ${planes.length}）`)
  eq(res.cylCount, 0, 0, `盒 0 圆柱（实 ${res.cylCount}）`)
  eq(res.facetedTriCount, 0, 0, `盒 0 faceted 三角（实 ${res.facetedTriCount}）`)
  // 每平面区 1 环（无孔），4 角
  ok(planes.every((p) => p.boundaryLoops.length === 1), '各面 1 边界环（无孔）')
  ok(planes.every((p) => p.boundaryLoops[0] && p.boundaryLoops[0].length === 4), `各面外环 4 顶点（实 ${planes.map((p) => p.boundaryLoops[0]?.length).join(',')}）`)
}

// ───────────────────────── Case ⑦ RMS 守衛负向 ─────────────────────────
console.log('⑦ RMS 守衛：径向加噪粗糙圆柱 → 极严守衛拒当 faceted, 宽松守衛识别:')
{
  // 完美合成圆柱顶点恰在半径圆上（RMS=0），测唔到守衛 → 故意径向加噪（每顶点半径 ±8%）令 RMS 非零。
  const { v, t } = makeCylinder([0, 0, 0], [0, 0, 1], 5, 8, 48)
  // 确定性伪随机（可复现），径向缩放顶点
  let seed = 12345
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
  const vn = v.slice()
  for (let i = 0; i < vn.length; i += 3) {
    const x = vn[i], y = vn[i + 1]
    const rr = Math.hypot(x, y)
    if (rr > 1e-6) { const f = 1 + (rnd() - 0.5) * 0.16; vn[i] = x * f; vn[i + 1] = y * f }  // 径向 ±8% 噪声
  }
  // 极严守衛（rmsFracTol=0.01）：加噪 RMS/r ~4% > 1% → 拒圆柱。
  // 拒后三角退化（要么 faceted，要么被段内近平面吞成平面碎片）；关键系【唔会】被误认圆柱。
  const strict = fitPrimitives(vn, t, { diag: 20, cylRmsFracTol: 0.01 })
  ok(strict.cylCount === 0, `极严守衛下 0 圆柱（RMS 守衛拒，实 ${strict.cylCount}）`)
  const strictCylTris = strict.primitives.filter((p) => p.kind === 'cyl').reduce((s, p) => s + p.triIndices.length, 0)
  ok(strictCylTris === 0, `极严守衛下无三角归入圆柱（实 ${strictCylTris}）`)
  // 宽松守衛（rmsFracTol=0.12）：容忍噪声 → 识别
  const loose = fitPrimitives(vn, t, { diag: 20, cylRmsFracTol: 0.12 })
  ok(loose.cylCount >= 1, `宽松守衛下识别圆柱（对比组，实 ${loose.cylCount}）`)
}

// ───────────────────────── Case ⑧ 30k 三角性能 smoke ─────────────────────────
console.log('⑧ 性能 smoke：~30k 三角 < 500ms:')
{
  // 拼多个圆柱 + 盒凑 ~30k 三角
  const parts = []
  const bigCyl = makeCylinder([0, 0, 0], [0, 0, 1], 5, 20, 240)  // 240*2 = 480 tri
  // 复制多份平移凑数
  let V = [], T = []
  const append = (mesh, off) => {
    const base = V.length / 3
    for (let i = 0; i < mesh.v.length; i += 3) V.push(mesh.v[i] + off[0], mesh.v[i + 1] + off[1], mesh.v[i + 2] + off[2])
    for (const idx of mesh.t) T.push(idx + base)
  }
  // ~30k tri：需要 ~62 份 480-tri 圆柱
  for (let i = 0; i < 62; i++) append(bigCyl, [i % 8 * 20, Math.floor(i / 8) * 20, 0])
  const nTri = T.length / 3
  ok(nTri >= 29000, `构造 ~30k 三角（实 ${nTri}）`)
  const t0 = performance.now()
  const res = fitPrimitives(V, T, { diag: 200 })
  const dt = performance.now() - t0
  ok(dt < 500, `30k 三角分析 < 500ms（实 ${dt.toFixed(0)}ms）`)
  ok(res.cylCount >= 30, `识别到多个圆柱（实 ${res.cylCount}）`)
  void parts
}

console.log(`\n${fail === 0 ? '✅ 全部通过' : '❌ 有失败'} (${pass} pass / ${fail} fail)`)
process.exit(fail === 0 ? 0 : 1)
