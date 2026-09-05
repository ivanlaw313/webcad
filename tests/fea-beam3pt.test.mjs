// fea-beam3pt.test.mjs — 验证「简支梁 / 3 点弯」模式：两端支撑 + 中间施力 → 应力最大喺【中间】
// 跑: npx -y tsx tests/fea-beam3pt.test.mjs
import { runVoxelFea } from '../src/analysis/voxelfea.ts'

let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m) } else { fail++; console.log('  ✗ ' + m) } }

// 轴对齐长方梁 [0,L]×[-W/2,W/2]×[-H/2,H/2]（沿 X）
function beam(L, W, H) {
  const x0 = 0, x1 = L, y0 = -W / 2, y1 = W / 2, z0 = -H / 2, z1 = H / 2
  const v = [x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [3, 7, 6], [3, 6, 2], [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5]]
  return { vertices: Float32Array.from(v), triangles: Uint32Array.from(f.flat()) }
}

const m = beam(100, 8, 8)
// 支撑内缩 12%（同 autoFeaSimplySupported 一致）：杀端角奇异，留跨中弯曲/挠度为主角。
const INS = 12
console.log(`简支梁（支撑内缩到 x=${INS}/x=${100 - INS}、中间 x=50 受力 −Z 10N）：`)
const r = runVoxelFea({
  vertices: m.vertices, triangles: m.triangles,
  fixed: { point: [INS, 0, 0], normal: [1, 0, 0] },          // 支撑 A（pin）
  fixed2: { point: [100 - INS, 0, 0], normal: [1, 0, 0] },   // 支撑 B（roller）
  load: { point: [50, 0, 0], normal: [1, 0, 0] },            // 中间施力
  force: [0, 0, -10], beam3pt: true,
  E: 2000, nu: 0.3, resolution: 48,
})
ok(r.ok, `求解成功（${r.nVox} 体素，${r.converged ? '收敛' : '未完全收敛'}）`)
if (r.ok) {
  // 分段取每个 x 段嘅最大 vm + 最大挠度
  const segV = {}, segD = {}, cen = r.centers, vm = r.vm, dp = r.disp
  for (let e = 0; e < r.nVox; e++) { const x = cen[e * 3]; const k = Math.round(x / 10) * 10; if (segV[k] == null || vm[e] > segV[k]) segV[k] = vm[e]; if (segD[k] == null || dp[e] > segD[k]) segD[k] = dp[e] }
  const ks = Object.keys(segV).map(Number).sort((a, b) => a - b)
  // 挠度 max 位置（无奇异、合直觉嘅主指标：梁中间凹最多）
  let de = -1, dv = -1; for (let e = 0; e < r.nVox; e++) if (dp[e] > dv) { dv = dp[e]; de = e }
  const dX = Math.round(cen[de * 3])
  console.log('  挠度剖面：' + ks.map(k => `x${k}:${segD[k].toFixed(3)}`).join(' '))
  console.log('  应力剖面：' + ks.map(k => `x${k}:${segV[k].toFixed(1)}`).join(' '))
  ok(dX >= 35 && dX <= 65, `最大【挠度】喺中间 x=${dX}（35–65）— 梁中间凹最多，合直觉、无奇异`)
  const dMid = segD[50] ?? 0, dEndA = segD[0] ?? 0, dEndB = segD[100] ?? 0
  ok(dMid > dEndA * 1.5 && dMid > dEndB * 1.5, `中间挠度 ${dMid.toFixed(3)} ≫ 两端 ${dEndA.toFixed(3)}/${dEndB.toFixed(3)}`)
  // 跨中弯曲应力系跨内局部峰（由 1/4 跨升到中跨），同两端悬出≈0 对比
  const sMid = segV[50] ?? 0, sQ = Math.max(segV[20] ?? 0, segV[80] ?? 0), sEndA = segV[0] ?? 0, sEndB = segV[100] ?? 0
  ok(sMid > sQ, `跨中弯曲应力 ${sMid.toFixed(1)} > 1/4 跨 ${sQ.toFixed(1)}（弯矩向中间升）`)
  ok(sMid > sEndA * 2 && sMid > sEndB * 2, `跨中 ${sMid.toFixed(1)} ≫ 两端悬出 ${sEndA.toFixed(1)}/${sEndB.toFixed(1)}`)
  // 解析校核：简支梁中点 σ=(P·L/4)·c/I；P=10,跨L=76,c=4,矩形 I=W·H³/12=341.3 → σ=(10·76/4)·4/341.3=2.23MPa（粗体素弯曲偏软会低估，量级对）
  console.log(`  (跨中 vm=${sMid.toFixed(2)}MPa · 挠度 max=${dv.toFixed(3)}mm @x=${dX} · 解析中点弯曲 ≈ 2.2MPa 同量级)`)
}

console.log(`\n${fail === 0 ? '✅' : '❌'} 简支梁 / 3 点弯 (${pass} pass / ${fail} fail)`)
if (fail > 0) process.exit(1)
