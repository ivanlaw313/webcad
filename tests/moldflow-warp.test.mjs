// GM-S4 Stage-4 翘曲（趋势级）验证。跑法：npx tsx tests/moldflow-warp.test.mjs
//
// ★ 诚实定位：warpIndex 系【微分收缩弯矩 proxy】，唔系 FEM 翘曲位移。测试只验物理趋势方向：
//   (a) 均匀收缩场 → warpIndex ≈ 0（无微分收缩 → 无弯矩）。
//   (b) 单侧/合成收缩梯度 → warpIndex > 均匀；主轴对齐梯度方向；warpField 归一 0..1。
//   (c) 保压压力升 → warpIndex 单调降（3 档；收缩幅度降 → 绝对翘曲应变驱动降 → 符合工程经验）。
//   (d) 保压关 → 无 warp 场（packing undefined）+ 逐位一致（byte-identical）。
//   (e) 集成：runMoldFlow 端到端暴露 packing.warpField/warpMaxDir/warpIndex/warpNote + warpNote 入 warnings。
import { solveMoldFill, _solveInternals } from '../src/analysis/moldsolve.ts'
import { runMoldFlow } from '../src/analysis/moldflow.ts'
const { MOLD_TAIT, computeWarpage } = _solveInternals

let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++ } else { fail++; console.log('  ✗ ' + m) } }
const PP = { eta0: 900, n: 0.34, tauStar: 3.0e4, A1: 24, A2: 51.6, Tstar: -10, tMelt: 230, tMold: 40, tNoFlow: 135, rho: 740, cp: 2800, kt: 0.155 }

function mkStrip(nx, ny, nz, hh, h = 1) {
  const n = nx * ny * nz
  const solid = new Uint8Array(n).fill(1)
  const grid = { nx, ny, nz, h, solid }
  const hHalf = new Float64Array(n).fill(hh)
  const gate = 0 + nx * (((ny / 2) | 0) + ny * ((nz / 2) | 0))
  return { grid, hHalf, gate, nx, ny, nz }
}
// 深比较（NaN==NaN、类型化数组、嵌套、undefined）
function deepEq(a, b) {
  if (a === b) return true
  if (typeof a === 'number' && typeof b === 'number') return Number.isNaN(a) && Number.isNaN(b)
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
    for (let i = 0; i < a.length; i++) if (!deepEq(a[i], b[i])) return false
    return true
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b)
    if (ka.length !== kb.length) return false
    for (const k of ka) if (!deepEq(a[k], b[k])) return false
    return true
  }
  return false
}

// ───────────────── (a) 均匀收缩场 → warpIndex ≈ 0 ─────────────────
{
  const nx = 20, ny = 4, nz = 2, n = nx * ny * nz
  const filled = new Uint8Array(n).fill(1)
  const sf = new Float64Array(n).fill(2.5)   // 处处一致
  const w = computeWarpage({ nx, ny, nz, h: 1 }, filled, sf, null, 2.5)
  ok(w.warpIndex < 1e-6, `(a) 均匀收缩 warpIndex ≈ 0（实 ${w.warpIndex}）`)
  ok(w.warpMaxDir[0] === 0 && w.warpMaxDir[1] === 0 && w.warpMaxDir[2] === 0, '(a) 均匀 → 主轴退化零向量')
  let allZero = true
  for (let p = 0; p < n; p++) if (w.warpField[p] !== 0) allZero = false
  ok(allZero, '(a) 均匀 → warpField 全 0')
  console.log(`(a) 均匀收缩场：warpIndex=${w.warpIndex} · 主轴零 · warpField 全 0`)
}

// ───────────────── (b) 合成单向收缩梯度 → warpIndex>0、主轴对齐、warpField 归一 ─────────────────
{
  const nx = 20, ny = 4, nz = 2, n = nx * ny * nz
  const filled = new Uint8Array(n).fill(1)
  const sf = new Float64Array(n)
  let sum = 0
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const v = 1 + 0.1 * i; sf[i + nx * (j + ny * k)] = v; sum += v }  // 沿 x 线性
  const w = computeWarpage({ nx, ny, nz, h: 1 }, filled, sf, null, sum / n)
  // 与均匀对照
  const wu = computeWarpage({ nx, ny, nz, h: 1 }, filled, new Float64Array(n).fill(sum / n), null, sum / n)
  ok(w.warpIndex > wu.warpIndex, `(b) 梯度 warpIndex ${w.warpIndex.toFixed(1)} > 均匀 ${wu.warpIndex.toFixed(1)}`)
  ok(Math.abs(w.warpMaxDir[0]) > 0.95, `(b) 主导微分收缩轴对齐 x（dir=[${w.warpMaxDir.map(x => x.toFixed(2))}]）`)
  let wmax = -1, wmin = 2, bad = false, cnt = 0
  for (let p = 0; p < n; p++) { const v = w.warpField[p]; if (Number.isNaN(v)) continue; cnt++; if (v > wmax) wmax = v; if (v < wmin) wmin = v; if (v < 0 || v > 1) bad = true }
  ok(!bad && cnt === n, '(b) warpField 全部落 [0,1]')
  ok(Math.abs(wmax - 1) < 1e-6, `(b) warpField 归一（max=${wmax.toFixed(3)} = 1）`)
  console.log(`(b) 单向梯度：warpIndex ${w.warpIndex.toFixed(1)}（均匀 ${wu.warpIndex.toFixed(1)}）· 主轴 [${w.warpMaxDir.map(x => x.toFixed(2))}] · warpField∈[${wmin.toFixed(2)},${wmax.toFixed(2)}]`)
}

// ───────────────── (c) 保压压力升 → warpIndex 单调降（3 档）─────────────────
{
  const idx = []
  for (const pMPa of [10, 30, 50]) {
    const { grid, hHalf, gate } = mkStrip(40, 3, 1, 0.8)
    const out = solveMoldFill(grid, hHalf, [gate], PP, { injRate: 400, thermal: true, tMelt: 230, tMold: 40, enablePacking: true, packPressure: pMPa * 1e6, packTime: 5, tait: MOLD_TAIT.PP })
    idx.push(out.packing.warpIndex)
  }
  ok(idx[0] > idx[1] && idx[1] > idx[2], `(c) 保压升→翘曲降单调（10MPa ${idx[0].toFixed(1)} > 30MPa ${idx[1].toFixed(1)} > 50MPa ${idx[2].toFixed(1)}）`)
  ok(idx.every(v => v >= 0 && v <= 100), '(c) warpIndex 全落 [0,100]')
  console.log(`(c) 保压 10/30/50 MPa → warpIndex ${idx.map(v => v.toFixed(1)).join(' / ')}（单调降）`)
}

// ───────────────── (d) 保压关 → 无 warp 场 + byte-identical ─────────────────
{
  const { grid, hHalf, gate } = mkStrip(24, 3, 3, 1.0)
  const base = solveMoldFill(grid, hHalf, [gate], PP, { injRate: 800, thermal: true, tMelt: 230, tMold: 40 })
  const { grid: g2, hHalf: hh2, gate: ga2 } = mkStrip(24, 3, 3, 1.0)
  const off = solveMoldFill(g2, hh2, [ga2], PP, { injRate: 800, thermal: true, tMelt: 230, tMold: 40, enablePacking: false, packPressure: 30e6, packTime: 5, tait: MOLD_TAIT.PP })
  ok(base.packing === undefined, '(d) 保压关 → out.packing undefined（无 warp 场）')
  ok(off.packing === undefined, '(d) enablePacking:false（带保压参数）→ 仍 undefined')
  ok(deepEq(base, off), '(d) 深比较逐位一致（保压关，warp 分支唔行）')
  console.log('(d) 保压关：无 warp 场 + 深比较 byte-identical')
}

// ───────────────── (e) 集成：runMoldFlow 端到端暴露 warp ─────────────────
{
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
  const shell = merge(box([0, 0, 0], [80, 40, 4], true), box([2, 2, 1.5], [78, 38, 2.5], false))
  const common = { vertices: shell.vertices, triangles: shell.triangles, gates: [[40, 20, 4]], material: 'PP', resolution: 32, solver: true, thermal: true }
  const rPack = runMoldFlow({ ...common, enablePacking: true, packPressure: 35e6, packTime: 6 })
  const rOff = runMoldFlow({ ...common })
  ok(rOff.packing === undefined, '(e) 保压关 → result.packing undefined（无 warp）')
  ok(rPack.packing && rPack.packing.warpField.length === rPack.nVox, `(e) warpField 长度 = nVox (${rPack.nVox})`)
  ok(Array.isArray(rPack.packing.warpMaxDir) && rPack.packing.warpMaxDir.length === 3, '(e) warpMaxDir 三元单位向量')
  ok(Number.isFinite(rPack.packing.warpIndex) && rPack.packing.warpIndex >= 0 && rPack.packing.warpIndex <= 100, `(e) warpIndex ${rPack.packing.warpIndex.toFixed(1)} ∈ [0,100]`)
  ok(typeof rPack.packing.warpNote === 'string' && /翘曲/.test(rPack.packing.warpNote) && /非 FEM/.test(rPack.packing.warpNote), '(e) warpNote 诚实注记（非 FEM 摊牌）')
  ok(rPack.warnings.some(w => w === rPack.packing.warpNote), '(e) warpNote 入 warnings（UI 报告可见）')
  // warpField 有限或 NaN（未填/浇口），无 ±Inf
  let bad = false
  for (let e = 0; e < rPack.nVox; e++) { const v = rPack.packing.warpField[e]; if (!Number.isNaN(v) && !Number.isFinite(v)) bad = true }
  ok(!bad, '(e) warpField 无 ±Inf（有限或 NaN）')
  console.log(`(e) runMoldFlow：nVox=${rPack.nVox} · warpIndex ${rPack.packing.warpIndex.toFixed(1)} · 主轴 [${rPack.packing.warpMaxDir.map(x => x.toFixed(2))}] · 关时 packing undefined`)
}

console.log(`\n${fail === 0 ? '✅ 全部通过 — Stage-4 翘曲：均匀零 + 梯度弯矩 + 保压单调降 + byte-identical 闸 + 端到端' : '❌ 有失败'} (${pass} pass / ${fail} fail)`)
process.exit(fail === 0 ? 0 : 1)
