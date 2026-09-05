// freesolve-l2.test.mjs — GM-L2 backlog #52 / #53 / #54 验证套件（src/sketch/freesolve.ts）
// 跑法: npx -y tsx tests/freesolve-l2.test.mjs   (喺 C:\ClaudeCode\webcad 目录)
// 失败 → exit 1; 末尾输出 PASS/FAIL 总表
//
// 覆盖:
//   #52 hitTest — 近原点/顶点嘅边、圆周唔再被 tier-1 点抢死（0.35tol 短路 + tier-2/3 比真实距离拣最近）
//   #53 equal   — 弧段+直边 equal 喺 conApplicable 一致拒绝；buildPrims 死分支移除后诚实唔发 prim；正样本仍 work
//   #54 probe   — shapeDofProbes 对 verts-poly 弧段补 arc_radius(said) 探针（圆角矩形弧半径自由 → 会被标欠定）
//
// loader hook: freesolve.ts → solver.ts 有 Vite 专用 import（?url + import.meta.env），node 跑唔起。
// hitTest / conApplicable / buildPrims / shapeDofProbes 全部纯函数、唔掂 solver wasm，所以用 module hook
// 将 ?url 同成个 solver.ts stub 走先 dynamic import（同 coincident/arclen-tancircle 一模一样）。
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

const { hitTest, conApplicable, _internals } = await import('../src/sketch/freesolve.ts')
const { buildPrims, shapeDofProbes } = _internals

// ── 迷你 harness（同 coincident.test.mjs 一致） ──
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

const QB = Math.tan(Math.PI / 8) // 四分一弧 bulge (θ=π/2)

// ════════════════════════════════════════════════════════════════════════
// #52 hitTest — 点 tier 唔再贪食吞掉近处嘅边/圆周
// ════════════════════════════════════════════════════════════════════════
// tol=1；_refGeo 默认 null。原点 ⊕ 永远系 tier-1 候选点（[0,0]）。

test('52a. 边贴近点（>0.35tol 离原点）→ 拣返边，唔再被原点抢', () => {
  // 一条水平边 y=0.1（穿过原点附近）；click [0.5,0]：离原点 0.5∈(0.35,0.6)，离边 0.1
  const poly = { type: 'poly', pts: [[-5, 0.1], [5, 0.1]] }
  const hit = hitTest([poly], [0.5, 0], 1)
  eq(hit, { kind: 'edge', shape: 0, idx: 0 }, '离边(0.1) < 离原点(0.5) → 返边（旧码会返 origin）')
})

test('52b. 点 ≤0.35tol 定胜（细半径点优先区）— 即使有更近嘅边', () => {
  // click [0.3,0]：离原点 0.3 ≤ 0.35tol → 短路直接返原点，唔理边（哪怕边 y=0.1 更近）
  const poly = { type: 'poly', pts: [[-5, 0.1], [5, 0.1]] }
  const hit = hitTest([poly], [0.3, 0], 1)
  eq(hit, { kind: 'origin' }, '≤0.35tol 内点优先区：返 origin（刻意保留嘅细抓取区）')
})

test('52c. 比较区内点仍胜过更远嘅边（真实距离取近者，平手偏点）', () => {
  // click [0.4,0]：离原点 0.4∈(0.35,0.6)，边 y=0.5 离 click 0.5 > 0.4 → 返原点
  const poly = { type: 'poly', pts: [[-5, 0.5], [5, 0.5]] }
  const hit = hitTest([poly], [0.4, 0], 1)
  eq(hit, { kind: 'origin' }, '点(0.4) < 边(0.5) → 返 origin')
})

test('52d. 普通顶点亦唔再贪食：矩形角旁嘅边可拣', () => {
  // rect 角 (10,10)；click [10.5,10] 离角 0.5(>0.35)，恰落底边 y=10 上 → 离底边 0
  const rect = { type: 'rect', a: [10, 10], b: [30, 30] }
  const hit = hitTest([rect], [10.5, 10], 1)
  eq(hit, { kind: 'edge', shape: 0, idx: 0 }, '离底边(0) < 离角(0.5) → 返底边 idx0（旧码会返角点）')
})

test('52e. 无边时点照返；完全无命中返 null', () => {
  // 只有原点候选、无其他几何：click [0.5,0] 离原点 0.5<0.6 → 返 origin（唔进 tier-2/3 亦无边可比）
  eq(hitTest([], [0.5, 0], 1), { kind: 'origin' }, '离原点 0.5<0.6、无边 → 返 origin')
  // click 远离一切（离原点 √50≈7.07 > 0.6tol，无其他几何）→ null
  eq(hitTest([], [5, 5], 1), null, '离原点远、无几何 → null')
})

// ════════════════════════════════════════════════════════════════════════
// #53 equal — 弧段+直边一致诚实拒绝；死分支移除；正样本仍通
// ════════════════════════════════════════════════════════════════════════
// 共用几何：verts-poly 弧段(seg0=弧, seg1=直闭合段)
const arcLinePoly = () => ({ type: 'poly', verts: [[10, 0], [0, 10]], bulges: [QB, 0] })
const A_arcSeg = { kind: 'edge', shape: 0, idx: 0 }   // 弧段
const B_lineSeg = { kind: 'edge', shape: 0, idx: 1 }  // 同 poly 嘅直闭合段
const mkEqual = (a, b) => ({ id: 'kEQ', kind: 'con', type: 'equal', a, b })
// buildPrims 内约束 prim 用 id=c.id → 用 id 过滤该约束发咗乜
const conPrims = (prims) => prims.filter((p) => p.id === 'kEQ')

test('53a. conApplicable: 弧段 + 直边 equal → false（两个方向都拒）', () => {
  const shapes = [arcLinePoly()]
  ok(conApplicable('equal', [A_arcSeg, B_lineSeg], shapes) === false, '弧段+直边 → 唔可用')
  ok(conApplicable('equal', [B_lineSeg, A_arcSeg], shapes) === false, '倒转 直边+弧段 → 一样唔可用')
})

test('53b. buildPrims: 弧段 + 直边 equal → 诚实唔发任何 equal prim（死分支移除后无静默 equal_length）', () => {
  const shapes = [arcLinePoly()]
  const prims = buildPrims(shapes, [mkEqual(A_arcSeg, B_lineSeg)])
  eq(conPrims(prims).length, 0, '无 id=kEQ 嘅约束 prim（唔会误发 equal_length 锁去弦长）')
  // 倒转组合一样唔发
  const prims2 = buildPrims(shapes, [mkEqual(B_lineSeg, A_arcSeg)])
  eq(conPrims(prims2).length, 0, '倒转组合亦唔发')
})

test('53c. 正样本仍通：弧段+弧段 → equal_radius_aa', () => {
  // 两段弧 poly: seg0 弧, seg1 弧, seg2 直闭合
  const poly = { type: 'poly', verts: [[10, 0], [0, 10], [-10, 0]], bulges: [QB, QB, 0] }
  ok(conApplicable('equal', [{ kind: 'edge', shape: 0, idx: 0 }, { kind: 'edge', shape: 0, idx: 1 }], [poly]) === true, 'conApplicable 弧+弧 → 可用')
  const prims = buildPrims([poly], [mkEqual({ kind: 'edge', shape: 0, idx: 0 }, { kind: 'edge', shape: 0, idx: 1 })])
  const p = conPrims(prims)
  eq(p.length, 1, '恰好 1 条约束 prim')
  eq(p[0].type, 'equal_radius_aa', 'type = equal_radius_aa')
  eq([p[0].a1_id, p[0].a2_id], ['sa0_0', 'sa0_1'], 'a1/a2 = 两弧段 solver arc (sa0_0/sa0_1)')
})

test('53d. 正样本仍通：圆+圆 → equal_radius_cc；直边+直边 → equal_length；弧段+圆 → equal_radius_ca', () => {
  // 圆 + 圆
  const cc = buildPrims([{ type: 'circle', c: [0, 0], r: 5 }, { type: 'circle', c: [50, 50], r: 3 }],
    [mkEqual({ kind: 'circle', shape: 0 }, { kind: 'circle', shape: 1 })])
  eq(conPrims(cc).map((p) => p.type), ['equal_radius_cc'], '圆+圆 → equal_radius_cc')
  // 直边 + 直边（矩形 edge 0 与 2）
  const ll = buildPrims([{ type: 'rect', a: [0, 0], b: [10, 10] }],
    [mkEqual({ kind: 'edge', shape: 0, idx: 0 }, { kind: 'edge', shape: 0, idx: 2 })])
  eq(conPrims(ll).map((p) => p.type), ['equal_length'], '直边+直边 → equal_length')
  // 弧段 + 圆
  const ca = buildPrims([arcLinePoly(), { type: 'circle', c: [50, 50], r: 4 }],
    [mkEqual(A_arcSeg, { kind: 'circle', shape: 1 })])
  const p = conPrims(ca)
  eq(p.length, 1, '弧段+圆 → 1 条')
  eq(p[0].type, 'equal_radius_ca', 'type = equal_radius_ca')
  eq([p[0].c1_id, p[0].a2_id], ['c1', 'sa0_0'], 'c1=圆 cid(1), a2=弧段 said(0,0)')
})

// ════════════════════════════════════════════════════════════════════════
// #54 shapeDofProbes — verts-poly 弧段半径 DOF 探针（arc_radius/said）
// ════════════════════════════════════════════════════════════════════════
const rads = (probes) => probes.filter((p) => p.kind === 'rad').map((p) => p.id)
const pts = (probes) => probes.filter((p) => p.kind === 'pt').map((p) => p.id)

test('54a. 圆角矩形（弧段半径自由）→ 每 |bulge|>eps 段补 arc_radius 探针（said）', () => {
  // 4 verts，seg1/seg3 系弧（bulge 0.5），seg0/seg2 直
  const rrect = { type: 'poly', verts: [[0, 0], [10, 0], [10, 10], [0, 10]], bulges: [0, 0.5, 0, 0.5] }
  const pr = shapeDofProbes(rrect, 0)
  eq(pts(pr), ['p0_0', 'p0_1', 'p0_2', 'p0_3'], '4 个 corner 点探针照旧')
  eq(rads(pr), ['sa0_1', 'sa0_3'], '2 个弧段半径探针 sa0_1/sa0_3（旧码呢度系 [] → 弧半径自由被错判全约束）')
  // 交叉验证：buildPrims 真系有对应嘅 said arc prim（探针 id 系真 solver prim）
  const arcIds = buildPrims([rrect], []).filter((p) => p.type === 'arc').map((p) => p.id)
  ok(arcIds.includes('sa0_1') && arcIds.includes('sa0_3'), 'buildPrims 有 sa0_1/sa0_3 arc prim（探针可命中 g0）')
})

test('54b. 开放 verts-poly：闭合段唔探（segN=n-1，同 buildPrims 一致）', () => {
  // 3 verts open：seg0 弧、seg1 直；bulges[2]（本应闭合段）应被忽略
  const openP = { type: 'poly', verts: [[0, 0], [10, 0], [10, 10]], bulges: [0.5, 0, 0.5], open: true }
  const pr = shapeDofProbes(openP, 0)
  eq(rads(pr), ['sa0_0'], '净系 seg0 弧探到 → [sa0_0]（唔探唔存在嘅闭合 seg2）')
  const arcIds = buildPrims([openP], []).filter((p) => p.type === 'arc').map((p) => p.id)
  eq(arcIds, ['sa0_0'], 'buildPrims 亦净系发 sa0_0（探针枚举同 prim 生成条件对齐）')
})

test('54c. 无回归：全直 verts-poly / rect → 0 个半径探针', () => {
  const flat = { type: 'poly', verts: [[0, 0], [10, 0], [10, 10], [0, 10]], bulges: [0, 0, 0, 0] }
  eq(rads(shapeDofProbes(flat, 0)), [], '全直段 → 无半径探针')
  eq(pts(shapeDofProbes(flat, 0)), ['p0_0', 'p0_1', 'p0_2', 'p0_3'], '仍有 4 点探针')
  const rect = { type: 'rect', a: [0, 0], b: [10, 10] }
  eq(rads(shapeDofProbes(rect, 0)), [], 'rect → 无半径探针（唔系 verts-poly）')
})

test('54d. 无回归：圆 / 草图点 / 三点弧 探针照旧', () => {
  eq(shapeDofProbes({ type: 'circle', c: [0, 0], r: 5 }, 0), [{ kind: 'pt', id: 'p0_0' }, { kind: 'rad', id: 'c0' }], '圆 → 圆心点 + 半径(c0)')
  eq(shapeDofProbes({ type: 'circle', c: [0, 0], r: 0, point: true }, 0), [{ kind: 'pt', id: 'p0_0' }], '草图点(r=0) → 净系圆心点，无半径')
  const ap = { type: 'poly', pts: [[10, 0], [0, 10]], arc: { a: [10, 0], b: [0, 10], m: [7.07, 7.07] } }
  eq(shapeDofProbes(ap, 0), [{ kind: 'pt', id: 'p0_0' }, { kind: 'pt', id: 'p0_1' }, { kind: 'pt', id: 'p0_2' }, { kind: 'rad', id: 'c0' }], '三点弧 → a/b/圆心 3 点 + 半径(c0)')
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
