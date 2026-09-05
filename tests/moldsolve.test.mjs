// 真 2.5D Hele-Shaw 充填求解器（moldsolve.ts）解析解验证。
// 跑法：npx tsx tests/moldsolve.test.mjs
//
// 验证案例（有解析解）：
//   ① 1D 等厚条，单端浇口 → end-of-fill 压力沿流向【线性】（Darcy 常导）。
//   ② 中心浇口圆盘 → 压力沿半径【对数】下降（径向 Hele-Shaw，每倍半径等压降）。
//   ③ 厚度 race-tracking → 厚通道比薄区【先充】（同距离 fillTime 细）。
//   ④ 充填守恒 / 单调性 sanity。
// GM-W8 C5-S2 Stage-2 能量方程耦合验证（⑤~⑨）：
//   ⑤ 等温极限：diss=0 且 T_melt=T_mold → 逐位退回 Stage-1（pPeak 差 <1%）。
//   ⑥ 冷却汇：薄长条冷模 → 出口温度 < 入口，沿流向单调下降。
//   ⑦ 黏性耗散：高流率 → 某处温度升过入口熔温。
//   ⑧ Cross-WLF：同 γ̇ 下 η(T_low) > η(T_high)（冷 → 稠）。
//   ⑨ 压力需求：冷模（冷却升黏）pPeak > 等温 pPeak。
import { solveMoldFill, crossVisc, _solveInternals } from '../src/analysis/moldsolve.ts'
const { crossWLFVisc } = _solveInternals

let pass = 0, fail = 0
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m) } }
const NEWTON = { eta0: 100, n: 0.5, tauStar: 1e15 }   // tauStar 极大 → 剪切项≈0 → η≈η₀ 常数（牛顿极限）

// ───────────────────────────── ① 1D 等厚条：压力线性 ─────────────────────────────
{
  const nx = 22, ny = 3, nz = 3, h = 1
  const n = nx * ny * nz
  const solid = new Uint8Array(n).fill(1)
  const grid = { nx, ny, nz, h, solid }
  const hHalf = new Float64Array(n).fill(1.5)
  const gate = 0 + nx * (1 + ny * 1)   // x=0 中心
  const out = solveMoldFill(grid, hHalf, [gate], NEWTON, { injRate: 1000, reSolveEvery: 1 })

  // 切片平均压力 p̄(x)（已填体素）
  const pbar = []
  for (let x = 0; x < nx; x++) {
    let s = 0, c = 0
    for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) {
      const p = x + nx * (y + ny * z)
      if (out.fillTime[p] < Infinity) { s += out.pressure[p]; c++ }
    }
    pbar.push(c ? s / c : NaN)
  }
  ok(out.nReached === n, `1D 条全充填（${out.nReached}/${n}）`)
  // 远场（x=4..18）单调下降
  let mono = true
  for (let x = 4; x < 18; x++) if (!(pbar[x] >= pbar[x + 1] - 1e-9)) mono = false
  ok(mono, `1D 压力沿流向单调下降（浇口高→前沿低）`)
  // 线性：中点压力 ≈ 端点线性插值（容差 18%，体素 + 入口效应）
  const xa = 5, xb = 17, xm = 11
  const lin = pbar[xa] + (pbar[xb] - pbar[xa]) * (xm - xa) / (xb - xa)
  const relErr = Math.abs(pbar[xm] - lin) / Math.max(pbar[xa], 1e-9)
  ok(relErr < 0.18, `1D 压力近线性（中点实 ${pbar[xm].toFixed(1)} vs 线性 ${lin.toFixed(1)}，误差 ${(relErr * 100).toFixed(1)}% <18%）`)
  // fillTime 沿 x 单调增（前沿离浇口推进）
  let ftMono = true
  for (let x = 3; x < 19; x++) {
    const ft0 = out.fillTime[x + nx * (1 + ny * 1)]
    const ft1 = out.fillTime[(x + 1) + nx * (1 + ny * 1)]
    if (!(ft1 >= ft0 - 1e-9)) ftMono = false
  }
  ok(ftMono, `1D 充填时间沿流向单调增（前沿推进）`)
  console.log(`① 1D 条：p̄(0)=${pbar[0].toFixed(1)} p̄(11)=${pbar[11].toFixed(1)} p̄(20)=${pbar[20].toFixed(2)} Pa · tFill=${out.tFill.toFixed(4)}s · CG ${out.iters} iters`)
}

// ───────────────────────── ② 中心浇口圆盘：压力对数下降 ─────────────────────────
{
  const nx = 31, ny = 31, nz = 1, h = 1
  const n = nx * ny * nz
  const solid = new Uint8Array(n)
  const cx = 15, cy = 15, R = 14
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    if ((x - cx) ** 2 + (y - cy) ** 2 <= R * R) solid[x + nx * y] = 1
  }
  const grid = { nx, ny, nz, h, solid }
  const hHalf = new Float64Array(n).fill(1.0)
  const gate = cx + nx * cy
  const out = solveMoldFill(grid, hHalf, [gate], NEWTON, { injRate: 800, reSolveEvery: 1 })

  // 环平均压力 p̄(r)
  const ring = (r0, r1) => {
    let s = 0, c = 0
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      const p = x + nx * y
      if (!solid[p] || out.fillTime[p] === Infinity) continue
      const r = Math.hypot(x - cx, y - cy)
      if (r >= r0 && r < r1) { s += out.pressure[p]; c++ }
    }
    return c ? s / c : NaN
  }
  const p2 = ring(1.5, 2.5), p4 = ring(3.5, 4.5), p8 = ring(7.5, 8.5)
  ok(p2 > p4 && p4 > p8, `圆盘压力沿半径下降（r2=${p2.toFixed(1)} > r4=${p4.toFixed(1)} > r8=${p8.toFixed(1)}）`)
  // 对数签名：每【倍】半径等压降 → (p2−p4) ≈ (p4−p8)（容差 35%，体素径向粗）
  const d1 = p2 - p4, d2 = p4 - p8
  const logErr = Math.abs(d1 - d2) / Math.max(d1, 1e-9)
  ok(logErr < 0.35, `圆盘压力近对数（每倍半径等压降：Δ(2→4)=${d1.toFixed(1)} vs Δ(4→8)=${d2.toFixed(1)}，差 ${(logErr * 100).toFixed(0)}% <35%）`)
  console.log(`② 圆盘：p(r2)=${p2.toFixed(1)} p(r4)=${p4.toFixed(1)} p(r8)=${p8.toFixed(1)} Pa · CG ${out.iters} iters`)
}

// ─────────────────────── ③ 厚度 race-tracking：厚通道先充 ───────────────────────
{
  const nx = 22, ny = 5, nz = 1, h = 1
  const n = nx * ny * nz
  const solid = new Uint8Array(n).fill(1)
  const grid = { nx, ny, nz, h, solid }
  // 中行 y=2 厚（hHalf=2.0），其余薄（hHalf=0.5）
  const hHalf = new Float64Array(n)
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) hHalf[x + nx * y] = (y === 2) ? 2.0 : 0.5
  const gate = 0 + nx * 2   // x=0, 中行
  const out = solveMoldFill(grid, hHalf, [gate], NEWTON, { injRate: 600, reSolveEvery: 1 })

  const ftThick = out.fillTime[18 + nx * 2]   // 厚通道远端
  const ftThin = out.fillTime[18 + nx * 0]    // 薄区同 x
  ok(Number.isFinite(ftThick) && (ftThin === Infinity || ftThick < ftThin),
    `厚通道 race-track 先充（厚 x18 t=${ftThick.toFixed(3)} < 薄 x18 t=${ftThin === Infinity ? '∞' : ftThin.toFixed(3)}）`)
  console.log(`③ race-track：厚通道 vs 薄区同距离充填时间 ${ftThick.toFixed(3)} vs ${ftThin === Infinity ? '∞' : ftThin.toFixed(3)} s`)
}

// ───────────────────────────── ④ Cross 黏度 sanity ─────────────────────────────
{
  const c = { eta0: 2000, n: 0.3, tauStar: 1e5 }
  const eLow = crossVisc(c, 1)        // 低剪切 ≈ η₀
  const eHigh = crossVisc(c, 1e5)     // 高剪切 → 稀化
  ok(eLow > eHigh, `Cross 剪切变稀（低剪 ${eLow.toFixed(0)} > 高剪 ${eHigh.toFixed(0)} Pa·s）`)
  ok(eLow <= c.eta0 && eLow > 0.5 * c.eta0, `Cross 低剪≈η₀（${eLow.toFixed(0)} 接近 ${c.eta0}）`)
  console.log(`④ Cross：η(γ̇=1)=${eLow.toFixed(0)} η(γ̇=1e5)=${eHigh.toFixed(1)} Pa·s`)
}

// ═════════════════════ GM-W8 C5-S2 Stage-2 能量方程耦合 ═════════════════════
// PP 文献家族典型 Cross-WLF + 热物性（同 MOLD_CROSS.PP）
const PP_WLF = { eta0: 900, n: 0.34, tauStar: 3.0e4, A1: 24, A2: 51.6, Tstar: -10, tMelt: 230, tMold: 40, tNoFlow: 135, rho: 740, cp: 2800, kt: 0.155 }
const mkStrip = (nx, ny, nz, hh) => {
  const n = nx * ny * nz
  const solid = new Uint8Array(n).fill(1)
  const grid = { nx, ny, nz, h: 1, solid }
  const hHalf = new Float64Array(n).fill(hh)
  const gate = 0 + nx * (((ny / 2) | 0) + ny * ((nz / 2) | 0))   // x=0 中心
  return { grid, hHalf, gate, nx, ny, nz }
}
const centerTemp = (out, x, nx, ny, nz) => out.tempField[x + nx * (((ny / 2) | 0) + ny * ((nz / 2) | 0))]

// ───────────────── ⑤ 等温极限：thermal(diss=0, T_melt=T_mold) ≈ Stage-1 ─────────────────
{
  const { grid, hHalf, gate } = mkStrip(22, 3, 3, 1.5)
  const iso = solveMoldFill(grid, hHalf, [gate], PP_WLF, { injRate: 1000 })
  const th = solveMoldFill(grid, hHalf, [gate], PP_WLF, { injRate: 1000, thermal: true, viscousHeating: false, tMelt: 230, tMold: 230 })
  const relP = Math.abs(th.pPeak - iso.pPeak) / Math.max(iso.pPeak, 1e-9)
  ok(relP < 0.01, `⑤ 等温极限 pPeak 差 ${(relP * 100).toFixed(4)}% < 1%（thermal ${th.pPeak.toFixed(1)} vs Stage-1 ${iso.pPeak.toFixed(1)}）`)
  ok(th.nReached === iso.nReached, `⑤ 等温极限充填数一致（${th.nReached}=${iso.nReached}）`)
  ok(Math.abs((th.tMin ?? 0) - 230) < 1 && Math.abs((th.tMax ?? 0) - 230) < 1, `⑤ 等温场恒 = 熔温（tMin=${th.tMin?.toFixed(2)} tMax=${th.tMax?.toFixed(2)}）`)
  console.log(`⑤ 等温极限：pPeak thermal=${th.pPeak.toFixed(1)} Stage-1=${iso.pPeak.toFixed(1)} Pa（Δ${(relP * 100).toFixed(4)}%）· T=${th.tMin?.toFixed(2)}°C`)
}

// ───────────────── ⑥ 冷却汇：薄长条冷模 → 出口温度 < 入口，单调下降 ─────────────────
{
  const { grid, hHalf, gate, nx, ny, nz } = mkStrip(40, 3, 1, 0.4)   // 40mm 长、0.8mm 薄 → 强壁面导热
  const th = solveMoldFill(grid, hHalf, [gate], PP_WLF, { injRate: 200, thermal: true, tMelt: 230, tMold: 40 })
  const xs = [2, 10, 20, 30, 38]
  const prof = xs.map((x) => centerTemp(th, x, nx, ny, nz))
  let mono = true
  for (let i = 0; i < prof.length - 1; i++) if (!(prof[i] >= prof[i + 1] - 0.5)) mono = false   // 沿流向单调下降（0.5° 容差）
  ok(mono, `⑥ 冷却沿流向单调下降 [${prof.map((v) => v.toFixed(1)).join(', ')}]°C`)
  ok(prof[prof.length - 1] < prof[0] - 10, `⑥ 出口比入口冷 >10°（出口 ${prof[prof.length - 1].toFixed(1)} < 近浇口 ${prof[0].toFixed(1)}）`)
  ok(prof[prof.length - 1] < 230, `⑥ 出口 ${prof[prof.length - 1].toFixed(1)}°C < 熔温 230°C（已散热）`)
  console.log(`⑥ 冷却：入口→出口 ${prof[0].toFixed(1)}→${prof[prof.length - 1].toFixed(1)}°C · tMin=${th.tMin?.toFixed(1)}°C · tFill=${th.tFill.toFixed(3)}s`)
}

// ───────────────── ⑦ 黏性耗散：高流率 → 某处温度升过入口熔温 ─────────────────
{
  const { grid, hHalf, gate } = mkStrip(40, 3, 1, 0.4)
  const th = solveMoldFill(grid, hHalf, [gate], PP_WLF, { injRate: 8000, thermal: true, viscousHeating: true, tMelt: 230, tMold: 60 })
  ok((th.tMax ?? 0) > 230 + 1, `⑦ 黏性耗散升温：tMax ${th.tMax?.toFixed(1)}°C > 入口 230°C`)
  console.log(`⑦ 黏性耗散：高流率 tMax=${th.tMax?.toFixed(1)}°C（入口 230）· tFill=${th.tFill.toFixed(4)}s`)
}

// ───────────────── ⑧ Cross-WLF：同 γ̇ 下 η(T_low) > η(T_high) ─────────────────
{
  const gdot = 100
  const eLow = crossWLFVisc(PP_WLF, gdot, 180, 230, 24, 51.6, -10)    // 冷 180°C
  const eHigh = crossWLFVisc(PP_WLF, gdot, 230, 230, 24, 51.6, -10)   // 熔温 230°C
  const eAtMelt = crossWLFVisc(PP_WLF, gdot, 230, 230, 24, 51.6, -10)
  const eIso = crossVisc(PP_WLF, gdot)
  ok(eLow > eHigh, `⑧ WLF 冷→稠：η(180°C)=${eLow.toFixed(1)} > η(230°C)=${eHigh.toFixed(1)} Pa·s`)
  ok(Math.abs(eAtMelt - eIso) / eIso < 1e-9, `⑧ WLF η(T=tMelt) 逐位 = 等温 crossVisc（${eAtMelt.toFixed(4)}=${eIso.toFixed(4)}）`)
  console.log(`⑧ Cross-WLF：η(180)=${eLow.toFixed(1)} η(230)=${eHigh.toFixed(1)} Pa·s（升 ${((eLow / eHigh - 1) * 100).toFixed(0)}%）`)
}

// ───────────────── ⑨ 压力需求：冷模（冷却升黏）pPeak > 等温 pPeak ─────────────────
{
  const { grid, hHalf, gate } = mkStrip(40, 3, 1, 0.4)
  const iso = solveMoldFill(grid, hHalf, [gate], PP_WLF, { injRate: 200 })
  const cold = solveMoldFill(grid, hHalf, [gate], PP_WLF, { injRate: 200, thermal: true, viscousHeating: false, tMelt: 230, tMold: 40 })
  ok(cold.pPeak > iso.pPeak * 1.05, `⑨ 冷模压力需求升：冷 pPeak ${(cold.pPeak / 1e6).toFixed(2)} > 等温 ${(iso.pPeak / 1e6).toFixed(2)} MPa（×${(cold.pPeak / iso.pPeak).toFixed(2)}）`)
  console.log(`⑨ 压力需求：等温 ${(iso.pPeak / 1e6).toFixed(2)} MPa → 冷模 ${(cold.pPeak / 1e6).toFixed(2)} MPa（×${(cold.pPeak / iso.pPeak).toFixed(2)}，长薄流程冷却→黏度升）`)
}

console.log(`\n${fail === 0 ? '✅ 全部通过 — 求解器对解析解（线性/对数/race-track）+ Stage-2 能量耦合验证成立' : '❌ 有失败'} (${pass} pass / ${fail} fail)`)
process.exit(fail === 0 ? 0 : 1)
