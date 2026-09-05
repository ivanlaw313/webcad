// filletr1.test.mjs — R1「修改圆角」纯数学核（src/cad/filletMath.ts）验证
//
// 覆盖三种圆角嘅可测逻辑（内核路径靠 worker guard + HARD FLOOR，唔喺呢度测）：
//   1. 弦高换算 chordToRadius（β=90°→r=c/√2、β=60°/120°）+ betaFromNormals（盒边外法向→90°）
//   2. 变半径 (U,r) 律 buildChordRadiusLaw + 收进 taper 律 buildSetbackLaw + edgesShareVertex
//   3. 面圆角切点解析：planePlaneFilletSetback（平面对）/ planeCylinderFilletContacts（柱面对）+ classifyFacePair
//   4. HARD FLOOR 判据 bboxExtentsSane（有界 + 无爆冲）
//
// 跑法（喺 C:\ClaudeCode\webcad 目录执行）：
//   npx -y tsx tests/filletr1.test.mjs
// 全部通过 → exit 0；任一失败 → exit 1。

import {
  chordToRadius, betaFromNormals, chordRadiusFromNormals, buildChordRadiusLaw,
  buildSetbackLaw, edgesShareVertex,
  planePlaneFilletSetback, planeCylinderFilletContacts, classifyFacePair,
  bboxExtentsSane,
} from '../src/cad/filletMath.ts';

// ------------------------------------------------------------------ 小框架
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
function near(a, b, tol = 1e-6) { return Math.abs(a - b) <= tol; }
function fmt(x, d = 4) { return Number(x).toFixed(d); }
const DEG = Math.PI / 180;

// ================================================================== 1. 弦高换算
test('chordToRadius β=90° → r=c/√2', () => {
  const c = 10;
  const r = chordToRadius(c, 90 * DEG);
  assert(near(r, c / Math.SQRT2, 1e-9), `r=${fmt(r)} 应=${fmt(c / Math.SQRT2)}`);
  return `c=10 → r=${fmt(r, 4)}`;
});

test('chordToRadius β=60° → r=c/(2cos30°)', () => {
  const c = 12;
  const r = chordToRadius(c, 60 * DEG);
  const want = c / (2 * Math.cos(30 * DEG));
  assert(near(r, want, 1e-9), `r=${fmt(r)} 应=${fmt(want)}`);
  return `c=12 → r=${fmt(r, 4)} (≈0.5774c)`;
});

test('chordToRadius β=120° → r=c (2cos60°=1)', () => {
  const c = 7;
  const r = chordToRadius(c, 120 * DEG);
  assert(near(r, c, 1e-9), `r=${fmt(r)} 应=${fmt(c)}`);
  return `c=7 → r=${fmt(r, 4)}`;
});

test('chordToRadius 单调：β 越大半径越大（同弦长）', () => {
  const c = 10;
  const r60 = chordToRadius(c, 60 * DEG);
  const r90 = chordToRadius(c, 90 * DEG);
  const r120 = chordToRadius(c, 120 * DEG);
  assert(r60 < r90 && r90 < r120, `应递增：${fmt(r60)} < ${fmt(r90)} < ${fmt(r120)}`);
  return `${fmt(r60, 2)} < ${fmt(r90, 2)} < ${fmt(r120, 2)}`;
});

test('chordToRadius β→π clamp（唔炸到 Infinity）', () => {
  const r = chordToRadius(10, 179.9 * DEG);
  assert(Number.isFinite(r) && r > 0, `应有限正数，得 ${r}`);
  return `β=179.9° → r=${fmt(r, 1)}（clamp 生效）`;
});

test('chordToRadius β≤0 退化 → 半弦', () => {
  const r = chordToRadius(8, 0);
  assert(near(r, 4, 1e-9), `应=4，得 ${fmt(r)}`);
  return `c=8, β=0 → r=${fmt(r)}`;
});

// ================================================================== betaFromNormals
test('betaFromNormals 盒边（两外法向 ⟂）→ 90°', () => {
  const b = betaFromNormals([0, 0, 1], [1, 0, 0]);
  assert(near(b, 90 * DEG, 1e-9), `β=${fmt(b / DEG, 3)}° 应=90°`);
  return `⟂ 法向 → β=${fmt(b / DEG, 1)}°`;
});

test('betaFromNormals 平行外法向（共面）→ 180°（无棱=直）', () => {
  // 两面同外法向 = 共面/无真棱 → 内部材料角 = 180°（平）。β = π − θ(=0) = π。
  const b = betaFromNormals([0, 0, 1], [0, 0, 1]);
  assert(near(b, Math.PI, 1e-9), `β=${fmt(b / DEG)}° 应=180°`);
  return `平行 → β=${fmt(b / DEG, 1)}°`;
});

test('betaFromNormals 反向外法向（薄刃）→ 0°', () => {
  // 两面反外法向 = 收窄到零厚刀刃 → 内部材料角 → 0°。β = π − θ(=π) = 0。
  const b = betaFromNormals([0, 0, 1], [0, 0, -1]);
  assert(near(b, 0, 1e-9), `β=${fmt(b / DEG)}° 应=0°`);
  return `反向 → β=${fmt(b / DEG, 1)}°`;
});

test('betaFromNormals 60° 夹角外法向 → β=120°', () => {
  // 两外法向夹 60° → β = 180−60 = 120°
  const n2 = [Math.cos(60 * DEG), 0, Math.sin(60 * DEG)];
  const b = betaFromNormals([1, 0, 0], n2);
  assert(near(b, 120 * DEG, 1e-9), `β=${fmt(b / DEG, 3)}° 应=120°`);
  return `外法向夹 60° → β=${fmt(b / DEG, 1)}°`;
});

test('betaFromNormals 退化零向量 → 缺省 90°', () => {
  const b = betaFromNormals([0, 0, 0], [1, 0, 0]);
  assert(near(b, 90 * DEG, 1e-9), `应缺省 90°，得 ${fmt(b / DEG)}°`);
  return `零向量 → β=${fmt(b / DEG)}°`;
});

test('chordRadiusFromNormals 盒边组合 = c/√2', () => {
  const r = chordRadiusFromNormals(10, [0, 0, 1], [0, 1, 0]);
  assert(near(r, 10 / Math.SQRT2, 1e-9), `r=${fmt(r)} 应=${fmt(10 / Math.SQRT2)}`);
  return `盒边 c=10 → r=${fmt(r, 3)}`;
});

// ================================================================== 2. 变半径 (U,r) 律
test('buildChordRadiusLaw 逐采样点换算', () => {
  const c = 10;
  const samples = [{ u: 0, beta: 90 * DEG }, { u: 0.5, beta: 60 * DEG }, { u: 1, beta: 120 * DEG }];
  const law = buildChordRadiusLaw(samples, c);
  assert(law.length === 3, `应 3 点，得 ${law.length}`);
  assert(near(law[0].r, c / Math.SQRT2, 1e-9), 'u=0 半径错');
  assert(near(law[1].r, c / (2 * Math.cos(30 * DEG)), 1e-9), 'u=0.5 半径错');
  assert(near(law[2].r, c, 1e-9), 'u=1 半径错');
  assert(law[0].u === 0 && law[2].u === 1, 'u 参数错');
  return `法：R=[${law.map((p) => fmt(p.r, 2)).join(', ')}]`;
});

test('buildChordRadiusLaw 空采样 → 空律', () => {
  assert(buildChordRadiusLaw([], 10).length === 0, '空输入应空输出');
  return 'ok';
});

// ================================================================== 收进 taper 律
test('buildSetbackLaw ratio=0 → 平律（两点全 r）', () => {
  const law = buildSetbackLaw(5, 0, true, true);
  assert(law.length === 2, `应 2 点，得 ${law.length}`);
  assert(law.every((p) => near(p.r, 5)), '应全 r=5');
  return `平律 R=[${law.map((p) => p.r).join(',')}]`;
});

test('buildSetbackLaw 两端都唔接触 → 平律', () => {
  const law = buildSetbackLaw(5, 0.5, false, false);
  assert(law.length === 2 && law.every((p) => near(p.r, 5)), '无共享顶点应平律');
  return 'ok';
});

test('buildSetbackLaw ratio=0.4 touchLo → u=0 端降、中段保 r', () => {
  const r = 5, sb = 0.4;
  const law = buildSetbackLaw(r, sb, true, false);
  assert(law.length === 4, `应 4 控制点，得 ${law.length}`);
  assert(near(law[0].u, 0) && near(law[3].u, 1), '端点 u 错');
  assert(near(law[0].r, r * (1 - sb), 1e-9), `u=0 应降到 ${fmt(r * (1 - sb))}，得 ${fmt(law[0].r)}`);
  assert(near(law[3].r, r, 1e-9), 'u=1 端唔接触应保 r');
  // 中段两点保目标 r
  assert(near(law[1].r, r) && near(law[2].r, r), '中段应保 r');
  // u 严格升序
  for (let i = 1; i < law.length; i++) assert(law[i].u > law[i - 1].u, 'u 应严格升序');
  return `法 U=[${law.map((p) => fmt(p.u, 2)).join(',')}] R=[${law.map((p) => fmt(p.r, 2)).join(',')}]`;
});

test('buildSetbackLaw 两端都接触 → 两端都降', () => {
  const r = 6, sb = 0.5;
  const law = buildSetbackLaw(r, sb, true, true);
  assert(near(law[0].r, r * 0.5, 1e-9) && near(law[3].r, r * 0.5, 1e-9), '两端应都降到半 r');
  assert(near(law[1].r, r) && near(law[2].r, r), '中段保 r');
  return `两端 R0=${fmt(law[0].r)} 中=${fmt(law[1].r)}`;
});

test('buildSetbackLaw ratio 钳到 [0,0.95]', () => {
  const law = buildSetbackLaw(10, 5, true, false);   // ratio 超界 → 钳 0.95
  assert(law[0].r >= 0.4 && law[0].r <= 0.6, `端半径应≈10·0.05=0.5，得 ${fmt(law[0].r)}`);
  return `钳后端半径=${fmt(law[0].r, 3)}`;
});

// ================================================================== edgesShareVertex
test('edgesShareVertex 共享顶点识别 + 接触端', () => {
  const a = { p0: [0, 0, 0], p1: [10, 0, 0] };
  const b = { p0: [10, 0, 0], p1: [10, 10, 0] };   // 共享 (10,0,0) = a 嘅 hi 端
  const sv = edgesShareVertex(a, b);
  assert(sv.share, '应识别共享');
  assert(sv.aTouchHi && !sv.aTouchLo, 'a 应喺 hi 端接触');
  return 'aTouchHi=true';
});

test('edgesShareVertex 唔共享 → false', () => {
  const a = { p0: [0, 0, 0], p1: [10, 0, 0] };
  const b = { p0: [0, 20, 0], p1: [10, 20, 0] };
  assert(!edgesShareVertex(a, b).share, '唔应共享');
  return 'ok';
});

// ================================================================== 3. 面圆角切点解析
test('planePlaneFilletSetback 直角(90°) → r（tan45=1）', () => {
  const s = planePlaneFilletSetback(4, 90 * DEG);
  assert(near(s, 4, 1e-9), `应=4，得 ${fmt(s)}`);
  return `R4 直角 → 收进 ${fmt(s)}mm`;
});

test('planePlaneFilletSetback 60° → r/tan30° > r', () => {
  const r = 4;
  const s = planePlaneFilletSetback(r, 60 * DEG);
  const want = r / Math.tan(30 * DEG);
  assert(near(s, want, 1e-9), `应=${fmt(want)}，得 ${fmt(s)}`);
  assert(s > r, '锐角收进应 > r');
  return `R4 60° → 收进 ${fmt(s, 3)}mm`;
});

test('planePlaneFilletSetback 120° → r/tan60° < r', () => {
  const r = 4;
  const s = planePlaneFilletSetback(r, 120 * DEG);
  assert(s < r, '钝角收进应 < r');
  return `R4 120° → 收进 ${fmt(s, 3)}mm`;
});

test('planeCylinderFilletContacts 外圆角 R柱=8 r=2 → 平面切圆 10', () => {
  const c = planeCylinderFilletContacts(8, 2, true);
  assert(near(c.planeCircleR, 10, 1e-9), `平面切圆应=10，得 ${fmt(c.planeCircleR)}`);
  assert(near(c.cylContactHeight, 2, 1e-9), '柱面切高应=r=2');
  assert(near(c.cylContactR, 8, 1e-9), '柱面切圆半径应=R=8');
  return `平面切圆 R${c.planeCircleR}、柱切高 ${c.cylContactHeight}`;
});

test('planeCylinderFilletContacts 内圆角(孔) R=8 r=2 → 平面切圆 6', () => {
  const c = planeCylinderFilletContacts(8, 2, false);
  assert(near(c.planeCircleR, 6, 1e-9), `孔内平面切圆应=R−r=6，得 ${fmt(c.planeCircleR)}`);
  return `孔 平面切圆 R${c.planeCircleR}`;
});

test('planeCylinderFilletContacts r>R 时平面切圆钳 0（不负）', () => {
  const c = planeCylinderFilletContacts(3, 5, false);
  assert(c.planeCircleR >= 0, `应≥0，得 ${c.planeCircleR}`);
  return `钳后 = ${c.planeCircleR}`;
});

test('classifyFacePair 识别面对类型', () => {
  assert(classifyFacePair('PLANE', 'PLANE') === 'plane-plane', 'PP 错');
  assert(classifyFacePair('PLANE', 'CYLINDRE') === 'plane-cylinder', 'PC 错（replicad CYLINDRE 拼写）');
  assert(classifyFacePair('CYLINDER', 'PLANE') === 'plane-cylinder', 'CP 错');
  assert(classifyFacePair('CYLINDRE', 'CYLINDRE') === 'cylinder-cylinder', 'CC 错');
  assert(classifyFacePair('BSPLINE', 'PLANE') === 'general', 'general 错');
  return 'PP / PC / CP / CC / general 全对';
});

// ================================================================== 4. HARD FLOOR 判据
test('bboxExtentsSane 正常圆角结果 → 通过', () => {
  const ref = [[0, 0, 0], [40, 30, 20]];
  const cand = [[-0.1, -0.1, -0.1], [40.2, 30.2, 20.2]];   // 轻微拱起
  assert(bboxExtentsSane(cand, ref), '正常结果应通过');
  return 'ok';
});

test('bboxExtentsSane 爆冲(z +200mm) → 拒收', () => {
  const ref = [[0, 0, 0], [40, 30, 20]];
  const cand = [[0, 0, -100], [40, 30, 120]];   // z extent 220 ≫ 20+对角
  assert(!bboxExtentsSane(cand, ref), '爆冲应拒收');
  return '拒收爆冲';
});

test('bboxExtentsSane NaN / null → 拒收', () => {
  const ref = [[0, 0, 0], [10, 10, 10]];
  assert(!bboxExtentsSane([[0, 0, 0], [NaN, 10, 10]], ref), 'NaN 应拒收');
  assert(!bboxExtentsSane(null, ref), 'null cand 应拒收');
  assert(!bboxExtentsSane([[0, 0, 0], [10, 10, 10]], null), 'null ref 应拒收');
  return 'NaN/null 全拒';
});

test('bboxExtentsSane 反转维(负 extent) → 拒收', () => {
  const ref = [[0, 0, 0], [10, 10, 10]];
  assert(!bboxExtentsSane([[0, 0, 5], [10, 10, 4]], ref), '负 extent 应拒收');
  return '拒收反转';
});

// ================================================================== 汇总
const failed = rows.filter((r) => !r.pass);
console.log(`\n${rows.length - failed.length}/${rows.length} passed`);
if (failed.length) { console.error('FAILURES:', failed.map((r) => r.name).join(', ')); process.exit(1); }
process.exit(0);
