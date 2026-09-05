// bspline2d.test.mjs — 纯 2D 立方 B 样条模块测试
// 跑法: npx -y tsx tests/bspline2d.test.mjs   (喺 C:\ClaudeCode\webcad 目录)
import { sampleBSpline } from '../src/cad/bspline2d.ts';

let nAssert = 0;
let nGroup = 0;

function group(name) {
  nGroup++;
  console.log(`\n## ${name}`);
}
function ok(cond, msg) {
  nAssert++;
  if (!cond) throw new Error(`断言失败: ${msg}`);
  console.log(`  ok ${msg}`);
}
function approx(actual, expected, msg, tol = 1e-6) {
  nAssert++;
  if (!(Math.abs(actual - expected) <= tol)) {
    throw new Error(`断言失败: ${msg} — 期望 ${expected}, 实际 ${actual} (tol ${tol})`);
  }
  console.log(`  ok ${msg} (${actual} ≈ ${expected})`);
}
function approxPt(actual, expected, msg, tol = 1e-6) {
  nAssert++;
  const d = Math.hypot(actual[0] - expected[0], actual[1] - expected[1]);
  if (d > tol) {
    throw new Error(`断言失败: ${msg} — 期望 (${expected}), 实际 (${actual}), 距 ${d}`);
  }
  console.log(`  ok ${msg} ((${actual[0].toFixed(6)},${actual[1].toFixed(6)}))`);
}

// ---- 几何小工具 (测试自带, 与被测模块独立) ----

// 点 P 到线段 [a,b] 嘅最短距离 (用于凸包内含检验: 折线即凸包边)
function distToSeg(P, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const L2 = vx * vx + vy * vy;
  if (L2 < 1e-18) return Math.hypot(P[0] - a[0], P[1] - a[1]);
  let t = ((P[0] - a[0]) * vx + (P[1] - a[1]) * vy) / L2;
  t = Math.max(0, Math.min(1, t));
  const cx = a[0] + t * vx, cy = a[1] + t * vy;
  return Math.hypot(P[0] - cx, P[1] - cy);
}

// 凸包 (Andrew monotone chain)
function convexHull(pts) {
  const P = pts.map((p) => [p[0], p[1]]).sort((u, v) => (u[0] - v[0]) || (u[1] - v[1]));
  if (P.length <= 2) return P;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of P) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

// 点是否落喺凸包内 (含边, 容差 tol)。hull 为 CCW 顶点环。
function insideHull(P, hull, tol = 1e-9) {
  const n = hull.length;
  if (n < 3) {
    // 退化 (共线/单点): 落喺最小包围段附近即可
    for (let i = 0; i < n; i++) {
      if (distToSeg(P, hull[i], hull[(i + 1) % n]) <= tol) return true;
    }
    return n === 1 && Math.hypot(P[0] - hull[0][0], P[1] - hull[0][1]) <= tol;
  }
  for (let i = 0; i < n; i++) {
    const a = hull[i], b = hull[(i + 1) % n];
    const cr = (b[0] - a[0]) * (P[1] - a[1]) - (b[1] - a[1]) * (P[0] - a[0]);
    if (cr < -tol) return false; // 落喺某条 CCW 边右侧 → 出界
  }
  return true;
}

// 中心差分切向量 (单位化), 用于 C1 连续 (切线方向) 检验
function unitTangent(pts, i) {
  const n = pts.length;
  const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
  const tx = b[0] - a[0], ty = b[1] - a[1];
  const L = Math.hypot(tx, ty);
  return L < 1e-15 ? [0, 0] : [tx / L, ty / L];
}

// ============ 1. degree-1 B 样条 == 控制多边形 (线性插值) ============
group('degree-1 = 控制多边形 (线性插值)');
{
  const ctrl = [
    [0, 0],
    [2, 1],
    [4, -1],
    [6, 3],
    [9, 0],
  ];
  // 每段取 1 个内部点足够验线性; 用 (n-1)*4+1 个采样点令每段都有中点落喺段上。
  const segs = ctrl.length - 1;
  const samples = segs * 4 + 1;
  const curve = sampleBSpline(ctrl, { degree: 1, samples });

  approxPt(curve[0], ctrl[0], 'degree-1 起点 = ctrl[0]');
  approxPt(curve[curve.length - 1], ctrl[ctrl.length - 1], 'degree-1 末点 = ctrl[last]');

  // 每个采样点都落喺某条控制边上 (线性插值 → 距至少一条边为 0)
  let maxOffEdge = 0;
  for (const P of curve) {
    let best = Infinity;
    for (let i = 0; i < segs; i++) best = Math.min(best, distToSeg(P, ctrl[i], ctrl[i + 1]));
    maxOffEdge = Math.max(maxOffEdge, best);
  }
  approx(maxOffEdge, 0, 'degree-1 所有采样点都落喺控制多边形边上', 1e-9);

  // 控制点本身应被精确命中 (samples 对齐 → s = k*4 落喺顶点)
  for (let k = 0; k < ctrl.length; k++) {
    approxPt(curve[k * 4], ctrl[k], `degree-1 第 ${k} 段端点命中 ctrl[${k}]`);
  }
}

// ============ 2. clamped 立方过首/末控制点 ============
group('clamped 立方过首/末控制点 + 端点切线');
{
  const ctrl = [
    [0, 0],
    [1, 4],
    [5, 5],
    [8, 1],
    [10, 4],
    [12, 0],
  ];
  const curve = sampleBSpline(ctrl, { degree: 3, closed: false, samples: 200 });
  approxPt(curve[0], ctrl[0], 'clamped cubic 过首控制点 ctrl[0]');
  approxPt(curve[curve.length - 1], ctrl[ctrl.length - 1], 'clamped cubic 过末控制点 ctrl[last]');

  // 端点切线沿首/末控制边方向 (clamped B 样条性质)。
  // 用极密采样令端点秒线 (secant) 逼近真切线 — 秒线与控制边嘅叉积随步长 →0。
  const dense = sampleBSpline(ctrl, { degree: 3, closed: false, samples: 20000 });
  const d0 = [dense[1][0] - dense[0][0], dense[1][1] - dense[0][1]];
  const e0 = [ctrl[1][0] - ctrl[0][0], ctrl[1][1] - ctrl[0][1]];
  const cross0 = d0[0] * e0[1] - d0[1] * e0[0];
  approx(cross0 / (Math.hypot(...d0) * Math.hypot(...e0)), 0, '起点切线 ∥ 首控制边', 1e-3);

  const L = dense.length;
  const dN = [dense[L - 1][0] - dense[L - 2][0], dense[L - 1][1] - dense[L - 2][1]];
  const eN = [ctrl[ctrl.length - 1][0] - ctrl[ctrl.length - 2][0], ctrl[ctrl.length - 1][1] - ctrl[ctrl.length - 2][1]];
  const crossN = dN[0] * eN[1] - dN[1] * eN[0];
  approx(crossN / (Math.hypot(...dN) * Math.hypot(...eN)), 0, '末点切线 ∥ 末控制边', 1e-3);

  // 中间控制点一般唔被命中 (逼近而非插值) — 抽 ctrl[2] 验证有正间距
  let minToC2 = Infinity;
  for (const P of curve) minToC2 = Math.min(minToC2, Math.hypot(P[0] - ctrl[2][0], P[1] - ctrl[2][1]));
  ok(minToC2 > 1e-3, '内部控制点 ctrl[2] 唔被插值命中 (B 样条逼近性, 间距 ' + minToC2.toFixed(4) + ')');
}

// ============ 3. 曲线落喺控制点凸包内 ============
group('凸包性: 采样点 ⊂ 控制点凸包');
{
  // (a) clamped 立方
  const ctrlA = [
    [0, 0],
    [0, 5],
    [4, 7],
    [8, 5],
    [8, 0],
    [4, -2],
  ];
  const hullA = convexHull(ctrlA);
  const curveA = sampleBSpline(ctrlA, { degree: 3, closed: false, samples: 300 });
  let outA = 0;
  for (const P of curveA) if (!insideHull(P, hullA, 1e-7)) outA++;
  ok(outA === 0, `clamped cubic 全部 ${curveA.length} 采样点落喺控制点凸包内`);

  // (b) periodic 闭合立方
  const ctrlB = [
    [0, 0],
    [4, 0],
    [5, 3],
    [2, 5],
    [-1, 3],
  ];
  const hullB = convexHull(ctrlB);
  const curveB = sampleBSpline(ctrlB, { degree: 3, closed: true, samples: 300 });
  let outB = 0;
  for (const P of curveB) if (!insideHull(P, hullB, 1e-7)) outB++;
  ok(outB === 0, `periodic cubic 全部 ${curveB.length} 采样点落喺控制点凸包内`);
}

// ============ 4. closed periodic 立方接缝 C2 连续 (无折角) ============
group('periodic 闭合: 接缝切线连续 (C2, 无折角)');
{
  // 唔对称控制环 (避免靠对称碰巧连续) — 真考验周期结点 + 控制点环绕
  const ctrl = [
    [0, 0],
    [5, -1],
    [7, 3],
    [4, 6],
    [-1, 5],
    [-3, 2],
  ];
  const samples = 600;
  const curve = sampleBSpline(ctrl, { degree: 3, closed: true, samples });

  // 闭合性: 末点应紧邻首点 (环, 尾不重复首; 用密采样 → 段长很短)
  const segLen = Math.hypot(curve[1][0] - curve[0][0], curve[1][1] - curve[0][1]);
  const seamGap = Math.hypot(curve[curve.length - 1][0] - curve[0][0], curve[curve.length - 1][1] - curve[0][1]);
  ok(seamGap < 2 * segLen + 1e-9, `接缝闭合: 末点紧邻首点 (gap ${seamGap.toFixed(5)} ≈ 一段长 ${segLen.toFixed(5)})`);

  // C1 (切线方向) 连续: 接缝处切向量 ≈ 邻近点切向量, 无方向跳变 (折角)
  // 比较接缝两侧切线: 用环绕中心差分。
  const tSeam = unitTangent(curve, 0);          // 跨接缝 (用 [last, 1])
  const tBefore = unitTangent(curve, curve.length - 1); // 接缝前
  const tAfter = unitTangent(curve, 1);          // 接缝后
  const dotBefore = tSeam[0] * tBefore[0] + tSeam[1] * tBefore[1];
  const dotAfter = tSeam[0] * tAfter[0] + tSeam[1] * tAfter[1];
  ok(dotBefore > 0.999, `接缝前切线方向连续 (cos=${dotBefore.toFixed(6)} ≈ 1, 无折角)`);
  ok(dotAfter > 0.999, `接缝后切线方向连续 (cos=${dotAfter.toFixed(6)} ≈ 1, 无折角)`);

  // C2 (曲率/二阶) 连续: 二阶差分向量跨接缝近乎相等 (立方周期 B 样条 = C2)
  function secondDiff(i) {
    const n = curve.length;
    const a = curve[(i - 1 + n) % n], b = curve[i], c = curve[(i + 1) % n];
    return [a[0] - 2 * b[0] + c[0], a[1] - 2 * b[1] + c[1]];
  }
  const s0 = secondDiff(0);                 // 接缝处二阶差分
  const sPrev = secondDiff(curve.length - 1);
  const sNext = secondDiff(1);
  // 接缝二阶差分应介于两侧之间 (光滑过渡, 无跳变)。用相对量度。
  const refMag = Math.max(Math.hypot(...sPrev), Math.hypot(...sNext), 1e-12);
  const jumpPrev = Math.hypot(s0[0] - sPrev[0], s0[1] - sPrev[1]) / refMag;
  const jumpNext = Math.hypot(s0[0] - sNext[0], s0[1] - sNext[1]) / refMag;
  ok(jumpPrev < 0.05, `接缝二阶差分相对前侧无跳变 (Δ=${(jumpPrev * 100).toFixed(2)}% < 5%)`);
  ok(jumpNext < 0.05, `接缝二阶差分相对后侧无跳变 (Δ=${(jumpNext * 100).toFixed(2)}% < 5%)`);

  // 对照: 用插值型若有折角, 二阶差分会喺接缝爆大 — 这里检验接缝二阶差分量级
  // 与典型内部二阶差分同量级 (无尖峰)。
  let maxInterior = 0;
  for (let i = 2; i < curve.length - 2; i++) maxInterior = Math.max(maxInterior, Math.hypot(...secondDiff(i)));
  ok(Math.hypot(...s0) <= maxInterior * 1.5 + 1e-12, `接缝二阶差分量级 ≤ 1.5× 内部最大 (无尖峰折角)`);
}

// ============ 5. 退化 / 边界守卫 ============
group('退化 / 边界守卫');
{
  ok(sampleBSpline([], {}).length === 0, '空控制点 → 空');
  const one = sampleBSpline([[3, 7]], { samples: 5 });
  ok(one.length === 5 && one.every((p) => p[0] === 3 && p[1] === 7), '单控制点 → 重复该点');
  // 控制点少于 degree+1 → 自动降阶, 仍过首末
  const two = sampleBSpline([[0, 0], [10, 4]], { degree: 3, samples: 20 });
  approxPt(two[0], [0, 0], '2 控制点 cubic 降阶过首点');
  approxPt(two[two.length - 1], [10, 4], '2 控制点 cubic 降阶过末点');
  // degree<1 → throw
  let threw = false;
  try { sampleBSpline([[0, 0], [1, 1]], { degree: 0 }); } catch { threw = true; }
  ok(threw, 'degree<1 抛错');
}

console.log(`\n=== 全部通过: ${nGroup} 组 / ${nAssert} 条断言 ===`);
