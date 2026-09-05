// 配合残差 mateResidual 验证。跑法：npx tsx tests/mate-residual.test.mjs
import { mateResidual } from '../src/assembly/faceMate.ts'
let pass = 0, fail = 0
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m) } }
const near = (a, b, t, m) => ok(Math.abs(a - b) <= t, `${m}: 期望 ${b}±${t}, 实际 ${a}`)

// ① 良态平面配合：A 法向 +Z @ z=0，B 法向 −Z @ z=0（相对、点重合）→ 残差≈0
const A = { kind: 'planar', n: [0, 0, 1], p: [0, 0, 0] }
const Bok = { kind: 'planar', n: [0, 0, -1], p: [5, 5, 0] }   // 点喺 A 平面上（z=0）、法向相对
let r = mateResidual(A, Bok, { flip: false, gap: 0 })
near(r.dist, 0, 1e-6, '良态平面配合 dist≈0')
near(r.angle, 0, 1e-6, '良态平面配合 angle≈0')

// ② 错位平面（B 离 A 平面 3mm）→ dist=3
const Bgap = { kind: 'planar', n: [0, 0, -1], p: [0, 0, 3] }
r = mateResidual(A, Bgap, { flip: false, gap: 0 })
near(r.dist, 3, 1e-6, '离面 3mm → dist=3')

// ③ gap=3 时 B 离面 3mm 系满足 → dist≈0
r = mateResidual(A, Bgap, { flip: false, gap: 3 })
near(r.dist, 0, 1e-6, 'gap=3 + 离面 3 → dist≈0')

// ④ 角度错位（B 法向偏 30°）→ angle≈30
const Btilt = { kind: 'planar', n: [Math.sin(Math.PI / 6), 0, -Math.cos(Math.PI / 6)], p: [0, 0, 0] }
r = mateResidual(A, Btilt, { flip: false, gap: 0 })
near(r.angle, 30, 1e-4, '法向偏 30° → angle≈30')

// ⑤ 圆柱同轴良态：两轴 +X，B 点喺 A 轴线上 → dist≈0
const CA = { kind: 'cyl', axis: [1, 0, 0], p: [0, 0, 0], r: 5 }
const CBok = { kind: 'cyl', axis: [1, 0, 0], p: [10, 0, 0], r: 5 }   // 沿 A 轴 → ⊥ 距离 0
r = mateResidual(CA, CBok, { flip: false })
near(r.dist, 0, 1e-6, '同轴圆柱 ⊥ dist≈0')
// 偏轴 2mm（B 点 y=2）→ ⊥ dist=2
const CBoff = { kind: 'cyl', axis: [1, 0, 0], p: [10, 2, 0], r: 5 }
r = mateResidual(CA, CBoff, { flip: false })
near(r.dist, 2, 1e-6, '偏轴 2mm → ⊥ dist=2')

console.log(`\n${fail === 0 ? '✅ 全部通过' : '❌ 有失败'} (${pass} pass / ${fail} fail)`)
process.exit(fail === 0 ? 0 : 1)
