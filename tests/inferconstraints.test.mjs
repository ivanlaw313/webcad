// inferconstraints.test.mjs — 解析式单测（run: npx -y tsx tests/inferconstraints.test.mjs）
//
// 验证 src/cad/inferConstraints.ts 嘅画即约束推断：H/V、coincident、parallel、perpendicular、
// tangent、equal，连同负样本（保守 —— 唔够强嘅唔好乱出）。全部数值都系手算可核对嘅解析值。
//
// 纯 ESM，经 tsx 直接 import TS 源（同 repo 其余 *.test.mjs 一致）。PASS/FAIL + N/N 汇总，
// 有任何 FAIL 即 exit 1。

import { inferConstraints } from '../src/cad/inferConstraints.ts'

let pass = 0, fail = 0
const ok = (cond, msg) => { if (cond) { pass++; console.log(`  PASS  ${msg}`) } else { fail++; console.log(`  FAIL  ${msg}`) } }

// 帮手：推断结果有冇某 type（可选 refs 包含某标识）。
const types = (cons) => cons.map((c) => c.type)
const has = (cons, type) => cons.some((c) => c.type === type)
const hasRef = (cons, type, ref) => cons.some((c) => c.type === type && c.refs.includes(ref))

const deg = (d) => d * Math.PI / 180
// 由原点出发、长 L、方向 angleDeg 嘅线段端点 b（a 喺 origin）。
const lineAt = (angleDeg, L = 10, ax = 0, ay = 0) => ({
  kind: 'line', a: [ax, ay], b: [ax + L * Math.cos(deg(angleDeg)), ay + L * Math.sin(deg(angleDeg))],
})

console.log('inferConstraints — analytic tests\n')

// ── 1. 水平：0.5° 线 → horizontal（且唔系 vertical）──
{
  const c = inferConstraints(lineAt(0.5))
  ok(has(c, 'horizontal'), '0.5° line → horizontal')
  ok(!has(c, 'vertical'), '0.5° line → NOT vertical')
}

// ── 2. 竖直：89.5° 线 → vertical（且唔系 horizontal）──
{
  const c = inferConstraints(lineAt(89.5))
  ok(has(c, 'vertical'), '89.5° line → vertical')
  ok(!has(c, 'horizontal'), '89.5° line → NOT horizontal')
}

// ── 3. 负样本：20° 线 → 唔系 horizontal 亦唔系 vertical ──
{
  const c = inferConstraints(lineAt(20))
  ok(!has(c, 'horizontal') && !has(c, 'vertical'), '20° line → NOT horizontal/vertical')
}

// ── 4. coincident：self 端点 (10.0,0) 距既有点 (10.1,0) = 0.1 < posTol(1.5) → 重合 ──
{
  const seg = { kind: 'line', a: [0, 0], b: [10.0, 0] }
  const existing = [{ id: 'P1', kind: 'point', p: [10.1, 0] }]
  const c = inferConstraints(seg, existing)
  ok(hasRef(c, 'coincident', 'P1:p'), 'endpoint (10.0,0) near point (10.1,0) → coincident(P1)')
  ok(hasRef(c, 'coincident', 'self:b'), 'coincident refs the self endpoint b')
}

// ── 5. 负样本：远端点 (10.0,0) vs 既有点 (20,0) 距 10 > posTol → 唔重合 ──
{
  const seg = { kind: 'line', a: [0, 0], b: [10.0, 0] }
  const existing = [{ id: 'P2', kind: 'point', p: [20, 0] }]
  const c = inferConstraints(seg, existing)
  ok(!has(c, 'coincident'), 'far endpoint → NOT coincident')
}

// ── 6. parallel：self 30° 线 ∥ 既有 30° 线 → parallel ──
{
  const seg = lineAt(30, 10, 5, 5)                          // 30°，平移开（方向先决）
  const existing = [{ id: 'L30', ...lineAt(30, 8, -20, -20) }]
  const c = inferConstraints(seg, existing)
  ok(hasRef(c, 'parallel', 'L30'), '30° line parallel to existing 30° line → parallel(L30)')
  ok(!has(c, 'perpendicular'), '30°∥30° → NOT perpendicular')
}

// ── 7. perpendicular：self 120° 线 ⊥ 既有 30° 线 → perpendicular ──
{
  const seg = lineAt(120, 10, 5, 5)                         // 120° = 30°+90°
  const existing = [{ id: 'L30', ...lineAt(30, 8, -20, -20) }]
  const c = inferConstraints(seg, existing)
  ok(hasRef(c, 'perpendicular', 'L30'), '120° line perpendicular to 30° line → perpendicular(L30)')
  ok(!has(c, 'parallel'), '120°⊥30° → NOT parallel')
}

// ── 8. equal：新圆 r=5.05 vs 既有 r=5（差 0.05 < posTol） → equal ──
{
  const seg = { kind: 'circle', c: [0, 0], r: 5.05 }
  const existing = [{ id: 'C1', kind: 'circle', c: [100, 100], r: 5 }]   // 圆心远，唔重合
  const c = inferConstraints(seg, existing)
  ok(hasRef(c, 'equal', 'C1'), 'circle r=5.05 near existing r=5 → equal(C1)')
}

// ── 9. 负样本：新圆 r=8 vs 既有 r=5（差 3 > posTol） → 唔 equal ──
{
  const seg = { kind: 'circle', c: [0, 0], r: 8 }
  const existing = [{ id: 'C2', kind: 'circle', c: [100, 100], r: 5 }]
  const c = inferConstraints(seg, existing)
  ok(!has(c, 'equal'), 'circle r=8 vs r=5 → NOT equal')
}

// ── 10. tangent：圆心 (0,0) r=5；线沿 x=5 竖直（端点 (5,-3)→(5,7)），端点 (5,7) 落圆周
//        外？验真正相切：取一条线，其一端正落喺圆周上且方向⊥半径。
//   构造：圆心(0,0) r=5。端点 T=(5,0) 喺圆周上（半径沿 +x）。线过 T 且竖直（方向 90°，
//   半径方向 0°，夹角 90° ⊥）→ 相切。线 = (5,-4)→(5,6)，含端点 (5,-4)？唔系，要端点贴圆。
//   用线 (5,0)→(5,10)：端点 a=(5,0) 喺圆周、方向竖直 ⊥ 半径 → tangent。
{
  const seg = { kind: 'line', a: [5, 0], b: [5, 10] }       // 端点 (5,0) 喺圆周；线竖直
  const existing = [{ id: 'Cc', kind: 'circle', c: [0, 0], r: 5 }]
  const c = inferConstraints(seg, existing)
  ok(hasRef(c, 'tangent', 'Cc'), 'line endpoint on circle ⊥ radius → tangent(Cc)')
}

// ── 11. 负样本：割线穿过圆（端点都唔贴圆周） → 唔 tangent ──
{
  const seg = { kind: 'line', a: [-20, 1], b: [20, 1] }     // 横穿圆 r=5、唔贴圆周
  const existing = [{ id: 'Cs', kind: 'circle', c: [0, 0], r: 5 }]
  const c = inferConstraints(seg, existing)
  ok(!has(c, 'tangent'), 'secant through circle (endpoints not on rim) → NOT tangent')
}

// ── 12. 综合 + 空输入健壮性：冇既有时只得自身方向类；退化（零长线）唔崩 ──
{
  const c = inferConstraints(lineAt(0.5), [])
  ok(JSON.stringify(types(c)) === JSON.stringify(['horizontal']), 'no existing → only self-direction (horizontal)')
  const z = inferConstraints({ kind: 'line', a: [3, 3], b: [3, 3] }, [])  // 零长
  ok(Array.isArray(z) && z.length === 0, 'degenerate zero-length line → [] (no crash)')
}

// ── 汇总 ──
const total = pass + fail
console.log(`\n${pass}/${total} passed${fail ? `  (${fail} FAILED)` : ''}`)
if (fail) process.exit(1)
