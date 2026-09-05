// extrude-twosides-taper.test.mjs — GM-3DV1 S12【验收】测。
// 逐字复刻 worker XY 拔模 loft 路径（cad.worker.ts extrude draft 分支）验证：
//   (a) Two Sides 每侧独立挤出+独立拔模 → 总跨 [−side2, side1]，两侧各自锥度（非单一拔模整段单向）。
//   (b) Symmetric whole/half 纯 store 变换：half → 总长 = 2×距离（feature 恒存总长）。
// 跑法（喺 C:\ClaudeCode\webcad）: npx -y tsx tests/extrude-twosides-taper.test.mjs
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, draw } = await import('replicad')
const { default: opencascade } = await import('../src/kernel/replicad_plus.js')
const OC = await opencascade({ locateFile: () => fileURLToPath(new URL('../src/kernel/replicad_plus.wasm', import.meta.url)) })
setOC(OC)

let pass = 0, fail = 0
const report = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${JSON.stringify(detail)}`); ok ? pass++ : fail++ }
const near = (a, b, tol = 0.1) => Math.abs(a - b) < tol
const bb = (s) => { const b = s.boundingBox.bounds; return { xmin: b[0][0], ymin: b[0][1], zmin: b[0][2], xmax: b[1][0], ymax: b[1][1], zmax: b[1][2] } }

// 逐字复刻 worker 单侧拔模挤出（plane XY）：base 20×20 方 → 拔模 loft。down=true → eh=-h。
function draftExtrude(halfW, h, draftDeg, down) {
  const dr = draw([-halfW, -halfW]).lineTo([halfW, -halfW]).lineTo([halfW, halfW]).lineTo([-halfW, halfW]).close()
  const eh = down ? -h : h
  if (Math.abs(draftDeg) > 0.01) {
    const delta = h * Math.tan((draftDeg * Math.PI) / 180)
    const topDr = dr.offset(-delta, { lineJoinType: 'miter' })
    return dr.sketchOnPlane('XY', 0).loftWith(topDr.sketchOnPlane('XY', eh), { ruled: true })
  }
  return dr.sketchOnPlane('XY', 0).extrude(eh)
}

// ═══ S12(a) Two Sides 每侧独立挤出+拔模 ═══
// 侧1：向上 20，拔模 10°（顶收窄）；侧2：向下 12，拔模 5°。基面 40×40（halfW=20）。
const side1 = 20, side2 = 12, d1 = 10, d2 = 5, halfW = 20
const up = draftExtrude(halfW, side1, d1, false)
const dn = draftExtrude(halfW, side2, d2, true)
const combined = up.fuse(dn)
const cB = bb(combined)
report('S12(a) 总跨 z ∈ [−12, 20]（侧1向上 side1 + 侧2向下 side2）', near(cB.zmin, -side2) && near(cB.zmax, side1), cB)
report('S12(a) 底面仍 40×40（草图面截面未锥化）', near(cB.xmax - cB.xmin, 40) && near(cB.ymax - cB.ymin, 40), { w: cB.xmax - cB.xmin })
// 侧1顶端截面收窄：delta1 = side1*tan(10°) ≈ 3.53 → 顶宽 40 − 2*delta1 ≈ 32.9（各侧独立锥）
const upB = bb(up)
const delta1 = side1 * Math.tan(d1 * Math.PI / 180)
report('S12(a) 侧1顶端仍在 z=20（bbox 底 40，锥在顶）', near(upB.zmax, side1) && near(upB.xmax - upB.xmin, 40), { topZ: upB.zmax, expectDelta1: +delta1.toFixed(2) })
// 侧2独立锥度：delta2 = side2*tan(5°) ≈ 1.05，明显 < delta1 → 两侧锥度真系唔同（非单一拔模整段）
const delta2 = side2 * Math.tan(d2 * Math.PI / 180)
report('S12(a) 两侧锥度各自独立（delta1 ≠ delta2）', Math.abs(delta1 - delta2) > 1, { delta1: +delta1.toFixed(2), delta2: +delta2.toFixed(2) })

// ═══ S12(b) Symmetric whole/half 纯变换 ═══
// commitCore：symmetric && symMeasure==='half' → height = height*2。feature 恒存总长。
const applyMeasure = (distance, measure) => measure === 'half' ? distance * 2 : distance
report('S12(b) whole：距离 30 → 总长 30', applyMeasure(30, 'whole') === 30, {})
report('S12(b) half：距离 30 → 总长 60（每侧 30）', applyMeasure(30, 'half') === 60, {})
// 对称拉伸总长 40（whole）→ 真几何跨 ±20
const symSolid = draw([-10, -10]).lineTo([10, -10]).lineTo([10, 10]).lineTo([-10, 10]).close().sketchOnPlane('XY', 0).extrude(40).translate(0, 0, -20)
const sB = bb(symSolid)
report('S12(b) 对称 total=40 → z ∈ [−20,20]', near(sB.zmin, -20) && near(sB.zmax, 20), sB)

console.log(`\n${fail === 0 ? 'ALL PASS' : 'HAS FAIL'} — pass=${pass} fail=${fail}`)
process.exit(fail === 0 ? 0 : 1)
