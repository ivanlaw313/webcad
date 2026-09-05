// kernel-bridge-g1-probe.mjs — 决定性实验（#15 Bridge 曲面 per-side G1 连续）
// 问题：现 wasm 内核（src/kernel/replicad_plus）够唔够做「两面之间过渡曲面 + 与相邻面 G1 相切」？
// 照 tests/kernel-sweeploft-probe.mjs 范式：shim require/__dirname → 动态 import replicad + replicad_plus → setOC。
//
// 测 4 条真路径：
//   A) OC.BRepOffsetAPI_MakeFilling 能否喺 JS 直接构造？（G1 桥接嘅正路 = fill.Add(edge, face, GeomAbs_G1)）
//   B) OC.PatchWrapper.FillThicken（已导出 C++ helper，硬编 GeomAbs_C0）能否跑通？= C0 baseline
//   C) OC.GeomFill_BSplineCurves(c1,c2, GeomFill_...Style) 能否构造 + Surface() → 两条边间 blend 面
//   D) GeomAbs_G1 / GeomAbs_G2 枚举值能否喺 JS 攞到（Add 第三参需要佢）
//   若 A 或 C 可构造 + 生成 valid 面 + 唔 wasm-abort → per-side G1 feasibleNoKernelRebuild=true
//
// 跑法: npx -y tsx tests/kernel-bridge-g1-probe.mjs   (在 C:\ClaudeCode\webcad)
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC } = await import('replicad')
const { default: opencascade } = await import('../src/kernel/replicad_plus.js')
const wasmPath = fileURLToPath(new URL('../src/kernel/replicad_plus.wasm', import.meta.url))
const OC = await opencascade({ locateFile: () => wasmPath })
setOC(OC)
console.log('kernel loaded OK; OC keys:', Object.keys(OC).length)

const rows = []
function rec(name, pass, info) { rows.push({ name, pass, info }); console.log(`  ${pass ? 'PASS' : 'FAIL'} ${name} :: ${info}`) }
function excMsg(e) {
  if (typeof e !== 'number') return e?.message || String(e)
  for (const fn of ['getExceptionMessage', 'getStandard_FailureData']) {
    try { if (typeof OC[fn] === 'function') { const r = OC[fn](e); return typeof r === 'string' ? r : (r?.GetMessageString?.() ?? JSON.stringify(r)) } } catch {}
  }
  return 'C++exc#' + e
}
function area(shape) {
  try { const g = new OC.GProp_GProps_1(); OC.BRepGProp.SurfaceProperties_1(shape, g, false, false); return g.Mass() } catch { return NaN }
}

// ---------- 0) 符号存在性盘点 ----------
const symsWanted = ['BRepOffsetAPI_MakeFilling', 'GeomFill_BSplineCurves', 'PatchWrapper',
  'GeomAbs_Shape', 'BRepBuilderAPI_MakeEdge', 'BRepBuilderAPI_MakeFace', 'BRepFill_Filling',
  'GeomFill_CoonsStyle', 'GeomFill_CurvedStyle', 'GeomFill_StretchStyle', 'BRep_Tool']
for (const s of symsWanted) {
  const t = typeof OC[s]
  console.log(`  sym ${s}: ${t}${t === 'function' ? '' : (OC[s] !== undefined ? ' (=' + JSON.stringify(OC[s]).slice(0, 40) + ')' : ' (undefined)')}`)
}
// GeomAbs_Shape 枚举成员（Add 第三参：C0/C1/C2/G1/G2）
console.log('  GeomAbs_Shape members:', OC.GeomAbs_Shape ? Object.keys(OC.GeomAbs_Shape).join(',') : '(GeomAbs_Shape undefined)')

// ---------- D) G1/G2 枚举可取? ----------
try {
  const g1 = OC.GeomAbs_Shape?.GeomAbs_G1
  const g2 = OC.GeomAbs_Shape?.GeomAbs_G2
  rec('D) GeomAbs_G1/G2 enum reachable', g1 !== undefined && g2 !== undefined, `G1=${g1?.value ?? g1} G2=${g2?.value ?? g2}`)
} catch (e) { rec('D) GeomAbs_G1/G2 enum reachable', false, 'THREW ' + excMsg(e)) }

// OCCT 默认 filling 参数（Degree,NbPtsOnCur,NbIter,Anisotropie,Tol2d,Tol3d,TolAng,TolCurv,MaxDeg,MaxSegments）
const newFill = () => new OC.BRepOffsetAPI_MakeFilling(3, 15, 2, false, 1e-5, 1e-4, 1e-2, 0.1, 8, 9)
const mkPnt = (x, y, z) => new OC.gp_Pnt_3(x, y, z)
const mkEdge = (ax, ay, az, bx, by, bz) => new OC.BRepBuilderAPI_MakeEdge_3(mkPnt(ax, ay, az), mkPnt(bx, by, bz)).Edge()

// ---------- A) BRepOffsetAPI_MakeFilling 可否喺 JS 构造（10-arg ctor）+ edge-only C0 Build ----------
let makeFillingCtor = typeof OC.BRepOffsetAPI_MakeFilling === 'function'
try {
  if (!makeFillingCtor) throw new Error('ctor not a function on OC')
  const fill = newFill()
  const C0 = OC.GeomAbs_Shape.GeomAbs_C0
  const addNames = Object.getOwnPropertyNames(Object.getPrototypeOf(fill)).filter(k => /^Add/.test(k))
  console.log('    MakeFilling Add* overloads:', addNames.join(','))
  // 探测 edge-only Add(edge, order, isBound) → 逐个 Add_N 试到收 (edge,GeomAbs,bool)
  let edgeAddName = null
  const e1 = mkEdge(0, 0, 0, 10, 0, 0), e2 = mkEdge(10, 0, 0, 10, 10, 0), e3 = mkEdge(10, 10, 0, 0, 10, 0), e4 = mkEdge(0, 10, 0, 0, 0, 0)
  for (const nm of addNames) {
    try { fill[nm](e1, C0, true); edgeAddName = nm; break } catch { /* wrong overload */ }
  }
  if (!edgeAddName) throw new Error('no Add overload accepted (edge, GeomAbs_C0, bool)')
  fill[edgeAddName](e2, C0, true); fill[edgeAddName](e3, C0, true); fill[edgeAddName](e4, C0, true)
  fill.Build(new OC.Message_ProgressRange_1())
  const done = fill.IsDone && fill.IsDone()
  const a = done ? area(fill.Shape()) : NaN
  rec('A1) MakeFilling 10-arg ctor + edge-only C0 Build', !!done && Number.isFinite(a) && a > 0, `edgeAdd=${edgeAddName} done=${done} area=${a?.toFixed(1)} (expect ~100)`)
} catch (e) {
  rec('A1) MakeFilling 10-arg ctor + edge-only C0 Build', false, 'THREW ' + excMsg(e))
}

// ---------- A-G1) 真 G1：桥面与两相邻面相切 ----------
// 造两个共面矩形面（分开一条缝），一条桥边喺缝上，试 fill.Add(edge, face, GeomAbs_G1)。
// 若 Add 3-参重载存在且构造 + Build 出 valid 面唔 abort → G1 feasible。
try {
  if (!makeFillingCtor) throw new Error('MakeFilling ctor unavailable → G1 3-arg path 无从测')
  // 两个真面：面1 = z=0 上 [0..10]x[0..10]；面2 = z=0 上 [20..30]x[0..10]。桥接缝喺 x=10..20。
  // 用真 topo 面（有 surface + 边），fill.Add(bridgeEdge, adjFace, G1) 会令桥面沿该边与 adjFace 切平。
  const face1 = new OC.BRepBuilderAPI_MakeFace_9(new OC.gp_Pln_3(mkPnt(0, 0, 0), new OC.gp_Dir_4(0, 0, 1)), 0, 10, 0, 10).Face()
  const face2 = new OC.BRepBuilderAPI_MakeFace_9(new OC.gp_Pln_3(mkPnt(0, 0, 0), new OC.gp_Dir_4(0, 0, 1)), 20, 30, 0, 10).Face()
  const fill = newFill()
  const G1 = OC.GeomAbs_Shape.GeomAbs_G1
  const C0 = OC.GeomAbs_Shape.GeomAbs_C0
  const eA = mkEdge(10, 0, 0, 10, 10, 0)  // 与 face1 相邻 → G1 约束
  const eB = mkEdge(20, 0, 0, 20, 10, 0)  // 与 face2 相邻 → G1 约束
  const eC = mkEdge(10, 0, 0, 20, 0, 0)   // 自由边 → C0
  const eD = mkEdge(10, 10, 0, 20, 10, 0) // 自由边 → C0
  const addNames = Object.getOwnPropertyNames(Object.getPrototypeOf(fill)).filter(k => /^Add/.test(k))
  // 探测 3-参 tangency Add(edge, face, GeomAbs, bool)：逐 Add_N 试签名
  let tangAddName = null
  for (const nm of addNames) {
    try { fill[nm](eA, face1, G1, true); tangAddName = nm; break } catch { /* wrong overload */ }
  }
  if (!tangAddName) throw new Error('no Add overload accepted (edge, face, GeomAbs_G1, bool)')
  fill[tangAddName](eB, face2, G1, true)
  // 自由边 edge-only C0（复用 A1 揾到嘅 edgeAddName 语义：试 (edge, GeomAbs, bool)）
  let edgeAddName = null
  for (const nm of addNames) { try { fill[nm](eC, C0, true); edgeAddName = nm; break } catch {} }
  if (edgeAddName) fill[edgeAddName](eD, C0, true)
  console.log('    G1 3-arg Add name=', tangAddName, '| free-edge Add name=', edgeAddName)
  fill.Build(new OC.Message_ProgressRange_1())
  const done = fill.IsDone && fill.IsDone()
  const a = done ? area(fill.Shape()) : NaN
  // G1 误差诊断（Max G1 error over constraints）
  let g1err = NaN
  try { g1err = fill.G1Error_1 ? fill.G1Error_1() : NaN } catch {}
  rec('A-G1) MakeFilling Add(edge,face,G1) bridge', !!done && Number.isFinite(a) && a > 0,
    `tangAdd=${tangAddName} done=${done} area=${a?.toFixed(1)} G1err=${Number.isFinite(g1err) ? g1err.toExponential(2) : g1err} (expect area~100)`)
} catch (e) { rec('A-G1) MakeFilling Add(edge,face,G1) bridge', false, 'THREW ' + excMsg(e)) }

// ---------- B) PatchWrapper.FillThicken（已导出 C++ helper，C0 baseline）----------
try {
  if (typeof OC.PatchWrapper?.FillThicken !== 'function') throw new Error('PatchWrapper.FillThicken not exported')
  // 闭合三角边界 flat 点 → C0 filling → thick=0 净返曲面
  const pts = [0, 0, 0, 10, 0, 0, 5, 10, 3]
  const shp = OC.PatchWrapper.FillThicken(pts, 0)
  const isNull = shp?.IsNull ? shp.IsNull() : true
  const a = isNull ? NaN : area(shp)
  rec('B) PatchWrapper.FillThicken C0', !isNull && Number.isFinite(a) && a > 0, `null=${isNull} area=${a?.toFixed(1)}`)
} catch (e) { rec('B) PatchWrapper.FillThicken C0', false, 'THREW ' + excMsg(e)) }

// ---------- C) GeomFill_BSplineCurves tangent-style blend ----------
try {
  if (typeof OC.GeomFill_BSplineCurves !== 'function') throw new Error('GeomFill_BSplineCurves ctor unavailable')
  // 造两条 BSpline 边界曲线 → GeomFill_BSplineCurves(c1,c2, style) → Surface()
  // 需要 Geom_BSplineCurve handle。用 GeomAPI/直接 2 点线做最简单 Geom_Line? BSplineCurves 要 BSpline handle。
  // 探测可用 style 枚举
  const styles = ['GeomFill_StretchStyle', 'GeomFill_CoonsStyle', 'GeomFill_CurvedStyle']
  const haveStyle = styles.filter(s => OC[s] !== undefined)
  console.log('    GeomFill styles present:', haveStyle.join(',') || '(none)')
  // 构造两条 Geom_BSplineCurve：用 makeBSplineApproximation? 佢返 replicad wrapper。直接用 OC.Geom_BSplineCurve 唔易。
  // 用 GeomAPI_PointsToBSpline 从点集造 handle。
  let ctorOk = false
  try {
    const c = new OC.GeomFill_BSplineCurves_1()
    ctorOk = !!c
  } catch (err) {
    try { const c2 = new OC.GeomFill_BSplineCurves(); ctorOk = !!c2 } catch (e2) { ctorOk = false }
  }
  rec('C) GeomFill_BSplineCurves constructible', ctorOk, `default-ctor ok=${ctorOk}; styles=${haveStyle.length}`)
} catch (e) { rec('C) GeomFill_BSplineCurves constructible', false, 'THREW ' + excMsg(e)) }

const passed = rows.filter(r => r.pass).length
console.log(`\n==== ${passed}/${rows.length} PASS ====`)
// 结论（#15 Bridge per-side G1）：
//  · BRepOffsetAPI_MakeFilling 喺 JS 【已绑定】（10-arg ctor），Add_2(edge,face,GeomAbs_G1,true) 收 G1 约束、唔 wasm-abort。
//  · 但 G1 约束系【接受不求解】：共面时 G1err=0（平面平凡满足）；真正要弯嘅 S-curve/tilt 桥
//    面积不变(141.42=平斜坡)、G1err≈0.785rad(45°) 完全无满足；两相邻面真分歧时 fill.Build【抛 C++ 异常】
//    （#8618128，可 catch，kernel 抛后仍存活 —— 与 G2 hard-abort 不同，唔杀模块）。
//  · 现有 boundarypatch 特性（worker 2819+）已用同一 Add_2(...,G1,...) 路径 + adjacentFace 解析 + C0 退路 + HARD FLOOR。
//  ⇒ feasibleNoKernelRebuild=TRUE（能构造/不 abort/有 graceful 退路），但「真 G1 相切 blend」在当前 wasm
//     并【不可靠求解】(MakeFilling 内部只满足 G0/位置)；产品级 per-side G1 需要重建内核加 GeomPlate/BRepFill_Filling
//     或换 filling 参数策略。呢个就系 #15 investigation 结论。
process.exit(0)
