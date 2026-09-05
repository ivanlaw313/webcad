// arclen-tancircle.test.mjs — 弧长尺寸 (arclen) + 切点圆解算器 (solveTangentCircle) 验证套件
// 跑法: npx -y tsx tests/arclen-tancircle.test.mjs   (喺 C:\ClaudeCode\webcad 目录)
// 失败 → exit 1; 末尾输出 PASS/FAIL 总表
//
// loader hook: freesolve.ts → solver.ts 有 Vite 专用 import ('...planegcs.wasm?url' +
// import.meta.env) — node 下面跑唔起。measureDim / buildPrims / solveTangentCircle 都系
// 纯函数、完全唔掂 solver wasm，所以呢度用 module hook 将 ?url 同成个 solver.ts 模块
// stub 走，先至 dynamic import（同 coincident.test.mjs 一模一样嘅做法）。
// 注意: buildPrims 净系「砌 prim 数组」— planegcs arc_length 真系收唔收货要靠浏览器
// smoke test（另一位工程师）；呢度验嘅系我哋发出嘅 prim 形状正确。
import { register } from 'node:module'

const SOLVER_STUB =
  'data:text/javascript,' +
  encodeURIComponent(
    'export const solveSketch = async () => { throw new Error("solver stub (test loader)") }; export const initSolver = async () => {};',
  )
const loaderSrc = [
  'export async function resolve(specifier, context, next) {',
  "  if (specifier.includes('?url')) return { url: 'data:text/javascript,export default %22%22', shortCircuit: true }",
  '  const r = await next(specifier, context)',
  "  if (String(r.url).split('?')[0].endsWith('/src/sketch/solver.ts')) return { url: " + JSON.stringify(SOLVER_STUB) + ', shortCircuit: true }',
  '  return r',
  '}',
].join('\n')
register('data:text/javascript,' + encodeURIComponent(loaderSrc))

const { measureDim, solveTangentCircle, arcResample, _internals } = await import('../src/sketch/freesolve.ts')
const { pathPts } = await import('../src/sketch/sketchOps.ts')
const { buildPrims } = _internals

const rows = []
let notes = []

function note(s) {
  notes.push(s)
  console.log(`    ${s}`)
}
function ok(cond, msg) {
  if (!cond) throw new Error(msg)
  note(msg)
}
function eq(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg}: 期望 ${JSON.stringify(expected)}, 实际 ${JSON.stringify(actual)}`)
  note(`${msg}: ${JSON.stringify(actual)}`)
}
function approx(actual, expected, tol, msg) {
  if (typeof actual !== 'number' || !(Math.abs(actual - expected) <= tol)) {
    throw new Error(`${msg}: 期望 ${expected} ±${tol}, 实际 ${actual}`)
  }
  note(`${msg}: ${actual} ≈ ${expected} (±${tol})`)
}
function test(name, fn) {
  console.log(`\n## ${name}`)
  notes = []
  try {
    fn()
    rows.push({ name, pass: true, info: '' })
  } catch (e) {
    rows.push({ name, pass: false, info: String(e.message) })
    console.log(`    !! FAIL: ${e.message}`)
  }
}

// ── 共用几何 ──
// verts-poly 四分一弧 R10: 弦 (10,0)→(0,10), bulge = tan(θ/4) = tan(π/8) (θ=π/2)
// → R = 10, 弧长 = R·θ = 5π ≈ 15.70796
const QB = Math.tan(Math.PI / 8)
const vpQuarter = () => ({
  type: 'poly',
  verts: [[10, 0], [0, 10]],
  bulges: [QB, 0],
  pts: pathPts([[10, 0], [0, 10]], [QB, 0]),
})
// 三点弧 (arc-poly): 圆心 (0,0), 起 (10,0), 终 (0,10), 行经 m=(10/√2,10/√2) → 劣弧 (minor)
const apQuarter = () => {
  const a = [10, 0], b = [0, 10], m = [10 * Math.SQRT1_2, 10 * Math.SQRT1_2]
  return { type: 'poly', pts: arcResample(a, b, m), arc: { a, b, m } }
}
const FIVE_PI = 5 * Math.PI // 15.70796…

// ── 1. measureDim arclen — verts-poly 弧段 ──
test('1. measureDim arclen: verts-poly 四分一弧 R10 → 5π (±1e-6)', () => {
  const shapes = [vpQuarter()]
  const dim = { id: 'k_t1', kind: 'dim', type: 'arclen', a: { kind: 'edge', shape: 0, idx: 0 }, value: 0 }
  approx(measureDim(shapes, dim), FIVE_PI, 1e-6, '弧长 = R·θ = 10·(π/2)')
  // driven (从动) display-only 路径: measureDim 唔理 driven flag, 照量
  const driven = { ...dim, driven: true }
  approx(measureDim(shapes, driven), FIVE_PI, 1e-6, 'driven:true 一样量到 (display-only 路径正常)')
  // 直边 (closing seg idx 1, bulge=0) → null (弧长净系真弧有意义)
  eq(measureDim(shapes, { ...dim, a: { kind: 'edge', shape: 0, idx: 1 } }), null, '直边 → null')
})

// ── 2. measureDim arclen — 三点弧 (arc-poly) rim ──
test('2. measureDim arclen: 三点弧 圆心(0,0) (10,0)→(0,10) 劣弧 → 5π (±1e-6)', () => {
  const shapes = [apQuarter()]
  const dim = { id: 'k_t2', kind: 'dim', type: 'arclen', a: { kind: 'circle', shape: 0 }, value: 0 }
  approx(measureDim(shapes, dim), FIVE_PI, 1e-6, '弧长 = R × 扫角 = 10·(π/2)')
  // 优弧对照: m 摆喺 (−10/√2, −10/√2) → 扫角 3π/2 → 15π
  const major = { type: 'poly', pts: [], arc: { a: [10, 0], b: [0, 10], m: [-10 * Math.SQRT1_2, -10 * Math.SQRT1_2] } }
  approx(measureDim([major], dim), 15 * Math.PI, 1e-6, '优弧 (m 喺对面) → R·(3π/2) — 扫向跟 m 嗰边')
  // 成个圆 (circle shape) → null (创建侧已挡, 量度都诚实唔出数)
  eq(measureDim([{ type: 'circle', c: [0, 0], r: 10 }], dim), null, '成个圆 → null')
})

// ── 3. buildPrims 驱动 arclen → planegcs arc_length prim (两种 shape) ──
test('3. buildPrims: driving arclen → {type:arc_length, dist}; driven/直边 唔发', () => {
  // (a) verts-poly 弧段 → a_id = sa0_0
  const dimE = { id: 'kAL1', kind: 'dim', type: 'arclen', a: { kind: 'edge', shape: 0, idx: 0 }, value: 15.5 }
  const primsV = buildPrims([vpQuarter()], [dimE])
  const alV = primsV.filter((p) => p.type === 'arc_length')
  eq(alV.length, 1, 'verts-poly: 恰好 1 条 arc_length')
  eq(alV[0].a_id, 'sa0_0', 'a_id = 弧段 solver arc prim (sa0_0)')
  eq(alV[0].dist, 15.5, 'dist = 尺寸值')
  eq(alV[0].id, 'kAL1', 'constraint id = dim id')
  // (b) 三点弧 rim (circle-kind ref, cid prim 系 arc) → a_id = c0
  const dimC = { id: 'kAL2', kind: 'dim', type: 'arclen', a: { kind: 'circle', shape: 0 }, value: 12 }
  const primsA = buildPrims([apQuarter()], [dimC])
  const alA = primsA.filter((p) => p.type === 'arc_length')
  eq(alA.length, 1, 'arc-poly: 恰好 1 条 arc_length')
  eq(alA[0].a_id, 'c0', 'a_id = cid(0) (三点弧 prim 本身系 arc)')
  eq(alA[0].dist, 12, 'dist = 尺寸值')
  // (c) driven:true → 完全唔入 solver (:486 pattern) — 翻转 driven 即可降级, 唔使改第二度
  const primsD = buildPrims([vpQuarter()], [{ ...dimE, driven: true }])
  eq(primsD.filter((p) => p.type === 'arc_length').length, 0, 'driven → skip, 冇 arc_length')
  // (d) 直边 (bulge=0) 嘅 arclen → 唔发 (arcSegOf 返 null)
  const primsS = buildPrims([vpQuarter()], [{ ...dimE, a: { kind: 'edge', shape: 0, idx: 1 } }])
  eq(primsS.filter((p) => p.type === 'arc_length').length, 0, '直边 → 冇 arc_length')
})

// ── 4. solveTangentCircle: 2 线 + rFixed ──
test('4. 切点圆 2 线: x 轴 + y 轴, click (3,2)&(2,3), rFixed 5 → c=(5,5)', () => {
  const res = solveTangentCircle(
    [
      { p1: [0, 0], p2: [10, 0], click: [3, 2] },  // x 轴, 点击喺上方
      { p1: [0, 0], p2: [0, 10], click: [2, 3] },  // y 轴, 点击喺右方
    ],
    5,
  )
  ok(res !== null, '有解')
  approx(res.c[0], 5, 1e-12, 'cx = 5')
  approx(res.c[1], 5, 1e-12, 'cy = 5')
  eq(res.r, 5, 'r = rFixed = 5')
})

// ── 5. solveTangentCircle: 3 线 内切圆 ──
test('5. 切点圆 3 线: 直角三角形 (0,0)(30,0)(0,40), 点击全内 → 内切圆 c=(10,10) r=10', () => {
  const inside = [5, 5]
  const tri = [
    { p1: [0, 0], p2: [30, 0], click: inside },   // 底边 c=30
    { p1: [0, 0], p2: [0, 40], click: inside },   // 直边 b=40
    { p1: [30, 0], p2: [0, 40], click: inside },  // 斜边 a=50
  ]
  const res = solveTangentCircle(tri)
  ok(res !== null, '有解')
  // 内切圆 r = (a+b−c)/2 嘅直角三角形特例 = (30+40−50)/2 = 10
  approx(res.c[0], 10, 1e-9, 'cx = 10')
  approx(res.c[1], 10, 1e-9, 'cy = 10')
  approx(res.r, 10, 1e-9, 'r = (30+40−50)/2 = 10')
  // rFixed 喺 3 线情形被忽略
  const res2 = solveTangentCircle(tri, 999)
  approx(res2.r, 10, 1e-9, 'rFixed=999 被忽略, r 照旧 = 10')
})

// ── 6. solveTangentCircle: 旁切圆 (excircle) ──
test('6. 切点圆 3 线: 底边点击喺外 → 旁切圆 c=(20,−20), r = area/(s−c) = 20', () => {
  const res = solveTangentCircle([
    { p1: [0, 0], p2: [30, 0], click: [10, -5] },  // 底边: 点击喺下方 (外侧) → σ 翻转
    { p1: [0, 0], p2: [0, 40], click: [5, 5] },
    { p1: [30, 0], p2: [0, 40], click: [5, 5] },
  ])
  ok(res !== null, '有解')
  // 解析: area=600, s=60, 旁切圆 (切底边 c=30 外侧) r_c = area/(s−c) = 600/30 = 20
  approx(res.r, 600 / (60 - 30), 1e-9, 'r = area/(s−c) = 20')
  approx(res.c[0], 20, 1e-9, 'cx = 20')
  approx(res.c[1], -20, 1e-9, 'cy = −20 (喺底边下方)')
  // 复核: 圆心到三条线嘅距离都 = r (真·相切)
  const dLine = (p1, p2, q) => {
    const dx = p2[0] - p1[0], dy = p2[1] - p1[1], L = Math.hypot(dx, dy)
    return Math.abs(dx * (q[1] - p1[1]) - dy * (q[0] - p1[0])) / L
  }
  approx(dLine([0, 0], [30, 0], res.c), res.r, 1e-9, '距底边 = r')
  approx(dLine([0, 0], [0, 40], res.c), res.r, 1e-9, '距直边 = r')
  approx(dLine([30, 0], [0, 40], res.c), res.r, 1e-9, '距斜边 = r')
})

// ── 7. solveTangentCircle: 退化 → null ──
test('7. 退化: 平行 2 线 → null; 零长线 → null; 点击喺线上 → null; 三平行 → null', () => {
  // 平行两线 (y=0, y=10), 点击都喺中间 → 异侧解唔唯一 (奇异) → null
  eq(
    solveTangentCircle(
      [
        { p1: [0, 0], p2: [10, 0], click: [5, 5] },
        { p1: [0, 10], p2: [10, 10], click: [5, 5] },
      ],
      5,
    ),
    null,
    '平行异侧 → null',
  )
  // 平行同侧 (矛盾) 一样奇异 → null
  eq(
    solveTangentCircle(
      [
        { p1: [0, 0], p2: [10, 0], click: [5, 5] },
        { p1: [0, 10], p2: [10, 10], click: [5, 15] },
      ],
      5,
    ),
    null,
    '平行同侧矛盾 → null',
  )
  // 共线退化: p1 == p2 (零长线, 法线无定义) → null
  eq(
    solveTangentCircle(
      [
        { p1: [3, 3], p2: [3, 3], click: [5, 5] },
        { p1: [0, 0], p2: [10, 0], click: [5, 5] },
      ],
      5,
    ),
    null,
    '零长线 → null',
  )
  // 点击正喺线上 → σ=0, 侧别不明 → null
  eq(
    solveTangentCircle(
      [
        { p1: [0, 0], p2: [10, 0], click: [5, 0] },
        { p1: [0, 0], p2: [0, 10], click: [2, 3] },
      ],
      5,
    ),
    null,
    'σ=0 → null',
  )
  // 三条平行线 → 3×3 奇异 → null
  eq(
    solveTangentCircle([
      { p1: [0, 0], p2: [10, 0], click: [5, 1] },
      { p1: [0, 10], p2: [10, 10], click: [5, 9] },
      { p1: [0, 20], p2: [10, 20], click: [5, 19] },
    ]),
    null,
    '三平行 → null',
  )
})

// ── 总表 ──
console.log('\n══════ 总表 ══════')
let fails = 0
for (const r of rows) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.info ? '  — ' + r.info : ''}`)
  if (!r.pass) fails++
}
console.log(`\n${rows.length - fails}/${rows.length} 通过`)
if (fails > 0) process.exit(1)
