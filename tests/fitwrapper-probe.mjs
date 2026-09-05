// fitwrapper-probe.mjs —— M2 FitWrapper【绑定 + 功能】探针（跑 _occt-build/_rebuilt 暂存内核）
//   1) 6 个方法全部绑定存在
//   2) MakeAnalyticFace 5 种 kind → 非 null + 真 FACE + BRepCheck 有效 + 面积对得上解析值
//   3) FitBSplineFace 5×5 鞍面网格 → 非 null 面
//   4) TrimFaceByLoop 大平面 × 矩形环 → 面积 = 环面积
//   5) FreeBoundaryInfo / DeviationSample 返 JSON
//   6) 全部跑完【内核仲活住】（makeBaseBox 出到嘢）
// 跑法（C:\ClaudeCode\webcad）: node tests/fitwrapper-probe.mjs
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, makeBaseBox } = await import('replicad')
const { default: opencascade } = await import('../_occt-build/_rebuilt/replicad_plus.js')
const wasmPath = fileURLToPath(new URL('../_occt-build/_rebuilt/replicad_plus.wasm', import.meta.url))
const OC = await opencascade({ locateFile: () => wasmPath })
setOC(OC)

let fails = 0
const ok = (cond, name, info = '') => { console.log(`  ${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' :: ' + info : ''}`); if (!cond) fails++ }
const ST = { 0: 'COMPOUND', 1: 'COMPSOLID', 2: 'SOLID', 3: 'SHELL', 4: 'FACE', 5: 'WIRE', 6: 'EDGE', 7: 'VERTEX', 8: 'SHAPE' }
const stype = (s) => { try { const v = s.ShapeType(); const n = (v && typeof v === 'object' && 'value' in v) ? v.value : v; return ST[n] ?? String(n) } catch { return 'err' } }
const isValid = (s) => {
  try { const a = new OC.BRepCheck_Analyzer(s, true, false); return a.IsValid_2 ? a.IsValid_2() : a.IsValid() }
  catch { try { const a = new OC.BRepCheck_Analyzer(s, true, false, false); return a.IsValid_2 ? a.IsValid_2() : a.IsValid() } catch (e) { return 'n/a(' + (e && e.message) + ')' } }
}
const area = (s) => { try { const g = new OC.GProp_GProps_1(); OC.BRepGProp.SurfaceProperties_1(s, g, false, false); return g.Mass() } catch { return NaN } }
const near = (a, b, relTol = 1e-3) => Number.isFinite(a) && Math.abs(a - b) <= Math.abs(b) * relTol + 1e-9

// ── 0) 绑定 ────────────────────────────────────────────────────────────────────
console.log('== 0) binding ==')
const W = OC.FitWrapper
ok(!!W, 'OC.FitWrapper bound', W ? typeof W : 'MISSING — 内核未重建 / symbol 未加')
if (!W) { console.log('\nFATAL: FitWrapper 唔存在，后面全部跳过'); process.exit(1) }
for (const m of ['MakeAnalyticFace', 'FitBSplineFace', 'TrimFaceByLoop', 'SewSolidify', 'FreeBoundaryInfo', 'DeviationSample'])
  ok(typeof W[m] === 'function', `method ${m}`, typeof W[m])

// ── 1) MakeAnalyticFace × 5 kind ───────────────────────────────────────────────
console.log('== 1) MakeAnalyticFace (0=plane 1=cyl 2=sphere 3=cone 4=torus) ==')
const TAU = Math.PI * 2
const coneHalf = Math.atan(0.5)          // sin = 0.4472136
const cases = [
  { k: 0, name: 'plane 40×30',  p: [0, 0, 0, 0, 0, 1, 1, 0, 0],        uv: [0, 40, 0, 30],   want: 40 * 30 },
  { k: 1, name: 'cyl r10 h25',  p: [0, 0, 0, 0, 0, 1, 10, 1, 0, 0],    uv: [0, TAU, 0, 25],  want: TAU * 10 * 25 },
  { k: 2, name: 'sphere r8',    p: [0, 0, 0, 8],                        uv: [],               want: 4 * Math.PI * 64 },
  { k: 3, name: 'cone a26.6 L30', p: [0, 0, 0, 0, 0, 1, coneHalf, 1, 0, 0], uv: [0, TAU, 0, 30], want: Math.PI * 30 * 30 * Math.sin(coneHalf) },
  { k: 4, name: 'torus R20 r5', p: [0, 0, 0, 0, 0, 1, 20, 5],           uv: [],               want: 4 * Math.PI * Math.PI * 20 * 5 },
]
const madeFaces = {}
for (const c of cases) {
  let f = null, err = ''
  try { f = W.MakeAnalyticFace(c.k, c.p, c.uv) } catch (e) { err = 'THROW:' + (e && e.message || e) }
  const nul = f ? f.IsNull() : true
  const a = nul ? NaN : area(f)
  ok(!nul, `kind ${c.k} ${c.name} non-null`, err || `IsNull=${nul}`)
  if (!nul) {
    madeFaces[c.k] = f
    ok(stype(f) === 'FACE', `kind ${c.k} is FACE`, stype(f))
    ok(isValid(f) === true, `kind ${c.k} BRepCheck valid`, String(isValid(f)))
    ok(near(a, c.want, 2e-3), `kind ${c.k} area ≈ ${c.want.toFixed(3)}`, `got ${a.toFixed(3)}`)
  }
}
// null 合约（坏输入 → null shape，唔系抛/唔系烂 shape）
{
  let bad = null, thrown = ''
  try { bad = W.MakeAnalyticFace(9, [0, 0, 0, 0, 0, 1], []) } catch (e) { thrown = 'THROW' }
  ok(!thrown && bad && bad.IsNull(), 'null-contract: unknown kind → IsNull', thrown || 'IsNull=' + (bad && bad.IsNull()))
  let bad2 = null
  try { bad2 = W.MakeAnalyticFace(1, [0, 0, 0, 0, 0, 1], []) } catch { /* */ }
  ok(bad2 && bad2.IsNull(), 'null-contract: cylinder 缺半径 → IsNull', 'IsNull=' + (bad2 && bad2.IsNull()))
}

// ── 2) FitBSplineFace（5×5 鞍面 z=(x²−y²)/50, x,y ∈ [−20,20]）──────────────────
console.log('== 2) FitBSplineFace ==')
{
  const nu = 5, nv = 5, grid = []
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const x = -20 + 40 * i / (nu - 1), y = -20 + 40 * j / (nv - 1)
    grid.push(x, y, (x * x - y * y) / 50)
  }
  let f = null, err = ''
  try { f = W.FitBSplineFace(grid, nu, nv, 3, 8, 1e-3) } catch (e) { err = 'THROW:' + (e && e.message || e) }
  const nul = f ? f.IsNull() : true
  ok(!nul, 'saddle 5×5 → non-null face', err || `IsNull=${nul}`)
  if (!nul) {
    const a = area(f)
    ok(stype(f) === 'FACE', 'bspline is FACE', stype(f))
    ok(isValid(f) === true, 'bspline BRepCheck valid', String(isValid(f)))
    ok(a > 1600 && a < 2600, 'bspline area ∈ (1600,2600) 平面 1600 + 鞍起伏', `got ${a.toFixed(2)}`)
  }
  // 坏输入
  let b = null; try { b = W.FitBSplineFace([0, 0, 0], 1, 1, 3, 8, 1e-3) } catch { /* */ }
  ok(b && b.IsNull(), 'null-contract: nu/nv<2 → IsNull', 'IsNull=' + (b && b.IsNull()))
}

// ── 3) TrimFaceByLoop（大平面 z=5 × 矩形环 30×20）────────────────────────────────
console.log('== 3) TrimFaceByLoop ==')
let trimmed = null
{
  const big = W.MakeAnalyticFace(0, [0, 0, 5, 0, 0, 1, 1, 0, 0], [-100, 100, -100, 100])
  ok(big && !big.IsNull(), 'host plane face built', 'area=' + area(big).toFixed(0))
  const loop = [-15, -10, 5, 15, -10, 5, 15, 10, 5, -15, 10, 5]     // 30×20 = 600
  let err = ''
  try { trimmed = W.TrimFaceByLoop(big, loop, 1e-4) } catch (e) { err = 'THROW:' + (e && e.message || e) }
  const nul = trimmed ? trimmed.IsNull() : true
  ok(!nul, 'rect loop → trimmed face non-null', err || `IsNull=${nul}`)
  if (!nul) {
    const a = area(trimmed)
    ok(stype(trimmed) === 'FACE', 'trimmed is FACE', stype(trimmed))
    ok(isValid(trimmed) === true, 'trimmed BRepCheck valid', String(isValid(trimmed)))
    ok(near(a, 600, 2e-3), 'trimmed area ≈ 600', `got ${a.toFixed(4)}`)
  }
  // 反向点序（顺时针）都要出同一块有界面 —— 参数空间有向面积自动翻转
  const cw = [-15, -10, 5, -15, 10, 5, 15, 10, 5, 15, -10, 5]
  let t2 = null; try { t2 = W.TrimFaceByLoop(big, cw, 1e-4) } catch { /* */ }
  ok(t2 && !t2.IsNull() && near(area(t2), 600, 2e-3), 'CW loop 都出有界 600 面', t2 && !t2.IsNull() ? `area=${area(t2).toFixed(4)}` : 'NULL')
  // 三角形环 → 面积 = 0.5*40*30 = 600
  const tri = [-20, -15, 5, 20, -15, 5, 0, 15, 5]
  let t3 = null; try { t3 = W.TrimFaceByLoop(big, tri, 1e-4) } catch { /* */ }
  ok(t3 && !t3.IsNull() && near(area(t3), 0.5 * 40 * 30, 2e-3), 'triangle loop area ≈ 600', t3 && !t3.IsNull() ? `area=${area(t3).toFixed(4)}` : 'NULL')
  let t4 = null; try { t4 = W.TrimFaceByLoop(big, [0, 0, 5, 1, 1, 5], 1e-4) } catch { /* */ }
  ok(t4 && t4.IsNull(), 'null-contract: <3 点 → IsNull', 'IsNull=' + (t4 && t4.IsNull()))
  // 曲面（圆柱）裁剪：uv 矩形窗 u∈[0.5,1.5] v∈[5,20] → 面积 = r·Δu·Δv = 10·1·15 = 150
  // （边界沿 uv 直线 = 柱面上嘅圆弧/直母线，正正系 M3 会用嘅路径）
  const R = 10, TAU = Math.PI * 2
  const cylF = W.MakeAnalyticFace(1, [0, 0, 0, 0, 0, 1, R, 1, 0, 0], [0, TAU, 0, 25])
  const P3 = (u, v) => [R * Math.cos(u), R * Math.sin(u), v]
  const win = [...P3(0.5, 5), ...P3(1.5, 5), ...P3(1.5, 20), ...P3(0.5, 20)]
  let t5 = null, e5 = ''
  try { t5 = W.TrimFaceByLoop(cylF, win, 1e-4) } catch (e) { e5 = 'THROW:' + (e && e.message || e) }
  const n5 = t5 ? t5.IsNull() : true
  ok(!n5, 'cylinder face × uv-window loop → non-null', e5 || `IsNull=${n5}`)
  if (!n5) {
    ok(isValid(t5) === true, 'cyl-trim BRepCheck valid', String(isValid(t5)))
    ok(near(area(t5), R * 1.0 * 15, 2e-3), 'cyl-trim area ≈ 150', `got ${area(t5).toFixed(4)}`)
  }
}

// ── 4) FreeBoundaryInfo ────────────────────────────────────────────────────────
console.log('== 4) FreeBoundaryInfo ==')
{
  const s = trimmed && !trimmed.IsNull() ? trimmed : madeFaces[0]
  let j = ''
  try { j = W.FreeBoundaryInfo(s) } catch (e) { j = 'THROW:' + (e && e.message || e) }
  console.log('    raw:', j)
  let o = null; try { o = JSON.parse(j) } catch { /* */ }
  ok(!!o, 'FreeBoundaryInfo → parseable JSON', j)
  if (o) {
    ok(o.freeEdges === 4, 'single trimmed face → freeEdges 4', `freeEdges=${o.freeEdges} closedWires=${o.closedWires} openWires=${o.openWires} faces=${o.faces}`)
    ok(o.faces === 1, 'faces = 1', String(o.faces))
  }
}

// ── 5) DeviationSample（box 40×30×20，XY 居中，z ∈ [0,20]）──────────────────────
console.log('== 5) DeviationSample ==')
{
  const box = makeBaseBox(40, 30, 20)
  const pts = [0, 0, 25, 25, 0, 10, 0, 0, -3, 0, 0, 10]      // 期望 5, 5, 3, 10
  let j = ''
  try { j = W.DeviationSample(box.wrapped, pts) } catch (e) { j = 'THROW:' + (e && e.message || e) }
  console.log('    raw:', j)
  let d = null; try { d = JSON.parse(j) } catch { /* */ }
  ok(Array.isArray(d) && d.length === 4, 'DeviationSample → 4 个距离', j)
  if (Array.isArray(d) && d.length === 4) {
    ok(near(d[0], 5, 1e-3), 'pt(0,0,25) 距顶面 = 5', String(d[0]))
    ok(near(d[1], 5, 1e-3), 'pt(25,0,10) 距 x=20 面 = 5', String(d[1]))
    ok(near(d[2], 3, 1e-3), 'pt(0,0,-3) 距底面 = 3', String(d[2]))
    ok(near(d[3], 10, 1e-3), 'pt(0,0,10) 体心 → 最近面 10', String(d[3]))
    ok(new Float32Array(d).length === 4, 'Float32Array-able', 'ok')
  }
  // 规模 sanity：500 点唔应该慢到唔见（建议上限 ~2000）
  const many = []
  for (let i = 0; i < 500; i++) many.push((i % 20) - 10, ((i * 7) % 20) - 10, 20 + (i % 5) * 0.5)
  const t0 = Date.now()
  let jm = ''; try { jm = W.DeviationSample(box.wrapped, many) } catch (e) { jm = 'THROW' }
  const dt = Date.now() - t0
  let dm = null; try { dm = JSON.parse(jm) } catch { /* */ }
  ok(Array.isArray(dm) && dm.length === 500, `500 点 batch (${dt}ms)`, Array.isArray(dm) ? `min=${Math.min(...dm).toFixed(3)} max=${Math.max(...dm).toFixed(3)}` : jm.slice(0, 60))
}

// ── 6) 内核存活 ────────────────────────────────────────────────────────────────
console.log('== 6) kernel alive ==')
try {
  const b = makeBaseBox(5, 5, 5)
  const g = new OC.GProp_GProps_1(); OC.BRepGProp.VolumeProperties_1(b.wrapped, g, false, false, false)
  ok(Math.abs(g.Mass() - 125) < 1e-6, 'makeBaseBox(5,5,5) 体积 125 —— kernel ALIVE', String(g.Mass()))
} catch (e) { ok(false, 'kernel DEAD', e && e.message) }

console.log(`\n${fails === 0 ? '✅ ALL PASS' : '❌ ' + fails + ' FAIL'}`)
process.exit(fails === 0 ? 0 : 1)
