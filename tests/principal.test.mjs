// principal.test.mjs — S189 主应力场 σ1/σ3 + 最大剪应力（Tresca / Fusion Max-Shear 慣例）验证
//
// 跑法（喺 C:\ClaudeCode\webcad 目录执行）：
//   npx -y tsx tests/principal.test.mjs
//
// 三组断言（对齐任务要求）：
//   ① 单轴拉伸 bar（真跑 runVoxelFea）→ 中段 σ1≈施加轴向应力、σ3≈0、τmax≈σ1/2、vm≈σ1（单轴恒等式）
//      + tresca 别名 === shear（同指一份数据）
//   ② 不变量：σ1+σ2+σ3 == sx+sy+sz（迹守恒），随机对称张量逐个校核
//   ③ 纯剪切：σ = [[0,τ,0],[τ,0,0],[0,0,0]] → σ1=+τ、σ2=0、σ3=−τ，故 τmax=(σ1−σ3)/2=τ
//
// princ3 系纯解析函数（Smith/Cardano 三角法），可零求解直接测 → ②③ 精确到浮点。
import { princ3, runVoxelFea } from '../src/analysis/voxelfea.ts'

let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m) } else { fail++; console.log('  ✗ ' + m) } }
const close = (a, b, tol) => Math.abs(a - b) <= tol

// von Mises（Voigt：sx,sy,sz,txy,tyz,tzx）——独立于 princ3 复算，用嚟核 vm==σ1 单轴恒等式
const vonMises = (sx, sy, sz, txy, tyz, tzx) =>
  Math.sqrt(Math.max(0, sx * sx + sy * sy + sz * sz - sx * sy - sy * sz - sz * sx + 3 * (txy * txy + tyz * tyz + tzx * tzx)))

// 水密长方体 [0,sx]×[0,sy]×[0,sz]，8 顶点 12 三角形（顶点索引 = bx + 2·by + 4·bz）
function boxMesh(sx, sy, sz) {
  const vertices = []
  for (let b = 0; b < 8; b++) vertices.push((b & 1) ? sx : 0, (b & 2) ? sy : 0, (b & 4) ? sz : 0)
  const triangles = [
    0, 1, 3, 0, 3, 2, 4, 5, 7, 4, 7, 6, 0, 4, 5, 0, 5, 1,
    2, 3, 7, 2, 7, 6, 0, 2, 6, 0, 6, 4, 1, 5, 7, 1, 7, 3,
  ]
  return { vertices: Float32Array.from(vertices), triangles: Uint32Array.from(triangles) }
}

// ============================================================ ① 单轴 bar（端到端，拉 + 压两符号）
// 单轴恒等式（无论拉/压）：一个主应力 = 轴向应力 σ_ax、另两个 ≈ 0，故
//   vm == |σ_ax|、τmax = (σ1−σ3)/2 = |σ_ax|/2；拉伸 σ1=σ_ax>0·σ3≈0，压缩 σ3=σ_ax<0·σ1≈0。
// 网格 8×8×16 沿 Z，力 100N / 截面积 64 → |σ_ax| ≈ 1.5625 MPa。
function uniaxialBar(sign) {   // sign=+1 拉、−1 压
  const m = boxMesh(8, 8, 16)
  return runVoxelFea({
    vertices: m.vertices, triangles: m.triangles,
    fixed: { point: [0, 0, 0], normal: [0, 0, 1] },
    load: { point: [0, 0, 16], normal: [0, 0, 1] },
    force: [0, 0, sign * 100], E: 2000, nu: 0.3, resolution: 8,
  })
}
const TARGET = 100 / 64   // 1.5625 MPa 轴向应力幅值
for (const { sign, label } of [{ sign: 1, label: '拉伸' }, { sign: -1, label: '压缩' }]) {
  console.log(`① 单轴 bar（${label}，8×8×16 沿 Z，|σ_ax|≈1.5625 MPa）：`)
  const r = uniaxialBar(sign)
  ok(r.ok && r.converged, `求解成功且收敛（${r.nVox} 体素）`)
  ok(!!(r.s1 && r.s3 && r.shear && r.tresca), '返回 s1 / s3 / shear / tresca 四个场')
  // tresca 系 shear 别名（worker 侧同指一份；此测试无 structured-clone → 严格 ===）
  ok(r.tresca === r.shear, 'tresca 别名严格 === shear（同指一份 Float32Array）')

  // 取中段（cz∈[5,11]，远离夹持/加载端奇异）逐体素校核单轴恒等式
  let n = 0, worstAx = 0, worstLat = 0, worstSh = 0, worstVm = 0, worstSign = 0
  for (let e = 0; e < r.nVox; e++) {
    const cz = r.centers[e * 3 + 2]
    if (cz < 5 || cz > 11) continue
    n++
    const s1 = r.s1[e], s3 = r.s3[e], sh = r.shear[e], vm = r.vm[e]
    // 轴向主应力 = 绝对值大嗰个（拉→σ1、压→σ3）；横向主应力 = 另一个，应 ≈ 0
    const axial = Math.abs(s1) >= Math.abs(s3) ? s1 : s3
    const lateral = Math.abs(s1) >= Math.abs(s3) ? s3 : s1
    worstAx = Math.max(worstAx, Math.abs(Math.abs(axial) - TARGET) / TARGET)  // |σ_ax| ≈ 轴向应力
    worstLat = Math.max(worstLat, Math.abs(lateral) / TARGET)                 // 横向主应力 ≈ 0
    worstSh = Math.max(worstSh, Math.abs(sh - (s1 - s3) / 2))                 // τmax == (σ1−σ3)/2 恒等
    worstVm = Math.max(worstVm, Math.abs(vm - Math.abs(axial)) / TARGET)      // vm == |σ_ax| 单轴恒等式
    if (sign > 0 && axial <= 0) worstSign = 1                                 // 拉→轴向主应力 > 0
    if (sign < 0 && axial >= 0) worstSign = 1                                 // 压→轴向主应力 < 0
  }
  ok(n === 64, `中段单元数 ${n}（期望 64）`)
  ok(worstSign === 0, `${label}下轴向主应力符号正确（${sign > 0 ? 'σ1>0 拉' : 'σ3<0 压'}）`)
  ok(worstAx <= 0.08, `中段 |σ_ax| ≈ 轴向应力 ${TARGET.toFixed(4)}（最大偏差 ${(worstAx * 100).toFixed(2)}% ≤ 8%）`)
  ok(worstLat <= 0.10, `中段横向主应力 ≈ 0（|σ_lat|/|σ_ax| 最大 ${(worstLat * 100).toFixed(2)}% ≤ 10%）`)
  ok(worstSh <= 1e-4, `τmax == (σ1−σ3)/2 逐体素（最大绝对偏差 ${worstSh.toExponential(2)} MPa，纯定义恒等）`)
  ok(worstVm <= 0.08, `vm == |σ_ax| 单轴恒等式（最大偏差 ${(worstVm * 100).toFixed(2)}% ≤ 8%）`)
  console.log('')
}

// ============================================================ ② 迹不变量 σ1+σ2+σ3 == sx+sy+sz
console.log('\n② 迹不变量：σ1+σ2+σ3 == sx+sy+sz（随机对称张量逐个校核）：')
{
  // 确定性伪随机（免依赖），跨量级覆盖：含近简并、大剪、纯拉/纯压
  let seed = 0x9e3779b1
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xffffffff * 2 - 1 }
  let worstTrace = 0, worstOrder = 0, cases = 0
  const scales = [1, 1e-3, 1e3, 1e6]
  for (const sc of scales) for (let k = 0; k < 250; k++) {
    const sx = rnd() * sc, sy = rnd() * sc, sz = rnd() * sc
    const txy = rnd() * sc, tyz = rnd() * sc, tzx = rnd() * sc
    const [e1, e2, e3] = princ3(sx, sy, sz, txy, tyz, tzx)
    cases++
    const trBefore = sx + sy + sz, trAfter = e1 + e2 + e3
    // 相对迹误差（迹近零时用绝对+尺度兜底）
    const denom = Math.max(Math.abs(trBefore), sc * 1e-6, 1e-12)
    worstTrace = Math.max(worstTrace, Math.abs(trAfter - trBefore) / denom)
    // 排序不变量 σ1≥σ2≥σ3
    if (!(e1 >= e2 - 1e-9 * sc && e2 >= e3 - 1e-9 * sc)) worstOrder = Math.max(worstOrder, 1)
  }
  ok(worstTrace <= 1e-9, `${cases} 例迹守恒 σ1+σ2+σ3==sx+sy+sz（最大相对误差 ${worstTrace.toExponential(2)} ≤ 1e-9）`)
  ok(worstOrder === 0, `全部满足 σ1≥σ2≥σ3 排序`)
}

// ============================================================ ③ 纯剪切 σ1=−σ3=τ
console.log('\n③ 纯剪切：σ=[[0,τ,0],[τ,0,0],[0,0,0]] → σ1=+τ, σ2=0, σ3=−τ, τmax=τ：')
{
  let worst = 0
  const taus = [1, 5, 100, 1e4]
  for (const tau of taus) {
    // 纯 xy 剪切：sx=sy=sz=0, txy=τ, tyz=tzx=0
    const [e1, e2, e3] = princ3(0, 0, 0, tau, 0, 0)
    const tmax = (e1 - e3) / 2
    const eq = Math.max(
      Math.abs(e1 - tau) / tau,       // σ1 = +τ
      Math.abs(e2) / tau,             // σ2 = 0
      Math.abs(e3 + tau) / tau,       // σ3 = −τ
      Math.abs(tmax - tau) / tau,     // τmax = (σ1−σ3)/2 = τ
    )
    worst = Math.max(worst, eq)
    ok(eq <= 1e-12, `τ=${tau}: σ1=${e1.toFixed(6)} σ2=${e2.toFixed(6)} σ3=${e3.toFixed(6)} τmax=${tmax.toFixed(6)}（误差 ${eq.toExponential(2)}）`)
  }
  // 交叉核：vm(pure shear) = √3·τ，且 σ1=−σ3=τ ⇒ Tresca 等效应力 = σ1−σ3 = 2τ
  const tau = 7
  const vm = vonMises(0, 0, 0, tau, 0, 0)
  const [e1, , e3] = princ3(0, 0, 0, tau, 0, 0)
  ok(close(vm, Math.sqrt(3) * tau, 1e-9), `纯剪 vm=√3·τ 交叉核（vm=${vm.toFixed(4)}, √3·τ=${(Math.sqrt(3) * tau).toFixed(4)}）`)
  ok(close(e1 - e3, 2 * tau, 1e-9), `Tresca 等效应力 σ1−σ3=2τ=${(2 * tau)}（=2·tresca；本场 shear/tresca 取 /2 版本）`)
}

// 对角阵分支（p1===0）：主应力即排序对角元
{
  const [e1, e2, e3] = princ3(5, -2, 3, 0, 0, 0)
  ok(e1 === 5 && e2 === 3 && e3 === -2, `对角阵分支：princ3(5,-2,3,0,0,0)=[5,3,-2]`)
}

console.log(`\n${fail === 0 ? '✅ 全部通过' : '❌ 有失败'} — principal σ1/σ3/τmax (${pass} pass / ${fail} fail)`)
if (fail > 0) process.exit(1)
