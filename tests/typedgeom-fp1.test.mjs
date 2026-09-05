// typedgeom-fp1.test.mjs — GM-FP1 (Fusion-parity W1) 纯几何单测
// 覆盖：#10 折线打字 长/角 锁定 (polylineTypedEndpoint) · #15 两点圆几何 (twoPointCircle)
// 跑法: npx -y tsx tests/typedgeom-fp1.test.mjs   (喺 C:\ClaudeCode\webcad)
// src/sketch/typedgeom.ts 零依赖 → 直接 import TS，无需 loader hook。失败 → exit 1。

import { polylineTypedEndpoint, twoPointCircle } from '../src/sketch/typedgeom.ts'

let pass = 0, fail = 0
const ok = (cond, msg) => { if (cond) { pass++; console.log(`  PASS  ${msg}`) } else { fail++; console.log(`  FAIL  ${msg}`) } }
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e
const nearP = (p, q, e = 1e-6) => near(p[0], q[0], e) && near(p[1], q[1], e)
const D2R = Math.PI / 180

console.log('── #10 polylineTypedEndpoint（折线打字 长/角 锁定）──')

// 1. 无锁 → 终点 == 光标（方向+长度全跟光标）
{
  const p = polylineTypedEndpoint([1, 1], 0, [7, -2], '', '')
  ok(nearP(p, [7, -2]), `无锁 → 终点=光标 (${p})`)
}
// 2. 只锁长度 → 沿光标方向走锁定长度
{
  const p = polylineTypedEndpoint([0, 0], 0, [3, 4], '30', '')   // 光标方向 (3,4)/5，长 30 → (18,24)
  ok(nearP(p, [18, 24], 1e-6), `锁长 30，方向跟光标 (3,4) → (18,24) 实=(${p})`)
}
// 3. 只锁角度（无上段=绝对 +X）→ 方向锁 90°，长度=光标投影
{
  const p = polylineTypedEndpoint([0, 0], 0, [5, 5], '', '90')   // dir=+Y，投影=5 → (0,5)
  ok(nearP(p, [0, 5], 1e-6), `锁角 90°(绝对) 长跟投影 → (0,5) 实=(${p})`)
}
// 4. 只锁角度，光标喺锁定方向背面 → 投影 clamp 到 0（唔倒退）
{
  const p = polylineTypedEndpoint([0, 0], 0, [0, -4], '', '90')  // dir=+Y，光标在 −Y → 投影 −4 → clamp 0
  ok(nearP(p, [0, 0], 1e-6), `锁角 90° 但光标背向 → 长 clamp 0 → 原地 (${p})`)
}
// 5. 长+角全锁（无上段）→ 完全确定（30mm @45°）
{
  const p = polylineTypedEndpoint([0, 0], null, [999, -999], '30', '45')
  ok(nearP(p, [30 * Math.cos(45 * D2R), 30 * Math.sin(45 * D2R)], 1e-6), `全锁 30@45° 无视光标 → (${p[0].toFixed(3)},${p[1].toFixed(3)})`)
}
// 6. 角度系【相对上一段方向】：上段指 +Y (prevDir=π/2)，打角 90° → 绝对方向 π（−X）
{
  const p = polylineTypedEndpoint([1, 1], Math.PI / 2, [0, 0], '10', '90')
  ok(nearP(p, [1 - 10, 1], 1e-6), `角相对上段(+Y)+90° → 绝对 −X，长 10 → (−9,1) 实=(${p})`)
}
// 7. prevDir=0 打角 90° → 绝对 +Y（相对=绝对 当上段水平）
{
  const p = polylineTypedEndpoint([2, 2], 0, [50, 3], '5', '90')
  ok(nearP(p, [2, 7], 1e-6), `角相对上段(+X)+90° → +Y，长 5 → (2,7) 实=(${p})`)
}
// 8. 空字符串 / 非数字 唔当锁定（回落跟光标）
{
  const p = polylineTypedEndpoint([0, 0], 0, [4, 0], 'abc', '')   // len 非数字 → 跟光标长 4
  ok(nearP(p, [4, 0], 1e-6), `非数字长度 → 唔锁，跟光标 (${p})`)
}

console.log('── #15 twoPointCircle（两点圆 = 直径两端）──')
{
  const c = twoPointCircle([0, 0], [10, 0]); ok(nearP(c.c, [5, 0]) && near(c.r, 5), `[0,0]-[10,0] → 心(5,0) r5 实=心(${c.c}) r${c.r}`)
}
{
  const c = twoPointCircle([0, 0], [6, 8]); ok(nearP(c.c, [3, 4]) && near(c.r, 5), `[0,0]-[6,8] → 心(3,4) r5 实=心(${c.c}) r${c.r}`)
}
{
  const c = twoPointCircle([-4, 2], [4, 2]); ok(nearP(c.c, [0, 2]) && near(c.r, 4), `[-4,2]-[4,2] → 心(0,2) r4`)
}
{
  const c = twoPointCircle([2, 2], [2, 2]); ok(nearP(c.c, [2, 2]) && near(c.r, 0), `退化：两点重合 → r0（唔崩）`)
}

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass}/${pass + fail} 通过`)
process.exit(fail === 0 ? 0 : 1)
