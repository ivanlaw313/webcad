// coincident.test.mjs — 重合推断 inferCoincident (src/sketch/freesolve.ts) 验证套件
// 跑法: npx -y tsx tests/coincident.test.mjs   (喺 C:\ClaudeCode\webcad 目录)
// 失败 → exit 1; 末尾输出 PASS/FAIL 总表
//
// loader hook: freesolve.ts → solver.ts 有 Vite 专用 import ('...planegcs.wasm?url' +
// import.meta.env) — node 下面跑唔起。inferCoincident 系纯函数、完全唔掂 solver，
// 所以呢度用 module hook 将 ?url 同成个 solver.ts 模块 stub 走，先至 dynamic import。
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

const { inferCoincident } = await import('../src/sketch/freesolve.ts')

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
// rect {a:[0,0], b:[30,20]} → rectCorners 顺序: c0=[0,0] c1=[30,0] c2=[30,20] c3=[0,20]
const rect = { type: 'rect', a: [0, 0], b: [30, 20] }
const triAt = (v) => ({ type: 'poly', pts: [v, [60, 10], [45, 40]] }) // 净系第 0 个顶点摆喺测试位

// ── 1. 基本推断 + rectCorners 角 idx 验证 + 纯函数(唔改入参) ──
test('1. rect 角 + poly 顶点完全重合 → 恰好 1 条, 角 idx 啱', () => {
  const shapes = [rect, triAt([30, 20])]
  const snapBefore = JSON.stringify(shapes)
  const cons = inferCoincident(shapes, 1, [])
  eq(cons.length, 1, '恰好 1 条')
  const c = cons[0]
  eq(c.kind, 'con', 'kind = con')
  eq(c.type, 'coincident', 'type = coincident')
  ok(typeof c.id === 'string' && c.id.startsWith('k'), `id 由 skConId() 派 (${c.id})`)
  eq(JSON.stringify(c.a), JSON.stringify({ kind: 'pt', shape: 1, idx: 0 }), 'a = 新 shape 顶点 {pt,1,0}')
  eq(JSON.stringify(c.b), JSON.stringify({ kind: 'pt', shape: 0, idx: 2 }), 'b = rect 角 c2=[30,20] → idx 2')
  // 逐个角验证 rectCorners 索引 (c0=a, c1=(bx,ay), c2=b, c3=(ax,by))
  const corners = [[0, 0], [30, 0], [30, 20], [0, 20]]
  corners.forEach((q, k) => {
    // [0,0] 同原点叠埋 — 原点排头 + 严格 < 比较 → 原点赢; 其余角应该返 rect 角 idx
    if (k === 0) return
    const cc = inferCoincident([rect, triAt(q)], 1, [])
    eq(cc.length, 1, `角 ${k}: 推断 1 条`)
    eq(cc[0].b.idx, k, `角 ${k}: b.idx = ${k}`)
  })
  eq(JSON.stringify(shapes), snapBefore, '纯函数: shapes 入参冇被改')
})

// ── 2. 容差: 1e-4 精确政策 ──
test('2. 容差 — 5e-5 推断, 1e-3 唔推断', () => {
  const near = inferCoincident([rect, triAt([30 + 5e-5, 20])], 1, [])
  eq(near.length, 1, '偏 5e-5 ≤ tol=1e-4 → 推断')
  eq(JSON.stringify(near[0].b), JSON.stringify({ kind: 'pt', shape: 0, idx: 2 }), '指向 rect 角 idx 2')
  const far = inferCoincident([rect, triAt([30.001, 20])], 1, [])
  eq(far.length, 0, '偏 1e-3 > tol → 零误判, 唔推断')
})

// ── 3. 去重: existing 已有同一对 (a/b 倒转) → 0 ──
test('3. 去重 — existing 倒序同对 → 返回 0', () => {
  const shapes = [rect, triAt([30, 20])]
  // 倒转顺序: a = rect 角, b = poly 顶点 (推断输出系 a=新点 b=候选, 呢度故意反转)
  const existing = [{ id: 'k999', kind: 'con', type: 'coincident', a: { kind: 'pt', shape: 0, idx: 2 }, b: { kind: 'pt', shape: 1, idx: 0 } }]
  eq(inferCoincident(shapes, 1, existing).length, 0, '同对唔分 a/b 顺序 → 跳过')
  // 对照: existing 系第三方对 (唔相关) → 照推
  const unrelated = [{ id: 'k998', kind: 'con', type: 'coincident', a: { kind: 'pt', shape: 0, idx: 0 }, b: { kind: 'pt', shape: 0, idx: 1 } }]
  eq(inferCoincident(shapes, 1, unrelated).length, 1, '唔相关嘅 existing 唔影响')
})

// ── 4. 总数封顶 cap=8 ──
test('4. cap — 20 个顶点全部重合 → 至多 8 条', () => {
  const ring = (r) => Array.from({ length: 20 }, (_, i) => [r * Math.cos((i / 20) * Math.PI * 2) + 100, r * Math.sin((i / 20) * Math.PI * 2) + 100])
  const a = { type: 'poly', pts: ring(50) }
  const b = { type: 'poly', pts: ring(50) } // 完全相同 20 点 (浮点逐位一致 → 距离 0)
  const cons = inferCoincident([a, b], 1, [])
  eq(cons.length, 8, '20 个候选命中 → 封顶 8')
  ok(cons.every((c) => c.type === 'coincident'), '全部系 coincident')
  // 自定义 cap 都生效
  eq(inferCoincident([a, b], 1, [], 1e-4, 3).length, 3, 'cap=3 → 3 条')
})

// ── 5. 圆心候选 + 最近者胜(每点至多 1 条) ──
test('5. poly 顶点叠喺圆心 → 推断圆心 ref; 两候选齐中 → 净系最近 1 条', () => {
  const circle = { type: 'circle', c: [10, 5], r: 4 }
  const cons = inferCoincident([circle, triAt([10, 5])], 1, [])
  eq(cons.length, 1, '1 条')
  eq(JSON.stringify(cons[0].b), JSON.stringify({ kind: 'pt', shape: 0, idx: 0 }), 'b = 圆心 ref {pt, shape:0, idx:0}')
  // 两个候选都喺 tol 内 (圆心距 0, 第二个圆心距 8e-5) → 净系出 1 条, 指向最近(距 0)
  const circle2 = { type: 'circle', c: [10 + 8e-5, 5], r: 2 }
  const cons2 = inferCoincident([circle, circle2, triAt([10, 5])], 2, [])
  eq(cons2.length, 1, '每点至多 1 条 (唔会两条都落)')
  eq(cons2[0].b.shape, 0, '指向最近候选 (距离 0 嘅圆心)')
})

// ── 6. smooth spline 两个方向都跳过 ──
test('6. smooth spline — 新 shape / 候选 两边都跳过', () => {
  const spline = { type: 'poly', pts: [[30, 20], [40, 25], [50, 18]], ctrl: [[30, 20], [40, 25], [50, 18]], smooth: true }
  // 方向 1: 新 shape 系 spline (顶点叠正 rect 角) → 唔推断
  eq(inferCoincident([rect, spline], 1, []).length, 0, 'spline 作为新 shape → 0 (约束会被 tessellate 冲走)')
  // 方向 2: spline 作为候选目标 (poly 顶点叠正 spline pts[0]=[30,20], 远离原点/rect) → 唔推断
  eq(inferCoincident([spline, triAt([30, 20])], 1, []).length, 0, 'spline 作为候选 → 0')
  // 对照: 同一位置换成 rect → 推断到 (证明 0 系因为 spline 被跳过, 唔系几何唔啱)
  eq(inferCoincident([rect, triAt([30, 20])], 1, []).length, 1, '对照: rect 候选有得推')
})

// ── 7. 原点候选 ──
test('7. 顶点喺 [0,0] → origin ref', () => {
  const cons = inferCoincident([triAt([0, 0])], 0, [])
  eq(cons.length, 1, '1 条')
  eq(JSON.stringify(cons[0].b), JSON.stringify({ kind: 'origin' }), "b = {kind:'origin'} (solver 固定点 o0)")
  eq(JSON.stringify(cons[0].a), JSON.stringify({ kind: 'pt', shape: 0, idx: 0 }), 'a = 顶点 {pt,0,0}')
  // 同 rect 角 c0 叠埋时: 原点排头 + 严格 < → 原点优先 (固定点, 约束最稳)
  const both = inferCoincident([rect, triAt([0, 0])], 1, [])
  eq(both.length, 1, '原点 + rect c0 齐中 → 仍然 1 条')
  eq(both[0].b.kind, 'origin', '平手时偏向原点')
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
