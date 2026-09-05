// 浇口类型 + 流道平衡物理测试（纯 TS，Node 直跑）：npx -y tsx tests/moldGates.test.mjs
import { runMoldFlow, GATE_TYPES } from '../src/analysis/moldflow.ts'

let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m) } else { fail++; console.log('  ✗ ' + m) } }

// 水密盒
function box(min, max) {
  const [x0, y0, z0] = min, [x1, y1, z1] = max
  const v = [x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [3, 7, 6], [3, 6, 2], [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5]]
  return { v: Float64Array.from(v), t: Uint32Array.from(f.flat()) }
}

// 扁平板 120×40×4（薄壁，z 最薄）
const plate = box([0, 0, 0], [120, 40, 4])
const baseInp = { vertices: plate.v, triangles: plate.t, material: 'ABS', resolution: 44, solver: true }

// 两浇口【不对称】：A 喺 x=12，B 喺 x=64（中点 x≈38 → B 责任域阔好多）
const gates = [[12, 20, 4], [64, 20, 4]]

console.log('— 流道平衡 —')
const unbal = runMoldFlow({ ...baseInp, gates, runnerBalance: false })
const bal = runMoldFlow({ ...baseInp, gates, runnerBalance: true })
ok(unbal.gateStats.length === 2 && bal.gateStats.length === 2, '两浇口都有 gateStats')
console.log(`    均分:  flowFrac=[${unbal.gateStats.map(g => g.flowFrac.toFixed(2))}] 充填末=[${unbal.gateStats.map(g => g.fillEnd.toFixed(2))}] 不平衡=${(unbal.fillImbalance * 100).toFixed(0)}%`)
console.log(`    平衡:  flowFrac=[${bal.gateStats.map(g => g.flowFrac.toFixed(2))}] 充填末=[${bal.gateStats.map(g => g.fillEnd.toFixed(2))}] 不平衡=${(bal.fillImbalance * 100).toFixed(0)}%`)
ok(Math.abs(unbal.gateStats[0].flowFrac - 0.5) < 0.02, '均分模式两浇口各 ~50% 流量')
ok(bal.gateStats[1].flowFrac > bal.gateStats[0].flowFrac + 0.05, '平衡模式：责任域大嘅 B 浇口分到更多流量')
ok(bal.balanced === true && unbal.balanced === false, 'balanced 标志正确')
ok(bal.fillImbalance <= unbal.fillImbalance + 1e-6, `平衡后充填不平衡度 ≤ 均分（${(bal.fillImbalance * 100).toFixed(0)}% ≤ ${(unbal.fillImbalance * 100).toFixed(0)}%）`)

console.log('— 浇口类型压降 —')
// 单浇口，同几何，比 点浇口 vs 直接浇口 嘅浇口压降 + 注射压力
const pin = runMoldFlow({ ...baseInp, gates: [[60, 20, 4]], gateSpecs: [{ type: 'pin' }] })
const direct = runMoldFlow({ ...baseInp, gates: [[60, 20, 4]], gateSpecs: [{ type: 'direct' }] })
console.log(`    点浇口: 浇口ΔP=${pin.gateStats[0].gateDpMPa.toFixed(1)} MPa · 注射压力=${pin.pPeakMPa.toFixed(1)} MPa`)
console.log(`    直接:   浇口ΔP=${direct.gateStats[0].gateDpMPa.toFixed(1)} MPa · 注射压力=${direct.pPeakMPa.toFixed(1)} MPa`)
ok(pin.gateStats[0].gateDpMPa > direct.gateStats[0].gateDpMPa, '点浇口 ΔP > 直接浇口 ΔP')
ok(pin.gateStats[0].gateDpMPa > direct.gateStats[0].gateDpMPa * 3, '点浇口 ΔP 显著高（K4/dia1 vs K0.2/dia5）')
ok(pin.pPeakMPa > direct.pPeakMPa, '点浇口峰值注射压力 > 直接（计入浇口压降）')
ok(pin.gateStats[0].type === 'pin' && direct.gateStats[0].type === 'direct', 'gateStats.type 正确')

console.log('— 扇形浇口 —')
const fan = runMoldFlow({ ...baseInp, gates: [[60, 20, 4]], gateSpecs: [{ type: 'fan' }] })
ok(fan.gateStats.length === 1 && fan.tFill > 0, '扇形浇口跑得起、出 tFill')
ok(fan.gateStats[0].gateDpMPa < pin.gateStats[0].gateDpMPa, '扇形 ΔP < 点浇口（宽口低限制）')
ok(GATE_TYPES.fan.fanCells > 1, '扇形 fanCells > 1（多格入口）')

console.log('— 趋势模式 gateStats —')
const trend = runMoldFlow({ ...baseInp, solver: false, gates, runnerBalance: true })
ok(trend.gateStats.length === 2 && trend.gateStats[0].domainVox > 0, '趋势模式都有 gateStats + 责任域体积')

console.log(`\nmoldGates: ${pass} 过 / ${fail} 败`)
process.exit(fail ? 1 : 0)
