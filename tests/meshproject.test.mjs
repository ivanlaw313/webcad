// meshproject.test.mjs — 网格正交投影模块测试
// 跑法: npx -y tsx tests/meshproject.test.mjs   (喺 C:\ClaudeCode\webcad 目录)
import { projectMeshEdges, segsToSvgPath } from '../src/io/meshProject.ts';

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
function approx(actual, expected, msg, tol = 1e-9) {
  nAssert++;
  if (!(Math.abs(actual - expected) <= tol)) {
    throw new Error(`断言失败: ${msg} (实际 ${actual}, 期望 ${expected})`);
  }
  console.log(`  ok ${msg}`);
}
function approxBbox(bbox, expected, msg, tol = 1e-9) {
  for (let i = 0; i < 4; i++) {
    approx(bbox[i], expected[i], `${msg}[${i}]`, tol);
  }
}
/** segs 入面有冇一条（端点次序无关）匹配 (x1,y1)-(x2,y2) 嘅线段 */
function hasSeg(segs, x1, y1, x2, y2, tol = 1e-6) {
  const eq = (a, b) => Math.abs(a - b) <= tol;
  return segs.some(
    ([a, b, c, d]) =>
      (eq(a, x1) && eq(b, y1) && eq(c, x2) && eq(d, y2)) ||
      (eq(a, x2) && eq(b, y2) && eq(c, x1) && eq(d, y1)),
  );
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
// column-major 平移 x+100（three.js Matrix4.elements 同款：e[12]=tx）
const TRANSLATE_X100 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 100, 0, 0, 1];

// ── 立方体 20×30×40：x∈[−10,10], y∈[−15,15], z∈[0,40]（盒中心喺 xy 原点，z 0..40）──
const CUBE_VERTS = [
  -10, -15, 0,   // 0
   10, -15, 0,   // 1
   10,  15, 0,   // 2
  -10,  15, 0,   // 3
  -10, -15, 40,  // 4
   10, -15, 40,  // 5
   10,  15, 40,  // 6
  -10,  15, 40,  // 7
];
// 12 三角形，外向缠绕（CCW from outside）
const CUBE_TRIS = [
  0, 2, 1,  0, 3, 2,   // bottom z=0  (−Z)
  4, 5, 6,  4, 6, 7,   // top    z=40 (+Z)
  0, 1, 5,  0, 5, 4,   // y=−15 (−Y)
  2, 3, 7,  2, 7, 6,   // y=+15 (+Y)
  1, 2, 6,  1, 6, 5,   // x=+10 (+X)
  0, 4, 7,  0, 7, 3,   // x=−10 (−X)
];

// ════════════════════════════════════════════════════════════════
group('立方体 20×30×40 恒等矩阵 — front 视图 (x,z)');
{
  const { segs, bbox } = projectMeshEdges(CUBE_VERTS, CUBE_TRIS, IDENTITY, 'front');
  approxBbox(bbox, [-10, 0, 10, 40], 'front bbox');
  // 全部 12 条棱都系 90° 特征边 → 12 条投影段（含 y 向棱投影成点，可能共线重叠）
  ok(segs.length >= 12, `front segs 数 >= 12 (实际 ${segs.length})`);
  // 4 条外框边
  ok(hasSeg(segs, -10, 0, -10, 40), '外框左边 x=−10, z 0..40');
  ok(hasSeg(segs, 10, 0, 10, 40), '外框右边 x=+10, z 0..40');
  ok(hasSeg(segs, -10, 0, 10, 0), '外框底边 z=0, x −10..10');
  ok(hasSeg(segs, -10, 40, 10, 40), '外框顶边 z=40, x −10..10');
  // 面对角线唔输出（对角边二面角 0°）→ 所有 front 投影段都轴对齐（或退化成点）
  const allAxisAligned = segs.every(
    ([a, b, c, d]) => Math.abs(a - c) <= 1e-9 || Math.abs(b - d) <= 1e-9,
  );
  ok(allAxisAligned, '冇面对角线漏入输出（全部段轴对齐）');
}

group('立方体 — top 视图 (x,y)');
{
  const { segs, bbox } = projectMeshEdges(CUBE_VERTS, CUBE_TRIS, IDENTITY, 'top');
  approxBbox(bbox, [-10, -15, 10, 15], 'top bbox');
  ok(segs.length >= 12, `top segs 数 >= 12 (实际 ${segs.length})`);
}

group('立方体 — right 视图 (y,z)');
{
  const { segs, bbox } = projectMeshEdges(CUBE_VERTS, CUBE_TRIS, IDENTITY, 'right');
  approxBbox(bbox, [-15, 0, 15, 40], 'right bbox');
  ok(segs.length >= 12, `right segs 数 >= 12 (实际 ${segs.length})`);
}

group('平移矩阵 x+100 — front bbox 跟住移');
{
  const { bbox } = projectMeshEdges(CUBE_VERTS, CUBE_TRIS, TRANSLATE_X100, 'front');
  approxBbox(bbox, [90, 0, 110, 40], 'front bbox (x+100)');
}

group('顶点焊接 — 三角形 soup（STL 式 36 顶点）结果一致');
{
  // 将索引网格摊开成 soup：每个三角形 3 个独立顶点
  const soupVerts = [];
  const soupTris = [];
  for (let i = 0; i < CUBE_TRIS.length; i++) {
    const vi = CUBE_TRIS[i];
    soupVerts.push(CUBE_VERTS[vi * 3], CUBE_VERTS[vi * 3 + 1], CUBE_VERTS[vi * 3 + 2]);
    soupTris.push(i);
  }
  const { segs, bbox } = projectMeshEdges(soupVerts, soupTris, IDENTITY, 'front');
  approxBbox(bbox, [-10, 0, 10, 40], 'soup front bbox');
  ok(segs.length >= 12, `soup front segs 数 >= 12 (实际 ${segs.length})`);
  ok(hasSeg(segs, -10, 0, -10, 40), 'soup 外框左边仍然喺度');
}

group('四面体 — 边界/轮廓判断唔报错');
{
  const tetVerts = [0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10];
  const tetTris = [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]; // 闭合，外向缠绕
  for (const view of ['front', 'top', 'right']) {
    const { segs, bbox } = projectMeshEdges(tetVerts, tetTris, IDENTITY, view);
    ok(segs.length >= 4, `tet ${view} 有输出段 (实际 ${segs.length})`);
    ok(bbox.every((v) => Number.isFinite(v)), `tet ${view} bbox 有限`);
  }
  // 闭合四面体所有二面角 ≈ 70.5° > 24° → 全部 6 条边输出
  const { segs, bbox } = projectMeshEdges(tetVerts, tetTris, IDENTITY, 'front');
  ok(segs.length === 6, `tet front 输出 6 条边 (实际 ${segs.length})`);
  approxBbox(bbox, [0, 0, 10, 10], 'tet front bbox');

  // 开网格（单面三角形）：边界边照输出
  const openTri = projectMeshEdges([0, 0, 0, 10, 0, 0, 0, 0, 10], [0, 1, 2], IDENTITY, 'front');
  ok(openTri.segs.length === 3, `开网格单三角形输出 3 条边界边 (实际 ${openTri.segs.length})`);
}

group('守卫 — 空网格 / 退化三角形');
{
  const empty = projectMeshEdges([], [], IDENTITY, 'front');
  ok(empty.segs.length === 0, '空网格 segs 为空');
  approxBbox(empty.bbox, [0, 0, 0, 0], '空网格 bbox');

  // 三点共线 → 面积 0，跳过，唔报错
  const degen = projectMeshEdges([0, 0, 0, 1, 1, 1, 2, 2, 2], [0, 1, 2], IDENTITY, 'top');
  ok(degen.segs.length === 0, '退化三角形被跳过');

  // 索引越界三角形守卫
  const oob = projectMeshEdges([0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 99], IDENTITY, 'front');
  ok(oob.segs.length === 0, '越界索引被跳过，唔报错');
}

group('segsToSvgPath');
{
  ok(segsToSvgPath([]) === '', '空 segs → 空字串');
  const p1 = segsToSvgPath([[0, 0, 10, 20]]);
  ok(p1 === 'M 0 0 L 10 -20', `yFlip 默认开：y 取负 (实际 "${p1}")`);
  const p2 = segsToSvgPath([[0, 0, 10, 20]], false);
  ok(p2 === 'M 0 0 L 10 20', `yFlip=false：y 原样 (实际 "${p2}")`);
  const p3 = segsToSvgPath([[0, 0, 1, 0], [1, 0, 1, 1]]);
  ok(p3 === 'M 0 0 L 1 0 M 1 0 L 1 -1', `多段拼接 (实际 "${p3}")`);
}

console.log(`\n全绿 ✓ ${nGroup} 组 ${nAssert} 条断言通过`);
