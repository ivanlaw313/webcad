// lowbacklog-l2.test.mjs — LOW backlog 清仓 (#50–#96) 纯数学回归
// 跑法: npx -y tsx tests/lowbacklog-l2.test.mjs   (喺 C:\ClaudeCode\webcad)
// 覆盖: #92 滑块曲柄可达性(真函数) · #65 圆环自交守卫数学 · #55 拉伸退化面积阈值 · #56 倒角收窄 minT
// 失败 → exit 1; 末尾输出 PASS/FAIL 总表
import { sliderCrankReachability, solveSliderCrank } from '../src/assembly/kinematics.ts'

let pass = 0, fail = 0
const rows = []
const ck = (name, cond, detail) => { rows.push([cond ? 'PASS' : 'FAIL', name, detail || '']); cond ? pass++ : fail++ }

// ── #92 滑块曲柄可达性 (kinematics.sliderCrankReachability，store setSliderCrank 用它出诚实警告) ──
{
  // e=0 → 全程可达（对心机构）
  const r0 = sliderCrankReachability({ r: 20, L: 60, e: 0 })
  ck('#92 对心 e=0 全程可达', r0.allReachable === true && Math.abs(r0.fraction - 1) < 1e-9, `fraction=${r0.fraction}`)

  // e=50 大偏置 → 部分曲柄角 disc<0 无解（|e−B_y|>L 当 B_y<−10 = sinθ<−0.5 = θ∈(210,330)）
  const r1 = sliderCrankReachability({ r: 20, L: 60, e: 50 })
  ck('#92 大偏置 e=50 非全程可达', r1.allReachable === false, `allReachable=${r1.allReachable}`)
  ck('#92 大偏置 fraction ∈(0,1)', r1.fraction > 0 && r1.fraction < 1, `fraction=${r1.fraction.toFixed(3)}`)
  // 断裂角度真系解唔到（solveSliderCrank ok:false）
  const bad = solveSliderCrank({ r: 20, L: 60, e: 50, theta: 270 })
  ck('#92 θ=270° 装唔到 (ok:false)', bad.ok === false, `ok=${bad.ok}`)
  // ~2/3 可达（断裂跨度约 120°）
  ck('#92 fraction ≈ 0.67', Math.abs(r1.fraction - 2 / 3) < 0.02, `fraction=${r1.fraction.toFixed(3)}`)
}

// ── #65 圆环管径守卫（outerTrue 语义）──
// worker: a=外半径=d/2、tb=管半径=td/2、中线半径 tr=a−tb；管圆横跨 [tr−tb, tr+tb]，tr−tb≤0 即穿越 Z 轴自交。
// 无自交 ⟺ tr>tb ⟺ d/2−td/2>td/2 ⟺ d>2·td。守卫应等价 d>2td。
{
  const torusValid = (d, td) => { const a = d / 2, tb = td / 2, tr = a - tb; return tr - tb > 0 } // 真几何：无自交
  const newGuard = (d, td) => d > 2 * td      // 修正后守卫
  const oldGuard = (d, td) => d > td          // 旧守卫（太松）
  const cases = [
    [40, 8, true], [40, 19, true], [40, 20, false], [40, 25, false], [40, 21, false], [30, 5, true], [30, 14, true], [30, 15, false],
  ]
  let allMatch = true
  for (const [d, td, want] of cases) { if (newGuard(d, td) !== want || torusValid(d, td) !== want) allMatch = false }
  ck('#65 新守卫 d>2td 与真几何一致', allMatch, JSON.stringify(cases.map(([d, td]) => [d, td, newGuard(d, td)])))
  // 旧守卫在 td<d≤2td 会放行自交件（外Ø40/管Ø25）
  ck('#65 旧守卫误放行自交 (40,25)', oldGuard(40, 25) === true && torusValid(40, 25) === false, `old=${oldGuard(40, 25)} valid=${torusValid(40, 25)}`)
  ck('#65 新守卫正确拒绝 (40,25)', newGuard(40, 25) === false, `new=${newGuard(40, 25)}`)
}

// ── #55 拉伸退化面积阈值（degOf 双除 2 off-by-2x 修复）──
// polyArea2 内部已 /2 返真面积；degOf 之前再 /2 → 阈值等价「真面积<0.08」，误杀 0.04~0.08mm² 细轮廓。
{
  const polyArea2 = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1] } return a / 2 }
  const tri006 = [[0, 0], [0.3, 0], [0, 0.4]]   // 面积 = 0.3·0.4/2 = 0.06 mm²
  const area = Math.abs(polyArea2(tri006))
  ck('#55 polyArea2 返真面积 0.06', Math.abs(area - 0.06) < 1e-9, `area=${area}`)
  const degNew = (a) => a < 0.04            // 修正后
  const degOld = (a) => a / 2 < 0.04        // 旧（双除 2）
  ck('#55 修正后 0.06mm² 唔算退化', degNew(area) === false, `deg=${degNew(area)}`)
  ck('#55 旧逻辑误判 0.06mm² 退化', degOld(area) === true, `deg=${degOld(area)}`)
  const tiny = Math.abs(polyArea2([[0, 0], [0.2, 0], [0, 0.2]]))   // 0.02 mm²
  ck('#55 真·细轮廓 0.02mm² 仍算退化', degNew(tiny) === true, `area=${tiny} deg=${degNew(tiny)}`)
}

// ── #56 倒角收窄 minT（邻边短 → 状态诚实报实际最小 t，非用户输入 d）──
// chamferShape: t = min(d, l1·0.45, l2·0.45)；10mm 边长方 + C8 → 每角 t=min(8,4.5,4.5)=4.5。
{
  const clampT = (d, l1, l2) => Math.min(d, l1 * 0.45, l2 * 0.45)
  const t = clampT(8, 10, 10)
  ck('#56 10mm 方 C8 实际收窄至 4.5', Math.abs(t - 4.5) < 1e-9, `t=${t}`)
  ck('#56 收窄触发诚实提示 (minT<d)', t < 8 - 1e-6, `minT=${t} d=8`)
  const tFit = clampT(3, 10, 10)   // C3 喺 10mm 边内 → 唔收窄
  ck('#56 C3 喺长边内唔收窄', Math.abs(tFit - 3) < 1e-9 && !(tFit < 3 - 1e-6), `t=${tFit}`)
}

// ── 总表 ──
console.log('\n========== #50–#96 LOW backlog 纯数学回归 ==========')
for (const [st, name, detail] of rows) console.log(`  ${st}  ${name}${detail ? '  — ' + detail : ''}`)
console.log('====================================================')
console.log(fail === 0 ? `全部 ${pass} 项通过` : `${fail} 项失败 / ${pass} 项通过`)
process.exit(fail === 0 ? 0 : 1)
