// 抽壳「默认开顶面」回归测试 — 锁定 bug fix：finder 必须用【shape 真 bbox 顶 Z】，
// 唔系 lastExtrudeHeight（prim 方块无 extrude / 有贯通孔 extrude 时 z 会错 → 抽壳退化、几乎实心）。
// 跑：npx -y tsx tests/shell-default-topface.test.mjs（喺 C:\ClaudeCode\webcad）
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, draw, drawCircle } = await import('replicad')
const { default: opencascade } = await import('../src/kernel/replicad_plus.js')
const wasmPath = fileURLToPath(new URL('../src/kernel/replicad_plus.wasm', import.meta.url))
const OC = await opencascade({ locateFile: () => wasmPath })
setOC(OC)

let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m) } else { fail++; console.log('  ✗ ' + m) } }
const vol = (shape) => { try { const g = new OC.GProp_GProps_1(); OC.BRepGProp.VolumeProperties_1(shape.wrapped, g, false, false, false); return g.Mass() } catch { return NaN } }

// 80×60×40 方块（底 z=0，顶 z=40），CAD mm³ 体积 = 192000
function makeBox() { return draw().movePointerTo([-40, -30]).lineTo([40, -30]).lineTo([40, 30]).lineTo([-40, 30]).close().sketchOnPlane('XY').extrude(40) }
function withHoles(holes) {
  let b = makeBox()
  for (const [cx, cy] of holes) b = b.cut(drawCircle(5).translate(cx, cy).sketchOnPlane('XY').extrude(40))
  return b
}

// ---- 修复核心断言：默认顶面抽壳 finder = inPlane('XY', 真 bbox 顶 Z) 须对【任意孔配置】都真挖空。
// 涵盖用户报告嘅复杂件：无孔 / 2孔 / 3孔 / 中心孔（旧 lastExtrudeHeight 路径喺有孔时全 no-op）。
const configs = [
  { name: '无孔', holes: [] },
  { name: '2孔', holes: [[18, 8], [-18, -8]] },
  { name: '3孔', holes: [[18, 8], [-18, -8], [0, 0]] },
  { name: '中心孔', holes: [[0, 0]] },
]
let twoHoleBox = null
for (const cfg of configs) {
  const box = withHoles(cfg.holes)
  if (cfg.name === '2孔') twoHoleBox = box
  const V0 = vol(box)
  const topZ = box.boundingBox.bounds[1][2]
  let Vtop = NaN
  try { Vtop = vol(box.shell(2, (ff) => ff.inPlane('XY', topZ))) } catch { /* keep NaN */ }
  const hollowed = Number.isFinite(Vtop) && Vtop < V0 * 0.35
  console.log(`  ${cfg.name}: 实心 ${(V0 / 1000).toFixed(1)}cm³ → 抽壳(顶Z=${topZ.toFixed(1)}) ${Number.isFinite(Vtop) ? (Vtop / 1000).toFixed(1) + 'cm³' : '抛错'} ${hollowed ? '✓挖空' : '✗未挖空'}`)
  ok(hollowed, `${cfg.name}：bbox 顶 Z finder 真挖空（< 35% 实心）`)
}

// (修复前 BUG 重现)2孔用错 Z（模拟 lastExtrudeHeight 落喺贯通孔高度 50，无面）→ 退化
const V2 = vol(twoHoleBox)
let degenerate = false, Vwrong = NaN
try { Vwrong = vol(twoHoleBox.shell(2, (ff) => ff.inPlane('XY', 50))); if (!(Vwrong < V2 * 0.35)) degenerate = true } catch { degenerate = true }
console.log(`  错 Z=50（旧路径）: ${Number.isFinite(Vwrong) ? (Vwrong / 1000).toFixed(1) + 'cm³' : '抛错'} → ${degenerate ? '退化（重现旧 bug）' : '竟然挖空'}`)
ok(degenerate, '用错 Z（旧 lastExtrudeHeight 路径）确实退化 — 证明修复必要')

console.log(`\n${fail === 0 ? '✅' : '❌'} 默认顶面抽壳（bbox 顶 Z）(${pass} pass / ${fail} fail)`)
if (fail > 0) process.exit(1)
