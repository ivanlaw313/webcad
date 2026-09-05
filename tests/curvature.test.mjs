// curvature.test.mjs — 逐顶点离散曲率纯模块 (src/cad/curvatureAnalysis.ts) 解析验证套件
// 跑法: npx -y tsx tests/curvature.test.mjs   (喺 C:\ClaudeCode\webcad 目录)
// 失败 → exit 1; 末尾输出 PASS/FAIL 总表。
//
// 全部断言系解析式 (analytic):
//   • 半径 r 嘅球: 处处 Gaussian K = 1/r², Mean H = 1/r。喺细分够幼嘅 icosphere 上, 内部顶点嘅
//     离散估算应贴近呢两个值。容差 = ±15% 趋势容差 (离散曲率系一阶收敛, icosphere subdiv=3 ≈ 642 顶点
//     已经够幼;实测中位数偏差远细过 15%, 但我哋用 15% 做诚实嘅趋势门槛)。
//   • 平面网格: 处处 K = 0 同 H = 0 (平面无曲率)。内部顶点应 ≈ 0 (绝对小量), 边界顶点由模块自动剔除。
//
// 球同平面网格全部喺测试内部解析生成 (icosphere = 正二十面体递归细分并投影到球面;
// plane = 规则三角化栅格)。

import { meshCurvature } from '../src/cad/curvatureAnalysis.ts'

const TREND_TOL = 0.15 // ±15% 趋势容差 (题目要求 10–15%, 取上限做诚实门槛)

const rows = []
let notes = []
function note(s) { notes.push(s); console.log(`    ${s}`) }
function ok(cond, msg) { if (!cond) throw new Error(msg); note(msg) }
function test(name, fn) {
  console.log(`\n## ${name}`)
  notes = []
  try { fn(); rows.push({ name, pass: true, info: '' }) }
  catch (e) { rows.push({ name, pass: false, info: String(e.message) }); console.log(`    !! FAIL: ${e.message}`) }
}

// ---------------- 解析网格生成 ----------------

// Icosphere: 正二十面体 → 每边中点细分 subdiv 次 → 投影到半径 r 球面。
// 闭合 2-流形, 无边界 → 全部顶点都系内部顶点 (球面曲率测试理想载体)。
// 三角形数 = 20·4^subdiv;顶点数 = 10·4^subdiv + 2。
function makeIcosphere(r, subdiv) {
  const t = (1 + Math.sqrt(5)) / 2
  // 12 个基础顶点 (三个正交黄金矩形)
  let verts = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ]
  let faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ]
  // 每次细分: 每个三角形一分四, 边中点缓存避免重复 (维持共享顶点 / 闭合拓扑)
  for (let s = 0; s < subdiv; s++) {
    const mid = new Map()
    const newFaces = []
    const midpoint = (a, b) => {
      const key = a < b ? a * 1e7 + b : b * 1e7 + a
      let m = mid.get(key)
      if (m === undefined) {
        const va = verts[a], vb = verts[b]
        m = verts.length
        verts.push([(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2])
        mid.set(key, m)
      }
      return m
    }
    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a)
      newFaces.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca])
    }
    faces = newFaces
  }
  // 投影到半径 r 球面 (单位化后乘 r)
  const vertices = []
  for (const v of verts) {
    const L = Math.hypot(v[0], v[1], v[2])
    vertices.push((v[0] / L) * r, (v[1] / L) * r, (v[2] / L) * r)
  }
  const triangles = []
  for (const f of faces) triangles.push(f[0], f[1], f[2])
  return { vertices, triangles }
}

// 规则三角化平面栅格, n×n 单元 (尺寸 size×size, 喺 z=0 平面)。
// 共享顶点。边界顶点会被模块自动剔除;内部顶点 K=H=0。
function makePlane(size, n) {
  const vertices = []
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      vertices.push((i / n - 0.5) * size, (j / n - 0.5) * size, 0)
    }
  }
  const idx = (i, j) => j * (n + 1) + i
  const triangles = []
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = idx(i, j), b = idx(i + 1, j), c = idx(i + 1, j + 1), d = idx(i, j + 1)
      triangles.push(a, b, c, a, c, d)
    }
  }
  return { vertices, triangles }
}

// 中位数 (对离散曲率比均值更稳健, 唔会畀少数离群顶点带歪趋势)
function median(arr) {
  const s = [...arr].sort((x, y) => x - y)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// ============ T1 球面 r=1: K≈1, H≈1 ============
test('T1 icosphere r=1 subdiv=3 → 内部顶点 K≈1/r² H≈1/r (±15% 趋势)', () => {
  const r = 1
  const m = makeIcosphere(r, 3) // 20·4³ = 1280 三角, 642 顶点
  ok(m.triangles.length / 3 === 1280, `网格 1280 三角 (实际 ${m.triangles.length / 3})`)
  const res = meshCurvature(m.vertices, m.triangles)
  // icosphere 闭合 → 0 边界 → 全部顶点都系内部顶点
  ok(res.interiorCount === m.vertices.length / 3, `闭合球: 全部 ${res.interiorCount} 顶点都系内部 (0 边界)`)

  const Ktrue = 1 / (r * r), Htrue = 1 / r
  const Kvals = [], Hvals = []
  for (let i = 0; i < m.vertices.length / 3; i++) {
    if (!res.boundary[i]) { Kvals.push(res.gaussian[i]); Hvals.push(res.mean[i]) }
  }
  const Kmed = median(Kvals), Hmed = median(Hvals)
  const Kerr = Math.abs(Kmed - Ktrue) / Ktrue, Herr = Math.abs(Hmed - Htrue) / Htrue
  note(`Gaussian 中位数 ${Kmed.toFixed(4)} (解析 ${Ktrue})  偏差 ${(100 * Kerr).toFixed(2)}%`)
  note(`Mean     中位数 ${Hmed.toFixed(4)} (解析 ${Htrue})  偏差 ${(100 * Herr).toFixed(2)}%`)
  ok(Kerr <= TREND_TOL, `Gaussian 中位数 偏差 ${(100 * Kerr).toFixed(2)}% ≤ ${100 * TREND_TOL}%`)
  ok(Herr <= TREND_TOL, `Mean 中位数 偏差 ${(100 * Herr).toFixed(2)}% ≤ ${100 * TREND_TOL}%`)
  // 全部顶点单独都喺趋势容差内 (icosphere 高度均匀 → 唔单靠中位数)
  let nIn = 0
  for (const k of Kvals) if (Math.abs(k - Ktrue) / Ktrue <= TREND_TOL) nIn++
  ok(nIn / Kvals.length >= 0.95, `≥95% 顶点 Gaussian 各自喺 ±15% 内 (实际 ${(100 * nIn / Kvals.length).toFixed(1)}%)`)
})

// ============ T2 球面 r=5: K≈1/25, H≈1/5 (验证 1/r² 同 1/r 缩放) ============
test('T2 icosphere r=5 subdiv=3 → K≈1/25 H≈1/5 (验证半径缩放律)', () => {
  const r = 5
  const m = makeIcosphere(r, 3)
  const res = meshCurvature(m.vertices, m.triangles)
  const Ktrue = 1 / (r * r), Htrue = 1 / r
  const Kvals = [], Hvals = []
  for (let i = 0; i < m.vertices.length / 3; i++) { Kvals.push(res.gaussian[i]); Hvals.push(res.mean[i]) }
  const Kmed = median(Kvals), Hmed = median(Hvals)
  const Kerr = Math.abs(Kmed - Ktrue) / Ktrue, Herr = Math.abs(Hmed - Htrue) / Htrue
  note(`r=5: Gaussian 中位数 ${Kmed.toExponential(3)} (解析 ${Ktrue})  偏差 ${(100 * Kerr).toFixed(2)}%`)
  note(`r=5: Mean 中位数 ${Hmed.toFixed(4)} (解析 ${Htrue})  偏差 ${(100 * Herr).toFixed(2)}%`)
  ok(Kerr <= TREND_TOL, `r=5 Gaussian 偏差 ${(100 * Kerr).toFixed(2)}% ≤ ${100 * TREND_TOL}% (1/r² 缩放成立)`)
  ok(Herr <= TREND_TOL, `r=5 Mean 偏差 ${(100 * Herr).toFixed(2)}% ≤ ${100 * TREND_TOL}% (1/r 缩放成立)`)
})

// ============ T3 平面: K≈0 H≈0 ============
test('T3 平面栅格 20×20 → 内部顶点 Gaussian≈0 Mean≈0 (边界顶点自动剔除)', () => {
  const m = makePlane(10, 20) // 400 单元 → 800 三角, 441 顶点 (内部 19×19 = 361)
  const res = meshCurvature(m.vertices, m.triangles)
  ok(res.interiorCount === 361, `内部顶点 = 19×19 = 361 (实际 ${res.interiorCount})`)
  // 边界顶点应被标记 (4 条边)
  let nB = 0
  for (let i = 0; i < m.vertices.length / 3; i++) if (res.boundary[i]) nB++
  ok(nB === 441 - 361, `边界顶点 = 441−361 = ${441 - 361} (实际 ${nB})`)
  // 内部顶点曲率绝对值应近 0 (浮点意义上)
  let maxK = 0, maxH = 0
  for (let i = 0; i < m.vertices.length / 3; i++) {
    if (res.boundary[i]) continue
    maxK = Math.max(maxK, Math.abs(res.gaussian[i]))
    maxH = Math.max(maxH, Math.abs(res.mean[i]))
  }
  note(`内部顶点 max|Gaussian| = ${maxK.toExponential(3)}  max|Mean| = ${maxH.toExponential(3)}`)
  ok(maxK < 1e-9, `平面 内部 Gaussian ≈ 0 (max|K| ${maxK.toExponential(2)} < 1e-9)`)
  ok(maxH < 1e-9, `平面 内部 Mean ≈ 0 (max|H| ${maxH.toExponential(2)} < 1e-9)`)
  // min/max 报告嘅系内部 Gaussian 范围 → 应都 ≈ 0
  ok(Math.abs(res.min) < 1e-9 && Math.abs(res.max) < 1e-9, `min/max Gaussian 都 ≈ 0 (${res.min.toExponential(2)}, ${res.max.toExponential(2)})`)
})

// ============ T4 退化输入防御 ============
test('T4 空网格 / 单退化三角 → 唔掟错, 斯文收场', () => {
  const e = meshCurvature([], [])
  ok(e.mean.length === 0 && e.gaussian.length === 0 && e.interiorCount === 0, '空网格 → 空数组, interiorCount 0')
  ok(e.min === 0 && e.max === 0, '空网格 min/max = 0')
  // 单一三角形: 3 个顶点全系边界 → 全部剔除 → interiorCount 0, 唔掟错
  const one = meshCurvature([0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2])
  ok(one.mean.length === 3 && one.gaussian.length === 3, '单三角 → 长度 3 数组')
  ok(one.interiorCount === 0, '单三角: 3 顶点全边界 → 内部 0')
  for (let i = 0; i < 3; i++) ok(one.gaussian[i] === 0 && one.mean[i] === 0, `顶点 ${i} 曲率留 0`)
})

// ============ 总表 ============
console.log('\n========== PASS/FAIL 总表 ==========')
let nFail = 0
for (const r of rows) {
  console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : ' — ' + r.info}`)
  if (!r.pass) nFail++
}
console.log('====================================')
console.log(nFail === 0 ? `全部 ${rows.length} 组通过` : `${nFail}/${rows.length} 组失败`)
process.exit(nFail === 0 ? 0 : 1)
