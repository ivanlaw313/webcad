// S193：曲率半径 —— 圆弧曲率半径=弧半径 R（恒定）；conic 肩点 osculating 半径（数值）。
import { bulgeShoulderCurvature, conicShoulderCurvature } from '../src/cad/conic2d.ts'
let pass = 0, fail = 0
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m) } }
const near = (a, b, e = 1e-3) => Math.abs(a - b) < e

console.log('① bulge 圆弧曲率半径 = 弧半径 R：')
// 半圆 [0,0]→[2,0] bulge=1：θ=4·atan1=π、弦=2 → R=2·(1+1)/(4·1)=1
ok(near(bulgeShoulderCurvature([0, 0], [2, 0], 1), 1), '半圆 bulge=1 → R=1')
// 四分一圆 [0,0]→[1,1] bulge=tan(22.5°)=0.41421：弦=√2 → R=1
ok(near(bulgeShoulderCurvature([0, 0], [1, 1], Math.tan(Math.PI / 8)), 1), '90°弧 → R=1')
// 直线（bulge≈0）→ ∞
ok(bulgeShoulderCurvature([0, 0], [2, 0], 0) === Infinity, '直线 → Infinity')
ok(bulgeShoulderCurvature([0, 0], [2, 0], 1e-12) === Infinity, '近零 bulge → Infinity')
// 退化弦 → 0
ok(bulgeShoulderCurvature([1, 1], [1, 1], 0.5) === 0, '零长弦 → 0')

console.log('② conic 肩点曲率半径（osculating）：')
// 抛物线 rho=0.5（w=1，退化为普通二次 Bézier）[0,0]→[4,0] apex[2,2]：
// 手算 t=0.5: B'=[4,0] |B'|=4, B''=[0,-8], cross=32 → ρ=4³/32=2
ok(near(conicShoulderCurvature([0, 0], [4, 0], [2, 2], 0.5), 2, 1e-2), '抛物线肩点 ρ=2.0（手算核对）')
// 半圆肩点：conic rho 高 → 更弯（半径细），应为有限正数
const rEll = conicShoulderCurvature([0, 0], [2, 0], [1, 1], 0.4142)   // ≈圆弧
ok(Number.isFinite(rEll) && rEll > 0, '椭圆/圆 conic 肩点 ρ 有限正数')
// 退化（apex 落弦上 = 直线）→ ∞
ok(conicShoulderCurvature([0, 0], [4, 0], [2, 0], 0.5) === Infinity, '退化直线 conic → Infinity')

console.log(`\n${fail === 0 ? '✅ 全部通过' : '❌ 有失败'} (${pass} pass / ${fail} fail)`)
process.exit(fail === 0 ? 0 : 1)
