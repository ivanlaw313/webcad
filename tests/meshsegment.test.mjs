// 网格平面区识别 segmentPlanarRegions 验证。跑法：npx tsx tests/meshsegment.test.mjs
import { segmentPlanarRegions, planarRegionSummary } from '../src/geom/meshSegment.ts'
let pass = 0, fail = 0
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m) } }
const eq = (a, b, t, m) => ok(Math.abs(a - b) <= t, `${m}: 期望 ${b}±${t}, 实际 ${a}`)

// 10³ 盒（8 顶点，12 三角，6 面各 2 三角）
const V = [0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0, 0, 0, 10, 10, 0, 10, 10, 10, 10, 0, 10, 10]
// 每面 2 三角（外向绕向无所谓，识别用 |法向|）
const T = [
  0, 2, 1, 0, 3, 2,   // z=0 底
  4, 5, 6, 4, 6, 7,   // z=10 顶
  0, 1, 5, 0, 5, 4,   // y=0
  2, 3, 7, 2, 7, 6,   // y=10
  1, 2, 6, 1, 6, 5,   // x=10
  0, 4, 7, 0, 7, 3,   // x=0
]

console.log('① 盒 → 6 平面区，各面积 100：')
const r = segmentPlanarRegions(V, T, 8, 0.5)
eq(r.length, 6, 0, '盒识别 6 个平面区')
ok(r.every((g) => g.triCount === 2), `各区 2 三角（实 ${r.map((g) => g.triCount).join(',')}）`)
ok(r.every((g) => Math.abs(g.area - 100) < 1e-6), `各区面积 100（实 ${r.map((g) => g.area.toFixed(0)).join(',')}）`)
// 法向应系 ±X/±Y/±Z 之一（轴对齐）
ok(r.every((g) => g.normal.filter((c) => Math.abs(Math.abs(c) - 1) < 1e-6).length === 1 && g.normal.filter((c) => Math.abs(c) < 1e-6).length === 2), '各区法向轴对齐(±X/±Y/±Z)')

console.log('② 概要：6 区全显著、覆盖率 100%：')
const sum = planarRegionSummary(r, 0.01)
eq(sum.total, 6, 0, '总区数 6')
eq(sum.significant, 6, 0, '显著区 6')
ok(Math.abs(sum.coveredFrac - 1) < 1e-6, `平面覆盖率 100%（实 ${(sum.coveredFrac * 100).toFixed(0)}%）`)

console.log('③ 单一平面（2 三角）→ 1 区；空 → 0：')
const flat = segmentPlanarRegions([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], [0, 1, 2, 0, 2, 3], 8, 0.5)
eq(flat.length, 1, 0, '平面 1 区')
ok(Math.abs(flat[0].area - 1) < 1e-9, `平面面积 1（实 ${flat[0]?.area}）`)
eq(segmentPlanarRegions([], [], 8, 0.5).length, 0, 0, '空网格 0 区')

console.log('④ 曲面（圆柱侧壁近似 16 段）→ 多区（非共面，唔会误并成 1）：')
const NS = 16, R = 5, H = 8
const cv = [], ct = []
for (let i = 0; i <= NS; i++) { const a = (2 * Math.PI * i) / NS; cv.push(R * Math.cos(a), R * Math.sin(a), 0, R * Math.cos(a), R * Math.sin(a), H) }
for (let i = 0; i < NS; i++) { const b = i * 2; ct.push(b, b + 2, b + 1, b + 1, b + 2, b + 3) }
const cyl = segmentPlanarRegions(cv, ct, 8, 0.5)
ok(cyl.length >= NS * 0.6, `圆柱侧壁分成多区（${cyl.length} 区，证曲面唔会误并成 1 大平面）`)
ok(cyl.length < NS * 4, `区数合理（${cyl.length}，相邻近共面段会并）`)

console.log(`\n${fail === 0 ? '✅ 全部通过' : '❌ 有失败'} (${pass} pass / ${fail} fail)`)
process.exit(fail === 0 ? 0 : 1)
