// skselect-fp3.test.mjs — GM-FP3 W3（修改+选择）纯函数验证：
//   #49 hitTest 命中优先级（曲线 > 点，平手偏曲线；≤0.35tol 短半径点优先区保留）
//   #46 chainSelect 双击链选（共享端点走遍相连轮廓）
//   #44 marqueeHits 框选 window（全包）/ crossing（相触）inclusion 数学
// 跑法: npx -y tsx tests/skselect-fp3.test.mjs   （喺 C:\ClaudeCode\webcad）
// loader hook 同 freesolve-l2：把 solver.ts + ?url stub 走，纯函数唔掂 wasm。
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
].join('\n')
register('data:text/javascript,' + encodeURIComponent(loaderSrc + '\n}'))

const { hitTest, chainSelect, marqueeHits } = await import('../src/sketch/freesolve.ts')

const rows = []
let notes = []
function note(s) { notes.push(s); console.log(`    ${s}`) }
function ok(cond, msg) { if (!cond) throw new Error(msg); note(msg) }
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  if (a !== e) throw new Error(`${msg}: 期望 ${e}, 实际 ${a}`)
  note(`${msg}: ${a}`)
}
function test(name, fn) {
  console.log(`\n## ${name}`)
  notes = []
  try { fn(); rows.push({ name, pass: true, info: '' }) }
  catch (e) { rows.push({ name, pass: false, info: String(e.message) }); console.log(`    !! FAIL: ${e.message}`) }
}
const sortIdx = (refs) => refs.map((r) => r.idx).sort((a, b) => a - b)

// ════════════════════════════════════════════════════════════════════════
// #49 命中优先级 — 曲线 > 点（平手偏曲线）；≤0.35tol 短半径点优先区保留
// ════════════════════════════════════════════════════════════════════════
// 边（远离原点）y=10；其上一草图点 [10,10.8]。tol=1。
const edge = { type: 'poly', pts: [[8, 10], [12, 10]] }
const ptOnCurve = { type: 'circle', c: [10, 10.8], r: 0, point: true }

test('49a. 边同点等距（>0.35tol）→ 拣【边】（曲线赢平手，唔畀其上点抢）', () => {
  // click [10,10.4]：离边(y=10)=0.4、离点[10,10.8]=0.4 → 平手 → 曲线赢
  const hit = hitTest([edge, ptOnCurve], [10, 10.4], 1)
  eq(hit, { kind: 'edge', shape: 0, idx: 0 }, '平手 → 返边（旧 `<=` 会返点）')
})
test('49b. 点明显更近（≤0.35tol 短半径区）→ 仍拣【点】（#52 保留）', () => {
  // click [10,10.65]：离点 0.15 ≤0.35tol → 短路返点
  const hit = hitTest([edge, ptOnCurve], [10, 10.65], 1)
  eq(hit, { kind: 'pt', shape: 1, idx: 0 }, '≤0.35tol 内点优先 → 返点')
})
test('49c. 点严格更近（>0.35tol 比较区）→ 仍拣【点】（真实距离严格近者赢）', () => {
  // click [10,10.55]：离点 0.25、离边 0.55 → 点严格更近 → 返点
  const hit = hitTest([edge, ptOnCurve], [10, 10.55], 1)
  eq(hit, { kind: 'pt', shape: 1, idx: 0 }, '点(0.25) < 边(0.55) → 返点')
})
test('49d. 清楚落喺边上 → 返边', () => {
  const hit = hitTest([edge, ptOnCurve], [10, 10.03], 1)
  eq(hit, { kind: 'edge', shape: 0, idx: 0 }, '离边 0.03 → 返边')
})

// ════════════════════════════════════════════════════════════════════════
// #46 chainSelect — 双击一条边链选整条相连轮廓
// ════════════════════════════════════════════════════════════════════════
test('46a. 矩形一条边 → 链选全 4 条边', () => {
  const rect = { type: 'rect', a: [0, 0], b: [10, 10] }
  const chain = chainSelect([rect], { kind: 'edge', shape: 0, idx: 0 })
  ok(chain.every((r) => r.kind === 'edge' && r.shape === 0), '全部系 shape0 嘅边')
  eq(sortIdx(chain), [0, 1, 2, 3], '4 条边（整条闭链）')
})
test('46b. 两条端点相接嘅开放折线 → 链跨两个 shape', () => {
  const a = { type: 'poly', pts: [[0, 0], [10, 0]], open: true }
  const b = { type: 'poly', pts: [[10, 0], [10, 10]], open: true }
  const chain = chainSelect([a, b], { kind: 'edge', shape: 0, idx: 0 })
  const shapes = [...new Set(chain.map((r) => r.shape))].sort()
  eq(shapes, [0, 1], '链走遍两个相接 shape')
})
test('46c. 唔相接嘅 shape 唔入链（只返 seed 自己嗰个）', () => {
  const a = { type: 'poly', pts: [[0, 0], [10, 0]], open: true }
  const far = { type: 'poly', pts: [[100, 0], [110, 0]], open: true }
  const chain = chainSelect([a, far], { kind: 'edge', shape: 0, idx: 0 })
  eq([...new Set(chain.map((r) => r.shape))], [0], '只 shape0（远处 shape 唔连）')
})
test('46d. 圆 seed = 整体单选（唔链）', () => {
  const circle = { type: 'circle', c: [0, 0], r: 5 }
  eq(chainSelect([circle], { kind: 'circle', shape: 0 }), [{ kind: 'circle', shape: 0 }], '圆原样返')
})

// ════════════════════════════════════════════════════════════════════════
// #44 marqueeHits — window（全包）/ crossing（相触）
// ════════════════════════════════════════════════════════════════════════
const rect = { type: 'rect', a: [0, 0], b: [10, 10] }
const circle = { type: 'circle', c: [0, 0], r: 5 }
const pointSh = { type: 'circle', c: [2, 2], r: 0, point: true }

test('44a. window 全包住 → 选中；只框住一半 → 唔选', () => {
  eq(marqueeHits([rect], [-5, -5], [15, 15], false), [{ kind: 'edge', shape: 0, idx: 0 }], '框完全包住矩形 → 选')
  eq(marqueeHits([rect], [5, 5], [20, 20], false), [], 'window 只框住一半（角 [0,0] 喺框外）→ 唔选')
})
test('44b. crossing 相触即选（同一半包框）', () => {
  eq(marqueeHits([rect], [5, 5], [20, 20], true), [{ kind: 'edge', shape: 0, idx: 0 }], 'crossing 相触 → 选')
})
test('44c. 完全无重叠 → window / crossing 都唔选', () => {
  eq(marqueeHits([rect], [50, 50], [60, 60], false), [], 'window 无重叠 → 唔选')
  eq(marqueeHits([rect], [50, 50], [60, 60], true), [], 'crossing 无重叠 → 唔选')
})
test('44d. 圆：window 全包 → circle ref；crossing 框内但唔掂 rim → 唔选；跨 rim → 选', () => {
  eq(marqueeHits([circle], [-10, -10], [10, 10], false), [{ kind: 'circle', shape: 0 }], '框包住成个圆 → 选')
  eq(marqueeHits([circle], [0.5, 0.5], [3, 3], true), [], 'crossing 细框喺圆内、唔掂 rim → 唔选（相触=触到轮廓）')
  ok(marqueeHits([circle], [4, -1], [6, 1], true).length === 1, 'crossing 框跨 rim([5,0]) → 选')
})
test('44e. 草图点：框住圆心 → pt ref（唔系 circle）', () => {
  eq(marqueeHits([pointSh], [0, 0], [5, 5], false), [{ kind: 'pt', shape: 0, idx: 0 }], '草图点 → pt#0 ref')
})
test('44f. 多 shape 混选（crossing）返晒命中', () => {
  const hits = marqueeHits([rect, circle, pointSh], [-6, -6], [6, 6], true)
  ok(hits.length === 3, '矩形+圆+点 全部相触 → 3 个 ref')
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
