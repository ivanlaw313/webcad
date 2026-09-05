// sketchbool.test.mjs — boolPath (闭合路径布尔运算) 验证套件
// 跑法: npx -y tsx tests/sketchbool.test.mjs   (喺 C:\ClaudeCode\webcad 目录)
// 失败 → exit 1; 末尾输出 PASS/FAIL 总表
import {
  boolPath,
  boolPathAll,
  pathArea,
  pathPts,
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
function eq(actual, expected, msg, tol = 1e-6) {
  if (!(Math.abs(actual - expected) <= tol)) {
    throw new Error(`${msg}: 期望 ${expected}, 实际 ${actual} (tol ${tol})`);
  }
  note(`${msg}: ${actual} ≈ ${expected}`);
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
function rect(x0, y0, x1, y1) {
  return {
    verts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]],
    bulges: [0, 0, 0, 0],
  };
}
function area(p) {
  return pathArea(p.verts, p.bulges);
}
// CW 翻转 (顶点逆序 + bulge 取负重排) — T6 用
function reversePath(p) {
  const n = p.verts.length;
  const verts = [];
  const bulges = [];
  for (let j = 0; j < n; j++) {
    verts.push([...p.verts[(n - j) % n]]);
    bulges.push(-p.bulges[(n - 1 - j) % n]);
  }
  return { verts, bulges };
}
// 简单性检查: 密铺后非相邻边两两无真交叉/无共线重叠
function cross3(o, a, b) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}
function segsCross(a, b, c, d) {
  const eps = 1e-9;
  const d1 = cross3(c, d, a);
  const d2 = cross3(c, d, b);
  const d3 = cross3(a, b, c);
  const d4 = cross3(a, b, d);
  if (
    ((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) &&
    ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps))
  ) return true;
  // 全共线 → 1D 区间重叠检查
  if (Math.abs(d1) <= eps && Math.abs(d2) <= eps && Math.abs(d3) <= eps && Math.abs(d4) <= eps) {
    const ax = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? 0 : 1;
    const lo1 = Math.min(a[ax], b[ax]);
    const hi1 = Math.max(a[ax], b[ax]);
    const lo2 = Math.min(c[ax], d[ax]);
    const hi2 = Math.max(c[ax], d[ax]);
    if (Math.min(hi1, hi2) - Math.max(lo1, lo2) > 1e-9) return true;
  }
  return false;
}
function selfIntersections(p) {
  const pts = pathPts(p.verts, p.bulges, 0.05); // 弧仅为此检查密铺
  const n = pts.length;
  let count = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue; // 相邻边跳过
      if (segsCross(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) count++;
    }
  }
  return count;
}
// 输出弧段须重构指定圆 (圆心+半径), 返回符合段数
function countArcsOnCircle(p, cx, cy, r, tol = 1e-6) {
  let count = 0;
  const n = p.verts.length;
  for (let i = 0; i < n; i++) {
    if (Math.abs(p.bulges[i]) < 1e-9) continue;
    const a = p.verts[i];
    const b = p.verts[(i + 1) % n];
    const c = bulgeCenter(a, b, p.bulges[i]);
    const R = bulgeRadius(a, b, p.bulges[i]);
    if (Math.hypot(c[0] - cx, c[1] - cy) <= tol && Math.abs(R - r) <= tol) count++;
  }
  return count;
}

// ============ T1 矩形重叠 union/subtract/intersect ============
test('T1 rect-union-overlap', () => {
  const A = rect(0, 0, 40, 30);
  const B = rect(20, 10, 60, 40);
  const U = boolPath(A, B, 'union');
  ok(U !== null, 'union 非 null');
  eq(area(U), 2000, 'union 面积 = 1200+1200−400');
  ok(U.verts.length === 8, `union 顶点数 = 8 (实际 ${U.verts.length})`);
  const S = boolPath(A, B, 'subtract');
  ok(S !== null, 'subtract 非 null');
  eq(area(S), 800, 'subtract A−B 面积 = 1200−400');
  const I = boolPath(A, B, 'intersect');
  ok(I !== null, 'intersect 非 null');
  eq(area(I), 400, 'intersect 面积 = 20×20');
});

// ============ T2 十字 union ============
test('T2 cross-union', () => {
  const A = rect(0, 10, 60, 20);  // 横条 600
  const B = rect(25, 0, 35, 30);  // 竖条 300, 重叠 100
  const U = boolPath(A, B, 'union');
  ok(U !== null, 'union 非 null');
  eq(area(U), 800, 'union 面积 = 600+300−100');
  ok(U.verts.length === 12, `union 顶点数 = 12 (实际 ${U.verts.length})`);
});

// ============ T3 圆-矩形 (圆心喺矩形边上) ============
test('T3 circle-rect', () => {
  const A = rect(0, 0, 40, 30);
  const B = { verts: [[30, 15], [50, 15]], bulges: [1, 1] }; // 圆心 (40,15) r=10
  eq(area(B), PI * 100, '前置: B 确系圆, 面积 = π·10²');
  const U = boolPath(A, B, 'union');
  ok(U !== null, 'union 非 null');
  eq(area(U), 1200 + 50 * PI, 'union 面积 = 1200 + 半圆 50π');
  const S = boolPath(A, B, 'subtract');
  ok(S !== null, 'subtract 非 null');
  eq(area(S), 1200 - 50 * PI, 'subtract 面积 = 1200 − 50π');
  const I = boolPath(A, B, 'intersect');
  ok(I !== null, 'intersect 非 null');
  eq(area(I), 50 * PI, 'intersect 面积 = 半圆 50π');
  // 输出弧段必须仍喺原圆 (40,15) r=10 上
  const nu = countArcsOnCircle(U, 40, 15, 10);
  ok(nu >= 1, `union 输出弧段重构圆心(40,15) R=10: ${nu} 段`);
  const ns = countArcsOnCircle(S, 40, 15, 10);
  ok(ns >= 1, `subtract 输出弧段重构圆心(40,15) R=10: ${ns} 段`);
  // 输出无非弧噪声: 所有 bulge 段都喺该圆上
  let nArcU = 0;
  for (const b of U.bulges) if (Math.abs(b) > 1e-9) nArcU++;
  ok(nArcU === nu, `union 全部 ${nArcU} 段弧均喺原圆上`);
});

// ============ T4 弧-弧 (两圆透镜) ============
test('T4 arc-arc', () => {
  const r = 10;
  const d = 12;
  const A = { verts: [[-10, 0], [10, 0]], bulges: [1, 1] };  // 圆心 (0,0)
  const B = { verts: [[2, 0], [22, 0]], bulges: [1, 1] };    // 圆心 (12,0)
  eq(area(A), PI * 100, '前置: A 面积 = π·10²');
  eq(area(B), PI * 100, '前置: B 面积 = π·10²');
  const lens = 2 * r * r * Math.acos(d / (2 * r)) - (d / 2) * Math.sqrt(4 * r * r - d * d);
  const U = boolPath(A, B, 'union');
  ok(U !== null, 'union 非 null');
  eq(area(U), 2 * PI * 100 - lens, `union 面积 = 200π − lens (lens=${lens})`);
  const I = boolPath(A, B, 'intersect');
  ok(I !== null, 'intersect 非 null');
  eq(area(I), lens, 'intersect 面积 = lens');
  // 输出弧全部位于两个原圆之一
  for (const res of [U, I]) {
    const onA = countArcsOnCircle(res, 0, 0, 10);
    const onB = countArcsOnCircle(res, 12, 0, 10);
    let nArc = 0;
    for (const b of res.bulges) if (Math.abs(b) > 1e-9) nArc++;
    ok(onA + onB === nArc && onA >= 1 && onB >= 1,
      `输出 ${nArc} 段弧全部喺原圆上 (圆A ${onA} 段, 圆B ${onB} 段)`);
  }
});

// ============ T5 包含 / 分离 / 全等 ============
test('T5 containment', () => {
  const A = rect(0, 0, 40, 30);
  const B = rect(10, 10, 20, 20); // 完全喺 A 内
  const U = boolPath(A, B, 'union');
  ok(U !== null && U.verts.length === 4, 'B⊂A union → A (4 顶点)');
  eq(area(U), 1200, 'B⊂A union 面积 = |A|');
  const I = boolPath(A, B, 'intersect');
  ok(I !== null, 'B⊂A intersect 非 null');
  eq(area(I), 100, 'B⊂A intersect 面积 = |B|');
  ok(boolPath(A, B, 'subtract') === null, 'B⊂A subtract → null (洞, 诚实)');
  ok(boolPath(B, A, 'subtract') === null, 'A⊂B 方向 subtract → null (空集)');
  const I2 = boolPath(B, A, 'intersect');
  ok(I2 !== null, 'A⊂B intersect 非 null');
  eq(area(I2), 100, 'A⊂B intersect 面积 = 内层 |B|');
  // 分离矩形 — 文档化语义: union/intersect → null, subtract → A 原样
  const D = rect(100, 100, 120, 120);
  ok(boolPath(A, D, 'union') === null, '分离 union → null');
  ok(boolPath(A, D, 'intersect') === null, '分离 intersect → null');
  const SD = boolPath(A, D, 'subtract');
  ok(SD !== null, '分离 subtract → A 原样 (选定语义)');
  eq(area(SD), 1200, '分离 subtract 面积 = |A|');
  // 全等 subtract → null (空集)
  ok(boolPath(A, rect(0, 0, 40, 30), 'subtract') === null, '全等矩形 subtract → null');
  const C1 = { verts: [[30, 15], [50, 15]], bulges: [1, 1] };
  const C2 = { verts: [[30, 15], [50, 15]], bulges: [1, 1] };
  ok(boolPath(C1, C2, 'subtract') === null, '全等圆 (共圆弧重叠) subtract → null');
  // 单点接触 (角对角) union → null (pinch 非简单环)
  const K = rect(40, 30, 60, 50);
  ok(boolPath(A, K, 'union') === null, '单点接触 union → null');
  ok(boolPath(A, K, 'intersect') === null, '单点接触 intersect → null');
  const SK = boolPath(A, K, 'subtract');
  ok(SK !== null, '单点接触 subtract → A');
  eq(area(SK), 1200, '单点接触 subtract 面积 = |A|');
});

// ============ T6 绕向无关 + 共边矩形 ============
test('T6 orientation/robustness', () => {
  // T1 同款, 但 A 以 CW 给出 → 结果须一致
  const Acw = reversePath(rect(0, 0, 40, 30));
  const B = rect(20, 10, 60, 40);
  const U = boolPath(Acw, B, 'union');
  ok(U !== null, 'CW 输入 union 非 null');
  eq(area(U), 2000, 'CW 输入 union 面积同 T1');
  ok(U.verts.length === 8, `CW 输入 union 顶点数 = 8 (实际 ${U.verts.length})`);
  const S = boolPath(Acw, B, 'subtract');
  eq(area(S), 800, 'CW 输入 subtract 面积同 T1');
  const I = boolPath(Acw, B, 'intersect');
  eq(area(I), 400, 'CW 输入 intersect 面积同 T1');
  // 共边矩形 (沿 x=40 全边接触) — 选定行为 (见 boolPath JSDoc):
  //   union → 共边塌缩外轮廓 (反向重叠边剔除, 接合处顶点保留, 共线相邻段不合并 → 6 顶点)
  //   subtract → A 原样; intersect → null (退化为线)
  const A2 = rect(0, 0, 40, 30);
  const B2 = rect(40, 0, 80, 30);
  const U2 = boolPath(A2, B2, 'union');
  ok(U2 !== null, '共边 union 非 null');
  eq(area(U2), 2400, '共边 union 面积 = 80×30');
  ok(U2.verts.length === 6, `共边 union 顶点数 = 6 (实际 ${U2.verts.length})`);
  ok(selfIntersections(U2) === 0, '共边 union 输出为简单环 (无自交)');
  const S2 = boolPath(A2, B2, 'subtract');
  ok(S2 !== null, '共边 subtract 非 null');
  eq(area(S2), 1200, '共边 subtract 面积 = |A|');
  ok(selfIntersections(S2) === 0, '共边 subtract 输出为简单环');
  ok(boolPath(A2, B2, 'intersect') === null, '共边 intersect → null (零面积, 诚实)');
});

// ============ T7 守恒模糊测试 (定值种子 LCG) ============
test('T7 conservation fuzz (200 对)', () => {
  // 自写 LCG (Numerical-Recipes 常数), 定值种子 → 完全确定性
  let seed = 0x12345678 >>> 0;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const rrect = () => {
    const x0 = rnd() * 70;
    const y0 = rnd() * 70;
    return rect(x0, y0, x0 + 4 + rnd() * 40, y0 + 4 + rnd() * 40);
  };
  let checked = 0;
  let maxErrU = 0;
  let maxErrS = 0;
  for (let k = 0; k < 200; k++) {
    const A = rrect();
    const B = rrect();
    const U = boolPath(A, B, 'union');
    const S = boolPath(A, B, 'subtract');
    const I = boolPath(A, B, 'intersect');
    if (U === null || S === null || I === null) continue;
    checked++;
    const eU = Math.abs(area(U) + area(I) - (area(A) + area(B)));
    const eS = Math.abs(area(S) - (area(A) - area(I)));
    maxErrU = Math.max(maxErrU, eU);
    maxErrS = Math.max(maxErrS, eS);
    if (eU > 1e-6) throw new Error(`第 ${k} 对: |U|+|I| ≠ |A|+|B| (误差 ${eU})`);
    if (eS > 1e-6) throw new Error(`第 ${k} 对: |S| ≠ |A|−|I| (误差 ${eS})`);
    for (const [nm, res] of [['U', U], ['S', S], ['I', I]]) {
      const si = selfIntersections(res);
      if (si !== 0) throw new Error(`第 ${k} 对: ${nm} 自交数 ${si} ≠ 0`);
    }
  }
  ok(checked >= 30, `三运算齐非 null 嘅样本数 = ${checked}/200 (≥30)`);
  note(`守恒最大误差: |U|+|I| 偏差 ${maxErrU.toExponential(3)}, |S| 偏差 ${maxErrS.toExponential(3)}`);
  ok(maxErrU <= 1e-6 && maxErrS <= 1e-6, '全部样本守恒 (≤1e-6) 且输出无自交');
});

// ============ T8 输入有效性守卫: 非有限坐标 + 自交输入 (GIGO) ============
test('T8 invalid-input guards', () => {
  const far = rect(100, 100, 110, 110);
  // 非有限坐标: 任何位置 / 任何运算 → null, 决不透传 NaN/Infinity 到输出
  const nanA = { verts: [[0, 0], [10, 0], [NaN, 10]], bulges: [0, 0, 0] };
  for (const op of ['union', 'subtract', 'intersect']) {
    ok(boolPath(nanA, far, op) === null, `NaN 顶点喺 A, ${op} → null`);
    ok(boolPath(far, nanA, op) === null, `NaN 顶点喺 B, ${op} → null`);
  }
  const allNaN = { verts: [[NaN, NaN], [NaN, NaN], [NaN, NaN]], bulges: [0, 0, 0] };
  ok(boolPath(allNaN, rect(0, 0, 10, 10), 'subtract') === null, '全 NaN A subtract → null');
  const infA = { verts: [[0, 0], [Infinity, 0], [10, 10]], bulges: [0, 0, 0] };
  ok(boolPath(infA, far, 'subtract') === null, 'Infinity 顶点 subtract → null');
  ok(boolPath(infA, far, 'union') === null, 'Infinity 顶点 union → null');
  // NaN + 几何重叠: 交点候选全被 NaN 比较静默丢弃, 旧版会走无交点回显通路
  ok(boolPath(nanA, rect(-5, -5, 5, 5), 'subtract') === null, 'NaN 顶点 + 重叠 B subtract → null');
  // 自交输入 (bulge ±50 巨弧, 密铺多处自交) — 无交点快速通路决不回显非简单环
  const selfX = { verts: [[0, 0], [10, 0], [10, 10], [0, 10]], bulges: [50, -50, 50, -50] };
  const nx = selfIntersections(selfX);
  ok(nx >= 1, `前置: 输入确系自交 (${nx} 处)`);
  const inner = rect(3, 3, 7, 7);
  ok(boolPath(selfX, inner, 'union') === null, '自交 A union → null (唔回显)');
  ok(boolPath(selfX, inner, 'intersect') === null, '自交 A intersect → null');
  ok(boolPath(selfX, inner, 'subtract') === null, '自交 A subtract → null');
  ok(boolPath(inner, selfX, 'union') === null, '自交 B union → null');
  // 天文 bulge (>= ~5e153, R² 溢出 double): signedPathArea = ±Infinity/NaN,
  // 旧版 normPathCCW 守卫被穿透 → 分离 subtract 回显非有限几何嘅环。
  // 修复后: 任何运算 / 任一侧 → null, 决不回显 pathArea=Infinity/NaN 嘅路径
  for (const hb of [5e153, 1e154, 1e308]) {
    const astro = { verts: [[0, 0], [10, 0]], bulges: [hb, hb] };
    for (const op of ['union', 'subtract', 'intersect']) {
      ok(boolPath(astro, far, op) === null, `天文 bulge ${hb} 喺 A, ${op} → null`);
      ok(boolPath(far, astro, op) === null, `天文 bulge ${hb} 喺 B, ${op} → null`);
    }
  }
  // 有限巨 bulge (R² 未溢出) 行为不变: subtract 仍由 polySimple 自交守卫拦截 → null
  const bigFinite = { verts: [[0, 0], [10, 0]], bulges: [1e77, 1e77] };
  ok(boolPath(bigFinite, far, 'subtract') === null, '有限巨 bulge 1e77 subtract 仍 → null (polySimple)');
  // 守卫不改变文档化语义: 简单分离 subtract 仍返回 A 原样
  const SD = boolPath(rect(0, 0, 40, 30), far, 'subtract');
  ok(SD !== null, '简单分离 subtract 仍非 null');
  eq(area(SD), 1200, '简单分离 subtract 面积仍 = |A| (语义不变)');
});

// ============ T9 boolPathAll 多环结果 ============
// 输出环通用校验: 坐标/bulge 全有限 + 简单 (密铺自交数 0)
function loopFinite(p) {
  for (const v of p.verts) if (!Number.isFinite(v[0]) || !Number.isFinite(v[1])) return false;
  for (const b of p.bulges) if (!Number.isFinite(b)) return false;
  return true;
}
function checkLoops(loops, label) {
  for (let i = 0; i < loops.length; i++) {
    ok(loopFinite(loops[i]), `${label} 环${i} 坐标/bulge 全有限`);
    const si = selfIntersections(loops[i]);
    ok(si === 0, `${label} 环${i} 简单 (自交数 ${si} = 0)`);
  }
}

test('T9a boolPathAll ring: rect − 内含圆 → [外环, 孔环]', () => {
  const A = rect(0, 0, 40, 30);
  const B = { verts: [[12, 15], [28, 15]], bulges: [1, 1] }; // 圆心 (20,15) r=8
  eq(area(B), 64 * PI, '前置: B 确系圆, 面积 = 64π');
  const L = boolPathAll(A, B, 'subtract');
  ok(L !== null && L.length === 2, `subtract → 恰好 2 环 (实际 ${L === null ? 'null' : L.length})`);
  const a0 = area(L[0]);
  const a1 = area(L[1]);
  const outer = a0 >= a1 ? L[0] : L[1];
  const inner = a0 >= a1 ? L[1] : L[0];
  eq(area(outer), 1200, '外环面积 = 1200');
  eq(area(inner), 64 * PI, '孔环面积 = 64π');
  eq(area(outer) + area(inner), 1200 + 64 * PI, '|环0|+|环1| = 1200 + 64π');
  // 孔环弧段须重构圆心 (20,15) R=8 (bulgeCenter/bulgeRadius, tol 1e-6)
  let nArc = 0;
  for (const b of inner.bulges) if (Math.abs(b) > 1e-9) nArc++;
  const onC = countArcsOnCircle(inner, 20, 15, 8);
  ok(nArc >= 1 && onC === nArc, `孔环全部 ${nArc} 段弧重构圆心(20,15) R=8 (${onC} 段符合)`);
  checkLoops(L, 'ring');
  ok(boolPath(A, B, 'subtract') === null, 'boolPath 同情形仍 → null (单环契约不变)');
});

test('T9b boolPathAll split: 竖条横切矩形 → 两碎块', () => {
  const A = rect(0, 0, 60, 30);
  const B = rect(25, -5, 35, 35); // 竖条贯穿 A
  const L = boolPathAll(A, B, 'subtract');
  ok(L !== null && L.length === 2, `subtract → 恰好 2 环 (实际 ${L === null ? 'null' : L.length})`);
  eq(area(L[0]), 750, '碎块1 面积 = 25×30', 1e-9);
  eq(area(L[1]), 750, '碎块2 面积 = 25×30', 1e-9);
  checkLoops(L, 'split');
  ok(boolPath(A, B, 'subtract') === null, 'boolPath 同情形 (多环) 仍 → null');
});

test('T9c boolPathAll 单环一致性 + 分离语义', () => {
  // T1 同款矩形对: 三运算均须返回恰好 [boolPath 嘅同一个环]
  const A = rect(0, 0, 40, 30);
  const B = rect(20, 10, 60, 40);
  for (const op of ['union', 'subtract', 'intersect']) {
    const single = boolPath(A, B, op);
    const all = boolPathAll(A, B, op);
    ok(single !== null && all !== null && all.length === 1,
      `${op}: boolPath 非 null 且 boolPathAll 恰好 1 环`);
    eq(area(all[0]), area(single), `${op}: 面积同 boolPath 一致`, 1e-9);
    ok(
      all[0].verts.length === single.verts.length &&
      all[0].verts.every((v, i) =>
        Math.hypot(v[0] - single.verts[i][0], v[1] - single.verts[i][1]) <= 1e-12) &&
      all[0].bulges.every((b, i) => Math.abs(b - single.bulges[i]) <= 1e-12),
      `${op}: 逐顶点/逐 bulge 同 boolPath 一致 (${all[0].verts.length} 顶点)`);
  }
  // 分离矩形: union/intersect → null, subtract → [A 原样] (文档化语义)
  const D = rect(100, 100, 120, 120);
  ok(boolPathAll(A, D, 'union') === null, '分离 union → null');
  ok(boolPathAll(A, D, 'intersect') === null, '分离 intersect → null');
  const SD = boolPathAll(A, D, 'subtract');
  ok(SD !== null && SD.length === 1, '分离 subtract → 恰好 [A]');
  eq(area(SD[0]), 1200, '分离 subtract 面积 = |A|', 1e-9);
  checkLoops(SD, '分离 subtract');
});

test('T9d boolPathAll intersect 多接触区: U 形 ∩ 横条', () => {
  const A = {
    verts: [[0, 0], [50, 0], [50, 30], [35, 30], [35, 10], [15, 10], [15, 30], [0, 30]],
    bulges: [0, 0, 0, 0, 0, 0, 0, 0],
  };
  eq(area(A), 1100, '前置: U 形面积 = 1500 − 400');
  const B = rect(0, 20, 50, 28); // 横条横跨两臂
  const L = boolPathAll(A, B, 'intersect');
  ok(L !== null && L.length === 2, `intersect → 恰好 2 环 (实际 ${L === null ? 'null' : L.length})`);
  eq(area(L[0]), 120, '区1 面积 = 15×8', 1e-9);
  eq(area(L[1]), 120, '区2 面积 = 15×8', 1e-9);
  checkLoops(L, 'U∩bar');
  ok(boolPath(A, B, 'intersect') === null, 'boolPath 同情形 (多环) 仍 → null');
});

test('T9e boolPathAll 诚实 null', () => {
  const A = rect(0, 0, 40, 30);
  ok(boolPathAll(A, rect(0, 0, 40, 30), 'subtract') === null, '全等路径 subtract → null (空集)');
  const C1 = { verts: [[30, 15], [50, 15]], bulges: [1, 1] };
  const C2 = { verts: [[30, 15], [50, 15]], bulges: [1, 1] };
  ok(boolPathAll(C1, C2, 'subtract') === null, '全等圆 subtract → null');
  ok(boolPathAll(A, rect(-10, -10, 50, 40), 'subtract') === null, 'A⊂B subtract → null (空集)');
  // 垃圾输入: NaN / Infinity / 天文 bulge / 自交 — 全部 null
  const nanA = { verts: [[0, 0], [10, 0], [NaN, 10]], bulges: [0, 0, 0] };
  for (const op of ['union', 'subtract', 'intersect']) {
    ok(boolPathAll(nanA, A, op) === null, `NaN 喺 A, ${op} → null`);
    ok(boolPathAll(A, nanA, op) === null, `NaN 喺 B, ${op} → null`);
  }
  const infA = { verts: [[0, 0], [Infinity, 0], [10, 10]], bulges: [0, 0, 0] };
  ok(boolPathAll(infA, A, 'subtract') === null, 'Infinity 顶点 subtract → null');
  const astro = { verts: [[0, 0], [10, 0]], bulges: [1e308, 1e308] };
  ok(boolPathAll(astro, rect(100, 100, 110, 110), 'subtract') === null, '天文 bulge subtract → null');
  const selfX = { verts: [[0, 0], [10, 0], [10, 10], [0, 10]], bulges: [50, -50, 50, -50] };
  ok(boolPathAll(selfX, rect(3, 3, 7, 7), 'union') === null, '自交输入 union → null');
  ok(boolPathAll(selfX, rect(3, 3, 7, 7), 'subtract') === null, '自交输入 subtract → null');
});

// ============ 总表 ============
console.log('\n========== PASS/FAIL 总表 ==========');
let nFail = 0;
for (const r of rows) {
  console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : ' — ' + r.info}`);
  if (!r.pass) nFail++;
}
console.log(`====================================`);
console.log(nFail === 0 ? `全部 ${rows.length} 组通过` : `${nFail}/${rows.length} 组失败`);
process.exit(nFail === 0 ? 0 : 1);
