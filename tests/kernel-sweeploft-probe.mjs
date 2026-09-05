// kernel-sweeploft-probe.mjs — 决定性实验：现有内核(src/kernel/replicad_plus)是否已绑定
// 三个「kernel-gated」缺口所需的 raw OCCT 方法？若全 PASS → 无需重建内核，直接 worker raw _oc。
//   1) Taper/scale sweep: MakePipeShell.SetLaw_1 + Law_Linear + Handle_Law_Function_2
//   2) Twist sweep:       MakePipeShell 多 section Add_2（旋转截面副本 + 站点 vertex）
//   3) Loft G1/G2:        ThruSections.SetContinuity(GeomAbs_G1/G2) + SetSmoothing
// 跑法: npx -y tsx tests/kernel-sweeploft-probe.mjs   (在 C:\ClaudeCode\webcad)
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
// 内核 .js 喺 NODE 分支用 __dirname/require（CommonJS 全局），ESM scope 下唔存在 → 先 shim 上 globalThis，
// 再【动态 import】内核（动态 import 喺 shim 之后先执行，静态 import 会提前 hoist 抢喺 shim 前面爆）。
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, cast, draw, Plane: RPlane, assembleWire, makeBSplineApproximation } = await import('replicad')
const { default: opencascade } = await import('../src/kernel/replicad_plus.js')

const wasmPath = fileURLToPath(new URL('../src/kernel/replicad_plus.wasm', import.meta.url))
const OC = await opencascade({ locateFile: () => wasmPath })
setOC(OC)
console.log('kernel loaded OK; OC keys sample:', Object.keys(OC).length)

const rows = []
function rec(name, pass, info) { rows.push({ name, pass, info }); console.log(`  ${pass ? 'PASS' : 'FAIL'} ${name} :: ${info}`) }

// rect profile wire (3D) at height z, rotated by angDeg about +Z, half-sizes a×b.
// 用 worker 同款 idiom：rotated RPlane(origin,xDir,normal) 上画矩形 Drawing → .wire.wrapped = 真 TopoDS_Wire
// （makePolygon 返 Face，AddWire/MakePipeShell 唔收 → 必须用 wire）。
function rectWire(z, angDeg, a, b) {
  const t = angDeg * Math.PI / 180
  const pl = new RPlane([0, 0, z], [Math.cos(t), Math.sin(t), 0], [0, 0, 1])
  return draw([a, b]).lineTo([-a, b]).lineTo([-a, -b]).lineTo([a, -b]).close().sketchOnPlane(pl).wire.wrapped
}
function straightSpine(H) { return assembleWire([makeBSplineApproximation([[0, 0, 0], [0, 0, H]])]).wrapped }
function vol(shape) {
  try { const g = new OC.GProp_GProps_1(); OC.BRepGProp.VolumeProperties_1(shape, g, false, false, false); return g.Mass() } catch { return NaN }
}
// 解码 emscripten 抛出嘅 OCCT 异常指针（number）→ 可读 message，方便诊断
const excKeys = Object.keys(OC).filter(k => /exception|failure|getError|message/i.test(k))
console.log('exc-related OC keys:', excKeys.join(', ') || '(none)')
function excMsg(e) {
  if (typeof e !== 'number') return e?.message || String(e)
  for (const fn of ['getExceptionMessage', 'getStandard_FailureData']) {
    try { if (typeof OC[fn] === 'function') { const r = OC[fn](e); return typeof r === 'string' ? r : (r?.GetMessageString?.() ?? JSON.stringify(r)) } } catch { /* try next */ }
  }
  return 'C++exc#' + e
}

const H = 60, A = 10, B = 10 // 20×20 section, area 400

// --- baseline: plain MakePipeShell single constant section (sanity that raw pipe works) ---
try {
  const b = new OC.BRepOffsetAPI_MakePipeShell(straightSpine(H))
  b.SetMode_1(false)
  b.Add_1(rectWire(0, 0, A, B), false, true)
  b.Build(new OC.Message_ProgressRange_1())
  b.MakeSolid()
  const v = vol(b.Shape())
  rec('baseline pipe (const section)', Number.isFinite(v) && v > 0, `vol=${v?.toFixed(1)} (expect ~${(4 * A * B * H).toFixed(0)})`)
} catch (e) { rec('baseline pipe (const section)', false, 'THREW ' + excMsg(e)) }

// --- 1) TAPER via SetLaw_1 + Law_Linear (homothety 1.0 -> 0.5) ---
try {
  const law = new OC.Law_Linear()
  law.Set(0, 1.0, 1, 0.5)
  const hLaw = new OC.Handle_Law_Function_2(law)
  const b = new OC.BRepOffsetAPI_MakePipeShell(straightSpine(H))
  b.SetMode_1(false)
  b.SetLaw_1(rectWire(0, 0, A, B), hLaw, false, true)
  b.Build(new OC.Message_ProgressRange_1())
  b.MakeSolid()
  const v = vol(b.Shape())
  // expect ∫ area*f(z)² = 4AB*H*(1+0.5+0.25)/3 = 400*60*0.5833 ≈ 14000
  const expect = 4 * A * B * H * (1 + 0.5 + 0.25) / 3
  rec('1) TAPER SetLaw_1+Law_Linear', Number.isFinite(v) && v > 0 && Math.abs(v - expect) / expect < 0.2, `vol=${v?.toFixed(0)} expect≈${expect.toFixed(0)}`)
} catch (e) { rec('1) TAPER SetLaw_1+Law_Linear', false, 'THREW ' + excMsg(e)) }

// --- 2) TWIST via multi-section Add_1 (rotated copies at stations; location-free —
//        Add_2 嘅 Location 必须系 spine 自身嘅 vertex，散点会抛，故用 Add_1，OCCT 按最近 spine 参数自动 seat） ---
try {
  const TW = 90, N = 6
  const b = new OC.BRepOffsetAPI_MakePipeShell(straightSpine(H))
  b.SetMode_1(true)
  for (let i = 0; i <= N; i++) {
    const f = i / N, z = H * f, ang = TW * f
    b.Add_1(rectWire(z, ang, A, B), false, false)
  }
  b.Build(new OC.Message_ProgressRange_1())
  b.MakeSolid()
  const v = vol(b.Shape())
  // twist preserves section area → vol ≈ 4AB*H = 24000
  const expect = 4 * A * B * H
  rec('2) TWIST multi-section Add_1', Number.isFinite(v) && v > 0 && Math.abs(v - expect) / expect < 0.25, `vol=${v?.toFixed(0)} expect≈${expect.toFixed(0)}`)
} catch (e) { rec('2) TWIST multi-section Add_1', false, 'THREW ' + excMsg(e)) }

// --- 3) LOFT tangency via ThruSections.SetContinuity + SetSmoothing ---
// 注：ThruSections 用【参数连续】C0/C1/C2（C1≈切线/G1、C2≈曲率/G2）；GeomAbs_G1/G2 枚举会抛 → 唔测。
for (const cont of ['GeomAbs_C0', 'GeomAbs_C1', 'GeomAbs_C2']) {
  try {
    const ts = new OC.BRepOffsetAPI_ThruSections(true, false, 1e-6)
    ts.SetSmoothing(true)
    ts.SetContinuity(OC.GeomAbs_Shape[cont])
    ts.AddWire(rectWire(0, 0, 20, 20))
    ts.AddWire(rectWire(30, 0, 14, 6))
    ts.AddWire(rectWire(60, 0, 8, 8))
    ts.Build(new OC.Message_ProgressRange_1())
    const done = ts.IsDone && ts.IsDone()
    const v = done ? vol(ts.Shape()) : NaN
    rec(`3) LOFT ${cont}`, !!done && Number.isFinite(v) && v > 0, `done=${done} vol=${v?.toFixed(0)}`)
  } catch (e) { rec(`3) LOFT ${cont}`, false, 'THREW ' + excMsg(e)) }
}

const passed = rows.filter(r => r.pass).length
console.log(`\n==== ${passed}/${rows.length} PASS ====`)
process.exit(passed === rows.length ? 0 : 1)
