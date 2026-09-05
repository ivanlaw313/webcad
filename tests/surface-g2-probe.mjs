// Surface G2 边界补面 — 内核可行性 probe（findings 文档化）。
// 跑法：npx tsx tests/surface-g2-probe.mjs
//
// ★★ 结论（2026-06-20，重要，纠正早前乐观判断）★★
//   早前 2-agent scout 见 GeomAbs_G2 enum 已绑 + boundarypatch 已用 Add_2(G1) → 推断「G2 净系传
//   GeomAbs_G2 即可，无需重建内核」。**实测【证伪】**：喺现有自编译 replicad_plus 内核，
//   `MakeFilling.Add_2(edge, face, GeomAbs_G2, true)` + `Build()` 会【硬 fault 内核】
//   （emscripten abort，例 8715672）—— 同条 setup 下 G0 / G1 完全正常、净 G2 崩。
//   呢个 fault 系【JS try/catch 捉唔到】（emscripten 层 abort，唔系 JS throw）→ 若 ship G2 选项，
//   用户拣边触发即【worker 死，要 reload】。所以 G2 选项【未 ship / 已 revert】。
//   enum 已绑 ≠ G2 code path 安全 —— G2 曲率填充要嘅 OCCT 内部（2 阶导/法填充）喺此 build 唔完整。
//
//   真·下一步（要 kernel 级，唔系 quick win）：
//     (a) WSL2 重建 replicad_plus，确认 BRepOffsetAPI_MakeFilling G2 所需 additionalCppCode/依赖全编入；或
//     (b) 改用 GeomFill_ConstrainedFilling / GeomPlate_BuildPlateSurface（G2 plate）другой path 重新 probe；或
//     (c) 接受 Surface 升分靠 G1 边界补面 + 其它 Class-A 工具（NURBS 极点/缝合/加厚），G2 留作 kernel 专项。
//
// 本 test【只跑 G0/G1（安全）】证 MakeFilling + Add_2(G1) 路径良好；【唔跑 G2】（会崩 process）。
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, cast, draw, GCWithScope } = await import('replicad')
const { default: opencascade } = await import('../src/kernel/replicad_plus.js')
const wasmPath = fileURLToPath(new URL('../src/kernel/replicad_plus.wasm', import.meta.url))
const OC = await opencascade({ locateFile: () => wasmPath })
setOC(OC)

let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m) } else { fail++; console.log('  ✗', m) } }

const box = draw([-10, -10]).lineTo([10, -10]).lineTo([10, 10]).lineTo([-10, 10]).close().sketchOnPlane('XY').extrude(10)
const faces = box.faces
const topEdges = box.edges.filter((e) => { const m = e.pointAt(0.5); return Math.abs(m.z - 10) < 1e-3 })
ok(topEdges.length === 4, `顶圈 4 边（实 ${topEdges.length}）`)

const sideFaceFor = (edge) => {
  const m = edge.pointAt(0.5)
  let bf = null, bd = Infinity
  for (const fc of faces) { let c; try { c = fc.center } catch { continue } if (Math.abs(c.z - 5) > 1) continue; const d = (c.x - m.x) ** 2 + (c.y - m.y) ** 2; if (d < bd) { bd = d; bf = fc } }
  return bf
}

// ⚠ continuity 只准传 'GeomAbs_C0' / 'GeomAbs_G1' —— 'GeomAbs_G2' 会 fault 内核（见顶部），唔好喺自动 test 跑。
function fillTop(continuity) {
  const r = GCWithScope()
  const MF = OC.BRepOffsetAPI_MakeFilling
  let fill
  try { fill = r(new MF()) } catch { fill = r(new MF(3, 15, 2, false, 1e-5, 1e-4, 1e-2, 0.1, 8, 9)) }
  const cont = OC.GeomAbs_Shape[continuity]
  let added = 0, usedTan = 0
  for (const e of topEdges) {
    const fc = continuity !== 'GeomAbs_C0' ? sideFaceFor(e) : null
    if (fc && fc.wrapped) { try { fill.Add_2(e.wrapped, fc.wrapped, cont, true); added++; usedTan++; continue } catch { /* 退 C0 */ } }
    fill.Add_1(e.wrapped, OC.GeomAbs_Shape.GeomAbs_C0, true); added++
  }
  fill.Build(r(new OC.Message_ProgressRange_1()))
  if (!fill.IsDone()) return { ok: false, added, usedTan }
  const sh = fill.Shape()
  if (!sh || sh.IsNull()) return { ok: false, added, usedTan }
  const ext = (() => { const bb = cast(sh).boundingBox.bounds; return [bb[1][0] - bb[0][0], bb[1][1] - bb[0][1], bb[1][2] - bb[0][2]] })()
  return { ok: true, added, usedTan, ext }
}

console.log('MakeFilling 路径良好性（G0 + G1，安全；G2 已知 fault 故跳）：')
const g0 = fillTop('GeomAbs_C0')
const g1 = fillTop('GeomAbs_G1')
ok(g0.ok, `G0 边界补面成功（Add_1 C0，added=${g0.added}）`)
ok(g1.ok && g1.usedTan === 4, `G1 边界补面成功 + 4 边 Add_2(GeomAbs_G1)（usedTan=${g1.usedTan}）— shipped boundarypatch 路径基线良好`)
ok(g1.ok && g1.ext[0] > 1e-3 && g1.ext[1] > 1e-3 && g1.ext.every((x) => Number.isFinite(x) && x < 1e6), `G1 patch 有界（ext=${g1.ok ? g1.ext.map((x) => x.toFixed(1)).join('×') : '-'}）`)
console.log('  ⓘ G2（GeomAbs_G2）实测会 fault 内核（uncatchable）→ 未 ship，留 kernel 专项。详见文件头。')

console.log(`\n${fail === 0 ? '✅ G0/G1 路径良好（G2 已记录为内核 fault，未 ship）' : '❌ 有失败'} (${pass} pass / ${fail} fail)`)
process.exit(fail === 0 ? 0 : 1)
