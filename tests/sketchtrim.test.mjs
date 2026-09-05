// sketchtrim.test.mjs — trimPathAt / extendPathAt (剪裁/延伸几何核心) 验证套件
// 跑法: npx -y tsx tests/sketchtrim.test.mjs   (喺 C:\ClaudeCode\webcad 目录)
// 失败 → exit 1; 末尾输出 PASS/FAIL 总表; 全部断言解析级 (1e-7 或更严)
import {
  trimPathAt,
  extendPathAt,
  bulgeCenter,
  bulgeRadius,
} from '../src/sketch/sketchOps.ts';

const PI = Math.PI;
const rows = [];
let notes = [];

function note(s) {
  notes.push(s);
  console.log(`    ${s}`);
}
function ok(cond, msg) {
  if (!cond) throw new Error(msg);
  note(msg);
}
function eq(actual, expected, msg, tol = 1e-9) {
  if (!(Math.abs(actual - expected) <= tol)) {
    throw new Error(`${msg}: 期望 ${expected}, 实际 ${actual} (tol ${tol})`);
  }
  note(`${msg}: ${actual} ≈ ${expected}`);
}
function ptEq(p, ex, ey, msg, tol = 1e-9) {
  if (!(Math.hypot(p[0] - ex, p[1] - ey) <= tol)) {
    throw new Error(`${msg}: 期望 (${ex},${ey}), 实际 (${p[0]},${p[1]}) (tol ${tol})`);
  }
  note(`${msg}: (${p[0]},${p[1]}) ≈ (${ex},${ey})`);
}
function test(name, fn) {
  console.log(`\n## ${name}`);
  notes = [];
  try {
    fn();
    rows.push({ name, pass: true, info: '' });
  } catch (e) {
    rows.push({ name, pass: false, info: String(e.message) });
    console.log(`    !! FAIL: ${e.message}`);
  }
}

// ---------- 辅助 ----------
function openLine(x0, y0, x1, y1) {
  return { verts: [[x0, y0], [x1, y1]], bulges: [0], closed: false };
}
// 开放路径结构一致性: k 顶点 → k−1 bulge, 唔闭合
function checkOpenShape(p, msg) {
  ok(p.closed === false, `${msg}: closed=false`);
  ok(p.bulges.length === p.verts.length - 1,
    `${msg}: verts=${p.verts.length}, bulges=${p.bulges.length} (= verts−1)`);
}
// 4·atan(|b|) = 弧扫角
function sweepOf(b) {
  return 4 * Math.atan(Math.abs(b));
}

// ============ T1 十字剪裁: 两条交叉直线 ============
test('T1 cross-trim', () => {
  const target = openLine(-5, 0, 5, 0);
  const cutter = openLine(0, -5, 0, 5);
  const r = trimPathAt(target, [cutter], [2.5, 0.01], 0.1);
  ok(r !== null && r.kind === 'parts', '点击右半 → kind parts');
  ok(r.parts.length === 1, `剩 1 条 (实际 ${r.parts.length})`);
  const p = r.parts[0];
  checkOpenShape(p, '剩件');
  ok(p.verts.length === 2, '剩件 2 顶点');
  ptEq(p.verts[0], -5, 0, '起点 = 原起点');
  ptEq(p.verts[1], 0, 0, '终点 = 精确交点 (0,0)');
  eq(p.bulges[0], 0, '直线段 bulge=0');
  // 点击左半 → 剩右半
  const r2 = trimPathAt(target, [cutter], [-2.5, -0.01], 0.1);
  ok(r2 !== null && r2.kind === 'parts' && r2.parts.length === 1, '点击左半 → 剩 1 条');
  ptEq(r2.parts[0].verts[0], 0, 0, '右半起点 = (0,0)');
  ptEq(r2.parts[0].verts[1], 5, 0, '右半终点 = (5,0)');
});

// ============ T2 闭合矩形 × 两条竖切线: 剪顶边中跨 ============
test('T2 rect-top-span', () => {
  const rect = {
    verts: [[0, 0], [10, 0], [10, 6], [0, 6]],
    bulges: [0, 0, 0, 0],
    closed: true,
  };
  const cut3 = openLine(3, 5, 3, 7);
  const cut7 = openLine(7, 5, 7, 7);
  const r = trimPathAt(rect, [cut3, cut7], [5, 6], 0.1);
  ok(r !== null && r.kind === 'parts', '剪顶边中跨 → kind parts');
  ok(r.parts.length === 1, `闭合路径剪开 → 1 条开放路径 (实际 ${r.parts.length})`);
  const p = r.parts[0];
  checkOpenShape(p, '剩件');
  ok(p.verts.length === 6, `6 顶点 (实际 ${p.verts.length})`);
  // 顶边由 (10,6)→(0,6) 行进: x=3 喺 u=2.7 (跨度后界), x=7 喺 u=2.3 (前界)
  // 保留跨度 (3,6) → (0,6) → (0,0) → (10,0) → (10,6) → (7,6)
  ptEq(p.verts[0], 3, 6, '起点 = 切线 x=3 交点');
  ptEq(p.verts[1], 0, 6, '途经角 (0,6) 原样');
  ptEq(p.verts[2], 0, 0, '途经角 (0,0) 原样');
  ptEq(p.verts[3], 10, 0, '途经角 (10,0) 原样');
  ptEq(p.verts[4], 10, 6, '途经角 (10,6) 原样');
  ptEq(p.verts[5], 7, 6, '终点 = 切线 x=7 交点');
  for (const b of p.bulges) eq(b, 0, '全直线段 bulge=0');
});

// ============ T3 圆 (闭合双弧) × 穿圆直线: 剪一侧弧 ============
test('T3 circle-line-trim', () => {
  // 圆心 (0,0), R=5: 上半弧 (−5,0)→(5,0) bulge=1 (顺时针经 (0,5)),
  // 下半弧 (5,0)→(−5,0) bulge=1 (经 (0,−5))
  const circle = { verts: [[-5, 0], [5, 0]], bulges: [1, 1], closed: true };
  const cutter = openLine(3, -6, 3, 6); // x=3 穿圆: 解析交点 (3,±4)
  const r = trimPathAt(circle, [cutter], [0, 5], 0.05); // 点击顶点 (0,5) — 左侧大弧
  ok(r !== null && r.kind === 'parts', '剪左侧弧 → kind parts');
  ok(r.parts.length === 1, `剩 1 条弧路径 (实际 ${r.parts.length})`);
  const p = r.parts[0];
  checkOpenShape(p, '剩弧');
  // 端点 = 解析交点 (3,4) / (3,−4)
  ptEq(p.verts[0], 3, 4, '起点 = 圆×线解析交点 (3,4)');
  ptEq(p.verts[p.verts.length - 1], 3, -4, '终点 = 圆×线解析交点 (3,−4)');
  // 每个顶点都喺圆上: ||p|−R| ≤ 1e-9
  for (let i = 0; i < p.verts.length; i++) {
    eq(Math.hypot(p.verts[i][0], p.verts[i][1]), 5, `顶点 ${i} 喺圆上`, 1e-9);
  }
  // 每段弧重构圆心 (0,0) 半径 5 (弧保真)
  for (let i = 0; i < p.bulges.length; i++) {
    ok(Math.abs(p.bulges[i]) > 1e-9, `段 ${i} 系弧段`);
    const c = bulgeCenter(p.verts[i], p.verts[i + 1], p.bulges[i]);
    const R = bulgeRadius(p.verts[i], p.verts[i + 1], p.bulges[i]);
    ok(Math.hypot(c[0], c[1]) <= 1e-7 && Math.abs(R - 5) <= 1e-7, `段 ${i} 同圆心同半径`);
  }
  // 总扫角 = 右侧小弧: 由 (3,4) 顺时针经 (5,0) 到 (3,−4) = 2·atan2(4,3)
  let total = 0;
  for (const b of p.bulges) total += sweepOf(b);
  eq(total, 2 * Math.atan2(4, 3), '剩弧总扫角', 1e-9);
});

// ============ T4 无交点 → kind 'all' ============
test('T4 no-intersection-all', () => {
  const target = openLine(0, 0, 10, 0);
  const far = openLine(0, 50, 10, 50); // 离行万丈
  const r = trimPathAt(target, [far], [5, 0], 0.1);
  ok(r !== null && r.kind === 'all', '有 cutter 但唔相交 → all');
  const r2 = trimPathAt(target, [], [5, 0], 0.1);
  ok(r2 !== null && r2.kind === 'all', '完全冇 cutter → all');
  // 闭合路径同样
  const rect = { verts: [[0, 0], [4, 0], [4, 4], [0, 4]], bulges: [0, 0, 0, 0], closed: true };
  const r3 = trimPathAt(rect, [far], [2, 0], 0.1);
  ok(r3 !== null && r3.kind === 'all', '闭合无交点 → all');
});

// ============ T5 点击离行 → null ============
test('T5 click-miss-null', () => {
  const target = openLine(0, 0, 10, 0);
  const cutter = openLine(5, -5, 5, 5);
  ok(trimPathAt(target, [cutter], [5, 3], 0.1) === null, '离 3 单位 (tol 0.1) → null');
  ok(trimPathAt(target, [cutter], [50, 50], 1) === null, '离行万丈 → null');
  ok(extendPathAt(target, [cutter], [5, 3], 0.1) === null, 'extend 离行 → null');
});

// ============ T6 自交开放折线: 剪自交点之间嘅中跨 ============
test('T6 self-intersect-trim', () => {
  // s0 (0,0)→(10,0); s1 (10,0)→(10,6); s2 (10,6)→(2,−2): s2 喺 (4,0) 横穿 s0
  const target = {
    verts: [[0, 0], [10, 0], [10, 6], [2, -2]],
    bulges: [0, 0, 0],
    closed: false,
  };
  const r = trimPathAt(target, [], [10, 3], 0.1); // 点击 s1 中段 (uc=1.5)
  ok(r !== null && r.kind === 'parts', '自交剪裁 → kind parts');
  ok(r.parts.length === 2, `跨度内剪 → 2 条 (实际 ${r.parts.length})`);
  const [pa, pb] = r.parts;
  checkOpenShape(pa, '前件');
  checkOpenShape(pb, '后件');
  // 前件 [0, 0.4]: (0,0)→(4,0); 后件 [2.75, 3]: (4,0)→(2,−2)
  ok(pa.verts.length === 2 && pb.verts.length === 2, '两件各 2 顶点');
  ptEq(pa.verts[0], 0, 0, '前件起点 (0,0)');
  ptEq(pa.verts[1], 4, 0, '前件终点 = 自交点 (4,0)');
  ptEq(pb.verts[0], 4, 0, '后件起点 = 自交点 (4,0)');
  ptEq(pb.verts[1], 2, -2, '后件终点 (2,−2)');
});

// ============ T7 直线延伸到交叉线 ============
test('T7 extend-line', () => {
  const target = openLine(0, 0, 4, 0);
  const cutR = openLine(10, -5, 10, 5);
  const cutL = openLine(-6, -5, -6, 5);
  // 点击近末端 (t=0.875>0.5) → 延伸末端到 x=10
  const r = extendPathAt(target, [cutR, cutL], [3.5, 0.05], 0.1);
  ok(r !== null, '末端延伸成功');
  checkOpenShape(r, '延伸后');
  ptEq(r.verts[0], 0, 0, '起点不变');
  ptEq(r.verts[1], 10, 0, '末端落喺精确交点 (10,0)');
  eq(r.bulges[0], 0, '直线段 bulge 仍为 0');
  // 点击近起端 (t=0.125<0.5) → 延伸起端到 x=−6 (向后射线)
  const r2 = extendPathAt(target, [cutR, cutL], [0.5, -0.05], 0.1);
  ok(r2 !== null, '起端延伸成功');
  ptEq(r2.verts[0], -6, 0, '起端落喺精确交点 (−6,0)');
  ptEq(r2.verts[1], 4, 0, '终点不变');
  // 冇可达 cutter → null
  const r3 = extendPathAt(target, [openLine(0, 50, 10, 50)], [3.5, 0.05], 0.1);
  ok(r3 === null, '延伸方向无交点 → null');
  // 闭合路径 → null
  const rect = { verts: [[0, 0], [4, 0], [4, 4], [0, 4]], bulges: [0, 0, 0, 0], closed: true };
  ok(extendPathAt(rect, [cutR], [2, 0], 0.1) === null, '闭合 target → null');
  // 点击中段以内 (靠锚点嗰半) → null
  ok(extendPathAt(target, [cutR, cutL], [2, 0.05], 0.1) === null,
    't=0.5 正中 → 两半都唔啱 → null');
});

// ============ T8 弧沿原圆延伸到切割线 ============
test('T8 extend-arc', () => {
  // 四分一圆: 圆心 (0,0) R=5, 由 (5,0) 逆时针去 (0,5) → bulge = −tan(π/8)
  const b0 = -Math.tan(PI / 8);
  const target = { verts: [[5, 0], [0, 5]], bulges: [b0], closed: false };
  const cutter = openLine(-10, 0, 10, 0); // y=0 直线: 延续弧喺 (−5,0) 相交
  // 点击近自由端 (0,5): 弧上 80° 位置 (t≈0.889 > 0.5) → 延末端
  const click = [5 * Math.cos(80 * PI / 180), 5 * Math.sin(80 * PI / 180)];
  const r = extendPathAt(target, [cutter], click, 0.1);
  ok(r !== null, '弧末端延伸成功');
  checkOpenShape(r, '延伸后');
  ptEq(r.verts[0], 5, 0, '锚点不变 (5,0)');
  ptEq(r.verts[1], -5, 0, '自由端沿圆延到解析交点 (−5,0)');
  // 新扫角 = π (半圆) → bulge = −tan(π/4) = −1
  eq(r.bulges[0], -1, '新 bulge = −1 (半圆, 同向)', 1e-9);
  // 弧保真: 重构圆心/半径不变
  const c = bulgeCenter(r.verts[0], r.verts[1], r.bulges[0]);
  const R = bulgeRadius(r.verts[0], r.verts[1], r.bulges[0]);
  ok(Math.hypot(c[0], c[1]) <= 1e-9 && Math.abs(R - 5) <= 1e-9, '延伸后仍喺原圆上');
  // 单段开放弧: 两端都系自由端 — 点击 10° (t≈0.111 < 0.5) → 延「起端」
  // 起点由 (5,0) 沿圆顺时针后退, 经 (0,−5) 延到 (−5,0): 新扫角 3π/2
  const click2 = [5 * Math.cos(10 * PI / 180), 5 * Math.sin(10 * PI / 180)];
  const r2 = extendPathAt(target, [cutter], click2, 0.1);
  ok(r2 !== null, '弧起端延伸成功');
  ptEq(r2.verts[0], -5, 0, '起端沿圆延到解析交点 (−5,0)');
  ptEq(r2.verts[1], 0, 5, '终点不变 (0,5)');
  eq(r2.bulges[0], -Math.tan(3 * PI / 8), '新 bulge = −tan(3π/8) (扫角 3π/2)', 1e-9);
  const c2 = bulgeCenter(r2.verts[0], r2.verts[1], r2.bulges[0]);
  const R2 = bulgeRadius(r2.verts[0], r2.verts[1], r2.bulges[0]);
  ok(Math.hypot(c2[0], c2[1]) <= 1e-9 && Math.abs(R2 - 5) <= 1e-9, '起端延伸仍喺原圆上');
  // 有锚段嘅两段路径: 点击弧嘅锚点嗰半 (非自由端半区) → null
  const anchored = {
    verts: [[8, 0], [5, 0], [0, 5]],
    bulges: [0, b0],
    closed: false,
  };
  ok(extendPathAt(anchored, [cutter], click2, 0.1) === null, '点击末段锚点半 → null');
});

// ============ T9 闭合路径剪裁: 未郁过嘅弧 bulge bit-exact 保留 ============
test('T9 untouched-bulge-verbatim', () => {
  const B1 = 0.3337719; // 右边弧 (10,0)→(10,6)
  const B3 = -0.2241;   // 左边弧 (0,6)→(0,0)
  const path = {
    verts: [[0, 0], [10, 0], [10, 6], [0, 6]],
    bulges: [0, B1, 0, B3],
    closed: true,
  };
  // 两条短竖切线只横穿底边 (y=0) 喺 x=3 / x=7
  const cut3 = openLine(3, -1, 3, 1);
  const cut7 = openLine(7, -1, 7, 1);
  const r = trimPathAt(path, [cut3, cut7], [5, 0], 0.1);
  ok(r !== null && r.kind === 'parts' && r.parts.length === 1, '剪底边中跨 → 1 条');
  const p = r.parts[0];
  checkOpenShape(p, '剩件');
  ok(p.verts.length === 6, `6 顶点 (实际 ${p.verts.length})`);
  // (7,0)→(10,0)→弧→(10,6)→(0,6)→弧→(0,0)→(3,0)
  ptEq(p.verts[0], 7, 0, '起点 (7,0)');
  ptEq(p.verts[5], 3, 0, '终点 (3,0)');
  ok(p.bulges.length === 5, '5 段');
  ok(Object.is(p.bulges[1], B1), `右弧 bulge bit-exact: ${p.bulges[1]} === ${B1}`);
  ok(Object.is(p.bulges[3], B3), `左弧 bulge bit-exact: ${p.bulges[3]} === ${B3}`);
  eq(p.bulges[0], 0, '剪开嘅底边子段 bulge=0');
  eq(p.bulges[2], 0, '顶边 bulge=0');
  eq(p.bulges[4], 0, '剪开嘅底边子段 bulge=0');
  // 途经顶点 bit-exact 原样
  ok(Object.is(p.verts[1][0], 10) && Object.is(p.verts[1][1], 0), '途经角 (10,0) bit-exact');
  ok(Object.is(p.verts[2][0], 10) && Object.is(p.verts[2][1], 6), '途经角 (10,6) bit-exact');
  ok(Object.is(p.verts[3][0], 0) && Object.is(p.verts[3][1], 6), '途经角 (0,6) bit-exact');
});

// ============ T10 容差: 0.9·tol 击中, 1.1·tol 落空 ============
test('T10 tolerance-boundary', () => {
  const target = openLine(0, 0, 10, 0);
  const tol = 0.5;
  const rHit = trimPathAt(target, [], [5, 0.9 * tol], tol);
  ok(rHit !== null && rHit.kind === 'all', '0.9·tol 击中 (无交点 → all)');
  ok(trimPathAt(target, [], [5, 1.1 * tol], tol) === null, '1.1·tol 落空 → null');
  // extend 同一容差规则 (末段自由端半区)
  const cutter = openLine(20, -5, 20, 5);
  const eHit = extendPathAt(target, [cutter], [9, 0.9 * tol], tol);
  ok(eHit !== null, 'extend 0.9·tol 击中');
  ptEq(eHit.verts[1], 20, 0, '延伸到 (20,0)');
  ok(extendPathAt(target, [cutter], [9, 1.1 * tol], tol) === null, 'extend 1.1·tol 落空 → null');
});

// ============ T11 开放路径跨度掂到末端 / 退化全删 ============
test('T11 open-end-span', () => {
  // 三段折线, cutter 只横穿中段 → 点击末段: 由交点删到末端
  const target = {
    verts: [[0, 0], [10, 0], [10, 10], [0, 10]],
    bulges: [0, 0, 0],
    closed: false,
  };
  const cutter = openLine(8, -1, 12, 3); // 斜线: 交底边 (9,0), 交右边 (10,1)
  const r = trimPathAt(target, [cutter], [5, 10], 0.1); // 点击顶段 → u2 唔存在
  ok(r !== null && r.kind === 'parts', '末端跨度 → parts');
  ok(r.parts.length === 1, `剩 1 条 (实际 ${r.parts.length})`);
  const p = r.parts[0];
  checkOpenShape(p, '剩件');
  // 剩 [0, u(10,1)]: (0,0)→(9,0)? 唔系 — u1 = 右边 (10,1) 交点 (最大 u < uc)
  ptEq(p.verts[0], 0, 0, '起点 (0,0)');
  ptEq(p.verts[p.verts.length - 1], 10, 1, '终点 = 最近交点 (10,1)');
  ok(p.verts.length === 3, '途经 (10,0): 共 3 顶点');
  ptEq(p.verts[1], 10, 0, '途经顶点 (10,0)');
  // 单交点 + 点击末侧: 剩件就系 [0, u1]; 而点击另一侧 (起端) → u1 唔存在 → 剩 [u2, 末]
  const line = openLine(0, 0, 10, 0);
  const cutMid = openLine(5, -1, 5, 1);
  const rL = trimPathAt(line, [cutMid], [1, 0], 0.1);
  ok(rL !== null && rL.kind === 'parts' && rL.parts.length === 1, '点击起侧 → 剩右半');
  ptEq(rL.parts[0].verts[0], 5, 0, '右半起点 (5,0)');
  ptEq(rL.parts[0].verts[1], 10, 0, '右半终点 (10,0)');
});

// ============ 总表 ============
console.log('\n========== PASS/FAIL 总表 ==========');
let nFail = 0;
for (const r of rows) {
  console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : ' — ' + r.info}`);
  if (!r.pass) nFail++;
}
console.log(`====================================`);
console.log(nFail === 0 ? `全部 ${rows.length} 组测试通过` : `${nFail}/${rows.length} 组测试失败`);
process.exit(nFail === 0 ? 0 : 1);
