// GM-3DV3 M1：Move/Copy 五模式解算核（solveMove）纯函数单测。
// 跑：npx -y tsx tests/movesolve.test.mjs（喺 C:\ClaudeCode\webcad）
import { solveMove, isNonZeroMove } from '../src/cad/moveSolve.ts'

let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m) } else { fail++; console.log('  ✗ ' + m) } }
const eq = (a, b) => Math.abs(a - b) < 1e-9

// ── Free：六自由度一齐（旧 move 行为逐字节） ──
{
  const s = solveMove({ moveType: 'free', dx: 20, dy: 5, dz: -3, rx: 10, ry: 0, rz: 45 })
  ok(eq(s.dx, 20) && eq(s.dy, 5) && eq(s.dz, -3) && eq(s.rx, 10) && eq(s.ry, 0) && eq(s.rz, 45), 'Free：dx/dy/dz + rx/ry/rz 全通')
}
// ── Translate：只平移，旋转清零 ──
{
  const s = solveMove({ moveType: 'translate', dx: 7, dy: 8, dz: 9, rx: 99, ry: 99, rz: 99 })
  ok(eq(s.dx, 7) && eq(s.dy, 8) && eq(s.dz, 9) && eq(s.rx, 0) && eq(s.ry, 0) && eq(s.rz, 0), 'Translate：只 dx/dy/dz，旋转分量归零')
}
// ── Rotate：单轴 + 角度 → 对应 rx/ry/rz，平移零 ──
{
  const sz = solveMove({ moveType: 'rotate', raxis: 'Z', angle: 30, dx: 99 })
  ok(eq(sz.rz, 30) && eq(sz.rx, 0) && eq(sz.ry, 0) && eq(sz.dx, 0) && eq(sz.dy, 0) && eq(sz.dz, 0), 'Rotate Z：rz=30，其余零（忽略 dx）')
  const sx = solveMove({ moveType: 'rotate', raxis: 'x', angle: -15 })
  ok(eq(sx.rx, -15) && eq(sx.ry, 0) && eq(sx.rz, 0), 'Rotate x（小写）：rx=−15')
  const sy = solveMove({ moveType: 'rotate', raxis: 'Y', angle: 90 })
  ok(eq(sy.ry, 90) && eq(sy.rx, 0) && eq(sy.rz, 0), 'Rotate Y：ry=90')
}
// ── Point-to-Point：平移 = P2 − P1 ──
{
  const s = solveMove({ moveType: 'ptp', p1x: 10, p1y: 20, p1z: 30, p2x: 15, p2y: 18, p2z: 33 })
  ok(eq(s.dx, 5) && eq(s.dy, -2) && eq(s.dz, 3) && eq(s.rx, 0) && eq(s.ry, 0) && eq(s.rz, 0), 'Point-to-Point：Δ = P2−P1 = (5,−2,3)，无旋转')
}
// ── Point-to-Position：把 P1 搬到目的坐标 P2（同数学） ──
{
  const s = solveMove({ moveType: 'ptpos', p1x: 5, p1y: 5, p1z: 5, p2x: 0, p2y: 0, p2z: 0 })
  ok(eq(s.dx, -5) && eq(s.dy, -5) && eq(s.dz, -5), 'Point-to-Position：把 (5,5,5) 搬到原点 → Δ=(−5,−5,−5)')
}
// ── 字符串输入容错（对话框 params 常系 string） ──
{
  const s = solveMove({ moveType: 'translate', dx: '12', dy: '', dz: 'abc' })
  ok(eq(s.dx, 12) && eq(s.dy, 0) && eq(s.dz, 0), '字符串/空/NaN 输入 → 安全解成 12/0/0')
}
// ── isNonZeroMove 守卫 ──
{
  ok(isNonZeroMove(solveMove({ moveType: 'translate', dx: 1 })) === true, 'isNonZeroMove：有位移 → true')
  ok(isNonZeroMove(solveMove({ moveType: 'translate', dx: 0, dy: 0, dz: 0 })) === false, 'isNonZeroMove：全零 → false（commit 拦零变换）')
  ok(isNonZeroMove(solveMove({ moveType: 'ptp', p1x: 3, p2x: 3, p1y: 4, p2y: 4, p1z: 5, p2z: 5 })) === false, 'isNonZeroMove：P1==P2 → false')
}
// ── 缺省 moveType = free ──
{
  const s = solveMove({ dx: 2, rz: 5 })
  ok(eq(s.dx, 2) && eq(s.rz, 5), '缺省 moveType → free（旧对话框行为）')
}

console.log(`\n${fail === 0 ? '✅' : '❌'} GM-3DV3 M1 moveSolve (${pass} pass / ${fail} fail)`)
if (fail > 0) process.exit(1)
