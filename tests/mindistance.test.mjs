// mindistance.test.mjs — 两个三角网格【最小间隙 / 净空 clearance】（src/cad/minDistance.ts）解析验证
//
// 对标 Fusion「检查 Inspect → 测量 Measure 间隙 / 干涉 gap」：两堆三角汤之间的最短欧氏距离 + 最近点对。
// 全部断言【解析闭式值】（已知几何分离 → 已知间隙），非回归快照 —— 数学错就 FAIL。
//
// 跑法（喺 C:\ClaudeCode\webcad 目录执行）：
//   npx -y tsx tests/mindistance.test.mjs
// 全部通过 → exit 0；任一失败 → exit 1。

import { minDistanceMeshMesh } from '../src/cad/minDistance.ts';

// ------------------------------------------------------------------ 小框架（仿 sectionprops.test.mjs）
const rows = [];
function test(name, fn) {
  const t0 = Date.now();
  try {
    const detail = fn() ?? '';
    rows.push({ name, pass: true, ms: Date.now() - t0, detail });
    console.log(`PASS ${name} (${Date.now() - t0}ms) ${detail}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    rows.push({ name, pass: false, ms: Date.now() - t0, detail: msg });
    console.log(`FAIL ${name} (${Date.now() - t0}ms) ${msg}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function near(a, b, tol, what) {
  assert(Math.abs(a - b) <= tol, `${what}: 期望 ${b}，实得 ${a}（差 ${(a - b).toExponential(2)}，容差 ${tol}）`);
}
function fmt(x, d = 4) { return Number(x).toFixed(d); }

// ------------------------------------------------------------------ 几何构造：轴对齐立方体三角网格
// 给最小角 (ox,oy,oz) 与边长 sx,sy,sz，返回 { v, t }：8 顶点、12 三角（6 面 × 2）。
function box(ox, oy, oz, sx, sy, sz) {
  const x0 = ox, x1 = ox + sx, y0 = oy, y1 = oy + sy, z0 = oz, z1 = oz + sz;
  const v = [
    x0, y0, z0,  // 0
    x1, y0, z0,  // 1
    x1, y1, z0,  // 2
    x0, y1, z0,  // 3
    x0, y0, z1,  // 4
    x1, y0, z1,  // 5
    x1, y1, z1,  // 6
    x0, y1, z1,  // 7
  ];
  // 12 三角（绕向不影响距离计算；这里随便给一致外向）
  const t = [
    0, 2, 1, 0, 3, 2,   // -z 面
    4, 5, 6, 4, 6, 7,   // +z 面
    0, 1, 5, 0, 5, 4,   // -y 面
    3, 7, 6, 3, 6, 2,   // +y 面
    0, 4, 7, 0, 7, 3,   // -x 面
    1, 2, 6, 1, 6, 5,   // +x 面
  ];
  return { v, t };
}

function cube(ox, oy, oz, s) { return box(ox, oy, oz, s, s, s); }

const TOL = 1e-9;   // 平面-平面 / 点-面 间隙是闭式 → 仅浮点级误差

// ------------------------------------------------------------------ T1 两单位立方体沿 X 隔 5mm → dist=5，最近点在相对面
// A = [0,1]³；B 沿 +X 平移使 A 的 +x 面 (x=1) 与 B 的 -x 面之间隔 5。
// B 最小角放 x=6 → B 占 [6,7]，A 的 x=1 面与 B 的 x=6 面间隙 = 6−1 = 5。最近点：pA 在 x=1，pB 在 x=6，
// 且二者 y,z 同值（面-面平行最近为公共重叠区，y∈[0,1]、z∈[0,1] 内任一对都成立）。
test('T1 两单位立方体沿 X 隔 5mm → dist=5，pA.x=1 / pB.x=6', () => {
  const A = cube(0, 0, 0, 1);
  const B = cube(6, 0, 0, 1);   // 间隙 = 6 − 1 = 5
  const r = minDistanceMeshMesh(A.v, A.t, B.v, B.t);
  near(r.dist, 5, TOL, 'dist');
  near(r.pA[0], 1, 1e-9, 'pA 在 A 的 +x 面 x=1');
  near(r.pB[0], 6, 1e-9, 'pB 在 B 的 −x 面 x=6');
  // 面-面平行：最近点 y,z 应一致（同一条法向连线两端），且落在重叠区 [0,1]
  near(r.pA[1], r.pB[1], 1e-9, '最近连线沿 X：pA.y=pB.y');
  near(r.pA[2], r.pB[2], 1e-9, '最近连线沿 X：pA.z=pB.z');
  assert(r.pA[1] >= -1e-9 && r.pA[1] <= 1 + 1e-9, 'pA.y 落在重叠区 [0,1]');
  assert(r.pA[2] >= -1e-9 && r.pA[2] <= 1 + 1e-9, 'pA.z 落在重叠区 [0,1]');
  return `dist=${fmt(r.dist)} pA=(${fmt(r.pA[0],2)},${fmt(r.pA[1],2)},${fmt(r.pA[2],2)}) pB=(${fmt(r.pB[0],2)},${fmt(r.pB[1],2)},${fmt(r.pB[2],2)})`;
});

// ------------------------------------------------------------------ T2 两立方体重叠（穿插）→ dist=0
// A=[0,2]³，B=[1,3]³ 在 [1,2]³ 区域内实心重叠 → 最小距离 0。
test('T2 两立方体重叠（穿插）→ dist=0', () => {
  const A = cube(0, 0, 0, 2);
  const B = cube(1, 1, 1, 2);   // 与 A 在 [1,2]³ 重叠
  const r = minDistanceMeshMesh(A.v, A.t, B.v, B.t);
  near(r.dist, 0, TOL, 'dist=0（实心穿插）');
  return `dist=${fmt(r.dist)}`;
});

// ------------------------------------------------------------------ T2b 两立方体面【相切】（共面贴合）→ dist=0
// A=[0,1]³，B=[1,2]³：A 的 x=1 面与 B 的 x=1 面完全贴合 → 间隙 0。
test('T2b 两立方体面相切（x=1 共面）→ dist=0', () => {
  const A = cube(0, 0, 0, 1);
  const B = cube(1, 0, 0, 1);   // 共面 x=1
  const r = minDistanceMeshMesh(A.v, A.t, B.v, B.t);
  near(r.dist, 0, 1e-9, 'dist=0（面相切）');
  return `dist=${fmt(r.dist)}`;
});

// ------------------------------------------------------------------ T3 立方体 vs 远点立方体（已知三维偏移）→ 精确角-角间隙
// A=[0,1]³。把 B 放在 A 的 +x+y+z 对角外侧：B 最小角 (4,5,6)，边长 1。A 最近角是 (1,1,1)，
// B 最近角是 (4,5,6)。两个轴对齐盒在三轴都正向分离 → 最小距离 = 角到角欧氏 =
//   √((4−1)²+(5−1)²+(6−1)²) = √(9+16+25) = √50 = 7.0710678...
// 最近点：pA=(1,1,1)（A 的 +++角），pB=(4,5,6)（B 的 −−−角）。
test('T3 立方体 vs 远点立方体（角-角偏移）→ dist=√50，pA=(1,1,1) pB=(4,5,6)', () => {
  const A = cube(0, 0, 0, 1);
  const B = cube(4, 5, 6, 1);
  const r = minDistanceMeshMesh(A.v, A.t, B.v, B.t);
  const expect = Math.sqrt(9 + 16 + 25);  // √50
  near(r.dist, expect, 1e-9, 'dist=√50');
  near(r.pA[0], 1, 1e-9, 'pA.x=1'); near(r.pA[1], 1, 1e-9, 'pA.y=1'); near(r.pA[2], 1, 1e-9, 'pA.z=1');
  near(r.pB[0], 4, 1e-9, 'pB.x=4'); near(r.pB[1], 5, 1e-9, 'pB.y=5'); near(r.pB[2], 6, 1e-9, 'pB.z=6');
  return `dist=${fmt(r.dist,6)} (=√50) pA=(${fmt(r.pA[0],1)},${fmt(r.pA[1],1)},${fmt(r.pA[2],1)}) pB=(${fmt(r.pB[0],1)},${fmt(r.pB[1],1)},${fmt(r.pB[2],1)})`;
});

// ------------------------------------------------------------------ T4 边-边斜交（edge-edge skew）→ 边到边最近距离
// 这是 triTri 必须靠【边-边】项（而非点-面）才能给对的情形。
// A：细长盒沿【X 轴】，跨 x∈[0,10]，截面 y∈[0,1]、z∈[0,1]。其【顶部边】(z=1,y=1) 是一条沿 X 的线段。
// B：细长盒沿【Y 轴】，跨 y∈[-5,5]，截面 x∈[4,5]、z∈[3,4]。其【底部边】(z=3, x 取最近端 x=4) 沿 Y。
// 取 A 的上边线 L_A: 点 (x, 1, 1)，x∈[0,10]，方向 (1,0,0)。
// 取 B 的下边线 L_B: 点 (4, y, 3)，y∈[-5,5]，方向 (0,1,0)。
// 两线为【斜交】(skew)：L_A 沿 x、L_B 沿 y。两线最近：L_A 在 x=4（落在 [0,10]）取 (4,1,1)；
// L_B 在 y=1（落在 [−5,5]）取 (4,1,3)。最近向量 = (0,0,2) → 距离 = 2（纯 Z 间隙）。
// 但要确认这真是【两实心盒】的全局最小：A 的上表面 z=1，B 的下表面 z=3，沿 Z 名义间隙 2；而 B 在 x∈[4,5]、
// A 在 x∈[0,10] → x 重叠；B 在 y∈[−5,5]、A 在 y∈[0,1] → y 重叠。故全局最小确为 z 向 2，由「A上边 ↔ B下边」
// （等价点-面）实现。为强制成【边-边主导】，下面 T4b 给一个 x,y 都偏移、Z 也偏移的真斜交。
test('T4 盒沿X vs 盒沿Y（Z 向分离）→ dist=2', () => {
  const A = box(0, 0, 0, 10, 1, 1);     // 沿 X 长条，顶面 z=1
  const B = box(4, -5, 3, 1, 10, 1);    // 沿 Y 长条，底面 z=3
  const r = minDistanceMeshMesh(A.v, A.t, B.v, B.t);
  near(r.dist, 2, 1e-9, 'dist=2（Z 向间隙）');
  near(r.pA[2], 1, 1e-9, 'pA 在 A 顶面 z=1');
  near(r.pB[2], 3, 1e-9, 'pB 在 B 底面 z=3');
  return `dist=${fmt(r.dist)} pA=(${fmt(r.pA[0],2)},${fmt(r.pA[1],2)},${fmt(r.pA[2],2)}) pB=(${fmt(r.pB[0],2)},${fmt(r.pB[1],2)},${fmt(r.pB[2],2)})`;
});

// ------------------------------------------------------------------ T4b 真·边-边斜交（X、Y、Z 同时偏移）→ 解析边-边距离
// 用两条【单段细杆】(用极薄盒近似一条线段) 摆成空间斜交，最近距离不在任何面法向，而是两条 skew 线的公垂线。
// 杆 A：一条沿 X 的线段 from (0,0,0) to (10,0,0)（用极薄盒 y,z 厚 0 → 退化为线；这里给 0 厚盒）。
// 杆 B：一条沿 Y 的线段 from (3, -5, 4) to (3, 5, 4)，方向 (0,1,0)。
// 两线公垂：L_A 在 x=3 取 (3,0,0)；L_B 在 y=0 取 (3,0,4)。最近向量 (0,0,4) → 距离 4。
// 为避免退化盒导致无三角，用「两个三角形」直接构造每根杆（一条线段做成一个零面积三角的两条重合边并不稳，
// 改用一个细三角带表达线段：A 三角 (0,0,0),(10,0,0),(0,0,0.0) 退化 → 不可。故用极薄但非零盒）。
// 这里用极薄盒（厚 1e-6）使其有有效三角，最近距离 ≈ 4（薄盒厚度引入的偏差 < 1e-6）。
test('T4b 斜交细杆（公垂线 Z 向）→ dist≈4', () => {
  const eps = 1e-6;
  const A = box(0, -eps / 2, -eps / 2, 10, eps, eps);    // 近似沿 X 线段，中心 y=z=0
  const B = box(3 - eps / 2, -5, 4 - eps / 2, eps, 10, eps);  // 近似沿 Y 线段，中心 x=3,z=4
  const r = minDistanceMeshMesh(A.v, A.t, B.v, B.t);
  near(r.dist, 4, 1e-4, 'dist≈4（两 skew 线公垂，薄盒偏差<1e-4）');
  near(r.pA[0], 3, 1e-4, 'pA.x≈3（公垂落点）');
  near(r.pB[2], 4, 1e-4, 'pB.z≈4');
  // 关键：这对最近点不在任一盒面法向的「点-面」上，而是两边的公垂 → 验证 edge-edge 项确实生效
  return `dist=${fmt(r.dist,5)} pA=(${fmt(r.pA[0],3)},${fmt(r.pA[1],3)},${fmt(r.pA[2],3)}) pB=(${fmt(r.pB[0],3)},${fmt(r.pB[1],3)},${fmt(r.pB[2],3)})`;
});

// ------------------------------------------------------------------ T5 对称性：交换 A/B → dist 不变，pA/pB 互换
test('T5 对称性：swap(A,B) → dist 不变', () => {
  const A = cube(0, 0, 0, 1);
  const B = cube(4, 5, 6, 1);
  const r1 = minDistanceMeshMesh(A.v, A.t, B.v, B.t);
  const r2 = minDistanceMeshMesh(B.v, B.t, A.v, A.t);
  near(r1.dist, r2.dist, 1e-9, 'dist 对称');
  // 交换后 pA/pB 角色互换
  near(r1.pA[0], r2.pB[0], 1e-9, 'pA↔pB.x'); near(r1.pB[0], r2.pA[0], 1e-9, 'pB↔pA.x');
  return `d(A,B)=${fmt(r1.dist,6)} == d(B,A)=${fmt(r2.dist,6)}`;
});

// ------------------------------------------------------------------ T6 剪枝正确性：远距离大网格仍给精确解析值
// 把两个立方体各细分（这里直接用更大的盒），确认 AABB 剪枝不改变结果。
// A=[0,1]³，B 沿 X 隔 100 → dist=100−... 用最小角 x=101 → 间隙 101−1 = 100。
test('T6 剪枝不影响正确性：远隔 100mm → dist=100', () => {
  const A = cube(0, 0, 0, 1);
  const B = cube(101, 0, 0, 1);
  const r = minDistanceMeshMesh(A.v, A.t, B.v, B.t);
  near(r.dist, 100, 1e-9, 'dist=100（剪枝后仍精确）');
  return `dist=${fmt(r.dist)}`;
});

// ------------------------------------------------------------------ 汇总
const failed = rows.filter((r) => !r.pass);
console.log(`\n${rows.length - failed.length}/${rows.length} passed`);
if (failed.length) {
  console.log('FAILED: ' + failed.map((r) => r.name).join(', '));
  process.exit(1);
}
process.exit(0);
