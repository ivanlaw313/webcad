// 焊接线位置验证（用户报修：平板双孔，浇口右侧 → 焊接线应喺孔【下游/左】侧，非上游）。
// 跑法：npx tsx tests/moldflow-weldline.test.mjs
import { _internals } from '../src/analysis/moldflow.ts'
const { dijkstraFill, markWeld, markAirTraps, sinkMarkField } = _internals
let pass = 0, fail = 0
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m) } }

// 合成 2D 平板（nz=1）21×11，中间挖一个 3×3 孔（x∈[9,11], y∈[4,6]）。浇口喺【右边】中点。
const nx = 21, ny = 11, nz = 1, h = 1
const n = nx * ny * nz
const solid = new Uint8Array(n).fill(1)
const holeX = [9, 10, 11], holeY = [4, 5, 6]
for (const x of holeX) for (const y of holeY) solid[x + nx * y] = 0
const grid = { nx, ny, nz, h, solid }
const hHalf = new Float64Array(n).fill(0.5)
const gate = (nx - 1) + nx * 5   // 右边 x=20, 中点 y=5
const fill = dijkstraFill(grid, hHalf, [gate], 1)
const weld = markWeld(grid, hHalf, fill.tau, fill.label, fill.parent, 1)

// 收集焊接线体素坐标
const welds = []
for (let p = 0; p < n; p++) if (weld[p]) welds.push([p % nx, ((p / nx) | 0) % ny])
console.log(`焊接线体素 ${welds.length} 个：`, welds.map(([x, y]) => `(${x},${y})`).join(' '))

// ① 下游（孔【左】侧 x<9，中线 y∈[4,6]）应有焊接线（两股绕孔流喺度合流）
const downstream = welds.filter(([x, y]) => x < 9 && x >= 1 && y >= 3 && y <= 7)
ok(downstream.length > 0, `孔下游（左侧 x<9 中线）有焊接线（实 ${downstream.length} 个：${downstream.map(([x, y]) => `(${x},${y})`).join(' ')}）`)

// ② 上游（孔【右】侧 x>11 中线 y∈[4,6]，远离浇口本身）唔应有焊接线（前沿喺度撞孔分流，未合流）
const upstream = welds.filter(([x, y]) => x > 11 && x < nx - 2 && y >= 4 && y <= 6)
ok(upstream.length === 0, `孔上游（右侧 x>11 中线）无焊接线（实 ${upstream.length}：${upstream.map(([x, y]) => `(${x},${y})`).join(' ')}）`)

// ③ 焊接线大致沿中线 y≈5（绕孔对冲喺中轴）
const onCenter = downstream.filter(([, y]) => Math.abs(y - 5) <= 1)
ok(onCenter.length > 0, `下游焊接线沿中轴 y≈5（实 ${onCenter.length} 个）`)

// ④ 平直无孔区（孔上方 y=0/1 行，远离孔）唔应大面积误报（平直推进无对冲）
const spurious = welds.filter(([x, y]) => (y <= 1 || y >= ny - 2) && x > 2 && x < nx - 2)
ok(spurious.length <= 2, `平直流道无大量误报焊接线（实 ${spurious.length}）`)

// ============ 困气点 air-trap（前沿终止 = τ 局部极大）============
const trap = markAirTraps(grid, fill.tau)
const traps = []
for (let p = 0; p < n; p++) if (trap[p]) traps.push([p % nx, ((p / nx) | 0) % ny])
console.log(`\n困气点 ${traps.length} 个：`, traps.map(([x, y]) => `(${x},${y})`).join(' '))

// ⑤ 困气点应喺远端壁（最后充填 = 浇口对侧 x 细，孔下游）
const trapFar = traps.filter(([x]) => x <= 2)
ok(trapFar.length > 0, `困气点喺远端壁 x≤2（最后充填，实 ${trapFar.length}：${trapFar.map(([x, y]) => `(${x},${y})`).join(' ')}）`)

// ⑥ 浇口体素（x=20,y=5,τ=0=全局最早）绝不应系困气点
const gx = 20, gy = 5
ok(!traps.some(([x, y]) => x === gx && y === gy), `浇口（${gx},${gy}）唔系困气点（τ=0 最早充填）`)

// ⑦ 困气点数目合理（局部极大稀疏，唔系成片）
ok(traps.length >= 1 && traps.length <= 8, `困气点数目稀疏合理（实 ${traps.length}，应 1..8）`)

// ============ 缩痕 sink-mark（绝对壁厚异常 z-score）============
// 100 个体素：90 薄（半厚 0.5）+ 10 厚（半厚 2.0 = 凸台/筋位）→ 厚区应高 sinkMark、薄区≈0。
const hh = new Float64Array(100)
for (let e = 0; e < 100; e++) hh[e] = e < 90 ? 0.5 : 2.0
const sink = sinkMarkField(hh, 100)
const thickAvg = (() => { let s = 0; for (let e = 90; e < 100; e++) s += sink[e]; return s / 10 })()
const thinAvg = (() => { let s = 0; for (let e = 0; e < 90; e++) s += sink[e]; return s / 90 })()
console.log(`缩痕：厚区均值 ${thickAvg.toFixed(3)} · 薄区均值 ${thinAvg.toFixed(3)}`)
ok(thickAvg > 0.5, `厚区（凸台）缩痕风险高 >0.5（实 ${thickAvg.toFixed(3)}）`)
ok(thinAvg < 0.05, `薄区缩痕风险≈0 <0.05（实 ${thinAvg.toFixed(3)}）`)

// ⑧ 等厚件无缩痕差异（σ=0 → 全 0）
const flat = sinkMarkField(new Float64Array(50).fill(1.0), 50)
ok(flat.every((v) => v === 0), `等厚件 σ=0 → 缩痕全 0（无差异收缩）`)

console.log(`\n${fail === 0 ? '✅ 全部通过 — 焊接线下游 + 困气远端 + 缩痕厚区' : '❌ 有失败'} (${pass} pass / ${fail} fail)`)
process.exit(fail === 0 ? 0 : 1)
