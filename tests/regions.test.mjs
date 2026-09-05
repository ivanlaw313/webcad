// regions.test.mjs — 草图【区域检测 / 平面排布】detectRegions (src/sketch/regions.ts) 验证套件
// 跑法: npx tsx tests/regions.test.mjs   (喺 C:\ClaudeCode\webcad 目录)
// 失败 → exit 1; 末尾输出 PASS/FAIL 总表
//
// regions.ts 系纯函数、零依赖（冇 Vite ?url import），可以直接 import，唔使 loader hook。
import { detectRegions, exactProfileAlgebra, shapeOutline, simplifyDP } from '../src/sketch/regions.ts'

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
  if (Math.abs(actual - expected) > tol) throw new Error(`${msg}: 期望 ≈${expected} (tol ${tol}), 实际 ${actual}`)
  note(`${msg}: ${actual} ≈ ${expected}`)
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

// shoelace 面积（绝对值）—— 验区域几何/面积守恒用
function shoelace(pts) {
  let area = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) area += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1])
  return Math.abs(area / 2)
}

// ── 1. 两个重叠矩形 —— P2 批10 region-pick contract：真相交切断 → 3 面 + split=true + 1 条并集外环 ──
test('1. 重叠矩形 → faces=3, split=true, unionLoops=1（P2 批10 region-pick contract）', () => {
  // rectA: [0,0]-[20,10] (200), rectB: [10,0]-[30,10] (200), 重叠 [10,0]-[20,10] (100)
  const rectA = { type: 'rect', a: [0, 0], b: [20, 10] }
  const rectB = { type: 'rect', a: [10, 0], b: [30, 10] }
  const r = detectRegions([rectA, rectB])
  eq(r.faces.length, 3, '3 个最小封闭面（左独有/重叠/右独有）')
  eq(r.split, true, '真有交点切断 → split=true')
  eq(r.unionLoops.length, 1, '并集外边界只有 1 条环（内部共享边已消去）')
  // 面积守恒：3 面面积之和 == 两矩形并集面积 = 200+200-100 = 300
  const faceAreas = r.faces.map(shoelace)
  const sumFaces = faceAreas.reduce((a, b) => a + b, 0)
  approx(sumFaces, 300, 1e-6, '3 面面积之和 = 两矩形并集面积 300')
  const unionArea = shoelace(r.unionLoops[0])
  approx(unionArea, 300, 1e-6, '并集外环面积 = 300')
  approx(sumFaces, unionArea, 1e-6, '面积守恒：sum(faces) ≈ union 外环面积')
})

// ── 2. 两个不相交矩形 —— 冇真交点 → split=false；各自独立成 1 面 ──
test('2. 不相交矩形 → split=false（冇真切断）, faces 反映 2 个独立环', () => {
  const rectC = { type: 'rect', a: [0, 0], b: [10, 10] }
  const rectD = { type: 'rect', a: [100, 100], b: [110, 110] }
  const r = detectRegions([rectC, rectD])
  // 两个矩形完全分开、边界之间冇任何交点 → anyCut 恒 false
  eq(r.split, false, '两环完全唔相交 → split=false')
  // 每个矩形独立围成一个面：实测 faces.length=2（各 100 面积），非任何交叠切割
  eq(r.faces.length, 2, '2 个独立矩形 → 2 个独立面')
  const areas = r.faces.map(shoelace).sort((a, b) => a - b)
  approx(areas[0], 100, 1e-6, '面 1 面积 = 10×10 = 100')
  approx(areas[1], 100, 1e-6, '面 2 面积 = 10×10 = 100')
  // 实测 unionLoops 同样是 2 条独立外环（各自围住自己）
  eq(r.unionLoops.length, 2, 'unionLoops 亦反映 2 个独立环（各自围住自己，冇合并）')
})

// ── 3. 圆嵌套喺矩形内（冇相交）—— hole 情形留精确路 ──
test('3. 圆嵌套喺矩形内（无交点）→ split=false（hole 留精确路）', () => {
  const rectE = { type: 'rect', a: [0, 0], b: [20, 20] }
  const circleIn = { type: 'circle', c: [10, 10], r: 5 }   // 完全喺矩形内部，边界唔相交
  const r = detectRegions([rectE, circleIn])
  eq(r.split, false, '圆同矩形边界冇交点 → split=false，交由精确布尔（非区域拼接）处理挖孔')
  // 实测：矩形、圆各自独立围成一个面（半边遍历唔知道圆系「洞」，各自照围）
  eq(r.faces.length, 2, '实测 2 个独立面（矩形 1 + 圆 1，半边遍历唔认「洞」关系）')
  eq(r.unionLoops.length, 2, '实测 unionLoops 亦为 2（同上，各自独立外环）')
})

// ── 4. 构造图形（construction）唔参与线段收集 ──
test('4. construction 矩形被排除，唔贡献线段', () => {
  const rectF = { type: 'rect', a: [0, 0], b: [20, 10] }
  const rectG_constr = { type: 'rect', a: [10, 0], b: [30, 10], construction: true }
  const withConstr = detectRegions([rectF, rectG_constr])
  const alone = detectRegions([rectF])
  // construction 矩形理应完全唔计 — 结果同「净得 rectF」一模一样
  eq(withConstr.faces.length, alone.faces.length, 'faces.length 同「净 rectF」一致（construction 矩形冇被计入）')
  eq(withConstr.split, alone.split, 'split 同「净 rectF」一致')
  eq(withConstr.faces.length, 1, '（rectF 单独 4 段 <3? 唔系，刚好组成 1 个矩形面）')
  approx(shoelace(withConstr.faces[0]), 200, 1e-6, '面积 = rectF 面积 20×10=200（唔包含 construction 矩形嘅额外面积）')
})

// ── 5. 开放折线穿过矩形 —— 断头折线 + 矩形边界拼合出封闭区域 ──
test('5. 开放折线穿过矩形（hasOpen）→ 闭合出区域, faces>0', () => {
  const rectH = { type: 'rect', a: [0, 0], b: [20, 20] }
  const openLine = { type: 'poly', pts: [[-5, 10], [25, 10]], open: true }   // 横贯矩形、两端伸出界外
  const r = detectRegions([rectH, openLine])
  ok(r.faces.length > 0, `折线切矩形 → faces.length>0（实际 ${r.faces.length}）`)
  eq(r.split, true, '折线同矩形边界有真交点 → split=true')
  // 实测：折线把矩形一分为二（上/下各一半），伸出界外嘅须已被剪走（度≤1 悬边剪除）
  eq(r.faces.length, 2, '矩形被横线一分为二 → 2 个面')
  const areas = r.faces.map(shoelace).sort((a, b) => a - b)
  approx(areas[0] + areas[1], 400, 1e-6, '两半面积之和 = 矩形面积 20×20=400')
})

// ── 6. 退化情形：<3 段 / >800 段守卫 ──
test('6. 退化：<3 段 → 空结果；>800 段 → 空结果（性能守卫）', () => {
  // 单条开放折线 = 1 段（<3）
  const tinyLine = { type: 'poly', pts: [[0, 0], [10, 0]], open: true }
  const r6a = detectRegions([tinyLine])
  eq(r6a.faces.length, 0, '1 段（<3）→ faces=[]')
  eq(r6a.unionLoops.length, 0, '1 段（<3）→ unionLoops=[]')
  eq(r6a.split, false, '1 段（<3）→ split=false')

  // 两条独立开放折线 = 2 段（仍 <3）
  const tinyLine2 = { type: 'poly', pts: [[0, 0], [10, 0]], open: true }
  const tinyLine3 = { type: 'poly', pts: [[0, 5], [10, 5]], open: true }
  const r6b = detectRegions([tinyLine2, tinyLine3])
  eq(r6b.faces.length, 0, '2 段（<3）→ faces=[]')

  // P2v2 新预算 1600：804 段（旧 800 守卫会杀）而家正常处理
  const manyRects = []
  for (let i = 0; i < 201; i++) manyRects.push({ type: 'rect', a: [i * 3, 0], b: [i * 3 + 1, 1] })
  const r6c = detectRegions(manyRects)
  eq(r6c.faces.length, 201, '804 段（≤新预算 1600）→ 正常处理，201 个独立面')
  ok(!r6c.overflow, '804 段 → 冇 overflow')

  // 真 overflow：矩形冇 pts 可简化 → 401 个 = 1604 段 > 1600 → 放弃 + overflow=true（诚实上报，唔再静默）
  const tooMany = []
  for (let i = 0; i < 401; i++) tooMany.push({ type: 'rect', a: [i * 3, 0], b: [i * 3 + 1, 1] })
  const r6d = detectRegions(tooMany)
  eq(r6d.faces.length, 0, '1604 段（简化唔到）→ faces=[]')
  eq(r6d.overflow, true, '→ overflow=true（畀 caller 提示用户）')
})

// ── 7. P2v2（用户实战 feedback #2）：密手绘线 DP 简化救返区域检测 ──
test('7. 密手绘线（4×250 点 + 圆 + 矩形 = 1096 段）→ DP 简化后照检测（旧 800 守卫静默熄）', () => {
  const mkStroke = (x0, y0) => { const pts = []; for (let i = 0; i < 250; i++) pts.push([x0 + i * 0.15, y0 + Math.sin(i * 0.3) * 3]); return { type: 'poly', pts, open: true } }
  const shapes = [
    { type: 'rect', a: [0, 0], b: [80, 40] },
    { type: 'circle', c: [0, 20], r: 25 },
    mkStroke(-10, 10), mkStroke(-10, 18), mkStroke(-5, 26), mkStroke(-5, 32),
  ]
  const r = detectRegions(shapes)
  ok(!r.overflow, 'DP 简化后入预算 → 冇 overflow')
  ok(r.faces.length > 1, `检测到多个区域（实际 ${r.faces.length}）`)
  eq(r.split, true, '相交切断 → split=true')
  // DP 本身：250 点正弦线 0.08 容差 → 大幅减点、形状保持
  const sd = simplifyDP(mkStroke(0, 0).pts, 0.08)
  ok(sd.length < 120 && sd.length > 10, `DP 250 点 → ${sd.length} 点（<120）`)
})

// ── 8. P2v2：Fusion Profile 面（pfaces）—— 嵌套变孔 ──
test('8. 嵌套圆喺矩形内 → pfaces=2：矩形 profile 有 1 个孔（环）、圆自己一个（碟）', () => {
  const r = detectRegions([{ type: 'rect', a: [0, 0], b: [60, 60] }, { type: 'circle', c: [30, 30], r: 10 }])
  eq(r.pfaces.length, 2, '2 个 profile')
  const holed = r.pfaces.filter((f) => f.holes.length === 1)
  eq(holed.length, 1, '刚好 1 个 profile 带孔（矩形环）')
  approx(shoelace(holed[0].outer), 3600, 1e-6, '带孔 profile 外环 = 矩形 60×60')
  approx(shoelace(holed[0].holes[0]), Math.PI * 100, 3, '孔面积 ≈ πr² = 314')
  // 相交情形唔应产生假孔
  const rc = detectRegions([{ type: 'rect', a: [0, 0], b: [40, 40] }, { type: 'rect', a: [20, 20], b: [60, 60] }])
  eq(rc.pfaces.filter((f) => f.holes.length).length, 0, '相交排布 → 冇 profile 带孔（面互相共享顶点）')
  // 三层嵌套 rect ⊃ 圆A ⊃ 圆B → 孔数 [0,1,1]
  const deep = detectRegions([{ type: 'rect', a: [-50, -50], b: [50, 50] }, { type: 'circle', c: [0, 0], r: 30 }, { type: 'circle', c: [0, 0], r: 12 }])
  eq(deep.pfaces.map((f) => f.holes.length).sort().join(','), '0,1,1', '三层嵌套 → 孔数 0,1,1')
})

// ── 9. P2v2：精确 profile 代数 —— 拣环/碟/两个 → 发射边几个原始图形 ──
test('9. exactProfileAlgebra：环=[矩形,圆]（donut）、碟=[圆]、两个=[矩形]', () => {
  const nest = [{ type: 'rect', a: [0, 0], b: [60, 60] }, { type: 'circle', c: [30, 30], r: 10 }]
  const r = detectRegions(nest)
  const outs = nest.map(shapeOutline)
  ok(outs.every((o) => o && o.length >= 3), 'shapeOutline 两个都有效')
  const big = shoelace(r.pfaces[0].outer) > shoelace(r.pfaces[1].outer) ? 0 : 1
  const selRing = r.pfaces.map((_, i) => i === big)
  const selDisc = r.pfaces.map((_, i) => i !== big)
  const selBoth = r.pfaces.map(() => true)
  eq(JSON.stringify(exactProfileAlgebra(outs, r.pfaces, selRing)), '[0,1]', '拣环 → 发射 [矩形, 圆]（even-odd donut）')
  eq(JSON.stringify(exactProfileAlgebra(outs, r.pfaces, selDisc)), '[1]', '拣碟 → 发射 [圆]')
  eq(JSON.stringify(exactProfileAlgebra(outs, r.pfaces, selBoth)), '[0]', '拣晒两个 → 发射 [矩形]（全填）')
  // 配对唔上（数量唔对）→ null（caller 回落多边形路）
  eq(exactProfileAlgebra([outs[0]], r.pfaces, selBoth), null, '数量唔匹配 → null')
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
