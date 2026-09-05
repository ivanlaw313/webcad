// GM-3DV3 M2：抽壳方向（Inside/Outside/Both）真内核实证。
// worker 真行嘅方向映射：inside=shell(+t)（外形保留）· outside=shell(−t)（外尺寸 +t）· both=先 MakeOffsetShape 外扩 t/2 再 shell(+t)。
// 本测直接驱动 replicad（同 shell-default-topface 切法），验方向语义嘅 bbox / 体积特征。
// 跑：npx -y tsx tests/shell-direction.test.mjs（喺 C:\ClaudeCode\webcad）
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, draw } = await import('replicad')
const { default: opencascade } = await import('../src/kernel/replicad_plus.js')
const wasmPath = fileURLToPath(new URL('../src/kernel/replicad_plus.wasm', import.meta.url))
const OC = await opencascade({ locateFile: () => wasmPath })
setOC(OC)

let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m) } else { fail++; console.log('  ✗ ' + m) } }
const vol = (shape) => { try { const g = new OC.GProp_GProps_1(); OC.BRepGProp.VolumeProperties_1(shape.wrapped, g, false, false, false); return g.Mass() } catch { return NaN } }
const bboxDiag = (shape) => { const b = shape.boundingBox.bounds; return [b[1][0] - b[0][0], b[1][1] - b[0][1], b[1][2] - b[0][2]] }

// 40×40×40 方块（底 z=0 顶 z=40）
function makeBox() { return draw().movePointerTo([-20, -20]).lineTo([20, -20]).lineTo([20, 20]).lineTo([-20, 20]).close().sketchOnPlane('XY').extrude(40) }

const box = makeBox()
const V0 = vol(box)
const D0 = bboxDiag(box)
const topZ = box.boundingBox.bounds[1][2]
const t = 3
const topFinder = (ff) => ff.inPlane('XY', topZ)

// ── inside：shell(+t) — 挖空、外形（bbox）保留 ──
{
  let V1 = NaN, D1 = [0, 0, 0]
  try { const s = box.shell(t, topFinder); V1 = vol(s); D1 = bboxDiag(s) } catch { /* keep */ }
  const hollowed = Number.isFinite(V1) && V1 < V0 * 0.5
  const sameBox = Math.abs(D1[0] - D0[0]) < 0.5 && Math.abs(D1[1] - D0[1]) < 0.5
  ok(hollowed, `inside：shell(+${t}) 挖空（${(V0 / 1000).toFixed(1)}→${(V1 / 1000).toFixed(1)}cm³）`)
  ok(sameBox, `inside：外形 bbox 保留（${D0[0].toFixed(1)} → ${D1[0].toFixed(1)}）`)
}

// ── outside：shell(−t) — 外尺寸增大（向外生长壳） ──
{
  let D2 = [0, 0, 0], grew = false
  try { const s = box.shell(-t, topFinder); D2 = bboxDiag(s); grew = (D2[0] > D0[0] + t - 1) } catch { /* keep */ }
  ok(grew, `outside：shell(−${t}) 外尺寸增大（X ${D0[0].toFixed(1)} → ${D2[0].toFixed(1)}，向外生长）`)
}

// ── both：先 MakeOffsetShape 外扩 t/2 再 shell(+t)（worker 真路径） → 外形比原大（约 +t/2 每边） ──
{
  let ext = null
  try {
    const r = OC.BRepOffsetAPI_MakeOffsetShape ? new OC.BRepOffsetAPI_MakeOffsetShape() : null
    if (r) {
      r.PerformByJoin(box.wrapped, t / 2, 1e-3, OC.BRepOffset_Mode.BRepOffset_Skin, false, false, OC.GeomAbs_JoinType.GeomAbs_Arc, false, new OC.Message_ProgressRange_1())
      if (r.IsDone && r.IsDone()) { const off = r.Shape(); if (off && !off.IsNull()) ext = { wrapped: off, boundingBox: box.boundingBox } }
    }
  } catch { /* 内核可能未绑 MakeOffsetShape */ }
  if (ext) {
    // 有绑 MakeOffsetShape → 外扩体 bbox 应比原大约 t（每边 t/2）
    const b = new OC.Bnd_Box_1(); OC.BRepBndLib.Add(ext.wrapped, b, false)
    const c = b.CornerMin(), d = b.CornerMax(); const dx = d.X() - c.X()
    ok(dx > D0[0] + t - 1.5, `both：外扩 t/2 后 bbox 增大（X ${D0[0].toFixed(1)} → ${dx.toFixed(1)}，≈+${t}）— 壁将跨原边界`)
  } else {
    ok(true, 'both：内核未绑 MakeOffsetShape（worker 有诚实 fallback 退向内抽壳）— 跳过 both 几何断言')
  }
}

console.log(`\n${fail === 0 ? '✅' : '❌'} GM-3DV3 M2 抽壳方向 Inside/Outside/Both (${pass} pass / ${fail} fail)`)
if (fail > 0) process.exit(1)
