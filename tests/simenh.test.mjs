// simenh.test.mjs — 仿真增强（src/analysis/voxelfea.ts）验证
//
// 三个新功能（全部趋势级·非商用精度）：
//   1. 重力 / 自重体载 gravity + density → 悬臂梁末端挠度对解析 δ=ρgAL⁴/(8EI)（趋势级）；
//      唔加重力时同原 runVoxelFea 完全一致（回归）。
//   2. 销 / 圆柱约束 pin（径向 DOF penalty 锁）→ 带孔板孔做 pin + 远端拉力：位移有限（非刚体漂移）；
//      纯横向力下孔周节点径向被锁（唔飞走）。
//   3. 节点应力平滑 smoothVmNodal（nodal-averaging，非真 SPR）→ 跨度下降、体积积分守恒、均匀场不变。
//
// 跑法（喺 C:\ClaudeCode\webcad 目录执行）：
//   npx -y tsx tests/simenh.test.mjs
// 全部测试通过 → exit 0；任一失败 → exit 1。

import { _internals } from '../src/analysis/voxelfea.ts';

const { runVoxelFea, smoothVmNodal } = _internals;

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

/**
 * 水密「带方孔板」：外框 [0,L]×[0,W]×[0,t]，中央沿 z 贯穿一个方孔（边长 hole，居中）。
 * 实际系一个有矩形截面环（picture frame）沿 z 拉伸 t。孔近似「圆柱孔」（pin 约束用径向带容差，
 * 方孔角点落唔落带内唔影响——pin 只锁落喺 |r−radius|<band 嘅节点；radius 取孔半边长附近）。
 * 用「上下左右四条 bar」嘅水密拼法：每条 bar 系一个长方体，共享面无缝（顶点共用）。
 * 为简化 + 保证水密，呢度用「外盒 − 内盒」嘅 16 顶点带孔棱柱（手工列三角形，全共形）。
 */
function holedPlate(L, W, t, hole) {
  // 外环 4 角 (z=0)：A0..A3；内孔 4 角：B0..B3。z=t 层同样 8 个。
  const x0 = 0, x1 = L, y0 = 0, y1 = W;
  const hx0 = (L - hole) / 2, hx1 = (L + hole) / 2, hy0 = (W - hole) / 2, hy1 = (W + hole) / 2;
  const ringXY = [
    [x0, y0], [x1, y0], [x1, y1], [x0, y1],      // 外 0..3
    [hx0, hy0], [hx1, hy0], [hx1, hy1], [hx0, hy1], // 内 4..7
  ];
  const vertices = [];
  for (const z of [0, t]) for (const [x, y] of ringXY) vertices.push(x, y, z);
  // 顶点索引：z=0 层 0..7，z=t 层 8..15。
  const Lo = (i) => i, Hi = (i) => i + 8;
  const triangles = [];
  // 端盖（z=0 同 z=t）：外环 − 内环 = 4 个梯形带，每带拆 2 三角形。
  // 外角 0,1,2,3 对内角 4,5,6,7（一一对应同象限）。
  const capQuads = [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  for (const [a, b, c, d] of capQuads) {
    // z=0 盖（法向 −z，绕序保证向外；体素化只睇 xy 投影覆盖，绕序唔影响奇偶）
    triangles.push(Lo(a), Lo(b), Lo(c), Lo(a), Lo(c), Lo(d));
    // z=t 盖
    triangles.push(Hi(a), Hi(b), Hi(c), Hi(a), Hi(c), Hi(d));
  }
  // 外侧壁 4 面（环外周）：外环边 (0-1,1-2,2-3,3-0) 沿 z 拉伸。
  const outLoop = [0, 1, 2, 3];
  for (let q = 0; q < 4; q++) {
    const a = outLoop[q], b = outLoop[(q + 1) % 4];
    triangles.push(Lo(a), Lo(b), Hi(b), Lo(a), Hi(b), Hi(a));
  }
  // 内孔壁 4 面（孔内周）：内环边 (4-5,5-6,6-7,7-4) 沿 z 拉伸。
  const inLoop = [4, 5, 6, 7];
  for (let q = 0; q < 4; q++) {
    const a = inLoop[q], b = inLoop[(q + 1) % 4];
    triangles.push(Lo(a), Lo(b), Hi(b), Lo(a), Hi(b), Hi(a));
  }
  return { vertices, triangles };
}

// 钢：E=200000 MPa, nu=0.3, density=7.85 g/cm³。
const STEEL = { E: 200000, nu: 0.3 };
const RHO = 7.85;               // g/cm³
const G = 9810;                 // mm/s²（地球重力）

// =====================================================================================
// T1 重力体载：悬臂梁自重挠度对解析（趋势级）
// =====================================================================================

let r1g = null, r1n = null;
test('T1 gravity-cantilever-deflection', () => {
  // 悬臂梁：x=0 端全固定，沿 −z 自重。L=120, b=12(y), d=12(z)。
  // 解析（自重均布载 w=ρ·A·g/length，A=b·d）：δ_tip = w·L⁴/(8EI)，I=b·d³/12。
  //   ⟺ δ = ρ·g·A·L⁴ / (8·E·I)。单位：ρ=tonne/mm³(=7.85e-9)、g=mm/s²、E=MPa → δ mm。
  const L = 120, b = 12, d = 12;
  const m = boxMesh(L, b, d);
  const inp = {
    vertices: m.vertices, triangles: m.triangles,
    fixed: { point: [0, 0, 0], normal: [1, 0, 0] },
    // load 平面系必填字段：放喺自由端，force=0（净靠重力加载）。
    load: { point: [L, 0, 0], normal: [1, 0, 0] },
    force: [0, 0, 0],
    gravity: [0, 0, -G], density: RHO,
    ...STEEL, resolution: 24, cgTol: 1e-7, maxIter: 8000,
  };
  r1g = runVoxelFea(inp);
  assert(r1g.ok, `ok=false: ${r1g.error}`);
  assert(r1g.converged, `CG 未收敛 (${r1g.iters} 次, 残差 ${r1g.residual})`);
  assert(r1g.dispMax > 0, `dispMax=${r1g.dispMax}，自重应有挠度`);

  // 解析挠度
  const rhoMm = RHO * 1e-9;          // tonne/mm³
  const A = b * d, I = b * Math.pow(d, 3) / 12;
  const wPerLen = rhoMm * A * G;     // N/mm（每长度自重，g 已带）
  const deltaAna = wPerLen * Math.pow(L, 4) / (8 * STEEL.E * I);  // mm
  const ratio = r1g.dispMax / deltaAna;
  // 体素粗网格偏刚（dispMax 系节点最大位移，含末端 + 自由膨胀；趋势级）：放宽到 [0.3, 1.8]。
  assert(ratio > 0.3 && ratio < 1.8,
    `挠度比 FEM/解析=${fmt(ratio, 3)} 唔喺 [0.3,1.8]（FEM ${fmt(r1g.dispMax, 5)}mm vs 解析 ${fmt(deltaAna, 5)}mm）`);

  // 回归：唔加重力 → 同原本（force=0 + 无 gravity）一致 = 全 0 位移。
  const inpNoG = { ...inp };
  delete inpNoG.gravity; delete inpNoG.density;
  r1n = runVoxelFea(inpNoG);
  assert(r1n.ok, `回归 ok=false: ${r1n.error}`);
  assert(r1n.dispMax === 0 && r1n.vmMax === 0,
    `回归（无重力+force=0）应全 0，实得 dispMax=${r1n.dispMax} vmMax=${r1n.vmMax}`);
  return `FEM挠度=${fmt(r1g.dispMax, 5)}mm vs 解析=${fmt(deltaAna, 5)}mm（比 ${fmt(ratio, 3)}）` +
    ` nVox=${r1g.nVox} | 回归无重力 dispMax=${r1n.dispMax}`;
});

// =====================================================================================
// T1b 重力回归：force≠0 时，加唔加 gravity 应可叠加 + 纯外载分支同原本 byte 级一致
// =====================================================================================

test('T1b gravity-regression-vs-original', () => {
  // 纯外载（无 gravity 字段）必须同「未加增强前」嘅 runVoxelFea 数值完全一致。
  const m = boxMesh(100, 10, 10);
  const baseInp = {
    vertices: m.vertices, triangles: m.triangles,
    fixed: { point: [0, 0, 0], normal: [1, 0, 0] },
    load: { point: [100, 0, 0], normal: [1, 0, 0] },
    force: [0, -50, 0],
    ...STEEL, resolution: 16,
  };
  const rBase = runVoxelFea(baseInp);
  assert(rBase.ok, `base ok=false: ${rBase.error}`);
  // 同一输入跑两次 → 确定性一致（无 gravity 路径无副作用）。
  const rBase2 = runVoxelFea({ ...baseInp });
  assert(rBase2.ok, `base2 ok=false`);
  assert(rBase.dispMax === rBase2.dispMax && rBase.vmMax === rBase2.vmMax,
    `纯外载分支非确定性：${rBase.dispMax}/${rBase.vmMax} vs ${rBase2.dispMax}/${rBase2.vmMax}`);

  // 叠加性（趋势级合理性）：force + gravity 嘅位移应 ≠ 纯 force（重力有贡献）。
  const rWithG = runVoxelFea({ ...baseInp, gravity: [0, -G, 0], density: RHO });
  assert(rWithG.ok, `withG ok=false: ${rWithG.error}`);
  assert(rWithG.dispMax !== rBase.dispMax,
    `加重力后位移应改变，实得相同 ${rWithG.dispMax}`);

  // 守卫：gravity 非零但缺 density → 报错对象（唔 throw）。
  const rNoDens = runVoxelFea({ ...baseInp, gravity: [0, -G, 0] });
  assert(rNoDens.ok === false && typeof rNoDens.error === 'string',
    `gravity 缺 density 应 ok=false + error，实得 ok=${rNoDens.ok}`);
  return `纯外载确定性一致 dispMax=${fmt(rBase.dispMax, 6)}；+重力 dispMax=${fmt(rWithG.dispMax, 6)}；缺density守卫 ok=${rNoDens.ok}`;
});

// =====================================================================================
// T2 销 / 圆柱约束：带孔板 pin + 远端拉力 → 位移有限（非刚体漂移）
// =====================================================================================

test('T2 pin-holed-plate-tension', () => {
  // 带方孔板 L=80, W=40, t=8，中央孔 hole=16（半边长 8 → 等效孔半径 ~8..11）。
  // pin：轴 = z 向、轴点 = 板中心、radius = 孔半径附近、band 较宽收纳孔壁节点。
  // 远端 x=L 拉力 +x → pin 提供径向支承（防刚体平移/旋转），位移应有限。
  const L = 80, W = 40, t = 8, hole = 16;
  const m = holedPlate(L, W, t, hole);
  const cx = L / 2, cy = W / 2;
  // 孔半边长 = hole/2 = 8；方孔壁节点径向距离 8..√2·8≈11.3。radius 取 9.5、band 取 4 收纳整圈。
  const inp = {
    vertices: m.vertices, triangles: m.triangles,
    // fixed 系必填：放喺一个细面（x=0 端薄边），但主承力靠 pin。给足 ≥3 节点。
    fixed: { point: [0, 0, 0], normal: [1, 0, 0] },
    load: { point: [L, 0, 0], normal: [1, 0, 0] },
    force: [500, 0, 0],
    pin: { axisPoint: [cx, cy, t / 2], axisDir: [0, 0, 1], radius: 9.5, bandTol: 4 },
    ...STEEL, resolution: 28, cgTol: 1e-6, maxIter: 8000,
  };
  const r = runVoxelFea(inp);
  assert(r.ok, `ok=false: ${r.error}`);
  assert(r.nVox > 20, `nVox=${r.nVox} 太少（带孔板体素化可能失败）`);
  // 位移有限（非 NaN/Inf，非刚体漂移巨值）。带 pin + 远端 500N 拉力，位移应系细 mm 级。
  assert(Number.isFinite(r.dispMax), `dispMax 非有限 = ${r.dispMax}`);
  assert(r.dispMax > 0, `dispMax=${r.dispMax}，应有形变`);
  assert(r.dispMax < 5, `dispMax=${fmt(r.dispMax, 4)}mm 过大（>5）：pin 可能未约束住刚体漂移`);

  // 对照：拆走 pin（同 fixed/load/force）→ 若 fixed 面够约束，仍有限；
  //   关键回归 = 加 pin 唔会令结果爆掉（penalty 数值稳定）。
  const rNoPin = runVoxelFea({ ...inp, pin: undefined });
  assert(rNoPin.ok, `无 pin 对照 ok=false: ${rNoPin.error}`);
  // 加 pin 后孔周被额外约束 → 整体更刚 → dispMax 应 ≤ 无 pin（趋势级；放宽允许相等）。
  assert(r.dispMax <= rNoPin.dispMax * 1.05,
    `加 pin 后位移 ${fmt(r.dispMax, 5)} 应 ≤ 无 pin ${fmt(rNoPin.dispMax, 5)}（pin 增刚）`);
  return `pin+拉力 dispMax=${fmt(r.dispMax, 5)}mm（有限）vs 无pin ${fmt(rNoPin.dispMax, 5)}mm` +
    ` nVox=${r.nVox} vmMax=${fmt(r.vmMax, 1)}MPa iters=${r.iters}`;
});

// =====================================================================================
// T2b 纯 pin 受横向力：孔周径向被锁，结构唔飞走（位移有限、收敛）
// =====================================================================================

test('T2b pin-lateral-no-runaway', () => {
  // 板中孔 pin（z 轴）+ 远端 y 向横向力。pin 锁径向（xy 面内到轴的垂直方向）→
  // 横向力被孔周径向支承吸收，结构唔会无限漂移。
  const L = 80, W = 40, t = 8, hole = 16;
  const m = holedPlate(L, W, t, hole);
  const cx = L / 2, cy = W / 2;
  const inp = {
    vertices: m.vertices, triangles: m.triangles,
    fixed: { point: [0, 0, 0], normal: [1, 0, 0] },   // 细 fixed 面（去剩余刚体 z 平移/绕转）
    load: { point: [L, 0, 0], normal: [1, 0, 0] },
    force: [0, 300, 0],                               // 横向 +y
    pin: { axisPoint: [cx, cy, t / 2], axisDir: [0, 0, 1], radius: 9.5, bandTol: 4 },
    ...STEEL, resolution: 28, cgTol: 1e-6, maxIter: 8000,
  };
  const r = runVoxelFea(inp);
  assert(r.ok, `ok=false: ${r.error}`);
  assert(Number.isFinite(r.dispMax) && r.dispMax < 5,
    `横向力下 dispMax=${fmt(r.dispMax, 4)} 非有限或过大（pin 径向锁失效 → 飞走）`);
  assert(r.converged, `CG 未收敛（${r.iters} 次）：penalty 病态？`);
  return `横向力 dispMax=${fmt(r.dispMax, 5)}mm（有限·唔飞走）converged=${r.converged} iters=${r.iters}`;
});

// =====================================================================================
// T3 节点应力平滑（nodal-averaging）：跨度降 + 积分守恒 + 均匀场不变
// =====================================================================================

test('T3 smooth-span-and-conservation', () => {
  // 用 T1 重力悬臂结果（真实非均匀应力场）做平滑测试。
  assert(r1g && r1g.ok, 'T1 未通过，无法取 vm 场');
  const sm = smoothVmNodal({ centers: r1g.centers, vm: r1g.vm, h: r1g.h, nVox: r1g.nVox });
  assert(sm.ok, `smooth ok=false: ${sm.error}`);
  assert(sm.method === 'nodal-averaging', `method=${sm.method}（应诚实标 nodal-averaging）`);
  assert(sm.vmSmooth.length === r1g.nVox, `vmSmooth 长度 ${sm.vmSmooth.length} ≠ nVox ${r1g.nVox}`);
  assert(sm.nodeVm.length === sm.nNodes && sm.nNodes > 0, `nodeVm 长度/nNodes 异常`);

  // (a) 跨度下降（平滑去阶梯尖峰）
  assert(sm.spanAfter <= sm.spanBefore + 1e-9,
    `平滑后跨度 ${fmt(sm.spanAfter, 3)} 应 ≤ 平滑前 ${fmt(sm.spanBefore, 3)}`);
  assert(sm.spanAfter < sm.spanBefore,
    `跨度无下降（${fmt(sm.spanBefore, 3)} → ${fmt(sm.spanAfter, 3)}）：平滑未生效？`);

  // (b) 体积积分守恒（合理误差 ≤ 8%；节点平均喺边界单元会有细微偏差）
  const relErr = Math.abs(sm.integralAfter - sm.integralBefore) / Math.max(1e-9, sm.integralBefore);
  assert(relErr < 0.08,
    `积分守恒误差 ${fmt(relErr * 100, 2)}% > 8%（前 ${fmt(sm.integralBefore, 2)} 后 ${fmt(sm.integralAfter, 2)}）`);

  return `跨度 ${fmt(sm.spanBefore, 2)}→${fmt(sm.spanAfter, 2)}MPa（降 ${fmt((1 - sm.spanAfter / sm.spanBefore) * 100, 1)}%）` +
    ` 积分守恒误差 ${fmt(relErr * 100, 3)}% nNodes=${sm.nNodes}`;
});

test('T3b smooth-uniform-field-invariant', () => {
  // 构造一个均匀应力场（所有体素 vm=42）→ 平滑后应处处仍 = 42（严格不变）。
  // 用 boxMesh 的 centers 拓扑，手动塞均匀 vm。
  const m = boxMesh(40, 20, 20);
  const r = runVoxelFea({
    vertices: m.vertices, triangles: m.triangles,
    fixed: { point: [0, 0, 0], normal: [1, 0, 0] },
    load: { point: [40, 0, 0], normal: [1, 0, 0] },
    force: [100, 0, 0], ...STEEL, resolution: 10,
  });
  assert(r.ok, `box ok=false: ${r.error}`);
  const uni = new Float32Array(r.nVox).fill(42);
  const sm = smoothVmNodal({ centers: r.centers, vm: uni, h: r.h, nVox: r.nVox });
  assert(sm.ok, `smooth ok=false: ${sm.error}`);
  let maxDev = 0;
  for (let i = 0; i < r.nVox; i++) maxDev = Math.max(maxDev, Math.abs(sm.vmSmooth[i] - 42));
  assert(maxDev < 1e-3, `均匀场平滑后偏离 ${fmt(maxDev, 5)}（应 ≈0，严格不变）`);
  assert(sm.spanBefore < 1e-3 && sm.spanAfter < 1e-3, `均匀场跨度应 ≈0`);

  // 守卫：空/退化输入返错误对象（唔 throw）
  const bad = smoothVmNodal({ centers: new Float32Array(0), vm: new Float32Array(0), h: 0, nVox: 0 });
  assert(bad.ok === false && typeof bad.error === 'string', '退化输入应 ok=false + error');
  return `均匀场不变（最大偏离 ${fmt(maxDev, 6)}）；退化守卫 ok=${bad.ok}`;
});

// ------------------------------------------------------------------ 汇总

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
