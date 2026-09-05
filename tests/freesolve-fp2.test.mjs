// freesolve-fp2.test.mjs — GM-FP2（尺寸+约束）solver-visible 单元验证（src/sketch/freesolve.ts）
// 跑法: npx -y tsx tests/freesolve-fp2.test.mjs   (喺 C:\ClaudeCode\webcad 目录)
// 失败 → exit 1; 末尾输出 PASS/FAIL 总表
//
// 覆盖:
//   #29 R↔Ø 显示语义 — radDiaDisplay（rad→R(v)/翻→Ø(2v)；dia→Ø(v)/翻→R(v/2)）+ radDiaStore（逆变换 round-trip）
//   #29 value semantics — measureDim 对同一几何 rad=R、dia=2R（内核值语义唔变，翻转纯显示）
//   #27 projected 投影尺寸 — 单直边 H/V 用 solver 已有嘅 hdist/vdist（两端点 point-point）诚实表达：
//       hdist=|dx|、vdist=|dy|、len(Aligned)=真长 —— 无新增 solver dim 型
//
// loader hook: 同 freesolve-l2 —— 把 ?url + solver.ts 走 stub，令纯函数（radDiaDisplay/radDiaStore/measureDim）
// 喺 node 跑起（唔掂 solver wasm）。
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
].concat(['}']).join('\n')
register('data:text/javascript,' + encodeURIComponent(loaderSrc))

const { radDiaDisplay, radDiaStore, measureDim } = await import('../src/sketch/freesolve.ts')

// ── 迷你 harness ──
const rows = []
let notes = []
function note(s) { notes.push(s); console.log(`    ${s}`) }
function ok(cond, msg) { if (!cond) throw new Error(msg); note(msg) }
function near(a, b, msg, tol = 1e-9) { if (Math.abs(a - b) > tol) throw new Error(`${msg}: 期望 ${b}, 实际 ${a}`); note(`${msg}: ${a}`) }
function eq(actual, expected, msg) { const a = JSON.stringify(actual), e = JSON.stringify(expected); if (a !== e) throw new Error(`${msg}: 期望 ${e}, 实际 ${a}`); note(`${msg}: ${a}`) }
function test(name, fn) { console.log(`\n## ${name}`); notes = []; try { fn(); rows.push({ name, pass: true }) } catch (e) { rows.push({ name, pass: false, info: String(e.message) }); console.log(`    !! FAIL: ${e.message}`) } }

// ════════════════════════════════════════════════════════════════════════
// #29 radDiaDisplay / radDiaStore
// ════════════════════════════════════════════════════════════════════════
test('29a. radDiaDisplay — 自然表示（唔翻）', () => {
  eq(radDiaDisplay('rad', 5), { prefix: 'R', value: 5 }, 'rad 自然 → R5')
  eq(radDiaDisplay('dia', 10), { prefix: 'Ø', value: 10 }, 'dia 自然 → Ø10')
})

test('29b. radDiaDisplay — 翻转（rad→Ø×2 / dia→R÷2）', () => {
  eq(radDiaDisplay('rad', 5, true), { prefix: 'Ø', value: 10 }, 'rad 翻 → Ø10（半径×2）')
  eq(radDiaDisplay('dia', 10, true), { prefix: 'R', value: 5 }, 'dia 翻 → R5（直径÷2）')
})

test('29c. radDiaStore — 逆变换：用户打【显示值】折返 stored 自然 value', () => {
  near(radDiaStore('rad', 5), 5, 'rad 未翻：打 R5 → stored R5')
  near(radDiaStore('rad', 10, true), 5, 'rad 翻显 Ø：打 Ø10 → stored R5（÷2）')
  near(radDiaStore('dia', 10), 10, 'dia 未翻：打 Ø10 → stored Ø10')
  near(radDiaStore('dia', 5, true), 10, 'dia 翻显 R：打 R5 → stored Ø10（×2）')
})

test('29d. round-trip：display∘store = 恒等（任意 flip）', () => {
  for (const [type, v] of [['rad', 7], ['dia', 24]]) {
    for (const flip of [false, true]) {
      const shown = radDiaDisplay(type, v, flip).value
      near(radDiaStore(type, shown, flip), v, `${type} flip=${flip}: store(display(${v})) = ${v}`)
    }
  }
})

// ════════════════════════════════════════════════════════════════════════
// #29 value semantics — measureDim rad vs dia（同一圆：R vs 2R；内核值语义唔受翻转旗影响）
// ════════════════════════════════════════════════════════════════════════
test('29e. measureDim — circle：rad=R、dia=2R（stored type 决定，radDiaFlip 唔入 measure）', () => {
  const shapes = [{ type: 'circle', c: [0, 0], r: 5 }]
  const rc = { id: 'r', kind: 'dim', type: 'rad', a: { kind: 'circle', shape: 0 }, value: 5 }
  const dc = { id: 'd', kind: 'dim', type: 'dia', a: { kind: 'circle', shape: 0 }, value: 10 }
  near(measureDim(shapes, rc), 5, 'rad → 5')
  near(measureDim(shapes, dc), 10, 'dia → 10')
  // 加 radDiaFlip 旗 → measureDim 唔变（纯显示旗；旧档/内核零影响）
  near(measureDim(shapes, { ...rc, radDiaFlip: true }), 5, 'rad+flip：measure 仍 5（翻转纯显示）')
})

// ════════════════════════════════════════════════════════════════════════
// #27 projected 投影尺寸 — 单直边 Aligned/H/V 用 solver 已有 len / hdist / vdist 诚实表达
// ════════════════════════════════════════════════════════════════════════
test('27a. 单斜边：len(Aligned)=真长、hdist=|dx|、vdist=|dy|（两端点 pt-ref）', () => {
  // 一条 [0,0]→[8,6] 嘅开放边 → 真长 10、dx 8、dy 6
  const shapes = [{ type: 'poly', pts: [[0, 0], [8, 6]], open: true }]
  const eRef = { kind: 'edge', shape: 0, idx: 0 }
  const pA = { kind: 'pt', shape: 0, idx: 0 }
  const pB = { kind: 'pt', shape: 0, idx: 1 }
  near(measureDim(shapes, { id: 'l', kind: 'dim', type: 'len', a: eRef, value: 0 }), 10, 'len(Aligned) = 真长 10')
  near(measureDim(shapes, { id: 'h', kind: 'dim', type: 'hdist', a: pA, b: pB, value: 0 }), 8, 'hdist = |dx| = 8（水平投影）')
  near(measureDim(shapes, { id: 'v', kind: 'dim', type: 'vdist', a: pA, b: pB, value: 0 }), 6, 'vdist = |dy| = 6（竖直投影）')
})

test('27b. rect 底边两端点 → hdist=宽、vdist=0（底边水平）', () => {
  const shapes = [{ type: 'rect', a: [0, 0], b: [10, 4] }]
  // rect 角序 c0=a=[0,0] c1=[10,0] c2=b=[10,4] c3=[0,4]；底边 = c0→c1
  const pA = { kind: 'pt', shape: 0, idx: 0 }, pB = { kind: 'pt', shape: 0, idx: 1 }
  near(measureDim(shapes, { id: 'h', kind: 'dim', type: 'hdist', a: pA, b: pB, value: 0 }), 10, 'hdist = 宽 10')
  near(measureDim(shapes, { id: 'v', kind: 'dim', type: 'vdist', a: pA, b: pB, value: 0 }), 0, 'vdist = 0（底边水平）')
})

// ── 总表 ──
console.log('\n══════ 总表 ══════')
let pass = 0
for (const r of rows) { console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.info ? ' — ' + r.info : ''}`); if (r.pass) pass++ }
console.log(`\n${pass}/${rows.length} 通过`)
if (pass !== rows.length) process.exit(1)
