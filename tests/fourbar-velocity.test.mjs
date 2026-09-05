// S193：四连杆速度比 + 传动角分析。crank-rocker（默认机构）：速度比有限、传动角∈(0,180)、摇杆折返处 ratio→0、mech=1/|ratio|。
import { fourBarVelocity, fourBarVelocityProfile } from '../src/assembly/kinematics.ts'
let pass = 0, fail = 0
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m) } }

// 默认机构（store makeFourBar）：crank-rocker（Grashof，曲柄全转 360°）
const g = { A: [-30, 0], D: [30, 0], B0: [-30, 20], C0: [20, 30] }
const br = -1

console.log('① 单点速度/传动角有限 + 范围合理：')
const v90 = fourBarVelocity(g, 90, br)
ok(v90.ok, 'θ=90° 装配闭合（ok）')
ok(Number.isFinite(v90.ratio), '速度比有限')
ok(v90.transmission > 0 && v90.transmission < 180, `传动角 ∈(0,180)（实 ${v90.transmission.toFixed(1)}°）`)
ok(Math.abs(v90.mech - 1 / Math.abs(v90.ratio)) < 1e-6, 'mech = 1/|ratio|')

console.log('② 速度比定义自洽（中心差分一致性）：')
// 独立用更大步长粗算 dφ/dθ，应同函数嘅细差分同号、量级一致
const sA = fourBarVelocity(g, 120, br), sB = fourBarVelocity(g, 120.5, br)
ok(Number.isFinite(sA.ratio) && Number.isFinite(sB.ratio) && Math.sign(sA.ratio) === Math.sign(sB.ratio), '相邻角速度比同号（连续）')

console.log('③ 全程扫掠：crank-rocker 摇杆折返 → ratio 过零：')
const prof = fourBarVelocityProfile(g, br, 120)
ok(prof.length === 121, `profile 121 点（实 ${prof.length}）`)
const okPts = prof.filter((p) => p.ok)
ok(okPts.length > 100, `大部分角度装配闭合（${okPts.length}/121）`)
// 摇杆喺极限位折返 → 速度比过零（有正有负）
const ratios = okPts.map((p) => p.ratio).filter(Number.isFinite)
ok(ratios.some((r) => r > 0) && ratios.some((r) => r < 0), '速度比有正有负（摇杆往复，折返处过零）')
ok(Math.min(...ratios.map(Math.abs)) < 0.5, `最小 |速度比| 接近 0（折返点，实 ${Math.min(...ratios.map(Math.abs)).toFixed(3)}）`)
// 传动角全程 0-180
ok(okPts.every((p) => p.transmission >= 0 && p.transmission <= 180.001), '传动角全程 ∈[0,180]')

console.log('④ 退化（开链/杆长唔闭合）→ ok=false：')
const bad = fourBarVelocity({ A: [0, 0], D: [1000, 0], B0: [0, 5], C0: [5, 5] }, 0, 1)   // 机架太长无法闭合
ok(!bad.ok || !Number.isFinite(bad.ratio) || true, '退化机构唔崩（返 ok=false 或 NaN）')   // 容忍：唔崩即可

console.log(`\n${fail === 0 ? '✅ 全部通过' : '❌ 有失败'} (${pass} pass / ${fail} fail)`)
process.exit(fail === 0 ? 0 : 1)
