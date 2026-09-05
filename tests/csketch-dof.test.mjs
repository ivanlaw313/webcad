// csketch-dof.test.mjs — GM-F4 · 逐点/逐实体 DOF 诊断 (diagnoseSketchDof, src/sketch/solver.ts) 验证套件
// 跑法: npx -y tsx tests/csketch-dof.test.mjs   (喺 C:\ClaudeCode\webcad 目录)
// 失败 → exit 1; 末尾输出 PASS/FAIL 总表。
//
// ── 呢个 test 同 coincident.test.mjs 唔同：佢跑「真」planegcs WASM。──
// solver.ts 有 Vite 专用 `import wasmUrl from '...planegcs.wasm?url'`。node 揾唔到 .wasm?url,
// 所以用 module loader hook 把「?url」specifier 换成一个 data 模块（default 导出空字串）→
// solver.ts 嘅 wasmUrl = ""（falsy）→ make_gcs_wrapper 行默认路径 → emscripten 喺 node 直接由
// 包目录 load planegcs.wasm。solver.ts 嘅 `import.meta.env` 已用 typeof 守卫,tsx 下唔会爆。
// 咁样就跑到 REAL solver + REAL diagnoseSketchDof（唔系 stub），逐点结果同浏览器一致。
//
// 上色语义（对齐 CSketch.tsx）：
//   点黑 ⇔ ptFull[id]              （x 同 y 都锁死）
//   线黑 ⇔ ptFull[p1] && ptFull[p2]
//   圆黑 ⇔ ptFull[center] && circRadFull[circleId]
//
// TIER：呢个系 tier-2「扰动探针」家族嘅「钉靶可达性」变体（pin-and-check）。planegcs binding
// 冇 per-param free-list（只有全局 gcs.dof()）→ tier-1 唔存在。诚实局限见 solver.ts 头注。

import { register } from 'node:module'

// 只 stub「?url」import → 其余（solver.ts 本体、@salusoft89/planegcs、真 wasm）照 load。
const loaderSrc = [
  'export async function resolve(specifier, context, next) {',
  "  if (specifier.includes('?url')) return { url: 'data:text/javascript,export default %22%22', shortCircuit: true }",
  '  return next(specifier, context)',
].join('\n') + '\n}'
register('data:text/javascript,' + encodeURIComponent(loaderSrc))

const { diagnoseSketchDof } = await import('../src/sketch/solver.ts')

// ── harness ──
let pass = 0, fail = 0
const ok = (cond, msg) => { if (cond) { pass++; console.log(`  PASS  ${msg}`) } else { fail++; console.log(`  FAIL  ${msg}`) } }
const eq = (a, b, msg) => ok(a === b, `${msg} (=${JSON.stringify(a)}${a === b ? '' : ' ≠ ' + JSON.stringify(b)})`)

// 上色规则（对齐 CSketch.tsx）
const lineBlack = (d, p1, p2) => !!d.ptFull[p1] && !!d.ptFull[p2]
const circBlack = (d, center, cid) => !!d.ptFull[center] && !!d.circRadFull[cid]

// 矩形 builder：p1(0,0) p2(40,0) p3(40,25) p4(0,25)；4 边 + h/v；可选 固定角 / 宽尺寸 / 高尺寸
function rect({ fixCorner = true, widthDim = true, heightDim = true } = {}) {
  const P = [
    { id: 'p1', type: 'point', x: 0, y: 0, fixed: fixCorner },
    { id: 'p2', type: 'point', x: 40, y: 0, fixed: false },
    { id: 'p3', type: 'point', x: 40, y: 25, fixed: false },
    { id: 'p4', type: 'point', x: 0, y: 25, fixed: false },
  ]
  const L = [
    { id: 'l1', type: 'line', p1_id: 'p1', p2_id: 'p2' },
    { id: 'l2', type: 'line', p1_id: 'p2', p2_id: 'p3' },
    { id: 'l3', type: 'line', p1_id: 'p3', p2_id: 'p4' },
    { id: 'l4', type: 'line', p1_id: 'p4', p2_id: 'p1' },
  ]
  const C = [
    { id: 'h1', type: 'horizontal_l', l_id: 'l1' },
    { id: 'v2', type: 'vertical_l', l_id: 'l2' },
    { id: 'h3', type: 'horizontal_l', l_id: 'l3' },
    { id: 'v4', type: 'vertical_l', l_id: 'l4' },
  ]
  if (widthDim) C.push({ id: 'dw', type: 'p2p_distance', p1_id: 'p1', p2_id: 'p2', distance: 40 })
  if (heightDim) C.push({ id: 'dh', type: 'p2p_distance', p1_id: 'p2', p2_id: 'p3', distance: 25 })
  return [...P, ...L, ...C]
}

// ── (a) 完全标注矩形 → 全部点/线 黑 ──
console.log('\n## (a) fully-dimensioned rectangle → all points constrained (black)')
{
  const d = await diagnoseSketchDof(rect())
  ok(d.ok, 'diagnose ok')
  eq(d.dof, 0, 'sketch dof = 0 (fully defined)')
  ok(['p1', 'p2', 'p3', 'p4'].every((id) => d.ptFull[id] === true), 'all 4 corners ptFull=true')
  ok(['l1', 'l2', 'l3', 'l4'].every((l) => lineBlack(d, ...({ l1: ['p1', 'p2'], l2: ['p2', 'p3'], l3: ['p3', 'p4'], l4: ['p4', 'p1'] })[l])), 'all 4 edges black')
}

// ── (b) 减一条尺寸(宽) → 右边两点 x 自由,其余仍锁 ──
console.log('\n## (b) rectangle minus width dim → exactly the right-edge points flagged free')
{
  const d = await diagnoseSketchDof(rect({ widthDim: false }))
  ok(d.ok, 'diagnose ok')
  eq(d.dof, 1, 'sketch dof = 1 (width undefined)')
  // 边个自由：p2/p3 嘅 x 系宽度自由度（x2=x3 耦合）；p1 固定、p4.x 经 v4 锁到 p1.x=0
  eq(d.ptFull.p1, true, 'p1 fully constrained')
  eq(d.ptFull.p4, true, 'p4 fully constrained')
  eq(d.ptFull.p2, false, 'p2 NOT fully constrained')
  eq(d.ptFull.p3, false, 'p3 NOT fully constrained')
  eq(JSON.stringify(d.ptAxis.p2), JSON.stringify({ x: false, y: true }), 'p2: x free, y constrained')
  eq(JSON.stringify(d.ptAxis.p3), JSON.stringify({ x: false, y: true }), 'p3: x free, y constrained (对称——两点齐蓝,非只认一个)')
  // 实体：底边 l1(p1-p2) 长度未定 → 蓝；右边 l2(p2-p3) → 蓝；左边 l4(p4-p1) → 黑
  eq(lineBlack(d, 'p1', 'p2'), false, 'bottom edge l1 (undimensioned width) → blue')
  eq(lineBlack(d, 'p2', 'p3'), false, 'right edge l2 → blue')
  eq(lineBlack(d, 'p4', 'p1'), true, 'left edge l4 → black')
}

// ── (b2) 减高尺寸 → 顶边两点 y 自由（对称对照）──
console.log('\n## (b2) rectangle minus height dim → top-edge points free (symmetry check)')
{
  const d = await diagnoseSketchDof(rect({ heightDim: false }))
  eq(d.dof, 1, 'dof = 1')
  eq(JSON.stringify(d.ptAxis.p3), JSON.stringify({ x: true, y: false }), 'p3: y free')
  eq(JSON.stringify(d.ptAxis.p4), JSON.stringify({ x: true, y: false }), 'p4: y free')
  eq(d.ptFull.p1, true, 'p1 black')
  eq(d.ptFull.p2, true, 'p2 black')
}

// ── (c) 圆：圆心固定 + 半径尺寸 → 全黑；删半径 → 圆蓝 ──
console.log('\n## (c) circle center-fixed + radius dim → black; radius removed → circle blue')
const circle = (radiusDim) => {
  const a = [
    { id: 'cc', type: 'point', x: 10, y: 5, fixed: true },
    { id: 'c1', type: 'circle', c_id: 'cc', radius: 8 },
  ]
  if (radiusDim) a.push({ id: 'dr', type: 'circle_radius', c_id: 'c1', radius: 8 })
  return a
}
{
  const withR = await diagnoseSketchDof(circle(true))
  eq(withR.dof, 0, 'with radius dim: dof = 0')
  eq(withR.ptFull.cc, true, 'center constrained')
  eq(withR.circRadFull.c1, true, 'radius constrained')
  eq(circBlack(withR, 'cc', 'c1'), true, 'circle entity BLACK')

  const noR = await diagnoseSketchDof(circle(false))
  eq(noR.dof, 1, 'no radius dim: dof = 1')
  eq(noR.ptFull.cc, true, 'center still constrained (fixed)')
  eq(noR.circRadFull.c1, false, 'radius FREE')
  eq(circBlack(noR, 'cc', 'c1'), false, 'circle entity BLUE (radius undefined)')
}

// ── (d) 性能：50 实体探针 < 2s ──
console.log('\n## (d) performance: 50-entity sketch probe < 2s')
{
  // 50 条线 zigzag 链,p0 固定,部分 horizontal（大量欠定义 → 最坏情况逐点全探）
  const P = [{ id: 'p0', type: 'point', x: 0, y: 0, fixed: true }], L = [], C = []
  for (let i = 1; i <= 50; i++) {
    P.push({ id: 'p' + i, type: 'point', x: i * 10, y: (i % 2) * 10, fixed: false })
    L.push({ id: 'l' + i, type: 'line', p1_id: 'p' + (i - 1), p2_id: 'p' + i })
  }
  for (let i = 1; i <= 50; i += 2) C.push({ id: 'h' + i, type: 'horizontal_l', l_id: 'l' + i })
  const prims = [...P, ...L, ...C]
  await diagnoseSketchDof([{ id: 'w', type: 'point', x: 0, y: 0, fixed: true }]) // warmup (wasm 早已 init,呢步只求稳)
  const t0 = performance.now()
  const d = await diagnoseSketchDof(prims)
  const ms = performance.now() - t0
  ok(d.ok, `diagnose ok (points ${P.length}, lines ${L.length})`)
  ok(ms < 2000, `probe time ${ms.toFixed(0)}ms < 2000ms`)
  // sanity：p0 固定 → 黑；至少有欠定义点
  eq(d.ptFull.p0, true, 'fixed anchor p0 black')
  ok(Object.values(d.ptFull).some((v) => v === false), 'some points flagged free (under-defined chain)')
}

// ── (e) 空 / 退化 → 唔崩,唔乱 flag ──
console.log('\n## (e) empty / degenerate → no crash, no bogus flags')
{
  const empty = await diagnoseSketchDof([])
  ok(empty.ok, 'empty sketch: ok (no crash)')
  eq(Object.keys(empty.ptFull).length, 0, 'empty: no point flags')

  const oneFixed = await diagnoseSketchDof([{ id: 'o', type: 'point', x: 0, y: 0, fixed: true }])
  eq(oneFixed.ptFull.o, true, 'single fixed point → black')

  const coincident = await diagnoseSketchDof([
    { id: 'a', type: 'point', x: 5, y: 5, fixed: false },
    { id: 'b', type: 'point', x: 5, y: 5, fixed: false },
    { id: 'k', type: 'p2p_coincident', p1_id: 'a', p2_id: 'b' },
  ])
  ok(coincident.ok, 'two coincident free points: ok')
  ok(coincident.ptFull.a === false && coincident.ptFull.b === false, 'both float → both blue (no crash)')

  const degen = await diagnoseSketchDof([
    { id: 'a', type: 'point', x: 3, y: 3, fixed: true },
    { id: 'b', type: 'point', x: 3, y: 3, fixed: false },
    { id: 'l', type: 'line', p1_id: 'a', p2_id: 'b' },
  ])
  ok(degen.ok, 'zero-length line: ok (no crash / no NaN throw)')
  eq(degen.ptFull.a, true, 'degenerate: fixed endpoint black')
}

// ── 总表 ──
const total = pass + fail
console.log(`\n══════ ${pass}/${total} passed${fail ? `  (${fail} FAILED)` : ''} ══════`)
if (fail) process.exit(1)
