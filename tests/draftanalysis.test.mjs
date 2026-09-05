// draftanalysis.test.mjs — 「拔模角分析 vs 脱模方向」（src/cad/draftAnalysis.ts）解析验证
//
// 对标 Fusion Inspect ▸ Draft Analysis：畀脱模方向 pullDir，逐面算拔模角并分类。
// 解析真值（无外部依赖，纯几何）：
//   · 轴对齐 box，pullDir=[0,0,1]：
//       +Z 顶面 法向(0,0,1) → draft = asin(+1) = +90°（positive）
//       −Z 底面 法向(0,0,-1) → draft = asin(-1) = −90°（negative）
//       四个侧面 法向⊥(0,0,1) → draft = asin(0) = 0°（vertical，要侧抽）
//   · 单张 45° 斜面：法向同 pull 成 45° → draft ≈ +45°（positive）。
//
// 跑法（喺 C:\ClaudeCode\webcad 目录执行）：
//   npx -y tsx tests/draftanalysis.test.mjs
// 全部通过 → exit 0；任一失败 → exit 1。

import { analyzeDraft } from '../src/cad/draftAnalysis.ts';

// ------------------------------------------------------------------ 小框架（同 facefingerprint.test.mjs 一致）
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
function fmt(x, d = 4) { return Number(x).toFixed(d); }
function approx(a, b, eps = 1e-6) { return Math.abs(a - b) <= eps; }

// ------------------------------------------------------------------ 测试网格：box + faceGroups（外向绕向）
//
// 顶点编号 b：bit0=x, bit1=y, bit2=z。每张面 = 一个 faceGroup（2 三角，绕向令法向朝外）。
// faceGroups.start/count 系 triangles【数组下标】(=面序×6)。面顺序：z=0,z=sz,y=0,y=sy,x=0,x=sx。
function makeBox(sx, sy, sz, faceIds = [1, 2, 3, 4, 5, 6]) {
  const vertices = [];
  for (let b = 0; b < 8; b++) {
    vertices.push((b & 1) ? sx : 0, (b & 2) ? sy : 0, (b & 4) ? sz : 0);
  }
  const triangles = [
    0, 2, 3, 0, 3, 1, // z=0  法向 -Z
    4, 5, 7, 4, 7, 6, // z=sz 法向 +Z
    0, 1, 5, 0, 5, 4, // y=0  法向 -Y
    2, 6, 7, 2, 7, 3, // y=sy 法向 +Y
    0, 4, 6, 0, 6, 2, // x=0  法向 -X
    1, 3, 7, 1, 7, 5, // x=sx 法向 +X
  ];
  const faceGroups = [];
  for (let f = 0; f < 6; f++) faceGroups.push({ start: f * 6, count: 6, faceId: faceIds[f] });
  return { vertices, triangles, faceGroups };
}

// 由 report 取某 faceId 嘅面结果
function byId(report, faceId) {
  const f = report.faces.find((x) => x.faceId === faceId);
  assert(f, `report 缺 faceId ${faceId}`);
  return f;
}

// ================================================================== T1 box +Z 顶面 → +90° positive
test('T1 box pullDir=[0,0,1]：+Z 顶面 draft≈+90° positive', () => {
  const box = makeBox(10, 20, 30);
  const r = analyzeDraft(box.vertices, box.triangles, box.faceGroups, [0, 0, 1]);
  const top = byId(r, 2); // faceId 2 = z=sz 面（法向 +Z）
  assert(approx(top.draftAngleDeg, 90), `+Z 面拔模角应 +90°，实得 ${fmt(top.draftAngleDeg)}`);
  assert(top.cls === 'positive', `+Z 面应 positive，实得 ${top.cls}`);
  return `+Z 面 draft=${fmt(top.draftAngleDeg)}° → positive`;
});

// ================================================================== T2 box −Z 底面 → −90° negative
test('T2 box pullDir=[0,0,1]：−Z 底面 draft≈−90° negative', () => {
  const box = makeBox(10, 20, 30);
  const r = analyzeDraft(box.vertices, box.triangles, box.faceGroups, [0, 0, 1]);
  const bot = byId(r, 1); // faceId 1 = z=0 面（法向 -Z）
  assert(approx(bot.draftAngleDeg, -90), `−Z 面拔模角应 −90°，实得 ${fmt(bot.draftAngleDeg)}`);
  assert(bot.cls === 'negative', `−Z 面应 negative，实得 ${bot.cls}`);
  return `−Z 面 draft=${fmt(bot.draftAngleDeg)}° → negative`;
});

// ================================================================== T3 box 四个侧面 → 0° vertical
test('T3 box pullDir=[0,0,1]：四个侧面 draft≈0° vertical（要侧抽）', () => {
  const box = makeBox(10, 20, 30);
  const r = analyzeDraft(box.vertices, box.triangles, box.faceGroups, [0, 0, 1]);
  const sides = [3, 4, 5, 6]; // y=0,y=sy,x=0,x=sx
  for (const id of sides) {
    const f = byId(r, id);
    assert(approx(f.draftAngleDeg, 0), `侧面 ${id} 拔模角应 0°，实得 ${fmt(f.draftAngleDeg)}`);
    assert(f.cls === 'vertical', `侧面 ${id} 应 vertical，实得 ${f.cls}`);
  }
  return `4 个侧面全 draft≈0° → vertical（4/4）`;
});

// ================================================================== T4 box min/max 汇总 = [-90,+90]
test('T4 box pullDir=[0,0,1]：min=−90, max=+90', () => {
  const box = makeBox(10, 20, 30);
  const r = analyzeDraft(box.vertices, box.triangles, box.faceGroups, [0, 0, 1]);
  assert(approx(r.min, -90), `min 应 −90，实得 ${fmt(r.min)}`);
  assert(approx(r.max, 90), `max 应 +90，实得 ${fmt(r.max)}`);
  assert(r.faces.length === 6, `应 6 面，实得 ${r.faces.length}`);
  return `min=${fmt(r.min)}, max=${fmt(r.max)}, 6 面`;
});

// ================================================================== T5 45° 斜面 → +45° positive
test('T5 单张 45° 斜面 pullDir=[0,0,1]：draft≈+45° positive', () => {
  // 斜面：法向 = 单位(1,0,1) = (0.7071,0,0.7071)，同 +Z 成 45°。
  // 用一张矩形（两三角）放喺 z=x 平面：四角 (0,0,0),(1,0,1),(1,1,1),(0,1,0)。
  // 绕向令 cross 指向 +x+z 半空间（法向 (-Δz,0,Δx) 取正向）。
  const vertices = [
    0, 0, 0, // 0
    1, 0, 1, // 1
    1, 1, 1, // 2
    0, 1, 0, // 3
  ];
  // 三角 (0,2,3),(0,1,2)：绕向令 cross(e1,e2) 朝 +Z 半空间（dot 同 [0,0,1] > 0）→ +45°。
  const triangles = [0, 2, 3, 0, 1, 2];
  const faceGroups = [{ start: 0, count: 6, faceId: 42 }];
  const r = analyzeDraft(vertices, triangles, faceGroups, [0, 0, 1]);
  const f = byId(r, 42);
  assert(approx(Math.abs(f.draftAngleDeg), 45, 1e-6), `45° 斜面拔模角应 ±45°，实得 ${fmt(f.draftAngleDeg)}`);
  // 选嘅绕向令法向有正 +Z 分量 → +45° positive。
  assert(f.draftAngleDeg > 0, `斜面应正拔模(+45°)，实得 ${fmt(f.draftAngleDeg)}（绕向反咗？）`);
  assert(f.cls === 'positive', `45° 斜面应 positive，实得 ${f.cls}`);
  return `45° 斜面 draft=${fmt(f.draftAngleDeg)}° → positive`;
});

// ================================================================== T6 容差带：|draft|<tol → vertical
test('T6 tolDeg：0.5° 微拔模 < tol(1°) → vertical；> tol → positive', () => {
  // 法向 = (sinθ, 0, cosθ)，θ 系法向同 +Z 夹角 → dot([0,0,1]) = cosθ → draft = asin(cosθ) = 90−θ°。
  // 想 draft = 0.5° → θ = 89.5°。构造一张法向 = (sin89.5°,0,cos89.5°) 嘅小斜面。
  const θ = (89.5 * Math.PI) / 180;
  const nx = Math.sin(θ), nz = Math.cos(θ);
  // 平面过原点法向 (nx,0,nz)，取面内两正交方向：u=(0,1,0)，v = n×u = (nz,0,-nx)（已单位）。
  const ux = 0, uy = 1, uz = 0;
  const vx = nz, vy = 0, vz = -nx;
  // 矩形四角 = ±u ±v；绕向 (0,1,2,)(0,2,3) 令法向 = +（nx,0,nz）。
  const P = (s, t) => [s * ux + t * vx, s * uy + t * vy, s * uz + t * vz];
  const c0 = P(-1, -1), c1 = P(1, -1), c2 = P(1, 1), c3 = P(-1, 1);
  const vertices = [...c0, ...c1, ...c2, ...c3];
  const triangles = [0, 1, 2, 0, 2, 3];
  const r = analyzeDraft(vertices, triangles, [{ start: 0, count: 6, faceId: 7 }], [0, 0, 1]);
  const f = byId(r, 7);
  assert(approx(Math.abs(f.draftAngleDeg), 0.5, 1e-4), `应 ≈0.5°，实得 ${fmt(f.draftAngleDeg)}`);
  assert(f.cls === 'vertical', `0.5° < tol(1°) 应 vertical，实得 ${f.cls}`);
  // 同一面，tol 收紧到 0.2° → 应升级做 positive（绕向令 +draft）。
  const r2 = analyzeDraft(vertices, triangles, [{ start: 0, count: 6, faceId: 7 }], [0, 0, 1], { tolDeg: 0.2 });
  const f2 = byId(r2, 7);
  assert(f2.cls === (f2.draftAngleDeg > 0 ? 'positive' : 'negative'),
    `tol=0.2° 时 0.5° 应越过门槛（非 vertical），实得 ${f2.cls}`);
  return `draft=${fmt(f.draftAngleDeg)}°：tol=1°→vertical, tol=0.2°→${f2.cls}`;
});

// ================================================================== T7 退化：零长 pullDir → 全 vertical, draft=0
test('T7 退化 pullDir=[0,0,0]：全部面 draft=0、vertical（保守临界，min=max=0）', () => {
  const box = makeBox(10, 20, 30);
  const r = analyzeDraft(box.vertices, box.triangles, box.faceGroups, [0, 0, 0]);
  for (const f of r.faces) {
    assert(f.draftAngleDeg === 0, `零长 pull 面 ${f.faceId} draft 应 0，实得 ${fmt(f.draftAngleDeg)}`);
    assert(f.cls === 'vertical', `零长 pull 面 ${f.faceId} 应 vertical，实得 ${f.cls}`);
  }
  assert(r.min === 0 && r.max === 0, `min/max 应 0/0，实得 ${fmt(r.min)}/${fmt(r.max)}`);
  return `零长 pullDir → 6 面全 draft=0 vertical，min=max=0`;
});

// ================================================================== T8 非轴脱模方向：等价旋转下 +90/−90/0 不变
test('T8 pullDir=[0,1,0]：±Y 面 ±90、其余 0（脱模方向旋转一致性）', () => {
  const box = makeBox(10, 20, 30);
  const r = analyzeDraft(box.vertices, box.triangles, box.faceGroups, [0, 1, 0]);
  assert(approx(byId(r, 4).draftAngleDeg, 90), `+Y 面(4)应 +90，实得 ${fmt(byId(r, 4).draftAngleDeg)}`); // y=sy
  assert(approx(byId(r, 3).draftAngleDeg, -90), `−Y 面(3)应 −90，实得 ${fmt(byId(r, 3).draftAngleDeg)}`); // y=0
  for (const id of [1, 2, 5, 6]) {
    assert(approx(byId(r, id).draftAngleDeg, 0), `面 ${id} 应 0，实得 ${fmt(byId(r, id).draftAngleDeg)}`);
  }
  return `pullDir=[0,1,0]：+Y=+90, −Y=−90, 其余 0（4/4）`;
});

// ------------------------------------------------------------------ 汇总
const failed = rows.filter((r) => !r.pass);
console.log(`\n${rows.length - failed.length}/${rows.length} passed`);
if (failed.length) {
  console.log('FAILED: ' + failed.map((r) => r.name).join(', '));
  process.exit(1);
}
process.exit(0);
