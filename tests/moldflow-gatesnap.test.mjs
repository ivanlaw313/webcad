// #89 浇口吸附空间加速验证。跑法：npx tsx tests/moldflow-gatesnap.test.mjs
//
// 验：nearestSolidVoxel（扩壳空间搜索）同旧 O(nGate×nVox) 暴力最近邻【逐字节一致】
//   （同 compact 序 e、同 d²），并喺高分辨率（大 nVox）+ 多浇口下【唔卡死】（远快过暴力）。
import { _internals } from '../src/analysis/moldflow.ts'
const { nearestSolidVoxel } = _internals

let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++ } else { fail++; console.log('  ✗ ' + m) } }

// 建体素网格（solid 图 + origin/h）+ compact 序（k→j→i）+ centers（Float32，同生产）+ compactOf
function buildGrid(nx, ny, nz, h, ox, oy, oz, solidFn) {
  const n = nx * ny * nz
  const solid = new Uint8Array(n)
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (solidFn(i, j, k)) solid[i + nx * (j + ny * k)] = 1
  let nVox = 0
  for (let p = 0; p < n; p++) if (solid[p]) nVox++
  const gridOf = new Int32Array(nVox)
  const compactOf = new Int32Array(n).fill(-1)
  const centers = new Float32Array(nVox * 3)
  let e = 0
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const p = i + nx * (j + ny * k); if (!solid[p]) continue
    gridOf[e] = p; compactOf[p] = e
    centers[e * 3] = ox + (i + 0.5) * h; centers[e * 3 + 1] = oy + (j + 0.5) * h; centers[e * 3 + 2] = oz + (k + 0.5) * h
    e++
  }
  return { nx, ny, nz, h, ox, oy, oz, nVox, compactOf, centers }
}
// 暴力最近邻（同旧 moldflow 逐字节：best=0 初值、严格 <、首个最小赢）
function brute(gx, gy, gz, g) {
  let best = 0, bestD2 = Infinity
  for (let e = 0; e < g.nVox; e++) {
    const dx = g.centers[e * 3] - gx, dy = g.centers[e * 3 + 1] - gy, dz = g.centers[e * 3 + 2] - gz
    const d2 = dx * dx + dy * dy + dz * dz
    if (d2 < bestD2) { bestD2 = d2; best = e }
  }
  return { e: best, d2: bestD2 }
}
function snap(gx, gy, gz, g) {
  return nearestSolidVoxel(gx, gy, gz, g.nx, g.ny, g.nz, g.h, g.ox, g.oy, g.oz, g.compactOf, g.centers)
}

// ───────────────── (1) 带孔平板：内点/中间/孔内/边角/网格外 全部对齐暴力 ─────────────────
{
  // 40×30×3，中央挖一个 8×8 通孔（模拟细孔），origin 偏移、h=1.5
  const g = buildGrid(40, 30, 3, 1.5, -10, 5, 2, (i, j, k) => !(i >= 16 && i < 24 && j >= 11 && j < 19))
  const ox = g.ox, oy = g.oy, oz = g.oz, h = g.h
  const pts = []
  // 网格内规则采样（含孔内、边界）
  for (let t = 0; t < 400; t++) {
    const gx = ox + (Math.random() * g.nx) * h
    const gy = oy + (Math.random() * g.ny) * h
    const gz = oz + (Math.random() * g.nz) * h
    pts.push([gx, gy, gz])
  }
  // 精确体素中心（tie-break 压力测试）
  for (let e = 0; e < g.nVox; e += 37) pts.push([g.centers[e * 3], g.centers[e * 3 + 1], g.centers[e * 3 + 2]])
  // 网格外（各方向）
  const spanX = g.nx * h, spanY = g.ny * h
  pts.push([ox - 50, oy + spanY / 2, oz + h], [ox + spanX + 50, oy + spanY / 2, oz + h], [ox + spanX / 2, oy - 40, oz + h], [ox + spanX / 2, oy + spanY + 40, oz + h], [ox - 100, oy - 100, oz - 100], [ox + spanX + 30, oy + spanY + 30, oz + 30])
  // 孔中心
  pts.push([ox + 20 * h, oy + 15 * h, oz + 1.5 * h])
  let mism = 0, dmism = 0
  for (const [gx, gy, gz] of pts) {
    const a = brute(gx, gy, gz, g), b = snap(gx, gy, gz, g)
    if (a.e !== b.e) mism++
    if (a.d2 !== b.d2) dmism++
  }
  ok(mism === 0, `(1) 带孔板 ${pts.length} 点 snap 序全等暴力（不符 ${mism}）`)
  ok(dmism === 0, `(1) d² 逐字节相等（不符 ${dmism}）`)
  console.log(`(1) 带孔板 40×30×3(h1.5,挖8×8孔)：${pts.length} 采样点 snap==brute（含孔内/网格外/精确中心）`)
}

// ───────────────── (2) tie-break：浇口正处两体素中垂面 → 取最小 compact 序（同暴力）─────────────────
{
  const g = buildGrid(10, 3, 1, 2, 0, 0, 0, () => true)   // 全实心，h=2
  // x 方向相邻两体素中心 = 1 与 3（i=0.5·2=1, i=1.5·2=3）；取中点 x=2 → 两者等距
  const gx = 2, gy = 1, gz = 1   // y=1,z=1 = 中行中层
  const a = brute(gx, gy, gz, g), b = snap(gx, gy, gz, g)
  ok(a.e === b.e && a.d2 === b.d2, `(2) 等距 tie-break 同暴力（brute e=${a.e} snap e=${b.e}）`)
  console.log(`(2) 等距中垂面 tie-break：均取最小 compact 序 e=${a.e}`)
}

// ───────────────── (3) 高分辨率 + 多浇口：唔卡死（远快过暴力）+ 结果一致 ─────────────────
{
  const g = buildGrid(220, 220, 3, 0.8, 0, 0, 0, () => true)   // ~145k 体素（256 级薄板量级）
  const gates = []
  for (let t = 0; t < 40; t++) gates.push([Math.random() * 176, Math.random() * 176, Math.random() * 2.4])
  // 一致性（对暴力）
  let mism = 0
  for (const [gx, gy, gz] of gates) { const a = brute(gx, gy, gz, g), b = snap(gx, gy, gz, g); if (a.e !== b.e || a.d2 !== b.d2) mism++ }
  ok(mism === 0, `(3) 高分辨率 40 浇口 snap==brute（不符 ${mism}）`)
  // 性能：snap 应远快于暴力
  const t0 = Date.now(); for (const [gx, gy, gz] of gates) snap(gx, gy, gz, g); const tSnap = Date.now() - t0
  const t1 = Date.now(); for (const [gx, gy, gz] of gates) brute(gx, gy, gz, g); const tBrute = Date.now() - t1
  ok(tSnap < 200, `(3) 40 浇口 snap ${tSnap}ms < 200ms（唔卡死）`)
  ok(tSnap <= tBrute, `(3) snap ${tSnap}ms ≤ brute ${tBrute}ms（空间加速有效）`)
  console.log(`(3) 220×220×3=${g.nVox} 体素 · 40 浇口：snap ${tSnap}ms vs brute ${tBrute}ms（结果一致）`)
}

console.log(`\n${fail === 0 ? '✅ 全部通过 — #89 浇口吸附空间加速：逐字节一致暴力 + tie-break + 高分辨率唔卡死' : '❌ 有失败'} (${pass} pass / ${fail} fail)`)
process.exit(fail === 0 ? 0 : 1)
