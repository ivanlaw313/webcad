// massprops.test.mjs — 3D 物理属性纯数学模块 (src/cad/massProps.ts) 解析验证套件
// 跑法: npx -y tsx tests/massprops.test.mjs   (喺 C:\ClaudeCode\webcad 目录)
// 失败 → exit 1; 末尾输出 PASS/FAIL 总表。全部对照 ANALYTIC (闭式) 真值, 唔系自比。
//
// 验证目标 (全部解析公式):
//   单位立方体 (角落 / 居中):  V=s³, A=6s², 质心, I_center = m·s²/6 对角, 非对角≈0
//   长方体 (a,b,c):            Ixx=m(b²+c²)/12, Iyy=m(c²+a²)/12, Izz=m(a²+b²)/12
//   细分球 (半径 r):           V=4/3πr³ (网格容差内), I=2/5 m r² (主惯性矩三相等)
//   退化/空输入:               返零, 唔崩
//   密度单位:                  ρ g/cm³ = ρ·1e-9 tonne/mm³ → mass = ρ·1e-9·V

import { computeMassProps } from '../src/cad/massProps.ts';

const rows = [];
let notes = [];

function note(s) { notes.push(s); console.log(`    ${s}`); }
function ok(cond, msg) { if (!cond) throw new Error(msg); note('OK  ' + msg); }
function rel(actual, expected, msg, tol = 1e-9) {
  const denom = Math.max(1, Math.abs(expected));
  const err = Math.abs(actual - expected) / denom;
  if (!(err <= tol)) throw new Error(`${msg}: 期望 ${expected}, 实际 ${actual} (相对误差 ${err.toExponential(3)} > tol ${tol})`);
  note(`OK  ${msg}: ${fmt(actual)} ≈ ${fmt(expected)} (rel ${err.toExponential(2)})`);
}
function abs(actual, expected, msg, tol = 1e-9) {
  const err = Math.abs(actual - expected);
  if (!(err <= tol)) throw new Error(`${msg}: 期望 ${expected}, 实际 ${actual} (绝对误差 ${err.toExponential(3)} > tol ${tol})`);
  note(`OK  ${msg}: ${fmt(actual)} ≈ ${fmt(expected)} (abs ${err.toExponential(2)})`);
}
function fmt(x) { return Math.abs(x) >= 1e6 || (x !== 0 && Math.abs(x) < 1e-4) ? x.toExponential(4) : x.toFixed(6); }
function test(name, fn) {
  console.log(`\n## ${name}`);
  notes = [];
  try { fn(); rows.push({ name, pass: true, info: '' }); }
  catch (e) { rows.push({ name, pass: false, info: String(e.message) }); console.log(`    !! FAIL: ${e.message}`); }
}

// ── 网格生成 helper (独立写, 唔依赖被测模块) ──────────────────────────────

// 轴对齐长方体, 角落喺 (ox,oy,oz), 尺寸 a×b×c。12 块三角形, 绕向一致朝外 (CCW 外法线)。
function makeBox(a, b, c, ox = 0, oy = 0, oz = 0) {
  const v = [
    ox,     oy,     oz,      // 0
    ox + a, oy,     oz,      // 1
    ox + a, oy + b, oz,      // 2
    ox,     oy + b, oz,      // 3
    ox,     oy,     oz + c,  // 4
    ox + a, oy,     oz + c,  // 5
    ox + a, oy + b, oz + c,  // 6
    ox,     oy + b, oz + c,  // 7
  ];
  // 每个面两块三角形, 外法线朝外。
  const t = [
    0, 3, 2,  0, 2, 1,   // 底 z=oz   (法线 −z)
    4, 5, 6,  4, 6, 7,   // 顶 z=oz+c (法线 +z)
    0, 1, 5,  0, 5, 4,   // 前 y=oy   (法线 −y)
    2, 3, 7,  2, 7, 6,   // 后 y=oy+b (法线 +y)
    1, 2, 6,  1, 6, 5,   // 右 x=ox+a (法线 +x)
    0, 4, 7,  0, 7, 3,   // 左 x=ox   (法线 −x)
  ];
  return { vertices: v, triangles: t };
}

// UV 球 (经纬细分), 半径 r, 中心原点。纬向 stacks 段, 经向 slices 段。绕向朝外。
function makeSphere(r, stacks, slices) {
  const v = [];
  for (let i = 0; i <= stacks; i++) {
    const phi = (Math.PI * i) / stacks;        // 0..π (从北极)
    const sp = Math.sin(phi), cp = Math.cos(phi);
    for (let j = 0; j <= slices; j++) {
      const th = (2 * Math.PI * j) / slices;
      v.push(r * sp * Math.cos(th), r * sp * Math.sin(th), r * cp);
    }
  }
  const idx = (i, j) => i * (slices + 1) + j;
  const t = [];
  for (let i = 0; i < stacks; i++) {
    for (let j = 0; j < slices; j++) {
      const a = idx(i, j), b = idx(i + 1, j), c = idx(i + 1, j + 1), d = idx(i, j + 1);
      // 外法线朝外绕向 (a,b,c,d 逆时针睇向球心外)
      t.push(a, b, c, a, c, d);
    }
  }
  return { vertices: v, triangles: t };
}

const DENSITY = 7.85;                       // 钢 g/cm³
const RHO_T = DENSITY * 1e-9;               // tonne/mm³

// ============ T1 单位立方体 角落 (角落喺原点, 边长 s) ============
test('T1 单位立方体 (角落@原点, s=1)', () => {
  const s = 1;
  const box = makeBox(s, s, s, 0, 0, 0);
  const m = computeMassProps(box.vertices, box.triangles);   // 单位密度
  abs(m.volume, s ** 3, '体积 V = s³ = 1', 1e-12);
  abs(m.area, 6 * s * s, '表面积 A = 6s² = 6', 1e-12);
  abs(m.centroid[0], s / 2, '质心 x = s/2', 1e-12);
  abs(m.centroid[1], s / 2, '质心 y = s/2', 1e-12);
  abs(m.centroid[2], s / 2, '质心 z = s/2', 1e-12);
  // 关于质心: 单位密度 → m=V=1, I_center 对角 = m·s²/6 = 1/6, 非对角≈0
  const Ic = 1 * s * s / 6;
  abs(m.inertia[0][0], Ic, 'Ixx(center) = m·s²/6 = 1/6', 1e-12);
  abs(m.inertia[1][1], Ic, 'Iyy(center) = 1/6', 1e-12);
  abs(m.inertia[2][2], Ic, 'Izz(center) = 1/6', 1e-12);
  abs(m.inertia[0][1], 0, 'Ixy(center) ≈ 0', 1e-12);
  abs(m.inertia[0][2], 0, 'Ixz(center) ≈ 0', 1e-12);
  abs(m.inertia[1][2], 0, 'Iyz(center) ≈ 0', 1e-12);
  // 关于原点 (角落): Ixx_origin = m(s²/6 + (gy²+gz²)) = 1/6 + 2·(1/4) = 2/3 (平行轴反推)
  const Io = Ic + 1 * ((s / 2) ** 2 + (s / 2) ** 2);
  abs(m.inertiaOrigin[0][0], Io, 'Ixx(origin) = 1/6 + m(gy²+gz²) = 2/3', 1e-12);
  // 主惯性矩三相等 = 1/6
  for (const pm of m.principalMoments) abs(pm, Ic, '主惯性矩 = 1/6 (立方体各向同性)', 1e-12);
  ok(m.mass === undefined, '无 density → 无 mass 字段');
});

// ============ T2 单位立方体 居中 (中心@原点, 边长 s) ============
test('T2 单位立方体 (居中@原点, s=2)', () => {
  const s = 2;
  const box = makeBox(s, s, s, -s / 2, -s / 2, -s / 2);
  const m = computeMassProps(box.vertices, box.triangles, DENSITY);
  abs(m.volume, s ** 3, '体积 V = 8', 1e-12);
  abs(m.area, 6 * s * s, '表面积 A = 24', 1e-12);
  abs(m.centroid[0], 0, '质心 x ≈ 0', 1e-12);
  abs(m.centroid[1], 0, '质心 y ≈ 0', 1e-12);
  abs(m.centroid[2], 0, '质心 z ≈ 0', 1e-12);
  // 质量: mass = ρ(tonne/mm³)·V = 7.85e-9 · 8
  const mass = RHO_T * s ** 3;
  rel(m.mass, mass, 'mass = ρ·1e-9·V', 1e-12);
  // 居中 → 关于质心 == 关于原点。I = m·s²/6
  const Ic = mass * s * s / 6;
  rel(m.inertia[0][0], Ic, 'Ixx(center) = m·s²/6', 1e-10);
  rel(m.inertia[1][1], Ic, 'Iyy(center) = m·s²/6', 1e-10);
  rel(m.inertia[2][2], Ic, 'Izz(center) = m·s²/6', 1e-10);
  rel(m.inertiaOrigin[0][0], Ic, '居中: 关于原点 == 关于质心', 1e-10);
  abs(m.inertia[0][1], 0, '非对角 Ixy ≈ 0', mass * 1e-10);
});

// ============ T3 长方体 (a,b,c) 任意尺寸 — 惯性矩公式 ============
test('T3 长方体 (a=4,b=6,c=10, 居中)', () => {
  const a = 4, b = 6, c = 10;
  const box = makeBox(a, b, c, -a / 2, -b / 2, -c / 2);
  const m = computeMassProps(box.vertices, box.triangles, DENSITY);
  const V = a * b * c;
  abs(m.volume, V, '体积 V = a·b·c = 240', 1e-9);
  abs(m.area, 2 * (a * b + b * c + c * a), '表面积 = 2(ab+bc+ca)', 1e-9);
  const mass = RHO_T * V;
  rel(m.mass, mass, 'mass = ρ·V', 1e-12);
  // 长方体关于中心: Ixx = m(b²+c²)/12, Iyy = m(c²+a²)/12, Izz = m(a²+b²)/12
  rel(m.inertia[0][0], mass * (b * b + c * c) / 12, 'Ixx = m(b²+c²)/12', 1e-10);
  rel(m.inertia[1][1], mass * (c * c + a * a) / 12, 'Iyy = m(c²+a²)/12', 1e-10);
  rel(m.inertia[2][2], mass * (a * a + b * b) / 12, 'Izz = m(a²+b²)/12', 1e-10);
  // 主惯性矩升序 = sort([Ixx,Iyy,Izz])。a<b<c → Izz最小(a²+b²), Ixx最大(b²+c²)
  const want = [
    mass * (a * a + b * b) / 12,   // Izz 最细
    mass * (c * c + a * a) / 12,   // Iyy 中
    mass * (b * b + c * c) / 12,   // Ixx 最大
  ];
  rel(m.principalMoments[0], want[0], '主惯性矩 I1 (最小) = m(a²+b²)/12', 1e-9);
  rel(m.principalMoments[1], want[1], '主惯性矩 I2 (中) = m(c²+a²)/12', 1e-9);
  rel(m.principalMoments[2], want[2], '主惯性矩 I3 (最大) = m(b²+c²)/12', 1e-9);
  ok(m.principalMoments[0] <= m.principalMoments[1] && m.principalMoments[1] <= m.principalMoments[2], '主惯性矩升序排列');
});

// ============ T4 平行轴定理 (长方体平移离原点) ============
test('T4 平行轴定理 (长方体角落@原点)', () => {
  const a = 3, b = 5, c = 7;
  const box = makeBox(a, b, c, 0, 0, 0);   // 角落喺原点 → 质心 (a/2,b/2,c/2)
  const m = computeMassProps(box.vertices, box.triangles);  // 单位密度, mass=V
  const V = a * b * c;
  abs(m.centroid[0], a / 2, '质心 x = a/2', 1e-10);
  abs(m.centroid[1], b / 2, '质心 y = b/2', 1e-10);
  abs(m.centroid[2], c / 2, '质心 z = c/2', 1e-10);
  // 关于质心 Ixx = V(b²+c²)/12 (单位密度 m=V)
  const Icxx = V * (b * b + c * c) / 12;
  rel(m.inertia[0][0], Icxx, 'Ixx(center) = V(b²+c²)/12', 1e-10);
  // 平行轴: Ixx(origin) = Ixx(center) + m(gy²+gz²)
  const gy = b / 2, gz = c / 2;
  const Ioxx = Icxx + V * (gy * gy + gz * gz);
  rel(m.inertiaOrigin[0][0], Ioxx, 'Ixx(origin) = Ixx(c) + V(gy²+gz²)', 1e-10);
  // 关于原点角落嘅长方体闭式: Ixx_corner = m(b²+c²)/3
  rel(m.inertiaOrigin[0][0], V * (b * b + c * c) / 3, 'Ixx(origin) = V(b²+c²)/3 (角落公式)', 1e-10);
  // 惯性积 (关于原点角落): Ixy_origin = −V·gx·gy = −V·(a/2)(b/2) = −V·ab/4
  rel(m.inertiaOrigin[0][1], -V * (a / 2) * (b / 2), 'Ixy(origin) = −m·gx·gy', 1e-10);
});

// ============ T5 细分球 (V=4/3πr³, I=2/5 m r²) ============
test('T5 细分球 (r=10, stacks=128 slices=256)', () => {
  const r = 10, stacks = 128, slices = 256;
  const sph = makeSphere(r, stacks, slices);
  const m = computeMassProps(sph.vertices, sph.triangles, DENSITY);
  const Vexact = (4 / 3) * Math.PI * r ** 3;
  // 网格内接 → 略小于解析球; 容差随细分收紧。128×256 → <0.05%
  rel(m.volume, Vexact, '体积 V ≈ 4/3πr³ (网格容差)', 5e-4);
  // 质心喺原点
  abs(m.centroid[0], 0, '质心 x ≈ 0', r * 1e-9);
  abs(m.centroid[1], 0, '质心 y ≈ 0', r * 1e-9);
  abs(m.centroid[2], 0, '质心 z ≈ 0', r * 1e-9);
  // 实心球 I = 2/5 m r² (三轴相等)。用网格实际 mass 算理论值 → 隔离体积离散误差。
  const Itheory = (2 / 5) * m.mass * r * r;
  rel(m.inertia[0][0], Itheory, 'Ixx = 2/5 m r²', 2e-3);
  rel(m.inertia[1][1], Itheory, 'Iyy = 2/5 m r²', 2e-3);
  rel(m.inertia[2][2], Itheory, 'Izz = 2/5 m r²', 2e-3);
  // 球各向同性 → 主惯性矩三相等
  rel(m.principalMoments[0], m.principalMoments[2], '主惯性矩 I1 ≈ I3 (球各向同性)', 5e-3);
  // 非对角惯性积 ≈ 0 (对称)
  abs(m.inertia[0][1], 0, 'Ixy ≈ 0', m.mass * r * r * 1e-3);
  abs(m.inertia[0][2], 0, 'Ixz ≈ 0', m.mass * r * r * 1e-3);
  abs(m.inertia[1][2], 0, 'Iyz ≈ 0', m.mass * r * r * 1e-3);
});

// ============ T6 密度单位换算 (g/cm³ → tonne/mm³) ============
test('T6 密度单位 (ρ=1 g/cm³ → mass = 1e-9·V)', () => {
  const box = makeBox(100, 100, 100, 0, 0, 0);  // 100mm 立方 → V=1e6 mm³
  const V = 1e6;
  const m1 = computeMassProps(box.vertices, box.triangles, 1.0);  // 水 1 g/cm³
  // 1e6 mm³ = 1 升 = 1 cm·... 实际: 100mm 立方 = 1000 cm³ = 1 L; 水 1g/cm³ → 1000 g = 1 kg = 1e-3 tonne
  rel(m1.mass, 1.0 * 1e-9 * V, 'ρ=1 → mass = 1e-9·V = 1e-3 tonne (1kg)', 1e-12);
  abs(m1.mass, 1e-3, '100mm 水立方 = 1kg = 1e-3 tonne', 1e-15);
  // mass 应同密度线性
  const m2 = computeMassProps(box.vertices, box.triangles, 2.0);
  rel(m2.mass, 2 * m1.mass, 'mass 同 density 成正比', 1e-12);
  // 单位密度 (无 density) 嘅惯性 × ρ_tonne == 带密度惯性
  const m0 = computeMassProps(box.vertices, box.triangles);
  rel(m1.inertia[0][0], m0.inertia[0][0] * 1e-9, '带密度惯性 = 单位密度惯性 × ρ_tonne', 1e-10);
});

// ============ T7 退化 / 空输入 优雅处理 ============
test('T7 退化/空输入 (返零, 唔崩)', () => {
  const empty = computeMassProps([], []);
  abs(empty.volume, 0, '空输入 V = 0', 0);
  abs(empty.area, 0, '空输入 A = 0', 0);
  ok(empty.centroid.every((x) => x === 0), '空输入 质心 = [0,0,0]');
  ok(empty.principalMoments.every((x) => x === 0), '空输入 主惯性矩 = [0,0,0]');
  // 单块三角形 (无体积) → V=0 但有面积
  const oneTri = computeMassProps([0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]);
  abs(oneTri.volume, 0, '单三角 V = 0 (无体积)', 1e-12);
  rel(oneTri.area, 0.5, '单三角 A = 0.5 (报面积)', 1e-12);
  // 退化三角 (共线点) → 唔崩
  const degen = computeMassProps([0, 0, 0, 1, 0, 0, 2, 0, 0], [0, 1, 2]);
  abs(degen.volume, 0, '共线退化三角 V = 0', 1e-12);
  // 越界索引 → 跳过, 唔崩
  const badIdx = computeMassProps([0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 99]);
  abs(badIdx.volume, 0, '越界索引被跳过, 唔崩', 1e-12);
  // 畀咗 density 嘅空输入有 mass=0
  const emptyD = computeMassProps([], [], 5);
  abs(emptyD.mass, 0, '空输入+density → mass = 0', 0);
});

// ============ T8 绕向反转 (inward) 仍返正体积/质量 ============
test('T8 绕向反转 (法线朝内 → 物理量取正)', () => {
  const box = makeBox(2, 3, 4, 0, 0, 0);
  // 反转每块三角形绕向 (i1<->i2) → 体积带负号嘅汤
  const flipped = [];
  for (let i = 0; i < box.triangles.length; i += 3) {
    flipped.push(box.triangles[i], box.triangles[i + 2], box.triangles[i + 1]);
  }
  const m = computeMassProps(box.vertices, flipped, DENSITY);
  abs(m.volume, 2 * 3 * 4, '反绕向 体积仍 = 24 (取正)', 1e-9);
  ok(m.mass > 0, '反绕向 质量 > 0');
  // 惯性仍正 (对角元 > 0)
  ok(m.inertia[0][0] > 0 && m.inertia[1][1] > 0 && m.inertia[2][2] > 0, '反绕向 惯性对角元 > 0');
  // 同正绕向结果一致
  const mNorm = computeMassProps(box.vertices, box.triangles, DENSITY);
  rel(m.inertia[0][0], mNorm.inertia[0][0], '反绕向 Ixx == 正绕向 Ixx', 1e-9);
  rel(m.principalMoments[0], mNorm.principalMoments[0], '反绕向 主惯性矩一致', 1e-9);
});

// ============ 总表 ============
console.log('\n========== PASS/FAIL 总表 ==========');
let nFail = 0;
for (const r of rows) {
  console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : ' — ' + r.info}`);
  if (!r.pass) nFail++;
}
console.log('====================================');
console.log(nFail === 0 ? `全部 ${rows.length}/${rows.length} 组通过` : `${rows.length - nFail}/${rows.length} 组通过 (${nFail} 组失败)`);
process.exit(nFail === 0 ? 0 : 1);
