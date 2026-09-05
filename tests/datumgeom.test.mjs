// GM-3DV2 参考几何（V2）纯几何单测 — 直接 import src/cad/datumGeom.ts（tsx 跑 TS）。
// 跑法: npx -y tsx tests/datumgeom.test.mjs  （喺 C:\ClaudeCode\webcad）
// 覆盖：R5 两边交点 · R6 三面交点 · R7 边穿面 · R8 圆边取心 · R9 两边平面 · R10 垂直面。
import { nearestPointBetweenLines, threePlaneIntersection, edgePlaneIntersection, planeThroughTwoEdges, perpendicularPlane, circleCenterFromPolyline } from '../src/cad/datumGeom.ts'

let pass = 0, fail = 0
const ok = (n, c, info = '') => { if (c) { pass++; console.log('  ✓', n, info) } else { fail++; console.log('  ✗', n, info) } }
const near = (a, b, t = 1e-6) => Math.abs(a - b) <= t
const vnear = (a, b, t = 1e-6) => a && b && near(a[0], b[0], t) && near(a[1], b[1], t) && near(a[2], b[2], t)

console.log('GM-3DV2 datumGeom')

// ── R5 两边交点 ──
{
  // 两条相交直线：X 轴 (0,0,0)->(1,0,0) 与 Y 轴过 (2,0,0) 方向 (0,1,0) → 无交（异面? 其实共面 z=0，最近点唔重合）
  // 用真相交：line1 沿 X 过原点；line2 沿 Y 过 (3,0,0) → 交点 (3,0,0)
  const r = nearestPointBetweenLines([0, 0, 0], [1, 0, 0], [3, -5, 0], [0, 1, 0])
  ok('R5 相交两线 → 交点 (3,0,0)', vnear(r?.point, [3, 0, 0]) && near(r.dist, 0, 1e-9))
}
{
  // 异面线：line1 沿 X 过原点(z=0)；line2 沿 Y 过 (2,0,4)(z=4) → 最近点中点 (2,0,2)，dist=4
  const r = nearestPointBetweenLines([0, 0, 0], [3, 0, 0], [2, -7, 4], [0, 2, 0])
  ok('R5 异面两线 → 最近中点 (2,0,2), dist=4', vnear(r?.point, [2, 0, 2], 1e-9) && near(r.dist, 4, 1e-9))
}
{
  const r = nearestPointBetweenLines([0, 0, 0], [1, 0, 0], [0, 5, 0], [2, 0, 0])  // 平行
  ok('R5 平行两线 → null', r === null)
}

// ── R6 三面交点 ──
{
  // 三个坐标面平移：x=1, y=2, z=3 → 交点 (1,2,3)
  const r = threePlaneIntersection([
    { p: [1, 0, 0], n: [1, 0, 0] },
    { p: [0, 2, 0], n: [0, 1, 0] },
    { p: [0, 0, 3], n: [0, 0, 1] },
  ])
  ok('R6 三正交面 → (1,2,3)', vnear(r, [1, 2, 3]))
}
{
  // 斜面组合：仍应有唯一解。面A n=(1,1,0) 过(1,0,0)→x+y=1；面B z=5；面C n=(1,-1,0)过(0,0,0)→x−y=0 → x=y=0.5,z=5
  const r = threePlaneIntersection([
    { p: [1, 0, 0], n: [1, 1, 0] },
    { p: [0, 0, 5], n: [0, 0, 1] },
    { p: [0, 0, 0], n: [1, -1, 0] },
  ])
  ok('R6 斜面组 → (0.5,0.5,5)', vnear(r, [0.5, 0.5, 5], 1e-9))
}
{
  const r = threePlaneIntersection([  // 两面平行 → 无唯一解
    { p: [0, 0, 0], n: [0, 0, 1] },
    { p: [0, 0, 5], n: [0, 0, 1] },
    { p: [0, 0, 0], n: [1, 0, 0] },
  ])
  ok('R6 含平行面 → null', r === null)
}

// ── R7 边穿面 ──
{
  // 边由 (0,0,-2)→(0,0,6)（ed=弦向(0,0,8)）穿 z=0 面 → 交点 (0,0,0)，t=0.25
  const r = edgePlaneIntersection([0, 0, -2], [0, 0, 8], [0, 0, 0], [0, 0, 1])
  ok('R7 边穿 z=0 面 → (0,0,0), t=0.25', vnear(r?.point, [0, 0, 0], 1e-9) && near(r.t, 0.25, 1e-9))
}
{
  const r = edgePlaneIntersection([0, 0, 5], [1, 0, 0], [0, 0, 0], [0, 0, 1])  // 边平行 z=0 面
  ok('R7 边平行面 → null', r === null)
}

// ── R9 两边平面 ──
{
  // 两条不平行、共面(z=0)边 → 含两边平面法向 = ±z
  const r = planeThroughTwoEdges([0, 0, 0], [1, 0, 0], [0, 0, 0], [0, 1, 0])
  ok('R9 X/Y 边 → 法向 ±z', r && near(Math.abs(r.n[2]), 1, 1e-9) && near(r.n[0], 0, 1e-9) && near(r.n[1], 0, 1e-9))
  ok('R9 xd = 第一边方向 (1,0,0)', vnear(r?.xd, [1, 0, 0], 1e-9))
}
{
  // 两条平行边（都沿 X）分隔 y：法向应⊥两边、含连接向量 → ±z（连接 (0,3,0)，X×Y=z）
  const r = planeThroughTwoEdges([0, 0, 0], [1, 0, 0], [0, 3, 0], [2, 0, 0])
  ok('R9 平行边 → 用连接向量，法向 ±z', r && near(Math.abs(r.n[2]), 1, 1e-9))
}
{
  const r = planeThroughTwoEdges([0, 0, 0], [1, 0, 0], [5, 0, 0], [2, 0, 0])  // 共线
  ok('R9 共线两边 → null', r === null)
}

// ── R10 垂直面 ──
{
  // 面法向 = +z（水平面）；参考方向 = +x；过原点、距离 0 → 平面含 z 与 x → 法向 ±y
  const r = perpendicularPlane([0, 0, 1], [0, 0, 0], [1, 0, 0], 0)
  ok('R10 ⊥水平面、含 x → 法向 ±y', near(Math.abs(r.n[1]), 1, 1e-9) && near(r.n[0], 0, 1e-9) && near(r.n[2], 0, 1e-9))
  ok('R10 xd = 面法向 (0,0,1)（平面确含面法向 → ⊥所选面）', vnear(r.xd, [0, 0, 1], 1e-9))
  ok('R10 距离 0 → 过参考点', vnear(r.o, [0, 0, 0], 1e-9))
}
{
  // 距离偏移：法向 ±y，o 应沿 n 偏 3
  const r = perpendicularPlane([0, 0, 1], [0, 0, 0], [1, 0, 0], 3)
  ok('R10 距离 3 → o 沿法向偏移 |o.y|=3', near(Math.abs(r.o[1]), 3, 1e-9))
}

// ── R8 圆边取心 ──
const sampleCircle = (c, nrm, r, count, arcFrac = 1) => {
  // 生成平面内基
  const N = (a) => { const L = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / L, a[1] / L, a[2] / L] }
  const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
  const dt = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const n = N(nrm)
  const ref = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]
  const e1 = N([ref[0] - n[0] * dt(ref, n), ref[1] - n[1] * dt(ref, n), ref[2] - n[2] * dt(ref, n)])
  const e2 = cr(n, e1)
  const pts = []
  for (let i = 0; i <= count; i++) { const a = arcFrac * 2 * Math.PI * i / count; pts.push([c[0] + r * (e1[0] * Math.cos(a) + e2[0] * Math.sin(a)), c[1] + r * (e1[1] * Math.cos(a) + e2[1] * Math.sin(a)), c[2] + r * (e1[2] * Math.cos(a) + e2[2] * Math.sin(a))]) }
  return pts
}
{
  // 全圆，XY 平面，中心 (5,7,0)，R=12 → 恢复中心与半径
  const r = circleCenterFromPolyline(sampleCircle([5, 7, 0], [0, 0, 1], 12, 32))
  ok('R8 全圆(XY) → 中心 (5,7,0), R=12', vnear(r?.center, [5, 7, 0], 1e-6) && near(r.r, 12, 1e-6))
}
{
  // 倾斜圆，法向 (0,1,0)，中心 (0,3,9)，R=8 → Kasa 恢复中心（唔系形心）
  const r = circleCenterFromPolyline(sampleCircle([0, 3, 9], [0, 1, 0], 8, 40))
  ok('R8 倾斜圆(法向Y) → 中心 (0,3,9), R=8', vnear(r?.center, [0, 3, 9], 1e-5) && near(r.r, 8, 1e-5))
  ok('R8 法向 ∥ Y', r && near(Math.abs(r.normal[1]), 1, 1e-6))
}
{
  // 圆弧（半圆，arcFrac=0.5）：形心 ≠ 圆心，Kasa 仍恢复真心 (2,2,0), R=10
  const r = circleCenterFromPolyline(sampleCircle([2, 2, 0], [0, 0, 1], 10, 24, 0.5))
  ok('R8 半圆弧 → Kasa 恢复真心 (2,2,0), R=10（非形心）', vnear(r?.center, [2, 2, 0], 1e-4) && near(r.r, 10, 1e-4))
}
{
  ok('R8 点太少 → null', circleCenterFromPolyline([[0, 0, 0], [1, 1, 1]]) === null)
}

console.log(`\nGM-3DV2 datumGeom: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
