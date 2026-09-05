// #88 锁模力修正（峰压投影积分）+ #42 超量程诚实警告 + #87 实际分辨率。
// 跑法：npx tsx tests/moldflow-clamp.test.mjs
import { solveMoldFill, _solveInternals } from '../src/analysis/moldsolve.ts'
import { runMoldFlow, _internals } from '../src/analysis/moldflow.ts'
const { clampMachineFit } = _internals
const PP = { eta0: 900, n: 0.34, tauStar: 3.0e4, A1: 24, A2: 51.6, Tstar: -10, tMelt: 230, tMold: 40, tNoFlow: 135, rho: 740, cp: 2800, kt: 0.155 }

let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++ } else { fail++; console.log('  ✗ ' + m) } }

function box(min, max) {
  const [x0, y0, z0] = min, [x1, y1, z1] = max
  const v = [x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [3, 7, 6], [3, 6, 2], [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5]]
  return { vertices: Float64Array.from(v), triangles: Uint32Array.from(f.flat()) }
}

// ───────────────── (1) #88 修正锁模力 ≥ 旧法（不再系统性低估）；多层件严格更大 ─────────────────
{
  // 扁平单层带 → 投影积分 == 旧法（唔回退）
  const nxF = 40, nyF = 5
  const solidF = new Uint8Array(nxF * nyF).fill(1)
  const gridF = { nx: nxF, ny: nyF, nz: 1, h: 1, solid: solidF }
  const gF = 0 + nxF * 2
  const oF = solveMoldFill(gridF, new Float64Array(nxF * nyF).fill(0.8), [gF], PP, { injRate: 2000 })
  ok(oF.clampForcePeak >= oF.clampForce - 1e-9, `(1) 扁平件：修正 ${oF.clampForcePeak.toFixed(0)} ≥ 旧 ${oF.clampForce.toFixed(0)} N`)

  // 多层块（30×8×8）→ 逐列历时峰压 > 全场末瞬时均压×单层
  const nx = 30, ny = 8, nz = 8, n = nx * ny * nz
  const grid = { nx, ny, nz, h: 1, solid: new Uint8Array(n).fill(1) }
  const gate = 0 + nx * (4 + ny * 4)
  const oB = solveMoldFill(grid, new Float64Array(n).fill(1.5), [gate], PP, { injRate: 2000 })
  ok(oB.clampForcePeak > oB.clampForce, `(1) 多层块：修正 ${oB.clampForcePeak.toFixed(1)} > 旧 ${oB.clampForce.toFixed(1)} N（历时峰压+投影积分）`)
  ok(oB.clampForcePeak > 0 && oB.clampForce > 0, '(1) 两值皆 > 0')
  console.log(`(1) 修正锁模力：扁平 ${oF.clampForcePeak.toFixed(0)}=${oF.clampForce.toFixed(0)}N · 多层块 ${oB.clampForcePeak.toFixed(1)}>${oB.clampForce.toFixed(1)}N`)
}

// ───────────────── (2) runMoldFlow 暴露 clampForceKN(修正) + clampForceAvgKN(旧保留) + 诚实注记 ─────────────────
{
  const plate = box([0, 0, 0], [200, 120, 4])
  const r = runMoldFlow({ vertices: plate.vertices, triangles: plate.triangles, gates: [[100, 60, 4]], material: 'ABS', solver: true, resolution: 40 })
  ok(Number.isFinite(r.clampForceKN) && r.clampForceKN > 0, `(2) clampForceKN(修正) 有限 > 0（${r.clampForceKN.toFixed(0)} kN）`)
  ok(Number.isFinite(r.clampForceAvgKN) && r.clampForceAvgKN > 0, `(2) clampForceAvgKN(旧保留) 有限 > 0（${r.clampForceAvgKN.toFixed(0)} kN）`)
  ok(r.clampForceKN >= r.clampForceAvgKN - 1e-9, '(2) 修正值 ≥ 旧值（方向：不再低估）')
  ok(r.warnings.some(w => /锁模力估算/.test(w) && /投影面积积分/.test(w)), '(2) 锁模力修正诚实注记入 warnings')
  console.log(`(2) runMoldFlow：clampForceKN(修正)=${r.clampForceKN.toFixed(0)} · clampForceAvgKN(旧)=${r.clampForceAvgKN.toFixed(0)} kN`)
}

// ───────────────── (3) #42：clampMachineFit 超 3200t 量程判定（含 15% 裕度边界）─────────────────
{
  ok(clampMachineFit(1000).overRange === false, '(3) 1000 kN 唔超量程')
  ok(clampMachineFit(0).overRange === false && clampMachineFit(0).requiredTonne === 0, '(3) 0 kN → 0 公吨力、唔超')
  ok(clampMachineFit(-5).overRange === false, '(3) 负值守卫（唔超、唔崩）')
  // 边界：req×1.15 > 3200 ⇔ kN > 2782.6×9.80665 ≈ 27289 kN
  ok(clampMachineFit(27000).overRange === false, `(3) 27000 kN（req×1.15=${(27000 / 9.80665 * 1.15).toFixed(0)}<3200）唔超`)
  ok(clampMachineFit(28000).overRange === true, `(3) 28000 kN（req×1.15=${(28000 / 9.80665 * 1.15).toFixed(0)}>3200）超量程`)
  ok(Math.abs(clampMachineFit(9806.65).requiredTonne - 1000) < 1e-6, '(3) 9806.65 kN = 1000 公吨力（换算正确）')
  console.log(`(3) clampMachineFit：边界 27000→ok / 28000→超量程；1000t 换算核对`)
}

// ───────────────── (4) #87 resActual：薄壁自动加密后真值（≥ 请求；加密时 > 请求）─────────────────
{
  // 3mm 薄板 @ res40 会自动加密（见 moldflow.test T1 注：res40→64）
  const thin = box([-50, -20, 0], [50, 20, 3])
  const r = runMoldFlow({ vertices: thin.vertices, triangles: thin.triangles, gates: [[-50, 0, 1.5]], material: 'ABS', resolution: 40 })
  ok(Number.isInteger(r.resActual) && r.resActual >= 40, `(4) resActual=${r.resActual} 整数 ≥ 请求 40`)
  ok(r.resActual > 40, `(4) 薄壁自动加密 → resActual ${r.resActual} > 请求 40（暴露真值，非请求值）`)
  // 无需加密（够粗厚）时 resActual == 请求
  const chunky = box([0, 0, 0], [40, 40, 40])
  const r2 = runMoldFlow({ vertices: chunky.vertices, triangles: chunky.triangles, gates: [[20, 20, 40]], material: 'ABS', resolution: 20 })
  ok(Number.isInteger(r2.resActual) && r2.resActual >= 20, `(4) 厚件 resActual=${r2.resActual} ≥ 请求 20`)
  console.log(`(4) resActual：薄板 40→${r.resActual}（加密）· 厚件请求20→${r2.resActual}`)
}

console.log(`\n${fail === 0 ? '✅ 全部通过 — #88 锁模力修正 + #42 超量程 + #87 实际分辨率' : '❌ 有失败'} (${pass} pass / ${fail} fail)`)
process.exit(fail === 0 ? 0 : 1)
