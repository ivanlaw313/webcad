// residual174.test.mjs — #174 残余小 gap 扫平：9 项落地嘅纯逻辑覆盖。
//
// 覆盖：
//   1. UCS buildUCS 生成 3 面 3 轴 1 点（正交单位基）
//   3. κmax/κmin 派生公式 principalFromHK（球/柱/鞍）+ principalCurvaturesHK 网格
//   4. 拔模逐三角 draftPerTriangleAngles（box ±90/0）+ 连续色阶
//   5. To-Object 目标 Z 提取 targetDepthAlongSketchNormal / isParallelTarget
//   7. 可达性射线遮挡判定 analyzeAccessibility（双板遮挡 / 单三角可达 / tooLarge 降级）
//   8. 样条插点/切向 insertFitPoint / endpointTangents / nearestCtrlSegment / deleteFitPoint
//   9. θ=x/R 柱面映射 wrapPointToCylinder（弧长守恒）
//
// 跑法（喺 C:\ClaudeCode\webcad）： npx -y tsx tests/residual174.test.mjs

import { buildUCS } from '../src/cad/ucsBuilder.ts';
import { principalFromHK, principalCurvaturesHK } from '../src/cad/curvatureAnalysis.ts';
import { draftPerTriangleAngles, draftAngleColor, analyzeDraftGradient } from '../src/cad/draftAnalysis.ts';
import { targetDepthAlongSketchNormal, sketchNormalAxis, isParallelTarget } from '../src/cad/toObjectPick.ts';
import { analyzeAccessibility } from '../src/cad/accessibilityAnalysis.ts';
import { insertFitPoint, deleteFitPoint, endpointTangents, nearestCtrlSegment, ctrlSegCount } from '../src/sketch/splineEdit.ts';
import { wrapPointToCylinder, projectCurveToCylinder } from '../src/cad/surfaceWrap.ts';

// ---------------------------------------------------------------- 小框架
const rows = [];
function test(name, fn) {
  const t0 = Date.now();
  try {
    const detail = fn() ?? '';
    rows.push({ name, pass: true });
    console.log(`PASS ${name} (${Date.now() - t0}ms) ${detail}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    rows.push({ name, pass: false });
    console.log(`FAIL ${name} (${Date.now() - t0}ms) ${msg}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function approx(a, b, eps = 1e-6) { return Math.abs(a - b) <= eps; }
function fmt(x, d = 4) { return Number(x).toFixed(d); }
function unit(v) { return approx(Math.hypot(...v), 1, 1e-9); }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

// box helper（同 draftanalysis.test.mjs：面顺序 z=0,z=sz,y=0,y=sy,x=0,x=sx）
function makeBox(sx, sy, sz) {
  const vertices = [];
  for (let b = 0; b < 8; b++) vertices.push((b & 1) ? sx : 0, (b & 2) ? sy : 0, (b & 4) ? sz : 0);
  const triangles = [
    0, 2, 3, 0, 3, 1, 4, 5, 7, 4, 7, 6, 0, 1, 5, 0, 5, 4,
    2, 6, 7, 2, 7, 3, 0, 4, 6, 0, 6, 2, 1, 3, 7, 1, 7, 5,
  ];
  return { vertices, triangles };
}

// 平面网格 n×n（z=0），畀 principalCurvaturesHK 内部顶点（平面 → κ=0）。
function makeFlatGrid(n, step = 1) {
  const vertices = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) vertices.push(i * step, j * step, 0);
  const triangles = [];
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    triangles.push(a, b, d, a, d, c);
  }
  return { vertices, triangles };
}

// ================================================================== 1. UCS
test('1 UCS：+Z 法向 → 3 面 3 轴 1 点，正交单位基', () => {
  const u = buildUCS([1, 2, 3], [0, 0, 1]);
  assert(u.planes.length === 3, `应 3 面，实得 ${u.planes.length}`);
  assert(u.axes.length === 3, `应 3 轴，实得 ${u.axes.length}`);
  assert(u.point.join(',') === '1,2,3', `点应 = origin，实得 ${u.point}`);
  // 正交单位基
  assert(unit(u.x) && unit(u.y) && unit(u.z), '基向量应单位长');
  assert(approx(dot(u.x, u.y), 0) && approx(dot(u.y, u.z), 0) && approx(dot(u.x, u.z), 0), '基应两两正交');
  // 右手：x×y = z
  const cx = u.x[1] * u.y[2] - u.x[2] * u.y[1], cy = u.x[2] * u.y[0] - u.x[0] * u.y[2], cz = u.x[0] * u.y[1] - u.x[1] * u.y[0];
  assert(approx(cx, u.z[0]) && approx(cy, u.z[1]) && approx(cz, u.z[2]), 'x×y 应 = z（右手）');
  // 平面法向 = 对应轴方向
  assert(approx(dot(u.planes[0].n, u.z), 1), 'plane0 法向应 = Z');
  assert(approx(dot(u.planes[1].n, u.y), 1), 'plane1 法向应 = Y');
  assert(approx(dot(u.planes[2].n, u.x), 1), 'plane2 法向应 = X');
  // 全部面/轴过原点
  for (const p of u.planes) assert(p.o.join(',') === '1,2,3', '面 origin 应 = UCS origin');
  for (const a of u.axes) assert(a.at.join(',') === '1,2,3', '轴 at 应 = UCS origin');
  return `3 面 3 轴 1 点，正交右手基`;
});

test('1b UCS：倾斜法向 [1,1,0] 仍正交单位', () => {
  const u = buildUCS([0, 0, 0], [1, 1, 0]);
  assert(unit(u.x) && unit(u.y) && unit(u.z), '倾斜法向：基应单位');
  assert(approx(dot(u.x, u.y), 0, 1e-9) && approx(dot(u.y, u.z), 0, 1e-9) && approx(dot(u.x, u.z), 0, 1e-9), '倾斜法向：基应正交');
  assert(approx(dot(u.z, [1 / Math.SQRT2, 1 / Math.SQRT2, 0]), 1, 1e-9), 'z 应 = 归一化法向');
  return `z=${u.z.map((v) => fmt(v, 3))}`;
});

// ================================================================== 3. κmax/κmin 派生公式
test('3 principalFromHK：球/柱/鞍 闭式正确', () => {
  const r = 4;
  // 球 r：H=1/r, K=1/r² → κmax=κmin=1/r
  let p = principalFromHK(1 / r, 1 / (r * r));
  assert(approx(p.kmax, 1 / r) && approx(p.kmin, 1 / r), `球：κ 应 ${fmt(1 / r)}，实得 ${fmt(p.kmax)}/${fmt(p.kmin)}`);
  // 柱 r：|H|=1/(2r), K=0 → κmax=1/r, κmin=0
  p = principalFromHK(1 / (2 * r), 0);
  assert(approx(p.kmax, 1 / r) && approx(p.kmin, 0), `柱：应 κmax=${fmt(1 / r)} κmin=0，实得 ${fmt(p.kmax)}/${fmt(p.kmin)}`);
  // 鞍：H=0, K=-1/r² → κmax=1/r, κmin=-1/r
  p = principalFromHK(0, -1 / (r * r));
  assert(approx(p.kmax, 1 / r) && approx(p.kmin, -1 / r), `鞍：应 ±${fmt(1 / r)}，实得 ${fmt(p.kmax)}/${fmt(p.kmin)}`);
  // κmax ≥ κmin 恒成立；κmax ≥ 0
  for (const [h, k] of [[0.3, 0.01], [0.1, -0.5], [2, 3]]) {
    const q = principalFromHK(h, k);
    assert(q.kmax >= q.kmin - 1e-12, `κmax≥κmin 破：${fmt(q.kmax)}<${fmt(q.kmin)}`);
    assert(q.kmax >= -1e-12, 'κmax 应 ≥0');
  }
  return `球/柱/鞍 全对`;
});

test('3b principalCurvaturesHK：平面网格 内部 κ≈0', () => {
  const g = makeFlatGrid(4);
  const pc = principalCurvaturesHK(g.vertices, g.triangles);
  assert(pc.kmax.length === g.vertices.length / 3, 'kmax 长度应 = 顶点数');
  assert(pc.interiorCount >= 1, `平面 4×4 应有内部顶点，实得 ${pc.interiorCount}`);
  for (let i = 0; i < pc.kmax.length; i++) {
    if (pc.boundary[i]) continue;
    assert(approx(pc.kmax[i], 0, 1e-6) && approx(pc.kmin[i], 0, 1e-6), `平面内部 κ 应 0，顶点 ${i} 得 ${fmt(pc.kmax[i])}/${fmt(pc.kmin[i])}`);
  }
  return `内部 ${pc.interiorCount} 顶点 κ≈0`;
});

// ================================================================== 4. 拔模逐三角
test('4 draftPerTriangleAngles：box +Z/−Z/侧面 = +90/−90/0', () => {
  const box = makeBox(10, 20, 30);
  const ang = draftPerTriangleAngles(box.vertices, box.triangles, [0, 0, 1]);
  assert(ang.length === 12, `box 应 12 三角，实得 ${ang.length}`);
  // tri 0,1 = z=0 底面(-Z) → -90；tri 2,3 = z=sz 顶(+Z) → +90；tri 4..11 侧面 → 0
  assert(approx(ang[0], -90) && approx(ang[1], -90), `底面应 -90，实得 ${fmt(ang[0])}/${fmt(ang[1])}`);
  assert(approx(ang[2], 90) && approx(ang[3], 90), `顶面应 +90，实得 ${fmt(ang[2])}/${fmt(ang[3])}`);
  for (let t = 4; t < 12; t++) assert(approx(ang[t], 0), `侧面 tri${t} 应 0，实得 ${fmt(ang[t])}`);
  return `12 三角 draft 逐三角正确`;
});

test('4b draftAngleColor：正拔模偏绿 / 倒扣偏红 / 垂直黄', () => {
  const pos = draftAngleColor(30), neg = draftAngleColor(-30), vert = draftAngleColor(0);
  assert(pos[1] > pos[0] && pos[1] > pos[2], `正拔模应偏绿(g 大)，得 ${pos.map((v) => fmt(v, 2))}`);
  assert(neg[0] > neg[1] && neg[0] > neg[2], `倒扣应偏红(r 大)，得 ${neg.map((v) => fmt(v, 2))}`);
  assert(approx(vert[0], 0.88) && approx(vert[1], 0.69), '垂直(0°)应黄');
  // 梯度 buffer：box → 36 顶点位置 + 36 色
  const grad = analyzeDraftGradient(makeBox(4, 4, 4).vertices, makeBox(4, 4, 4).triangles, [0, 0, 1]);
  assert(grad.positions.length === 12 * 9 && grad.colors.length === 12 * 9, '梯度 buffer 长度应 12×9');
  return `色阶方向正确 + 梯度 buffer ${grad.positions.length}`;
});

// ================================================================== 5. To-Object Z 提取
test('5 targetDepthAlongSketchNormal：XY→z / XZ→y / YZ→x', () => {
  assert(sketchNormalAxis('XY') === 2 && sketchNormalAxis('XZ') === 1 && sketchNormalAxis('YZ') === 0, '法向轴映射错');
  assert(targetDepthAlongSketchNormal('XY', [3, 5, 7]) === 7, 'XY 应取 z=7');
  assert(targetDepthAlongSketchNormal('XZ', [3, 5, 7]) === 5, 'XZ 应取 y=5');
  assert(targetDepthAlongSketchNormal('YZ', [3, 5, 7]) === 3, 'YZ 应取 x=3');
  // 平行判定
  assert(isParallelTarget('XY', [0, 0, 1]) && !isParallelTarget('XY', [1, 0, 0]), 'XY 平行判定错');
  assert(isParallelTarget('YZ', [1, 0, 0]) && !isParallelTarget('YZ', [0, 0, 1]), 'YZ 平行判定错');
  return `深度提取 + 平行判定正确`;
});

// ================================================================== 7. 可达性射线遮挡
test('7 analyzeAccessibility：双板 → 下板被挡(红)、上板可达(绿)', () => {
  // 下三角 z=0 朝 +Z（形心 ~(0.67,0.67,0)）；上三角 z=5 覆盖其上 → 挡下三角 +Z 射线。
  const vertices = [
    0, 0, 0, 2, 0, 0, 0, 2, 0,        // tri0 下 (+Z)
    -1, -1, 5, 4, -1, 5, -1, 4, 5,    // tri1 上 (+Z)
  ];
  const triangles = [0, 1, 2, 3, 4, 5];
  const rep = analyzeAccessibility(vertices, triangles, [0, 0, 1]);
  assert(!rep.tooLarge, '唔应 tooLarge');
  assert(rep.reachable[0] === 0, `下板应被挡(0)，实得 ${rep.reachable[0]}`);
  assert(rep.reachable[1] === 1, `上板应可达(1)，实得 ${rep.reachable[1]}`);
  assert(rep.nBlocked === 1, `应 1 挡，实得 ${rep.nBlocked}`);
  assert(rep.positions.length === 2 * 9 && rep.colors.length === 2 * 9, 'buffer 长度错');
  return `下板挡/上板通，nBlocked=1`;
});

test('7b analyzeAccessibility：单三角 → 可达；tooLarge 降级', () => {
  const v = [0, 0, 0, 2, 0, 0, 0, 2, 0], t = [0, 1, 2];
  const r = analyzeAccessibility(v, t, [0, 0, 1]);
  assert(r.reachable[0] === 1 && r.nBlocked === 0, '孤三角应可达');
  // maxTris=0 → tooLarge（1 三角 > 0）
  const big = analyzeAccessibility(v, t, [0, 0, 1], { maxTris: 0 });
  assert(big.tooLarge === true, 'maxTris=0 应触发 tooLarge 降级');
  // 零 pullDir → 全 0 挡（保守）
  const z = analyzeAccessibility(v, t, [0, 0, 0]);
  assert(z.nBlocked === 0 && !z.tooLarge, '零 pull 应无挡');
  return `孤三角可达 + tooLarge 降级`;
});

// ================================================================== 8. 样条插点/切向
test('8 splineEdit：insert 中点 / tangent 端切向 / nearestSeg / delete', () => {
  const ctrl = [[0, 0], [10, 0], [20, 0]];
  assert(ctrlSegCount(ctrl, true) === 2 && ctrlSegCount(ctrl, false) === 3, '段数错');
  // 段0 中点插入 → [0,0],[5,0],[10,0],[20,0]
  const ins = insertFitPoint(ctrl, 0, true);
  assert(ins.length === 4, `插点后应 4 点，实得 ${ins.length}`);
  assert(ins[1][0] === 5 && ins[1][1] === 0, `中点应 (5,0)，实得 ${ins[1]}`);
  assert(ctrl.length === 3, '不可改入参');
  // 端切向：start = norm(p0-p1)=(-1,0)，end = norm(pn-1 - pn-2)=(1,0)
  const tg = endpointTangents(ctrl);
  assert(approx(tg.start[0], -1) && approx(tg.start[1], 0), `首端切向应 (-1,0)，实得 ${tg.start}`);
  assert(approx(tg.end[0], 1) && approx(tg.end[1], 0), `尾端切向应 (1,0)，实得 ${tg.end}`);
  // 最近段：点 (5,3) 最近段 0
  const ns = nearestCtrlSegment(ctrl, [5, 3], true);
  assert(ns.seg === 0 && approx(ns.dist, 3), `最近段应 0 dist 3，实得 ${ns.seg}/${fmt(ns.dist)}`);
  const ns2 = nearestCtrlSegment(ctrl, [15, 1], true);
  assert(ns2.seg === 1, `点 (15,1) 最近段应 1，实得 ${ns2.seg}`);
  // 删点：删 idx1 → [0,0],[20,0]
  const del = deleteFitPoint(ctrl, 1);
  assert(del.length === 2 && del[1][0] === 20, '删点错');
  assert(deleteFitPoint([[0, 0], [1, 1]], 0).length === 2, '≤2 点应拒删');
  return `插/删/切向/最近段 全对`;
});

// ================================================================== 9. θ=x/R 柱面映射
test('9 wrapPointToCylinder：θ=x/R 弧长守恒（轴=+Y）', () => {
  const R = 10;
  // x=0 → θ=0 → (0,y,R)
  let p = wrapPointToCylinder(0, 3, R);
  assert(approx(p[0], 0) && approx(p[1], 3) && approx(p[2], R), `x=0 应 (0,3,${R})，实得 ${p.map((v) => fmt(v, 3))}`);
  // x=R·π/2 → θ=π/2 → (R,y,0)
  p = wrapPointToCylinder(R * Math.PI / 2, 0, R);
  assert(approx(p[0], R, 1e-9) && approx(p[2], 0, 1e-9), `x=Rπ/2 应 (R,0,0)，实得 ${p.map((v) => fmt(v, 3))}`);
  // 弧长守恒：|point radius| = R；周向弧长 = R·θ = x
  for (const x of [1, 3.3, 12, -7]) {
    const q = wrapPointToCylinder(x, 0, R);
    const rad = Math.hypot(q[0], q[2]);
    assert(approx(rad, R, 1e-9), `点应喺半径 ${R} 上，实得 ${fmt(rad)}`);
    const theta = Math.atan2(q[0], q[2]);   // = x/R
    assert(approx(theta * R, x, 1e-6), `弧长应守恒 =x=${x}，实得 ${fmt(theta * R)}`);
  }
  const curve = projectCurveToCylinder([[0, 0], [R * Math.PI, 0]], R);
  assert(curve.length === 2 && approx(curve[1][2], -R, 1e-9), `x=Rπ 应绕到 (0,0,-R)，实得 ${curve[1].map((v) => fmt(v, 3))}`);
  return `θ=x/R 弧长守恒`;
});

// ---------------------------------------------------------------- 汇总
const failed = rows.filter((r) => !r.pass);
console.log(`\n${rows.length - failed.length}/${rows.length} passed`);
if (failed.length) { console.log('FAILED: ' + failed.map((r) => r.name).join(', ')); process.exit(1); }
process.exit(0);
