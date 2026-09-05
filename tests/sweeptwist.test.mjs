// sweeptwist.test.mjs — 验证 src/cad/sweepTwist.ts 的 frameTwistTaperSweep（worker 扫掠 twist/taper 的真实现）。
// 跑法: npx -y tsx tests/sweeptwist.test.mjs   (在 C:\ClaudeCode\webcad)
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

const A = 10, B = 10 // rect half-sizes → area 400
const rectOnPlane = (sc) => (pl) => draw([A, B]).lineTo([-A, B]).lineTo([-A, -B]).lineTo([A, -B]).close().sketchOnPlane(pl).wire
function vol(shape) { try { const g = new OC.GProp_GProps_1(); OC.BRepGProp.VolumeProperties_1(shape.wrapped, g, false, false, false); return g.Mass() } catch { return NaN } }
function straightSpine(H) { const e = new OC.BRepBuilderAPI_MakeEdge_3(new OC.gp_Pnt_3(0, 0, 0), new OC.gp_Pnt_3(0, 0, H)).Edge(); const mw = new OC.BRepBuilderAPI_MakeWire_1(); mw.Add_1(e); return mw.Wire() }
function arcSpine(R) { const pts = []; for (let i = 0; i <= 12; i++) { const th = (Math.PI / 2) * i / 12; pts.push([R * Math.cos(th), 0, R * Math.sin(th)]) } return assembleWire([makeBSplineApproximation(pts)]).wrapped }

const rows = []
function check(name, mk, expect, tol = 0.3) {
  try {
    const sh = mk()
    const v = vol(sh)
    const pass = Number.isFinite(v) && v > 0 && Math.abs(v - expect) / expect < tol
    rows.push(pass); console.log(`  ${pass ? 'PASS' : 'FAIL'} ${name} :: vol=${Number.isFinite(v) ? v.toFixed(0) : v} expect≈${expect.toFixed(0)}`)
  } catch (e) { rows.push(false); console.log(`  THREW ${name} :: ${typeof e === 'number' ? 'C++#' + e : (e?.message || e)}`) }
}

check('straight twist90', () => frameTwistTaperSweep(OC, straightSpine(60), rectOnPlane(), { twistDeg: 90 }), 4 * A * B * 60)
check('straight twist270', () => frameTwistTaperSweep(OC, straightSpine(60), rectOnPlane(), { twistDeg: 270 }), 4 * A * B * 60)
check('straight taper0.5', () => frameTwistTaperSweep(OC, straightSpine(60), rectOnPlane(), { scaleEnd: 0.5 }), 4 * A * B * 60 * (1 + 0.5 + 0.25) / 3)
check('straight twist180 taper0.5', () => frameTwistTaperSweep(OC, straightSpine(60), rectOnPlane(), { twistDeg: 180, scaleEnd: 0.5 }), 4 * A * B * 60 * (1 + 0.5 + 0.25) / 3, 0.35)
check('arc R40 twist90', () => frameTwistTaperSweep(OC, arcSpine(40), rectOnPlane(), { twistDeg: 90 }), 4 * A * B * (Math.PI * 40 / 2), 0.35)
check('arc R40 twist120 taper0.6', () => frameTwistTaperSweep(OC, arcSpine(40), rectOnPlane(), { twistDeg: 120, scaleEnd: 0.6 }), 4 * A * B * (Math.PI * 40 / 2) * (1 + 0.6 + 0.36) / 3, 0.4)
check('noop twist0 scale1 (=plain tube)', () => frameTwistTaperSweep(OC, straightSpine(60), rectOnPlane(), {}), 4 * A * B * 60)

const passed = rows.filter(Boolean).length
console.log(`\n==== sweepTwist ${passed}/${rows.length} PASS ====`)
process.exit(passed === rows.length ? 0 : 1)
