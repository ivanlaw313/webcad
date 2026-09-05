// sketchops.test.mjs — T724 bulge-path 纯几何模块测试
// 跑法: npx -y tsx tests/sketchops.test.mjs   (喺 C:\ClaudeCode\webcad 目录)
import {
  bulgeMid,
  bulgeRadius,
  bulgeCenter,
  tessellateSeg,
  pathPts,
  pathArea,
  mirrorPt,
  mirrorPath,
  offsetPath,
  filletAt,
} from '../src/sketch/sketchOps.ts';

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
  const dx = actual[0] - expected[0];
  const dy = actual[1] - expected[1];
  if (Math.hypot(dx, dy) > tol) {
    throw new Error(`断言失败: ${msg} — 期望 (${expected}), 实际 (${actual})`);
  }
  console.log(`  ok ${msg} ((${actual[0].toFixed(6)},${actual[1].toFixed(6)}))`);
}
function throws(fn, re, msg) {
  nAssert++;
  try {
    fn();
  } catch (e) {
    if (!re.test(String(e.message))) {
      throw new Error(`断言失败: ${msg} — 抛错但讯息不符: ${e.message}`);
    }
    console.log(`  ok ${msg} (throw: ${e.message})`);
    return;
  }
  throw new Error(`断言失败: ${msg} — 应抛错但无`);
}
// 密铺折线 shoelace (验证绕向用, 同 pathArea 解析公式独立)
function shoelace(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += (p[0] * q[1] - q[0] * p[1]) / 2;
  }
  return a;
}

const PI = Math.PI;
const B90 = Math.tan(PI / 8); // 90° 弧 bulge

// ============ 1. bulge 基础 ============
group('bulge 基础');
{
  // 半圆 bulge=1: a=(0,0) b=(2,0) → R=1, 圆心=弦中点, 凸向左 (+y)
  approx(bulgeRadius([0, 0], [2, 0], 1), 1, '半圆 R = |chord|/2');
  approxPt(bulgeCenter([0, 0], [2, 0], 1), [1, 0], '半圆圆心 = 弦中点');
  approxPt(bulgeMid([0, 0], [2, 0], 1), [1, 1], '半圆 mid 喺左侧 (+y)');
  // 负 bulge → 对侧
  approxPt(bulgeMid([0, 0], [2, 0], -1), [1, -1], '负 bulge mid 喺右侧 (−y)');
  approxPt(bulgeCenter([0, 0], [2, 0], -1), [1, 0], '负 bulge 圆心唔变 (半圆)');
  // 90° 弧: a=(1,0) b=(0,1), bulge=tan(π/8) (凸向左 = 朝原点) → 单位半径, 圆心 (1,1)
  approx(bulgeRadius([1, 0], [0, 1], B90), 1, '90° 弧 R = 1');
  approxPt(bulgeCenter([1, 0], [0, 1], B90), [1, 1], '90° 弧圆心 (1,1)');
  approxPt(bulgeMid([1, 0], [0, 1], B90), [1 - Math.SQRT2 / 2, 1 - Math.SQRT2 / 2], '90° 弧 mid');
  // >180° (bulge>1) 圆心过弦另一侧: 270° 弧 bulge=tan(3π/8)
  {
    const b270 = Math.tan((3 * PI) / 8);
    const c = bulgeCenter([0, 0], [2, 0], b270);
    ok(c[1] > 0, '270° 弧 (bulge>1) 圆心同凸侧同边 (y>0)');
    approx(Math.hypot(c[0] - 0, c[1] - 0), bulgeRadius([0, 0], [2, 0], b270), '圆心到端点 = R');
  }
  // 退化守卫
  approxPt(bulgeMid([0, 0], [2, 0], 0), [1, 0], 'bulge=0 mid = 弦中点');
  ok(bulgeRadius([0, 0], [2, 0], 0) === Infinity, 'bulge=0 → R = Infinity');
  approx(bulgeRadius([1, 1], [1, 1], 1), 0, '零弦 → R = 0');
  throws(() => bulgeCenter([0, 0], [2, 0], 0), /无圆心/, 'bulge=0 圆心 throw');
  throws(() => mirrorPt([1, 1], [0, 0], [0, 0]), /重合/, '镜像轴两点重合 throw');
}

// ============ 2. tessellateSeg ============
group('tessellateSeg');
{
  const straight = tessellateSeg([0, 0], [3, 4], 0);
  ok(straight.length === 1 && straight[0][0] === 3 && straight[0][1] === 4, '直线段 = [b]');
  const degen = tessellateSeg([1, 1], [1, 1], 1);
  ok(degen.length === 1, '零弦退化 = [b]');
  const semi = tessellateSeg([0, 0], [2, 0], 1); // 半圆 R=1 圆心(1,0)
  ok(semi.length === Math.ceil(PI / 0.12), `半圆点数 = ceil(π/0.12) = ${Math.ceil(PI / 0.12)}`);
  ok(semi[semi.length - 1][0] === 2 && semi[semi.length - 1][1] === 0, '末点 = 精确 b');
  {
    let maxErr = 0, allLeft = true;
    for (const p of semi) {
      maxErr = Math.max(maxErr, Math.abs(Math.hypot(p[0] - 1, p[1]) - 1));
      if (p[1] < -1e-12) allLeft = false;
    }
    ok(maxErr < 1e-9, '半圆所有点都喺圆上');
    ok(allLeft, '正 bulge 所有点喺左侧 (y≥0)');
  }
  {
    const semiNeg = tessellateSeg([0, 0], [2, 0], -1);
    ok(semiNeg.every((p) => p[1] < 1e-12), '负 bulge 所有点喺右侧 (y≤0)');
  }
  {
    const coarse = tessellateSeg([0, 0], [2, 0], 1, 0.5); // maxStep=0.5
    ok(coarse.length === Math.ceil(PI / 0.5), 'maxStep 参数生效');
  }
}

// ============ 测试形状 ============
// 正方形 (CCW) 边长 2
const SQ_V = [[0, 0], [2, 0], [2, 2], [0, 2]];
const SQ_B = [0, 0, 0, 0];
// slot (CW 绕向, 两直段 + 两半圆 bulge=+1 凸向外): 帽圆心 (0,0) 同 (4,0), w=2, r=1
const SLOT_L = 4, SLOT_W = 2;
const SLOT_V = [[0, 1], [4, 1], [4, -1], [0, -1]];
const SLOT_B = [0, 1, 0, 1];
const SLOT_AREA = SLOT_L * SLOT_W + PI * (SLOT_W / 2) ** 2; // 8 + π
// rrect (CW) w=4 h=3 r=0.5, 四角 90° 弧 bulge=+tan(π/8) 凸向外
const RR_W = 4, RR_H = 3, RR_R = 0.5;
const RR_V = [
  [RR_R, RR_H], [RR_W - RR_R, RR_H],          // 顶边
  [RR_W, RR_H - RR_R], [RR_W, RR_R],          // 右上角弧 → 右边
  [RR_W - RR_R, 0], [RR_R, 0],                // 右下角弧 → 底边
  [0, RR_R], [0, RR_H - RR_R],                // 左下角弧 → 左边 (尾段闭合 = 左上角弧)
];
const RR_B = [0, B90, 0, B90, 0, B90, 0, B90];
const RR_AREA = RR_W * RR_H - (4 - PI) * RR_R * RR_R;

// ============ 3. pathPts ============
group('pathPts');
{
  const pts = pathPts(SLOT_V, SLOT_B);
  approxPt(pts[0], [0, 1], '起点 = verts[0]');
  const last = pts[pts.length - 1];
  ok(Math.hypot(last[0] - 0, last[1] - 1) > 1e-6, '不重复终点');
  const sh = shoelace(pts);
  ok(sh < 0, 'slot 密铺折线绕向 = CW (负)');
  approx(sh, -SLOT_AREA, '密铺 shoelace ≈ −(L·w+πr²) (内接多边形)', 0.02);
  const sq = pathPts(SQ_V, SQ_B);
  ok(sq.length === 4, '正方形密铺 = 4 点');
  approx(shoelace(sq), 4, '正方形密铺 shoelace = 4 (CCW)', 1e-12);
}

// ============ 4. pathArea (解析, 容差 1e-6) ============
group('pathArea');
{
  approx(pathArea(SQ_V, SQ_B), 4, '正方形 = 边²');
  approx(pathArea(SLOT_V, SLOT_B), SLOT_AREA, 'slot = L·w + π(w/2)² 精确');
  approx(pathArea(RR_V, RR_B), RR_AREA, 'rrect = w·h − (4−π)r² 精确');
  // 同一 slot 以 CCW 绕向 + 负 bulge 表达 → 面积相同
  // reverse 后: (0,-1)→(4,-1)→(4,1)→(0,1), 帽段为段 1 同段 3, 凸外 = 负 bulge
  approx(pathArea([...SLOT_V].reverse(), [0, -1, 0, -1]), SLOT_AREA, 'CCW slot (bulge=−1 凸外) 面积一致');
  // 双弧全圆: 两顶点 + 两个半圆 bulge → πR²
  approx(pathArea([[1, 0], [-1, 0]], [-1, -1]), PI, '双半圆全圆 (CCW) = π');
  approx(pathArea([[1, 0], [-1, 0]], [1, 1]), PI, '双半圆全圆 (CW) = π');
}

// ============ 5. mirrorPath ============
group('mirrorPath');
{
  // 镜像轴: 竖线 x = −1
  const LA = [-1, -3], LB = [-1, 7];
  approxPt(mirrorPt([5, 0], LA, LB), [-7, 0], 'mirrorPt 精确');
  const m = mirrorPath(SLOT_V, SLOT_B, LA, LB);
  ok(m.verts.length === 4 && m.bulges.length === 4, '长度不变');
  approx(pathArea(m.verts, m.bulges), SLOT_AREA, '镜像后面积不变');
  const sOrig = shoelace(pathPts(SLOT_V, SLOT_B));
  const sMir = shoelace(pathPts(m.verts, m.bulges));
  ok(sOrig < 0 && sMir < 0, '镜像后绕向不变 (都系 CW)');
  approxPt(m.verts[0], [-2, 1], '起点 = 原起点嘅镜像');
  // 弧凸向正确: 原 slot 两帽顶点 (5,0)、(−1,0) → 镜像后应为 (−7,0)、(−1,0)
  const bellies = [];
  for (let j = 0; j < 4; j++) {
    if (Math.abs(m.bulges[j]) > 1e-9) {
      bellies.push(bulgeMid(m.verts[j], m.verts[(j + 1) % 4], m.bulges[j]));
    }
  }
  ok(bellies.length === 2, '镜像后仍有两段弧');
  bellies.sort((a, b) => a[0] - b[0]);
  approxPt(bellies[0], [-7, 0], '镜像帽 1 凸点 = mirrorPt(原凸点)');
  approxPt(bellies[1], [-1, 0], '镜像帽 2 凸点 = mirrorPt(原凸点)');
  // 双重镜像 = 原路径 (顶点集相同)
  const m2 = mirrorPath(m.verts, m.bulges, LA, LB);
  approxPt(m2.verts[0], SLOT_V[0], '双重镜像还原起点');
  approx(pathArea(m2.verts, m2.bulges), SLOT_AREA, '双重镜像面积还原');
}

// ============ 6. offsetPath ============
group('offsetPath');
{
  // 正方形外偏 d=0.5 → (2+1)² = 9
  const so = offsetPath(SQ_V, SQ_B, 0.5);
  approx(pathArea(so.verts, so.bulges), 9, '正方形 +d → (边+2d)²');
  approxPt(so.verts[0], [-0.5, -0.5], 'miter 角点精确');
  ok(so.bulges.every((b) => b === 0), '直段 bulge 保持 0');
  // slot 外偏 d=0.5 → L·(w+2d) + π(w/2+d)²
  const d1 = 0.5;
  const slo = offsetPath(SLOT_V, SLOT_B, d1);
  approx(
    pathArea(slo.verts, slo.bulges),
    SLOT_L * (SLOT_W + 2 * d1) + PI * (SLOT_W / 2 + d1) ** 2,
    'slot +d → L·(w+2d) + π(w/2+d)²',
  );
  approx(slo.bulges[1], 1, 'slot 帽偏移后仍半圆 (bulge=1, 包角不变)', 1e-9);
  approx(slo.bulges[3], 1, 'slot 另一帽 bulge=1', 1e-9);
  approxPt(slo.verts[0], [0, 1.5], '相切点沿共同法线移动');
  // slot 内偏 −0.5 → L·(w−1) + π(0.5)²
  const sli = offsetPath(SLOT_V, SLOT_B, -0.5);
  approx(
    pathArea(sli.verts, sli.bulges),
    SLOT_L * (SLOT_W - 1) + PI * 0.25,
    'slot −d 内偏面积',
  );
  // rrect 内偏 −0.2 → (w−2d)(h−2d) − (4−π)(r−d)²
  const d2 = 0.2;
  const rro = offsetPath(RR_V, RR_B, -d2);
  approx(
    pathArea(rro.verts, rro.bulges),
    (RR_W - 2 * d2) * (RR_H - 2 * d2) - (4 - PI) * (RR_R - d2) ** 2,
    'rrect −d 内偏面积公式',
  );
  approx(Math.abs(rro.bulges[1]), B90, 'rrect 角弧 bulge 不变 (同心, 包角不变)', 1e-9);
  // rrect 外偏 +0.3 → (w+0.6)(h+0.6) − (4−π)(r+0.3)²
  const rro2 = offsetPath(RR_V, RR_B, 0.3);
  approx(
    pathArea(rro2.verts, rro2.bulges),
    (RR_W + 0.6) * (RR_H + 0.6) - (4 - PI) * (RR_R + 0.3) ** 2,
    'rrect +d 外偏面积公式',
  );
  // 过大内偏 → throw
  throws(() => offsetPath(SQ_V, SQ_B, -1.5), /自交/, '正方形过大内偏 throw');
  throws(() => offsetPath(RR_V, RR_B, -0.6), /自交/, 'rrect 内偏超过角半径 throw');
  throws(() => offsetPath(SLOT_V, SLOT_B, -1.2), /自交/, 'slot 内偏超过半宽 throw');
  // 双弧全圆偏移 (弧-弧同圆相邻): R=1 外偏 0.5 → π(1.5)²
  const circ = offsetPath([[1, 0], [-1, 0]], [1, 1], 0.5);
  approx(pathArea(circ.verts, circ.bulges), PI * 2.25, '双半圆全圆 +d → π(R+d)²');
}

// ============ 7. filletAt ============
group('filletAt');
{
  const r = 0.4;
  // 正方形单角倒圆: 面积减 (4−π)r²/4
  const f = filletAt(SQ_V, SQ_B, 2, r);
  ok(f.verts.length === 5 && f.bulges.length === 5, '顶点 4→5, 段 4→5');
  approx(pathArea(f.verts, f.bulges), 4 - ((4 - PI) * r * r) / 4, '单角倒圆面积 = 边² − (4−π)r²/4');
  // 90° 角: t = r/tan(45°) = r → 切点距原角点 = r
  approx(Math.hypot(f.verts[2][0] - 2, f.verts[2][1] - 2), r, '切点 p1 距角点 = r (90° 角 t=r)');
  approx(Math.hypot(f.verts[3][0] - 2, f.verts[3][1] - 2), r, '切点 p2 距角点 = r');
  approx(Math.abs(f.bulges[2]), B90, '圆角弧 bulge 幅值 = tan(π/8)');
  ok(f.bulges[2] < 0, 'CCW (左转) 圆角 bulge 为负 (凸向行进右侧=外)');
  approx(bulgeRadius(f.verts[2], f.verts[3], f.bulges[2]), r, '圆角弧实际半径 = r');
  // 连环四角倒圆 → rrect 面积 (索引随 splice 顺移: 0, 2, 4, 6)
  let cur = { verts: SQ_V.map((p) => [...p]), bulges: [...SQ_B] };
  for (const idx of [0, 2, 4, 6]) cur = filletAt(cur.verts, cur.bulges, idx, r);
  ok(cur.verts.length === 8, '四角倒圆后 8 顶点');
  approx(pathArea(cur.verts, cur.bulges), 4 - (4 - PI) * r * r, '四角倒圆 = rrect 面积公式');
  // 半径太大 throw (t ≥ 邻段长)
  throws(() => filletAt(SQ_V, SQ_B, 1, 3), /半径太大/, 'r=3 (t≥边长) throw');
  throws(() => filletAt(SQ_V, SQ_B, 1, 2), /半径太大/, 'r=2 (t=边长) throw');
  // 非直线邻段 throw: slot 顶点 1 邻接帽弧
  throws(() => filletAt(SLOT_V, SLOT_B, 1, 0.2), /直线/, '邻段为弧 throw');
  throws(() => filletAt(SLOT_V, SLOT_B, 2, 0.2), /直线/, '前段为弧 throw');
  // 共线角 throw
  throws(
    () => filletAt([[0, 0], [1, 0], [2, 0], [2, 2], [0, 2]], [0, 0, 0, 0, 0], 1, 0.2),
    /共线/,
    '共线角点 throw',
  );
  // 非法半径
  throws(() => filletAt(SQ_V, SQ_B, 1, 0), /半径须为正/, 'r=0 throw');
}

console.log(`\n=== 全部通过: ${nGroup} 组 / ${nAssert} 条断言 ===`);
