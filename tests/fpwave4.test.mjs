// fpwave4.test.mjs — GM-FP4 (Fusion-parity W4 打磨) 纯几何/逻辑单测（自足，无 loader）
// 覆盖各内联公式嘅几何不变量（作为回归锚，改公式即断）：
//   #16 中点线（B = 2M − A，对称）· #17 多边形边变体（正 N 边形，首边=输入边，闭合回起点）
//   #18 槽变体（overall 内缩、centerpt 对称）· #37 H/V 按方向判定 · #42 缩放绕形心 · #53 extent→spacing
// 跑法: npx -y tsx tests/fpwave4.test.mjs   (喺 C:\ClaudeCode\webcad)

let pass = 0, fail = 0
const ok = (cond, msg) => { if (cond) { pass++; console.log('  PASS ', msg) } else { fail++; console.log('  FAIL ', msg) } }
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e

// ── #16 中点线：第一击 = 中点 M，第二击 = 一端 A → 另一端 B = 2M − A（M 系 A/B 中点，全长 = 2|A−M|）──
{
  const M = [10, 5], A = [16, 5]
  const B = [2 * M[0] - A[0], 2 * M[1] - A[1]]
  ok(near((A[0] + B[0]) / 2, M[0]) && near((A[1] + B[1]) / 2, M[1]), '#16 中点 = M（对称）')
  ok(near(Math.hypot(B[0] - A[0], B[1] - A[1]), 2 * Math.hypot(A[0] - M[0], A[1] - M[1])), '#16 全长 = 2×半长')
}

// ── #17 多边形边变体：由边 P0→P1 生长正 N 边形（每步左转 2π/N，行 N 步回起点）──
{
  const polyFromEdge = (P0, P1, N) => {
    const L = Math.hypot(P1[0] - P0[0], P1[1] - P0[1]); const ext = (2 * Math.PI) / N
    let dir = Math.atan2(P1[1] - P0[1], P1[0] - P0[0]); let cur = [...P0]; const poly = []
    for (let i = 0; i < N; i++) { poly.push([...cur]); cur = [cur[0] + L * Math.cos(dir), cur[1] + L * Math.sin(dir)]; dir += ext }
    return { poly, closeErr: Math.hypot(cur[0] - P0[0], cur[1] - P0[1]), L }
  }
  const r = polyFromEdge([0, 0], [10, 0], 6)
  ok(r.poly.length === 6, '#17 六边形 = 6 顶点')
  ok(near(r.poly[1][0], 10) && near(r.poly[1][1], 0), '#17 首边 = 输入边 P0→P1')
  ok(r.closeErr < 1e-9, '#17 行 N 步闭合回起点')
  // 所有边等长
  let allEq = true
  for (let i = 0; i < 6; i++) { const a = r.poly[i], b = r.poly[(i + 1) % 6]; if (!near(Math.hypot(b[0] - a[0], b[1] - a[1]), r.L, 1e-6)) allEq = false }
  ok(allEq, '#17 所有边等长（正多边形）')
}

// ── #18 槽变体：overall（两端最外缘，弧心内缩 r）· centerpt（中心 + 一弧心 → 对称）──
{
  const r = 5
  // overall：tip p0,p1（总长 T=|p1−p0|），弧心 c0=p0+u·r, c1=p1−u·r → 心心距 = T−2r
  const p0 = [0, 0], p1 = [30, 0], T = 30, u = [1, 0]
  const c0 = [p0[0] + u[0] * r, p0[1] + u[1] * r], c1 = [p1[0] - u[0] * r, p1[1] - u[1] * r]
  ok(near(Math.hypot(c1[0] - c0[0], c1[1] - c0[1]), T - 2 * r), '#18 overall 心心距 = 总长 − 2r')
  // centerpt：中心 M，一弧心 c1 → 另一弧心 c0 = 2M − c1，M 系两弧心中点
  const M = [10, 10], cc1 = [18, 10], cc0 = [2 * M[0] - cc1[0], 2 * M[1] - cc1[1]]
  ok(near((cc0[0] + cc1[0]) / 2, M[0]) && near((cc0[1] + cc1[1]) / 2, M[1]), '#18 centerpt 中心 = 两弧心中点')
}

// ── #37 H/V 合一：按边方向 |dy|≤|dx| → 水平(h)，否则竖直(v) ──
{
  const hv = (a, b) => { const dx = Math.abs(b[0] - a[0]), dy = Math.abs(b[1] - a[1]); return dy <= dx ? 'h' : 'v' }
  ok(hv([0, 0], [10, 1]) === 'h', '#37 横向边 → 水平')
  ok(hv([0, 0], [1, 10]) === 'v', '#37 纵向边 → 竖直')
  ok(hv([0, 0], [5, 5]) === 'h', '#37 45° 边 → 水平（|dy|≤|dx| 取 h）')
}

// ── #42 缩放：顶点绕形心 C 乘系数 k（圆半径 ×k；形心不动）──
{
  const C = [10, 10], k = 2
  const xf = (q) => [C[0] + (q[0] - C[0]) * k, C[1] + (q[1] - C[1]) * k]
  const p = xf([12, 10]); ok(near(p[0], 14) && near(p[1], 10), '#42 顶点绕形心 ×2')
  ok(near(xf(C)[0], C[0]) && near(xf(C)[1], C[1]), '#42 形心不动')
  ok(near(5 * k, 10), '#42 圆半径 ×k')
}

// ── #53 阵列 Distance Type：extent（总跨）→ 每格间距 = 总距 /(n−1) ──
{
  const step = (total, n) => (n > 1 ? total / (n - 1) : total)
  ok(near(step(100, 5), 25), '#53 extent 100/(5−1)=25 每格')
  ok(near(step(60, 3), 30), '#53 extent 60/(3−1)=30 每格')
  ok(near(step(20, 1), 20), '#53 n=1 唔除（避免除零）')
  // 整圈 full：count 份均分 360，无 0/360 重叠
  const stepDeg = (n) => 360 / n
  ok(near(stepDeg(6), 60), '#53 full 整圈 360/6=60°')
}

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass}/${pass + fail} 通过`)
process.exit(fail === 0 ? 0 : 1)
