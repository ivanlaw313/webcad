// smunfold.test.mjs — 钣金展开映射纯数学模块 (src/cad/smUnfold.ts) 验证套件
// 跑法: npx -y tsx tests/smunfold.test.mjs   (喺 C:\ClaudeCode\webcad 目录)
// 失败 → exit 1; 末尾输出 PASS/FAIL 总表
import { smRuns, mapPointToFlat } from '../src/cad/smUnfold.ts';

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

// L 型基准件: T=2 R=2 K=0.33 W=30, 60mm 底 + 90° 上弯 + 40mm 立腿
// Rc = R+T/2 = 3; BA = (π/2)·(R+K·T) = (π/2)·2.66
const L = { thickness: 2, radius: 2, kfactor: 0.33, width: 30, segs: [60, 40], angles: [90] };
const BA90 = (Math.PI / 2) * 2.66;

// ============ T1 L 型走位: 中线行走 + 展开起点 ============
test('T1 L 型走位 (segs[60,40] angles[90])', () => {
  const runs = smRuns(L);
  ok(runs.length === 2, `runs.length === 2 (实际 ${runs.length})`);
  const r0 = runs[0];
  eq(r0.start[0], 0, 'run0 start.x = 0'); eq(r0.start[1], 0, 'run0 start.z = 0');
  eq(r0.dir[0], 1, 'run0 dir = (1,0)'); eq(r0.dir[1], 0, 'run0 dir.z = 0');
  eq(r0.normal[0], 0, 'run0 normal = (0,1)'); eq(r0.normal[1], 1, 'run0 normal.z = 1');
  eq(r0.len, 60, 'run0 len = 60'); eq(r0.flatStart, 0, 'run0 flatStart = 0'); eq(r0.theta, 0, 'run0 θ = 0');
  // 手算弯: 心(60,3) φ0=−π/2 终点(63,3) th=π/2
  const r1 = runs[1];
  eq(r1.start[0], 63, 'run1 start.x = 63 (弧终点)');
  eq(r1.start[1], 3, 'run1 start.z = 3');
  eq(r1.dir[0], 0, 'run1 dir ≈ (0,1)'); eq(r1.dir[1], 1, 'run1 dir.z = 1');
  eq(r1.normal[0], -1, 'run1 normal ≈ (−1,0)'); eq(r1.normal[1], 0, 'run1 normal.z ≈ 0');
  eq(r1.len, 40, 'run1 len = 40');
  eq(r1.theta, Math.PI / 2, 'run1 θ = π/2');
  eq(r1.flatStart, 64.1782, 'run1 flatStart ≈ 64.1782 (= 60 + (π/2)·2.66)', 1e-3);
  eq(r1.flatStart, 60 + BA90, 'run1 flatStart 精确 = 60 + BA');
});

// ============ T2 run0 孔映射 (恒等映射) ============
test('T2 run0 孔映射: 顶面 (20,15,1) → fx 20 fy 15', () => {
  // run0 中线 z=0, 板占 z∈[−1,1]; 顶面点 z=1 (d = T/2 = 1 ≤ 1.6 候选带)
  const h = mapPointToFlat(L, [20, 15, 1], [0, 0, 1]);
  ok(!('error' in h), `无 error (实际 ${JSON.stringify(h)})`);
  ok(h.fx === 20, `fx === 20 精确 (实际 ${h.fx})`);
  ok(h.fy === 15, `fy === 15 精确 (实际 ${h.fy})`);
  ok(h.run === 0, `run === 0 (实际 ${h.run})`);
  // 边界文档: z=2 离中线 2mm > T/2+0.6 = 1.6 → 唔喺板面 (候选带规则)
  const off = mapPointToFlat(L, [20, 15, 2], [0, 0, 1]);
  ok('error' in off && off.error.includes('唔喺钣金面上'), `z=2 超出候选带 → 「唔喺钣金面上」(实际 ${JSON.stringify(off)})`);
});

// ============ T3 run1 (垂直腿) 孔映射 ============
test('T3 run1 孔映射: (62,25,13) axis(1,0,0) → fx ≈ 74.1782', () => {
  // run1 中线 t=10 处 (63,13) 偏 normal(−1,0)·1 → XZ (62,13), 即立腿内面; 孔轴沿 +X 垂直腿面
  const h = mapPointToFlat(L, [62, 25, 13], [1, 0, 0]);
  ok(!('error' in h), `无 error (实际 ${JSON.stringify(h)})`);
  eq(h.fx, 74.1782, 'fx ≈ 74.1782 (= 64.1782 + 10)', 1e-3);
  eq(h.fx, 60 + BA90 + 10, 'fx 精确 = 60 + BA + 10');
  ok(h.fy === 25, `fy === 25 精确 (实际 ${h.fy})`);
  ok(h.run === 1, `run === 1 (实际 ${h.run})`);
});

// ============ T4 折弯区孔 → 拒绝 ============
test('T4 折弯区孔: 弧中点 φ=−π/4 → error 含「折弯区」', () => {
  // 弯心(60,3) Rc=3, φ=−π/4 中线点 = (60+3cos(−π/4), 3+3sin(−π/4)) = (62.121, 0.879)
  const px = 60 + 3 * Math.cos(-Math.PI / 4), pz = 3 + 3 * Math.sin(-Math.PI / 4);
  eq(px, 62.121, '弧点 x ≈ 62.121', 1e-3); eq(pz, 0.879, '弧点 z ≈ 0.879', 1e-3);
  // 孔轴沿该处径向 (cos(−π/4), 0, sin(−π/4))
  const r = mapPointToFlat(L, [px, 15, pz], [Math.cos(-Math.PI / 4), 0, Math.sin(-Math.PI / 4)]);
  ok('error' in r, `有 error (实际 ${JSON.stringify(r)})`);
  ok(r.error.includes('折弯区'), `error 含「折弯区」: ${r.error}`);
});

// ============ T5 斜轴拒绝 ============
test('T5 斜轴: axis(0.5,0,0.866) 同 Z 夹 30° → error 含「垂直」', () => {
  // run0 normal (0,1); axis XZ 分量归一后 dot ≈ 0.866 < 0.9 → 拒
  const r = mapPointToFlat(L, [20, 15, 1], [0.5, 0, 0.866]);
  ok('error' in r, `有 error (实际 ${JSON.stringify(r)})`);
  ok(r.error.includes('垂直'), `error 含「垂直」: ${r.error}`);
  // 对照: 轴 Y 分量太大 (|axis_y| ≥ 0.35) 都系拒
  const ry = mapPointToFlat(L, [20, 15, 1], [0, 1, 0]);
  ok('error' in ry && ry.error.includes('垂直'), `纯 Y 轴都拒: ${ry.error}`);
});

// ============ T6 Z 型 (angles [90,−90]) ============
test('T6 Z 型走位: segs[40,30,40] angles[90,−90]', () => {
  const Z = { thickness: 2, radius: 2, kfactor: 0.33, width: 30, segs: [40, 30, 40], angles: [90, -90] };
  const runs = smRuns(Z);
  ok(runs.length === 3, `runs.length === 3 (实际 ${runs.length})`);
  // 手行 walk: 弯1 心(40,3) → run1 start(43,3) th=π/2; 弯2 dir=−1 心(46,33) → run2 start(46,36) th 返回 0
  eq(runs[1].start[0], 43, 'run1 start ≈ (43,3)', 1e-9); eq(runs[1].start[1], 3, 'run1 start.z ≈ 3', 1e-9);
  eq(runs[2].start[0], 46, 'run2 start ≈ (46,36)', 1e-6); eq(runs[2].start[1], 36, 'run2 start.z ≈ 36', 1e-6);
  eq(runs[2].dir[0], 1, 'run2 dir ≈ (1,0) (th 返回 0)', 1e-9); eq(runs[2].dir[1], 0, 'run2 dir.z ≈ 0', 1e-9);
  eq(runs[2].theta, 0, 'run2 θ ≈ 0', 1e-9);
  eq(runs[2].flatStart, 78.3565, 'run2 flatStart ≈ 78.3565 (= 70 + 2·(π/2)·2.66)', 1e-3);
  eq(runs[2].flatStart, 40 + BA90 + 30 + BA90, 'run2 flatStart 精确 = 40+BA+30+BA');
  eq(runs[1].flatStart, 40 + BA90, 'run1 flatStart 精确 = 40+BA');
});

// ============ T7 板宽 + 离板错误 ============
test('T7 错误分支: 超板宽 / 唔喺板面', () => {
  // W=30, 候选带 v∈[−0.5, 30.5]; y=40 超宽
  const rw = mapPointToFlat(L, [20, 40, 1], [0, 0, 1]);
  ok('error' in rw && rw.error.includes('超出板宽'), `y=40 → 「超出板宽」: ${rw.error}`);
  const rw2 = mapPointToFlat(L, [20, -2, 1], [0, 0, 1]);
  ok('error' in rw2 && rw2.error.includes('超出板宽'), `y=−2 → 「超出板宽」: ${rw2.error}`);
  // 远离所有段同弧
  const ro = mapPointToFlat(L, [20, 15, 10], [0, 0, 1]);
  ok('error' in ro && ro.error.includes('唔喺钣金面上'), `z=10 → 「唔喺钣金面上」: ${ro.error}`);
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
