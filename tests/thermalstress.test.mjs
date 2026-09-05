// thermalstress.test.mjs — 耦合热-应力 FEA（src/analysis/voxelfea.ts:runVoxelThermalStress）验证
//
// 对标 Fusion「Thermal Stress」：先解稳态温度场，再以热膨胀初应变 ε₀=αΔT 加载结构 FEM，
// 单元应力 σ = D·(B·u − ε₀)。−ε₀ 减项系正确性关键（自由膨胀 → 零应力）。
//
// 跑法（喺 C:\ClaudeCode\webcad 目录执行）：
//   npx -y tsx tests/thermalstress.test.mjs
// 全部测试通过 → exit 0；任一失败 → exit 1。

import { _internals } from '../src/analysis/voxelfea.ts';

const { runVoxelThermalStress } = _internals;

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
function fmt(x, d = 4) { return Number(x).toFixed(d); }

// ------------------------------------------------------------------ 测试网格

/** 水密长方体 [0,sx]×[0,sy]×[0,sz]，8 顶点 12 三角形（同 fea-verify boxMesh 同款拓扑）。 */
function boxMesh(sx, sy, sz) {
  const vertices = [];
  for (let b = 0; b < 8; b++) {
    vertices.push((b & 1) ? sx : 0, (b & 2) ? sy : 0, (b & 4) ? sz : 0);
  }
  const triangles = [
    0, 1, 3, 0, 3, 2, // 底 z=0
    4, 5, 7, 4, 7, 6, // 顶 z=sz
    0, 4, 5, 0, 5, 1, // y=0
    2, 3, 7, 2, 7, 6, // y=sy
    0, 2, 6, 0, 6, 4, // x=0
    1, 5, 7, 1, 7, 3, // x=sx
  ];
  return { vertices, triangles };
}

// 钢（thermal stress）：E=200000 MPa, nu=0.3, cte=12 (×1e-6/°C), k=50 W/mK。
const STEEL = { E: 200000, nu: 0.3, cte: 12, k: 50 };
const DT = 50;                                              // 均匀升温 50°C
const SIGMA_ANALYTIC = STEEL.E * (STEEL.cte * 1e-6) * DT;   // 200000·12e-6·50 = 120 MPa

// 均匀 ΔT 嘅做法：hot/cold 两个面都设到 Tref+DT（同温）→ 稳态拉普拉斯解处处 = Tref+DT，
// 整体 ΔT = DT 均匀。两个面取条形 x 两端面保证定温节点都落喺实体上。

// ------------------------------------------------------------------ T1 双端全约束条（σ = E·α·ΔT）

let r1 = null;
test('T1 fully-constrained-bar', () => {
  const m = boxMesh(100, 10, 10);
  // 双端全约束：fixed = x=0 端面、fixed2 = x=100 端面（皆全 DOF 固定），轴向唔可伸张。
  // 长条中段横向自由膨胀 → 单轴应力态 σx=E·α·ΔT、σy=σz≈0 → von Mises = E·α·ΔT ≈ 120 MPa。
  // 均匀温度：hot/cold 两端皆 Tref+DT（同温）→ 处处 ΔT=50。
  const inp = {
    vertices: m.vertices, triangles: m.triangles,
    fixed: { point: [0, 0, 0], normal: [1, 0, 0] },
    fixed2: { point: [100, 0, 0], normal: [1, 0, 0] },
    hot: { point: [0, 0, 0], normal: [1, 0, 0] },
    cold: { point: [100, 0, 0], normal: [1, 0, 0] },
    Thot: 20 + DT, Tcold: 20 + DT, Tref: 20,
    ...STEEL, resolution: 20,
  };
  r1 = runVoxelThermalStress(inp);
  assert(r1.ok, `ok=false: ${r1.error}`);
  assert(r1.converged, `CG 未收敛 (${r1.iters} 次, 残差 ${r1.residual})`);
  assert(r1.fixedCount >= 3, `fixedCount=${r1.fixedCount}（双端应 >>3）`);
  // 16 个 FeaResult 字段都应填齐
  for (const fld of ['vm', 'disp', 'centers', 'vmMaxAt', 'warnings']) {
    assert(r1[fld] !== undefined, `字段 ${fld} 未填`);
  }
  assert(r1.vmMax >= 100 && r1.vmMax <= 140,
    `vmMax=${fmt(r1.vmMax, 2)} 唔喺 [100,140]（解析 E·α·ΔT=${fmt(SIGMA_ANALYTIC, 1)}）`);
  return `vmMax=${fmt(r1.vmMax, 2)}MPa（解析 ${fmt(SIGMA_ANALYTIC, 1)}）dispMax=${fmt(r1.dispMax, 5)}mm` +
    ` nVox=${r1.nVox} nDof=${r1.nDof} fixedCount=${r1.fixedCount} loadCount=${r1.loadCount} iters=${r1.iters}`;
});

// ------------------------------------------------------------------ T2 自由膨胀（σ ≈ 0；守 −ε₀ 减项）

let r2 = null;
test('T2 free-expansion', () => {
  const m = boxMesh(100, 10, 10);
  // 自由膨胀：三正交滚子面（x=0 锁 ux、y=0 锁 uy、z=0 锁 uz）= 静定支承，只去刚体
  // 平移/转动，唔阻任何热膨胀方向 → 应力应 ≈ 0。fixCon='roller' 每面只锁自身法向主轴 DOF。
  // 均匀升温 ΔT=50。若漏咗 σ=D(Bu−ε₀) 嘅 −ε₀ 减项，呢度会假报 ~120 MPa（满应力）。
  const inp = {
    vertices: m.vertices, triangles: m.triangles,
    fixCon: 'roller',
    fixed: { point: [0, 0, 0], normal: [1, 0, 0] },     // 锁 ux
    fixed2: { point: [0, 0, 0], normal: [0, 1, 0] },    // 锁 uy
    fixed3: { point: [0, 0, 0], normal: [0, 0, 1] },    // 锁 uz
    hot: { point: [0, 0, 0], normal: [1, 0, 0] },
    cold: { point: [100, 0, 0], normal: [1, 0, 0] },
    Thot: 20 + DT, Tcold: 20 + DT, Tref: 20,
    ...STEEL, resolution: 20,
  };
  r2 = runVoxelThermalStress(inp);
  assert(r2.ok, `ok=false: ${r2.error}`);
  assert(r2.converged, `CG 未收敛 (${r2.iters} 次, 残差 ${r2.residual})`);
  // 自由膨胀 → 位移非零（条会变长），但应力 ≈ 0
  assert(r2.dispMax > 0, `dispMax=${fmt(r2.dispMax, 6)}，自由膨胀应有位移`);
  assert(r2.vmMax < 10,
    `vmMax=${fmt(r2.vmMax, 3)} ≥ 10（自由膨胀应 ≈0；若 ~120 即 −ε₀ 减项漏咗）`);
  return `vmMax=${fmt(r2.vmMax, 4)}MPa（自由膨胀，应≈0）dispMax=${fmt(r2.dispMax, 5)}mm` +
    `（=L·αΔT=${fmt(100 * STEEL.cte * 1e-6 * DT, 5)}）nVox=${r2.nVox} iters=${r2.iters}`;
});

// ------------------------------------------------------------------ T3 守卫 + 16 字段齐

test('T3 guards-and-result-shape', () => {
  // 空网格
  const rEmpty = runVoxelThermalStress({
    vertices: [], triangles: [],
    fixed: { point: [0, 0, 0], normal: [1, 0, 0] },
    hot: { point: [0, 0, 0], normal: [1, 0, 0] },
    cold: { point: [100, 0, 0], normal: [1, 0, 0] },
    Thot: 70, Tcold: 70, Tref: 20, ...STEEL, resolution: 20,
  });
  assert(rEmpty.ok === false && typeof rEmpty.error === 'string', '空网格应 ok=false + error');
  // 全 16 字段齐（用 T1 结果检查）
  assert(r1 && r1.ok, 'T1 未通过，无法检字段');
  const need16 = ['vm', 'disp', 'vmMax', 'vmMaxAt', 'dispMax', 'centers', 'h', 'nVox',
    'nDof', 'iters', 'residual', 'converged', 'fixedCount', 'loadCount', 'warnings', 'ok'];
  for (const f of need16) assert(f in r1, `FeaResult 缺字段 ${f}`);
  assert(r1.vm.length === r1.nVox, `vm 长度 ${r1.vm.length} ≠ nVox ${r1.nVox}`);
  assert(r1.disp.length === r1.nVox, `disp 长度 ${r1.disp.length} ≠ nVox ${r1.nVox}`);
  assert(r1.centers.length === r1.nVox * 3, `centers 长度 ${r1.centers.length} ≠ 3·nVox`);
  assert(Array.isArray(r1.vmMaxAt) && r1.vmMaxAt.length === 3, 'vmMaxAt 应为 3 元组');
  assert(r1.loadCount > 0, `loadCount=${r1.loadCount}（热定温带节点数应 >0）`);
  return `空网格 ok=false；16 字段齐；vm/disp.len=${r1.vm.length} centers.len=${r1.centers.length} loadCount=${r1.loadCount}`;
});

console.log('\n================ 结果一览 ================');
let nFail = 0;
for (const r of rows) {
  if (!r.pass) nFail++;
  console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  (${r.ms}ms)`);
  if (r.detail) console.log(`        ${r.detail}`);
}
console.log(`==========================================`);
console.log(`${rows.length - nFail}/${rows.length} 通过${nFail ? `，${nFail} 个失败` : ''}`);
process.exit(nFail ? 1 : 0);
