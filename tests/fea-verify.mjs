// fea-verify.mjs — 体素 FEA 核心（src/analysis/voxelfea.ts）验证套件
//
// 跑法（喺 C:\ClaudeCode\webcad 目录执行）：
//   node tests/fea-verify.mjs
//
// 脚本会先自动单文件转译 TS → JS（voxelfea.ts 零 import，单文件转译即可）：
//   npx tsc src/analysis/voxelfea.ts --outDir .tmp-fea --module es2020 --target es2020 --strict false --skipLibCheck --ignoreConfig
// （--ignoreConfig：本仓 tsc 版本要求显式忽略 tsconfig.json）然后 import('../.tmp-fea/voxelfea.js')。
// 全部测试通过 → exit 0；任一失败 → exit 1。

import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

console.log('[fea-verify] 转译 voxelfea.ts → .tmp-fea/ ...');
execSync(
  'npx tsc src/analysis/voxelfea.ts --outDir .tmp-fea --module es2020 --target es2020 --strict false --skipLibCheck --ignoreConfig',
  { cwd: root, stdio: 'inherit' },
);
const { runVoxelFea, _internals } = await import(
  pathToFileURL(path.join(root, '.tmp-fea', 'voxelfea.js')).href
);

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

/** 水密长方体 [0,sx]x[0,sy]x[0,sz]，8 顶点 12 三角形。顶点索引 = bx + 2*by + 4*bz。 */
function boxMesh(sx, sy, sz) {
  const vertices = [];
  for (let b = 0; b < 8; b++) {
    vertices.push((b & 1) ? sx : 0, (b & 2) ? sy : 0, (b & 4) ? sz : 0);
  }
  const triangles = [
    0, 1, 3, 0, 3, 2, // 底 z=0
    4, 5, 7, 4, 7, 6, // 顶 z=sz（三角形 #2 = (4,5,7) 覆盖 xy 下右半）
    0, 4, 5, 0, 5, 1, // y=0
    2, 3, 7, 2, 7, 6, // y=sy
    0, 2, 6, 0, 6, 4, // x=0
    1, 5, 7, 1, 7, 3, // x=sx
  ];
  return { vertices, triangles };
}

/**
 * 水密 L 棱柱：横截面（xz 平面）= 8x8 正方形减去右上 4x4 缺角，沿 y 拉伸 8。
 * 横截面顶点 (x,z)：P0(0,0) P1(8,0) P2(8,4) P3(4,4) P4(4,8) P5(0,8) + Steiner S(0,4)。
 * 端盖用 2 矩形拆分（每盖 4 三角形），侧面 7 个矩形（x=0 壁经 S 拆两段保证全共形）。
 */
function lMesh() {
  const P = [[0, 0], [8, 0], [8, 4], [4, 4], [4, 8], [0, 8], [0, 4]];
  const vertices = [];
  for (const y of [0, 8]) for (const [x, z] of P) vertices.push(x, y, z);
  const A = (i) => i, B = (i) => i + 7;
  const triangles = [];
  const capTris = [[0, 1, 2], [0, 2, 6], [6, 3, 4], [6, 4, 5]];
  for (const [a, b, c] of capTris) triangles.push(A(a), A(b), A(c));
  for (const [a, b, c] of capTris) triangles.push(B(a), B(b), B(c));
  const loop = [0, 1, 2, 3, 4, 5, 6];
  for (let q = 0; q < loop.length; q++) {
    const a = loop[q], b = loop[(q + 1) % loop.length];
    triangles.push(A(a), A(b), B(b), A(a), B(b), B(a));
  }
  return { vertices, triangles };
}

// ------------------------------------------------------------------ T1 体素化（长方体）

test('T1 voxelizer-box', () => {
  const m = boxMesh(8, 8, 16);
  const g = _internals.voxelize(m.vertices, m.triangles, 8);
  assert(g.h === 2, `h=${g.h}，期望 2`);
  assert(g.nx === 4 && g.ny === 4 && g.nz === 8, `网格 ${g.nx}x${g.ny}x${g.nz}，期望 4x4x8`);
  assert(g.nVox === 128, `nVox=${g.nVox}，期望 128`);
  const vol = g.nVox * g.h ** 3;
  assert(vol === 1024, `体积=${vol}，期望 1024`);
  assert(g.oddColumns === 0, `oddColumns=${g.oddColumns}，期望 0`);
  return `h=2 nVox=128 体积=1024 奇异列=0`;
});

// ------------------------------------------------------------------ T2 体素化（L 凹形）

test('T2 voxelizer-L-concave', () => {
  const m = lMesh();
  const g = _internals.voxelize(m.vertices, m.triangles, 4); // 最长轴 8 → h=2
  assert(g.h === 2, `h=${g.h}，期望 2`);
  const vol = g.nVox * g.h ** 3;
  assert(vol === 384, `体积=${vol}（nVox=${g.nVox}），期望 (64-16)*8=384`);
  assert(g.oddColumns === 0, `oddColumns=${g.oddColumns}，期望 0`);
  return `h=2 nVox=${g.nVox} 体积=384 奇异列=0`;
});

// ------------------------------------------------------------------ T3 Ke 对称 + 刚体模态

test('T3 Ke-symmetry-rigid-body', () => {
  const h = 2;
  const Ke = _internals.buildKe(2000, 0.3, h);
  assert(Ke.length === 576, `Ke 长度 ${Ke.length}`);
  let maxKe = 0;
  for (let i = 0; i < 576; i++) maxKe = Math.max(maxKe, Math.abs(Ke[i]));
  // 对称性
  let asym = 0;
  for (let i = 0; i < 24; i++) for (let j = 0; j < 24; j++) {
    asym = Math.max(asym, Math.abs(Ke[i * 24 + j] - Ke[j * 24 + i]));
  }
  assert(asym < 1e-9 * maxKe, `非对称 ${asym}，上限 ${1e-9 * maxKe}`);
  const mulKe = (u) => {
    const out = new Float64Array(24);
    for (let i = 0; i < 24; i++) {
      let s = 0;
      for (let j = 0; j < 24; j++) s += Ke[i * 24 + j] * u[j];
      out[i] = s;
    }
    return out;
  };
  const maxAbs = (v) => v.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
  // 刚体平移 x/y/z
  let maxTrans = 0;
  for (let axis = 0; axis < 3; axis++) {
    const u = new Float64Array(24);
    for (let a = 0; a < 8; a++) u[a * 3 + axis] = 1;
    maxTrans = Math.max(maxTrans, maxAbs(mulKe(u)));
  }
  assert(maxTrans < 1e-9 * maxKe, `平移残差 ${maxTrans}，上限 ${1e-9 * maxKe}`);
  // 线性化刚体旋转（绕质心，theta x r）
  const offs = _internals.hexNodeOffsets;
  const cC = h / 2;
  let maxRot = 0;
  for (let axis = 0; axis < 3; axis++) {
    const u = new Float64Array(24);
    for (let a = 0; a < 8; a++) {
      const rx = offs[a][0] * h - cC, ry = offs[a][1] * h - cC, rz = offs[a][2] * h - cC;
      let ux = 0, uy = 0, uz = 0;
      if (axis === 0) { uy = -rz; uz = ry; }       // theta=(1,0,0)
      else if (axis === 1) { ux = rz; uz = -rx; }  // theta=(0,1,0)
      else { ux = -ry; uy = rx; }                  // theta=(0,0,1)
      u[a * 3] = ux; u[a * 3 + 1] = uy; u[a * 3 + 2] = uz;
    }
    maxRot = Math.max(maxRot, maxAbs(mulKe(u)));
  }
  assert(maxRot < 1e-9 * maxKe * h, `旋转残差 ${maxRot}，上限 ${1e-9 * maxKe * h}`);
  return `非对称=${asym.toExponential(2)} 平移残差=${maxTrans.toExponential(2)} 旋转残差=${maxRot.toExponential(2)} (max|Ke|=${fmt(maxKe, 1)})`;
});

// ------------------------------------------------------------------ T4 单轴压缩

let r4 = null;
test('T4 uniaxial', () => {
  const m = boxMesh(8, 8, 16);
  const inp = {
    vertices: m.vertices, triangles: m.triangles,
    fixed: { point: [0, 0, 0], normal: [0, 0, 1] },
    load: { point: [0, 0, 16], normal: [0, 0, 1] },
    force: [0, 0, -100], E: 2000, nu: 0.3, resolution: 8,
  };
  r4 = runVoxelFea(inp);
  assert(r4.ok, `ok=false: ${r4.error}`);
  assert(r4.converged, `CG 未收敛 (${r4.iters} 次, 残差 ${r4.residual})`);
  assert(r4.nVox === 128, `nVox=${r4.nVox}`);
  const target = 100 / 64; // 1.5625 MPa
  let n = 0, mn = Infinity, mx = -Infinity, sum = 0;
  for (let e2 = 0; e2 < r4.nVox; e2++) {
    const cz = r4.centers[e2 * 3 + 2];
    if (cz >= 7 && cz <= 9) {
      const v = r4.vm[e2];
      n++; sum += v;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
      assert(Math.abs(v - target) / target <= 0.08,
        `中段单元 vm=${fmt(v)} 偏离 ${fmt(100 * Math.abs(v - target) / target, 2)}% > 8%`);
    }
  }
  assert(n === 32, `中段单元数 ${n}，期望 32`);
  // 线性度：力加倍 → vmMax / dispMax 加倍（0.1% 内）
  const r4b = runVoxelFea({ ...inp, force: [0, 0, -200] });
  assert(r4b.ok && r4b.converged, `加倍工况失败: ${r4b.error}`);
  const ratioVm = r4b.vmMax / r4.vmMax;
  const ratioDisp = r4b.dispMax / r4.dispMax;
  assert(Math.abs(ratioVm - 2) / 2 <= 0.001, `vmMax 比例 ${fmt(ratioVm, 6)}，偏离 2 超过 0.1%`);
  assert(Math.abs(ratioDisp - 2) / 2 <= 0.001, `dispMax 比例 ${fmt(ratioDisp, 6)}，偏离 2 超过 0.1%`);
  return `中段 vm ∈ [${fmt(mn)}, ${fmt(mx)}] 均值 ${fmt(sum / n)}（目标 1.5625，最大偏差 ${fmt(100 * Math.max(Math.abs(mn - target), Math.abs(mx - target)) / target, 2)}%）` +
    ` 线性度 vm×${fmt(ratioVm, 6)} disp×${fmt(ratioDisp, 6)} iters=${r4.iters}`;
});

// ------------------------------------------------------------------ T5 悬臂梁

let r5 = null;
const TIMO = 1.6113; // Timoshenko (kappa=5/6) 尖端挠度 mm
test('T5 cantilever', () => {
  const m = boxMesh(40, 8, 8);
  const inp = {
    vertices: m.vertices, triangles: m.triangles,
    fixed: { point: [0, 0, 0], normal: [1, 0, 0] },
    load: { point: [40, 0, 0], normal: [1, 0, 0] },
    force: [0, 0, -50], E: 2000, nu: 0.3, resolution: 20,
  };
  r5 = runVoxelFea(inp);
  assert(r5.ok, `ok=false: ${r5.error}`);
  assert(r5.converged, `CG 未收敛 (${r5.iters} 次, 残差 ${r5.residual})`);
  assert(r5.nVox === 320, `nVox=${r5.nVox}，期望 20x4x4=320`);
  assert(r5.dispMax >= 1.0 && r5.dispMax <= 1.8,
    `dispMax=${fmt(r5.dispMax)} 唔喺 [1.0, 1.8]`);
  const [ax, , az] = r5.vmMaxAt;
  assert(ax <= 6, `vmMax 位置 x=${ax}，期望 ≤6（梁根）`);
  assert(Math.abs(az - 4) >= 2, `vmMax 位置 z=${az}，|z-4|=${Math.abs(az - 4)} < 2（应喺外纤维）`);
  assert(r5.vmMax >= 12 && r5.vmMax <= 45, `vmMax=${fmt(r5.vmMax)} 唔喺 [12, 45]`);
  const ratio = r5.dispMax / TIMO;
  return `dispMax=${fmt(r5.dispMax)}mm（Euler-Bernoulli 1.5625 / Timoshenko ${TIMO}，比值 ${fmt(ratio, 3)}）` +
    ` vmMax=${fmt(r5.vmMax, 2)}MPa @ (${r5.vmMaxAt.map((x) => fmt(x, 1)).join(', ')})（根部解析外纤维 ≈23.4）` +
    ` iters=${r5.iters} 残差=${r5.residual.toExponential(2)}`;
});

// ------------------------------------------------------------------ T6 y 对称

test('T6 symmetry-y', () => {
  assert(r5 && r5.ok, 'T5 未通过，无法检验对称');
  const vmAt = new Map();
  for (let e2 = 0; e2 < r5.nVox; e2++) {
    const key = `${Math.round(r5.centers[e2 * 3])}|${Math.round(r5.centers[e2 * 3 + 1])}|${Math.round(r5.centers[e2 * 3 + 2])}`;
    vmAt.set(key, r5.vm[e2]);
  }
  let maxDiff = 0;
  for (let e2 = 0; e2 < r5.nVox; e2++) {
    const cx = Math.round(r5.centers[e2 * 3]);
    const cy = Math.round(r5.centers[e2 * 3 + 1]);
    const cz = Math.round(r5.centers[e2 * 3 + 2]);
    const mirror = vmAt.get(`${cx}|${8 - cy}|${cz}`);
    assert(mirror !== undefined, `镜像单元 (${cx},${8 - cy},${cz}) 唔存在`);
    maxDiff = Math.max(maxDiff, Math.abs(r5.vm[e2] - mirror));
  }
  assert(maxDiff <= 0.015 * r5.vmMax,
    `镜像 vm 最大差 ${fmt(maxDiff, 6)} > 1.5% vmMax (${fmt(0.015 * r5.vmMax, 4)})`);
  return `镜像 vm 最大差=${maxDiff.toExponential(2)}MPa（= ${fmt(100 * maxDiff / r5.vmMax, 4)}% vmMax，上限 1.5%）`;
});

// ------------------------------------------------------------------ T7 网格细化趋势

test('T7 refinement', () => {
  assert(r5 && r5.ok, 'T5 未通过，无法对比');
  const m = boxMesh(40, 8, 8);
  const r10 = runVoxelFea({
    vertices: m.vertices, triangles: m.triangles,
    fixed: { point: [0, 0, 0], normal: [1, 0, 0] },
    load: { point: [40, 0, 0], normal: [1, 0, 0] },
    force: [0, 0, -50], E: 2000, nu: 0.3, resolution: 10,
  });
  assert(r10.ok && r10.converged, `res10 失败: ${r10.error}`);
  assert(r10.nVox === 40, `res10 nVox=${r10.nVox}，期望 10x2x2=40`);
  const err10 = Math.abs(r10.dispMax - TIMO);
  const err20 = Math.abs(r5.dispMax - TIMO);
  assert(err20 < err10,
    `细化无改善：|disp20-${TIMO}|=${fmt(err20)} ≥ |disp10-${TIMO}|=${fmt(err10)}`);
  return `disp(res10,h=4)=${fmt(r10.dispMax)} → disp(res20,h=2)=${fmt(r5.dispMax)} → Timoshenko ${TIMO}` +
    `（误差 ${fmt(err10)} → ${fmt(err20)}，iters=${r10.iters}/${r5.iters}）`;
});

// ------------------------------------------------------------------ T8 守卫

test('T8a guard-empty-mesh', () => {
  const r = runVoxelFea({
    vertices: [], triangles: [],
    fixed: { point: [0, 0, 0], normal: [0, 0, 1] },
    load: { point: [0, 0, 1], normal: [0, 0, 1] },
    force: [0, 0, -1], E: 2000, nu: 0.3, resolution: 8,
  });
  assert(r.ok === false, 'ok 应为 false');
  assert(typeof r.error === 'string' && r.error.length > 0, '应有 error 信息');
  return `ok=false error="${r.error}"`;
});

test('T8b guard-fixed-plane-misses', () => {
  const m = boxMesh(8, 8, 16);
  const r = runVoxelFea({
    vertices: m.vertices, triangles: m.triangles,
    fixed: { point: [0, 0, -100], normal: [0, 0, 1] }, // 远离实体
    load: { point: [0, 0, 16], normal: [0, 0, 1] },
    force: [0, 0, -1], E: 2000, nu: 0.3, resolution: 8,
  });
  assert(r.ok === false, 'ok 应为 false');
  assert(/固定/.test(r.error ?? ''), `error 应提及固定节点，实际 "${r.error}"`);
  return `ok=false fixedCount=${r.fixedCount} error="${r.error}"`;
});

test('T8c guard-load-plane-misses', () => {
  const m = boxMesh(8, 8, 16);
  const r = runVoxelFea({
    vertices: m.vertices, triangles: m.triangles,
    fixed: { point: [0, 0, 0], normal: [0, 0, 1] },
    load: { point: [0, 0, 999], normal: [0, 0, 1] }, // 远离实体
    force: [0, 0, -1], E: 2000, nu: 0.3, resolution: 8,
  });
  assert(r.ok === false, 'ok 应为 false');
  assert(/受力/.test(r.error ?? ''), `error 应提及受力节点，实际 "${r.error}"`);
  return `ok=false loadCount=${r.loadCount} error="${r.error}"`;
});

let resClampIters = 0;
test('T8d guard-resolution-clamp', () => {
  const m = boxMesh(16, 2, 2);
  const r = runVoxelFea({
    vertices: m.vertices, triangles: m.triangles,
    fixed: { point: [0, 0, 0], normal: [1, 0, 0] },
    load: { point: [16, 0, 0], normal: [1, 0, 0] },
    force: [0, 0, -1], E: 2000, nu: 0.3, resolution: 200, cgTol: 1e-4,
  });
  assert(r.ok === true, `ok=false: ${r.error}`);
  assert(Math.abs(r.h - 0.25) < 1e-12, `h=${r.h}，期望 16/64=0.25（截到 64）`);
  assert(r.nVox === 4096, `nVox=${r.nVox}，期望 64x8x8=4096`);
  resClampIters = r.iters;
  return `res 200→64：h=0.25 nVox=4096 nDof=${r.nDof} iters=${r.iters} converged=${r.converged}` +
    ` warnings=[${r.warnings.join('; ')}]`;
});

test('T8e guard-open-mesh', () => {
  const m = boxMesh(8, 8, 16);
  const tris = m.triangles.slice();
  tris.splice(6, 3); // 移除顶盖三角形 (4,5,7) → 该半区 z 列得 1 个命中 → 奇异列
  const r = runVoxelFea({
    vertices: m.vertices, triangles: tris,
    fixed: { point: [0, 0, 0], normal: [0, 0, 1] },
    load: { point: [0, 0, 16], normal: [0, 0, 1] },
    force: [0, 0, -50], E: 2000, nu: 0.3, resolution: 8,
  });
  assert(r.warnings.some((w) => w.includes('奇异列')), `warnings 应含「奇异列」，实际 [${r.warnings.join('; ')}]`);
  return `无 throw，ok=${r.ok} nVox=${r.nVox} warnings=[${r.warnings.join('; ')}]`;
});

test('T8f extreme-E-dispMax-finite', () => {
  // 回归：dispMax 旧用平方和（|u|>~1.3e154 上溢 Infinity，|u|<~1e-162 下溢 0），
  // E=1e-300 时曾静默返回 dispMax=Infinity 而 ok/converged 全绿。修复后用 Math.hypot。
  const m = boxMesh(8, 8, 16);
  const base = {
    vertices: m.vertices, triangles: m.triangles,
    fixed: { point: [0, 0, 0], normal: [0, 0, 1] },
    load: { point: [0, 0, 16], normal: [0, 0, 1] },
    force: [100, 0, 0], nu: 0.3, resolution: 8,
  };
  const rRef = runVoxelFea({ ...base, E: 2000 });
  assert(rRef.ok && rRef.converged, `参考工况失败: ${rRef.error}`);
  const ref = rRef.dispMax * 2000; // 线弹性：dispMax ∝ 1/E → dispMax*E 应为常数
  assert(Number.isFinite(ref) && ref > 0, `参考 dispMax*E=${ref} 非正常`);
  const out = [];
  for (const E of [1e-300, 1e300]) {
    const r = runVoxelFea({ ...base, E });
    assert(r.ok, `E=${E}: ok=false: ${r.error}`);
    assert(r.converged, `E=${E}: CG 未收敛`);
    assert(Number.isFinite(r.dispMax), `E=${E}: dispMax=${r.dispMax} 非有限（静默上溢回归）`);
    assert(r.dispMax > 0, `E=${E}: dispMax=${r.dispMax}，应 > 0（静默下溢回归）`);
    for (let i = 0; i < r.vm.length; i++) {
      assert(Number.isFinite(r.vm[i]), `E=${E}: vm[${i}]=${r.vm[i]} 非有限`);
    }
    const relErr = Math.abs(r.dispMax * E - ref) / ref;
    assert(relErr <= 1e-6, `E=${E}: dispMax*E=${r.dispMax * E} 偏离参考 ${ref}（相对误差 ${relErr.toExponential(2)} > 1e-6）`);
    out.push(`E=${E}: dispMax=${r.dispMax.toExponential(4)} (×E 相对误差 ${relErr.toExponential(1)})`);
  }
  return `${out.join('；')}；参考 dispMax(E=2000)=${fmt(rRef.dispMax, 4)}`;
});

test('T8g extreme-force-float32-vm-overflow-warned', () => {
  // 回归（评审发现 1）：vm 系 Float32Array，单元应力 >~3.40e38 MPa 写入后变 Infinity，
  // 旧版 vmMax（f64 先行记录）保持有限、零 warning → ok/converged 全绿但 vm 全 Infinity。
  // 修复后：vmMax（f64 上界）+ Math.fround 一次检查 → 必须出「Float32」警告；未溢出唔可以误报。
  const m = boxMesh(8, 8, 16);
  const base = {
    vertices: m.vertices, triangles: m.triangles,
    fixed: { point: [0, 0, 0], normal: [0, 0, 1] },
    load: { point: [0, 0, 16], normal: [0, 0, 1] },
    E: 2000, nu: 0.3, resolution: 8,
  };
  const ref = runVoxelFea({ ...base, force: [0, 0, -100] });
  assert(ref.ok && ref.converged, `参考工况失败: ${ref.error}`);
  // F=1.3e40：所有单元应力仍喺 Float32 范围内 → 唔应该误报
  const rOk = runVoxelFea({ ...base, force: [0, 0, -1.3e40] });
  assert(rOk.ok && rOk.converged, `F=1.3e40 失败: ${rOk.error}`);
  for (let i = 0; i < rOk.vm.length; i++) {
    assert(Number.isFinite(rOk.vm[i]), `F=1.3e40: vm[${i}]=${rOk.vm[i]} 非有限（唔应该）`);
  }
  // 本测试只针对【vm（von Mises）Float32 溢出】守卫。S167 后另有【应变能密度 sed Float32】守卫 —— sed≈½σ:ε 量级 ∝ 应力²/E，
  // 喺 F=1.3e40（vm 仍喺 Float32 内）时 sed 已超 Float32（~2.57e73），故 sed 警告【正确】会出。所以只 assert 冇【vm 数组】警告，唔睇 sed。
  assert(!rOk.warnings.some((w) => w.includes('vm 数组')), `F=1.3e40 误报 vm Float32 警告: [${rOk.warnings.join('; ')}]`);
  // F=1e41：vm 元素 Float32 溢出为 Infinity → 必须示警，vmMax 保持 f64 准确
  const r = runVoxelFea({ ...base, force: [0, 0, -1e41] });
  assert(r.ok && r.converged, `F=1e41 失败: ${r.error}`);
  let nInf = 0;
  for (let i = 0; i < r.vm.length; i++) if (!Number.isFinite(r.vm[i])) nInf++;
  assert(nInf > 0, '前提唔成立：F=1e41 应令 vm 出现 Infinity（Float32 溢出）');
  assert(Number.isFinite(r.vmMax) && r.vmMax > 3.4028e38, `vmMax=${r.vmMax}，应为 f64 有限且 > Float32 上限`);
  assert(r.warnings.some((w) => w.includes('vm 数组')), `应有 vm Float32 溢出警告，实际 [${r.warnings.join('; ')}]`);
  const lin = ref.dispMax * 1e39;
  const relErr = Math.abs(r.dispMax - lin) / lin;
  assert(relErr <= 1e-9, `dispMax=${r.dispMax} 线性偏差 ${relErr.toExponential(2)} > 1e-9`);
  return `F=1e41: vmInf=${nInf}/${r.vm.length} vmMax=${r.vmMax.toExponential(3)} dispMax 线性偏差=${relErr.toExponential(1)}；F=1.3e40 无误报`;
});

test('T8h extreme-force-fnorm-overflow-rescued', () => {
  // 回归（评审发现 2）：Σf[i]² 喺单节点力 >~1.3e154 上溢 Infinity → fnorm=Inf →
  // rel=√rn2/Inf=0 ≤ tol → 早期假收敛（旧版 F=1e155：iters=9 residual=0，dispMax 错 9.56%）。
  // 修复 = CG 前用 2 的幂预缩放 f，解后缩放返。
  const m = boxMesh(8, 8, 16);
  const base = {
    vertices: m.vertices, triangles: m.triangles,
    fixed: { point: [0, 0, 0], normal: [0, 0, 1] },
    load: { point: [0, 0, 16], normal: [0, 0, 1] },
    E: 2000, nu: 0.3, resolution: 8,
  };
  const ref = runVoxelFea({ ...base, force: [0, 0, -100] });
  assert(ref.ok && ref.converged, `参考工况失败: ${ref.error}`);
  const r = runVoxelFea({ ...base, force: [0, 0, -1e155] });
  assert(r.ok, `ok=false: ${r.error}`);
  assert(r.converged, `CG 未收敛 (${r.iters} 次, 残差 ${r.residual})`);
  assert(Number.isFinite(r.residual) && r.residual > 0 && r.residual <= 1e-6,
    `residual=${r.residual}，应喺 (0, 1e-6]（旧 bug 特征：恰好 0）`);
  assert(r.iters >= ref.iters - 2, `iters=${r.iters} 明显少过参考 ${ref.iters}（疑似提早假收敛）`);
  assert(Number.isFinite(r.dispMax), `dispMax=${r.dispMax} 非有限`);
  const lin = ref.dispMax * 1e153;
  const relErr = Math.abs(r.dispMax - lin) / lin;
  assert(relErr <= 1e-9, `dispMax=${r.dispMax.toExponential(6)} 线性偏差 ${relErr.toExponential(2)} > 1e-9（旧 bug 为 9.6e-2）`);
  // 应力远超 Float32 → 必须有警告（配合 T8g 嘅守卫）
  assert(r.warnings.length > 0, '应力数值极端但零警告（静默回归）');
  return `F=1e155: iters=${r.iters}（参考 ${ref.iters}）residual=${r.residual.toExponential(2)} ` +
    `dispMax=${r.dispMax.toExponential(6)} 线性偏差=${relErr.toExponential(1)}`;
});

test('T8i nonfinite-u-honest-nan', () => {
  // 回归（评审发现 3）：u 全 NaN 时旧版 `d > dispMax` 对 NaN 恒 false → dispMax=0、vmMax=0
  // 「干净假零」，非有限守卫永远唔会触发。修复后：显式追踪非有限 → dispMax/vmMax 故意设
  // NaN + 出「位移非有限」「应力非有限」警告。
  // 触发：E=1e-300 + F=1e300 → 真实 |u| ~ 1e598 超出 f64 → 缩放返时上溢。
  const m = boxMesh(8, 8, 16);
  const r = runVoxelFea({
    vertices: m.vertices, triangles: m.triangles,
    fixed: { point: [0, 0, 0], normal: [0, 0, 1] },
    load: { point: [0, 0, 16], normal: [0, 0, 1] },
    force: [0, 0, -1e300], E: 1e-300, nu: 0.3, resolution: 8,
  });
  assert(r.ok, `ok=false: ${r.error}`);
  assert(Number.isNaN(r.dispMax), `dispMax=${r.dispMax}，应为 NaN（旧 bug：静默报 0）`);
  assert(Number.isNaN(r.vmMax), `vmMax=${r.vmMax}，应为 NaN（旧 bug：静默报 0）`);
  assert(r.warnings.some((w) => w.includes('位移非有限')), `应有「位移非有限」警告，实际 [${r.warnings.join('; ')}]`);
  assert(r.warnings.some((w) => w.includes('应力非有限')), `应有「应力非有限」警告，实际 [${r.warnings.join('; ')}]`);
  return `dispMax=NaN vmMax=NaN warnings=[${r.warnings.join('; ')}]`;
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
console.log(`${rows.length - nFail}/${rows.length} 通过${nFail ? `，${nFail} 个失败` : ''}（res-clamp 求解迭代 ${resClampIters} 次）`);
process.exit(nFail ? 1 : 0);
