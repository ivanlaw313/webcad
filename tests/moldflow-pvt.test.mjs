// GM-P3 Stage-3 保压 / PVT 收缩预测（moldsolve.ts + moldflow.ts）验证。
// 跑法（喺 C:\ClaudeCode\webcad 目录执行）：npx tsx tests/moldflow-pvt.test.mjs
//
// ★ 诚实定位：呢个 solver 系【趋势级】2.5D Hele-Shaw + quasi-static 保压 + Tait 收缩，
//   唔系商用 Moldflow。测试只验【物理趋势方向】（压力升→收缩降、远浇口→收缩高…），非绝对数值。
//
// 测试（对应任务书 a–f）：
//   (a) Tait sanity 逐材料：ṽ 随 P 降、随 T 升；熔/固转变喺 Tt(P) 连续（容差内）。
//   (b) 保压关（默认）= 逐位一致於 Stage-2（深比较结果对象）。
//   (c) 趋势：保压压力升 → 平均收缩降（3 档单调）。
//   (d) 趋势：薄壁（快冻）+ 短保压 → 收缩高於长保压。
//   (e) 远浇口 CV 更早/更低压 seal → 局部收缩高於近浇口（经典缩水型态）。
//   (f) 全部场有限；典型 PP 收缩落喺合理区间 0.1%–4%。
//   (g) 集成：runMoldFlow 端到端暴露 result.packing（moldflow.ts 接线）+ 关时逐位一致。
import { solveMoldFill, _solveInternals } from '../src/analysis/moldsolve.ts'
import { runMoldFlow } from '../src/analysis/moldflow.ts'
const { taitVolume, MOLD_TAIT } = _solveInternals

let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++ } else { fail++; console.log('  ✗ ' + m) } }

// PP 文献家族典型 Cross-WLF + 热物性（同 MOLD_CROSS.PP）
const PP = { eta0: 900, n: 0.34, tauStar: 3.0e4, A1: 24, A2: 51.6, Tstar: -10, tMelt: 230, tMold: 40, tNoFlow: 135, rho: 740, cp: 2800, kt: 0.155 }

function mkStrip(nx, ny, nz, hh, h = 1) {
  const n = nx * ny * nz
  const solid = new Uint8Array(n).fill(1)
  const grid = { nx, ny, nz, h, solid }
  const hHalf = new Float64Array(n).fill(hh)
  const gate = 0 + nx * (((ny / 2) | 0) + ny * ((nz / 2) | 0))   // x=0 中心
  return { grid, hHalf, gate, nx, ny, nz }
}

// 深比较（NaN==NaN、Infinity、类型化数组、嵌套对象、undefined）
function deepEq(a, b, path = '') {
  if (a === b) return true
  if (typeof a === 'number' && typeof b === 'number') return (Number.isNaN(a) && Number.isNaN(b))
  if (a == null || b == null) return a === b
  const ta = a.constructor && a.constructor.name, tb = b.constructor && b.constructor.name
  const typed = ['Float64Array', 'Float32Array', 'Int32Array', 'Uint8Array', 'Uint32Array']
  if (typed.includes(ta) || typed.includes(tb)) {
    if (ta !== tb || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) { const x = a[i], y = b[i]; if (x !== y && !(Number.isNaN(x) && Number.isNaN(y))) return false }
    return true
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (!deepEq(a[i], b[i], `${path}[${i}]`)) return false
    return true
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b)
    if (ka.length !== kb.length) return false
    for (const k of ka) if (!deepEq(a[k], b[k], `${path}.${k}`)) return false
    return true
  }
  return false
}

// ───────────────────────── (a) Tait sanity 逐材料 ─────────────────────────
{
  let allT = true, allP = true, allS = true, contMax = 0
  for (const [k, c] of Object.entries(MOLD_TAIT)) {
    // 熔态 v 随 T 升（P=常压）
    const vm1 = taitVolume(c, c.b5 + 30, 1.013e5), vm2 = taitVolume(c, c.b5 + 60, 1.013e5)
    if (!(vm2 > vm1)) { allT = false; console.log(`  ✗ (a) ${k} 熔态 v 非随 T 升`) }
    // 固态 v 随 T 升
    const vs1 = taitVolume(c, c.b5 - 60, 1.013e5), vs2 = taitVolume(c, c.b5 - 30, 1.013e5)
    if (!(vs2 > vs1)) { allS = false; console.log(`  ✗ (a) ${k} 固态 v 非随 T 升`) }
    // v 随 P 降（熔态 + 固态各测一点）
    const vpM1 = taitVolume(c, c.b5 + 40, 1e6), vpM2 = taitVolume(c, c.b5 + 40, 6e7)
    const vpS1 = taitVolume(c, c.b5 - 40, 1e6), vpS2 = taitVolume(c, c.b5 - 40, 6e7)
    if (!(vpM2 < vpM1 && vpS2 < vpS1)) { allP = false; console.log(`  ✗ (a) ${k} v 非随 P 降`) }
    // 转变连续：Tt(P) 两侧 ±0.5K，P=0 与 P=30MPa
    for (const P of [0, 3e7]) {
      const Tt = c.b5 + c.b6 * P
      const vhi = taitVolume(c, Tt + 0.5, P), vlo = taitVolume(c, Tt - 0.5, P)
      const rel = Math.abs(vhi - vlo) / vhi
      if (rel > contMax) contMax = rel
      if (rel > 0.015) { console.log(`  ✗ (a) ${k} 转变不连续 @P=${(P / 1e6)}MPa: ${(rel * 100).toFixed(2)}% > 1.5%`) }
    }
  }
  ok(allT, '(a) 所有材料熔态 ṽ 随 T 升')
  ok(allS, '(a) 所有材料固态 ṽ 随 T 升')
  ok(allP, '(a) 所有材料 ṽ 随 P 降')
  ok(contMax <= 0.015, `(a) 所有材料转变连续（最大失配 ${(contMax * 100).toFixed(2)}% ≤ 1.5%）`)
  console.log(`(a) Tait sanity：7 材料 ∂v/∂T>0(熔+固) · ∂v/∂P<0 · 转变最大失配 ${(contMax * 100).toFixed(2)}%`)
}

// ───────────────── (b) 保压关 = 逐位一致於 Stage-2 ─────────────────
{
  const { grid, hHalf, gate } = mkStrip(24, 3, 3, 1.0)
  const base = solveMoldFill(grid, hHalf, [gate], PP, { injRate: 800, thermal: true, tMelt: 230, tMold: 40 })
  // 传入保压参数但 enablePacking 缺省（关）→ 应完全一致
  const { grid: g2, hHalf: hh2, gate: ga2 } = mkStrip(24, 3, 3, 1.0)
  const off = solveMoldFill(g2, hh2, [ga2], PP, { injRate: 800, thermal: true, tMelt: 230, tMold: 40, packPressure: 30e6, packTime: 5, tait: MOLD_TAIT.PP })
  ok(base.packing === undefined, '(b) 保压关 → out.packing === undefined')
  ok(off.packing === undefined, '(b) 传保压参数但 enablePacking 缺省 → 仍 undefined')
  ok(deepEq(base, off), '(b) 深比较逐位一致（Stage-2 vs 保压参数但未启用）')
  // 显式 enablePacking:false 亦一致
  const { grid: g3, hHalf: hh3, gate: ga3 } = mkStrip(24, 3, 3, 1.0)
  const offExplicit = solveMoldFill(g3, hh3, [ga3], PP, { injRate: 800, thermal: true, tMelt: 230, tMold: 40, enablePacking: false, packPressure: 30e6, packTime: 5, tait: MOLD_TAIT.PP })
  ok(deepEq(base, offExplicit), '(b) 深比较逐位一致（Stage-2 vs enablePacking:false）')
  console.log('(b) 保压关 byte-identical：packing undefined + 深比较通过')
}

// ───────────────── (c) 保压压力升 → 平均收缩降（3 档单调）─────────────────
{
  const avgs = []
  for (const pMPa of [10, 30, 50]) {
    const { grid, hHalf, gate } = mkStrip(40, 3, 1, 0.8)
    const out = solveMoldFill(grid, hHalf, [gate], PP, { injRate: 400, thermal: true, tMelt: 230, tMold: 40, enablePacking: true, packPressure: pMPa * 1e6, packTime: 5, tait: MOLD_TAIT.PP })
    avgs.push(out.packing.shrinkAvg)
  }
  ok(avgs[0] > avgs[1] && avgs[1] > avgs[2], `(c) 保压压力升→收缩降单调（10MPa ${avgs[0].toFixed(2)}% > 30MPa ${avgs[1].toFixed(2)}% > 50MPa ${avgs[2].toFixed(2)}%）`)
  console.log(`(c) 保压压力 10/30/50 MPa → 平均收缩 ${avgs.map(a => a.toFixed(2)).join(' / ')} %（单调降）`)
}

// ───────────────── (d) 薄壁 + 短保压 → 收缩高於长保压 ─────────────────
{
  const shrinkAt = (pt) => {
    const { grid, hHalf, gate } = mkStrip(30, 3, 1, 0.5)   // 薄壁 hh=0.5 → 快冻
    const out = solveMoldFill(grid, hHalf, [gate], PP, { injRate: 400, thermal: true, tMelt: 230, tMold: 40, enablePacking: true, packPressure: 30e6, packTime: pt, tait: MOLD_TAIT.PP })
    return out.packing.shrinkAvg
  }
  const shShort = shrinkAt(0.05), shLong = shrinkAt(5)
  ok(shShort > shLong * 1.2, `(d) 短保压收缩高：短 0.05s ${shShort.toFixed(2)}% > 长 5s ${shLong.toFixed(2)}%（薄壁快冻，短保压来唔切补缩）`)
  console.log(`(d) 薄壁短/长保压：${shShort.toFixed(2)}% (0.05s) vs ${shLong.toFixed(2)}% (5s)`)
}

// ───────────────── (e) 远浇口 seal 压低 → 局部收缩高於近浇口 ─────────────────
{
  const nx = 40, ny = 3
  const { grid, hHalf, gate } = mkStrip(nx, ny, 1, 0.8)
  const out = solveMoldFill(grid, hHalf, [gate], PP, { injRate: 400, thermal: true, tMelt: 230, tMold: 40, enablePacking: true, packPressure: 30e6, packTime: 5, tait: MOLD_TAIT.PP })
  const sf = out.packing.shrinkageField, sp = out.packing.sealedPressure
  const cell = (x) => x + nx * (1 + ny * 0)
  const near = cell(2), far = cell(38)
  ok(sp[far] < sp[near], `(e) 远浇口 seal 压 < 近浇口（远 ${(sp[far] / 1e6).toFixed(1)} < 近 ${(sp[near] / 1e6).toFixed(1)} MPa）`)
  ok(sf[far] > sf[near], `(e) 远浇口收缩 > 近浇口（远 ${sf[far].toFixed(2)}% > 近 ${sf[near].toFixed(2)}%）`)
  console.log(`(e) 近→远浇口：seal 压 ${(sp[near] / 1e6).toFixed(1)}→${(sp[far] / 1e6).toFixed(1)} MPa · 收缩 ${sf[near].toFixed(2)}→${sf[far].toFixed(2)} %`)
}

// ───────────────── (f) 全部场有限 + 典型 PP 收缩落 0.1%–4% ─────────────────
{
  const { grid, hHalf, gate } = mkStrip(36, 3, 1, 0.8)
  const out = solveMoldFill(grid, hHalf, [gate], PP, { injRate: 400, thermal: true, tMelt: 230, tMold: 40, enablePacking: true, packPressure: 40e6, packTime: 6, tait: MOLD_TAIT.PP })
  const pk = out.packing
  let allFinite = true, nFilled = 0
  for (let p = 0; p < grid.solid.length; p++) {
    const sf = pk.shrinkageField[p], sp = pk.sealedPressure[p]
    if (Number.isNaN(sf)) continue    // 未填 = NaN（合法）
    nFilled++
    if (!Number.isFinite(sf) || !Number.isFinite(sp) || sf < 0) allFinite = false
  }
  ok(allFinite && nFilled > 0, `(f) 全部已填 CV 收缩/seal 压有限且 ≥0（${nFilled} CV）`)
  ok(Number.isFinite(pk.shrinkMax) && Number.isFinite(pk.shrinkAvg) && Number.isFinite(pk.shrinkUniformity), '(f) 标量 shrinkMax/Avg/Uniformity 有限')
  ok(pk.shrinkAvg >= 0.1 && pk.shrinkAvg <= 4.0, `(f) 典型 PP 平均收缩 ${pk.shrinkAvg.toFixed(2)}% 落 [0.1, 4]%`)
  ok(pk.shrinkUniformity >= 0 && pk.shrinkUniformity <= 1, `(f) 均匀度 ${(pk.shrinkUniformity * 100).toFixed(0)}% 落 [0,1]`)
  console.log(`(f) 典型 PP（40MPa/6s）：平均 ${pk.shrinkAvg.toFixed(2)}% · 最大 ${pk.shrinkMax.toFixed(2)}% · 均匀度 ${(pk.shrinkUniformity * 100).toFixed(0)}% · 全有限`)
}

// ───────────────── (g) 集成：runMoldFlow 端到端暴露 packing + 关时一致 ─────────────────
{
  // 手搭 80×40×3 薄板 mesh（无核，纯 TS voxelize）
  function box(min, max, out = true) {
    const [x0, y0, z0] = min, [x1, y1, z1] = max
    const v = [x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]
    let f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [3, 7, 6], [3, 6, 2], [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5]]
    if (!out) f = f.map(([a, b, c]) => [a, c, b])
    return { v, f }
  }
  function merge(...parts) {
    const verts = [], tris = []
    for (const p of parts) { const base = verts.length / 3; for (const x of p.v) verts.push(x); for (const [a, b, c] of p.f) tris.push(base + a, base + b, base + c) }
    return { vertices: Float32Array.from(verts), triangles: Uint32Array.from(tris) }
  }
  const shell = merge(box([0, 0, 0], [80, 40, 4], true), box([2, 2, 1.5], [78, 38, 2.5], false)) // 薄壳箱
  const common = { vertices: shell.vertices, triangles: shell.triangles, gates: [[40, 20, 4]], material: 'PP', resolution: 32, solver: true, thermal: true }
  const rPack = runMoldFlow({ ...common, enablePacking: true, packPressure: 35e6, packTime: 6 })
  const rOff = runMoldFlow({ ...common })
  ok(rOff.packing === undefined, '(g) runMoldFlow 保压关 → result.packing undefined')
  ok(rPack.packing && rPack.packing.shrinkageField.length === rPack.nVox, `(g) 保压开 → shrinkageField 长度 = nVox (${rPack.nVox})`)
  ok(rPack.packing.sealedPressure.length === rPack.nVox, '(g) sealedPressure 长度 = nVox')
  ok(Number.isFinite(rPack.packing.shrinkAvg) && rPack.packing.shrinkAvg > 0, `(g) shrinkAvg 有限 > 0（${rPack.packing.shrinkAvg.toFixed(2)}%）`)
  ok(typeof rPack.packing.packTraceNote === 'string' && rPack.packing.packTraceNote.length > 0, '(g) packTraceNote 非空诚实注记')
  // 关时其余字段一致（除 packing/warnings 外核心场逐位一致）
  ok(deepEq(rOff.fill, rPack.fill), '(g) 保压唔改充填场（fill 逐位一致）')
  ok(deepEq(rOff.pressure, rPack.pressure) && deepEq(rOff.temp, rPack.temp), '(g) 保压唔改压力/温度场')
  console.log(`(g) runMoldFlow：nVox=${rPack.nVox} · 保压平均收缩 ${rPack.packing.shrinkAvg.toFixed(2)}% · 关时 packing undefined + 核心场一致`)
}

console.log(`\n${fail === 0 ? '✅ 全部通过 — Stage-3 保压/PVT：Tait 物理 + 保压趋势 + 收缩型态 + byte-identical 闸' : '❌ 有失败'} (${pass} pass / ${fail} fail)`)
process.exit(fail === 0 ? 0 : 1)
