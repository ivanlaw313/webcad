// sweeptwist-guide.test.mjs — frameTwistTaperSweep 导轨(guide)+twist/taper 同用（解锁 worker 2684
// 「twist/缩放扫掠暂不与导轨同用」缺口）。跑法: npx -y tsx tests/sweeptwist-guide.test.mjs
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, draw, assembleWire, makeBSplineApproximation } = await import('replicad')
const { default: opencascade } = await import('../src/kernel/replicad_plus.js')
const { frameTwistTaperSweep } = await import('../src/cad/sweepTwist.ts')
const OC = await opencascade({ locateFile: () => fileURLToPath(new URL('../src/kernel/replicad_plus.wasm', import.meta.url)) })
setOC(OC)

// 矩形截面（半尺寸 A 沿面内 x=导轨朝向 / B 沿面内 y）。A≠B 时可由 bbox 判定截面有冇真朝向导轨。
const rectOnPlane = (A, B) => (pl) => draw([A, B]).lineTo([-A, B]).lineTo([-A, -B]).lineTo([A, -B]).close().sketchOnPlane(pl).wire
function vol(shape) { try { const g = new OC.GProp_GProps_1(); OC.BRepGProp.VolumeProperties_1(shape.wrapped, g, false, false, false); return g.Mass() } catch { return NaN } }
function bbox(shape) { try { const b = new OC.Bnd_Box_1(); OC.BRepBndLib.Add(shape.wrapped, b, false); const lo = b.CornerMin(), hi = b.CornerMax(); return { dx: hi.X() - lo.X(), dy: hi.Y() - lo.Y(), dz: hi.Z() - lo.Z() } } catch { return null } }
function straightSpine(H) { const e = new OC.BRepBuilderAPI_MakeEdge_3(new OC.gp_Pnt_3(0, 0, 0), new OC.gp_Pnt_3(0, 0, H)).Edge(); const mw = new OC.BRepBuilderAPI_MakeWire_1(); mw.Add_1(e); return mw.Wire() }
function offsetLine(x, H) { const e = new OC.BRepBuilderAPI_MakeEdge_3(new OC.gp_Pnt_3(x, 0, 0), new OC.gp_Pnt_3(x, 0, H)).Edge(); const mw = new OC.BRepBuilderAPI_MakeWire_1(); mw.Add_1(e); return mw.Wire() }
function arcSpine(R) { const pts = []; for (let i = 0; i <= 12; i++) { const th = (Math.PI / 2) * i / 12; pts.push([R * Math.cos(th), 0, R * Math.sin(th)]) } return assembleWire([makeBSplineApproximation(pts)]).wrapped }
function arcGuide(R, off) { const pts = []; for (let i = 0; i <= 12; i++) { const th = (Math.PI / 2) * i / 12; pts.push([(R + off) * Math.cos(th), off, (R + off) * Math.sin(th)]) } return assembleWire([makeBSplineApproximation(pts)]).wrapped }

const rows = []
const ok = (name, cond, extra = '') => { rows.push(!!cond); console.log(`  ${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`) }

// ① 直 spine + 偏移导轨 + twist90 → 有界有限体积（probe: builds-not-fault）。20×20 方截面 → vol≈400×60=24000，旋转不改体积。
try {
  const sh = frameTwistTaperSweep(OC, straightSpine(60), rectOnPlane(10, 10), { twistDeg: 90 }, offsetLine(40, 60))
  const v = vol(sh)
  ok('直spine+导轨+twist90 有界', Number.isFinite(v) && v > 0 && Math.abs(v - 24000) / 24000 < 0.3, `vol=${Number.isFinite(v) ? v.toFixed(0) : v}`)
} catch (e) { ok('直spine+导轨+twist90 有界', false, `THREW ${typeof e === 'number' ? 'C++#' + e : (e?.message || e)}`) }

// ② 弧 spine + 弧导轨 + twist120 + taper0.6 → 有界有限（最易自交嘅组合）。
try {
  const sh = frameTwistTaperSweep(OC, arcSpine(40), rectOnPlane(10, 10), { twistDeg: 120, scaleEnd: 0.6 }, arcGuide(40, 12))
  const v = vol(sh)
  ok('弧spine+弧导轨+twist120+taper 有界', Number.isFinite(v) && v > 0 && v < 1e7, `vol=${Number.isFinite(v) ? v.toFixed(0) : v}`)
} catch (e) { ok('弧spine+弧导轨+twist120+taper 有界', false, `THREW ${typeof e === 'number' ? 'C++#' + e : (e?.message || e)}`) }

// ③ 导轨真改朝向：高扁矩形（A=30 沿面内x / B=4），导轨喺 +x。有导轨 → 长轴朝 +x → bbox.dx ≫ dy；
//    无导轨 → 长轴朝 -y（refAxis frame）→ bbox.dy ≫ dx。两者相反 = 证导轨确实重定向截面。
try {
  const withG = bbox(frameTwistTaperSweep(OC, straightSpine(60), rectOnPlane(30, 4), {}, offsetLine(40, 60)))
  const noG = bbox(frameTwistTaperSweep(OC, straightSpine(60), rectOnPlane(30, 4), {}))
  ok('有导轨：截面长轴朝导轨(+x) dx>dy', withG && withG.dx > withG.dy * 2, withG ? `dx=${withG.dx.toFixed(0)} dy=${withG.dy.toFixed(0)}` : 'no-bbox')
  ok('无导轨：长轴非 +x（与有导轨相反）dy>dx', noG && noG.dy > noG.dx * 2, noG ? `dx=${noG.dx.toFixed(0)} dy=${noG.dy.toFixed(0)}` : 'no-bbox')
} catch (e) { ok('导轨重定向截面', false, `THREW ${typeof e === 'number' ? 'C++#' + e : (e?.message || e)}`) }

// ④ 回归：唔传导轨 = 旧行为（twist90 直 spine vol 不变）。
try {
  const v = vol(frameTwistTaperSweep(OC, straightSpine(60), rectOnPlane(10, 10), { twistDeg: 90 }))
  ok('无导轨回归 twist90 vol 不变', Number.isFinite(v) && Math.abs(v - 24000) / 24000 < 0.3, `vol=${Number.isFinite(v) ? v.toFixed(0) : v}`)
} catch (e) { ok('无导轨回归', false, `THREW ${e?.message || e}`) }

const passed = rows.filter(Boolean).length
console.log(`\n==== sweepTwist-guide ${passed}/${rows.length} PASS ====`)
process.exit(passed === rows.length ? 0 : 1)
